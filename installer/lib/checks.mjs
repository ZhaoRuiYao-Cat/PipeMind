// PipeMind Installer —— 环境预检
import { existsSync } from "node:fs";
import { join } from "node:path";
import { BACKEND, FRONTEND, UI_DIR, ROOT, probePort, IS_WIN } from "./common.mjs";

function nodeMajor() {
  const m = /^v?(\d+)/.exec(process.version);
  return m ? Number(m[1]) : 0;
}

export async function runChecks() {
  const items = [];
  const add = (key, label, ok, message, severity = ok ? "ok" : "error") =>
    items.push({ key, label, ok, message, severity });

  // Node.js 版本
  const major = nodeMajor();
  add("node", "Node.js ≥ 20", major >= 20, `检测到 Node.js ${process.version}`, major >= 20 ? "ok" : "error");

  // npm
  add("npm", "npm 可用", true, `npm ${process.env.npm_version ?? "（使用命令行 npm）"}`, "ok");

  // 目录结构
  add("layout", "工程目录结构", existsSync(BACKEND) && existsSync(FRONTEND) && existsSync(join(ROOT, "package.json")),
    existsSync(BACKEND) && existsSync(FRONTEND) ? "backend/ 与 frontend/ 已就位" : "缺少 backend/ 或 frontend/");

  // 安装器 UI 产物
  add("ui", "安装向导资源", existsSync(join(UI_DIR, "index.html")),
    existsSync(join(UI_DIR, "index.html")) ? "向导页面已构建（installer/dist）" : "缺少 installer/dist，请先执行 npm run wizard:build");

  // 端口占用（仅检查前后端；向导端口由正在运行的向导自身占用，属于预期）
  const [pBack, pFront] = await Promise.all([
    probePort("127.0.0.1", 3001),
    probePort("127.0.0.1", 3000),
  ]);
  add("port_backend", "后端端口 3001 空闲", !pBack.ok,
    pBack.ok ? "3001 已被占用（可能已有实例运行）" : "3001 空闲");
  add("port_frontend", "前端端口 3000 空闲", !pFront.ok,
    pFront.ok ? "3000 已被占用（可能已有实例运行）" : "3000 空闲");
  add("port_ui", "向导服务可用", true, "4200 由当前安装向导使用中", "ok");

  const errors = items.filter((i) => i.severity === "error");
  const warnings = items.filter((i) => i.severity === "warning");
  return {
    ok: errors.length === 0,
    errors: errors.length,
    warnings: warnings.length,
    items,
    summary: `${errors.length} 项错误 / ${warnings.length} 项警告`,
  };
}

// 安装前校验表单参数
export function validateOptions(opts) {
  const problems = [];
  const db = opts?.db ?? {};
  if (!/^\d+$/.test(String(db.port ?? ""))) problems.push("数据库端口必须是数字");
  if (!String(db.host ?? "").trim()) problems.push("数据库地址不能为空");
  if (!String(db.user ?? "").trim()) problems.push("数据库用户不能为空");
  if (!/^[A-Za-z0-9_]+$/.test(String(db.name ?? ""))) problems.push("数据库名仅允许字母、数字、下划线");
  const admin = opts?.admin ?? {};
  if (!String(admin.username ?? "").trim()) problems.push("管理员用户名不能为空");
  if (String(admin.password ?? "").length < 4) problems.push("管理员密码至少 4 位");
  if (/^\d+$/.test(String(opts?.backendPort ?? "")) === false) problems.push("后端端口必须是数字");
  if (/^\d+$/.test(String(opts?.frontendPort ?? "")) === false) problems.push("前端端口必须是数字");
  // RSA 密钥路径（可选，默认自动生成；禁止 .. 逃逸）
  const rsaPaths = [String(opts?.rsaPrivatePath ?? "").trim(), String(opts?.rsaPublicPath ?? "").trim()];
  for (const p of rsaPaths) {
    if (p && /(^|[\\/])\.\.([\\/]|$)/.test(p)) problems.push("密钥路径不允许包含 ..");
  }
  // 令牌有效期（可选）
  const ttls = [opts?.accessTtl, opts?.refreshTtl, opts?.rememberTtl].filter((v) => v !== undefined && v !== "");
  for (const v of ttls) {
    if (/^\d+$/.test(String(v)) === false) problems.push("令牌有效期（TTL）必须是正整数秒");
  }
  return problems;
}
