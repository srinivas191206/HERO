'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { SocketTransportProvider } from '../services/communication/SocketTransportProvider';
import { clientCommunicationEngine } from '../services/communication/CommunicationEngine';
import { clientEventBus } from '../services/events/EventBus';

const getBackendUrl = () => {
  if (typeof window !== 'undefined') {
    const savedIp = localStorage.getItem('tactical_server_ip');
    if (savedIp) {
      return `http://${savedIp}:5001`;
    }
    const hostname = window.location.hostname;
    return `http://${hostname}:5001`;
  }
  return 'http://localhost:5001';
};

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (badgeNumber: string, pin: string) => Promise<User>;
  logout: () => Promise<void>;
  simulateOfflineToggle: (forceOffline: boolean) => void;
  isForcedOffline: boolean;
  updateUserStatus: (status: string) => void;
  updateUserBattery: (battery: number) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isForcedOffline, setIsForcedOffline] = useState<boolean>(false);
  const [transportProvider, setTransportProvider] = useState<SocketTransportProvider | null>(null);

  // Load existing credentials on startup
  useEffect(() => {
    try {
      const savedToken = typeof window !== 'undefined' ? localStorage.getItem('tactical_token') : null;
      const savedUser = typeof window !== 'undefined' ? localStorage.getItem('tactical_user') : null;

      if (savedToken && savedUser) {
        try {
          const parsedUser = JSON.parse(savedUser) as User;
          setToken(savedToken);
          setUser(parsedUser);
          
          // Initialize Socket Transport
          const transport = new SocketTransportProvider();
          transport.connect(parsedUser.id, parsedUser.role, parsedUser.teamId);
          clientCommunicationEngine.setTransport(transport);
          setTransportProvider(transport);
        } catch (err) {
          console.error('Failed to parse cached session:', err);
          try {
            localStorage.removeItem('tactical_token');
            localStorage.removeItem('tactical_user');
          } catch (_) {}
        }
      }
    } catch (err) {
      console.warn('LocalStorage read blocked or unavailable in this browser context:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = async (badgeNumber: string, pin: string): Promise<User> => {
    setIsLoading(true);
    try {
      const response = await fetch(`${getBackendUrl()}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ badgeNumber, pin })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to authenticate.');
      }

      const { token: receivedToken, user: receivedUser } = data;

      try {
        localStorage.setItem('tactical_token', receivedToken);
        localStorage.setItem('tactical_user', JSON.stringify(receivedUser));
      } catch (e) {
        console.warn('LocalStorage write denied in this browser context:', e);
      }

      setToken(receivedToken);
      setUser(receivedUser);

      // Connect Sockets
      const transport = new SocketTransportProvider();
      transport.connect(receivedUser.id, receivedUser.role, receivedUser.teamId);
      clientCommunicationEngine.setTransport(transport);
      setTransportProvider(transport);

      return receivedUser;
    } catch (err) {
      console.error('Login action failed:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setIsLoading(true);
    try {
      if (token) {
        await fetch(`${getBackendUrl()}/api/auth/logout`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }).catch(err => console.log('Offline logout fallback active.'));
      }
    } finally {
      // Disconnect Sockets
      if (transportProvider) {
        transportProvider.disconnect();
        setTransportProvider(null);
      }

      try {
        localStorage.removeItem('tactical_token');
        localStorage.removeItem('tactical_user');
      } catch (e) {
        console.warn('LocalStorage clear blocked in this browser context:', e);
      }
      setToken(null);
      setUser(null);
      setIsLoading(false);
    }
  };

  // Allows manual simulation of radio/network blackout for demonstrating Offline modes
  const simulateOfflineToggle = (forceOffline: boolean) => {
    setIsForcedOffline(forceOffline);
    if (forceOffline) {
      if (transportProvider) {
        transportProvider.disconnect();
        console.log('[AuthContext] Simulating disaster drop: Sockets severed.');
      }
      clientEventBus.publish('network:offline');
    } else {
      if (user) {
        const transport = new SocketTransportProvider();
        transport.connect(user.id, user.role, user.teamId);
        clientCommunicationEngine.setTransport(transport);
        setTransportProvider(transport);
        console.log('[AuthContext] Ending simulated drop: Reconnecting sockets.');
      }
    }
  };

  const updateUserStatus = (status: string) => {
    setUser(prev => {
      if (!prev) return null;
      const updated = { ...prev, status } as User;
      try {
        localStorage.setItem('tactical_user', JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to update localStorage user status:', e);
      }
      return updated;
    });
  };

  const updateUserBattery = (battery: number) => {
    setUser(prev => {
      if (!prev) return null;
      const updated = { ...prev, battery } as User;
      try {
        localStorage.setItem('tactical_user', JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to update localStorage user battery:', e);
      }
      return updated;
    });
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      isAuthenticated: !!token && !!user,
      isLoading,
      login,
      logout,
      simulateOfflineToggle,
      isForcedOffline,
      updateUserStatus,
      updateUserBattery
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be wrapped in an AuthProvider');
  }
  return context;
};
