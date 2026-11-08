import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import type { Role } from '../models/User.js';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

interface TokenPayload {
  sub: string;
  name: string;
  email: string;
  role: Role;
}

export function signToken(user: AuthUser): string {
  const payload: TokenPayload = { sub: user.id, name: user.name, email: user.email, role: user.role };
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'], algorithm: 'HS256' });
}

/** Requires a valid "Authorization: Bearer <jwt>" header and puts the user on req.user. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw unauthorized();
  try {
    const p = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] }) as TokenPayload;
    req.user = { id: p.sub, name: p.name, email: p.email, role: p.role };
  } catch {
    throw unauthorized('Session expired or invalid. Please log in again.');
  }
  next();
}

/** Role-based access: use after requireAuth, e.g. requireRole('admin'). */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) throw forbidden(`Requires role: ${roles.join(' or ')}`);
    next();
  };
}
