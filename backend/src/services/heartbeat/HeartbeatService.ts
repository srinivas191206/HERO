import db from '../../config/db';
import { AuditService } from '../audit/AuditService';
import crypto from 'crypto';

interface HeartbeatPacket {
  userId: string;
  battery: number;
  status: string; // Current status reported by client
  networkQuality: string;
  location?: {
    lat: number;
    lng: number;
    heading?: number;
    speed?: number;
    accuracy?: number;
  };
}

export class HeartbeatService {
  static recordHeartbeat(packet: HeartbeatPacket): void {
    try {
      const now = Date.now();
      
      // Get current status to see if transitioning out of 'Lost Connection' or 'Offline'
      const user = db.prepare('SELECT status, name FROM users WHERE id = ?').get(packet.userId) as { status: string; name: string } | undefined;
      
      if (!user) return;

      // Update user heartbeat, battery, and status
      // If client status is 'Offline' but we just got a heartbeat, force it to 'Available' or what they send
      let nextStatus = packet.status;
      if (user.status === 'Lost Connection' || user.status === 'Offline') {
        nextStatus = 'Available';
        AuditService.log(packet.userId, `Reconnected: Heartbeat restored for ${user.name}`);
      }

      const update = db.prepare(`
        UPDATE users
        SET last_heartbeat = ?, battery = ?, status = ?
        WHERE id = ?
      `);
      update.run(now, packet.battery, nextStatus, packet.userId);

      // If location is provided, log it in GPS logs
      if (packet.location) {
        const { lat, lng, heading, speed, accuracy } = packet.location;
        const gpsId = crypto.randomUUID();
        const insertGps = db.prepare(`
          INSERT INTO gps_logs (id, officer_id, latitude, longitude, heading, speed, battery, accuracy, network_quality, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        insertGps.run(
          gpsId,
          packet.userId,
          lat,
          lng,
          heading ?? null,
          speed ?? null,
          packet.battery,
          accuracy ?? null,
          packet.networkQuality,
          now
        );
      }
    } catch (error) {
      console.error('Failed to record heartbeat:', error);
    }
  }

  static checkTimeouts(): Array<{ id: string; name: string; status: string }> {
    try {
      const now = Date.now();
      const timeoutThreshold = 30000; // 30 seconds

      // Find users whose status is active (not Offline and not already Lost Connection) but haven't beat in >30s
      const activeOfficers = db.prepare(`
        SELECT id, name, status, last_heartbeat as lastHeartbeat
        FROM users
        WHERE role = 'officer' 
          AND status NOT IN ('Offline', 'Lost Connection')
          AND (last_heartbeat IS NULL OR (? - last_heartbeat) > ?)
      `).all(now, timeoutThreshold) as Array<{ id: string; name: string; status: string; lastHeartbeat: number | null }>;

      const updatedOfficers: Array<{ id: string; name: string; status: string }> = [];

      const updateStatus = db.prepare(`
        UPDATE users
        SET status = 'Lost Connection'
        WHERE id = ?
      `);

      for (const officer of activeOfficers) {
        updateStatus.run(officer.id);
        AuditService.log(
          officer.id, 
          `Status changed to Lost Connection: No heartbeat received for ${Math.round((now - (officer.lastHeartbeat ?? 0)) / 1000)} seconds`
        );
        updatedOfficers.push({
          id: officer.id,
          name: officer.name,
          status: 'Lost Connection'
        });
      }

      return updatedOfficers;
    } catch (error) {
      console.error('Failed to sweep heartbeat timeouts:', error);
      return [];
    }
  }
}
