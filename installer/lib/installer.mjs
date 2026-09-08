// PipeMind Installer —— 一键安装编排（Flarum 式分步执行，支持暂停/继续）
import { join, isAbsolute, dirname, resolve } from "node:path";
import { randomUUID, generateKeyPairSync, createPrivateKey, createPublicKey } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import {
  BACKEND,
  FRONTEND,
  RUNTIME_FILE,
  npmCmd,
  run,
  writeEnvFile,
  writeJson,
  mysqlConnect,
  httpGet,
  wait,
  killTree,
  isNonEmpty,
  readEnvMap,
} from "./common.mjs";
import { runChecks, validateOptions } from "./checks.mjs";
import { Services } from "./services.mjs";

export const services = new Services();

export const STEPS = [
  { key: "preflight", label: "环境预检", labelEn: "Preflight" },
  { key: "writeConfig", label: "写入配置", labelEn: "Write config" },
  { key: "backendDeps", label: "安装后端依赖", labelEn: "Backend dependencies" },
  { key: "database", label: "初始化数据库", labelEn: "Initialize database" },
  { key: "backendBuild", label: "编译后端", labelEn: "Build backend" },
  { key: "frontendDeps", label: "安装前端依赖", labelEn: "Frontend dependencies" },
  { key: "frontendBuild", label: "编译前端", labelEn: "Build frontend" },
  { key: "boot", label: "启动服务", labelEn: "Start services" },
];

const LOG_CAP = 600;
const PAUSE_ABORT = "__PAUSE_ABORT__";

function now() {
  return new Date().toISOString();
}

export class InstallJob {
  constructor(opts) {
    this.id = randomUUID();
    this.opts = opts;
    this.status = "queued"; // queued | running | done | error | paused
    this.error = null;
    this.current = -1;
    this.stepState = STEPS.map(() => "pending"); // pending | running | done | error | paused
    this.logs = [];
    this.startedAt = null;
    this.finishedAt = null;
    // 暂停控制
    this.pauseRequested = false;
    this.paused = false;
    this.pendingIndex = 0; // 被打断后需要重新执行的步骤
    this.activeChild = null; // 当前长任务子进程（供暂停时中断）
    this.cancelled = false;
  }

  pushLog(text, level = "info") {
    this.logs.push({ t: now(), level, text });
    if (this.logs.length > LOG_CAP) this.logs.splice(0, this.logs.length - LOG_CAP);
  }

  percent() {
    const done = this.stepState.filter((s) => s === "done").length;
    return Math.round((done / STEPS.length) * 100);
  }

  snapshot() {
    return {
      id: this.id,
      status: this.status,
      paused: this.paused,
      error: this.error,
      current: this.current,
      steps: STEPS.map((s, i) => ({ ...s, state: this.stepState[i] })),
      percent: this.percent(),
      logs: this.logs,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
    };
  }

  // 暂停：请求暂停；正在跑长任务(依赖/编译/启动)时立即中断其子进程
  pause() {
    if (this.status === "done" || this.status === "error") return;
    this.pauseRequested = true;
    this.paused = true;
    if (this.activeChild) {
      killTree(this.activeChild);
      this.activeChild = null;
    }
    this.pushLog("收到暂停请求：当前步骤将被中断，可在准备就绪后继续。", "warn");
  }

  // 取消（清除缓存重来）：终止等待中的暂停/步骤循环，并中断在跑的子进程
  cancel() {
    this.cancelled = true;
    this.pauseRequested = false;
    this.paused = false;
    if (this.activeChild) {
      killTree(this.activeChild);
      this.activeChild = null;
    }
    this.pushLog("任务已取消（清除缓存重来）…", "warn");
  }

  resume() {
    if (!this.pauseRequested && this.status !== "paused") return;
    this.pauseRequested = false;
    this.paused = false;
    this.pushLog("已继续安装…");
    if (this.status === "paused") this.status = "running";
  }

