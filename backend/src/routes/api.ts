import express, { Response } from 'express';
import db from '../config/db';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/authMiddleware';
import { IncidentService } from '../services/incident/IncidentService';
import { DeviceService } from '../services/device/DeviceService';
import { HeuristicRecommendationService } from '../services/recommendations/HeuristicRecommendationService';
import { AuditService } from '../services/audit/AuditService';

const router = express.Router();
const recommendationService = new HeuristicRecommendationService();

// GET /api/officers
router.get('/officers', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  try {
    const officers = db.prepare(`
      SELECT u.id, u.badge_number as badgeNumber, u.name, u.role, u.status, u.battery, 
             u.team_id as teamId, t.name as teamName, u.last_heartbeat as lastHeartbeat
      FROM users u
      LEFT JOIN teams t ON u.team_id = t.id
      WHERE u.role = 'officer'
    `).all() as any[];

    // For each officer, fetch their latest GPS coordinate
    const officersWithLocation = officers.map(off => {
      const lastGps = db.prepare(`
        SELECT latitude, longitude, heading, speed, accuracy, network_quality as networkQuality, timestamp
        FROM gps_logs
        WHERE officer_id = ?
        ORDER BY timestamp DESC
        LIMIT 1
      `).get(off.id) as any;

      return {
        ...off,
        location: lastGps || null
      };
    });

    res.json(officersWithLocation);
  } catch (error) {
    console.error('Error fetching officers:', error);
    res.status(500).json({ error: 'Database query failed.' });
  }
});

// GET /api/teams
router.get('/teams', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  try {
    const teams = db.prepare('SELECT id, name, description, color FROM teams').all();
    res.json(teams);
  } catch (error) {
    console.error('Error fetching teams:', error);
    res.status(500).json({ error: 'Database query failed.' });
  }
});

// GET /api/incidents
router.get('/incidents', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  try {
    const incidents = IncidentService.getActiveIncidents();
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
  if (!title || !priority) {
    return res.status(400).json({ error: 'Title and priority are required fields.' });
  }

  try {
    const incident = IncidentService.createIncident(
      title,
      description || '',
      priority,
      req.user.id,
      lat || null,
      lng || null
    );
    res.status(201).json(incident);
  } catch (error) {
    console.error('Error creating incident:', error);
    res.status(500).json({ error: 'Failed to record incident.' });
  }
});

// GET /api/incidents/:id/recommendations
router.get('/incidents/:id/recommendations', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    const recs = await recommendationService.getBackupRecommendations(id);
    res.json(recs);
  } catch (error) {
    console.error('Error generating recommendations:', error);
    res.status(500).json({ error: 'Failed to compile AI recommendations.' });
  }
});

// POST /api/incidents/:id/dispatch
router.post('/incidents/:id/dispatch', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { assigneeId } = req.body;
  
  if (!req.user) return res.status(401).json({ error: 'Unauthorized.' });
  if (!assigneeId) return res.status(400).json({ error: 'Assignee officer ID is required.' });

  try {
    IncidentService.assignOfficer(id, assigneeId, req.user.id);
    
    // Broadcast updates via Sockets
    const socketManager = req.app.get('socketManager');
    if (socketManager) {
      socketManager.getIO().emit('officer:status_change', {
        userId: assigneeId,
        status: 'Assigned',
        lastHeartbeat: Date.now()
      });
      
      socketManager.getIO().emit('incident:updated', {
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
      deviceName,
      batteryLevel: batteryLevel ?? 100,
      networkType,
      firmwareVersion: firmwareVersion || '1.0.0',
      ipAddress: ipAddress || null,
      macAddress: macAddress || null,
      status: status || 'Operational'
    });
    res.json({ success: true, message: 'Device synced successfully.' });
  } catch (error) {
    console.error('Error syncing device:', error);
    res.status(500).json({ error: 'Failed to store device registry.' });
  }
});

// GET /api/devices
router.get('/devices', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  try {
    const devices = DeviceService.getDevices();
    res.json(devices);
  } catch (error) {
    console.error('Error fetching devices:', error);
    res.status(500).json({ error: 'Failed to retrieve device registries.' });
  }
});

// GET /api/audit-logs
router.get('/audit-logs', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  if (req.user?.role !== 'dispatcher') {
    return res.status(403).json({ error: 'Access denied: Operator credentials required.' });
  }

  try {
    const logs = AuditService.getRecentLogs(50);
    res.json(logs);
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to query database logs.' });
  }
});

// GET /api/messages
router.get('/messages', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  try {
    const messages = db.prepare(`
      SELECT id, sender_id as senderId, recipient_id as recipientId, team_id as teamId, 
             body, priority, timestamp, is_broadcast as isBroadcast
      FROM messages
      ORDER BY timestamp ASC
    `).all() as any[];

    // Map is_broadcast to boolean
    const formatted = messages.map(m => ({
      ...m,
      isBroadcast: m.isBroadcast === 1
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to retrieve messages.' });
  }
});

// POST /api/officers/:id/resolve-sos
router.post('/officers/:id/resolve-sos', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  if (!req.user || req.user.role !== 'dispatcher') {
    return res.status(403).json({ error: 'Access denied: Operator credentials required.' });
  }

  try {
    // 1. Update officer status back to 'Available'
    db.prepare("UPDATE users SET status = 'Available' WHERE id = ?").run(id);

    // 2. Resolve open P1 incidents reported by this officer
    const openSOSIncidents = db.prepare(`
      SELECT id FROM incidents 
      WHERE reporter_id = ? AND priority = 'P1' AND status != 'Resolved' AND status != 'Closed'
    `).all(id) as { id: string }[];

    for (const inc of openSOSIncidents) {
      IncidentService.updateStatus(inc.id, 'Resolved', req.user.id);
    }

    // 3. Broadcast updates via Sockets
    const socketManager = req.app.get('socketManager');
    if (socketManager) {
      // Broadcast to update officer status to 'Available'
      socketManager.getIO().emit('officer:status_change', {
        userId: id,
        status: 'Available',
        lastHeartbeat: Date.now()
      });

      // Broadcast to update any modified incidents
      for (const inc of openSOSIncidents) {
        socketManager.getIO().emit('incident:updated', {
          incidentId: inc.id,
          status: 'Resolved'
        });
      }
    }

    AuditService.log(req.user.id, `Resolved emergency SOS for officer (ID: ${id})`);
    res.json({ success: true, message: 'Emergency SOS resolved successfully.' });
  } catch (error) {
    console.error('Error resolving officer SOS:', error);
    res.status(500).json({ error: 'Failed to resolve emergency SOS.' });
  }
});

// GET /api/evidence
router.get('/evidence', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  try {
    const evidence = db.prepare(`
      SELECT e.id, e.officer_id as officerId, u.name as officerName, e.incident_id as incidentId, 
             e.description, e.file_path as filePath, e.hash, 
             e.location_lat as locationLat, e.location_lng as locationLng, e.timestamp
      FROM evidence e
      LEFT JOIN users u ON e.officer_id = u.id
      ORDER BY e.timestamp DESC
    `).all() as any[];

    res.json(evidence);
  } catch (error) {
    console.error('Error fetching evidence:', error);
    res.status(500).json({ error: 'Failed to retrieve evidence.' });
  }
});

export default router;
