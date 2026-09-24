import { spawn } from "node:child_process";

const args = process.argv.slice(2).filter((item) => item !== "--prod");
const prod = process.argv.includes("--prod");
const envRole = process.env.JOJOBUDDY_ROLE;
const argRole = args.find((item) => item === "web" || item === "worker" || item === "migrate");
const role = argRole || envRole || "all";

const webCmd = prod ? ["npx", "next", "start"] : ["npx", "next", "dev", "--turbopack"];
const workerCmd = ["npx", "tsx", "worker/index.ts"];
const migrateCmd = ["npx", "tsx", "scripts/migrate.ts"];

function start(name, command, childRole) {
  console.log(`[boot] starting ${name}`);
  return {
    name,
    child: spawn(command[0], command.slice(1), {
      stdio: "inherit",
      shell: true,
      env: { ...process.env, JOJOBUDDY_ROLE: childRole },
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
      console.log(`[boot] forwarding ${signal} to ${name}`);
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
        `[boot] ${name} exited` + (signal ? ` signal=${signal}` : ` code=${code ?? 0}`),
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
    console.error(`[boot] migrate failed code=${code}`);
    process.exit(code);
  }
}

async function main() {
  if (role === "web") {
    console.log("\n以 web 角色启动…\n");
    children = [start("web", webCmd, "web")];
    watchChildren();
    return;
  }
  if (role === "worker") {
    console.log("\n以 worker 角色启动…\n");
    children = [start("worker", workerCmd, "worker")];
    watchChildren();
    return;
  }
  if (role === "migrate") {
    console.log("\n以 migrate 角色启动…\n");
    children = [start("migrate", migrateCmd, "migrate")];
    watchChildren();
    return;
  }

  console.log("\n以 migrate → web + worker 启动…\n");
  await runMigrate();
  children = [start("web", webCmd, "web"), start("worker", workerCmd, "worker")];
  watchChildren();
}

void main();
