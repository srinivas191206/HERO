import db from '../../config/db';
import { AuditLog } from '../../types';
import crypto from 'crypto';

export class AuditService {
  static log(userId: string | null, action: string, ipAddress: string | null = null): void {
    try {
      const id = crypto.randomUUID();
      const timestamp = Date.now();
      const insert = db.prepare(`
        INSERT INTO audit_logs (id, user_id, action, ip_address, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `);
      insert.run(id, userId, action, ipAddress, timestamp);
      console.log(`[AUDIT] User: ${userId || 'SYSTEM'}, Action: "${action}", IP: ${ipAddress || 'local'}`);
    } catch (error) {
      console.error('Failed to write audit log:', error);
    }
  }

  static getRecentLogs(limit: number = 50): AuditLog[] {
    try {
      const logs = db.prepare(`
        SELECT id, user_id as userId, action, ip_address as ipAddress, timestamp 
        FROM audit_logs 
        ORDER BY timestamp DESC 
        LIMIT ?
      `).all(limit) as AuditLog[];
      return logs;
    } catch (error) {
      console.error('Failed to query audit logs:', error);
      return [];
    }
  }
}
