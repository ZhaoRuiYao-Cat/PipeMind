// PipeMind —— 发布打包：产出 release/PipeMind-<version>.zip
// 排除：node_modules / .git / backend/dist / backend/keys / backend/uploads /
//       frontend/.next / installer/ui-src 等
// 保留：installer/dist（一键安装向导页面，零依赖可用）
import { createRequire } from "node:module";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT } from "../installer/lib/common.mjs";

const require = createRequire(import.meta.url);
const { readFileSync } = require("node:fs");

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist", // 仅 backend/frontend 的 dist；installer/dist 单独放行
  "keys",
  "uploads",
  "release",
  "coverage",
]);
const SKIP_FILES = new Set([".env", ".env.local", ".env.development", "runtime.json"]);

function readVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    return pkg.version ?? "0.1.0";
  } catch {
    return "0.1.0";
  }
}

function copyDir(src, dest, allowDist = false) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, entry.name);
    const d = join(dest, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) && !(allowDist && entry.name === "dist")) continue;
      copyDir(s, d, entry.name === "installer");
    } else if (!SKIP_FILES.has(entry.name)) {
      cpSync(s, d);
    }
  }
}

const version = readVersion();
const STAGE = join(process.env.TEMP ?? ".", `pipemind-stage-${Date.now()}`);
const releaseDir = join(ROOT, "release");
mkdirSync(releaseDir, { recursive: true });
console.log(`开始打包 PipeMind v${version}`);

// 复制根级全部条目（自动跳过重型/敏感目录；installer/dist 放行）
const entries = readdirSync(ROOT, { withFileTypes: true });
for (const entry of entries) {
  if (SKIP_DIRS.has(entry.name)) continue;
  const s = join(ROOT, entry.name);
  const d = join(STAGE, entry.name);
  if (entry.isDirectory()) {
    copyDir(s, d, entry.name === "installer");
  } else if (!SKIP_FILES.has(entry.name)) {
    cpSync(s, d);
  }
}

if (!existsSync(join(ROOT, "installer", "dist", "index.html"))) {
  console.error("缺少 installer/dist/index.html，请先构建向导：npm --prefix installer install && npm --prefix installer run build");
  rmSync(STAGE, { recursive: true, force: true });
  process.exit(1);
}

writeFileSync(
  join(STAGE, "RELEASE.txt"),
  [
    `PipeMind v${version}`,
    `Release date: ${new Date().toISOString().slice(0, 10)}`,
    "",
    "使用方式 / Usage:",
    "1) 解压到目标机器（需 Node.js >= 20 与 MySQL 8）",
    "2) 打开终端进入目录，执行：npm run wizard",
    "3) 浏览器将打开 http://localhost:4200 的安装向导，按页面提示一键安装",
    "",
    "Source code: https://github.com/ZhaoRuiYao-Cat/PipeMind.git",
  ].join("\n"),
  "utf8",
);

const zipPath = join(releaseDir, `PipeMind-${version}.zip`);
if (existsSync(zipPath)) rmSync(zipPath, { force: true });

const tar = spawnSync("tar", ["-a", "-c", "-f", zipPath, "-C", STAGE, "."], { encoding: "utf8" });
if (tar.status !== 0) {
  console.error("打包失败:", tar.stderr || tar.stdout);
  rmSync(STAGE, { recursive: true, force: true });
  process.exit(1);
}
rmSync(STAGE, { recursive: true, force: true });
const size = existsSync(zipPath) ? `${Math.round(statSync(zipPath).size / 1024)} KB` : "?";
console.log(`完成：${zipPath}（${size}）`);
