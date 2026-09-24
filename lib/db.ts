import { MongoClient, type Db, type MongoClientOptions } from "mongodb";

const uri = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/jojobuddy";

type GlobalMongo = typeof globalThis & {
  _jojobuddyMongo?: Promise<MongoClient>;
  _jojobuddyClient?: MongoClient;
};

export function mongoClientOptions(): MongoClientOptions {
  const maxPoolSize = Math.max(1, Number(process.env.MONGODB_MAX_POOL_SIZE) || 20);
  return {
    appName: process.env.JOJOBUDDY_ROLE || "jojobuddy",
    maxPoolSize,
    minPoolSize: 0,
    maxIdleTimeMS: 30_000,
    waitQueueTimeoutMS: 10_000,
    serverSelectionTimeoutMS: 10_000,
  };
}

function getClientPromise(): Promise<MongoClient> {
  const globalWithMongo = globalThis as GlobalMongo;
  if (!globalWithMongo._jojobuddyMongo) {
    const client = new MongoClient(uri, mongoClientOptions());
    globalWithMongo._jojobuddyClient = client;
    globalWithMongo._jojobuddyMongo = client.connect();
  }
  return globalWithMongo._jojobuddyMongo;
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db();
}

export async function closeMongo(): Promise<void> {
  const globalWithMongo = globalThis as GlobalMongo;
  const client = globalWithMongo._jojobuddyClient;
  globalWithMongo._jojobuddyClient = undefined;
  globalWithMongo._jojobuddyMongo = undefined;
  if (client) await client.close();
}

export async function pingMongo(): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "MongoDB connection failed",
    };
  }
}
