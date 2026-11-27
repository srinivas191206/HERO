import db, { getActiveDistrictId } from '../../config/db';
import { Incident } from '../../types';
import crypto from 'crypto';
import { AuditService } from '../audit/AuditService';
import { CloudSyncService } from '../sync/CloudSyncService';

export class IncidentService {
  static createIncident(
    title: string,
    description: string,
    priority: 'P1' | 'P2' | 'P3' | 'P4',
    reporterId: string,
    lat: number | null = null,
    lng: number | null = null,
    districtId?: string
  ): Incident {
    const id = crypto.randomUUID();
    const timestamp = Date.now();

    const reporter = db.prepare('SELECT district_id as districtId FROM users WHERE id = ?').get(reporterId) as
      | { districtId: string }
      | undefined;
    const resolvedDistrictId = districtId || reporter?.districtId || getActiveDistrictId();

    const initialEvent = {
      timestamp,
      event: `Incident created: "${title}" reported by user ID ${reporterId}`
    };
    const timeline = JSON.stringify([initialEvent]);

    const insert = db.prepare(`
      INSERT INTO incidents (id, title, description, priority, status, location_lat, location_lng, reporter_id, assignee_id, district_id, timestamp, timeline)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(id, title, description, priority, 'Open', lat, lng, reporterId, null, resolvedDistrictId, timestamp, timeline);
    AuditService.log(reporterId, `Incident spawned: [${priority}] "${title}" (ID: ${id})`, null, resolvedDistrictId);

    const created: Incident = {
      id,
      title,
      description,
      priority,
      status: 'Open',
      locationLat: lat,
      locationLng: lng,
      reporterId,
      assigneeId: null,
      districtId: resolvedDistrictId,
      timestamp,
      timeline
    };

    CloudSyncService.enqueue('incident', id, resolvedDistrictId, created);
    return created;
  }

  static triggerSOS(officerId: string, lat: number | null, lng: number | null, districtId?: string): Incident {
    const officer = db.prepare('SELECT name, district_id as districtId FROM users WHERE id = ?').get(officerId) as
      | { name: string; districtId: string }
      | undefined;
    const officerName = officer?.name || `Officer (${officerId})`;
    const resolvedDistrictId = districtId || officer?.districtId || getActiveDistrictId();

    db.prepare("UPDATE users SET status = 'Emergency' WHERE id = ?").run(officerId);

    const incident = this.createIncident(
      `CRITICAL SOS: Emergency alert from ${officerName}`,
      `SOS signal manually initiated by ${officerName}. Priority P1 Emergency channels active.`,
      'P1',
      officerId,
      lat,
      lng,
      resolvedDistrictId
    );

    this.addTimelineEvent(
      incident.id,
      `SOS beacon triggered by ${officerName} at coordinates [${lat ?? 0}, ${lng ?? 0}]`
    );

    // Return refreshed incident with updated timeline
    return this.getIncidentById(incident.id) || incident;
  }

  static getIncidentById(incidentId: string): Incident | null {
    const row = db.prepare(`
      SELECT id, title, description, priority, status,
             location_lat as locationLat, location_lng as locationLng,
             reporter_id as reporterId, assignee_id as assigneeId,
             district_id as districtId, timestamp, timeline
      FROM incidents WHERE id = ?
    `).get(incidentId) as Incident | undefined;
    return row || null;
  }

  static assignOfficer(incidentId: string, assigneeId: string, assignerId: string): Incident | null {
    const incident = db.prepare('SELECT id, district_id as districtId FROM incidents WHERE id = ?').get(incidentId) as
      | { id: string; districtId: string }
      | undefined;
    const officer = db.prepare('SELECT name, district_id as districtId FROM users WHERE id = ?').get(assigneeId) as
      | { name: string; districtId: string }
      | undefined;

    if (!incident || !officer) return null;

    db.prepare("UPDATE users SET status = 'Assigned' WHERE id = ?").run(assigneeId);
    db.prepare(`
      UPDATE incidents
      SET assignee_id = ?, status = 'Dispatched'
      WHERE id = ?
    `).run(assigneeId, incidentId);

    this.addTimelineEvent(
      incidentId,
      `Officer ${officer.name} assigned to incident by Dispatcher (ID: ${assignerId})`
    );
    AuditService.log(assignerId, `Dispatched ${officer.name} to incident ${incidentId}`, null, incident.districtId);

    const updated = this.getIncidentById(incidentId);
    if (updated) {
      CloudSyncService.enqueue('incident', incidentId, incident.districtId, updated);
    }
    return updated;
  }

  static updateStatus(incidentId: string, status: 'Open' | 'Dispatched' | 'Resolved' | 'Closed', userId: string): Incident | null {
    const existing = db.prepare('SELECT id, district_id as districtId FROM incidents WHERE id = ?').get(incidentId) as
      | { id: string; districtId: string }
      | undefined;
    if (!existing) return null;

    db.prepare('UPDATE incidents SET status = ? WHERE id = ?').run(status, incidentId);
    this.addTimelineEvent(incidentId, `Incident status changed to: ${status} by user ID ${userId}`);
    AuditService.log(userId, `Updated Incident ${incidentId} status to ${status}`, null, existing.districtId);

    const updated = this.getIncidentById(incidentId);
    if (updated) {
      CloudSyncService.enqueue('incident', incidentId, existing.districtId, updated);
    }
    return updated;
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

  static getActiveIncidents(districtId?: string): Incident[] {
    try {
      if (districtId) {
        return db.prepare(`
          SELECT id, title, description, priority, status,
                 location_lat as locationLat, location_lng as locationLng,
                 reporter_id as reporterId, assignee_id as assigneeId,
                 district_id as districtId, timestamp, timeline
          FROM incidents
          WHERE status != 'Closed' AND district_id = ?
          ORDER BY priority ASC, timestamp DESC
        `).all(districtId) as Incident[];
      }
      return db.prepare(`
        SELECT id, title, description, priority, status,
               location_lat as locationLat, location_lng as locationLng,
               reporter_id as reporterId, assignee_id as assigneeId,
               district_id as districtId, timestamp, timeline
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
