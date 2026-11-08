import type { Request } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { config } from '../config.js';

const handler = (_req: Request, res: import('express').Response) => {
  res.status(429).json({
    error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a bit and try again.', requestId: _req.id },
  });
};

const common = { standardHeaders: 'draft-8' as const, legacyHeaders: false, handler };
const isTest = config.NODE_ENV === 'test';

/** Login/register: slows down password guessing. */
export const authLimiter = rateLimit({ ...common, windowMs: 15 * 60_000, limit: isTest ? 1000 : 30 });

/** Public ticket intake triggers LLM calls, so it is limited per IP. */
export const intakeLimiter = rateLimit({ ...common, windowMs: 15 * 60_000, limit: isTest ? 1000 : 10 });

/** Eval runs make many LLM calls: limited per signed-in user, not per IP. */
export const evalLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60_000,
  limit: isTest ? 1000 : 3,
  keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req.ip ?? ''),
});
