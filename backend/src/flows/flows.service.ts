import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Flow } from './entities/flow.entity.js';
import { McpService, runAsUser } from '../mcp/mcp.service.js';
import type { FlowEdgeDto, FlowNodeDto } from './dto/save-flow.dto.js';

export interface FlowView {
  id: number;
  name: string;
  description: string;
  nodes: Record<string, FlowNodeDto>;
  edges: Record<string, FlowEdgeDto>;
  createdAt: Date;
  updatedAt: Date;
}

export interface FlowNodeResult {
  nodeId: string;
  tool: string;
  status: 'ok' | 'failed' | 'skipped';
  ms: number;
  output?: string;
  error?: string;
  params?: Record<string, unknown>;
}

export interface FlowRunResult {
  ok: boolean;
  order: string[];
  steps: FlowNodeResult[];
}

interface ExecutionContext {
  outputs: Map<string, unknown>;
  results: Map<string, FlowNodeResult>;
}

/** 工具输出若为 JSON 文本则转为对象，否则保留原文本。 */
function parseOutput(raw: string): unknown {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    return raw;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return raw;
  }
}

/**
 * 依据 JSON 路径（如 files.0.id）从某输出中取值。
 * @param {unknown} value - 输出值
 * @param {string[]} segments - 路径段
 * @returns {unknown} 命中值或 undefined
 */
