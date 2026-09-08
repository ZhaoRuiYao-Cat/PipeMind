import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, Logger } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { NotificationsService } from '../notifications/notifications.service.js';
import { UserSettingsService } from '../user-settings/user-settings.service.js';
import { AiConfigService } from '../ai-config/ai-config.service.js';
import { AuthService } from '../auth/auth.service.js';
import { GuidesService } from '../guides/guides.service.js';
import { UiActionsService } from '../ui-actions/ui-actions.service.js';
import { DataFilesService } from '../data-files/data-files.service.js';
import { inspectGis, parseGisPipes } from './gis-geo.js';

interface UserContext {
  userId: number;
  refreshToken: string;
}

const currentUser = new AsyncLocalStorage<UserContext>();

export function runAsUser<T>(
  userId: number,
  refreshToken: string,
  task: () => Promise<T>,
): Promise<T> {
  return currentUser.run({ userId, refreshToken }, task);
}

export function currentUserId(): number {
  const store = currentUser.getStore();
  if (!store) {
    throw new Error('缺少用户上下文');
  }
  return store.userId;
}

export function currentRefreshToken(): string {
  const store = currentUser.getStore();
  return store?.refreshToken ?? '';
}

/** 最近一次成功下发定位指令的参数快照（用于重复定位时由系统侧强制重放）。 */
export interface GisFocusSnapshot {
  fileId: number;
  code: string;
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

const focusByCode = new Map<number, Map<string, GisFocusSnapshot>>();
const lastFocusByUser = new Map<number, GisFocusSnapshot>();

function normalizeFocusCode(code: string): string {
  return code.toUpperCase().replace(/-/g, '').trim();
}

/**
 * 记录一次成功下发的 GIS 定位指令。
 * @param {GisFocusSnapshot} snapshot - 定位参数快照
 */
export function rememberGisFocus(snapshot: GisFocusSnapshot): void {
  const uid = currentUserId();
  const key = normalizeFocusCode(snapshot.code);
  if (key) {
    let byCode = focusByCode.get(uid);
    if (!byCode) {
      byCode = new Map<string, GisFocusSnapshot>();
      focusByCode.set(uid, byCode);
    }
    byCode.set(key, snapshot);
  }
  lastFocusByUser.set(uid, snapshot);
}

/**
 * 按管段编号查找最近一次成功定位的快照。
 * @param {string} code - 管段编号（不区分大小写/连字符）
 * @returns {GisFocusSnapshot | null} 命中快照或 null
 */
export function findFocusSnapshotByCode(code: string): GisFocusSnapshot | null {
  const uid = currentUserId();
  if (!code) {
    return null;
  }
  const byCode = focusByCode.get(uid);
  return byCode?.get(normalizeFocusCode(code)) ?? null;
}

/**
 * 取最近一次成功定位的快照。
 * @returns {GisFocusSnapshot | null} 最近快照或 null
 */
export function findLastFocusSnapshot(): GisFocusSnapshot | null {
  const uid = currentUserId();
  return lastFocusByUser.get(uid) ?? null;
}

interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
  handler: (args: Record<string, unknown>) => Promise<string>;
  highRisk?: boolean;
}

export interface McpToolCatalogEntry {
  name: string;
  description: string;
  jsonSchema: unknown;
  highRisk: boolean;
}

const HIGH_RISK_TOOL_NAMES = new Set<string>([
  'account.change_username',
  'account.change_password',
  'sessions.revoke',
  'sessions.revoke_others',
  'ai_providers.set_active',
  'ai_providers.save',
  'data_files.set_shared',
  'data_files.remove',
]);

