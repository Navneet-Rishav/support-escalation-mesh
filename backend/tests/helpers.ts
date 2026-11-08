import { afterAll, beforeAll, beforeEach, inject } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';

/** Connects this test file to its own database and wipes it before each test. */
export function useTestDb() {
  beforeAll(async () => {
    const dbName = `test_${Math.random().toString(36).slice(2, 10)}`;
    await mongoose.connect(inject('mongoUri'), { dbName });
    await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  });
  beforeEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
}

export const app = createApp();

export async function createUser(role: 'agent' | 'admin' = 'agent', name = role === 'admin' ? 'Asha Admin' : 'Ravi Agent') {
  const email = `${name.split(' ')[0].toLowerCase()}.${Math.random().toString(36).slice(2, 6)}@test.dev`;
  await User.create({ name, email, role, passwordHash: await bcrypt.hash('password123', 4) });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
  return { token: res.body.token as string, user: res.body.user as { id: string; name: string; role: string } };
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
