import { closeMongo } from "../lib/db";
import { runMigrations } from "../lib/migrate";

const started = Date.now();
console.log("[migrate] starting");
try {
  await runMigrations();
  console.log(`[migrate] done in ${Date.now() - started}ms`);
} catch (error) {
  console.error("[migrate] failed", error);
  process.exitCode = 1;
} finally {
  await closeMongo();
}
