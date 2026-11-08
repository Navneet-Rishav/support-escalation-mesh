import pino from 'pino';
import { config } from '../config.js';

export const logger = pino({
  level: config.NODE_ENV === 'test' ? 'silent' : (process.env.LOG_LEVEL ?? 'info'),
  // Never log credentials or tokens, even by accident.
  redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.passwordHash', '*.token'],
  transport: config.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
});
