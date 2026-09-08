// PipeMind —— 生产模式启动（需先构建：npm run build）
// 依次拉起后端(dist/main.js)与前端(next start)
import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { IS_WIN, BACKEND, FRONTEND } from "../installer/lib/common.mjs";

const backendDist = join(BACKEND, "dist", "main.js");
const nextDir = join(FRONTEND, ".next");

if (!existsSync(backendDist) || !existsSync(join(nextDir, "BUILD_ID"))) {
  console.error("尚未构建，请先执行: npm run build");
  process.exit(1);
}

const children = [];
function log(prefix, text) {
  for (const line of String(text).split(/\r?\n/)) {
    if (line.trim()) console.log(`[${prefix}] ${line}`);
  }
}
function live(prefix, cmd, args, cwd, env = {}) {
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (d) => log(prefix, d));
  child.stderr.on("data", (d) => log(prefix, d));
  child.on("exit", (code) => log(prefix, `进程退出 code=${code}`));
  children.push(child);
  return child;
}

live("backend", process.execPath, ["dist/main.js"], BACKEND, { PORT: process.env.PORT ?? "3001" });
const nextBin = join(FRONTEND, "node_modules", "next", "dist", "bin", "next");
live("frontend", process.execPath, [nextBin, "start", "-p", process.env.FRONTEND_PORT ?? "3000"], FRONTEND);

console.log("\nPipeMind 已启动：\n  后端 API: http://localhost:3001/api\n  前端应用: http://localhost:3000\n");

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
