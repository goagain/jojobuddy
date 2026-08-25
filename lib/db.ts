import { MongoClient, type Db } from "mongodb";

const uri = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/jojobuddy";

type GlobalMongo = typeof globalThis & {
  _jojobuddyMongo?: Promise<MongoClient>;
};

function getClientPromise(): Promise<MongoClient> {
  const globalWithMongo = globalThis as GlobalMongo;
  if (!globalWithMongo._jojobuddyMongo) {
    const client = new MongoClient(uri);
    globalWithMongo._jojobuddyMongo = client.connect();
  }
  return globalWithMongo._jojobuddyMongo;
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db();
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