  async run() {
    this.status = "running";
    this.startedAt = now();
    const o = this.opts;
    const steps = [
      () => this.stepPreflight(o),
      () => this.stepWriteConfig(o),
      () => this.stepBackendDeps(),
      () => this.stepDatabase(o),
      () => this.stepBackendBuild(),
      () => this.stepFrontendDeps(),
      () => this.stepFrontendBuild(),
      () => this.stepBoot(o),
    ];
    try {
      let i = 0;
      while (i < steps.length) {
        // 暂停闸门：在步骤边界等待"继续"
        if (this.pauseRequested || this.paused) {
          this.paused = true;
          this.pauseRequested = true;
          this.status = "paused";
          this.current = i;
          if (this.stepState[i] !== "running") {
            this.pushLog(`安装已暂停（将从「${STEPS[i].label}」继续）。`, "warn");
          }
          await this.waitWhilePaused();
          if (this.cancelled) {
            this.status = "cancelled";
            return;
          }
          this.status = "running";
        }
        const completed = await this.execStepSafe(i, steps[i]);
        if (!completed) {
          // 步骤执行中被暂停/取消中断：等待继续后原地重跑，或直接结束
          this.paused = true;
          this.status = "paused";
          this.current = i;
          await this.waitWhilePaused();
          if (this.cancelled) {
            this.status = "cancelled";
            return;
          }
          this.status = "running";
          this.stepState[i] = "pending";
          continue;
        }
        this.stepState[i] = "done";
        i += 1;
      }
      this.status = "done";
      this.current = -1;
    } catch (err) {
      if (this.cancelled) {
        this.status = "cancelled";
      } else {
        this.status = "error";
        this.error = err instanceof Error ? err.message : String(err);
        this.pushLog(`[install] 失败：${this.error}`, "error");
        services.stop();
      }
    } finally {
      this.finishedAt = now();
      this.activeChild = null;
      if (!["done", "error", "cancelled"].includes(this.status)) {
        this.status = "paused";
      }
    }
  }

  async waitWhilePaused() {
    while (this.pauseRequested && !this.cancelled) {
      await wait(400);
    }
    this.paused = false;
    this.pauseRequested = false;
  }

  // 执行单个步骤；若因暂停中断则返回 false
  async execStepSafe(index, fn) {
    this.current = index;
    this.stepState[index] = "running";
    try {
      await fn();
      return true;
    } catch (err) {
      if (this.cancelled) {
        this.stepState[index] = "cancelled";
        throw err;
      }
      if (this.pauseRequested) {
        this.stepState[index] = "paused";
        this.pushLog(`步骤「${STEPS[index].label}」已中断，等待继续…`, "warn");
        return false;
      }
      this.stepState[index] = "error";
      throw err;
    }
  }

  async withChild(fn) {
    return fn();
  }

  // ---------- 各步骤 ----------

  async stepPreflight(o) {
    const problems = validateOptions(o);
    if (problems.length) throw new Error(problems.join("；"));
    const checks = await runChecks();
    if (!checks.ok) {
      throw new Error(
        "环境预检未通过：" + checks.items.filter((i) => !i.ok).map((i) => i.label).join("、"),
      );
    }
    this.pushLog("环境预检通过：Node " + process.version);
  }

