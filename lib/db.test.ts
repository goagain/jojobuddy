import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FakeDb = {
  command: (cmd: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

class FakeMongoClient {
  static instances: FakeMongoClient[] = [];

  options: Record<string, unknown>;
  inUse = 0;
  peak = 0;
  checkouts = 0;
  closed = false;

  constructor(_uri: string, options: Record<string, unknown> = {}) {
    this.options = options;
    FakeMongoClient.instances.push(this);
  }

  static reset() {
    FakeMongoClient.instances = [];
  }

  async connect() {
    return this;
  }

  db(): FakeDb {
    return {
      command: async () => {
        this.inUse += 1;
        this.checkouts += 1;
        this.peak = Math.max(this.peak, this.inUse);
        await new Promise((resolve) => setTimeout(resolve, 15));
        this.inUse -= 1;
        return { ok: 1 };
      },
    };
  }

  async close() {
    this.closed = true;
    this.inUse = 0;
  }
}

vi.mock("mongodb", () => ({
  MongoClient: FakeMongoClient,
}));

async function loadDb() {
  return import("./db");
}

describe("mongo connection pool", () => {
  const previousPool = process.env.MONGODB_MAX_POOL_SIZE;
  const previousRole = process.env.JOJOBUDDY_ROLE;

  beforeEach(() => {
    FakeMongoClient.reset();
    process.env.MONGODB_MAX_POOL_SIZE = "4";
    process.env.JOJOBUDDY_ROLE = "web";
    vi.resetModules();
  });

  afterEach(async () => {
    const { closeMongo } = await loadDb();
    await closeMongo();
    if (previousPool === undefined) delete process.env.MONGODB_MAX_POOL_SIZE;
    else process.env.MONGODB_MAX_POOL_SIZE = previousPool;
    if (previousRole === undefined) delete process.env.JOJOBUDDY_ROLE;
    else process.env.JOJOBUDDY_ROLE = previousRole;
  });

  it("reuses one client and returns sockets after concurrent commands", async () => {
    const { getDb, pingMongo, mongoClientOptions } = await loadDb();
    const options = mongoClientOptions();
    expect(options.maxPoolSize).toBe(4);
    expect(options.maxIdleTimeMS).toBe(30_000);
    expect(options.minPoolSize).toBe(0);

    await getDb();
    await getDb();
    expect(FakeMongoClient.instances).toHaveLength(1);

    const results = await Promise.all([pingMongo(), pingMongo(), pingMongo()]);
    expect(results.every((item) => item.ok)).toBe(true);

    const client = FakeMongoClient.instances[0];
    expect(client.checkouts).toBe(3);
    expect(client.peak).toBeGreaterThan(1);
    expect(client.peak).toBeLessThanOrEqual(4);
    expect(client.inUse).toBe(0);
    expect(client.closed).toBe(false);
  });

  it("closeMongo releases the client so the next call can reconnect", async () => {
    const { pingMongo, closeMongo } = await loadDb();
    expect((await pingMongo()).ok).toBe(true);
    const first = FakeMongoClient.instances[0];
    expect(first.closed).toBe(false);
    expect(first.inUse).toBe(0);

    await closeMongo();
    expect(first.closed).toBe(true);
    expect(first.inUse).toBe(0);

    expect((await pingMongo()).ok).toBe(true);
    expect(FakeMongoClient.instances).toHaveLength(2);
    expect(FakeMongoClient.instances[1].closed).toBe(false);
    expect(FakeMongoClient.instances[1].inUse).toBe(0);
  });
});
