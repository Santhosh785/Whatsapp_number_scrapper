import { MongoClient, Db, Collection } from 'mongodb';
import type { Lead, Source, SyncRun, WaSessionState } from './types';

const uri = process.env.ENGINE_MONGO_URL;

if (!uri) {
  throw new Error('ENGINE_MONGO_URL is not set. Copy .env.example to .env.local and fill it in.');
}

/**
 * Serverless functions are re-invoked constantly and each invocation would
 * otherwise open a fresh pool. Cache the client on globalThis so warm
 * invocations (and Next.js dev hot-reloads) reuse one connection.
 */
declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

const clientPromise: Promise<MongoClient> =
  global._mongoClientPromise ??
  (global._mongoClientPromise = new MongoClient(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 15_000,
  }).connect());

export async function getDb(): Promise<Db> {
  const client = await clientPromise;
  return client.db();
}

export async function collections(): Promise<{
  leads: Collection<Lead>;
  sources: Collection<Source>;
  syncRuns: Collection<SyncRun>;
  waSession: Collection<WaSessionState>;
}> {
  const db = await getDb();
  return {
    leads: db.collection<Lead>('leads'),
    sources: db.collection<Source>('sources'),
    syncRuns: db.collection<SyncRun>('sync_runs'),
    waSession: db.collection<WaSessionState>('wa_session_state'),
  };
}

/**
 * Idempotent index creation. Called once per cold start from the sync path and
 * from the setup script; `createIndex` is a no-op when the index already exists.
 */
export async function ensureIndexes(): Promise<void> {
  const { leads, sources, syncRuns } = await collections();
  await Promise.all([
    leads.createIndex({ phone: 1 }),
    leads.createIndex({ 'sources.sourceId': 1 }),
    leads.createIndex({ 'sources.type': 1 }),
    leads.createIndex({ firstSeenAt: -1 }),
    leads.createIndex({ lastSeenAt: -1 }),
    leads.createIndex({ name: 'text', phone: 'text' }),
    sources.createIndex({ type: 1 }),
    syncRuns.createIndex({ queuedAt: -1 }),
    syncRuns.createIndex({ status: 1, queuedAt: -1 }),
  ]);
}
