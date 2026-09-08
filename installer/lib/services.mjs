// PipeMind Installer —— 服务生命周期管理（后端/前端子进程）
import { join } from "node:path";
import { BACKEND, FRONTEND, spawnLive, killTree } from "./common.mjs";

const LOG_CAP = 500;

export class Services {
  constructor() {
    this.backend = null;
    this.frontend = null;
    this.logs = [];
  }

  pushLog(text, level = "info") {
    this.logs.push({ t: new Date().toISOString(), level, text });
    if (this.logs.length > LOG_CAP) this.logs.splice(0, this.logs.length - LOG_CAP);
  }

  startBackend({ port = 3001, cwd = BACKEND, extraEnv = {} } = {}) {
    if (this.backend && this.backend.exitCode === null) return this.backend;
    const child = spawnLive(process.execPath, ["dist/main.js"], {
      cwd,
      env: { ...process.env, PORT: String(port), ...extraEnv },
      onLine: (line, level) => this.pushLog(`[backend] ${line}`, level),
    });
    child.on("close", (code) => this.pushLog(`[backend] 进程退出 code=${code}`, "warn"));
    this.backend = child;
    return child;
  }

  startFrontend({ port = 3000, cwd = FRONTEND } = {}) {
    if (this.frontend && this.frontend.exitCode === null) return this.frontend;
    const nextBin = join(cwd, "node_modules", "next", "dist", "bin", "next");
    const child = spawnLive(process.execPath, [nextBin, "start", "-p", String(port), "-H", "127.0.0.1"], {
      cwd,
      env: { ...process.env },
      onLine: (line, level) => this.pushLog(`[frontend] ${line}`, level),
    });
    child.on("close", (code) => this.pushLog(`[frontend] 进程退出 code=${code}`, "warn"));
    this.frontend = child;
    return child;
  }

  stop() {
    killTree(this.backend);
    killTree(this.frontend);
    this.backend = null;
    this.frontend = null;
  }

  snapshot() {
    const alive = (c) => !!(c && c.exitCode === null);
    return {
      backendRunning: alive(this.backend),
      frontendRunning: alive(this.frontend),
      backendPid: this.backend && alive(this.backend) ? this.backend.pid : null,
      frontendPid: this.frontend && alive(this.frontend) ? this.frontend.pid : null,
    };
  }

  tailLogs(fromIndex = 0) {
    return this.logs.slice(fromIndex);
  }
}
