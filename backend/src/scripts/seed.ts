import { config } from '../config.js';
import { connectDb, disconnectDb } from '../db.js';
import { logger } from '../lib/logger.js';
import { getLlmProvider } from '../llm/index.js';
import { EvalRun } from '../models/EvalRun.js';
import { Ticket } from '../models/Ticket.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { evaluateAll } from '../evals/runner.js';
import { computeMetrics } from '../evals/metrics.js';
import { DEMO_TICKETS, upsertDemoCatalog } from '../services/demoData.js';
import { createTicket, processNextTicket } from '../services/triage.js';
import { seedUsers } from './seedUsers.js';

/**
 * Seeds demo data: customers, orders, demo users, sample tickets (triaged right away),
 * and one eval run per prompt version with the configured provider.
 * Usage: npm run seed            (adds data)
 *        npm run seed -- --reset (clears tickets, audit events and eval runs first)
 */
async function main() {
  await connectDb(config.MONGODB_URI);
  if (process.argv.includes('--reset')) {
    await Promise.all([Ticket.deleteMany({}), AuditEvent.deleteMany({}), EvalRun.deleteMany({})]);
    logger.info('cleared tickets, audit events and eval runs');
  }
  await upsertDemoCatalog();
  await seedUsers();

  for (const t of DEMO_TICKETS) await createTicket(t);
  let triaged = 0;
  while (await processNextTicket()) triaged++;
  logger.info({ triaged }, 'demo tickets created and triaged');

  const llm = getLlmProvider();
  for (const promptVersion of ['v1', 'v2'] as const) {
    const results = await evaluateAll(llm, promptVersion);
    await EvalRun.create({
      label: `${llm.name}/${llm.model} · prompt ${promptVersion} (seed)`,
      promptVersion,
      provider: llm.name,
      model: llm.model,
      status: 'completed',
      createdByName: 'seed script',
      results,
      metrics: computeMetrics(results, config.LLM_COST_PER_1K_TOKENS_INR),
      finishedAt: new Date(),
    });
  }
  logger.info('eval runs seeded');
  await disconnectDb();
}

main().catch(async (err) => {
  logger.error({ err }, 'seed failed');
  await disconnectDb();
  process.exit(1);
});
