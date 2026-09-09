import { API_BASE } from "./api";

export interface FlowToolSchemaProperty {
  type?: string;
  enum?: string[];
  description?: string;
}

export interface FlowToolJsonSchema {
  type?: string;
  properties?: Record<string, FlowToolSchemaProperty>;
  required?: string[];
}

export interface FlowToolEntry {
  name: string;
  description: string;
  jsonSchema?: FlowToolJsonSchema;
  highRisk?: boolean;
}

export interface FlowNodeRecord {
  id: string;
  tool: string;
  params?: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface FlowEdgeRecord {
  id: string;
  source: string;
  target: string;
}

export interface FlowView {
  id: number;
  name: string;
  description: string;
  nodes: Record<string, FlowNodeRecord>;
  edges: Record<string, FlowEdgeRecord>;
  createdAt: string;
  updatedAt: string;
}

export interface FlowNodeResult {
  nodeId: string;
  tool: string;
  status: "ok" | "failed" | "skipped";
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

export interface FlowEditorNode {
  id: string;
  tool: string;
  group: string;
  risk: boolean;
  description: string;
  jsonSchema: FlowToolJsonSchema;
  params: Record<string, unknown>;
}

function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  return fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  }).then(async (response) => {
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        text && text.length < 300
          ? text
          : `HTTP ${response.status}`,
      );
    }
    return (await response.json()) as T;
  });
}

export async function fetchFlowTools(): Promise<
  Record<string, FlowToolEntry[]>
> {
  const data = await jsonFetch<{ tools: Record<string, FlowToolEntry[]> }>(
    `${API_BASE}/flows/tools`,
  );
  return data.tools ?? {};
}

export async function fetchFlows(): Promise<FlowView[]> {
  const data = await jsonFetch<{ flows: FlowView[] }>(`${API_BASE}/flows`);
  return data.flows ?? [];
}

export async function fetchFlow(id: number): Promise<FlowView> {
  const data = await jsonFetch<{ flow: FlowView }>(
    `${API_BASE}/flows/${id}`,
  );
  return data.flow;
}

export async function createFlow(input: {
  name: string;
  description?: string;
  nodes: Record<string, FlowNodeRecord>;
  edges: Record<string, FlowEdgeRecord>;
}): Promise<FlowView> {
  const data = await jsonFetch<{ flow: FlowView }>(`${API_BASE}/flows`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.flow;
}

export async function updateFlow(
  id: number,
  input: {
    name: string;
    description?: string;
    nodes: Record<string, FlowNodeRecord>;
    edges: Record<string, FlowEdgeRecord>;
  },
): Promise<FlowView> {
  const data = await jsonFetch<{ flow: FlowView }>(
    `${API_BASE}/flows/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
  return data.flow;
}

export async function deleteFlow(id: number): Promise<void> {
  await jsonFetch<{ success: boolean }>(`${API_BASE}/flows/${id}`, {
    method: "DELETE",
  });
}

export async function runFlowDraft(input: {
  nodes: Record<string, FlowNodeRecord>;
  edges: Record<string, FlowEdgeRecord>;
}): Promise<FlowRunResult> {
  return jsonFetch<FlowRunResult>(`${API_BASE}/flows/run`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function runSavedFlow(id: number): Promise<FlowRunResult> {
  return jsonFetch<FlowRunResult>(`${API_BASE}/flows/${id}/run`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function groupLabel(group: string, zh: boolean): string {
  const map: Record<string, [string, string]> = {
    notifications: ["通知", "Notifications"],
    user_settings: ["用户设置", "Settings"],
    ai_providers: ["AI 提供方", "AI providers"],
    sessions: ["会话", "Sessions"],
    account: ["账户", "Account"],
    ui: ["界面操作", "UI actions"],
    data_files: ["数据文件", "Data files"],
    gis: ["管网 GIS", "GIS"],
    flow: ["流程编排", "Flows"],
    core: ["核心", "Core"],
  };
  const entry = map[group];
  if (!entry) {
    return group;
  }
  return zh ? entry[0] : entry[1];
}

export function toolDisplayName(name: string): string {
  const dot = name.indexOf(".");
  return dot > 0 ? name.slice(dot + 1) : name;
}
