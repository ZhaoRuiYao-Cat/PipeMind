#!/usr/bin/env node
// PipeMind Installer —— 本地安装向导服务
// 零运行时依赖：仅使用 Node 内置模块，静态资源取自 installer/dist。
// 启动：node installer/server.mjs [--port 4200] [--open|--no-open]
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { spawn } from "node:child_process";
import { readJson, UI_DIR, DEFAULT_PORT, IS_WIN, readEnvMap, BACKEND, FRONTEND, RUNTIME_FILE, httpGet, wait } from "./lib/common.mjs";
import { runChecks } from "./lib/checks.mjs";
import { InstallJob, services, isInstalled, STEPS } from "./lib/installer.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] ?? fallback : fallback;
};
const has = (name) => args.includes(name);
const PORT = Number(flag("--port", String(DEFAULT_PORT)));
const OPEN_BROWSER = has("--no-open") ? false : has("--open");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".map": "application/json",
};

function sendJson(res, code, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendFile(res, filePath) {
  const data = readFileSync(filePath);
  const type = MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": filePath.includes("index.html") ? "no-store" : "public, max-age=3600",
    "Content-Length": data.length,
  });
  res.end(data);
}

async function pollHealth(url, okFn, tries, intervalMs) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await httpGet(url, 2500);
      if (okFn(res.status)) return true;
    } catch {
      /* 未就绪，继续重试 */
    }
    await wait(intervalMs);
  }
  return false;
}

async function readBody(req) {
  return new Promise((resolvePromise, rejectPromise) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 2 * 1024 * 1024) {
        rejectPromise(new Error("body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolvePromise(data ? JSON.parse(data) : {});
      } catch {
        rejectPromise(new Error("invalid json"));
      }
    });
    req.on("error", rejectPromise);
  });
}

function metaPayload() {
  const installed = isInstalled();
  const snap = services.snapshot();
  return {
    name: "PipeMind",
    installed,
    running: snap.backendRunning || snap.frontendRunning,
    backendRunning: snap.backendRunning,
    frontendRunning: snap.frontendRunning,
    pids: { backend: snap.backendPid, frontend: snap.frontendPid },
    steps: STEPS.map((s) => ({ key: s.key, label: s.label, labelEn: s.labelEn })),
    uiPort: PORT,
    defaultBackendPort: 3001,
    defaultFrontendPort: 3000,
    installLogs: services.tailLogs(),
  };
}

