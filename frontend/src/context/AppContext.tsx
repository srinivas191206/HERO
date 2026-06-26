'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { clientEventBus } from '../services/events/EventBus';
import { clientCommunicationEngine } from '../services/communication/CommunicationEngine';
import { localDb } from '../services/queue/OfflineDatabase';
import { clientPriorityEngine } from '../services/priority/PriorityEngine';
import { safeRandomUUID } from '../utils/uuid';

interface AlertItem {
  id: string;
  title: string;
  message: string;
  timestamp: number;
  type: 'emergency' | 'warning' | 'info';
}

interface AppContextType {
  isOnline: boolean;
  isDisasterMode: boolean;
  queueSize: number;
  activeAlerts: AlertItem[];
  clearAlerts: () => void;
  triggerLocalSOS: () => Promise<void>;
  currentLocation: { lat: number; lng: number; heading: number; isReal?: boolean } | null;
  setCurrentLocation: (loc: { lat: number; lng: number; heading: number; isReal?: boolean }) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isForcedOffline } = useAuth();
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isDisasterMode, setIsDisasterMode] = useState<boolean>(false);
  const [queueSize, setQueueSize] = useState<number>(0);
  const [activeAlerts, setActiveAlerts] = useState<AlertItem[]>([]);
  
  // Starting geographic coordinates, default null until geolocation resolves
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number; heading: number; isReal?: boolean } | null>(null);

  // Watch real GPS position using HTML5 Geolocation API, with requested coordinates fallback
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Force the requested coordinates for the Desktop App
    setCurrentLocation({
      lat: 17.8167,
      lng: 83.3426,
      heading: 0,
      isReal: true // Treat as real so the map honors it
    });

    if (!navigator.geolocation) return;

    if (user?.role === 'dispatcher') {
      console.log('[AppContext] Hardcoding HQ location to 17.8167, 83.3426');
      return; // Stop watching for HQ
    }

    let watchId: number;

    const startWatching = () => {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          console.log('[AppContext] Real GPS coords updated:', position.coords.latitude, position.coords.longitude);
          setCurrentLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            heading: position.coords.heading || 0,
            isReal: true
          });
        },
        (error) => {
          console.warn('[AppContext] Geolocation access failed or denied:', error.message);
          setCurrentLocation(prev => prev || {
            lat: 17.8167,
            lng: 83.3426,
            heading: 0,
            isReal: false
          });
        },
        {
          enableHighAccuracy: false,
          timeout: 5000,
          maximumAge: 30000
        }
      );
    };

    startWatching();

    return () => {
      if (watchId !== undefined) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [user?.role]);

  // Track IndexedDB queue size and trigger periodic synchronization scans
  useEffect(() => {
    const updateSize = async () => {
      try {
        const size = await localDb.outboundQueue.count();
        setQueueSize(size);
      } catch (err) {
        console.warn('[AppContext] Outbound queue count read blocked, falling back:', err);
        setQueueSize(0);
      }
    };

    updateSize();

    // Subscribe to Event Bus changes
    const unsubChange = clientEventBus.subscribe('queue:change', (data: { size: number }) => {
      setQueueSize(data.size);
    });

    const unsubSync = clientEventBus.subscribe('message:synced', () => updateSize());
    const unsubEvidence = clientEventBus.subscribe('evidence:synced', () => updateSize());

    // Setup periodic Dexie sync sweeps
    clientPriorityEngine.startPeriodicSync(15000);

    return () => {
      unsubChange();
      unsubSync();
      unsubEvidence();
      clientPriorityEngine.stopPeriodicSync();
    };
  }, []);

  // Monitor network status
  useEffect(() => {
    const handleOnline = () => {
      if (!isForcedOffline) {
        setIsOnline(true);
        setIsDisasterMode(false);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setIsDisasterMode(true);
    };

    // Set initial state based on window connectivity
    if (typeof window !== 'undefined') {
      setIsOnline(window.navigator.onLine && !isForcedOffline);
      setIsDisasterMode(!window.navigator.onLine || isForcedOffline);
    }

    const unsubOnline = clientEventBus.subscribe('network:online', handleOnline);
    const unsubOffline = clientEventBus.subscribe('network:offline', handleOffline);

    return () => {
      unsubOnline();
      unsubOffline();
    };
  }, [isForcedOffline]);

  // Heartbeat sender daemon (Sends telemetry every 10s if logged in)
  useEffect(() => {
    if (!user || user.role !== 'officer') return;

    // Send immediate heartbeat on startup
    const sendPing = () => {
      setCurrentLocation(prev => {
        if (!prev) return null;

        // If using real coordinates or fallback, transmit them as-is
        clientCommunicationEngine.sendLocation(
          user.id,
          user.battery,
          user.status,
          isOnline ? 'LTE/Wi-Fi' : 'Offline local mesh',
          {
            lat: prev.lat,
            lng: prev.lng,
            heading: prev.heading || 0,
            speed: 4, // 4 km/h walking speed
            accuracy: 5 // 5m GPS accuracy
          }
        );

        return prev;
      });
    };

    sendPing();

    const heartbeatTimer = setInterval(sendPing, 10000); // 10 seconds interval

    return () => clearInterval(heartbeatTimer);
  }, [user, isOnline]);

  // Handle incoming sockets alerts on the Event Bus
  useEffect(() => {
    const unsubSos = clientEventBus.subscribe('sos:received', (data: any) => {
      const alertId = safeRandomUUID();
      setActiveAlerts(prev => [
        {
          id: alertId,
          title: 'EMERGENCY SOS ACTIVE',
          message: data.incident.title,
          timestamp: Date.now(),
          type: 'emergency'
        },
        ...prev
      ]);
    });

    const unsubWarning = clientEventBus.subscribe('incident:warning_received', (data: any) => {
      const alertId = safeRandomUUID();
      setActiveAlerts(prev => [
        {
          id: alertId,
          title: data.title,
          message: data.message,
          timestamp: Date.now(),
          type: 'warning'
        },
        ...prev
      ]);
    });

    return () => {
      unsubSos();
      unsubWarning();
    };
  }, []);

  const triggerLocalSOS = async () => {
    if (!user) return;
    const lat = currentLocation?.lat || 16.7106;
    const lng = currentLocation?.lng || 81.0952;
    await clientCommunicationEngine.sendSOS(user.id, lat, lng);
  };

  const clearAlerts = () => {
    setActiveAlerts([]);
  };

  return (
    <AppContext.Provider value={{
      isOnline,
      isDisasterMode,
      queueSize,
      activeAlerts,
      clearAlerts,
      triggerLocalSOS,
      currentLocation,
      setCurrentLocation
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be wrapped in an AppProvider');
  }
  return context;
};
