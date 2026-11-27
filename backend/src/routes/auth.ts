import express, { Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db, { getActiveDistrictId } from '../config/db';
import { AuditService } from '../services/audit/AuditService';
import { authenticateJWT, AuthenticatedRequest, JWT_SECRET } from '../middleware/authMiddleware';
import { UserRole } from '../types';

const router = express.Router();

interface UserDbRow {
  id: string;
  badge_number: string;
  pin_hash: string;
  name: string;
  role: UserRole;
  status: string;
  battery: number;
  team_id: string | null;
  district_id: string;
}

// POST /api/auth/login
router.post('/login', (req: express.Request, res: express.Response) => {
  const rawBadge = typeof req.body?.badgeNumber === 'string' ? req.body.badgeNumber.trim() : '';
  const pin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';

  if (!rawBadge || !pin) {
    return res.status(400).json({ error: 'Badge number and PIN are required.' });
  }

  try {
    const user = db.prepare(`
      SELECT id, badge_number, pin_hash, name, role, status, battery, team_id, district_id
      FROM users WHERE LOWER(badge_number) = LOWER(?)
    `).get(rawBadge) as UserDbRow | undefined;

    if (!user) {
      AuditService.log(null, `Failed login attempt: Invalid badge number "${rawBadge}"`, req.ip || null);
      return res.status(401).json({ error: 'Invalid badge number or PIN.' });
    }

    const isMatch = bcrypt.compareSync(pin, user.pin_hash);
    if (!isMatch) {
      AuditService.log(null, `Failed login attempt: Incorrect PIN for badge "${rawBadge}"`, req.ip || null, user.district_id);
      return res.status(401).json({ error: 'Invalid badge number or PIN.' });
    }

    const initialStatus = 'Available';
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run(initialStatus, user.id);

    const effectiveDistrictId = user.id === 'u_disp1' ? getActiveDistrictId() : user.district_id;
    const district = db.prepare('SELECT id, code, name FROM districts WHERE id = ?').get(effectiveDistrictId) as
      | { id: string; code: string; name: string }
      | undefined;

    const token = jwt.sign(
      {
        id: user.id,
        badgeNumber: user.badge_number,
        role: user.role,
        name: user.name,
        teamId: user.team_id,
        districtId: effectiveDistrictId
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    AuditService.log(user.id, `User logged in successfully: ${user.name} (${user.role})`, req.ip || null, effectiveDistrictId);

    res.json({
      token,
      user: {
        id: user.id,
        badgeNumber: user.badge_number,
        name: user.name,
        role: user.role,
        status: initialStatus,
        battery: user.battery,
        teamId: user.team_id,
        districtId: effectiveDistrictId,
        districtName: district?.name || 'District Hub',
        districtCode: district?.code || 'ELR'
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal tactical server error.' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  try {
    const user = db.prepare(`
      SELECT u.id, u.badge_number as badgeNumber, u.name, u.role, u.status, u.battery,
             u.team_id as teamId, u.district_id as districtId,
             d.name as districtName, d.code as districtCode
      FROM users u
      LEFT JOIN districts d ON u.district_id = d.id
      WHERE u.id = ?
    `).get(req.user.id) as any;

    if (!user) {
      return res.status(404).json({ error: 'User profile not found.' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Auth check error:', error);
    res.status(500).json({ error: 'Internal database error.' });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  try {
    db.prepare("UPDATE users SET status = 'Offline' WHERE id = ?").run(req.user.id);
    AuditService.log(req.user.id, `User logged out: ${req.user.name}`, req.ip || null, req.user.districtId);
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal database error.' });
  }
});

export default router;
