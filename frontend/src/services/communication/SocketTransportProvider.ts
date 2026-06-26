import { io, Socket } from 'socket.io-client';
import { ITransport } from '../priority/PriorityEngine';
import { clientEventBus } from '../events/EventBus';
import { localDb } from '../queue/OfflineDatabase';

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

export class SocketTransportProvider implements ITransport {
  private socket: Socket | null = null;
  private connected = false;
  private serverUrl: string;

  constructor(serverUrl?: string) {
    this.serverUrl = serverUrl || getBackendUrl();
  }

  connect(userId: string, role: 'officer' | 'dispatcher', teamId: string | null) {
    if (this.socket) {
      this.socket.disconnect();
    }

    console.log(`[SocketTransport] Connecting to command node at: ${this.serverUrl}`);
    this.socket = io(this.serverUrl, {
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      timeout: 5000
    });

    this.socket.on('connect', () => {
      console.log('[SocketTransport] WebSocket link established.');
      this.connected = true;
      
      // Register credentials with Socket server
      this.socket?.emit('register', { userId, role, teamId });
      
      clientEventBus.publish('network:online');
    });

    this.socket.on('disconnect', () => {
      console.log('[SocketTransport] WebSocket link severed.');
      this.connected = false;
      clientEventBus.publish('network:offline');
    });

    this.socket.on('connect_error', () => {
      if (this.connected) {
        this.connected = false;
        clientEventBus.publish('network:offline');
      }
    });

    // Register operational listeners
    this.initSocketListeners();
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  // Implementation of ITransport.isConnected
  isConnected(): boolean {
    return this.connected;
  }

  // Implementation of ITransport.send
  send(priority: number, type: string, payload: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.connected) {
        return reject(new Error('Transport disconnected. Item buffered.'));
      }

      // Map communication engine types to Socket.IO events
      let socketEvent = '';
      if (type === 'message') socketEvent = 'message:send';
      else if (type === 'sos') socketEvent = 'sos:trigger';
      else if (type === 'gps') socketEvent = 'heartbeat';
      else if (type === 'evidence') socketEvent = 'evidence:send';
      else socketEvent = type; // Custom socket event mapping

      // Setup one-time delivery confirmation if the event supports it
      if (type === 'message' || type === 'evidence') {
        const ackEvent = `${type}:ack`;
        const ackHandler = (ack: { id: string; status: string; error?: string }) => {
          if (ack.id === payload.id) {
            this.socket?.off(ackEvent, ackHandler);
            if (ack.status === 'delivered') {
              resolve({ success: true });
            } else {
              reject(new Error(ack.error || `Server rejected ${type}.`));
            }
          }
        };
        this.socket.on(ackEvent, ackHandler);
        
        // Timeout ack after 10 seconds to trigger queue fallback
        setTimeout(() => {
          this.socket?.off(ackEvent, ackHandler);
          reject(new Error(`ACK Timeout: Server response lagged for ${type}.`));
        }, 10000);
      }

      this.socket.emit(socketEvent, payload);

      // Resolve immediately for non-ack events like GPS or PTT chunks
      if (type !== 'message' && type !== 'evidence') {
        resolve({ success: true });
      }
    });
  }

  private initSocketListeners() {
    if (!this.socket) return;

    // Listen for incoming messages
    this.socket.on('message:receive', async (msg: any) => {
      console.log(`[SocketTransport] Received message from ${msg.senderId}`);
      // Cache locally
      await localDb.cachedMessages.put({
        ...msg,
        syncStatus: 'delivered'
      });
      clientEventBus.publish('message:received', msg);
    });

    // Listen for critical SOS broadcasts (P1 alerts)
    this.socket.on('sos:broadcast', async (data: any) => {
      console.log('[SocketTransport] CRITICAL SOS BEACON BROADCAST RECEIVED', data);
      
      // Update local incident cache
      await localDb.cachedIncidents.put(data.incident);
      
      // Update local officer status to Emergency
      await localDb.cachedOfficers.update(data.officerId, { status: 'Emergency' });
      
      clientEventBus.publish('sos:received', data);
    });

    // Listen for incoming evidence broadcasts
    this.socket.on('evidence:receive', async (ev: any) => {
      console.log(`[SocketTransport] Received evidence from ${ev.officerId}`);
      await localDb.cachedEvidence.put({
        ...ev,
        syncStatus: 'delivered'
      });
      clientEventBus.publish('evidence:received', ev);
    });

    // Listen for telemetry updates (Dispatcher visual tracking)
    this.socket.on('officer:telemetry', async (data: any) => {
      const officer = await localDb.cachedOfficers.get(data.userId);
      if (officer) {
        await localDb.cachedOfficers.update(data.userId, {
          battery: data.battery,
          status: data.status,
          lastHeartbeat: data.lastHeartbeat,
          location: data.location ? {
            latitude: data.location.lat,
            longitude: data.location.lng,
            heading: data.location.heading,
            speed: data.location.speed,
            accuracy: data.location.accuracy,
            timestamp: data.lastHeartbeat
          } : null
        });
        clientEventBus.publish('officer:updated', data.userId);
        clientEventBus.publish('officer:telemetry', data);
      }
    });

    // Listen for status changes (Online, Offline, Lost Connection)
    this.socket.on('officer:status_change', async (data: { userId: string; status: any; lastHeartbeat: number }) => {
      const officer = await localDb.cachedOfficers.get(data.userId);
      if (officer) {
        await localDb.cachedOfficers.update(data.userId, {
          status: data.status,
          lastHeartbeat: data.lastHeartbeat
        });
      }
      clientEventBus.publish('officer:status_changed', data);
      clientEventBus.publish('officer:status_change', data);
    });

    // Listen for walkie-talkie audio streaming chunks
    this.socket.on('voice:stream', (data: any) => {
      clientEventBus.publish('voice:stream_received', data);
    });

    // WebRTC call negotiations
    this.socket.on('call:incoming', (data: any) => {
      clientEventBus.publish('call:incoming_received', data);
    });

    this.socket.on('call:accepted', (data: any) => {
      clientEventBus.publish('call:accepted_received', data);
    });

    this.socket.on('call:rejected', (data: any) => {
      clientEventBus.publish('call:rejected_received', data);
    });

    this.socket.on('call:ended', () => {
      clientEventBus.publish('call:ended_received');
    });

    // General alarm notifications for dispatchers
    this.socket.on('incident:warning', (data: any) => {
      clientEventBus.publish('incident:warning_received', data);
    });
  }
}
