import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { pinoHttp } from 'pino-http';
import { config, corsOrigins } from './config.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { requireAuth } from './middleware/auth.js';
import { getLlmProvider } from './llm/index.js';
import { PROMPT_VERSIONS } from './agents/prompts.js';
import { CURRENT_PROMPT_VERSION } from './services/triage.js';
import { authRouter } from './routes/auth.js';
import { intakeRouter } from './routes/intake.js';
import { ticketsRouter } from './routes/tickets.js';
import { evalsRouter } from './routes/evals.js';

const REQUEST_ID_RE = /^[\w-]{1,64}$/;

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Render sits behind one proxy; needed for correct client IPs in rate limiting.

  app.use(helmet());
  app.use(
    cors({
      origin: corsOrigins,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  // Every request gets an ID (reused from the X-Request-Id header if valid), logged and echoed back.
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && REQUEST_ID_RE.test(incoming) ? incoming : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === '/healthz' },
    }),
  );

  app.get('/healthz', (_req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    // Render sets RENDER_GIT_COMMIT; exposing the short SHA makes it easy to check which build is live.
    const commit = process.env.RENDER_GIT_COMMIT?.slice(0, 7);
    // Helmet sends Cross-Origin-Resource-Policy: same-origin, which stops other sites (e.g. the
    // portfolio's status dot) from even pinging this. Health is public, so relax it here only.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res
      .status(dbUp ? 200 : 503)
      .json({ status: dbUp ? 'ok' : 'degraded', db: dbUp ? 'up' : 'down', ...(commit ? { commit } : {}) });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/intake', intakeRouter);
  app.use('/api/tickets', ticketsRouter);
  app.use('/api/evals', evalsRouter);

  /** Lets the console show which model and guardrail settings are active. */
  app.get('/api/meta', requireAuth, (_req, res) => {
    const llm = getLlmProvider();
    res.json({
      provider: llm.name,
      model: llm.model,
      promptVersion: CURRENT_PROMPT_VERSION,
      promptVersions: PROMPT_VERSIONS,
      refundAgentLimitInr: config.REFUND_AGENT_LIMIT_INR,
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