  async stepWriteConfig(o) {
    const backendPort = o.backendPort ?? 3001;
    const frontendOrigin = o.frontendOrigin ?? "http://localhost:3000";
    const apiUrl = `http://localhost:${backendPort}/api`;
    const db = o.db ?? {};
    const admin = o.admin ?? {};
    const rsaPrivate = (o.rsaPrivatePath ?? "keys/private.pem").trim();
    const rsaPublic = (o.rsaPublicPath ?? "keys/public.pem").trim();
    const env = {
      PORT: String(backendPort),
      DB_HOST: db.host ?? "127.0.0.1",
      DB_PORT: String(db.port ?? "3306"),
      DB_USER: db.user ?? "root",
      DB_PASSWORD: db.password ?? "",
      DB_NAME: db.name ?? "pipemind",
      DB_SYNCHRONIZE: o.dbSync === false ? "false" : "true",
      AUTH_ACCESS_TOKEN_TTL: String(o.accessTtl ?? "1800"),
      AUTH_REFRESH_TOKEN_TTL: String(o.refreshTtl ?? "604800"),
      AUTH_REMEMBER_TOKEN_TTL: String(o.rememberTtl ?? "2592000"),
      COOKIE_SECURE: o.cookieSecure ? "true" : "false",
      AUTH_ADMIN_USERNAME: admin.username ?? "PipeMind",
      AUTH_ADMIN_PASSWORD: admin.password ?? "PipeMind",
      CORS_ORIGIN: frontendOrigin,
      RSA_PRIVATE_KEY_PATH: rsaPrivate,
      RSA_PUBLIC_KEY_PATH: rsaPublic,
    };
    writeEnvFile(join(BACKEND, ".env"), env);
    writeEnvFile(join(FRONTEND, ".env.local"), { NEXT_PUBLIC_API_BASE: apiUrl }, "# generated by PipeMind Installer");
    this.pushLog(`已写入 backend/.env（库 ${env.DB_NAME} @ ${env.DB_HOST}:${env.DB_PORT}）`);
    this.pushLog(`已写入 frontend/.env.local（API=${apiUrl}）`);

    // RSA 密钥：支持"直接输入密钥内容"；两者留空则自动生成
    const privatePem = (o.rsaPrivatePem ?? "").trim();
    const publicPem = (o.rsaPublicPem ?? "").trim();
    if (privatePem) {
      const out = writeRsaKeysFromInput({
        baseDir: BACKEND,
        privatePath: rsaPrivate,
        publicPath: rsaPublic,
        privatePem,
        publicPem,
      });
      this.pushLog(out.message);
    } else if (publicPem) {
      throw new Error("已填写 RSA 公钥但未提供私钥：请提供成对的私钥，或将两者留空由系统自动生成。");
    } else {
      // 预生成/复用 RSA 密钥文件：避免首次启动时依赖后端运行时再生成，导致第一次健康检查不稳
      const result = await ensureRsaKeyFiles({
        baseDir: BACKEND,
        privatePath: rsaPrivate,
        publicPath: rsaPublic,
        regenerate: o.rsaRegenerate === true,
      });
      this.pushLog(
        result.created || result.regenerated
          ? `RSA 密钥已自动生成（${result.privateFile} / ${result.publicFile}）`
          : `RSA 密钥已就绪（${result.privateFile} / ${result.publicFile}）`,
      );
    }
  }

  async npmCi(cwd, tag) {
    this.pushLog(`[${tag}] 安装依赖中…（可暂停）`);
    try {
      await run(npmCmd, ["ci", "--no-audit", "--no-fund"], {
        cwd,
        onLine: (l) => this.pushLog(`[${tag}] ${l}`),
        onSpawn: (c) => (this.activeChild = c),
        timeoutMs: 20 * 60 * 1000,
      });
      this.pushLog(`[${tag}] 依赖安装完成`);
    } catch (err) {
      if (this.pauseRequested || this.cancelled) throw err;
      this.pushLog(`[${tag}] npm ci 失败，改用 npm install：${err.message}`, "warn");
      await run(npmCmd, ["install", "--no-audit", "--no-fund"], {
        cwd,
        onLine: (l) => this.pushLog(`[${tag}] ${l}`),
        onSpawn: (c) => (this.activeChild = c),
        timeoutMs: 25 * 60 * 1000,
      });
      this.pushLog(`[${tag}] 依赖安装完成（npm install 回退）`);
    } finally {
      this.activeChild = null;
    }
  }

  async stepBackendDeps() {
    await this.npmCi(BACKEND, "backend");
  }

