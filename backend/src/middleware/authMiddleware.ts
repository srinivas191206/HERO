import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '../types';

export const JWT_SECRET = process.env.JWT_SECRET || 'tactical_secret_key';

if (!process.env.JWT_SECRET) {
  console.warn('[SECURITY] JWT_SECRET env var not set; using development fallback secret.');
}

export interface AuthTokenPayload {
  id: string;
  badgeNumber: string;
  role: UserRole;
  name: string;
  teamId: string | null;
  districtId: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthTokenPayload;
}

export function verifyJwtToken(token: string): AuthTokenPayload {
  return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
}

export function authenticateJWT(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Security token missing.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    req.user = verifyJwtToken(token);
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Forbidden: Invalid or expired security token.' });
  }
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden: Requires role [${allowedRoles.join(' or ')}].`
      });
    }
    next();
  };
}
