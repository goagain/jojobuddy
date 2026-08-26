#!/usr/bin/env node
import { spawn } from "node:child_process";

const role = process.env.JOJOBUDDY_ROLE === "worker" ? "worker" : "web";

const command =
  role === "worker"
    ? ["npx", "tsx", "worker/index.ts"]
    : ["npx", "next", "start"];

console.log(`[docker] starting as ${role}`);

const child = spawn(command[0], command.slice(1), {
  stdio: "inherit",
  shell: false,
  env: process.env,
});

function forward(signal) {
  console.log(`[docker] received ${signal}, forwarding to ${role}`);
  if (!child.killed) child.kill(signal);
}

process.on("SIGTERM", () => forward("SIGTERM"));
process.on("SIGINT", () => forward("SIGINT"));

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(0);
    return;
  }
  process.exit(code ?? 0);
});
