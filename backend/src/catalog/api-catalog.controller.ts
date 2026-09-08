// API 目录与接口文档（供前端“API 文档”页与导出使用）
import { Controller, Get, Header, Query, Res } from "@nestjs/common";
import { Public } from "../auth/decorators/public.decorator.js";
import type { Response } from "express";

export interface ApiDocEntry {
  id: string;
  group: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  title: string;
  summary: string;
  requiresAuth: boolean;
  query?: Record<string, string>;
  body?: unknown;
  response: unknown;
}

const P = "http://localhost:3001/api";

const ENTRIES: ApiDocEntry[] = [
  {
    id: "auth-public-key", group: "认证", method: "GET", path: `${P}/auth/public-key`,
    title: "获取登录公钥", summary: "返回 RSA-OAEP(SHA-256) 公钥，用于加密登录口令。", requiresAuth: false,
    response: { name: "RSA-OAEP", publicKey: "…", hash: "SHA-256" },
  },
  {
    id: "auth-login", group: "认证", method: "POST", path: `${P}/auth/login`,
    title: "登录", summary: "RSA 加密口令登录，签发 pm_access_token/pm_refresh_token Cookie。", requiresAuth: false,
    body: { username: "PipeMind", encryptedPassword: "…", remember: true },
    response: { user: { id: 1, username: "PipeMind" } },
  },
  {
    id: "auth-me", group: "认证", method: "GET", path: `${P}/auth/me`,
    title: "当前用户", summary: "获取当前登录用户信息。", requiresAuth: true,
    response: { user: { id: 1, username: "PipeMind", status: 1 } },
  },
  {
    id: "data-files-list", group: "数据文件", method: "GET", path: `${P}/data-files`,
    title: "我的数据文件", summary: "列出当前用户的 GeoJSON 等数据文件。", requiresAuth: true,
    response: { files: [{ id: 1, name: "demo.geojson", mime: "application/json", size: 1024 }] },
  },
  {
    id: "data-files-content", group: "数据文件", method: "GET", path: `${P}/data-files/:id/content`,
    title: "读取文件内容", summary: "读取数据文件原始 GeoJSON 内容。", requiresAuth: true,
    response: { type: "FeatureCollection", features: [] },
  },
  {
    id: "flows-list", group: "流程编排", method: "GET", path: `${P}/flows`,
    title: "我的流程", summary: "列出已保存的 Flow。", requiresAuth: true,
    response: { flows: [{ id: 1, name: "流程A", nodes: {} }] },
  },
  {
    id: "devices-list", group: "设备与基站", method: "GET", path: `${P}/devices`,
    title: "设备列表", summary: "列出全部设备（管道机器人/无人机）。", requiresAuth: false,
    response: [{ id: 1, name: "机器人A", type: "crawler", status: "online", description: null }],
  },
  {
    id: "devices-create", group: "设备与基站", method: "POST", path: `${P}/devices`,
    title: "新增设备", summary: "新增管道机器人或无人机。", requiresAuth: false,
    body: { name: "机器人A", type: "crawler", status: "offline", description: "井下 1 号" },
    response: { id: 1, name: "机器人A", type: "crawler", status: "offline" },
  },
  {
    id: "devices-update", group: "设备与基站", method: "PATCH", path: `${P}/devices/:id`,
    title: "编辑设备", summary: "更新设备名称/类型/状态/描述。", requiresAuth: false,
    body: { status: "busy" },
    response: { id: 1, name: "机器人A", type: "crawler", status: "busy" },
  },
  {
    id: "devices-remove", group: "设备与基站", method: "DELETE", path: `${P}/devices/:id`,
    title: "删除设备", summary: "删除设备及其巡航路线。", requiresAuth: false,
    response: { ok: true },
  },
  {
    id: "devices-route-get", group: "设备与基站", method: "GET", path: `${P}/devices/:id/route`,
    title: "查询巡航路线", summary: "查询某设备基于数据源规划的巡航路线。", requiresAuth: false,
    response: { deviceId: 1, source: { kind: "file", id: 1, name: "demo.geojson" }, points: [{ lon: 126.9, lat: 46.6 }] },
  },
  {
    id: "devices-route-put", group: "设备与基站", method: "PUT", path: `${P}/devices/:id/route`,
    title: "保存巡航路线", summary: "保存基于当前 GIS 数据源规划的巡航路线（经纬度点列）。", requiresAuth: false,
    body: { source: { kind: "file", id: 1, name: "demo.geojson" }, points: [{ lon: 126.9, lat: 46.6 }] },
    response: { deviceId: 1, sourceText: "…", pointsText: "…", status: "active" },
  },
  {
    id: "devices-telemetry-push", group: "设备与基站", method: "POST", path: `${P}/devices/:id/telemetry`,
    title: "推送设备遥测", summary: "外部设备/检测终端上报实时位置，经 Socket 广播 `pm:telemetry`。", requiresAuth: false,
    body: { lon: 126.9, lat: 46.61, heading: 90, speed: 1.2, battery: 88, status: "online" },
    response: { deviceId: 1, lon: 126.9, lat: 46.61, heading: 90, speed: 1.2, battery: 88, status: "online", ts: 1 },
  },
  {
    id: "devices-telemetry-latest", group: "设备与基站", method: "GET", path: `${P}/devices/telemetry/latest`,
    title: "设备最新位置", summary: "获取全部设备的最新遥测位置。", requiresAuth: false,
    response: { devices: [{ deviceId: 1, lon: 126.9, lat: 46.61, ts: 1 }] },
  },
  {
    id: "stations-list", group: "设备与基站", method: "GET", path: `${P}/base-stations`,
    title: "基站列表", summary: "列出地图上规划的基站（充电/中继/指挥）。", requiresAuth: false,
    response: [{ id: 1, name: "1号基站", lon: 126.9, lat: 46.6, purpose: "charging", description: null }],
  },
  {
    id: "stations-create", group: "设备与基站", method: "POST", path: `${P}/base-stations`,
    title: "新增基站", summary: "在指定经纬度规划基站。", requiresAuth: false,
    body: { name: "1号基站", lon: 126.9, lat: 46.6, purpose: "charging" },
    response: { id: 1, name: "1号基站", lon: 126.9, lat: 46.6, purpose: "charging" },
  },
  {
    id: "stations-update", group: "设备与基站", method: "PATCH", path: `${P}/base-stations/:id`,
    title: "编辑基站", summary: "更新基站位置/用途/说明。", requiresAuth: false,
    body: { lon: 126.91, lat: 46.61 },
    response: { id: 1, name: "1号基站", lon: 126.91, lat: 46.61 },
  },
  {
    id: "stations-remove", group: "设备与基站", method: "DELETE", path: `${P}/base-stations/:id`,
    title: "删除基站", summary: "删除基站。", requiresAuth: false,
    response: { ok: true },
  },
  {
    id: "mcp-status", group: "MCP", method: "GET", path: `${P}/mcp/status`,
    title: "MCP 服务状态", summary: "MCP 工具分组与运行状态。", requiresAuth: true,
    response: { groups: [] },
  },
  {
    id: "flows-run", group: "流程编排", method: "POST", path: `${P}/flows/run`,
    title: "执行流程草稿", summary: "后端拓扑执行 Flow（上游失败下游跳过）。", requiresAuth: true,
    body: { name: "巡检", nodes: {}, edges: {} },
    response: { steps: [{ nodeId: "n1", status: "ok" }] },
  },
];

