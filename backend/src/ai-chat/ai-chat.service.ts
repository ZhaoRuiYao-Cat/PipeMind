import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiConfigService } from '../ai-config/ai-config.service.js';
import {
  McpService,
  runAsUser,
  findFocusSnapshotByCode,
  findLastFocusSnapshot,
} from '../mcp/mcp.service.js';
import type { AuthenticatedUser } from '../auth/decorators/authenticated-user.interface.js';

export interface ChatMessageDto {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface OpenAiChoice {
  message?: {
    role?: string;
    content?: string | null;
    tool_calls?: Array<{
      id: string;
      function?: { name?: string; arguments?: string };
    }>;
  };
}

interface OpenAiResponse {
  choices?: OpenAiChoice[];
}

const PROVIDER_MODEL: Record<string, string> = {
  openai: 'gpt-4o-mini',
  deepseek: 'deepseek-chat',
  doubao: '',
  gemini: '',
};

const MAX_LOOP_ROUNDS = 5;
const MAX_TOOL_CALLS = 12;
// 同一轮对话中，GIS 定位纠正最多连续推送次数（防止模型反复口头声称已定位却始终不调用工具）
const GIS_MAX_CORRECTION_PUSHES = 3;
// 通用“重复执行同一任务”纠正的最大连续推送次数
const REDO_MAX_CORRECTION_PUSHES = 3;
// “上轮实际执行过的工具”缓存时长（供再次/刷新请求时自动真实重跑）
const LAST_RUN_TTL_MS = 60 * 60 * 1000;

const HIGH_RISK_TOOLS = new Set([
  'account.change_username',
  'account.change_password',
  'sessions.revoke',
  'sessions.revoke_others',
  'ai_providers.set_active',
  'ai_providers.save',
  'data_files.set_shared',
  'data_files.remove',
]);

// 自动重跑仅允许真正幂等/只读的查询类工具；写操作、界面跳转、高危、流程执行一律不自动重跑
const AUTO_RERUN_ALLOWED = new Set([
  'data_files.list',
  'data_files.list_shared',
  'notifications.list',
  'user_settings.get',
  'sessions.list',
  'ai_providers.list',
  'ai_providers.test',
  'gis.inspect',
  'gis.search_pipes',
  'flow.list',
  'flow.get',
]);
// 每用户缓存的上轮执行记录批次上限
const LAST_RUN_BATCH_LIMIT = 8;

function looksLikeHighRiskRequest(content: string): boolean {
  return /密码|用户名|账号|下线|登出|退出|设备|切换|设为系统|AI|密钥|api\s*key|共享|删除|文件|revoke|password|username|sign\s*out|share|delete/i.test(
    content,
  );
}

function mentionsGeneratedGuide(content: string): boolean {
  return /(已)?生成|已打开|已再次|新.?引导|指引卡|卡片|引导任务|右上角/i.test(
    content,
  );
}

function asksGisLocate(content: string): boolean {
  // 用户意图偏“定位/跳转/聚焦某管段或某处”的口径；配合 claimsGisDone 一起使用
  return /定位|放大|聚焦|跳|飞|过去|回到|移到|切到|查看|找到|管道|管段|管网|管线|图纸|刚才那|同一条|同样的位置|(?:PS|GS|YS|GR|RQ|DL|TX|GD)[-]?\d+/i.test(
    content,
  );
}

function claimsGisDone(content: string): boolean {
  // 仅当回复声称“已经定位/跳转/聚焦/下发指令/界面会移动”等结果时才视为声称完成
  return /(?:已|已经).{0,12}?(?:定位|跳转|聚焦|放大|飞过去|过去)|(?:定位|跳转|聚焦|放大)指令?已|指令已(?:重新|再次)?(?:下发|排队)|(?:图纸|视图|界面).{0,18}?(?:会自动|已)(?:缩放|聚焦|定位|跳转|移动)|已过去|已飞过去|已(?:再次|重新)?(?:成功)?定位/i.test(
    content,
  );
}

const PIPE_CODE_RE = /(?:PS|GS|YS|GR|RQ|DL|TX|GD)[-]?\d+/i;

function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/-/g, '');
}

function findFirstCode(...texts: string[]): string {
  for (const text of texts) {
    const m = String(text ?? '').match(PIPE_CODE_RE);
    if (m) {
      return m[0];
    }
  }
  return '';
}

