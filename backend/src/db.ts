import mongoose from 'mongoose';
import { logger } from './lib/logger.js';

export async function connectDb(uri: string): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  logger.info({ db: mongoose.connection.name }, 'MongoDB connected');
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