const jobs = new Map();
let activeJob = null;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);

  try {
    // ---------- REST API ----------
    if (pathname === "/api/meta" && req.method === "GET") {
      sendJson(res, 200, metaPayload());
      return;
    }
    if (pathname === "/api/check" && req.method === "GET") {
      const checks = await runChecks();
      sendJson(res, 200, checks);
      return;
    }
    if (pathname === "/api/config" && req.method === "GET") {
      // 预填配置：读取已存在的 backend/.env（若已安装），供重装/二次配置使用
      sendJson(res, 200, { backendEnv: readEnvMap(join(BACKEND, ".env")) });
      return;
    }
    if (pathname === "/api/install" && req.method === "POST") {
      if (activeJob && activeJob.status === "running") {
        sendJson(res, 409, { error: "已有安装任务正在执行" });
        return;
      }
      const opts = await readBody(req);
      const job = new InstallJob(opts);
      jobs.set(job.id, job);
      activeJob = job;
      void job.run().finally(() => {
        if (activeJob === job) activeJob = null;
      });
      sendJson(res, 202, { id: job.id });
      return;
    }
    if (pathname === "/api/install/active" && req.method === "GET") {
      // 进程检测：若存在正在执行/排队/已暂停的安装任务，直接返回供前端跳到终端页
      const j = activeJob;
      if (j && ["queued", "running", "paused"].includes(j.status)) {
        sendJson(res, 200, { active: true, job: j.snapshot() });
      } else {
        sendJson(res, 200, { active: false, job: null });
      }
      return;
    }
    const jobAction = /^\/api\/jobs\/([^/]+)\/(pause|resume)$/.exec(pathname);
    if (jobAction && req.method === "POST") {
      const job = jobs.get(jobAction[1]);
      if (!job) {
        sendJson(res, 404, { error: "job not found" });
        return;
      }
      if (jobAction[2] === "pause") job.pause();
      else job.resume();
      sendJson(res, 200, job.snapshot());
      return;
    }
    const jobMatch = /^\/api\/jobs\/([^/]+)$/.exec(pathname);
    if (jobMatch && req.method === "GET") {
      const job = jobs.get(jobMatch[1]);
      if (!job) {
        sendJson(res, 404, { error: "job not found" });
        return;
      }
      sendJson(res, 200, job.snapshot());
      return;
    }
    if (pathname === "/api/start" && req.method === "POST") {
      const body = await readBody(req);
      const portB = Number(body?.backendPort ?? 3001);
      const portF = Number(body?.frontendPort ?? 3000);
      const snap0 = services.snapshot();
      if (!snap0.backendRunning) services.startBackend({ port: portB });
      if (!snap0.frontendRunning) services.startFrontend({ port: portF });
      // 等待就绪（有真实反馈，避免"点了没反应"）
      const backendReady = await pollHealth(
        `http://127.0.0.1:${portB}/api/auth/public-key`,
        (s) => s === 200,
        120, // 最多 ~60s
        500,
      );
      const frontendReady = await pollHealth(
        `http://127.0.0.1:${portF}`,
        (s) => s >= 200 && s < 500,
        60,
        500,
      );
      const snap = services.snapshot();
      const message = backendReady && frontendReady
        ? "服务已启动"
        : !backendReady && !frontendReady
          ? "后端与前端均未能就绪（请查看上方运行日志）"
          : backendReady
            ? "后端已就绪，前端未能就绪"
            : "前端已就绪，后端未能就绪";
      sendJson(res, 200, {
        ok: true,
        message,
        backendReady,
        frontendReady,
        backendRunning: snap.backendRunning,
        frontendRunning: snap.frontendRunning,
        urls: {
          backend: `http://localhost:${portB}`,
          frontend: `http://localhost:${portF}`,
        },
      });
      return;
    }
    if (pathname === "/api/stop" && req.method === "POST") {
      services.stop();
      sendJson(res, 200, { ok: true });
      return;
    }
    if (pathname === "/api/reset" && req.method === "POST") {
      // 清除缓存重来：取消进行中/暂停中的任务、停止服务，删除安装器生成的配置与运行状态
      // （不动数据库与依赖目录）。任务被取消后，/api/install/active 即返回无活动任务。
      const target = activeJob;
      if (target) {
        target.cancel();
        target.status = "cancelled";
      }
      jobs.clear();
      activeJob = null;
      services.stop();
      const targets = [
        join(BACKEND, ".env"),
        join(FRONTEND, ".env.local"),
        RUNTIME_FILE,
      ];
      for (const file of targets) {
        try {
          if (existsSync(file)) unlinkSync(file);
        } catch {
          /* 忽略单文件清理失败 */
        }
      }
      sendJson(res, 200, { ok: true, cancelled: !!target, installed: isInstalled() });
      return;
    }
    if (pathname === "/api/logs" && req.method === "GET") {
      const from = Number(url.searchParams.get("from") ?? 0);
      sendJson(res, 200, { logs: services.tailLogs(from), total: services.logs.length });
      return;
    }

    // ---------- 静态资源（向导 UI） ----------
    if (req.method === "GET" || req.method === "HEAD") {
      let rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
      const filePath = normalize(resolve(UI_DIR, rel));
      if (!filePath.startsWith(resolve(UI_DIR))) {
        res.writeHead(403).end();
        return;
      }
      if (existsSync(filePath) && statSync(filePath).isFile()) {
        sendFile(res, filePath);
        return;
      }
      // SPA 回退
      const fallback = resolve(UI_DIR, "index.html");
      if (existsSync(fallback)) {
        sendFile(res, fallback);
        return;
      }
      sendJson(res, 404, {
        error: "installer/dist 未构建。请先运行：npm --prefix installer install && npm --prefix installer run build",
      });
      return;
    }
    sendJson(res, 405, { error: "method not allowed" });
  } catch (err) {
    sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  const line = `PipeMind 安装向导已启动： http://localhost:${PORT}`;
  console.log(line);
  if (OPEN_BROWSER) {
    try {
      const opener = IS_WIN ? "cmd" : "xdg-open";
      const oargs = IS_WIN ? ["/c", "start", "", `http://localhost:${PORT}`] : [`http://localhost:${PORT}`];
      const child = spawn(opener, oargs, { stdio: "ignore", windowsHide: true, detached: true });
      child.unref();
    } catch {
      /* 打开浏览器失败不影响服务 */
    }
  }
});

function shutdown() {
  services.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 800).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", () => services.stop());