const MCP_TOOL_GROUPS = [
  'notifications',
  'user_settings',
  'ai_providers',
  'sessions',
  'account',
  'ui',
  'data_files',
  'gis',
  'core',
] as const;

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);

  private readonly tools: McpTool[] = [];

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly userSettingsService: UserSettingsService,
    private readonly aiConfigService: AiConfigService,
    private readonly authService: AuthService,
    private readonly guidesService: GuidesService,
    private readonly uiActionsService: UiActionsService,
    private readonly dataFilesService: DataFilesService,
  ) {
    this.registerCoreTools();
    this.registerDataFileTools();
    this.registerGisTools();
  }

  createServer(): McpServer {
    const server = new McpServer({
      name: 'pipemind-mcp',
      version: '0.1.0',
    });
    for (const tool of this.tools) {
      server.registerTool(tool.name, {
        description: tool.description,
        inputSchema: tool.inputSchema,
      }, async (args) => {
        const content = await tool.handler(
          args as Record<string, unknown>,
        );
        return { content: [{ type: 'text' as const, text: content }] };
      });
    }
    this.logger.log(
      `created mcp server with ${this.tools.length} tools`,
    );
    return server;
  }

  async executeTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    const tool = this.tools.find((item) => item.name === name);
    if (!tool) {
      throw new Error(`未知工具：${name}`);
    }
    return tool.handler(args);
  }

  listTools(): McpToolCatalogEntry[] {
    return this.tools.map((tool) => {
      const jsonSchema = this.shapeToJsonSchema(tool.inputSchema);
      return {
        name: tool.name,
        description: tool.description,
        jsonSchema,
        highRisk: tool.highRisk === true,
      };
    });
  }

  getStatus(): {
    name: string;
    version: string;
    totalTools: number;
    groups: Record<string, McpToolCatalogEntry[]>;
  } {
    const byGroup = new Map<string, McpToolCatalogEntry[]>();
    for (const entry of this.listTools()) {
      const group = entry.name.includes('.')
        ? entry.name.split('.')[0]
        : 'core';
      const list = byGroup.get(group) ?? [];
      list.push(entry);
      byGroup.set(group, list);
    }
    const groups: Record<string, McpToolCatalogEntry[]> = {};
    for (const group of MCP_TOOL_GROUPS) {
      const list = byGroup.get(group);
      if (list && list.length > 0) {
        groups[group] = list;
      }
    }
    for (const [group, list] of byGroup.entries()) {
      if (!(group in groups)) {
        groups[group] = list;
      }
    }
    return {
      name: 'pipemind-mcp',
      version: '0.1.0',
      totalTools: this.tools.length,
      groups,
    };
  }

  private shapeToJsonSchema(
    shape: Record<string, z.ZodTypeAny>,
  ): Record<string, unknown> {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, schema] of Object.entries(shape)) {
      if (schema.isOptional()) {
        properties[key] = this.zodToSchema(schema);
      } else {
        properties[key] = this.zodToSchema(schema);
        required.push(key);
      }
    }
    return {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {}),
    };
  }

  private zodToSchema(schema: z.ZodTypeAny): Record<string, unknown> {
    const def = schema._def as {
      innerType?: z.ZodTypeAny;
      entries?: Record<string, unknown>;
      values?: unknown[];
    };
    if (schema.constructor.name === 'ZodString') {
      return { type: 'string' };
    }
    if (schema.constructor.name === 'ZodNumber') {
      return { type: 'number' };
    }
    if (schema.constructor.name === 'ZodBoolean') {
      return { type: 'boolean' };
    }
    if (schema.constructor.name === 'ZodEnum') {
      const values = def.values ?? Object.keys(def.entries ?? {});
      return { type: 'string', enum: values as string[] };
    }
    if (schema.constructor.name === 'ZodOptional' && def.innerType) {
      return this.zodToSchema(def.innerType);
    }
    if (schema.constructor.name === 'ZodRecord') {
      return { type: 'object' };
    }
    return { type: 'string' };
  }

  private registerTool(tool: McpTool): void {
    const group = tool.name.includes('.') ? tool.name.split('.')[0] : 'core';
    if (!MCP_TOOL_GROUPS.includes(group as (typeof MCP_TOOL_GROUPS)[number])) {
      this.logger.warn(
        `mcp tool "${tool.name}" registered under unlisted group "${group}"; add it to MCP_TOOL_GROUPS to keep the catalog tidy`,
      );
    }
    this.tools.push({
      ...tool,
      highRisk:
        tool.highRisk === true || HIGH_RISK_TOOL_NAMES.has(tool.name),
    });
  }

  private async requestManualGuide(
    action: string,
    params: Record<string, unknown>,
  ): Promise<string> {
    const userId = currentUserId();
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params)) {
      const normalized = key.toLowerCase();
      if (
        normalized.includes('password') ||
        normalized.includes('apikey') ||
        normalized.includes('api_key') ||
        normalized.includes('secret') ||
        normalized.includes('token')
      ) {
        continue;
      }
      sanitized[key] = value;
    }
    const guide = await this.guidesService.create(userId, action, sanitized);
    return JSON.stringify({
      success: false,
      guide,
      message:
        '该操作属于高危操作，未在后台自动执行；已生成界面引导任务，请前往界面右上角引导栏按步骤手动完成。',
    });
  }

  private registerCoreTools(): void {
    this.registerTool({
      name: 'notifications.list',
      description: '列出当前用户的全部通知（登录提醒/系统消息等）',
      inputSchema: {},
      handler: async () => {
        const result = await this.notificationsService.listForUser(
          currentUserId(),
        );
        return JSON.stringify(result);
      },
    });

    this.registerTool({
      name: 'notifications.mark_read',
      description: '将指定通知标记为已读',
      inputSchema: { id: z.number().int().positive() },
      handler: async ({ id }) => {
        await this.notificationsService.markRead(
          currentUserId(),
          Number(id),
        );
        return JSON.stringify({ success: true });
      },
    });

    this.registerTool({
      name: 'notifications.mark_all_read',
      description: '将全部通知标记为已读',
      inputSchema: {},
      handler: async () => {
        await this.notificationsService.markAllRead(currentUserId());
        return JSON.stringify({ success: true });
      },
    });

    this.registerTool({
      name: 'notifications.remove',
      description: '删除指定通知',
      inputSchema: { id: z.number().int().positive() },
      handler: async ({ id }) => {
        await this.notificationsService.remove(currentUserId(), Number(id));
        return JSON.stringify({ success: true });
      },
    });

    this.registerTool({
      name: 'user_settings.get',
      description: '读取当前用户的全部设置（键值）',
      inputSchema: {},
      handler: async () => {
        const settings = await this.userSettingsService.getAll(
          currentUserId(),
        );
        return JSON.stringify({ settings });
      },
    });

    this.registerTool({
      name: 'user_settings.set',
      description:
        '保存当前用户的多个设置键值。界面语言键 system.language 取值只允许 zh-CN（中文）或 en-US（English），不要写 en / zh。',
      inputSchema: { values: z.record(z.string(), z.string()) },
      handler: async ({ values }) => {
        const settings = await this.userSettingsService.upsertAll(
          currentUserId(),
          values as Record<string, string>,
        );
        return JSON.stringify({ settings });
      },
    });

    this.registerTool({
      name: 'ai_providers.list',
      description: '列出已配置的 AI 提供方，含当前系统使用的一家',
      inputSchema: {},
      handler: async () => {
        const providers = await this.aiConfigService.list();
        return JSON.stringify({ providers });
      },
    });

    this.registerTool({
      name: 'ai_providers.test',
      description: '测试指定 AI 提供方的服务地址与密钥可用性',
      inputSchema: {
        key: z.enum(['openai', 'deepseek', 'gemini', 'doubao']),
        baseUrl: z.string().optional(),
        apiKey: z.string().optional(),
      },
      handler: async ({ key, baseUrl, apiKey }) => {
        const result = await this.aiConfigService.test({
          key: String(key),
          baseUrl:
            typeof baseUrl === 'string' ? baseUrl : undefined,
          apiKey: typeof apiKey === 'string' ? apiKey : undefined,
        });
        return JSON.stringify(result);
      },
    });

    this.registerTool({
      name: 'sessions.list',
      description: '列出当前账号活跃的登录设备/会话',
      inputSchema: {},
      handler: async () => {
        const sessions = await this.authService.listSessions(
          currentUserId(),
          currentRefreshToken(),
        );
        return JSON.stringify({ sessions });
      },
    });

    this.registerTool({
      name: 'account.change_username',
      description:
        '修改登录用户名（高危操作：不自动执行，生成右上角指引卡片引导用户手动完成，禁止用 ui.* 工具或自行代替）',
      inputSchema: { username: z.string().min(2).max(64) },
      handler: async ({ username }) =>
        this.requestManualGuide('account.change_username', {
          username: String(username),
        }),
    });

    this.registerTool({
      name: 'account.change_password',
      description:
        '修改登录密码（高危操作：不自动执行，生成右上角指引卡片引导用户手动完成，禁止用 ui.* 工具或自行代替）',
      inputSchema: { newPassword: z.string().min(6).max(128) },
      handler: async ({ newPassword }) =>
        this.requestManualGuide('account.change_password', {
          newPassword: String(newPassword),
        }),
    });

    this.registerTool({
      name: 'sessions.revoke',
      description:
        '下线指定设备（高危操作：不自动执行，生成右上角指引卡片引导用户手动完成，禁止用 ui.* 工具或自行代替）',
      inputSchema: { id: z.number().int().positive() },
      handler: async ({ id }) =>
        this.requestManualGuide('sessions.revoke', { id: Number(id) }),
    });

    this.registerTool({
      name: 'sessions.revoke_others',
      description:
        '下线其他全部设备（高危操作：不自动执行，生成右上角指引卡片引导用户手动完成，禁止用 ui.* 工具或自行代替）',
      inputSchema: {},
      handler: async () =>
        this.requestManualGuide('sessions.revoke_others', {}),
    });

    this.registerTool({
      name: 'ai_providers.set_active',
      description:
        '切换系统使用的 AI 提供方（高危操作：不自动执行，生成右上角指引卡片引导用户手动完成，禁止用 ui.* 工具或自行代替）',
      inputSchema: { key: z.enum(['openai', 'deepseek', 'gemini', 'doubao']) },
      handler: async ({ key }) =>
        this.requestManualGuide('ai_providers.set_active', {
          key: String(key),
        }),
    });

    this.registerTool({
      name: 'ai_providers.save',
      description:
        '保存 AI 提供方的服务地址与密钥（高危操作：不自动执行，生成右上角指引卡片引导用户手动完成，禁止用 ui.* 工具或自行代替）',
      inputSchema: {
        key: z.enum(['openai', 'deepseek', 'gemini', 'doubao']),
        baseUrl: z.string().optional(),
        apiKey: z.string().optional(),
      },
      handler: async ({ key, baseUrl, apiKey }) =>
        this.requestManualGuide('ai_providers.save', {
          key: String(key),
          baseUrl: typeof baseUrl === 'string' ? baseUrl : undefined,
          apiKey: typeof apiKey === 'string' ? apiKey : undefined,
        }),
    });

    this.registerTool({
      name: 'ui.navigate',
      description:
        '在当前浏览器界面中跳转到指定页面（首页 /home、Flow /agent、MCP 状态 /mcp、数据 /data、设置 /settings）。界面会收到指令并执行跳转。',
      inputSchema: {
        path: z.enum(['/home', '/agent', '/mcp', '/data', '/settings']),
      },
      handler: async ({ path }) =>
        this.enqueueUiAction('navigate', { path: String(path) }),
    });

    this.registerTool({
      name: 'ui.scroll',
      description:
        '在当前浏览器界面中把页面滚动到顶部或底部（top 顶部 / bottom 底部）。会滚动到实际内容容器（含页面内滚动区域）的顶/底。界面会收到指令并执行滚动。',
      inputSchema: {
        position: z.enum(['top', 'bottom']),
      },
      handler: async ({ position }) =>
        this.enqueueUiAction('scroll', { position: String(position) }),
    });

    this.registerTool({
      name: 'ui.click',
      description:
        '在当前浏览器界面中点击目标元素。guide 为目标元素的 data-guide 属性值（例如 home-send、settings-ai、flow-canvas 等由界面预先标记的入口）。界面会收到指令并执行点击。',
      inputSchema: {
        guide: z.string().min(1).max(64),
      },
      handler: async ({ guide }) =>
        this.enqueueUiAction('click', { guide: String(guide) }),
    });
  }

  private async enqueueUiAction(
    action: string,
    params: Record<string, unknown>,
  ): Promise<string> {
    const userId = currentUserId();
    const row = await this.uiActionsService.create(userId, action, params);
    return JSON.stringify({
      success: true,
      queued: true,
      action: row,
      message:
        '已生成界面指令并排队，前端界面将立即自动执行（导航/滚动/点击），无需您手动操作。',
    });
  }

  private registerDataFileTools(): void {
    this.registerTool({
      name: 'data_files.list',
      description: '列出当前用户自己上传的数据文件（名称/大小/时间/是否共享）',
      inputSchema: {},
      handler: async () => {
        const files = await this.dataFilesService.listMine(currentUserId());
        return JSON.stringify({ files });
      },
    });

    this.registerTool({
      name: 'data_files.list_shared',
      description:
        '列出其他用户共享出来的数据文件（含属主用户名），可用于查看别人开放共享的数据',
      inputSchema: {},
      handler: async () => {
        const files = await this.dataFilesService.listShared(currentUserId());
        return JSON.stringify({ files });
      },
    });

    this.registerTool({
      name: 'data_files.set_shared',
      description:
        '开启或关闭某个数据文件的共享（高危操作：不自动执行，生成右上角指引卡片引导用户手动在数据页点击该文件的共享开关完成，禁止用 ui.* 工具或自行代替）',
      inputSchema: {
        id: z.number().int().positive(),
        shared: z.boolean(),
      },
      handler: async ({ id, shared }) =>
        this.requestManualGuide('data_files.set_shared', {
          id: Number(id),
          shared: Boolean(shared),
          name: await this.findDataFileName(Number(id)),
        }),
    });

    this.registerTool({
      name: 'data_files.remove',
      description:
        '删除某个数据文件（高危操作：不自动执行，生成右上角指引卡片引导用户手动在数据页点击该文件的删除按钮完成，禁止用 ui.* 工具或自行代替）',
      inputSchema: { id: z.number().int().positive() },
      handler: async ({ id }) =>
        this.requestManualGuide('data_files.remove', {
          id: Number(id),
          name: await this.findDataFileName(Number(id)),
        }),
    });
  }

  private async findDataFileName(id: number): Promise<string> {
    const files = await this.dataFilesService.listMine(currentUserId());
    const file = files.find((item) => item.id === id);
    return file?.name ?? '';
  }

  private async loadGeoJson(fileId: number): Promise<unknown> {
    const text = await this.dataFilesService.readText(currentUserId(), fileId);
    return JSON.parse(text) as unknown;
  }

  private registerGisTools(): void {
    this.registerTool({
      name: 'gis.inspect',
      description:
        '查看某个 GIS 数据文件（data_files 上传的 GeoJSON）的概览：管段总数、总长度、覆盖范围与各网络类型数量。fileId 来自 data_files.list 返回的 id。低风险，直接自动执行。',
      inputSchema: { fileId: z.number().int().positive() },
      handler: async ({ fileId }) => {
        const raw = await this.loadGeoJson(Number(fileId));
        const result = inspectGis(raw);
        return JSON.stringify(result);
      },
    });

    this.registerTool({
      name: 'gis.search_pipes',
      description:
        '在某个 GIS 数据文件（GeoJSON）中按条件搜索管段：可按管径范围、网络类型、编号关键字过滤，返回前若干条命中管段的编号/类型/管径/中心经纬度与覆盖范围。fileId 来自 data_files.list。低风险，直接自动执行。',
      inputSchema: {
        fileId: z.number().int().positive(),
        network: z.string().max(32).optional(),
        code: z.string().max(64).optional(),
        minDiameterMm: z.number().nonnegative().optional(),
        maxDiameterMm: z.number().nonnegative().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      },
      handler: async (args) => {
        const raw = await this.loadGeoJson(Number(args.fileId));
        const hits = parseGisPipes(raw);
        const network = args.network ? String(args.network) : '';
        const code = args.code ? String(args.code).toLowerCase() : '';
        const minD =
          args.minDiameterMm !== undefined ? Number(args.minDiameterMm) : 0;
        const maxD =
          args.maxDiameterMm !== undefined ? Number(args.maxDiameterMm) : Infinity;
        const limit = args.limit ? Number(args.limit) : 20;
        const filtered = hits.filter((hit) => {
          if (network && hit.network !== network) {
            return false;
          }
          if (code && !hit.code.toLowerCase().includes(code)) {
            return false;
          }
          const d = hit.diameterMm ?? 0;
          if (d < minD || d > maxD) {
            return false;
          }
          return true;
        });
        const top = filtered.slice(0, limit).map((hit) => ({
          code: hit.code,
          network: hit.network,
          diameterMm: hit.diameterMm,
          material: hit.material,
          depthM: hit.depthM,
          lengthKm: Number((hit.lengthM / 1000).toFixed(3)),
          centerLon: Number(hit.centerLon.toFixed(6)),
          centerLat: Number(hit.centerLat.toFixed(6)),
          minLon: Number(hit.minLon.toFixed(6)),
          maxLon: Number(hit.maxLon.toFixed(6)),
          minLat: Number(hit.minLat.toFixed(6)),
          maxLat: Number(hit.maxLat.toFixed(6)),
        }));
        return JSON.stringify({
          total: filtered.length,
          returned: top.length,
          pipes: top,
        });
      },
    });

    this.registerTool({
      name: 'gis.focus',
      description:
        '让首页 GIS 图纸视图自动定位到指定经纬度范围或某条管段。可传 code（管道编号，来自 gis.search_pipes）自动取该管段范围；或直接传 minLon/maxLon/minLat/maxLat 聚焦矩形区域。会向首页界面下发定位指令（低风险，直接执行）。若首页未打开或未选中该数据文件，界面将忽略定位。',
      inputSchema: {
        fileId: z.number().int().positive(),
        code: z.string().max(64).optional(),
        minLon: z.number().optional(),
        maxLon: z.number().optional(),
        minLat: z.number().optional(),
        maxLat: z.number().optional(),
      },
      handler: async (args) => {
        const fileId = Number(args.fileId);
        const raw = await this.loadGeoJson(fileId);
        const hits = parseGisPipes(raw);
        let bounds: {
          minLon: number;
          maxLon: number;
          minLat: number;
          maxLat: number;
        } | null = null;
        let targetCode = args.code ? String(args.code) : '';
        if (targetCode) {
          const hit = hits.find(
            (item) => item.code.toLowerCase() === targetCode.toLowerCase(),
          );
          if (hit) {
            bounds = {
              minLon: hit.minLon,
              maxLon: hit.maxLon,
              minLat: hit.minLat,
              maxLat: hit.maxLat,
            };
          }
        }
        if (!bounds) {
          const hasAll =
            args.minLon !== undefined &&
            args.maxLon !== undefined &&
            args.minLat !== undefined &&
            args.maxLat !== undefined;
          if (hasAll) {
            bounds = {
              minLon: Number(args.minLon),
              maxLon: Number(args.maxLon),
              minLat: Number(args.minLat),
              maxLat: Number(args.maxLat),
            };
          }
        }
        if (!bounds) {
          return JSON.stringify({
            success: false,
            message: '未找到该管段，也未提供矩形范围，请先用 gis.search_pipes 查询后按 code 聚焦，或直接提供经纬度范围。',
          });
        }
        rememberGisFocus({
          fileId,
          code: targetCode || '',
          minLon: bounds.minLon,
          maxLon: bounds.maxLon,
          minLat: bounds.minLat,
          maxLat: bounds.maxLat,
        });
        return this.enqueueUiAction('gis_focus', {
          fileId,
          code: targetCode || '',
          minLon: bounds.minLon,
          maxLon: bounds.maxLon,
          minLat: bounds.minLat,
          maxLat: bounds.maxLat,
        });
      },
    });
  }
}
