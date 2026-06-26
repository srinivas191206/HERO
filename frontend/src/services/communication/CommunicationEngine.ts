import { localDb } from '../queue/OfflineDatabase';
import { clientPriorityEngine, ITransport } from '../priority/PriorityEngine';
import { clientEventBus } from '../events/EventBus';
import { Message, Incident, User, Evidence } from '../../types';

import { safeRandomUUID } from '../../utils/uuid';

export class CommunicationEngine {
  private transport: ITransport | null = null;

  setTransport(transport: ITransport) {
    this.transport = transport;
    clientPriorityEngine.setTransport(transport);
  }

  getTransport(): ITransport | null {
    return this.transport;
  }

  isOnline(): boolean {
    return this.transport ? this.transport.isConnected() : false;
  }

  // P4 / P5: Send Message (Private / Team)
  async sendMessage(msgInput: {
    senderId: string;
    recipientId: string | null;
    teamId: string | null;
    body: string;
    isBroadcast: boolean;
  }): Promise<Message> {
    const id = safeRandomUUID();
    const timestamp = Date.now();
    const priority = msgInput.isBroadcast ? 5 : (msgInput.teamId ? 5 : 4); // P5 for team/broadcast, P4 for private

    const message: Message = {
      id,
      senderId: msgInput.senderId,
      recipientId: msgInput.recipientId,
      teamId: msgInput.teamId,
      body: msgInput.body,
      priority,
      timestamp,
      isBroadcast: msgInput.isBroadcast,
      syncStatus: 'queued'
    };

    // 1. Immediately cache in IndexedDB for local UI rendering
    await localDb.cachedMessages.put(message);

    // 2. Feed to Priority Engine
    await clientPriorityEngine.enqueue(
      'message',
      priority,
      message
    );

    // Publish internal message sent event
    clientEventBus.publish('message:local_created', message);

    return message;
  }

  // P1: Send SOS Beacon (Immediate Preemption)
  async sendSOS(userId: string, lat: number | null, lng: number | null): Promise<void> {
    const payload = {
      userId,
      lat,
      lng,
      timestamp: Date.now()
    };

    // Publish local trigger (trigger sound warning locally)
    clientEventBus.publish('sos:local_triggered', payload);

    // Enqueue at P1
    await clientPriorityEngine.enqueue(
      'sos',
      1, // Priority 1 (highest)
      payload
    );
  }

  // P6: Send Location telemetry (GPS)
  async sendLocation(
    userId: string,
    battery: number,
    status: string,
    networkQuality: string,
    location?: {
      lat: number;
      lng: number;
      heading?: number;
      speed?: number;
      accuracy?: number;
    }
  ): Promise<void> {
    const packet = {
      userId,
      battery,
      status,
      networkQuality,
      location,
      timestamp: Date.now()
    };

    // Update local officer cache profile
    const cachedUser = await localDb.cachedOfficers.get(userId);
    if (cachedUser) {
      await localDb.cachedOfficers.update(userId, {
        battery,
        status: status as any,
        lastHeartbeat: packet.timestamp,
        location: location ? {
          latitude: location.lat,
          longitude: location.lng,
          heading: location.heading,
          speed: location.speed,
          accuracy: location.accuracy,
          networkQuality,
          timestamp: packet.timestamp
        } : null
      });
    }

    // Queue location update at P6
    await clientPriorityEngine.enqueue(
      'gps',
      6,
      packet,
      'dedup_gps_latest' // Deduplicate GPS to prevent backlog bloating
    );
  }

  // P3: Send Voice Chunk for Walkie-Talkie (Push-To-Talk)
  async sendVoiceChunk(
    senderId: string,
    audioData: string // base64 string representation
  ): Promise<void> {
    const payload = { senderId, audioData };
    
    // Voice chunks are treated as Priority 3. If online, send directly for real-time delivery
    if (this.transport && this.transport.isConnected()) {
      try {
        await this.transport.send(3, 'voice:chunk', payload);
      } catch (err) {
        console.error('[CommunicationEngine] Direct voice streaming failed:', err);
      }
    } else {
      console.log('[CommunicationEngine] Walkie-talkie muted: Client offline.');
    }
  }

  // Call management signals
  async initiateCall(callerId: string, calleeId: string, room: string): Promise<void> {
    if (this.transport && this.transport.isConnected()) {
      await this.transport.send(2, 'call:request', { callerId, calleeId, room });
    } else {
      throw new Error('Call failed: Host node unreachable.');
    }
  }

  async acceptCall(callerId: string, calleeId: string, room: string): Promise<void> {
    if (this.transport && this.transport.isConnected()) {
      await this.transport.send(2, 'call:accept', { callerId, calleeId, room });
    }
  }

  async rejectCall(callerId: string, calleeId: string): Promise<void> {
    if (this.transport && this.transport.isConnected()) {
      await this.transport.send(2, 'call:reject', { callerId, calleeId });
    }
  }

  async hangupCall(callerId: string, calleeId: string): Promise<void> {
    if (this.transport && this.transport.isConnected()) {
      await this.transport.send(2, 'call:hangup', { callerId, calleeId });
    }
  }
}

export const clientCommunicationEngine = new CommunicationEngine();
