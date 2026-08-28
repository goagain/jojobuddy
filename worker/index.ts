import { claimWork, failWork, finishWork, heartbeat, touchLock, workerId } from "../lib/work-store";
import { runWorkJob } from "../lib/work-handlers";
import { closePlaywrightBrowser } from "../lib/playwright-page";

const IDLE_MS = 800;
let currentJobId: string | null = null;
let draining = false;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function beginDrain(signal: string) {
  if (draining) return;
  draining = true;
  console.log(
    `[worker] ${signal}: drain started (finish current job, stop claiming). id=${workerId()} job=${currentJobId ?? "none"}`,
  );
}

process.on("SIGTERM", () => beginDrain("SIGTERM"));
process.on("SIGINT", () => beginDrain("SIGINT"));

async function loop() {
  console.log(`[worker] ${workerId()} started, waiting for queue`);
  await heartbeat(null);

  heartbeatTimer = setInterval(() => {
    void heartbeat(currentJobId);
    if (currentJobId) void touchLock(currentJobId);
  }, 8000);

  for (;;) {
    if (draining && !currentJobId) {
      console.log(`[worker] drain complete, exiting`);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      await closePlaywrightBrowser();
      process.exit(0);
    }

    try {
      if (draining) {
        await delay(IDLE_MS);
        continue;
      }

      const job = await claimWork();
      if (!job) {
        currentJobId = null;
        await delay(IDLE_MS);
        continue;
      }
      const id = job._id?.toHexString() ?? "";
      currentJobId = id;
      console.log(`[worker] claimed ${job.type} ${id}`);
      await heartbeat(id);
      try {
        const result = await runWorkJob(job);
        await finishWork(id, result);
        console.log(`[worker] done ${id}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Work job failed";
        console.error(`[worker] failed ${id}: ${message}`);
        await failWork(id, message);
      } finally {
        currentJobId = null;
        await heartbeat(null);
      }
    } catch (error) {
      console.error("[worker] loop error", error);
      currentJobId = null;
      await delay(2000);
    }
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

void loop();