/** 判断文本是否只是“再来一次/刚才那个/同一条”这类重复指令，而没有点名新的编号。 */
function isRepeatOnlyLocate(text: string): boolean {
  return /再(次)?(定位|跳|过去|看)|又(要)?(定位|跳|过去|看)|刚才|同一条|同样的位置|刚才那根|还是(刚才)?那|重复|再执行一次/i.test(
    text,
  );
}

/** 判断用户消息是否在要求“再次/重新执行某项可工具化操作”（列文件/查通知/测试/搜索/定位等）。 */
function looksLikeRedoTaskRequest(content: string): boolean {
  const redo =
    /再|又|重新|再次|重复|同上|刷新|再(次)?(执行|操作|列|查|看|测|试|发|读|标|记|搜|找|取|运行|跑)|重(做|跑|试)|再执行一次|再来(一次|一遍)?|多试|再看一遍|还是刚才|结果一样|更新一下|换种方式/i.test(
      content,
    );
  const domain =
    /文件|数据|通知|已读|未读|消息|设置|密钥|AI|连接|会话|设备|登录|用户|密码|用户名|管道|管段|管网|图纸|底图|定位|搜索|查询|列表|清单|共享|删除|标记|检测|测试|运行|状态|内容|信息|流程|Flow|编排|自动化|画布/i.test(
      content,
    );
  return redo && domain;
}

/** 判断模型回复是否是在用“之前已经做过/上面已给过结果/无需重复”等话术搪塞（未真实调用工具）。 */
function claimsAlreadyDoneFromMemory(content: string): boolean {
  return /(上面|之前|刚才|上次|历史|前面).{0,14}(已经|已|列过|查过|测过|给过|发过|处理过|做过|执行过|读过了|标记过|给过结果|是一样的|结果一样|一样)|已经(列过|查过|测过|给过|发过|处理过|做过|执行过|读取过|标记过|回复过|在上方|在上面)|(无需|不用|不需要|别)(再|重新|重复)(执行|列|查|测|发|做|看)|结果(和|跟)(之前|上次|刚才|上面)(一样|相同)|和(之前|上次|刚才)(说|给|列|查|测)的一样|同上|都一样|没有变化|没有新数据|不用我重复/i.test(
    content,
  );
}

/** 判断模型回复是否谎称“已经重新/再次执行了查询等操作”（而本轮其实没有调用工具）。 */
function claimsRefreshedExecution(content: string): boolean {
  return /(已|已经|又|再|再次|重新).{0,14}(查询|列出|获取|读取|刷新|更新|测试|检查|搜索|统计|扫描|同步|定位|跳转|标记|读取一遍|重新查询|重新读取|重新测试).{0,16}(结果|如下|了|过|完成|一遍|一次|完毕)|重新(查询|读取|测试|检查|刷新)|又(查询|读取|测试|检查|刷新|列)了一遍|已经(重新|再次)?(查询|读取|测试|检查|刷新|列出?)/i.test(
    content,
  );
}

/** 判断用户消息是否明显请求“执行某类可工具化操作”（即便没有“再/又”字样）。 */
function asksToolableAction(content: string): boolean {
  return /(列|查|看|搜|找|测|试|刷|读|取|拿|获取|统计|清点|刷新|更新|有多少|有哪些|有哪几个|给我|帮我|把.{0,10}(标记|删除|共享|设置|保存|刷新|更新|清空)|显示|展示|看看|查一下|列一下|测一下|读一下|同步)/i.test(
    content,
  );
}

/** 判断用户消息是否提及可工具化操作所属的领域（文件/通知/设置/会话/AI/管道等）。 */
function hasToolableDomain(content: string): boolean {
  return /文件|数据|通知|已读|未读|消息|设置|密钥|AI|连接|会话|设备|登录|用户|密码|用户名|管道|管段|管网|图纸|底图|定位|搜索|查询|列表|清单|共享|删除|标记|检测|测试|运行|状态|内容|信息|流程|Flow|编排|自动化|画布/i.test(
    content,
  );
}

function normalizeForCompare(text: string): string {
  return text
    .replace(/[\s，。！？、,.!?；;：:""''（）()【】\[\]…~]/g, '')
    .toLowerCase();
}

/**
 * 判断当前用户消息是否与更早的某条用户消息近乎重复（同一任务再次提出）。
 * 注意：只跳过本轮“当前”那条消息自身（按位置），若更早的历史里有与本次相同的请求，
 * 仍视为重复——否则用户原样再说一遍会被误判为“不是重复”，模型便不再调用工具。
 */
