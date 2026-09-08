# PipeMind · 通用地下管网数字平台

> 一张图、一套话、一条链、一闭环 —— 图纸 GIS ＋ MCP 工具网关 ＋ AI 智能体 ＋ Flow 可视化编排的数字孪生工作台。
> One Map, One Language, One Chain, One Loop —— a digital-twin workbench of Blueprint GIS, MCP Tool Gateway, AI Agent and Visual Flow Orchestration. Not bound to any organization or region.

本仓库自带了 **MUI 一键安装向导**：拉取代码后只需执行一条命令，即可在浏览器里完成前后端的一起安装、配置、编译与启动。
This repository ships a **MUI one-click installer**: after cloning, a single command opens a browser wizard that installs, configures, builds and starts the frontend & backend together.

---

## 1. 拉取与安装 · Clone & Install

### 1.1 环境要求 · Prerequisites

| 依赖 / Dependency | 版本 / Version | 说明 / Notes |
| --- | --- | --- |
| Node.js | ≥ 20 | 前端 Next.js 16 / 后端 NestJS 12 / 安装向导均需要 |
| npm | ≥ 10 | 随 Node 安装 |
| MySQL | 8.x | 需可联网访问，`utf8mb4`；安装向导会自动建库 |
| Git | 任意 | 拉取代码 |

### 1.2 获取代码 · Get the Code

```bash
git clone https://github.com/ZhaoRuiYao-Cat/PipeMind.git
cd PipeMind
```

### 1.3 一键安装（推荐）· One-click Install (Recommended)

```bash
npm run wizard
```

- 命令将启动向导服务（默认 `http://localhost:4200`，自动打开浏览器）；
- 若未自动打开，请手动访问 `http://localhost:4200`。

向导页面按顺序完成（类 Flarum 体验）：

1. **环境预检**：Node ≥ 20、MySQL 可达、端口 3000/3001 空闲；
2. **部署配置**：数据库地址/端口/账号/库名（不存在自动创建）、初始管理员账号密码、前后端端口；
3. **一键安装**：写入 `backend/.env` 与 `frontend/.env.local` → 安装前后端依赖 → 建库 → 编译前后端 → 启动服务并做健康检查；
4. **完成**：给出系统入口与后端 API 地址，点击即可使用。

> 提示：
> - `installer/dist`（向导页面）已随仓库提交，因此 `npm run wizard` 开箱即用；
> - 若提示向导资源缺失，先执行 `npm run wizard:build` 重新构建。

### 1.4 手动安装 · Manual Install

```bash
# 后端（NestJS，watch 模式）
cp backend/.env.example backend/.env      # 然后编辑数据库等配置（见 §2）
npm run dev:backend                       # http://localhost:3001/api

# 前端（Next.js dev，另开终端）
cp frontend/.env.example frontend/.env.local
npm run dev:frontend                      # http://localhost:3000

# 生产模式（先构建，再启动）
npm run build && npm start
```

首次启动后端会自动创建 `pm_*` 数据表（`DB_SYNCHRONIZE=true`），并按配置播种初始管理员（默认 `PipeMind / PipeMind`，可登录后在系统内修改）。

---

## 2. 环境配置 · Configuration

### 2.1 后端 · Backend（`backend/.env`）

| 变量 / Variable | 默认 / Default | 说明 / Notes |
| --- | --- | --- |
| `PORT` | `3001` | 后端监听端口 Backend port |
| `DB_HOST` / `DB_PORT` | `127.0.0.1` / `3306` | MySQL 连接地址 MySQL host/port |
| `DB_USER` / `DB_PASSWORD` | `root` | MySQL 账号 MySQL credentials |
| `DB_NAME` | `pipemind` | 数据库名（安装向导自动创建）Database name |
| `DB_SYNCHRONIZE` | `true` | TypeORM 自动建表 Auto schema sync |
| `AUTH_ACCESS_TOKEN_TTL` | `1800` | 访问令牌有效期（秒）Access token TTL (s) |
| `AUTH_REFRESH_TOKEN_TTL` | `604800` | 刷新令牌有效期（秒）Refresh token TTL (s) |
| `AUTH_REMEMBER_TOKEN_TTL` | `2592000` | 记住登录有效期（秒）Remember-me TTL (s) |
| `COOKIE_SECURE` | `false` | Cookie 是否仅 HTTPS Secure cookies |
| `AUTH_ADMIN_USERNAME` | `PipeMind` | 初始管理员用户名（仅首次播种）Initial admin username |
| `AUTH_ADMIN_PASSWORD` | `PipeMind` | 初始管理员密码（至少 4 位）Initial admin password |
| `CORS_ORIGIN` | `http://localhost:3000` | 允许的前端来源（逗号分隔）Allowed origins |
| `RSA_PRIVATE_KEY_PATH` / `RSA_PUBLIC_KEY_PATH` | `keys/*.pem` | RSA 密钥路径（缺失自动生成，相对 backend/ 运行目录） |

### 2.2 前端 · Frontend（`frontend/.env.local`）

| 变量 / Variable | 示例 / Example | 说明 / Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE` | `http://localhost:3001/api` | 后端 API 地址（注意以 `/api` 结尾）Backend API base |

---

## 3. 常用命令 · Common Commands

在**仓库根目录**执行：

| 命令 / Command | 作用 / Purpose |
| --- | --- |
| `npm run wizard` | 启动一键安装向导并打开浏览器 |
| `npm run wizard:build` | 重新构建向导页面（修改 installer/ui-src 后） |
| `npm run dev` | 同时启动前后端（开发模式） |
| `npm run dev:backend` / `dev:frontend` | 单独启动后端 / 前端 |
| `npm run build` | 编译后端与前端（生产） |
| `npm start` | 生产模式启动前后端 |
| `npm run package` | 打包发布产物到 `release/PipeMind-<version>.zip` |

---

## 4. 常见问题 · FAQ

- **Q：向导提示端口 3000/3001 被占用？** 先停止占用进程（可能已有实例运行），或修改向导页面的端口配置后再装。
- **Q：安装到"初始化数据库"失败？** 请确认 MySQL 已启动、`DB_HOST/DB_PORT` 可达、账号具备建库权限。
- **Q：已经安装过，如何重装？** 向导会检测已有安装并预填配置，可按新参数覆盖重装。
- **Q：安装后系统打不开？** 在向导完成页点击"打开系统"，或检查 3000/3001 健康状态；亦可执行 `npm start` 手动拉起。

---

## 5. 目录结构 · Repository Layout（简）

```
PipeMind/
├─ backend/       # NestJS 12 服务端（auth/ai-chat/flows/mcp/gis…）
├─ frontend/      # Next.js 16 前端（图纸 GIS / Flow / MCP / Data / Settings）
├─ installer/     # MUI 一键安装向导（server.mjs + dist 已构建 + ui-src 源码）
├─ scripts/       # 根级编排脚本（dev / start / package）
├─ package.json   # 根命令入口（wizard / dev / build / start / package）
└─ README.md      # 本文档
```
