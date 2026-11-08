import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { AppError, unauthorized } from '../lib/errors.js';
import { requireAuth, signToken, type AuthUser } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimits.js';
import { parse } from '../middleware/validate.js';
import { User } from '../models/User.js';
import { ensureDemoQueue } from '../services/demoData.js';

export const authRouter = Router();

const BCRYPT_ROUNDS = 10;

const RegisterSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email().max(120),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(128),
});

const DemoSchema = z.object({ role: z.enum(['agent', 'admin']).default('agent') });

export const DEMO_USERS = {
  agent: { name: 'Demo Agent', email: 'demo.agent@mesh.demo', role: 'agent' as const },
  admin: { name: 'Demo Admin', email: 'demo.admin@mesh.demo', role: 'admin' as const },
};

function toAuthUser(u: { _id: unknown; name: string; email: string; role: string }): AuthUser {
  return { id: String(u._id), name: u.name, email: u.email, role: u.role as AuthUser['role'] };
}

function session(user: AuthUser) {
  return { token: signToken(user), user };
}

/** Self-registration always creates an "agent". Admins are created by the seed script only. */
authRouter.post('/register', authLimiter, async (req, res) => {
  const body = parse(RegisterSchema, req.body);
  const exists = await User.exists({ email: body.email.toLowerCase() });
  if (exists) throw new AppError(409, 'CONFLICT', 'An account with this email already exists');
  const user = await User.create({
    name: body.name,
    email: body.email,
    passwordHash: await bcrypt.hash(body.password, BCRYPT_ROUNDS),
    role: 'agent',
  });
  res.status(201).json(session(toAuthUser(user)));
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const body = parse(LoginSchema, req.body);
  const user = await User.findOne({ email: body.email.toLowerCase() }).select('+passwordHash');
  // Same message for unknown email and wrong password, so attackers cannot discover which emails exist.
  if (!user || user.isDemo || !(await bcrypt.compare(body.password, user.passwordHash))) {
    throw unauthorized('Incorrect email or password');
  }
  res.json(session(toAuthUser(user)));
});

/** One-click demo login so reviewers never have to sign up. Demo users have no usable password. */
authRouter.post('/demo', authLimiter, async (req, res) => {
  const { role } = parse(DemoSchema, req.body ?? {});
  const d = DEMO_USERS[role];
  const user =
    (await User.findOne({ email: d.email })) ??
    (await User.create({ ...d, isDemo: true, passwordHash: await bcrypt.hash(crypto.randomUUID(), BCRYPT_ROUNDS) }));
  await ensureDemoQueue();
  res.json(session(toAuthUser(user)));
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});
