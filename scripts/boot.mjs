import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const args = process.argv.slice(2).filter((item) => item !== "--prod");
const prod = process.argv.includes("--prod");
const envRole = process.env.JOJOBUDDY_ROLE;
const argRole = args.find((item) => item === "web" || item === "worker");

async function chooseRole() {
  if (argRole) return argRole;
  if (envRole === "web" || envRole === "worker") return envRole;
  if (!process.stdin.isTTY) return "web";

  console.log("");
  console.log("JoJobuddy 启动角色");
  console.log("  1) web     界面与 API");
  console.log("  2) worker  后台任务（解析 URL / 改简历 / JS 引擎）");
  const rl = createInterface({ input, output });
  const answer = (await rl.question("选择 1 或 2: ")).trim().toLowerCase();
  rl.close();
  if (answer === "2" || answer === "worker") return "worker";
  return "web";
}

const role = await chooseRole();
process.env.JOJOBUDDY_ROLE = role;
console.log(`\n以 ${role} 角色启动…\n`);

const command =
  role === "worker"
    ? ["npx", "tsx", "worker/index.ts"]
    : prod
      ? ["npx", "next", "start"]
      : ["npx", "next", "dev", "--turbopack"];

const child = spawn(command[0], command.slice(1), {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
