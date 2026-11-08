import 'dotenv/config';
import { z } from 'zod';

/**
 * All configuration comes from environment variables and is validated once at startup.
 * A missing or malformed variable fails fast with a clear message instead of failing later at runtime.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  LLM_PROVIDER: z.enum(['fake', 'sarvam']).default('fake'),
  SARVAM_API_KEY: z.string().optional(),
  SARVAM_MODEL: z.string().default('sarvam-105b'),
  LLM_COST_PER_1K_TOKENS_INR: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : undefined))
    .pipe(z.number().nonnegative().optional()),
  REFUND_AGENT_LIMIT_INR: z.coerce.number().nonnegative().default(2000),
  // How often the background worker looks for new tickets to triage.
  WORKER_POLL_MS: z.coerce.number().int().positive().default(3000),
});

export type Config = z.infer<typeof EnvSchema>;

function loadConfig(): Config {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const cfg = parsed.data;
  if (cfg.LLM_PROVIDER === 'sarvam' && !cfg.SARVAM_API_KEY) {
    throw new Error('LLM_PROVIDER=sarvam requires SARVAM_API_KEY');
  }
  return cfg;
}

export const config = loadConfig();

/** CORS_ORIGIN may hold several comma-separated origins (e.g. production + preview). */
export const corsOrigins = config.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
