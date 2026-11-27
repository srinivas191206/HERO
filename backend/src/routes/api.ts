import express, { Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import db, { getActiveDistrictId, setActiveDistrictId } from '../config/db';
import { authenticateJWT, AuthenticatedRequest, requireRole } from '../middleware/authMiddleware';
import { IncidentService } from '../services/incident/IncidentService';
import { DeviceService } from '../services/device/DeviceService';
import { HeuristicRecommendationService } from '../services/recommendations/HeuristicRecommendationService';
import { AuditService } from '../services/audit/AuditService';
import { CloudSyncService } from '../services/sync/CloudSyncService';

const router = express.Router();
const recommendationService = new HeuristicRecommendationService();

function resolveDistrictScope(req: AuthenticatedRequest): string {
  if (req.user?.role === 'state_admin' || req.user?.role === 'dispatcher') {
    if (typeof req.query.districtId === 'string' && req.query.districtId) {
      return req.query.districtId;
    }
    if (typeof req.body?.districtId === 'string' && req.body.districtId) {
      return req.body.districtId;
    }
  }
  return req.user?.districtId || getActiveDistrictId();
}

function generateSequentialOfficers(options: {
  districtId: string;
  count: number;
  prefix?: string;
  defaultPin?: string;
  actorId: string | null;
  ipAddress: string | null;
}) {
  const { districtId, count, prefix, defaultPin = 'police', actorId, ipAddress } = options;
  const district = db.prepare('SELECT id, code, name FROM districts WHERE id = ?').get(districtId) as
    | { id: string; code: string; name: string }
    | undefined;
  if (!district) {
    throw new Error('Target district not found.');
  }

  let teams = db.prepare('SELECT id, name FROM teams WHERE district_id = ?').all(districtId) as Array<{ id: string; name: string }>;
  if (teams.length === 0) {
    const defaultTeamId = `${districtId}_t1`;
    db.prepare('INSERT INTO teams (id, name, description, color, district_id) VALUES (?, ?, ?, ?, ?)').run(
      defaultTeamId,
      'Alpha Team',
      `${district.name} Frontline Rescue`,
      '#00E5FF',
      districtId
    );
    teams = [{ id: defaultTeamId, name: 'Alpha Team' }];
  }

  const basePrefix = prefix
    ? prefix.trim().toLowerCase()
    : districtId === 'd_eluru'
      ? 'p'
      : `${district.code.toLowerCase()}_p`;

  const existingBadges = new Set(
    (db.prepare('SELECT LOWER(badge_number) as b FROM users').all() as Array<{ b: string }>).map(r => r.b)
  );

  const pinHash = bcrypt.hashSync(defaultPin, 10);
  const now = Date.now();
  const created: Array<{
    id: string;
    badgeNumber: string;
    name: string;
    pin: string;
    role: 'officer';
    teamId: string;
    teamName: string;
    districtId: string;
  }> = [];

  const insertUser = db.prepare(`
    INSERT INTO users (id, badge_number, pin_hash, name, role, status, battery, team_id, district_id, last_heartbeat)
    VALUES (?, ?, ?, ?, 'officer', 'Offline', 100, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    let seq = 1;
    for (let i = 0; i < count; i++) {
      while (existingBadges.has(`${basePrefix}${seq}`.toLowerCase())) {
        seq++;
      }
      const badgeNumber = `${basePrefix}${seq}`;
      existingBadges.add(badgeNumber.toLowerCase());

      const id = `u_${crypto.randomUUID().slice(0, 8)}`;
      const team = teams[i % teams.length];
      const name = `${district.code} Officer ${seq}`;

      insertUser.run(id, badgeNumber, pinHash, name, team.id, districtId, now);
      created.push({
        id,
        badgeNumber,
        name,
        pin: defaultPin,
        role: 'officer',
        teamId: team.id,
        teamName: team.name,
        districtId
      });
      seq++;
    }
  });

  tx();
  AuditService.log(
    actorId,
    `Batch deployed ${created.length} officers (${created.map(c => c.badgeNumber).join(', ')}) in ${district.code}`,
    ipAddress,
    districtId
  );

  return created;
}

// =====================================================================
// DISTRICT-SCOPED OPERATIONAL ROUTES
// =====================================================================

// GET /api/officers
router.get('/officers', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  try {
    const districtId = resolveDistrictScope(req);
    const officers = db.prepare(`
      SELECT u.id, u.badge_number as badgeNumber, u.name, u.role, u.status, u.battery,
             u.team_id as teamId, t.name as teamName, u.district_id as districtId,
             u.last_heartbeat as lastHeartbeat
      FROM users u
      LEFT JOIN teams t ON u.team_id = t.id
      WHERE u.role = 'officer' AND u.district_id = ?
    `).all(districtId) as any[];

    const latestGpsStmt = db.prepare(`
      SELECT latitude, longitude, heading, speed, accuracy, network_quality as networkQuality, timestamp
      FROM gps_logs
      WHERE officer_id = ?
      ORDER BY timestamp DESC
      LIMIT 1
    `);

    const officersWithLocation = officers.map(off => ({
      ...off,
      location: latestGpsStmt.get(off.id) || null
    }));

    res.json(officersWithLocation);
  } catch (error) {
    console.error('Error fetching officers:', error);
    res.status(500).json({ error: 'Database query failed.' });
  }
});

// POST /api/officers (Add single officer directly from District Command Center or State Admin)
router.post('/officers', authenticateJWT, requireRole('dispatcher', 'state_admin'), (req: AuthenticatedRequest, res: Response) => {
  const { badgeNumber, name, pin, teamId } = req.body;
  if (!badgeNumber || !name) {
    return res.status(400).json({ error: 'Badge number and officer name are required.' });
  }

  try {
    const districtId = resolveDistrictScope(req);
    const cleanBadge = String(badgeNumber).trim();
    const effectivePin = String(pin || 'police').trim();
    const id = `u_${crypto.randomUUID().slice(0, 8)}`;
    const pinHash = bcrypt.hashSync(effectivePin, 10);

    db.prepare(`
      INSERT INTO users (id, badge_number, pin_hash, name, role, status, battery, team_id, district_id, last_heartbeat)
      VALUES (?, ?, ?, ?, 'officer', 'Offline', 100, ?, ?, ?)
    `).run(id, cleanBadge, pinHash, String(name).trim(), teamId || null, districtId, Date.now());

    AuditService.log(req.user?.id || null, `Added officer ${name} (${cleanBadge}) to district ${districtId}`, req.ip || null, districtId);

    // Best-effort cloud sync if online
    CloudSyncService.syncNow(districtId).catch(() => {});

    res.status(201).json({
      id,
      badgeNumber: cleanBadge,
      name: String(name).trim(),
      pin: effectivePin,
      role: 'officer',
      teamId: teamId || null,
      districtId,
      status: 'Offline'
    });
  } catch (error: any) {
    if (error?.message?.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Badge number already exists.' });
    }
    console.error('Error adding officer:', error);
    res.status(500).json({ error: 'Failed to add officer.' });
  }
});

// POST /api/officers/batch (Generate N officer credentials with default PIN 'police')
router.post('/officers/batch', authenticateJWT, requireRole('dispatcher', 'state_admin'), (req: AuthenticatedRequest, res: Response) => {
  const count = Number(req.body?.count);
  const prefix = typeof req.body?.prefix === 'string' && req.body.prefix.trim() ? req.body.prefix.trim() : undefined;
  const defaultPin = typeof req.body?.defaultPin === 'string' && req.body.defaultPin.trim() ? req.body.defaultPin.trim() : 'police';

  if (!Number.isInteger(count) || count < 1 || count > 50) {
    return res.status(400).json({ error: 'Officer deployment count must be an integer between 1 and 50.' });
  }

  try {
    const districtId = resolveDistrictScope(req);
    const created = generateSequentialOfficers({
      districtId,
      count,
      prefix,
      defaultPin,
      actorId: req.user?.id || null,
      ipAddress: req.ip || null
    });

    // Best-effort sync up to Supabase if internet is available
    CloudSyncService.syncNow(districtId).catch(() => {});

    res.status(201).json({ success: true, districtId, created });
  } catch (error: any) {
    console.error('Error batch deploying officers:', error);
    res.status(500).json({ error: error?.message || 'Failed to batch deploy officers.' });
  }
});

// GET /api/teams
router.get('/teams', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  try {
    const districtId = resolveDistrictScope(req);
    const teams = db.prepare('SELECT id, name, description, color, district_id as districtId FROM teams WHERE district_id = ?').all(districtId);
    res.json(teams);
  } catch (error) {
    console.error('Error fetching teams:', error);
    res.status(500).json({ error: 'Database query failed.' });
  }
});

// GET /api/incidents
router.get('/incidents', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  try {
    const districtId = resolveDistrictScope(req);
    const incidents = IncidentService.getActiveIncidents(districtId);
    res.json(incidents);
  } catch (error) {
    console.error('Error fetching incidents:', error);
    res.status(500).json({ error: 'Database query failed.' });
  }
});

// POST /api/incidents
router.post('/incidents', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized.' });

  const { title, description, priority, lat, lng } = req.body;
  if (!title || !priority || !['P1', 'P2', 'P3', 'P4'].includes(priority)) {
    return res.status(400).json({ error: 'Valid title and priority (P1-P4) are required.' });
  }

  try {
    const districtId = resolveDistrictScope(req);
    const incident = IncidentService.createIncident(
      title,
      description || '',
      priority,
      req.user.id,
      lat ?? null,
      lng ?? null,
      districtId
    );

    const socketManager = req.app.get('socketManager');
    if (socketManager) {
      socketManager.getIO().to(`district:${districtId}:global`).emit('incident:updated', {
        incidentId: incident.id,
        status: incident.status,
        incident
      });
    }

    res.status(201).json(incident);
  } catch (error) {
    console.error('Error creating incident:', error);
    res.status(500).json({ error: 'Failed to record incident.' });
  }
});

// POST /api/incidents/:id/status
router.post('/incidents/:id/status', authenticateJWT, requireRole('dispatcher', 'state_admin'), (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized.' });
  const { id } = req.params;
  const { status } = req.body;

  if (!['Open', 'Dispatched', 'Resolved', 'Closed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status value.' });
  }

  try {
    const existing = IncidentService.getIncidentById(id);
    if (!existing) return res.status(404).json({ error: 'Incident not found.' });
    if (req.user.role !== 'state_admin' && existing.districtId !== req.user.districtId) {
      return res.status(403).json({ error: 'Forbidden: Cross-district incident access denied.' });
    }

    const updated = IncidentService.updateStatus(id, status, req.user.id);
    const socketManager = req.app.get('socketManager');
    if (socketManager) {
      socketManager.getIO().to(`district:${existing.districtId}:global`).emit('incident:updated', {
        incidentId: id,
        status
      });
    }
    res.json({ success: true, incident: updated });
  } catch (error) {
    console.error('Error updating incident status:', error);
    res.status(500).json({ error: 'Failed to update incident status.' });
  }
});

// GET /api/incidents/:id/recommendations
router.get('/incidents/:id/recommendations', authenticateJWT, requireRole('dispatcher', 'state_admin'), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    const existing = IncidentService.getIncidentById(id);
    if (!existing) return res.status(404).json({ error: 'Incident not found.' });
    if (req.user?.role !== 'state_admin' && existing.districtId !== req.user?.districtId) {
      return res.status(403).json({ error: 'Forbidden: Cross-district access denied.' });
    }
    const recs = await recommendationService.getBackupRecommendations(id);
    res.json(recs);
  } catch (error) {
    console.error('Error generating recommendations:', error);
    res.status(500).json({ error: 'Failed to compile dispatch recommendations.' });
  }
});

// POST /api/incidents/:id/dispatch
router.post('/incidents/:id/dispatch', authenticateJWT, requireRole('dispatcher', 'state_admin'), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { assigneeId } = req.body;

  if (!req.user) return res.status(401).json({ error: 'Unauthorized.' });
  if (!assigneeId) return res.status(400).json({ error: 'Assignee officer ID is required.' });

  try {
    const existing = IncidentService.getIncidentById(id);
    if (!existing) return res.status(404).json({ error: 'Incident not found.' });
    if (req.user.role !== 'state_admin' && existing.districtId !== req.user.districtId) {
      return res.status(403).json({ error: 'Forbidden: Cross-district dispatch denied.' });
    }

    IncidentService.assignOfficer(id, assigneeId, req.user.id);

    const socketManager = req.app.get('socketManager');
    if (socketManager) {
      socketManager.getIO().to(`district:${existing.districtId}:global`).emit('officer:status_change', {
        userId: assigneeId,
        status: 'Assigned',
        lastHeartbeat: Date.now()
      });

      socketManager.getIO().to(`district:${existing.districtId}:global`).emit('incident:updated', {
        incidentId: id,
        status: 'Dispatched',
        assigneeId
      });
    }

    res.json({ success: true, message: 'Officer dispatched successfully.' });
  } catch (error) {
    console.error('Error dispatching officer:', error);
    res.status(500).json({ error: 'Failed to complete officer dispatch.' });
  }
});

// POST /api/devices/sync
router.post('/devices/sync', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  const { deviceId, deviceName, batteryLevel, networkType, firmwareVersion, ipAddress, macAddress, status } = req.body;

  if (!deviceId || !deviceName || !networkType) {
    return res.status(400).json({ error: 'Device ID, device name, and network type are required.' });
  }

  try {
    DeviceService.registerOrSync({
      deviceId,
      officerId: req.user?.id || null,
      districtId: req.user?.districtId || getActiveDistrictId(),
      deviceName,
      batteryLevel: batteryLevel ?? 100,
      networkType,
      firmwareVersion: firmwareVersion || '1.0.0',
      ipAddress: ipAddress || null,
      macAddress: macAddress || null,
      status: status || 'Operational'
    } as any);
    res.json({ success: true, message: 'Device synced successfully.' });
  } catch (error) {
    console.error('Error syncing device:', error);
    res.status(500).json({ error: 'Failed to store device registry.' });
  }
});

// GET /api/devices
router.get('/devices', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  try {
    const districtId = resolveDistrictScope(req);
    const devices = db.prepare(`
      SELECT device_id as deviceId, officer_id as officerId, district_id as districtId,
             device_name as deviceName, battery_level as batteryLevel, network_type as networkType,
             firmware_version as firmwareVersion, ip_address as ipAddress, mac_address as macAddress,
             last_sync as lastSync, status
      FROM devices
      WHERE district_id = ?
    `).all(districtId);
    res.json(devices);
  } catch (error) {
    console.error('Error fetching devices:', error);
    res.status(500).json({ error: 'Failed to retrieve device registries.' });
  }
});

// GET /api/audit-logs
router.get('/audit-logs', authenticateJWT, requireRole('dispatcher', 'state_admin'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const districtId = resolveDistrictScope(req);
    const logs = AuditService.getRecentLogs(50, districtId);
    res.json(logs);
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to query database logs.' });
  }
});

// GET /api/messages
router.get('/messages', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized.' });

  try {
    const districtId = resolveDistrictScope(req);
    let messages: any[];

    if (req.user.role === 'dispatcher' || req.user.role === 'state_admin') {
      messages = db.prepare(`
        SELECT id, sender_id as senderId, recipient_id as recipientId, team_id as teamId,
               district_id as districtId, body, priority, timestamp, is_broadcast as isBroadcast
        FROM messages
        WHERE district_id = ?
        ORDER BY timestamp ASC
      `).all(districtId) as any[];
    } else {
      messages = db.prepare(`
        SELECT id, sender_id as senderId, recipient_id as recipientId, team_id as teamId,
               district_id as districtId, body, priority, timestamp, is_broadcast as isBroadcast
        FROM messages
        WHERE district_id = ?
          AND (is_broadcast = 1 OR sender_id = ? OR recipient_id = ? OR (team_id IS NOT NULL AND team_id = ?))
        ORDER BY timestamp ASC
      `).all(districtId, req.user.id, req.user.id, req.user.teamId || '') as any[];
    }

    res.json(
      messages.map(m => ({
        ...m,
        isBroadcast: m.isBroadcast === 1
      }))
    );
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to retrieve messages.' });
  }
});

// POST /api/officers/:id/resolve-sos
router.post('/officers/:id/resolve-sos', authenticateJWT, requireRole('dispatcher', 'state_admin'), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  if (!req.user) return res.status(401).json({ error: 'Unauthorized.' });

  try {
    const officer = db.prepare('SELECT id, district_id as districtId FROM users WHERE id = ?').get(id) as
      | { id: string; districtId: string }
      | undefined;
    if (!officer) return res.status(404).json({ error: 'Officer not found.' });
    if (req.user.role !== 'state_admin' && officer.districtId !== req.user.districtId) {
      return res.status(403).json({ error: 'Forbidden: Cross-district SOS resolution denied.' });
    }

    db.prepare("UPDATE users SET status = 'Available' WHERE id = ?").run(id);

    const openSOSIncidents = db.prepare(`
      SELECT id FROM incidents
      WHERE reporter_id = ? AND priority = 'P1' AND status != 'Resolved' AND status != 'Closed'
    `).all(id) as { id: string }[];

    for (const inc of openSOSIncidents) {
      IncidentService.updateStatus(inc.id, 'Resolved', req.user.id);
    }

    const socketManager = req.app.get('socketManager');
    if (socketManager) {
      socketManager.getIO().to(`district:${officer.districtId}:global`).emit('officer:status_change', {
        userId: id,
        status: 'Available',
        lastHeartbeat: Date.now()
      });

      for (const inc of openSOSIncidents) {
        socketManager.getIO().to(`district:${officer.districtId}:global`).emit('incident:updated', {
          incidentId: inc.id,
          status: 'Resolved'
        });
      }
    }

    AuditService.log(req.user.id, `Resolved emergency SOS for officer (ID: ${id})`, req.ip || null, officer.districtId);
    res.json({ success: true, message: 'Emergency SOS resolved successfully.' });
  } catch (error) {
    console.error('Error resolving officer SOS:', error);
    res.status(500).json({ error: 'Failed to resolve emergency SOS.' });
  }
});

// GET /api/evidence
router.get('/evidence', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized.' });

  try {
    const districtId = resolveDistrictScope(req);
    const baseQuery = `
      SELECT e.id, e.officer_id as officerId, u.name as officerName, e.incident_id as incidentId,
             e.district_id as districtId, e.description, e.file_path as filePath, e.hash,
             e.hash_verified as hashVerified, e.location_lat as locationLat, e.location_lng as locationLng, e.timestamp
      FROM evidence e
      LEFT JOIN users u ON e.officer_id = u.id
      WHERE e.district_id = ?
      ${req.user.role === 'officer' ? 'AND e.officer_id = ?' : ''}
      ORDER BY e.timestamp DESC
    `;

    const evidence = (
      req.user.role === 'officer'
        ? db.prepare(baseQuery).all(districtId, req.user.id)
        : db.prepare(baseQuery).all(districtId)
    ) as any[];

    res.json(
      evidence.map(ev => ({
        ...ev,
        hashVerified: ev.hashVerified === 1
      }))
    );
  } catch (error) {
    console.error('Error fetching evidence:', error);
    res.status(500).json({ error: 'Failed to retrieve evidence.' });
  }
});

// POST /api/evidence/:id/verify
router.post('/evidence/:id/verify', authenticateJWT, requireRole('dispatcher', 'state_admin'), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    const ev = db.prepare('SELECT id, file_path as filePath, hash, district_id as districtId FROM evidence WHERE id = ?').get(id) as
      | { id: string; filePath: string; hash: string; districtId: string }
      | undefined;

    if (!ev) return res.status(404).json({ error: 'Evidence record not found.' });
    if (req.user?.role !== 'state_admin' && ev.districtId !== req.user?.districtId) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    let computedHash = '';
    let verified = false;
    if (ev.filePath) {
      const cleanBase64 = ev.filePath.includes(',') ? ev.filePath.split(',')[1] : ev.filePath;
      const rawBuffer = Buffer.from(cleanBase64, 'base64');
      computedHash = crypto.createHash('sha256').update(rawBuffer).digest('hex');
      verified = computedHash === ev.hash;
    }

    db.prepare('UPDATE evidence SET hash_verified = ? WHERE id = ?').run(verified ? 1 : 0, id);
    res.json({ id, verified, storedHash: ev.hash, computedHash });
  } catch (error) {
    console.error('Error verifying evidence hash:', error);
    res.status(500).json({ error: 'Verification failed.' });
  }
});

// =====================================================================
// STATE ADMIN & DISTRICT SYNC ROUTES
// =====================================================================

// GET /api/sync/status
router.get('/sync/status', authenticateJWT, requireRole('dispatcher', 'state_admin'), (req: AuthenticatedRequest, res: Response) => {
  const districtId = resolveDistrictScope(req);
  res.json(CloudSyncService.getStatus(districtId));
});

// POST /api/sync/trigger
router.post('/sync/trigger', authenticateJWT, requireRole('dispatcher', 'state_admin'), async (req: AuthenticatedRequest, res: Response) => {
  const districtId = resolveDistrictScope(req);
  const result = await CloudSyncService.syncNow(districtId);
  res.json(result);
});

// POST /api/sync/set-active-district (Switch the District Node laptop's active operational district)
router.post('/sync/set-active-district', authenticateJWT, requireRole('dispatcher', 'state_admin'), async (req: AuthenticatedRequest, res: Response) => {
  const { districtId } = req.body;
  if (!districtId) {
    return res.status(400).json({ error: 'districtId is required.' });
  }
  const exists = db.prepare('SELECT id, name, code FROM districts WHERE id = ?').get(districtId) as
    | { id: string; name: string; code: string }
    | undefined;
  if (!exists) {
    return res.status(404).json({ error: 'District not found locally. Sync from State Cloud first.' });
  }
  setActiveDistrictId(districtId);
  AuditService.log(req.user?.id || null, `Switched District Node active hub to ${exists.name} (${exists.code})`, req.ip || null, districtId);
  res.json({ success: true, district: exists });
});

// POST /api/sync/import-bundle
router.post('/sync/import-bundle', authenticateJWT, requireRole('dispatcher', 'state_admin'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const imported = CloudSyncService.importDistrictBundle(req.body);
    AuditService.log(req.user?.id || null, `Imported offline provisioning bundle for district ${imported.districtId}`, req.ip || null, imported.districtId);
    res.json({ success: true, ...imported });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Invalid bundle format.' });
  }
});

// GET /api/state/overview
router.get('/state/overview', authenticateJWT, requireRole('state_admin'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const districts = db.prepare(`
      SELECT id, code, name, state_name as stateName, center_lat as centerLat, center_lng as centerLng,
             status, last_sync_at as lastSyncAt, created_at as createdAt
      FROM districts
      ORDER BY created_at ASC
    `).all() as any[];

    const summaries = districts.map(d => {
      const officerStats = db.prepare(`
        SELECT
          COUNT(*) as totalOfficers,
          SUM(CASE WHEN status NOT IN ('Offline', 'Lost Connection') THEN 1 ELSE 0 END) as onlineOfficers,
          SUM(CASE WHEN status = 'Emergency' THEN 1 ELSE 0 END) as sosCount
        FROM users WHERE district_id = ? AND role = 'officer'
      `).get(d.id) as { totalOfficers: number; onlineOfficers: number | null; sosCount: number | null };

      const incidentStats = db.prepare(`
        SELECT
          COUNT(*) as activeIncidents,
          SUM(CASE WHEN priority = 'P1' THEN 1 ELSE 0 END) as p1Count
        FROM incidents WHERE district_id = ? AND status != 'Closed' AND status != 'Resolved'
      `).get(d.id) as { activeIncidents: number; p1Count: number | null };

      const pendingSync = db.prepare(`
        SELECT COUNT(*) as count FROM cloud_sync_queue WHERE district_id = ? AND status = 'pending'
      `).get(d.id) as { count: number };

      return {
        ...d,
        totalOfficers: officerStats?.totalOfficers || 0,
        onlineOfficers: officerStats?.onlineOfficers || 0,
        sosCount: officerStats?.sosCount || 0,
        activeIncidents: incidentStats?.activeIncidents || 0,
        p1Count: incidentStats?.p1Count || 0,
        pendingSyncCount: pendingSync?.count || 0
      };
    });

    res.json({ districts: summaries });
  } catch (error) {
    console.error('Error building state overview:', error);
    res.status(500).json({ error: 'Failed to load state overview.' });
  }
});

// POST /api/state/districts
router.post('/state/districts', authenticateJWT, requireRole('state_admin'), (req: AuthenticatedRequest, res: Response) => {
  const { name, code, stateName, centerLat, centerLng, officerCount, defaultPin } = req.body;
  if (!name || !code) {
    return res.status(400).json({ error: 'District name and code are required.' });
  }

  try {
    const cleanCode = String(code).trim().toUpperCase();
    const id = `d_${cleanCode.toLowerCase()}_${crypto.randomUUID().slice(0, 6)}`;
    const now = Date.now();
    const plainNodeKey = `hk_${crypto.randomBytes(16).toString('hex')}`;
    const nodeKeyHash = crypto.createHash('sha256').update(plainNodeKey).digest('hex');

    db.prepare(`
      INSERT INTO districts (id, code, name, state_name, center_lat, center_lng, node_key_hash, status, last_sync_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'provisioning', NULL, ?)
    `).run(
      id,
      cleanCode,
      name.trim(),
      (stateName || 'Andhra Pradesh').trim(),
      Number(centerLat ?? 17.6868),
      Number(centerLng ?? 83.2185),
      nodeKeyHash,
      now
    );

    // Seed default Alpha/Bravo teams for the new district
    const insertTeam = db.prepare('INSERT INTO teams (id, name, description, color, district_id) VALUES (?, ?, ?, ?, ?)');
    insertTeam.run(`${id}_t1`, 'Alpha Team', `${name} Frontline Rescue`, '#00E5FF', id);
    insertTeam.run(`${id}_t2`, 'Bravo Team', `${name} Perimeter Containment`, '#FFD600', id);

    AuditService.log(req.user?.id || null, `Created District Hub: ${name} (${cleanCode})`, req.ip || null, id);

    let deployedOfficers: any[] = [];
    const parsedCount = Number(officerCount || 0);
    if (Number.isInteger(parsedCount) && parsedCount > 0 && parsedCount <= 50) {
      deployedOfficers = generateSequentialOfficers({
        districtId: id,
        count: parsedCount,
        defaultPin: typeof defaultPin === 'string' && defaultPin.trim() ? defaultPin.trim() : 'police',
        actorId: req.user?.id || null,
        ipAddress: req.ip || null
      });
    }

    res.status(201).json({
      district: {
        id,
        code: cleanCode,
        name: name.trim(),
        stateName: (stateName || 'Andhra Pradesh').trim(),
        centerLat: Number(centerLat ?? 17.6868),
        centerLng: Number(centerLng ?? 83.2185),
        status: 'provisioning',
        lastSyncAt: null,
        createdAt: now
      },
      nodeKey: plainNodeKey,
      deployedOfficers
    });
  } catch (error: any) {
    if (error?.message?.includes('UNIQUE')) {
      return res.status(409).json({ error: 'District code already exists.' });
    }
    console.error('Error creating district:', error);
    res.status(500).json({ error: 'Failed to create district.' });
  }
});

// POST /api/state/users (Assign dispatcher or officer to a district)
router.post('/state/users', authenticateJWT, requireRole('state_admin'), (req: AuthenticatedRequest, res: Response) => {
  const { badgeNumber, name, pin, role, districtId, teamId } = req.body;
  if (!badgeNumber || !name || !pin || !districtId || !['officer', 'dispatcher'].includes(role)) {
    return res.status(400).json({ error: 'badgeNumber, name, pin, districtId, and valid role (officer|dispatcher) are required.' });
  }

  try {
    const id = `u_${crypto.randomUUID().slice(0, 8)}`;
    const pinHash = bcrypt.hashSync(String(pin), 10);
    db.prepare(`
      INSERT INTO users (id, badge_number, pin_hash, name, role, status, battery, team_id, district_id, last_heartbeat)
      VALUES (?, ?, ?, ?, ?, 'Offline', 100, ?, ?, ?)
    `).run(id, badgeNumber.trim(), pinHash, name.trim(), role, teamId || null, districtId, Date.now());

    AuditService.log(req.user?.id || null, `Assigned ${role} ${name} (${badgeNumber}) to district ${districtId}`, req.ip || null, districtId);

    res.status(201).json({
      id,
      badgeNumber: badgeNumber.trim(),
      name: name.trim(),
      role,
      districtId,
      teamId: teamId || null,
      status: 'Offline'
    });
  } catch (error: any) {
    if (error?.message?.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Badge number already exists.' });
    }
    console.error('Error assigning user to district:', error);
    res.status(500).json({ error: 'Failed to assign user.' });
  }
});

// GET /api/state/districts/:id/bundle (Download offline provisioning JSON)
router.get('/state/districts/:id/bundle', authenticateJWT, requireRole('state_admin'), (req: AuthenticatedRequest, res: Response) => {
  const bundle = CloudSyncService.exportDistrictBundle(req.params.id);
  if (!bundle) {
    return res.status(404).json({ error: 'District not found.' });
  }
  res.json(bundle);
});

export default router;
