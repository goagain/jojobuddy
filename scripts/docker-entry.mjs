#!/usr/bin/env node
import { spawn } from "node:child_process";

/**
 * JOJOBUDDY_ROLE:
 *   web     → Next only (no indexes)
 *   worker  → background worker only (no indexes)
 *   migrate → one-shot indexes / bootstrap, then exit
 *   unset / both / all → migrate, then web + one worker in the same container
 */
const roleEnv = (process.env.JOJOBUDDY_ROLE ?? "").trim().toLowerCase();

const webCmd = ["npx", "next", "start"];
const workerCmd = ["npx", "tsx", "worker/index.ts"];
const migrateCmd = ["npx", "tsx", "scripts/migrate.ts"];

function start(name, command, role) {
  console.log(`[docker] starting ${name}`);
  return {
    name,
    child: spawn(command[0], command.slice(1), {
      stdio: "inherit",
      shell: false,
      env: { ...process.env, JOJOBUDDY_ROLE: role },
    }),
  };
}

function waitForExit(child) {
  return new Promise((resolve) => {
    child.on("exit", (code, signal) => {
      resolve({ code: code ?? 0, signal });
    });
  });
}

/** @type {{ name: string; child: import("node:child_process").ChildProcess }[]} */
let children = [];
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

function watchChildren() {
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
}

async function runMigrate() {
  const proc = start("migrate", migrateCmd, "migrate");
  children = [proc];
  const { code, signal } = await waitForExit(proc.child);
  children = [];
  if (signal) process.exit(0);
  if (code !== 0) {
    console.error(`[docker] migrate failed code=${code}`);
    process.exit(code);
  }
}

async function main() {
  if (roleEnv === "web") {
    children = [start("web", webCmd, "web")];
    watchChildren();
    return;
  }
  if (roleEnv === "worker") {
    children = [start("worker", workerCmd, "worker")];
    watchChildren();
    return;
  }
  if (roleEnv === "migrate") {
    children = [start("migrate", migrateCmd, "migrate")];
    watchChildren();
    return;
  }

  if (roleEnv && roleEnv !== "both" && roleEnv !== "all") {
    console.warn(`[docker] unknown JOJOBUDDY_ROLE="${roleEnv}", falling back to migrate+web+worker`);
  } else {
    console.log("[docker] JOJOBUDDY_ROLE unset — migrate, then web + one worker");
  }
  await runMigrate();
  children = [start("web", webCmd, "web"), start("worker", workerCmd, "worker")];
  watchChildren();
}

void main();
