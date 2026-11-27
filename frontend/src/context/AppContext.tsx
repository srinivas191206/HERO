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
  const latestLocationRef = React.useRef<{ lat: number; lng: number; heading: number; isReal?: boolean } | null>(null);
  const lastLivePushRef = React.useRef<number>(0);

  // Watch real GPS position using HTML5 Geolocation API and push live updates
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) return;

    let watchId: number;

    const updateRealCoords = (position: GeolocationPosition) => {
      const nextLoc = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        heading: position.coords.heading || 0,
        isReal: true
      };
      latestLocationRef.current = nextLoc;
      setCurrentLocation(nextLoc);

      // Push live GPS update immediately (throttled to max 1 update / 2s)
      const now = Date.now();
      if (user && user.role === 'officer' && now - lastLivePushRef.current >= 2000) {
        lastLivePushRef.current = now;
        clientCommunicationEngine.sendLocation(
          user.id,
          user.battery,
          user.status,
          isOnline ? 'LTE/Wi-Fi' : 'Offline local mesh',
          {
            lat: nextLoc.lat,
            lng: nextLoc.lng,
            heading: nextLoc.heading,
            speed: position.coords.speed ?? 0,
            accuracy: position.coords.accuracy ?? 10
          }
        );
      }
    };

    // Immediate one-time request for fast initial fix
    navigator.geolocation.getCurrentPosition(
      updateRealCoords,
      (err) => {
        console.warn('[AppContext] Initial GPS fix failed, using district fallback:', err.message);
        const fallback = latestLocationRef.current || {
          lat: 17.6868,
          lng: 83.2185,
          heading: 0,
          isReal: false
        };
        latestLocationRef.current = fallback;
        setCurrentLocation(prev => prev || fallback);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 }
    );

    // Continuous watch for real-time location updates
    watchId = navigator.geolocation.watchPosition(
      updateRealCoords,
      (err) => {
        console.warn('[AppContext] Geolocation watch warning:', err.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 1000
      }
    );

    return () => {
      if (watchId !== undefined) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [user?.id, user?.role]);

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

  // Live Heartbeat & GPS sender daemon (Every 3s so Command map tracks live movement smoothly)
  useEffect(() => {
    if (!user || user.role !== 'officer') return;

    const sendPing = () => {
      const loc = latestLocationRef.current;
      if (!loc) return;

      lastLivePushRef.current = Date.now();
      clientCommunicationEngine.sendLocation(
        user.id,
        user.battery,
        user.status,
        isOnline ? 'LTE/Wi-Fi' : 'Offline local mesh',
        {
          lat: loc.lat,
          lng: loc.lng,
          heading: loc.heading || 0,
          speed: 0,
          accuracy: loc.isReal ? 10 : 50
        }
      );
    };

    sendPing();
    const heartbeatTimer = setInterval(sendPing, 3000);

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