function digPath(value: unknown, segments: string[]): unknown {
  let cursor = value;
  for (const segment of segments) {
    if (cursor === null || cursor === undefined) {
      return undefined;
    }
    if (typeof cursor !== 'object') {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

/** 把值序列化为适合作为参数文本的形式。 */
function serializeParam(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * 解析模板中的 {{节点id.路径}} 引用，替换为上游节点的输出。
 * @param {string} text - 参数字符串
 * @param {Map<string, unknown>} outputs - 已完成节点的输出
 * @returns {string} 替换后的文本
 */
function resolveTemplate(text: string, outputs: Map<string, unknown>): string {
  return text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (full, raw: string) => {
    const parts = raw.split('.');
    const nodeId = parts.shift() ?? '';
    const output = outputs.get(nodeId);
    if (output === undefined) {
      return full;
    }
    const value = parts.length > 0 ? digPath(output, parts) : output;
    return serializeParam(value);
  });
}

/**
 * 深度解析参数：字符串中支持 {{节点id.路径}} 模板，其余原样保留。
 * @param {unknown} value - 参数值
 * @param {Map<string, unknown>} outputs - 上游输出
 * @returns {unknown} 解析结果
 */
function resolveParamsDeep(
  value: unknown,
  outputs: Map<string, unknown>,
): unknown {
  if (typeof value === 'string') {
    return resolveTemplate(value, outputs);
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveParamsDeep(item, outputs));
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = resolveParamsDeep(item, outputs);
    }
    return result;
  }
  return value;
}

@Injectable()
export class FlowsService {
  private readonly logger = new Logger(FlowsService.name);

  constructor(
    @InjectRepository(Flow)
    private readonly flowRepository: Repository<Flow>,
    private readonly mcpService: McpService,
  ) {}

  async list(userId: number): Promise<FlowView[]> {
    const rows = await this.flowRepository.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });
    return rows.map((row) => this.toView(row));
  }

  async get(userId: number, id: number): Promise<FlowView> {
    const row = await this.findOne(userId, id);
    return this.toView(row);
  }

  async create(
    userId: number,
    name: string,
    description: string,
    nodes: Record<string, FlowNodeDto>,
    edges: Record<string, FlowEdgeDto>,
  ): Promise<FlowView> {
    const row = await this.flowRepository.save(
      this.flowRepository.create({
        userId,
        name,
        description,
        nodes: JSON.stringify(nodes ?? {}),
        edges: JSON.stringify(edges ?? {}),
      }),
    );
    return this.toView(row);
  }

  async update(
    userId: number,
    id: number,
    name: string,
    description: string,
    nodes: Record<string, FlowNodeDto>,
    edges: Record<string, FlowEdgeDto>,
  ): Promise<FlowView> {
    const row = await this.findOne(userId, id);
    row.name = name;
    row.description = description ?? '';
    row.nodes = JSON.stringify(nodes ?? {});
    row.edges = JSON.stringify(edges ?? {});
    const saved = await this.flowRepository.save(row);
    return this.toView(saved);
  }

  async remove(userId: number, id: number): Promise<{ success: boolean }> {
    const row = await this.findOne(userId, id);
    await this.flowRepository.remove(row);
    return { success: true };
  }

  private async findOne(userId: number, id: number): Promise<Flow> {
    const row = await this.flowRepository.findOne({ where: { id, userId } });
    if (!row) {
      throw new NotFoundException('流程不存在');
    }
    return row;
  }

  private toView(row: Flow): FlowView {
    let nodes: Record<string, FlowNodeDto> = {};
    let edges: Record<string, FlowEdgeDto> = {};
    try {
      nodes = JSON.parse(row.nodes || '{}') as Record<string, FlowNodeDto>;
    } catch {
      nodes = {};
    }
    try {
      edges = JSON.parse(row.edges || '{}') as Record<string, FlowEdgeDto>;
    } catch {
      edges = {};
    }
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? '',
      nodes,
      edges,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * 校验并执行一个流程：按依赖顺序（上游节点先执行）逐个调用 MCP 工具，
   * 参数中的 {{节点id.字段}} 会自动替换成对应上游节点的输出。
   * @param {number} userId - 用户 id
   * @param {string} refreshToken - 刷新令牌（执行会话类工具需要）
   * @param {Record<string, FlowNodeDto>} nodes - 节点
   * @param {Record<string, FlowEdgeDto>} edges - 连线
   * @returns {Promise<FlowRunResult>} 执行结果
   */
  async run(
    userId: number,
    refreshToken: string,
    nodes: Record<string, FlowNodeDto>,
    edges: Record<string, FlowEdgeDto>,
  ): Promise<FlowRunResult> {
    const allNodes = Object.values(nodes ?? {});
    const allEdges = Object.values(edges ?? {});
    if (allNodes.length === 0) {
      throw new BadRequestException('流程为空，请先添加工具节点');
    }

    const nodeIds = new Set<string>();
    for (const node of allNodes) {
      if (!node.id || !node.tool) {
        throw new BadRequestException('节点缺少 id 或 tool');
      }
      nodeIds.add(node.id);
    }
    const known = new Set(this.mcpService.listTools().map((tool) => tool.name));
    const unknown = allNodes.filter((node) => !known.has(node.tool));
    if (unknown.length > 0) {
      throw new BadRequestException(
        `包含不存在的工具：${unknown.map((n) => n.tool).join('、')}`,
      );
    }

    // 构建依赖关系：target 依赖 source
    const dependants = new Map<string, Set<string>>();
    const upstreamCount = new Map<string, number>();
    for (const node of allNodes) {
      dependants.set(node.id, new Set());
      upstreamCount.set(node.id, 0);
    }
    for (const edge of allEdges) {
      if (!edge.source || !edge.target || !nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
        continue;
      }
      if (edge.source === edge.target) {
        throw new BadRequestException('不允许节点连接到自身');
      }
      dependants.get(edge.source)?.add(edge.target);
      upstreamCount.set(edge.target, (upstreamCount.get(edge.target) ?? 0) + 1);
    }

    // 检测环（拓扑排序）
    const order: string[] = [];
    const queue: string[] = [];
    for (const node of allNodes) {
      if ((upstreamCount.get(node.id) ?? 0) === 0) {
        queue.push(node.id);
      }
    }
    while (queue.length > 0) {
      const current = queue.shift() as string;
      order.push(current);
      for (const next of dependants.get(current) ?? []) {
        const left = (upstreamCount.get(next) ?? 1) - 1;
        upstreamCount.set(next, left);
        if (left === 0) {
          queue.push(next);
        }
      }
    }
    if (order.length !== allNodes.length) {
      throw new BadRequestException('流程存在循环依赖，无法执行');
    }

    const nodeMap = new Map<string, FlowNodeDto>();
    for (const node of allNodes) {
      nodeMap.set(node.id, node);
    }
    // 每个节点直接依赖的上游节点
    const parents = new Map<string, string[]>();
    for (const node of allNodes) {
      parents.set(node.id, []);
    }
    for (const edge of allEdges) {
      if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
        parents.get(edge.target)?.push(edge.source);
      }
    }

    return runAsUser(userId, refreshToken, async () => {
      const context: ExecutionContext = {
        outputs: new Map(),
        results: new Map(),
      };
      const failedNodes = new Set<string>();
      for (const nodeId of order) {
        const node = nodeMap.get(nodeId) as FlowNodeDto;
        // 直接上游失败 → 本节点跳过
        const upstreamFailed = (parents.get(nodeId) ?? []).some((p) =>
          failedNodes.has(p),
        );
        if (upstreamFailed) {
          const step: FlowNodeResult = {
            nodeId,
            tool: node.tool,
            status: 'skipped',
            ms: 0,
            error: '上游节点未成功执行，已跳过',
          };
          context.results.set(nodeId, step);
          failedNodes.add(nodeId);
          continue;
        }
        const started = Date.now();
        const step: FlowNodeResult = {
          nodeId,
          tool: node.tool,
          status: 'ok',
          ms: 0,
          params: node.params ?? {},
        };
        try {
          const params = resolveParamsDeep(node.params ?? {}, context.outputs);
          step.params = params as Record<string, unknown>;
          const raw = await this.mcpService.executeTool(node.tool, params as Record<string, unknown>);
          step.ms = Date.now() - started;
          step.output = raw;
          context.outputs.set(nodeId, parseOutput(raw));
        } catch (error) {
          step.ms = Date.now() - started;
          step.status = 'failed';
          step.error = error instanceof Error ? error.message : '工具执行失败';
          failedNodes.add(nodeId);
          this.logger.warn(`flow node ${nodeId} (${node.tool}) failed: ${step.error}`);
        }
        context.results.set(nodeId, step);
      }

      const steps = order.map(
        (nodeId) => context.results.get(nodeId) as FlowNodeResult,
      );

      return { ok: steps.every((step) => step.status === 'ok'), order, steps };
    });
  }
}
