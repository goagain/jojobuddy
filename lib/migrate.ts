import { ensureAuthIndexes, ensureRootBootstrap } from "./auth";
import { ensureCraftIndexes } from "./craft-store";
import { closeMongo, pingMongo } from "./db";
import { ensureEntityIndexes } from "./entity-store";
import { ensureIndexes as ensureLlmIndexes } from "./llm-store";
import { ensureWorkIndexes } from "./work-store";

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_INTERVAL_MS = 1_000;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForMongo(options?: { timeoutMs?: number; intervalMs?: number }) {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = options?.intervalMs ?? DEFAULT_INTERVAL_MS;
  const started = Date.now();
  for (;;) {
    const ping = await pingMongo();
    if (ping.ok) return;
    await closeMongo();
    if (Date.now() - started >= timeoutMs) {
      throw new Error(`MongoDB not ready: ${ping.error ?? "unknown error"}`);
    }
    await delay(intervalMs);
  }
}

export async function runMigrations() {
  await waitForMongo();
  await ensureAuthIndexes();
  await ensureRootBootstrap();
  await Promise.all([
    ensureEntityIndexes(),
    ensureWorkIndexes(),
    ensureCraftIndexes(),
    ensureLlmIndexes(),
  ]);
}
