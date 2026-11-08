import { config } from './config.js';
import { connectDb, disconnectDb } from './db.js';
import { createApp } from './app.js';
import { logger } from './lib/logger.js';
import { startWorker } from './services/triage.js';
import { upsertDemoCatalog } from './services/demoData.js';
import { seedUsers } from './scripts/seedUsers.js';

async function main() {
  const inMemory = config.MONGODB_URI === 'memory';
  if (inMemory && config.NODE_ENV === 'production') throw new Error('MONGODB_URI=memory is for local development only');
  // Local development without Docker: an in-memory MongoDB (dev dependency only), seeded on start.
  const uri = inMemory ? await (await import('./scripts/devMemoryDb.js')).startMemoryDb() : config.MONGODB_URI;
  await connectDb(uri);
  if (inMemory) {
    await upsertDemoCatalog();
    await seedUsers();
  }

  const app = createApp();
  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT, llm: config.LLM_PROVIDER }, 'API listening');
  });
  const stopWorker = startWorker();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    stopWorker();
    server.close();
    await disconnectDb();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
