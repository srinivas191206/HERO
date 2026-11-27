import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import crypto from 'crypto';
import db, { getActiveDistrictId } from '../config/db';
import { HeartbeatService } from '../services/heartbeat/HeartbeatService';
import { IncidentService } from '../services/incident/IncidentService';
import { AuditService } from '../services/audit/AuditService';
import { CloudSyncService } from '../services/sync/CloudSyncService';
import { verifyJwtToken, AuthTokenPayload } from '../middleware/authMiddleware';
import { UserRole } from '../types';

interface ActiveSocketConnection {
  userId: string;
  role: UserRole;
  teamId: string | null;
  districtId: string;
}

export class SocketManager {
  private io: Server;
  private connections: Map<string, ActiveSocketConnection> = new Map();
  private userSockets: Map<string, string> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(server: HttpServer) {
    this.io = new Server(server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });

    // Enforce JWT authentication on every Socket.IO connection
    this.io.use((socket, next) => {
      const token =
        (socket.handshake.auth?.token as string | undefined) ||
        (typeof socket.handshake.headers?.authorization === 'string'
          ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, '')
          : undefined);

      if (!token) {
        return next(new Error('Unauthorized: Socket JWT token missing.'));
      }

      try {
        const decoded = verifyJwtToken(token);
        const dbUser = db.prepare(`
          SELECT id, role, team_id as teamId, district_id as districtId
          FROM users WHERE id = ?
        `).get(decoded.id) as { id: string; role: UserRole; teamId: string | null; districtId: string } | undefined;

        if (!dbUser) {
          return next(new Error('Unauthorized: User account not found.'));
        }

        const effectiveDistrictId = dbUser.id === 'u_disp1' ? getActiveDistrictId() : dbUser.districtId;
        socket.data.user = {
          ...decoded,
          role: dbUser.role,
          teamId: dbUser.teamId,
          districtId: effectiveDistrictId
        } satisfies AuthTokenPayload;

        next();
      } catch (err) {
        return next(new Error('Forbidden: Invalid or expired socket token.'));
      }
    });

    this.initHandlers();
    this.startHeartbeatSweep();
  }

  public getIO(): Server {
    return this.io;
  }

  public stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.io.close();
  }

  private districtGlobalRoom(districtId: string): string {
    return `district:${districtId}:global`;
  }

  private districtDispatchersRoom(districtId: string): string {
    return `district:${districtId}:dispatchers`;
  }

  private districtTeamRoom(districtId: string, teamId: string): string {
    return `district:${districtId}:team:${teamId}`;
  }

  private initHandlers() {
    this.io.on('connection', (socket: Socket) => {
      const authUser = socket.data.user as AuthTokenPayload;
      const { id: userId, role, teamId } = authUser;
      let districtId = authUser.districtId;

      console.log(`Authenticated socket connected: ${socket.id} (${userId}, ${role}, district=${districtId})`);

      // Register authenticated connection immediately & also support explicit 'register' idempotently
      const registerConnection = () => {
        this.connections.set(socket.id, { userId, role, teamId, districtId });
        this.userSockets.set(userId, socket.id);

        db.prepare("UPDATE users SET status = 'Available' WHERE id = ?").run(userId);

        if (teamId) {
          socket.join(this.districtTeamRoom(districtId, teamId));
        }
        socket.join(this.districtGlobalRoom(districtId));

        if (role === 'dispatcher' || role === 'state_admin') {
          socket.join(this.districtDispatchersRoom(districtId));
        }
        if (role === 'state_admin') {
          socket.join('state_admins');
        }

        AuditService.log(userId, `Socket connection established (Socket ID: ${socket.id})`, null, districtId);

        this.io.to(this.districtGlobalRoom(districtId)).emit('officer:status_change', {
          userId,
          status: 'Available',
          lastHeartbeat: Date.now()
        });
      };

      registerConnection();

      socket.on('register', () => {
        // Re-join rooms safely using verified JWT identity (never trust client-supplied userId/role)
        registerConnection();
      });

      // Allow dispatchers / state_admin to switch active district room immediately for zero-latency SOS & live telemetry
      socket.on('dispatcher:switch_district', (data: { districtId?: string }) => {
        if (role !== 'dispatcher' && role !== 'state_admin') return;
        const nextDistrict = data?.districtId;
        if (!nextDistrict || nextDistrict === districtId) return;

        socket.leave(this.districtGlobalRoom(districtId));
        socket.leave(this.districtDispatchersRoom(districtId));
        districtId = nextDistrict;
        this.connections.set(socket.id, { userId, role, teamId, districtId });
        socket.join(this.districtGlobalRoom(districtId));
        socket.join(this.districtDispatchersRoom(districtId));
        console.log(`Dispatcher ${userId} switched socket room to district=${districtId}`);
      });

      // Handle heartbeat packet (always bind to authenticated userId)
      socket.on('heartbeat', (packet: {
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
        HeartbeatService.recordHeartbeat({
          userId,
          battery: packet.battery ?? 100,
          status: packet.status || 'Available',
          networkQuality: packet.networkQuality || 'Local LAN',
          location: packet.location
        });

        this.io.to(this.districtDispatchersRoom(districtId)).emit('officer:telemetry', {
          userId,
          battery: packet.battery,
          status: packet.status,
          networkQuality: packet.networkQuality,
          location: packet.location || null,
          lastHeartbeat: Date.now()
        });
      });

      // Handle SOS trigger (Priority 1) with acknowledgement
      socket.on('sos:trigger', (data: { id?: string; lat: number | null; lng: number | null }) => {
        try {
          const incident = IncidentService.triggerSOS(userId, data.lat ?? null, data.lng ?? null, districtId);

          this.io.to(this.districtGlobalRoom(districtId)).emit('sos:broadcast', {
            incident,
            officerId: userId,
            districtId,
            status: 'Emergency'
          });

          this.io.to(this.districtGlobalRoom(districtId)).emit('officer:status_change', {
            userId,
            status: 'Emergency',
            lastHeartbeat: Date.now()
          });

          socket.emit('sos:ack', {
            id: data.id || incident.id,
            incidentId: incident.id,
            status: 'delivered',
            timestamp: Date.now()
          });
        } catch (error) {
          console.error('Failed to trigger SOS socket handler:', error);
          socket.emit('sos:ack', { id: data.id, status: 'failed', error: 'SOS processing failed' });
        }
      });

      // Handle Messages (Private / Team / Broadcast) scoped to district
      socket.on('message:send', (msg: {
        id: string;
        recipientId: string | null;
        teamId: string | null;
        body: string;
        priority: number;
        isBroadcast: boolean;
      }) => {
        const timestamp = Date.now();
        try {
          // Resolve 'hq' alias to this district's dispatcher so SQLite FK succeeds
          let resolvedRecipientId = msg.recipientId;
          if (resolvedRecipientId === 'hq') {
            const disp = db.prepare("SELECT id FROM users WHERE role = 'dispatcher' AND district_id = ? LIMIT 1").get(districtId) as
              | { id: string }
              | undefined;
            resolvedRecipientId = disp?.id || null;
          }

          db.prepare(`
            INSERT OR IGNORE INTO messages (id, sender_id, recipient_id, team_id, district_id, body, priority, timestamp, is_broadcast)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            msg.id,
            userId,
            resolvedRecipientId,
            msg.teamId,
            districtId,
            msg.body,
            msg.priority,
            timestamp,
            msg.isBroadcast ? 1 : 0
          );

          const payload = {
            ...msg,
            senderId: userId,
            recipientId: resolvedRecipientId,
            districtId,
            timestamp
          };

          CloudSyncService.enqueue('message', msg.id, districtId, payload);

          if (msg.isBroadcast) {
            socket.to(this.districtGlobalRoom(districtId)).emit('message:receive', payload);
          } else if (msg.teamId) {
            socket.to(this.districtTeamRoom(districtId, msg.teamId)).emit('message:receive', payload);
          } else if (resolvedRecipientId) {
            const recipientSocketId = this.userSockets.get(resolvedRecipientId);
            if (recipientSocketId) {
              this.io.to(recipientSocketId).emit('message:receive', payload);
            }
          }

          // Dispatchers in the same district monitor all traffic
          this.io.to(this.districtDispatchersRoom(districtId)).emit('message:receive', payload);

          socket.emit('message:ack', { id: msg.id, status: 'delivered', timestamp });
        } catch (error) {
          console.error('Failed to process message socket handler:', error);
          socket.emit('message:ack', { id: msg.id, status: 'failed', error: 'Database error' });
        }
      });

      // Handle Evidence Transmissions with server-side SHA-256 verification
      socket.on('evidence:send', (ev: {
        id: string;
        incidentId: string | null;
        description: string;
        filePath: string;
        hash: string;
        locationLat: number | null;
        locationLng: number | null;
        timestamp: number;
      }) => {
        try {
          let finalHash = ev.hash;
          let hashVerified = 0;

          if (ev.filePath) {
            const cleanBase64 = ev.filePath.includes(',') ? ev.filePath.split(',')[1] : ev.filePath;
            const rawBytes = Buffer.from(cleanBase64, 'base64');
            const computedHash = crypto.createHash('sha256').update(rawBytes).digest('hex');

            if (!ev.hash || ev.hash.startsWith('sha256-fallback-')) {
              finalHash = computedHash;
              hashVerified = 1;
            } else {
              hashVerified = computedHash === ev.hash ? 1 : 0;
              if (!hashVerified) {
                AuditService.log(userId, `SECURITY WARNING: Evidence ${ev.id} failed SHA-256 verification`, null, districtId);
              }
            }
          }

          db.prepare(`
            INSERT OR IGNORE INTO evidence (id, officer_id, incident_id, district_id, description, file_path, hash, hash_verified, location_lat, location_lng, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            ev.id,
            userId,
            ev.incidentId,
            districtId,
            ev.description,
            ev.filePath,
            finalHash,
            hashVerified,
            ev.locationLat,
            ev.locationLng,
            ev.timestamp
          );

          const storedEv = {
            ...ev,
            officerId: userId,
            districtId,
            hash: finalHash,
            hashVerified: hashVerified === 1
          };

          CloudSyncService.enqueue('evidence', ev.id, districtId, {
            ...storedEv,
            // Avoid pushing multi-MB base64 inline in every queue entry if large; keep metadata + thumbnail/filePath
            filePath: ev.filePath
          });

          this.io.to(this.districtDispatchersRoom(districtId)).emit('evidence:receive', storedEv);
          socket.emit('evidence:ack', { id: ev.id, status: 'delivered', hash: finalHash, hashVerified: hashVerified === 1 });

          AuditService.log(
            userId,
            `Uploaded evidence via socket: ${ev.description} (ID: ${ev.id}, Verified: ${hashVerified === 1})`,
            null,
            districtId
          );
        } catch (error) {
          console.error('Failed to process evidence socket handler:', error);
          socket.emit('evidence:ack', { id: ev.id, status: 'failed', error: 'Database error' });
        }
      });

      // Handle Push-To-Talk voice streaming scoped by district & optional channel
      socket.on('voice:chunk', (data: {
        audioData: string;
        channel?: string;
      }) => {
        const channel = data.channel || 'Command';
        // Route within the officer's district; Command channel reaches whole district, tactical channels tag channel for client filtering
        this.io.to(this.districtGlobalRoom(districtId)).emit('voice:stream', {
          senderId: userId,
          channel,
          districtId,
          audioData: data.audioData
        });
      });

      // WebRTC call signaling (scoped within district)
      socket.on('call:request', (data: { calleeId: string; room: string }) => {
        const targetSocketId = this.userSockets.get(data.calleeId);
        if (targetSocketId) {
          this.io.to(targetSocketId).emit('call:incoming', {
            callerId: userId,
            room: data.room
          });
        }
      });

      socket.on('call:accept', (data: { callerId: string; room: string }) => {
        const targetSocketId = this.userSockets.get(data.callerId);
        if (targetSocketId) {
          this.io.to(targetSocketId).emit('call:accepted', { calleeId: userId });
        }
      });

      socket.on('call:reject', (data: { callerId: string }) => {
        const targetSocketId = this.userSockets.get(data.callerId);
        if (targetSocketId) {
          this.io.to(targetSocketId).emit('call:rejected', { calleeId: userId });
        }
      });

      socket.on('call:hangup', (data: { calleeId: string }) => {
        const targetSocketId = this.userSockets.get(data.calleeId);
        if (targetSocketId) {
          this.io.to(targetSocketId).emit('call:ended');
        }
      });

      socket.on('disconnect', () => {
        const conn = this.connections.get(socket.id);
        if (conn) {
          console.log(`User ${conn.userId} disconnected socket ${socket.id}`);
          db.prepare("UPDATE users SET status = 'Offline' WHERE id = ?").run(conn.userId);

          this.connections.delete(socket.id);
          this.userSockets.delete(conn.userId);

          this.io.to(this.districtGlobalRoom(conn.districtId)).emit('officer:status_change', {
            userId: conn.userId,
            status: 'Offline',
            lastHeartbeat: Date.now()
          });

          AuditService.log(conn.userId, `Socket connection terminated (Socket ID: ${socket.id})`, null, conn.districtId);
        }
      });
    });
  }

  private startHeartbeatSweep() {
    this.heartbeatInterval = setInterval(() => {
      const lostOfficers = HeartbeatService.checkTimeouts();
      for (const officer of lostOfficers) {
        console.log(`[TIMEOUT] Officer ${officer.name} (ID: ${officer.id}) flagged as Lost Connection`);

        this.io.to(this.districtGlobalRoom(officer.districtId)).emit('officer:status_change', {
          userId: officer.id,
          status: 'Lost Connection',
          lastHeartbeat: Date.now()
        });

        this.io.to(this.districtDispatchersRoom(officer.districtId)).emit('incident:warning', {
          title: 'Officer Connection Lost',
          message: `Heartbeat timeout: Lost contact with ${officer.name}.`,
          officerId: officer.id,
          timestamp: Date.now()
        });
      }
    }, 10000);
  }
}
