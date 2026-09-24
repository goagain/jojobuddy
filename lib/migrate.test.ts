import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pingMongo: vi.fn(),
  closeMongo: vi.fn(),
  ensureAuthIndexes: vi.fn(),
  ensureRootBootstrap: vi.fn(),
  ensureEntityIndexes: vi.fn(),
  ensureWorkIndexes: vi.fn(),
  ensureCraftIndexes: vi.fn(),
  ensureLlmIndexes: vi.fn(),
}));

vi.mock("./db", () => ({
  pingMongo: mocks.pingMongo,
  closeMongo: mocks.closeMongo,
}));

vi.mock("./auth", () => ({
  ensureAuthIndexes: mocks.ensureAuthIndexes,
  ensureRootBootstrap: mocks.ensureRootBootstrap,
}));

vi.mock("./entity-store", () => ({
  ensureEntityIndexes: mocks.ensureEntityIndexes,
}));

vi.mock("./work-store", () => ({
  ensureWorkIndexes: mocks.ensureWorkIndexes,
}));

vi.mock("./craft-store", () => ({
  ensureCraftIndexes: mocks.ensureCraftIndexes,
}));

vi.mock("./llm-store", () => ({
  ensureIndexes: mocks.ensureLlmIndexes,
}));

async function loadMigrate() {
  return import("./migrate");
}

describe("runMigrations", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.pingMongo.mockReset();
    mocks.closeMongo.mockReset();
    mocks.ensureAuthIndexes.mockReset();
    mocks.ensureRootBootstrap.mockReset();
    mocks.ensureEntityIndexes.mockReset();
    mocks.ensureWorkIndexes.mockReset();
    mocks.ensureCraftIndexes.mockReset();
    mocks.ensureLlmIndexes.mockReset();
    mocks.pingMongo.mockResolvedValue({ ok: true });
    mocks.closeMongo.mockResolvedValue(undefined);
    mocks.ensureAuthIndexes.mockResolvedValue(undefined);
    mocks.ensureRootBootstrap.mockResolvedValue(undefined);
    mocks.ensureEntityIndexes.mockResolvedValue(undefined);
    mocks.ensureWorkIndexes.mockResolvedValue(undefined);
    mocks.ensureCraftIndexes.mockResolvedValue(undefined);
    mocks.ensureLlmIndexes.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for mongo, then creates indexes and bootstraps root", async () => {
    const order: string[] = [];
    mocks.pingMongo.mockImplementation(async () => {
      order.push("ping");
      return { ok: true };
    });
    mocks.ensureAuthIndexes.mockImplementation(async () => {
      order.push("auth");
    });
    mocks.ensureRootBootstrap.mockImplementation(async () => {
      order.push("root");
    });
    mocks.ensureEntityIndexes.mockImplementation(async () => {
      order.push("entity");
    });
    mocks.ensureWorkIndexes.mockImplementation(async () => {
      order.push("work");
    });
    mocks.ensureCraftIndexes.mockImplementation(async () => {
      order.push("craft");
    });
    mocks.ensureLlmIndexes.mockImplementation(async () => {
      order.push("llm");
    });

    const { runMigrations } = await loadMigrate();
    await runMigrations();

    expect(order.slice(0, 3)).toEqual(["ping", "auth", "root"]);
    expect(order).toEqual(expect.arrayContaining(["entity", "work", "craft", "llm"]));
    expect(mocks.closeMongo).not.toHaveBeenCalled();
  });

  it("retries until mongo is reachable, then runs once", async () => {
    mocks.pingMongo
      .mockResolvedValueOnce({ ok: false, error: "ECONNREFUSED" })
      .mockResolvedValueOnce({ ok: false, error: "ECONNREFUSED" })
      .mockResolvedValue({ ok: true });

    const { waitForMongo } = await loadMigrate();
    await waitForMongo({ timeoutMs: 1_000, intervalMs: 1 });

    expect(mocks.pingMongo).toHaveBeenCalledTimes(3);
    expect(mocks.closeMongo).toHaveBeenCalledTimes(2);
  });

  it("fails after the mongo wait timeout", async () => {
    mocks.pingMongo.mockResolvedValue({ ok: false, error: "offline" });
    const { waitForMongo } = await loadMigrate();
    await expect(waitForMongo({ timeoutMs: 20, intervalMs: 5 })).rejects.toThrow(
      "MongoDB not ready: offline",
    );
    expect(mocks.closeMongo).toHaveBeenCalled();
  });
});