function isRepeatOfEarlierUserRequest(
  current: string,
  messages: ChatMessageDto[],
): boolean {
  const cur = normalizeForCompare(current);
  if (cur.length < 4) {
    return false;
  }
  const currentRaw = (current || '').trim();
  const lastIndex = messages.length - 1;
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message.role !== 'user') {
      continue;
    }
    if (index === lastIndex && (message.content || '').trim() === currentRaw) {
      continue; // 本轮自己那条，不参与比较
    }
    const raw = (message.content || '').trim();
    if (raw === '') {
      continue;
    }
    const prev = normalizeForCompare(raw);
    if (prev.length < 4) {
      continue;
    }
    if (cur === prev) {
      return true;
    }
    if ((cur.includes(prev) || prev.includes(cur)) && Math.min(cur.length, prev.length) >= 6) {
      return true;
    }
  }
  return false;
}

/** 判断模型回复是否明确说明“该请求没有对应工具/无法自动完成”（应放行，不再催调工具）。 */
function mentionsNoToolAvailable(content: string): boolean {
  return /没有对应(的)?工具|没有(这个|这种)?工具|无法(通过|由)?(该|这个)?工具|不能通过工具|没有相关(的)?工具|暂未提供(该|这个)?工具|工具里没有|没有这样的工具|不需要(调用)?工具|无需(调用)?工具|只能(手动|在界面)|需要你(手动|在界面|自己)/i.test(
    content,
  );
}

/** 判断用户是否在问“怎么用/是什么/为什么”这类解释性问题（无需强制调工具执行）。 */
function asksHowToQuestion(content: string): boolean {
  return /怎么|如何|怎样|为何|为什么|为啥|是什么|什么是|啥是|能(不)?能|可以(吗|不)?|行不行|介绍一下|解释|讲讲|教教|说明一下|区别|原理|机制|在哪(里)?|谁|why|how|what/i.test(
    content,
  );
}

/** 从请求文本猜测可能相关的工具前缀（用于纠正提示给出候选）。 */
function suggestToolPrefixes(content: string): string[] {
  const hints: string[] = [];
  if (/文件|数据|清单|列表|共享/.test(content)) hints.push('data_files');
  if (/通知|已读|未读|消息/.test(content)) hints.push('notifications');
  if (/设置|偏好/.test(content)) hints.push('user_settings');
  if (/会话|设备|登录|下线/.test(content)) hints.push('sessions');
  if (/用户|密码|用户名/.test(content)) hints.push('account');
  if (/AI|连接|密钥|测试|提供方/.test(content)) hints.push('ai_providers');
  if (/管道|管段|管网|图纸|底图|定位|搜索/.test(content)) hints.push('gis');
  if (/流程|Flow|编排|自动化|画布|运行/.test(content)) hints.push('flow');
  if (hints.length === 0) {
    hints.push('notifications', 'user_settings', 'ai_providers', 'sessions', 'data_files', 'gis');
  }
  return hints;
}

