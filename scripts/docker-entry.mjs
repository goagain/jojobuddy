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

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