@Controller("api-catalog")
@Public()
export class ApiCatalogController {
  @Get()
  list() {
    return { total: ENTRIES.length, entries: ENTRIES };
  }

  @Get("export")
  @Header("Content-Type", "application/octet-stream")
  export(
    @Query("fmt") fmt?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const type = fmt === "json" ? "json" : "markdown";
    const stamp = new Date().toISOString().slice(0, 10);
    if (type === "json") {
      const body = JSON.stringify({ exportedAt: stamp, endpoints: ENTRIES }, null, 2);
      res?.setHeader("Content-Disposition", `attachment; filename="pipemind-api-${stamp}.json"`);
      return body;
    }
    const lines = [`# PipeMind API 文档（${stamp}）`, ""];
    const groups = Array.from(new Set(ENTRIES.map((e) => e.group)));
    for (const group of groups) {
      lines.push(`## ${group}`, "");
      for (const e of ENTRIES.filter((x) => x.group === group)) {
        lines.push(`### ${e.title}`, "");
        lines.push(`> ${e.summary}`, "");
        lines.push(`- 请求方式 Method: \`${e.method}\``);
        lines.push(`- 地址 URL: \`${e.path}\``);
        lines.push(`- 鉴权 Auth: ${e.requiresAuth ? "需要 Cookie 登录" : "无需"}`, "");
        if (e.query) {
          lines.push(`查询参数 Query:`);
          for (const [k, v] of Object.entries(e.query)) lines.push(`  - ${k}: ${v}`);
          lines.push("");
        }
        if (e.body !== undefined) {
          lines.push("请求体 Body:", "```json", JSON.stringify(e.body, null, 2), "```", "");
        }
        lines.push("响应示例 Response:", "```json", JSON.stringify(e.response, null, 2), "```", "");
      }
    }
    const md = lines.join("\n");
    res?.setHeader("Content-Disposition", `attachment; filename="pipemind-api-${stamp}.md"`);
    return md;
  }
}
