import express, { Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../config/db';
import { AuditService } from '../services/audit/AuditService';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/authMiddleware';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'tactical_secret_key';

// User structure returned by SQLite query
interface UserDbRow {
  id: string;
  badge_number: string;
  pin_hash: string;
  name: string;
  role: 'officer' | 'dispatcher';
  status: string;
  battery: number;
  team_id: string | null;
}

// POST /api/auth/login
router.post('/login', (req: express.Request, res: express.Response) => {
  const { badgeNumber, pin } = req.body;

  if (!badgeNumber || !pin) {
    return res.status(400).json({ error: 'Badge number and PIN are required.' });
  }

  try {
    const user = db.prepare('SELECT id, badge_number, pin_hash, name, role, status, battery, team_id FROM users WHERE badge_number = ?').get(badgeNumber) as UserDbRow | undefined;

    if (!user) {
      AuditService.log(null, `Failed login attempt: Invalid badge number "${badgeNumber}"`);
      return res.status(401).json({ error: 'Invalid badge number or PIN.' });
    }

    const isMatch = bcrypt.compareSync(pin, user.pin_hash);
    if (!isMatch) {
      AuditService.log(null, `Failed login attempt: Incorrect PIN for badge "${badgeNumber}"`);
      return res.status(401).json({ error: 'Invalid badge number or PIN.' });
    }

    // Update status to 'Available' (or Dispatcher equivalent) upon logging in
    const initialStatus = user.role === 'dispatcher' ? 'Available' : 'Available';
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run(initialStatus, user.id);

    // Sign JWT
    const token = jwt.sign(
      { id: user.id, badgeNumber: user.badge_number, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    AuditService.log(user.id, `User logged in successfully: ${user.name} (${user.role})`);

    res.json({
      token,
      user: {
        id: user.id,
        badgeNumber: user.badge_number,
        name: user.name,
        role: user.role,
        status: initialStatus,
        battery: user.battery,
        teamId: user.team_id
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
    const user = db.prepare('SELECT id, badge_number as badgeNumber, name, role, status, battery, team_id as teamId FROM users WHERE id = ?').get(req.user.id) as any;
    
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
    // Transition status to Offline
    db.prepare("UPDATE users SET status = 'Offline' WHERE id = ?").run(req.user.id);
    
    AuditService.log(req.user.id, `User logged out: ${req.user.name}`);
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal database error.' });
  }
});

export default router;
