import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import db from '../config/db';
import { HeartbeatService } from '../services/heartbeat/HeartbeatService';
import { IncidentService } from '../services/incident/IncidentService';
import { AuditService } from '../services/audit/AuditService';
import crypto from 'crypto';

interface ActiveSocketConnection {
  userId: string;
  role: 'officer' | 'dispatcher';
  teamId: string | null;
}

export class SocketManager {
  private io: Server;
  // Map of socket.id -> connection details
  private connections: Map<string, ActiveSocketConnection> = new Map();
  // Map of user.id -> socket.id (for 1-to-1 routing)
  private userSockets: Map<string, string> = new Map();

  constructor(server: HttpServer) {
    this.io = new Server(server, {
      cors: {
        origin: '*', // Allow all client connections in local network
        methods: ['GET', 'POST']
      }
    });

    this.initHandlers();
    this.startHeartbeatSweep();
  }

  public getIO(): Server {
    return this.io;
  }

  private initHandlers() {
    this.io.on('connection', (socket: Socket) => {
      console.log(`Socket client connected: ${socket.id}`);

      // Handle user registration
      socket.on('register', (data: { userId: string; role: 'officer' | 'dispatcher'; teamId: string | null }) => {
        const { userId, role, teamId } = data;
        
        this.connections.set(socket.id, { userId, role, teamId });
        this.userSockets.set(userId, socket.id);
        
        // Update database user status to Online/Available
        db.prepare("UPDATE users SET status = 'Available' WHERE id = ?").run(userId);
        
        // Join team room if any
        if (teamId) {
          socket.join(`team:${teamId}`);
        }
        
        // Join global room for broadcasts
        socket.join('global');

        // If dispatcher, join the dispatcher room
        if (role === 'dispatcher') {
          socket.join('dispatchers');
        }

        console.log(`Registered user ${userId} (${role}) on socket ${socket.id}`);
        AuditService.log(userId, `Socket connection established (Socket ID: ${socket.id})`);

        // Broadcast to all that officer is available
        this.io.emit('officer:status_change', {
          userId,
          status: 'Available',
          lastHeartbeat: Date.now()
        });
      });

      // Handle heartbeat packet (Every 10s)
      socket.on('heartbeat', (packet: {
        userId: string;
        battery: number;
        status: string;
        networkQuality: string;
        location?: {
          lat: number;
          lng: number;
          heading?: number;
          speed?: number;
          accuracy?: number;
        };
      }) => {
        HeartbeatService.recordHeartbeat(packet);
        
        // Broadcast telemetry to dispatchers
        this.io.to('dispatchers').emit('officer:telemetry', {
          userId: packet.userId,
          battery: packet.battery,
          status: packet.status,
          networkQuality: packet.networkQuality,
          location: packet.location || null,
          lastHeartbeat: Date.now()
        });
      });

      // Handle SOS trigger (Priority 1)
      socket.on('sos:trigger', (data: { userId: string; lat: number | null; lng: number | null }) => {
        const { userId, lat, lng } = data;
        try {
          const incident = IncidentService.triggerSOS(userId, lat, lng);
          
          // Broadcast critical SOS to everyone
          this.io.emit('sos:broadcast', {
            incident,
            officerId: userId,
            status: 'Emergency'
          });

          // Trigger general status change
          this.io.emit('officer:status_change', {
            userId,
            status: 'Emergency',
            lastHeartbeat: Date.now()
          });
        } catch (error) {
          console.error('Failed to trigger SOS socket handler:', error);
        }
      });

      // Handle Messages (Private / Team / Broadcast)
      socket.on('message:send', (msg: {
        id: string;
        senderId: string;
        recipientId: string | null;
        teamId: string | null;
        body: string;
        priority: number;
        isBroadcast: boolean;
      }) => {
        const timestamp = Date.now();
        try {
          // Write to SQLite database
          const insert = db.prepare(`
            INSERT INTO messages (id, sender_id, recipient_id, team_id, body, priority, timestamp, is_broadcast)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `);
          insert.run(
            msg.id,
            msg.senderId,
            msg.recipientId,
            msg.teamId,
            msg.body,
            msg.priority,
            timestamp,
            msg.isBroadcast ? 1 : 0
          );

          const payload = {
            ...msg,
            timestamp
          };

          // Route the message
          if (msg.isBroadcast) {
            socket.to('global').emit('message:receive', payload);
          } else if (msg.teamId) {
            socket.to(`team:${msg.teamId}`).emit('message:receive', payload);
          } else if (msg.recipientId) {
            const recipientSocketId = this.userSockets.get(msg.recipientId);
            if (recipientSocketId) {
              this.io.to(recipientSocketId).emit('message:receive', payload);
            }
          }
          
          // Dispatchers must monitor all operations traffic (broadcast, team, or private)
          this.io.to('dispatchers').emit('message:receive', payload);
          
          // Confirm delivery receipt back to sender
          socket.emit('message:ack', { id: msg.id, status: 'delivered', timestamp });
        } catch (error) {
          console.error('Failed to process message socket handler:', error);
          socket.emit('message:ack', { id: msg.id, status: 'failed', error: 'Database error' });
        }
      });

      // Handle Evidence Transmissions (Priority 7)
      socket.on('evidence:send', (ev: {
        id: string;
        officerId: string;
        incidentId: string | null;
        description: string;
        filePath: string;
        hash: string;
        locationLat: number | null;
        locationLng: number | null;
        timestamp: number;
      }) => {
        try {
          // Write to SQLite database
          const insert = db.prepare(`
            INSERT INTO evidence (id, officer_id, incident_id, description, file_path, hash, location_lat, location_lng, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          insert.run(
            ev.id,
            ev.officerId,
            ev.incidentId,
            ev.description,
            ev.filePath,
            ev.hash,
            ev.locationLat,
            ev.locationLng,
            ev.timestamp
          );

          // Broadcast the new evidence in real-time to dispatchers
          this.io.to('dispatchers').emit('evidence:receive', ev);

          // Confirm delivery receipt back to sender
          socket.emit('evidence:ack', { id: ev.id, status: 'delivered' });
          
          AuditService.log(ev.officerId, `Uploaded evidence via socket: ${ev.description} (ID: ${ev.id})`);
        } catch (error) {
          console.error('Failed to process evidence socket handler:', error);
          socket.emit('evidence:ack', { id: ev.id, status: 'failed', error: 'Database error' });
        }
      });

      // Handle Push To Talk voice streaming (Priority 3)
      socket.on('voice:chunk', (data: {
        senderId: string;
        audioData: string; // base64 string
      }) => {
        // Broadcast high-priority voice packets globally
        this.io.to('global').emit('voice:stream', {
          senderId: data.senderId,
          audioData: data.audioData
        });
      });

      // Handle Peer-to-Peer calls routing (WebRTC signaling)
      socket.on('call:request', (data: { callerId: string; calleeId: string; room: string }) => {
        const targetSocketId = this.userSockets.get(data.calleeId);
        if (targetSocketId) {
          this.io.to(targetSocketId).emit('call:incoming', {
            callerId: data.callerId,
            room: data.room
          });
        }
      });

      socket.on('call:accept', (data: { callerId: string; calleeId: string; room: string }) => {
        const targetSocketId = this.userSockets.get(data.callerId);
        if (targetSocketId) {
          this.io.to(targetSocketId).emit('call:accepted', { calleeId: data.calleeId });
        }
      });

      socket.on('call:reject', (data: { callerId: string; calleeId: string }) => {
        const targetSocketId = this.userSockets.get(data.callerId);
        if (targetSocketId) {
          this.io.to(targetSocketId).emit('call:rejected', { calleeId: data.calleeId });
        }
      });

      socket.on('call:hangup', (data: { callerId: string; calleeId: string }) => {
        const targetSocketId = this.userSockets.get(data.calleeId);
        if (targetSocketId) {
          this.io.to(targetSocketId).emit('call:ended');
        }
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        const conn = this.connections.get(socket.id);
        if (conn) {
          console.log(`User ${conn.userId} disconnected socket ${socket.id}`);
          
          // Mark user as Offline in database
          db.prepare("UPDATE users SET status = 'Offline' WHERE id = ?").run(conn.userId);
          
          this.connections.delete(socket.id);
          this.userSockets.delete(conn.userId);

          // Broadcast status change
          this.io.emit('officer:status_change', {
            userId: conn.userId,
            status: 'Offline',
            lastHeartbeat: Date.now()
          });

          AuditService.log(conn.userId, `Socket connection terminated (Socket ID: ${socket.id})`);
        }
      });
    });
  }

  // Periodic heartbeat monitor checking for drops (every 10s)
  private startHeartbeatSweep() {
    setInterval(() => {
      const lostOfficers = HeartbeatService.checkTimeouts();
      for (const officer of lostOfficers) {
        console.log(`[TIMEOUT] Officer ${officer.name} (ID: ${officer.id}) flagged as Lost Connection`);
        
        // Broadcast lost connection state update
        this.io.emit('officer:status_change', {
          userId: officer.id,
          status: 'Lost Connection',
          lastHeartbeat: Date.now()
        });

        // Specific warning trigger for dispatcher console
        this.io.to('dispatchers').emit('incident:warning', {
          title: `Officer Connection Lost`,
          message: `Heartbeat timeout: Lost contact with ${officer.name}.`,
          officerId: officer.id,
          timestamp: Date.now()
        });
      }
    }, 10000);
  }
}
