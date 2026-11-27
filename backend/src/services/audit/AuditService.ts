import db, { getActiveDistrictId } from '../../config/db';
import { AuditLog } from '../../types';
import crypto from 'crypto';

export class AuditService {
  static log(
    userId: string | null,
    action: string,
    ipAddress: string | null = null,
    districtId: string | null = null
  ): void {
    try {
      const id = crypto.randomUUID();
      const timestamp = Date.now();
      const resolvedDistrictId = districtId || getActiveDistrictId();
      const insert = db.prepare(`
        INSERT INTO audit_logs (id, user_id, district_id, action, ip_address, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      insert.run(id, userId, resolvedDistrictId, action, ipAddress, timestamp);

      // Queue audit log for cloud sync when internet returns
      db.prepare(`
        INSERT INTO cloud_sync_queue (id, entity_type, entity_id, district_id, payload, status, retry_count, created_at)
        VALUES (?, 'audit', ?, ?, ?, 'pending', 0, ?)
      `).run(
        crypto.randomUUID(),
        id,
        resolvedDistrictId,
        JSON.stringify({ id, userId, districtId: resolvedDistrictId, action, ipAddress, timestamp }),
        timestamp
      );

      console.log(`[AUDIT][${resolvedDistrictId}] User: ${userId || 'SYSTEM'}, Action: "${action}", IP: ${ipAddress || 'local'}`);
    } catch (error) {
      console.error('Failed to write audit log:', error);
    }
  }

  static getRecentLogs(limit: number = 50, districtId?: string): AuditLog[] {
    try {
      if (districtId) {
        return db.prepare(`
          SELECT id, user_id as userId, district_id as districtId, action, ip_address as ipAddress, timestamp
          FROM audit_logs
          WHERE district_id = ?
          ORDER BY timestamp DESC
          LIMIT ?
        `).all(districtId, limit) as AuditLog[];
      }
      return db.prepare(`
        SELECT id, user_id as userId, district_id as districtId, action, ip_address as ipAddress, timestamp
        FROM audit_logs
        ORDER BY timestamp DESC
        LIMIT ?
      `).all(limit) as AuditLog[];
    } catch (error) {
      console.error('Failed to query audit logs:', error);
      return [];
    }
  }
}
