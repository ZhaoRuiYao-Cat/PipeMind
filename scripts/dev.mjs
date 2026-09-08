// PipeMind —— 开发模式：同时启动后端(NestJS watch)与前端(Next dev)
import { spawn } from "node:child_process";
import { IS_WIN, npmCmd } from "../installer/lib/common.mjs";
import { BACKEND, FRONTEND } from "../installer/lib/common.mjs";

const children = [];

function log(prefix, text) {
  for (const line of String(text).split(/\r?\n/)) {
    if (line.trim()) console.log(`[${prefix}] ${line}`);
  }
}

function start(prefix, cmd, args, cwd) {
  const child = spawn(cmd, args, {
    cwd,
    shell: IS_WIN && /\.(cmd|bat)$/i.test(cmd),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (d) => log(prefix, d));
  child.stderr.on("data", (d) => log(prefix, d));
  child.on("exit", (code) => log(prefix, `进程退出 code=${code}`));
  children.push(child);
}

start("backend", npmCmd, ["run", "start:dev"], BACKEND);
start("frontend", npmCmd, ["run", "dev"], FRONTEND);

console.log("\nPipeMind 开发环境启动中…\n  后端: http://localhost:3001/api\n  前端: http://localhost:3000\n");

const shutdown = () => {
  for (const child of children) {
    try {
      if (IS_WIN) spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      else child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
  setTimeout(() => process.exit(0), 500).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