  async stepFrontendDeps() {
    await this.npmCi(FRONTEND, "frontend");
  }

  async stepDatabase(o) {
    const db = o.db ?? {};
    const dbName = db.name ?? "pipemind";
    let conn;
    try {
      conn = await mysqlConnect({
        host: db.host ?? "127.0.0.1",
        port: Number(db.port ?? 3306),
        user: db.user ?? "root",
        password: db.password ?? "",
        connectTimeout: 8000,
      });
    } catch (err) {
      throw new Error(`无法连接 MySQL（${db.host}:${db.port ?? 3306}）：${err.message}`);
    }
    try {
      await conn.query(
        `CREATE DATABASE IF NOT EXISTS \`${dbName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      );
      this.pushLog(`数据库 ${dbName} 已就绪（不存在则已创建）`);
    } finally {
      await conn.end().catch(() => void 0);
    }
    try {
      const probe = await mysqlConnect({
        host: db.host ?? "127.0.0.1",
        port: Number(db.port ?? 3306),
        user: db.user ?? "root",
        password: db.password ?? "",
        database: dbName,
        connectTimeout: 8000,
      });
      await probe.query("SELECT 1");
      await probe.end().catch(() => void 0);
      this.pushLog(`已通过账号 ${db.user} 连接库 ${dbName} 校验（SELECT 1 OK）`);
    } catch (err) {
      throw new Error(`数据库连接校验失败：${err.message}`);
    }
  }

  async buildBackend() {
    await run(npmCmd, ["run", "build"], {
      cwd: BACKEND,
      onLine: (l) => this.pushLog(`[backend:build] ${l}`),
      onSpawn: (c) => (this.activeChild = c),
      timeoutMs: 10 * 60 * 1000,
    });
    this.pushLog("后端编译完成（backend/dist）");
  }

  async stepBackendBuild() {
    await this.buildBackend();
  }

  async buildFrontend() {
    await run(npmCmd, ["run", "build"], {
      cwd: FRONTEND,
      onLine: (l) => this.pushLog(`[frontend:build] ${l}`),
      onSpawn: (c) => (this.activeChild = c),
      timeoutMs: 15 * 60 * 1000,
    });
    this.pushLog("前端编译完成（frontend/.next）");
  }

  async stepFrontendBuild() {
    await this.buildFrontend();
  }

  async stepBoot(o) {
    const backendPort = o.backendPort ?? 3001;
    const frontendPort = o.frontendPort ?? 3000;
    services.stop(); // 清理可能的残留
    services.startBackend({ port: backendPort });
    this.activeChild = services.backend;
    this.pushLog(`后端启动中：http://localhost:${backendPort}`);
    const backendOk = await this.pollOk(
      `http://127.0.0.1:${backendPort}/api/auth/public-key`,
      (res) => res.status === 200,
    );
    if (backendOk === PAUSE_ABORT) throw new Error(PAUSE_ABORT);
    if (!backendOk) throw new Error("后端健康检查未通过（/api/auth/public-key 无响应）");

    services.startFrontend({ port: frontendPort });
    this.activeChild = services.frontend;
    this.pushLog(`前端启动中：http://localhost:${frontendPort}`);
    const frontendOk = await this.pollOk(
      `http://127.0.0.1:${frontendPort}`,
      (res) => res.status >= 200 && res.status < 500,
    );
    if (frontendOk === PAUSE_ABORT) throw new Error(PAUSE_ABORT);
    if (!frontendOk) throw new Error("前端健康检查未通过（首页无响应）");

    writeJson(RUNTIME_FILE, {
      installedAt: now(),
      backendPort,
      frontendPort,
      frontendUrl: `http://localhost:${frontendPort}`,
      backendUrl: `http://localhost:${backendPort}`,
      dbName: o.db?.name ?? "pipemind",
      admin: o.admin?.username ?? "PipeMind",
    });
    this.activeChild = null;
    this.pushLog("安装完成，服务已启动");
  }

  async pollOk(url, okFn, tries = 150, intervalMs = 1000) {
    for (let i = 0; i < tries; i += 1) {
      if (this.pauseRequested || this.cancelled) return PAUSE_ABORT;
      try {
        const res = await httpGet(url, 3000);
        if (okFn(res)) return true;
      } catch {
        /* 未就绪，重试 */
      }
      await wait(intervalMs);
    }
    return false;
  }
}

export function isInstalled() {
  const backendEnv = readEnvMap(join(BACKEND, ".env"));
  const frontendEnv = readEnvMap(join(FRONTEND, ".env.local"));
  return isNonEmpty(backendEnv.DB_NAME) && isNonEmpty(frontendEnv.NEXT_PUBLIC_API_BASE);
}

// 直接以输入值写入 RSA 密钥（PEM 文本），避免依赖预置文件
export function writeRsaKeysFromInput({ baseDir, privatePath, publicPath, privatePem, publicPem }) {
  const priv = isAbsolute(privatePath) ? privatePath : resolve(baseDir, privatePath);
  const pub = isAbsolute(publicPath) ? publicPath : resolve(baseDir, publicPath);
  if (!/-----BEGIN (RSA )?PRIVATE KEY-----/.test(privatePem) || !/-----END (RSA )?PRIVATE KEY-----/.test(privatePem)) {
    throw new Error("RSA 私钥格式不正确：需要包含 -----BEGIN PRIVATE KEY----- 的 PEM 内容");
  }
  const privKeyObj = createPrivateKey(privatePem);
  const derivedPublic = createPublicKey(privKeyObj).export({ type: "spki", format: "pem" });
  if (publicPem && publicPem.trim()) {
    if (!/-----BEGIN PUBLIC KEY-----/.test(publicPem)) {
      throw new Error("RSA 公钥格式不正确：需要包含 -----BEGIN PUBLIC KEY----- 的 PEM 内容");
    }
    const givenDer = createPublicKey(publicPem).export({ type: "spki", format: "der" });
    const derivedDer = createPublicKey(privKeyObj).export({ type: "spki", format: "der" });
    if (!givenDer.equals(derivedDer)) {
      throw new Error("RSA 私钥与公钥不匹配：请提供同一对密钥，或仅填写私钥由系统自动推导公钥");
    }
  } else {
    publicPem = derivedPublic;
  }
  mkdirSync(dirname(priv), { recursive: true });
  writeFileSync(priv, `${privatePem.trim()}\n`, { encoding: "utf8", mode: 0o600 });
  mkdirSync(dirname(pub), { recursive: true });
  writeFileSync(pub, `${publicPem.trim()}\n`, { encoding: "utf8", mode: 0o644 });
  return {
    message: "RSA 密钥已按输入写入（私钥 + 公钥），启动时可直接使用。",
    privateFile: privatePath,
    publicFile: publicPath,
  };
}

// 生成/补全 RSA 密钥文件（默认自动生成；已有且未要求重生成则跳过）
export function ensureRsaKeyFiles({ baseDir, privatePath, publicPath, regenerate = false }) {
  const priv = isAbsolute(privatePath) ? privatePath : resolve(baseDir, privatePath);
  const pub = isAbsolute(publicPath) ? publicPath : resolve(baseDir, publicPath);
  const has = existsSync(priv) && existsSync(pub);
  if (has && !regenerate) {
    return { created: false, regenerated: false, privateFile: privatePath, publicFile: publicPath };
  }
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  mkdirSync(dirname(priv), { recursive: true });
  writeFileSync(priv, privateKey, { encoding: "utf8", mode: 0o600 });
  mkdirSync(dirname(pub), { recursive: true });
  writeFileSync(pub, publicKey, { encoding: "utf8", mode: 0o644 });
  return { created: !has, regenerated: !!has && regenerate, privateFile: privatePath, publicFile: publicPath };
}