@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  /** 每用户最近一次对话中真实执行过的工具（名称+参数+时间），用于再次/刷新请求时自动重跑。 */
  private readonly lastExecutedRuns = new Map<
    number,
    Array<{ tool: string; args: Record<string, unknown>; at: number }>
  >();

  constructor(
    private readonly aiConfigService: AiConfigService,
    private readonly mcpService: McpService,
  ) {}

  /** 记录某用户本轮真实执行成功的一个工具（供后续“再查一次”自动重跑）。 */
  private rememberExecutedRun(
    userId: number,
    tool: string,
    args: Record<string, unknown>,
  ): void {
    if (userId <= 0 || !AUTO_RERUN_ALLOWED.has(tool)) {
      return;
    }
    const list = this.lastExecutedRuns.get(userId) ?? [];
    const now = Date.now();
    // 清理过期与重复
    const fresh = list.filter(
      (item) => now - item.at < LAST_RUN_TTL_MS && item.tool !== tool,
    );
    fresh.push({ tool, args, at: now });
    // 只保留最近的若干条
    if (fresh.length > LAST_RUN_BATCH_LIMIT) {
      fresh.splice(0, fresh.length - LAST_RUN_BATCH_LIMIT);
    }
    this.lastExecutedRuns.set(userId, fresh);
  }

  /**
   * 用户再次要求“重新执行/再查一遍/刷新”时，若上一轮真实执行过匹配的查询类工具，
   * 由系统侧直接重跑并把最新结果回填，避免模型“以为已经执行过”而跳过工具调用。
   * @param {number} userId - 用户 id
   * @param {string} userText - 本轮用户消息
   * @param {ChatMessageDto[]} messages - 对话历史（判断上一轮是否也执行过同类请求）
   * @returns {Promise<{ tools: string[]; outputs: string[] } | null>} 重跑结果
   */
  private async rerunLastMatchedTools(
    userId: number,
    userText: string,
    messages: ChatMessageDto[],
  ): Promise<{ tools: string[]; outputs: string[] } | null> {
    const list = this.lastExecutedRuns.get(userId) ?? [];
    const now = Date.now();
    const candidates = list.filter(
      (item) => now - item.at < LAST_RUN_TTL_MS,
    );
    if (candidates.length === 0) {
      return null;
    }
    // 工具范围：优先命中用户当前消息点名领域的前缀；
    // 用户未点名领域（如“再查一遍/同上”）时，只重跑最近一次真实执行过的工具。
    const prefixes = suggestToolPrefixes(userText);
    const mentioned = /文件|数据|清单|列表|共享|通知|已读|未读|消息|设置|偏好|会话|设备|登录|下线|用户|密码|用户名|AI|连接|密钥|测试|提供方|管道|管段|管网|图纸|底图|定位|搜索|流程|Flow|编排|自动化|画布|运行/i.test(
      userText,
    );
    const hits = mentioned
      ? candidates.filter((item) => {
          const prefix = item.tool.split('.')[0];
          return prefixes.includes(prefix);
        })
      : [];
    const pool =
      hits.length > 0
        ? hits
        : candidates.length > 0
          ? [candidates[candidates.length - 1]]
          : [];
    const tools: string[] = [];
    const outputs: string[] = [];
    for (const item of pool) {
      try {
        const result = await this.mcpService.executeTool(item.tool, item.args);
        // 刷新该次执行记录，保证后续同类“再查一次”依然可自动重跑
        this.rememberExecutedRun(userId, item.tool, item.args);
        tools.push(item.tool);
        outputs.push(
          `${item.tool} → ${(result ?? '').slice(0, 1200)}`,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : '工具执行失败';
        outputs.push(`${item.tool} → 自动重跑失败：${message}`);
      }
    }
    return tools.length > 0 ? { tools, outputs } : null;
  }

  async chat(
    user: AuthenticatedUser | undefined,
    refreshToken: string,
    messages: ChatMessageDto[],
    requestedModel?: string,
  ): Promise<{ reply: string; executedTools?: string[] }> {
    if (!messages || messages.length === 0) {
      throw new BadRequestException('消息不能为空');
    }
    return runAsUser(
      user?.id ?? 0,
      refreshToken,
      async () => {
        const credentials = await this.aiConfigService.getActiveCredentials();
        if (!credentials.key) {
          throw new BadRequestException('尚未配置系统 AI，请先在设置中启用一家 AI');
        }
        if (credentials.key === 'gemini') {
          throw new ServiceUnavailableException(
            '当前系统 AI 为 Gemini，暂不支持对话工具调用，请在设置中切换为 OpenAI/DeepSeek/豆包',
          );
        }
        if (!credentials.baseUrl || !credentials.apiKey) {
          throw new BadRequestException(
            `当前系统 AI（${credentials.key}）尚未配置服务地址与密钥`,
          );
        }
        const model =
          requestedModel?.trim() || PROVIDER_MODEL[credentials.key] || '';
        if (!model) {
          throw new BadRequestException('需要指定模型名称（model）');
        }

        const tools = this.mcpService
          .listTools()
          .map((tool) => ({
            type: 'function' as const,
            function: {
              name: encodeToolName(tool.name),
              description: tool.description,
              parameters: tool.jsonSchema,
            },
          }));

        const wireMessages: Array<Record<string, unknown>> = [
          ...messages.slice(-16).map((message) => ({
            role: message.role,
            content: message.content,
          })),
        ];
        if (tools.length > 0) {
          wireMessages.unshift({
            role: 'system',
            content:
              '你是 PipeMind Flow 助手。请严格区分操作风险：\n1. 高危操作包括修改用户名/密码、下线登录设备、切换系统 AI、保存 AI 服务地址与密钥、删除数据文件、开启或关闭数据文件的共享。遇到这类请求，必须调用对应的 account.change_username / account.change_password / sessions.revoke / sessions.revoke_others / ai_providers.set_active / ai_providers.save / data_files.remove / data_files.set_shared 工具；这些工具会在界面右上角生成一张新的引导任务卡片，请如实告诉用户按卡片步骤手动完成，严禁谎称已完成，严禁用 ui.* 工具去替代执行或点击高危按钮。\n2. 用户每次提出高危操作请求（包括再次请求同一类操作、或要求“重新打开指引”），都必须再次调用对应高危工具生成一条新的指引任务，即使历史消息中已有相同的工具调用记录；每条新请求对应一张新卡片，用户完成旧卡不影响新卡的弹出。\n3. 低风险操作（查看/标记通知、读写用户设置、查看会话、测试 AI 提供方、列出自己或共享的数据文件等）必须直接调用对应功能工具自动完成，完成后如实汇报结果，不要跳转页面、不要滚动页面、不要替用户点击界面、也不要让用户手动到页面里操作；只有在用户明确要求“打开/跳到某页、滚动、点击界面”时才使用 ui.navigate / ui.scroll / ui.click。\n4. 首页 GIS 图纸场景：当用户询问或要求查看管道数据时，先用 data_files.list 找到数据文件，再调用 gis.inspect 了解文件概览（管段数/总长/范围/网络类型），用 gis.search_pipes 按网络、管径或编号搜索管段；当用户要求“定位/放大/聚焦”某条管道或某个区域时，必须调用 gis.focus 传入该文件的 fileId 与管段 code（或矩形经纬度范围），前端图纸会自动缩放过去，请不要让用户手动操作画布。上述 gis.* 均属低风险，直接执行。\n5. 只要用户提出“定位/放大/跳转/再跳一次/聚焦到某条管道或某处”，无论在此前消息中是否已定位过同一管段（包括用户第三次、第四次重复问同一根管段），每一次都必须真实重新调用 gis.focus 工具（必要时先 gis.search_pipes 获取管段编号），不能因为“刚才已经定位过”“用户可能已经在那个位置”“历史里已有定位记录”等原因跳过工具调用；严禁在未调用 gis.focus、或 gis.focus 未返回成功的情况下声称“已定位/已跳转/图纸已移动”，严禁编造“定位指令已下发并排队”。只有工具真实返回成功后，才能如实告诉用户已定位。\n6. 若工具结果提示“该操作属于高危操作…已生成界面引导任务”，必须告知用户新指引卡片已经出现，按右上角卡片步骤操作即可。\n7. 通用重复执行规则：任何能由工具执行的任务（列文件、查通知、读/写设置、查会话、测连接、查/搜/定位管道、标记已读、删除、共享等），只要用户提出请求——包括“再/又/重新/再次/重复/刷新/同上/再执行一次/再试一次/再查一遍/结果一样吗/还是刚才那样”等重复或再次确认的措辞——每一次都必须真实重新调用对应的功能工具，并以本次工具返回的最新结果如实回答；严禁因为“之前已经做过”“上面/刚才已经给过结果”“结果和上次一样”“已经完成”等原因跳过工具调用，严禁把历史消息里的旧结果当成本次执行结果，严禁口头复述历史而不调用工具。尤其注意跨轮重复：即使你在上一轮已经真实调用过某个工具并给出了结果，只要用户在本轮再次提出同一请求（哪怕一字不差，哪怕只是追问“还是那样吗/结果没变吧/再确认一下/刷新一下/又试一次/重复一遍”），也必须把上一轮当作不存在，重新调用对应工具并以本次最新返回结果作答，绝不能把上一轮工具结果或自己上一轮的回答当作本轮结果；系统会核对本轮是否真的发生了工具调用，若你本轮没有调用任何工具却声称“已重新查过/结果同上/和刚才一样”，本次回复会被判为无效并要求你补调工具。只有用户明显是在要求口头解释（而非执行操作）时才可直接回答、不调用工具。\n8. Flow 流程编排场景：当用户要求“创建/新建/保存一个流程”“编排/自动执行一系列操作”“生成一个自动化流程”“打开某个流程看看”“运行某个流程”时，使用 flow.list（列出已保存流程）、flow.get（读取某个流程定义）、flow.create（按节点数组新建并保存流程，每个节点含 id/tool/params，节点之间可用 edges 连线并按依赖顺序执行，参数中可用 {{上游节点id.字段}} 引用上游输出）、flow.update（整体替换某个流程内容）、flow.run（执行某个已保存流程并返回各节点结果）、flow.open（把某个流程打开到 Flow 画布页面上查看/修改）。上述 flow.* 均属低风险，直接执行；如需把流程展示给用户看或让用户继续在画布上编辑，应调用 flow.open；不要编造“流程已创建/已运行/已打开”，只有工具真实返回成功后再如实汇报。',
          });
        }

        const endpoint = `${credentials.baseUrl.replace(/\/+$/, '')}/chat/completions`;
        let round = 0;
        let toolCallCount = 0;
        let highRiskToolInvoked = false;
        let gisFocusSucceeded = false;
        let highRiskCorrected = false;
        let gisFocusPushes = 0;
        let redoPushes = 0;
        const executedTools: string[] = [];
        const lastUserContent =
          [...messages]
            .reverse()
            .find((message) => message.role === 'user')?.content ?? '';
        for (; round < MAX_LOOP_ROUNDS; round += 1) {
          const body: Record<string, unknown> = {
            model,
            messages: wireMessages,
            temperature: 0.6,
          };
          if (tools.length > 0) {
            body.tools = tools;
          }
          const response = await this.postChat(endpoint, credentials.apiKey, body);
          const choice = response.choices?.[0];
          const message = choice?.message;
          if (!message) {
            throw new ServiceUnavailableException('AI 服务未返回有效内容');
          }
          const toolCalls = message.tool_calls ?? [];
          if (toolCalls.length === 0) {
            const replyText = message.content ?? '';
            if (
              !highRiskToolInvoked &&
              !highRiskCorrected &&
              looksLikeHighRiskRequest(lastUserContent) &&
              mentionsGeneratedGuide(replyText)
            ) {
              highRiskCorrected = true;
              wireMessages.push({
                role: 'user',
                content:
                  '（系统检测）你刚才声称已生成或再次生成高危操作引导卡，但本次实际并未调用任何高危工具，界面不会出现卡片。请立即调用对应的高危专用工具（如 account.change_password / account.change_username / sessions.revoke / sessions.revoke_others / ai_providers.set_active / ai_providers.save / data_files.remove / data_files.set_shared），由工具真实创建一张新的引导任务卡片，再根据工具返回结果如实答复用户。',
              });
              continue;
            }
            if (
              !gisFocusSucceeded &&
              asksGisLocate(lastUserContent) &&
              claimsGisDone(replyText)
            ) {
              // 模型声称已定位但本次未调用 gis.focus：先尝试系统侧按最近一次相同目标重放定位，
              // 保证重复请求（用户已在别处/第三次问同一根管段）也能真正跳转，而不是只口头确认。
              const replay = await this.tryReplayGisFocus(
                lastUserContent,
                replyText,
              );
              if (replay) {
                executedTools.push('gis.focus');
                return {
                  reply: replay.reply,
                  executedTools:
                    executedTools.length > 0 ? executedTools : undefined,
                };
              }
              // 无法重放（例如首次定位的全新目标）：有限次地提示模型补调工具
              if (gisFocusPushes < GIS_MAX_CORRECTION_PUSHES) {
                gisFocusPushes += 1;
                wireMessages.push({
                  role: 'user',
                  content:
                    '（系统检测）用户要求定位/跳转到某条管道或某处，但你刚才回复声称已经定位/跳转，本次却并未调用 gis.focus 工具，界面不会真的移动。请先调用 gis.search_pipes（必要时）获取目标管段编号，再立即调用 gis.focus 工具（传入对应 data 文件的 fileId 与管段 code 或经纬度范围），在收到工具返回成功后，再如实告诉用户已定位。',
                });
                continue;
              }
              return {
                reply:
                  '（系统提示）自动定位未能完成：本次没有成功下发 gis.focus 定位指令，图纸没有真正移动。为避免误报，我不能说已经定位。请再描述一次目标管段编号或位置（例如“定位到 PS-0001”），或刷新页面后重试。',
                executedTools:
                  executedTools.length > 0 ? executedTools : undefined,
              };
            }
            // 通用“重复执行同一任务 / 可工具化请求未调用工具”纠正：
            // ① 若上一轮（同用户、近乎相同的请求）真实执行过工具，则系统侧直接重跑这些工具，
            //    把最新结果注入对话，让模型基于真实结果作答（不依赖模型是否肯再次调用）；
            // ② 否则文本纠正，要求模型立即补调对应工具。
            const strongRedoAsk = looksLikeRedoTaskRequest(lastUserContent);
            const repeatedEarlierRequest = isRepeatOfEarlierUserRequest(
              lastUserContent,
              messages,
            );
            const redoAsked =
              strongRedoAsk ||
              repeatedEarlierRequest ||
              (hasToolableDomain(lastUserContent) &&
                asksToolableAction(lastUserContent));
            const doneClaimedFromMemory =
              claimsAlreadyDoneFromMemory(replyText) ||
              claimsRefreshedExecution(replyText);
            const howToAsk = asksHowToQuestion(lastUserContent);
            const noToolAvailable = mentionsNoToolAvailable(replyText);
            const executedThisTurn = executedTools.length > 0;
            // ① 只有确属“再次/刷新/同一请求重提”时才自动重跑上一轮同领域的只读工具，
            //    普通的新可工具化请求不重跑（避免用旧参数执行与用户当前意图不符的工具）。
            if (
              redoAsked &&
              (strongRedoAsk || repeatedEarlierRequest) &&
              !executedThisTurn
            ) {
              const rerun = await this.rerunLastMatchedTools(
                user?.id ?? 0,
                lastUserContent,
                messages,
              );
              if (rerun && rerun.outputs.length > 0) {
                for (const tool of rerun.tools) {
                  executedTools.push(tool);
                }
                wireMessages.push({
                  role: 'user',
                  content:
                    '（系统检测）用户是在要求再次执行/刷新同一项操作，为确保给出的是最新真实结果，' +
                    '系统已自动重新调用以下工具：' +
                    rerun.tools.join('、') +
                    '。请严格以以下最新返回结果如实回答用户，不要再声称“已执行过/和之前一样/没有变化”：\n' +
                    rerun.outputs.join('\n'),
                });
                continue;
              }
            }
            if (
              redoAsked &&
              executedTools.length === 0 &&
              redoPushes < REDO_MAX_CORRECTION_PUSHES &&
              !noToolAvailable &&
              (doneClaimedFromMemory || (!howToAsk && redoAsked))
            ) {
              redoPushes += 1;
              const prefixes = suggestToolPrefixes(lastUserContent);
              const hint = prefixes.map((p) => `${p}.*`).join('、');
              wireMessages.push({
                role: 'user',
                content:
                  doneClaimedFromMemory
                    ? `（系统检测）用户是在要求再次执行或刷新某项操作（例如重新列出/查询/测试/读取最新数据），但你这次回复没有调用任何工具，只是用“之前做过/上面给过/结果相同/又重新查了一遍”之类的话搪塞，界面不会因此更新。请立即重新调用与该请求对应的工具（候选：${hint}，例如再列文件用 data_files.list / data_files.list_shared、再查通知用 notifications.list、再读设置用 user_settings.get、再测连接用 ai_providers.test、再查会话用 sessions.list、再搜索/定位管段用 gis.search_pipes / gis.focus），以本次工具返回的最新结果如实回答用户；若用户确实只是在询问解释而非要求执行，则可直接回答，但不要声称“已经执行过”。`
                    : `（系统检测）用户刚才提出了可执行的操作请求（重新/再次/查看/列出/刷新/同步等），但你这条回复没有调用任何工具就直接作答，无法保证内容是最新真实数据。请立即调用与该请求对应的工具（候选：${hint}），拿到工具返回的真实结果后再回答；若该请求确实无法由工具完成，请明确说明“没有对应的工具/无法通过工具完成”，而不是凭空作答。`,
              });
              continue;
            }
            if (
              redoAsked &&
              executedTools.length === 0 &&
              redoPushes >= REDO_MAX_CORRECTION_PUSHES
            ) {
              return {
                reply:
                  '（系统提示）已多次提醒，但你始终没有调用任何工具，无法确认该操作真的执行或刷新了。为不误导用户，我不能声称已完成。请重新明确一次要执行的任务（例如“再列一次文件”“再测一次连接”），我会为你调用对应工具。',
                executedTools:
                  executedTools.length > 0 ? executedTools : undefined,
              };
            }
            return {
              reply: replyText,
              executedTools:
                executedTools.length > 0 ? executedTools : undefined,
            };
          }
          wireMessages.push({
            role: message.role ?? 'assistant',
            content: message.content ?? '',
            tool_calls: toolCalls.map((call) => ({
              id: call.id,
              type: 'function',
              function: {
                name: call.function?.name ?? '',
                arguments: call.function?.arguments ?? '{}',
              },
            })),
          });
          for (const call of toolCalls) {
            if (toolCallCount >= MAX_TOOL_CALLS) {
              break;
            }
            toolCallCount += 1;
            const name = decodeToolName(call.function?.name ?? '');
            executedTools.push(name);
            if (HIGH_RISK_TOOLS.has(name)) {
              highRiskToolInvoked = true;
            }
            let parsedArgs: Record<string, unknown> = {};
            try {
              parsedArgs = JSON.parse(call.function?.arguments ?? '{}') as Record<
                string,
                unknown
              >;
            } catch {
              parsedArgs = {};
            }
            let result: string;
            try {
              result = await this.mcpService.executeTool(name, parsedArgs);
            } catch (error) {
              result = JSON.stringify({
                error: error instanceof Error ? error.message : '工具执行失败',
              });
            }
            if (name === 'gis.focus' && result.includes('"success":true')) {
              gisFocusSucceeded = true;
            }
            // 记录本轮真实执行成功的只读类工具（供后续“再查一次/刷新”时系统自动重跑）
            if (!result.startsWith('{"error"')) {
              this.rememberExecutedRun(user?.id ?? 0, name, parsedArgs);
            }
            wireMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: result,
            });
          }
          if (toolCallCount >= MAX_TOOL_CALLS) {
            break;
          }
        }
        throw new ServiceUnavailableException('对话工具轮询次数超限，请稍后再试');
      },
    );
  }

  /**
   * 当模型多次声称“已定位/已跳转”却始终不调用 gis.focus 时，
   * 系统侧按最近一次相同目标的成功定位参数兜底重放，确保图纸真的跳转。
   * @param {string} userText - 用户最新消息
   * @param {string} replyText - 模型声称完成的消息
   * @returns {Promise<{ reply: string } | null>} 重放结果或 null
   */
  private async tryReplayGisFocus(
    userText: string,
    replyText: string,
  ): Promise<{ reply: string } | null> {
    const code = findFirstCode(userText, replyText);
    let snapshot = code ? findFocusSnapshotByCode(code) : null;
    // 只有用户没有点名新的编号、且措辞是“再跳一次/刚才那根/同一条”这类重复指令时，
    // 才回退到最近一次成功定位，避免把用户想定位的新管段错误地跳到旧位置。
    if (!snapshot && !code && isRepeatOnlyLocate(userText)) {
      snapshot = findLastFocusSnapshot();
    }
    if (!snapshot) {
      return null;
    }
    try {
      const result = await this.mcpService.executeTool('gis.focus', {
        fileId: snapshot.fileId,
        code: snapshot.code || '',
        minLon: snapshot.minLon,
        maxLon: snapshot.maxLon,
        minLat: snapshot.minLat,
        maxLat: snapshot.maxLat,
      });
      if (result.includes('"success":false')) {
        return null;
      }
      const label = snapshot.code ? ` ${snapshot.code}` : '';
      return {
        reply: `（系统已自动重放定位）已重新向图纸下发定位指令${label}并排队，界面会自动跳转过去。`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      return {
        reply: `（系统提示）已尝试为你自动重新下发定位，但未成功：${message}。请刷新页面后重试，或换一种方式描述目标位置。`,
      };
    }
  }

  private async postChat(
    endpoint: string,
    apiKey: string,
    body: Record<string, unknown>,
  ): Promise<OpenAiResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        this.logger.error(`chat provider error ${response.status}: ${text}`);
        throw new ServiceUnavailableException(
          `AI 服务返回 HTTP ${response.status}：${text.slice(0, 300)}`,
        );
      }
      return JSON.parse(text) as OpenAiResponse;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ServiceUnavailableException('连接 AI 服务超时');
      }
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : '未知错误';
      throw new ServiceUnavailableException(`无法连接 AI 服务：${message}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

function encodeToolName(name: string): string {
  return name.replaceAll('.', '__');
}

function decodeToolName(name: string): string {
  return name.replaceAll('__', '.');
}
