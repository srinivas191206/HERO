import db from '../../config/db';
import { Incident } from '../../types';
import crypto from 'crypto';
import { AuditService } from '../audit/AuditService';

export class IncidentService {
  static createIncident(
    title: string,
    description: string,
    priority: 'P1' | 'P2' | 'P3' | 'P4',
    reporterId: string,
    lat: number | null = null,
    lng: number | null = null
  ): Incident {
    const id = crypto.randomUUID();
    const timestamp = Date.now();
    
    const initialEvent = {
      timestamp,
      event: `Incident created: "${title}" reported by user ID ${reporterId}`
    };
    const timeline = JSON.stringify([initialEvent]);

    const insert = db.prepare(`
      INSERT INTO incidents (id, title, description, priority, status, location_lat, location_lng, reporter_id, assignee_id, timestamp, timeline)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    insert.run(id, title, description, priority, 'Open', lat, lng, reporterId, null, timestamp, timeline);
    AuditService.log(reporterId, `Incident spawned: [${priority}] "${title}" (ID: ${id})`);
    
    return {
      id,
      title,
      description,
      priority,
      status: 'Open',
      locationLat: lat,
      locationLng: lng,
      reporterId,
      assigneeId: null,
      timestamp,
      timeline
    };
  }

  static triggerSOS(officerId: string, lat: number | null, lng: number | null): Incident {
    // Locate officer info
    const officer = db.prepare('SELECT name FROM users WHERE id = ?').get(officerId) as { name: string } | undefined;
    const officerName = officer?.name || `Officer (${officerId})`;
    
    // Set officer status to 'Emergency'
    db.prepare("UPDATE users SET status = 'Emergency' WHERE id = ?").run(officerId);
    
    // Auto-create P1 Incident
    const incident = this.createIncident(
      `CRITICAL SOS: Emergency alert from ${officerName}`,
      `SOS signal manually initiated by ${officerName}. Priority P1 Emergency channels active.`,
      'P1',
      officerId,
      lat,
      lng
    );

    // Update incident timeline to record emergency trigger
    this.addTimelineEvent(incident.id, `SOS beacon triggered by ${officerName} at coordinates [${lat ?? 0}, ${lng ?? 0}]`);
    
    return incident;
  }

  static assignOfficer(incidentId: string, assigneeId: string, assignerId: string): void {
    const incident = db.prepare('SELECT timeline FROM incidents WHERE id = ?').get(incidentId) as { timeline: string } | undefined;
    const officer = db.prepare('SELECT name FROM users WHERE id = ?').get(assigneeId) as { name: string } | undefined;
    
    if (!incident || !officer) return;

    db.prepare("UPDATE users SET status = 'Assigned' WHERE id = ?").run(assigneeId);
    
    const update = db.prepare(`
      UPDATE incidents 
      SET assignee_id = ?, status = 'Dispatched' 
      WHERE id = ?
    `);
    update.run(assigneeId, incidentId);

    this.addTimelineEvent(
      incidentId, 
      `Officer ${officer.name} assigned to incident by Dispatcher (ID: ${assignerId})`
    );
  }

  static updateStatus(incidentId: string, status: 'Open' | 'Dispatched' | 'Resolved' | 'Closed', userId: string): void {
    const update = db.prepare(`
      UPDATE incidents
      SET status = ?
      WHERE id = ?
    `);
    update.run(status, incidentId);
    this.addTimelineEvent(incidentId, `Incident status changed to: ${status} by user ID ${userId}`);
    AuditService.log(userId, `Updated Incident ${incidentId} status to ${status}`);
  }

  static addTimelineEvent(incidentId: string, eventText: string): void {
    try {
      const result = db.prepare('SELECT timeline FROM incidents WHERE id = ?').get(incidentId) as { timeline: string } | undefined;
      if (!result) return;

      const timeline = JSON.parse(result.timeline);
      timeline.push({
        timestamp: Date.now(),
        event: eventText
      });

      db.prepare('UPDATE incidents SET timeline = ? WHERE id = ?').run(JSON.stringify(timeline), incidentId);
    } catch (error) {
      console.error('Failed to append event to incident timeline:', error);
    }
  }

  static getActiveIncidents(): Incident[] {
    try {
      return db.prepare(`
        SELECT id, title, description, priority, status, 
               location_lat as locationLat, location_lng as locationLng, 
               reporter_id as reporterId, assignee_id as assigneeId, 
               timestamp, timeline
        FROM incidents
        WHERE status != 'Closed'
        ORDER BY priority ASC, timestamp DESC
      `).all() as Incident[];
    } catch (error) {
      console.error('Failed to fetch active incidents:', error);
      return [];
    }
  }
}
