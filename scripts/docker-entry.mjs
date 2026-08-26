#!/usr/bin/env node
import { spawn } from "node:child_process";

/**
 * JOJOBUDDY_ROLE:
 *   web     → Next only
 *   worker  → background worker only
 *   unset / both / all → web + one worker in the same container
 */
const roleEnv = (process.env.JOJOBUDDY_ROLE ?? "").trim().toLowerCase();

const webCmd = ["npx", "next", "start"];
const workerCmd = ["npx", "tsx", "worker/index.ts"];

function start(name, command) {
  console.log(`[docker] starting ${name}`);
  return {
    name,
    child: spawn(command[0], command.slice(1), {
      stdio: "inherit",
      shell: false,
      env: process.env,
    }),
  };
}

/** @type {{ name: string; child: import("node:child_process").ChildProcess }[]} */
let children;
if (roleEnv === "web") {
  children = [start("web", webCmd)];
} else if (roleEnv === "worker") {
  children = [start("worker", workerCmd)];
} else {
  if (roleEnv && roleEnv !== "both" && roleEnv !== "all") {
    console.warn(`[docker] unknown JOJOBUDDY_ROLE="${roleEnv}", falling back to web+worker`);
  } else {
    console.log("[docker] JOJOBUDDY_ROLE unset — running web + one worker");
  }
  children = [start("web", webCmd), start("worker", workerCmd)];
}

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { name, child } of children) {
    if (!child.killed) {
      console.log(`[docker] forwarding ${signal} to ${name}`);
      child.kill(signal);
    }
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

for (const { name, child } of children) {
  child.on("exit", (code, signal) => {
    console.log(
      `[docker] ${name} exited` +
        (signal ? ` signal=${signal}` : ` code=${code ?? 0}`),
    );
    shutdown("SIGTERM");
    if (signal) {
      process.exit(0);
      return;
    }
    process.exit(code ?? 0);
  });
}
