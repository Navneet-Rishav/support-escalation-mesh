import { MongoMemoryServer } from 'mongodb-memory-server';

/** Starts an in-memory MongoDB for local development. Data is lost on restart. */
export async function startMemoryDb(): Promise<string> {
  const mongod = await MongoMemoryServer.create();
  return mongod.getUri('mesh');
}
