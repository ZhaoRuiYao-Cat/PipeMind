"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Edge, NodeChange, Connection } from "@xyflow/react";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useStore,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import OutlinedInput from "@mui/material/OutlinedInput";
import Paper from "@mui/material/Paper";
import Popover from "@mui/material/Popover";
import Select from "@mui/material/Select";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AddRounded from "@mui/icons-material/AddRounded";
import AutoAwesomeRounded from "@mui/icons-material/AutoAwesomeRounded";
import ChevronRightRounded from "@mui/icons-material/ChevronRightRounded";
import CloseRounded from "@mui/icons-material/CloseRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import DevicesRounded from "@mui/icons-material/DevicesRounded";
import FolderOpenRounded from "@mui/icons-material/FolderOpenRounded";
import FolderSharedRounded from "@mui/icons-material/FolderSharedRounded";
import HubRounded from "@mui/icons-material/HubRounded";
import ListAltRounded from "@mui/icons-material/ListAltRounded";
import MapOutlined from "@mui/icons-material/MapOutlined";
import MouseOutlined from "@mui/icons-material/MouseOutlined";
import NotificationsNoneRounded from "@mui/icons-material/NotificationsNoneRounded";
import PersonOutlineRounded from "@mui/icons-material/PersonOutlineRounded";
import PlayArrowRounded from "@mui/icons-material/PlayArrowRounded";
import SaveRounded from "@mui/icons-material/SaveRounded";
import SearchRounded from "@mui/icons-material/SearchRounded";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import TerminalRounded from "@mui/icons-material/TerminalRounded";
import TuneRounded from "@mui/icons-material/TuneRounded";
import { useI18n } from "@/lib/i18n";
import {
  FlowToolNode,
  type FlowNodeData,
} from "@/components/flow-tool-node";
import {
  createFlow,
  deleteFlow,
  fetchFlow,
  fetchFlowTools,
  fetchFlows,
  groupLabel,
  runFlowDraft,
  toolDisplayName,
  updateFlow,
  type FlowNodeRecord,
  type FlowEdgeRecord,
  type FlowRunResult,
  type FlowToolEntry,
  type FlowToolJsonSchema,
  type FlowView,
} from "@/lib/flow-api";

type RFNode = import("@xyflow/react").Node<FlowNodeData, "tool">;

const NODE_TYPES = { tool: FlowToolNode };

interface PaneFlowPoint {
  x: number;
  y: number;
}

function freshId(prefix = "n"): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

function toolGroupOf(tool: string): string {
  const dot = tool.indexOf(".");
  return dot > 0 ? tool.slice(0, dot) : "core";
}

const GROUP_ICON: Record<string, React.ReactNode> = {
  notifications: <NotificationsNoneRounded sx={{ fontSize: 15 }} />,
  user_settings: <SettingsOutlined sx={{ fontSize: 15 }} />,
  ai_providers: <AutoAwesomeRounded sx={{ fontSize: 15 }} />,
  sessions: <DevicesRounded sx={{ fontSize: 15 }} />,
  account: <PersonOutlineRounded sx={{ fontSize: 15 }} />,
  ui: <MouseOutlined sx={{ fontSize: 15 }} />,
  data_files: <FolderSharedRounded sx={{ fontSize: 15 }} />,
  gis: <MapOutlined sx={{ fontSize: 15 }} />,
  flow: <HubRounded sx={{ fontSize: 15 }} />,
  core: <HubRounded sx={{ fontSize: 15 }} />,
};

function groupIconOf(group: string): React.ReactNode {
  return GROUP_ICON[group] ?? <TuneRounded sx={{ fontSize: 15 }} />;
}

function findTool(
  groups: Record<string, FlowToolEntry[]>,
  tool: string,
): FlowToolEntry | undefined {
  for (const list of Object.values(groups)) {
    const hit = list.find((item) => item.name === tool);
    if (hit) {
      return hit;
    }
  }
  return undefined;
}

function showFlowNotice(
  kind: "success" | "error" | "info",
  text: string,
): { kind: "success" | "error" | "info"; text: string } {
  return { kind, text };
}

export function FlowBuilder() {
  const { lang } = useI18n();
  const zh = lang === "zh-CN";
  const reactFlow = useReactFlow();

  const [toolGroups, setToolGroups] = useState<
    Record<string, FlowToolEntry[]>
  >({});
  const [flows, setFlows] = useState<FlowView[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const [flowName, setFlowName] = useState("");
  const [currentFlowId, setCurrentFlowId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menuFlow, setMenuFlow] = useState<PaneFlowPoint | null>(null);
  const [menuQuery, setMenuQuery] = useState("");
  const [hoverGroup, setHoverGroup] = useState<string | null>(null);
  const [hoverTop, setHoverTop] = useState(0);
  const menuWrapRef = useRef<HTMLDivElement | null>(null);
  const [running, setRunning] = useState(false);
  // 基准缩放：小地图仅在偏离该缩放的缩放操作时显示视口框
  const baseZoomRef = useRef<number | null>(null);
  const viewportTransform = useStore((store) => store.transform);
  const [runResult, setRunResult] = useState<FlowRunResult | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [flowsAnchor, setFlowsAnchor] = useState<HTMLElement | null>(null);
  const [templateAnchor, setTemplateAnchor] = useState<HTMLElement | null>(null);
  const [notice, setNotice] = useState<{
    kind: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const lastOpenedFlowRef = useRef<number | null>(null);

  const loadTools = useCallback(async () => {
    try {
      setToolGroups(await fetchFlowTools());
    } catch (error) {
      setNotice(
        showFlowNotice(
          "error",
          error instanceof Error ? error.message : "加载工具目录失败",
        ),
      );
    }
  }, []);

  const refreshFlows = useCallback(async () => {
    try {
      setFlows(await fetchFlows());
    } catch {
      void 0;
    }
  }, []);

  useEffect(() => {
    void loadTools();
    void refreshFlows();
  }, [loadTools, refreshFlows]);

  // 记录初始缩放（小地图默认隐藏视口框，缩放后显示）
  useEffect(() => {
    const timer = window.setTimeout(() => {
      baseZoomRef.current = reactFlow.getViewport().zoom;
    }, 350);
    return () => window.clearTimeout(timer);
  }, [reactFlow]);

  const zoomDelta =
    baseZoomRef.current !== null
      ? Math.abs(viewportTransform[2] - baseZoomRef.current)
      : 0;
  const miniMaskOn = zoomDelta > 0.005;

  // 菜单锚定在画布坐标点：随视口变换实时换算屏幕位置（缩放/平移时实时跟随）
  const menuScreen = useMemo<{ x: number; y: number; toLeft: boolean } | null>(() => {
    if (!menuFlow) {
      return null;
    }
    const [tx, ty, zoom] = viewportTransform;
    const rawX = menuFlow.x * zoom + tx;
    const rawY = menuFlow.y * zoom + ty;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const searchMode = menuQuery.trim().length > 0;
    // 一级菜单始终锚定右键点（必要时钳制在视口内），二级方向按锚定后的剩余空间决定，
    // 与 hover 状态无关，避免悬停时分栏方向翻转导致一级菜单跳动
    const level1W = 250;
    const subW = 320;
    const x = Math.max(8, Math.min(rawX, Math.max(8, vw - level1W - 8)));
    const toLeft = !searchMode && x + level1W + subW + 16 > vw;
    const y = Math.max(8, Math.min(rawY, Math.max(8, vh - 400 - 8)));
    return { x, y, toLeft };
  }, [menuFlow, menuQuery, viewportTransform]);

  /** 右键画布：记录画布坐标点并打开节点选择菜单 */
  const openNodeMenu = useCallback(
    (clientX: number, clientY: number) => {
      const point = reactFlow.screenToFlowPosition({
        x: clientX,
        y: clientY,
      });
      setMenuFlow({ x: point.x, y: point.y });
      setMenuQuery("");
      setHoverGroup(null);
    },
    [reactFlow],
  );

  /** 在右键点（画布坐标）添加一个工具节点，节点位置保持在可视区域内 */
  const addToolNode = useCallback(
    (tool: string) => {
      const entry = findTool(toolGroups, tool);
      const group = toolGroupOf(tool);
      const viewport = reactFlow.getViewport();
      const base =
        menuFlow ??
        (() => {
          return {
            x: -viewport.x / viewport.zoom + 200,
            y: -viewport.y / viewport.zoom + 120,
          };
        })();
      const cascade = (nodes.length % 6) * 34;
      const node: RFNode = {
        id: freshId("node"),
        type: "tool",
        position: { x: base.x + cascade, y: base.y + cascade },
        data: {
          tool,
          group,
          highRisk: entry?.highRisk ?? false,
          description: entry?.description ?? "",
          params: {},
        },
      };
      setNodes((current) => [...current, node]);
      setSelectedId(node.id);
      setMenuFlow(null);
    },
    [toolGroups, menuFlow, reactFlow, nodes.length, setNodes],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange<RFNode>[]) => {
      onNodesChange(changes);
      for (const change of changes) {
        if (change.type === "remove") {
          setEdges((current) =>
            current.filter(
              (edge) =>
                edge.source !== change.id && edge.target !== change.id,
            ),
          );
          setSelectedId((current) =>
            current === change.id ? null : current,
          );
        }
      }
    },
    [onNodesChange, setEdges],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) {
        return;
      }
      if (connection.source === connection.target) {
        return;
      }
      const duplicate = edges.some(
        (edge) =>
          edge.source === connection.source &&
          edge.target === connection.target,
      );
      if (duplicate) {
        return;
      }
      setEdges((current) =>
        addEdge(
          {
            ...connection,
            id: freshId("edge"),
          },
          current,
        ),
      );
    },
    [edges, setEdges],
  );

  /** 生成提交给后端执行/保存的纯 JSON 图 */
  const buildGraph = useCallback(() => {
    const nodeRecords: Record<string, FlowNodeRecord> = {};
    for (const node of nodes) {
      nodeRecords[node.id] = {
        id: node.id,
        tool: node.data.tool,
        params: node.data.params ?? {},
        position: node.position,
      };
    }
    const edgeRecords: Record<string, FlowEdgeRecord> = {};
    for (const edge of edges) {
      edgeRecords[edge.id] = {
        id: edge.id,
        source: edge.source,
        target: edge.target,
      };
    }
    return { nodeRecords, edgeRecords };
  }, [nodes, edges]);

  const runGraph = useCallback(async () => {
    if (nodes.length === 0) {
      setNotice(
        showFlowNotice("info", zh ? "画布还是空的，右键添加工具节点" : "Empty canvas — right-click to add tools"),
      );
      return;
    }
    setRunning(true);
    setShowLog(false);
    setNodes((current) =>
      current.map((node) => ({
        ...node,
        data: { ...node.data, status: "running" as const, error: undefined },
      })),
    );
    try {
      const { nodeRecords, edgeRecords } = buildGraph();
      const result = await runFlowDraft({
        nodes: nodeRecords,
        edges: edgeRecords,
      });
      setRunResult(result);
      setShowLog(true);
      const statusByNode = new Map<string, FlowNodeData["status"]>();
      const errorByNode = new Map<string, string>();
      for (const step of result.steps) {
        statusByNode.set(step.nodeId, step.status);
        if (step.error) {
          errorByNode.set(step.nodeId, step.error);
        }
      }
      setNodes((current) =>
        current.map((node) => {
          const status = statusByNode.get(node.id);
          if (!status) {
            return node;
          }
          return {
            ...node,
            data: {
              ...node.data,
              status,
              error: errorByNode.get(node.id),
            },
          };
        }),
      );
      const failed = result.steps.filter((step) => step.status !== "ok").length;
      setNotice(
        showFlowNotice(
          failed > 0 ? "error" : "success",
          failed > 0
            ? zh
              ? `执行完成，但有 ${failed} 个节点失败/跳过`
              : `Finished with ${failed} failed/skipped node(s)`
            : zh
              ? `执行成功：${result.steps.length} 个节点全部完成`
              : `Success: all ${result.steps.length} node(s) completed`,
        ),
      );
    } catch (error) {
      setNotice(
        showFlowNotice(
          "error",
          error instanceof Error ? error.message : "执行失败",
        ),
      );
      setNodes((current) =>
        current.map((node) => ({
          ...node,
          data: { ...node.data, status: undefined, error: undefined },
        })),
      );
    } finally {
      setRunning(false);
    }
  }, [buildGraph, nodes.length, setNodes, zh]);

  const saveGraph = useCallback(async () => {
    const name = flowName.trim();
    if (name.length === 0) {
      setNotice(
        showFlowNotice("info", zh ? "先为流程起个名字" : "Name the flow first"),
      );
      return;
    }
    const { nodeRecords, edgeRecords } = buildGraph();
    try {
      const saved =
        currentFlowId !== null
          ? await updateFlow(currentFlowId, {
              name,
              description: "",
              nodes: nodeRecords,
              edges: edgeRecords,
            })
          : await createFlow({
              name,
              description: "",
              nodes: nodeRecords,
              edges: edgeRecords,
            });
      setCurrentFlowId(saved.id);
      setNotice(
        showFlowNotice("success", zh ? "流程已保存" : "Flow saved"),
      );
      await refreshFlows();
    } catch (error) {
      setNotice(
        showFlowNotice(
          "error",
          error instanceof Error ? error.message : "保存失败",
        ),
      );
    }
  }, [buildGraph, currentFlowId, flowName, refreshFlows, zh]);

  const loadFlow = useCallback(
    (flow: FlowView) => {
      const nextNodes: RFNode[] = Object.values(flow.nodes ?? {}).map(
        (record) => {
          const entry = findTool(toolGroups, record.tool);
          return {
            id: record.id,
            type: "tool" as const,
            position: record.position ?? { x: 120, y: 100 },
            data: {
              tool: record.tool,
              group: toolGroupOf(record.tool),
              highRisk: entry?.highRisk ?? false,
              description: entry?.description ?? "",
              params: record.params ?? {},
            },
          };
        },
      );
      const nextEdges: Edge[] = Object.values(flow.edges ?? {}).map(
        (record) => ({
          id: record.id,
          source: record.source,
          target: record.target,
        }),
      );
      setNodes(nextNodes);
      setEdges(nextEdges);
      setCurrentFlowId(flow.id);
      setFlowName(flow.name);
      setSelectedId(null);
      setRunResult(null);
      setShowLog(false);
      setFlowsAnchor(null);
      globalThis.requestAnimationFrame(() => {
        reactFlow.fitView({ padding: 0.2, duration: 260 });
      });
    },
    [reactFlow, setEdges, setNodes, toolGroups],
  );

  /** AI 助手通过 MCP flow.open 下发：在画布中载入某个已保存流程 */
  const openFlowById = useCallback(
    async (flowId: number) => {
      if (lastOpenedFlowRef.current === flowId) {
        return;
      }
      lastOpenedFlowRef.current = flowId;
      try {
        const flow = await fetchFlow(flowId);
        loadFlow(flow);
        setNotice(
          showFlowNotice("success", zh ? `已在画布打开流程：${flow.name}` : `Opened flow: ${flow.name}`),
        );
      } catch (error) {
        lastOpenedFlowRef.current = null;
        setNotice(
          showFlowNotice(
            "error",
            error instanceof Error ? error.message : "打开流程失败",
          ),
        );
      }
    },
    [loadFlow, zh],
  );

  // 监听 AI 助手“打开流程到画布”事件；若跳转期间事件先于画布挂载，
  // 用 sessionStorage 兜底（见 ui-action-executor 的 flow_open 处理）。
  useEffect(() => {
    const onFlowOpen = (event: Event): void => {
      const detail = (event as CustomEvent<{ flowId?: number }>).detail;
      const flowId = Number(detail?.flowId ?? 0);
      if (Number.isFinite(flowId) && flowId > 0) {
        void openFlowById(flowId);
      }
    };
    window.addEventListener("pm-flow-open", onFlowOpen);
    let pendingId = 0;
    try {
      const raw = globalThis.sessionStorage.getItem("pm:flow:open");
      if (raw) {
        globalThis.sessionStorage.removeItem("pm:flow:open");
        const parsed = Number(raw);
        if (Number.isFinite(parsed) && parsed > 0) {
          pendingId = parsed;
        }
      }
    } catch {
      void 0;
    }
    const timer = pendingId > 0 ? window.setTimeout(() => {
      void openFlowById(pendingId);
    }, 600) : null;
    return () => {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      window.removeEventListener("pm-flow-open", onFlowOpen);
    };
  }, [openFlowById]);

  const removeSaved = useCallback(
    async (flowId: number) => {
      try {
        await deleteFlow(flowId);
        await refreshFlows();
        if (currentFlowId === flowId) {
          setCurrentFlowId(null);
        }
        setNotice(
          showFlowNotice("success", zh ? "已删除流程" : "Flow deleted"),
        );
      } catch (error) {
        setNotice(
          showFlowNotice(
            "error",
            error instanceof Error ? error.message : "删除失败",
          ),
        );
      }
    },
    [currentFlowId, refreshFlows, zh],
  );

  /** 载入一组内置模板：直接搭建好可连通的示例流程 */
  const loadTemplate = useCallback(
    (template: "gis-inspect" | "gis-search") => {
      const gisEntry = findTool(toolGroups, "gis.inspect");
      const searchEntry = findTool(toolGroups, "gis.search_pipes");
      const listEntry = findTool(toolGroups, "data_files.list");
      const makeNode = (
        id: string,
        tool: string,
        entry: FlowToolEntry | undefined,
        x: number,
        y: number,
        params: Record<string, unknown> = {},
      ): RFNode => ({
        id,
        type: "tool",
        position: { x, y },
        data: {
          tool,
          group: toolGroupOf(tool),
          highRisk: entry?.highRisk ?? false,
          description: entry?.description ?? "",
          params,
        },
      });
      const nodes: RFNode[] = [];
      const edges: Edge[] = [];
      if (template === "gis-inspect") {
        nodes.push(makeNode("list", "data_files.list", listEntry, 60, 160));
        nodes.push(
          makeNode(
            "inspect",
            "gis.inspect",
            gisEntry,
            420,
            160,
            { fileId: "{{list.files.0.id}}" },
          ),
        );
        edges.push({ id: "e1", source: "list", target: "inspect" });
        setFlowName(zh ? "GIS 数据文件预览" : "GIS file overview");
      } else {
        nodes.push(makeNode("list", "data_files.list", listEntry, 60, 160));
        nodes.push(
          makeNode(
            "search",
            "gis.search_pipes",
            searchEntry,
            430,
            160,
            { fileId: "{{list.files.0.id}}", network: "", code: "", limit: 10 },
          ),
        );
        edges.push({ id: "e1", source: "list", target: "search" });
        setFlowName(zh ? "GIS 管段检索" : "GIS pipe search");
      }
      setNodes(nodes);
      setEdges(edges);
      setCurrentFlowId(null);
      setSelectedId(null);
      setRunResult(null);
      setShowLog(false);
      setTemplateAnchor(null);
      globalThis.requestAnimationFrame(() => {
        reactFlow.fitView({ padding: 0.3, duration: 260 });
      });
    },
    [reactFlow, setEdges, setNodes, toolGroups, zh],
  );

  const updateParam = useCallback(
    (nodeId: string, key: string, value: unknown) => {
      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  params: { ...(node.data.params ?? {}), [key]: value },
                },
              }
            : node,
        ),
      );
    },
    [setNodes],
  );

  const removeSelectedNode = useCallback(() => {
    if (!selectedId) {
      return;
    }
    setNodes((current) => current.filter((node) => node.id !== selectedId));
    setEdges((current) =>
      current.filter(
        (edge) => edge.source !== selectedId && edge.target !== selectedId,
      ),
    );
    setSelectedId(null);
  }, [selectedId, setEdges, setNodes]);

  const selectedNode = nodes.find((node) => node.id === selectedId) ?? null;
  const selectedEntry = selectedNode
    ? findTool(toolGroups, selectedNode.data.tool)
    : undefined;

  const okCount = runResult
    ? runResult.steps.filter((step) => step.status === "ok").length
    : 0;
  const failCount = runResult
    ? runResult.steps.filter((step) => step.status === "failed").length
    : 0;
  const skipCount = runResult
    ? runResult.steps.filter((step) => step.status === "skipped").length
    : 0;

  return (
    <Box
      sx={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        backgroundColor: "#fafbfc",
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onNodeClick={(_, node) => setSelectedId(node.id)}
        onPaneClick={() => {
          setSelectedId(null);
          setMenuFlow(null);
          setHoverGroup(null);
        }}
        onPaneContextMenu={(event) => {
          event.preventDefault();
          openNodeMenu(event.clientX, event.clientY);
        }}
        onNodeContextMenu={(event, node) => {
          event.preventDefault();
          setSelectedId(node.id);
          openNodeMenu(event.clientX, event.clientY);
        }}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        minZoom={0.15}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        defaultEdgeOptions={{ type: "smoothstep", animated: true }}
        style={{ position: "absolute", inset: 0 }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1.5}
          color="#d7dde6"
        />
        {/* 右下角：小地图在右，缩放控件在小地图左侧 */}
        <MiniMap
          pannable
          zoomable
          bgColor="#ffffff"
          maskColor={miniMaskOn ? "rgba(22, 100, 255, 0.05)" : "rgba(22, 100, 255, 0)"}
          maskStrokeColor={miniMaskOn ? "#1664ff" : "rgba(22, 100, 255, 0)"}
          maskStrokeWidth={2}
          nodeColor="#1664ff"
          nodeBorderRadius={4}
          style={{
            width: 200,
            height: 110,
            borderRadius: 12,
            border: "1px solid var(--pm-color-border)",
            boxShadow: "0 4px 16px rgb(16 24 40 / 0.08)",
          }}
        />
        <Controls
          position="bottom-right"
          showInteractive={false}
          style={{
            right: 216,
            borderRadius: 12,
            border: "1px solid var(--pm-color-border)",
            overflow: "hidden",
            boxShadow: "0 4px 16px rgb(16 24 40 / 0.08)",
          }}
        />
      </ReactFlow>

      {/* 空画布提示 */}
      {nodes.length === 0 && (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            gap: 1,
          }}
        >
          <Typography
            sx={{
              fontSize: 15,
              fontWeight: 600,
              color: "var(--pm-color-text-secondary)",
            }}
          >
            {zh ? "右键画布，添加 MCP 工具节点" : "Right-click the canvas to add MCP tool nodes"}
          </Typography>
          <Typography sx={{ fontSize: 12, color: "var(--pm-color-text-hint)" }}>
            {zh
              ? "用连线串联节点即可编排一套可执行的流程"
              : "Connect nodes to compose an executable flow"}
          </Typography>
        </Box>
      )}

      {/* ===== 右上角胶囊操作栏（与顶部退出按钮同高，位于其下方）===== */}
      <Stack
        direction="row"
        spacing={1}
        sx={{
          position: "absolute",
          right: { xs: 16, sm: 32 },
          top: 72,
          zIndex: 20,
          alignItems: "center",
        }}
      >
        <CapsuleField value={flowName} onChange={setFlowName} placeholder={zh ? "未命名流程" : "Untitled flow"} />

        <CapsuleButton
          label={zh ? "运行" : "Run"}
          loading={running}
          disabled={running || nodes.length === 0}
          startIcon={<PlayArrowRounded sx={{ fontSize: 17 }} />}
          onClick={() => void runGraph()}
        />

        <CapsuleButton
          label={zh ? "保存" : "Save"}
          startIcon={<SaveRounded sx={{ fontSize: 17 }} />}
          onClick={() => void saveGraph()}
        />

        <CapsuleButton
          label={zh ? "我的流程" : "My flows"}
          startIcon={<FolderOpenRounded sx={{ fontSize: 17 }} />}
          onClick={(event) => setFlowsAnchor(event.currentTarget)}
        />

        <CapsuleButton
          label={zh ? "模板" : "Templates"}
          startIcon={<ListAltRounded sx={{ fontSize: 17 }} />}
          onClick={(event) => setTemplateAnchor(event.currentTarget)}
        />

        {runResult && (
          <CapsuleButton
            label={
              zh
                ? `结果 ${okCount}✓ ${failCount}✗ ${skipCount}—`
                : `Result ${okCount}✓ ${failCount}✗ ${skipCount}—`
            }
            startIcon={<TerminalRounded sx={{ fontSize: 17 }} />}
            active={showLog}
            onClick={() => setShowLog((value) => !value)}
          />
        )}

        <CapsuleButton
          label={zh ? "清空" : "Clear"}
          disabled={nodes.length === 0}
          onClick={() => {
            setNodes([]);
            setEdges([]);
            setSelectedId(null);
            setCurrentFlowId(null);
            setRunResult(null);
            setShowLog(false);
          }}
          icon={<DeleteOutlineRounded sx={{ fontSize: 17 }} />}
        />
      </Stack>

      {/* 模板 Popover */}
      <Popover
        open={templateAnchor !== null}
        anchorEl={templateAnchor}
        onClose={() => setTemplateAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        sx={{ zIndex: 30 }}
        slotProps={{
          paper: {
            sx: {
              mt: 0.75,
              width: 300,
              borderRadius: "var(--pm-radius-lg)",
              border: "1px solid var(--pm-color-border)",
              boxShadow: "0 12px 32px rgb(16 24 40 / 0.12)",
              overflow: "hidden",
            },
          },
        }}
      >
        <Box sx={{ px: 1.5, py: 1 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
            {zh ? "内置示例流程" : "Built-in flow templates"}
          </Typography>
        </Box>
        <Box sx={{ px: 0.5, pb: 0.5 }}>
          <Stack
            direction="row"
            onClick={() => loadTemplate("gis-inspect")}
            sx={{
              alignItems: "center",
              columnGap: 0.75,
              px: 1,
              py: 0.75,
              borderRadius: "var(--pm-radius-md)",
              cursor: "pointer",
              "&:hover": { backgroundColor: "var(--pm-color-primary-soft)" },
            }}
          >
            <ListAltRounded sx={{ fontSize: 16, color: "var(--pm-color-primary)" }} />
            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                {zh ? "数据文件 → GIS 概览" : "File list → GIS overview"}
              </Typography>
              <Typography sx={{ fontSize: 10.5, color: "var(--pm-color-text-hint)" }}>
                {zh
                  ? "先列出数据文件，再自动把第一个文件交给 gis.inspect"
                  : "List files, then feed the first file into gis.inspect"}
              </Typography>
            </Box>
          </Stack>
          <Stack
            direction="row"
            onClick={() => loadTemplate("gis-search")}
            sx={{
              alignItems: "center",
              columnGap: 0.75,
              px: 1,
              py: 0.75,
              borderRadius: "var(--pm-radius-md)",
              cursor: "pointer",
              "&:hover": { backgroundColor: "var(--pm-color-primary-soft)" },
            }}
          >
            <ListAltRounded sx={{ fontSize: 16, color: "var(--pm-color-primary)" }} />
            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                {zh ? "数据文件 → GIS 管段检索" : "File list → GIS search"}
              </Typography>
              <Typography sx={{ fontSize: 10.5, color: "var(--pm-color-text-hint)" }}>
                {zh
                  ? "列出数据文件并把第一个文件交给 gis.search_pipes"
                  : "List files, then feed the first file into gis.search_pipes"}
              </Typography>
            </Box>
          </Stack>
        </Box>
      </Popover>

      {/* 我的流程 Popover */}
      <Popover
        open={flowsAnchor !== null}
        anchorEl={flowsAnchor}
        onClose={() => setFlowsAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        sx={{ zIndex: 30 }}
        slotProps={{
          paper: {
            sx: {
              mt: 0.75,
              width: 300,
              borderRadius: "var(--pm-radius-lg)",
              border: "1px solid var(--pm-color-border)",
              boxShadow: "0 12px 32px rgb(16 24 40 / 0.12)",
              overflow: "hidden",
            },
          },
        }}
      >
        <Box sx={{ px: 1.5, py: 1 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
            {zh ? "已保存的流程" : "Saved flows"}
          </Typography>
        </Box>
        <Box sx={{ maxHeight: 320, overflowY: "auto", px: 0.5, pb: 0.5 }}>
          {flows.length === 0 ? (
            <Typography
              sx={{
                px: 1.5,
                py: 1.5,
                fontSize: 12,
                color: "var(--pm-color-text-hint)",
              }}
            >
              {zh ? "还没有保存任何流程" : "No saved flows yet"}
            </Typography>
          ) : (
            flows.map((flow) => (
              <Stack
                key={flow.id}
                direction="row"
                onClick={() => loadFlow(flow)}
                sx={{
                  alignItems: "center",
                  columnGap: 0.5,
                  px: 1,
                  py: 0.75,
                  borderRadius: "var(--pm-radius-md)",
                  cursor: "pointer",
                  "&:hover": { backgroundColor: "var(--pm-color-primary-soft)" },
                }}
              >
                <ListAltRounded sx={{ fontSize: 16, color: "var(--pm-color-text-hint)" }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {flow.name}
                  </Typography>
                  <Typography sx={{ fontSize: 10.5, color: "var(--pm-color-text-hint)" }}>
                    {Object.keys(flow.nodes ?? {}).length} {zh ? "个节点" : "nodes"}
                  </Typography>
                </Box>
                <IconButton
                  size="small"
                  onClick={(event) => {
                    event.stopPropagation();
                    void removeSaved(flow.id);
                  }}
                  sx={{ color: "var(--pm-color-text-hint)" }}
                >
                  <DeleteOutlineRounded sx={{ fontSize: 16 }} />
                </IconButton>
              </Stack>
            ))
          )}
        </Box>
      </Popover>

      {/* ===== 右键：系统式级联菜单（锚定画布坐标，随缩放/平移实时跟随） ===== */}
      {menuFlow && menuScreen && (
        <Box
          ref={menuWrapRef}
          onMouseDown={(event) => event.stopPropagation()}
          onMouseLeave={() => setHoverGroup(null)}
          sx={{
            position: "fixed",
            left: menuScreen.x,
            top: menuScreen.y,
            zIndex: 60,
            display: "inline-block",
          }}
        >
          {/* 一级菜单 */}
          <Paper
            elevation={0}
            sx={{
              position: "relative",
              width: 250,
              maxHeight: "66vh",
              display: "flex",
              flexDirection: "column",
              borderRadius: "var(--pm-radius-lg)",
              border: "1px solid var(--pm-color-border)",
              boxShadow: "0 16px 44px rgb(16 24 40 / 0.16)",
              backgroundColor: "rgba(255,255,255,0.97)",
              backdropFilter: "blur(16px) saturate(150%)",
              overflow: "visible",
            }}
          >
            <Box sx={{ px: 1.25, py: 0.75, borderBottom: "1px solid var(--pm-color-divider)" }}>
              <Stack direction="row" sx={{ alignItems: "center", columnGap: 0.5 }}>
                <AddRounded sx={{ fontSize: 16, color: "var(--pm-color-primary)" }} />
                <Typography sx={{ fontSize: 12.5, fontWeight: 700 }}>
                  {zh ? "添加 MCP 工具节点" : "Add MCP tool node"}
                </Typography>
              </Stack>
              <TextField
                size="small"
                fullWidth
                autoFocus
                value={menuQuery}
                onChange={(event) => setMenuQuery(event.target.value)}
                placeholder={zh ? "搜索工具…" : "Search tools…"}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchRounded sx={{ fontSize: 16, color: "var(--pm-color-text-hint)" }} />
                      </InputAdornment>
                    ),
                  },
                }}
                sx={{
                  mt: 0.75,
                  "& fieldset": { border: "none" },
                  "& .MuiOutlinedInput-root": {
                    borderRadius: "var(--pm-radius-md)",
                    backgroundColor: "#f6f7f9",
                  },
                }}
              />
            </Box>
            <Box sx={{ position: "relative", flex: "1 1 auto", minHeight: 0, overflowY: "auto", py: 0.5 }}>
              {menuQuery.trim().length > 0 ? (
                /* 搜索态：平铺展示命中工具 */
                (() => {
                  const hits = [];
                  const q = menuQuery.trim().toLowerCase();
                  for (const [group, list] of Object.entries(toolGroups)) {
                    for (const tool of list) {
                      if (
                        tool.name.toLowerCase().includes(q) ||
                        (tool.description ?? "").toLowerCase().includes(q)
                      ) {
                        hits.push({ group, tool });
                      }
                    }
                  }
                  if (hits.length === 0) {
                    return (
                      <Typography sx={{ px: 1.5, py: 2, fontSize: 12, color: "var(--pm-color-text-hint)" }}>
                        {zh ? "没有匹配的工具" : "No matching tools"}
                      </Typography>
                    );
                  }
                  return hits.map(({ group, tool }) => (
                    <ToolMenuRow
                      key={tool.name}
                      zh={zh}
                      icon={groupIconOf(group)}
                      name={toolDisplayName(tool.name)}
                      hint={tool.highRisk ? tool.name : tool.description}
                      highRisk={tool.highRisk ?? false}
                      onClick={() => addToolNode(tool.name)}
                    />
                  ));
                })()
              ) : (
                /* 分级：一级分类行，悬停浮出二级子菜单 */
                Object.entries(toolGroups).map(([group, list], index) => (
                  <MenuGroupRow
                    key={group}
                    zh={zh}
                    active={hoverGroup === group}
                    icon={groupIconOf(group)}
                    name={groupLabel(group, zh)}
                    count={list.length}
                    onHover={(event) => {
                      const wrap = menuWrapRef.current;
                      const rowTop = event.currentTarget.getBoundingClientRect().top;
                      setHoverGroup(group);
                      setHoverTop(Math.round(rowTop - (wrap?.getBoundingClientRect().top ?? 0)));
                    }}
                  />
                ))
              )}
            </Box>
          </Paper>

          {/* 二级子菜单：与悬停分类行对齐，向右弹出（右侧空间不足时向左）；与一级菜单 4px 重叠避免悬停断档 */}
          {!menuQuery.trim() && hoverGroup && toolGroups[hoverGroup] && (
            <Paper
              elevation={0}
              sx={{
                position: "absolute",
                top: hoverTop,
                left: menuScreen.toLeft ? "auto" : 246,
                right: menuScreen.toLeft ? 246 : "auto",
                zIndex: 61,
                width: 320,
                maxHeight: "60vh",
                overflowY: "auto",
                borderRadius: "var(--pm-radius-lg)",
                border: "1px solid var(--pm-color-border)",
                boxShadow: "0 16px 44px rgb(16 24 40 / 0.18)",
                backgroundColor: "rgba(255,255,255,0.98)",
                backdropFilter: "blur(16px) saturate(150%)",
              }}
            >
              <Box sx={{ px: 1.25, py: 0.75, borderBottom: "1px solid var(--pm-color-divider)" }}>
                <Typography sx={{ fontSize: 11, fontWeight: 700, color: "var(--pm-color-primary)" }}>
                  {groupLabel(hoverGroup, zh)}
                </Typography>
              </Box>
              {(toolGroups[hoverGroup] ?? []).map((tool) => (
                <ToolMenuRow
                  key={tool.name}
                  zh={zh}
                  icon={groupIconOf(hoverGroup)}
                  name={toolDisplayName(tool.name)}
                  hint={tool.highRisk ? tool.name : tool.description}
                  highRisk={tool.highRisk ?? false}
                  onClick={() => addToolNode(tool.name)}
                />
              ))}
            </Paper>
          )}
        </Box>
      )}

{/* ===== 右侧浮动面板：节点参数 / 运行日志 ===== */}
      {(selectedNode || (showLog && runResult)) && (
        <Paper
          elevation={0}
          sx={{
            position: "absolute",
            right: { xs: 16, sm: 32 },
            top: { xs: 120, sm: 128 },
            maxHeight: "calc(100dvh - 190px)",
            width: { xs: "calc(100vw - 32px)", sm: 340 },
            zIndex: 24,
            display: "flex",
            flexDirection: "column",
            borderRadius: "var(--pm-radius-lg)",
            border: "1px solid var(--pm-color-border)",
            boxShadow: "0 14px 40px rgb(16 24 40 / 0.14)",
            backgroundColor: "rgba(255,255,255,0.97)",
            backdropFilter: "blur(16px) saturate(150%)",
            overflow: "hidden",
          }}
        >
          <Stack
            direction="row"
            sx={{ alignItems: "center", px: 1.5, py: 1, borderBottom: "1px solid var(--pm-color-divider)" }}
          >
            {selectedNode ? (
              <>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: "var(--pm-color-primary)",
                  }}
                />
                <Typography sx={{ ml: 0.75, flex: 1, fontSize: 13, fontWeight: 700 }}>
                  {toolDisplayName(selectedNode.data.tool)}
                </Typography>
              </>
            ) : (
              <Typography sx={{ flex: 1, fontSize: 13, fontWeight: 700 }}>
                {zh ? "运行日志" : "Run log"}
              </Typography>
            )}
            <IconButton
              size="small"
              onClick={() => {
                if (showLog && runResult) {
                  setShowLog(false);
                }
                setSelectedId(null);
              }}
              sx={{ color: "var(--pm-color-text-hint)" }}
            >
              <CloseRounded sx={{ fontSize: 16 }} />
            </IconButton>
          </Stack>

          <Box sx={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", p: 1.5 }}>
            {selectedNode ? (
              <>
                <Typography sx={{ mb: 1.5, fontSize: 11, color: "var(--pm-color-text-hint)", lineHeight: 1.6 }}>
                  {selectedNode.data.description || selectedNode.data.tool}
                </Typography>
                {selectedEntry?.highRisk && (
                  <Alert
                    severity="warning"
                    sx={{ mb: 1.5, borderRadius: "var(--pm-radius-md)", fontSize: 11.5 }}
                  >
                    {zh
                      ? "高危工具：执行时只会生成右上角人工确认引导卡，不会在后台直接生效。"
                      : "High-risk tool: running it only creates a manual confirmation card at the top-right; it never acts in the background."}
                  </Alert>
                )}
                <NodeParamsEditor
                  zh={zh}
                  schema={selectedEntry?.jsonSchema}
                  params={selectedNode.data.params ?? {}}
                  onChange={(key, value) => updateParam(selectedNode.id, key, value)}
                />
                <Button
                  fullWidth
                  size="small"
                  color="error"
                  variant="outlined"
                  startIcon={<DeleteOutlineRounded sx={{ fontSize: 16 }} />}
                  onClick={removeSelectedNode}
                  sx={{ mt: 2, borderRadius: "999px", textTransform: "none" }}
                >
                  {zh ? "删除此节点" : "Delete this node"}
                </Button>
              </>
            ) : (
              runResult &&
              (() => {
                const ok = runResult.steps.filter((s) => s.status === "ok");
                const failed = runResult.steps.filter((s) => s.status === "failed");
                const skipped = runResult.steps.filter((s) => s.status === "skipped");
                return (
                  <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
                    <StatPill label={zh ? "成功" : "OK"} count={ok.length} color="#0a8a5f" />
                    <StatPill label={zh ? "失败" : "Failed"} count={failed.length} color="#cf1322" />
                    <StatPill label={zh ? "跳过" : "Skipped"} count={skipped.length} color="#86909c" />
                  </Stack>
                );
              })()
            )}

            {showLog && runResult && (
              <Box sx={{ mt: selectedNode ? 2 : 0 }}>
                {runResult.steps.map((step) => (
                  <StepCard key={step.nodeId} zh={zh} step={step} />
                ))}
              </Box>
            )}
          </Box>
        </Paper>
      )}

      <Snackbar
        open={notice !== null}
        autoHideDuration={4000}
        onClose={() => setNotice(null)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        sx={{ mt: 6, zIndex: 2000 }}
      >
        <Alert
          severity={notice?.kind ?? "info"}
          variant="outlined"
          onClose={() => setNotice(null)}
          sx={{ borderRadius: "999px", backgroundColor: "rgba(255,255,255,0.9)" }}
        >
          {notice?.text}
        </Alert>
      </Snackbar>
    </Box>
  );
}

/* ---------- 小部件 ---------- */

function MenuGroupRow({
  zh,
  active,
  icon,
  name,
  count,
  onHover,
}: {
  zh: boolean;
  active: boolean;
  icon: React.ReactNode;
  name: string;
  count: number;
  onHover: (event: React.MouseEvent<HTMLElement>) => void;
}) {
  return (
    <Stack
      direction="row"
      onMouseEnter={onHover}
      sx={{
        alignItems: "center",
        columnGap: 1,
        px: 1.25,
        py: 0.75,
        borderRadius: "var(--pm-radius-md)",
        cursor: "default",
        color: "var(--pm-color-text-secondary)",
        backgroundColor: active ? "var(--pm-color-primary-soft)" : "transparent",
        "&:hover": {
          backgroundColor: active
            ? "var(--pm-color-primary-soft)"
            : "var(--pm-color-primary-soft)",
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
          color: active ? "var(--pm-color-primary)" : "inherit",
        }}
      >
        {icon}
      </Box>
      <Typography
        sx={{
          flex: 1,
          fontSize: 13,
          fontWeight: active ? 700 : 600,
          color: active ? "var(--pm-color-primary)" : "inherit",
        }}
      >
        {name}
      </Typography>
      <Typography sx={{ fontSize: 11, color: "var(--pm-color-text-hint)" }}>
        {count}
      </Typography>
      <ChevronRightRounded
        sx={{ fontSize: 18, color: "var(--pm-color-text-hint)" }}
      />
    </Stack>
  );
}

function ToolMenuRow({
  zh,
  icon,
  name,
  hint,
  highRisk,
  onClick,
}: {
  zh: boolean;
  icon: React.ReactNode;
  name: string;
  hint?: string;
  highRisk: boolean;
  onClick: () => void;
}) {
  return (
    <Stack
      direction="row"
      onClick={onClick}
      sx={{
        alignItems: "center",
        columnGap: 0.75,
        px: 1.25,
        py: 0.65,
        borderRadius: "var(--pm-radius-md)",
        cursor: "pointer",
        color: "var(--pm-color-text-secondary)",
        "&:hover": {
          backgroundColor: "var(--pm-color-primary-soft)",
          color: "var(--pm-color-primary)",
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
          color: "inherit",
        }}
      >
        {icon}
      </Box>
      <Typography sx={{ fontSize: 13, fontWeight: 600, color: "inherit" }}>
        {name}
      </Typography>
      <Typography
        sx={{
          flex: 1,
          minWidth: 0,
          fontSize: 11,
          color: "var(--pm-color-text-hint)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {hint}
      </Typography>
      {highRisk && (
        <Box
          component="span"
          sx={{
            flexShrink: 0,
            px: 0.6,
            py: 0.1,
            borderRadius: 999,
            fontSize: 9,
            fontWeight: 700,
            color: "#c62828",
            backgroundColor: "rgba(198,40,40,0.08)",
          }}
        >
          {zh ? "高危" : "Risk"}
        </Box>
      )}
    </Stack>
  );
}

function CapsuleButton({
  label,
  primary,
  active,
  loading,
  disabled,
  startIcon,
  icon,
  onClick,
}: {
  label: string;
  primary?: boolean;
  active?: boolean;
  loading?: boolean;
  disabled?: boolean;
  startIcon?: React.ReactNode;
  icon?: React.ReactNode;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <Button
      size="small"
      disableRipple
      disabled={disabled}
      onClick={onClick}
      startIcon={
        loading ? (
          <CircularProgress size={12} color="inherit" sx={{ mr: 0.5 }} />
        ) : (
          startIcon
        )
      }
      sx={{
        minWidth: 0,
        height: 40,
        px: 1.75,
        borderRadius: "999px",
        textTransform: "none",
        whiteSpace: "nowrap",
        fontSize: 13,
        fontWeight: 600,
        color: primary
          ? "var(--pm-color-primary-contrast)"
          : active
            ? "var(--pm-color-primary)"
            : "var(--pm-color-text-secondary)",
        backgroundColor: primary
          ? "var(--pm-color-primary)"
          : active
            ? "var(--pm-color-primary-soft)"
            : "rgba(255,255,255,0.85)",
        border: "1px solid",
        borderColor: primary
          ? "var(--pm-color-primary)"
          : active
            ? "var(--pm-color-primary)"
            : "var(--pm-color-border)",
        backdropFilter: "blur(14px) saturate(150%)",
        boxShadow: primary ? "0 4px 12px var(--pm-color-primary-ring)" : "0 1px 2px rgb(16 24 40 / 0.05)",
        "&:hover": {
          backgroundColor: primary ? "var(--pm-color-primary-hover)" : "var(--pm-color-primary-soft)",
        },
        "&.Mui-disabled": {
          color: "var(--pm-color-text-disabled)",
          backgroundColor: "rgba(255,255,255,0.7)",
        },
      }}
    >
      {icon ?? label}
    </Button>
  );
}

function CapsuleField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <OutlinedInput
      size="small"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      sx={{
        height: 40,
        borderRadius: "999px",
        fontSize: 13,
        fontWeight: 600,
        px: 1.25,
        backgroundColor: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(14px) saturate(150%)",
        "& .MuiOutlinedInput-notchedOutline": {
          border: "1px solid var(--pm-color-border)",
        },
        "&:hover .MuiOutlinedInput-notchedOutline": {
          borderColor: "var(--pm-color-border-strong)",
        },
        "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
          borderColor: "var(--pm-color-primary)",
          borderWidth: 1.5,
        },
      }}
    />
  );
}

function StatPill({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <Box
      sx={{
        px: 1,
        py: 0.4,
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        color,
        backgroundColor: `${color}1c`,
      }}
    >
      {label} {count}
    </Box>
  );
}

function StepCard({
  zh,
  step,
}: {
  zh: boolean;
  step: {
    nodeId: string;
    tool: string;
    status: string;
    ms: number;
    output?: string;
    error?: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const color =
    step.status === "ok"
      ? "#0a8a5f"
      : step.status === "skipped"
        ? "#86909c"
        : "#cf1322";
  const stateText =
    step.status === "ok"
      ? zh
        ? "成功"
        : "OK"
      : step.status === "skipped"
        ? zh
          ? "跳过"
          : "Skipped"
        : zh
          ? "失败"
          : "Failed";
  return (
    <Box
      sx={{
        mb: 1,
        borderRadius: "var(--pm-radius-md)",
        border: "1px solid var(--pm-color-border)",
        overflow: "hidden",
      }}
    >
      <Stack
        direction="row"
        onClick={() => setOpen((value) => !value)}
        sx={{ alignItems: "center", columnGap: 0.75, px: 1, py: 0.7, cursor: "pointer" }}
      >
        <Box sx={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: color }} />
        <Typography sx={{ flex: 1, fontSize: 12.5, fontWeight: 600 }}>
          {toolDisplayName(step.tool)}
        </Typography>
        <Typography sx={{ fontSize: 10.5, color: "var(--pm-color-text-hint)" }}>
          {step.status === "ok" ? `${step.ms} ms` : stateText}
        </Typography>
      </Stack>
      {(open || step.status === "failed") && (step.output || step.error) && (
        <Box
          sx={{
            px: 1,
            py: 0.75,
            borderTop: "1px solid var(--pm-color-divider)",
            backgroundColor: "#fafbfc",
          }}
        >
          <Typography
            component="pre"
            sx={{
              m: 0,
              fontSize: 10.5,
              color: step.error ? "#cf1322" : "var(--pm-color-text-secondary)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
            }}
          >
            {step.error ?? step.output}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

function NodeParamsEditor({
  zh,
  schema,
  params,
  onChange,
}: {
  zh: boolean;
  schema?: FlowToolJsonSchema;
  params: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  const properties = schema?.properties ?? {};
  const keys = Object.keys(properties);
  if (keys.length === 0) {
    return (
      <Typography sx={{ fontSize: 12, color: "var(--pm-color-text-hint)" }}>
        {zh ? "此工具无需参数" : "This tool takes no arguments"}
      </Typography>
    );
  }
  return (
    <Box>
      {keys.map((key) => {
        const prop = properties[key];
        const type = prop?.type ?? "string";
        const current = params[key];
        if (prop?.enum && prop.enum.length > 0) {
          return (
            <Box key={key} sx={{ mb: 1 }}>
              <Typography sx={{ mb: 0.3, fontSize: 11.5, fontWeight: 600 }}>
                {key}
              </Typography>
              <Select
                size="small"
                fullWidth
                displayEmpty
                value={typeof current === "string" ? current : ""}
                onChange={(event) => onChange(key, event.target.value)}
                sx={{ "& fieldset": { borderRadius: "var(--pm-radius-md)" } }}
              >
                <MenuItem value="">
                  <em style={{ fontSize: 12, color: "#94a3b8" }}>
                    {zh ? "（默认）" : "(default)"}
                  </em>
                </MenuItem>
                {prop.enum.map((value) => (
                  <MenuItem key={value} value={value}>
                    {value}
                  </MenuItem>
                ))}
              </Select>
            </Box>
          );
        }
        if (type === "boolean") {
          return (
            <FormControlLabel
              key={key}
              control={
                <Checkbox
                  size="small"
                  checked={current === true}
                  onChange={(event) => onChange(key, event.target.checked)}
                />
              }
              label={<Typography sx={{ fontSize: 12.5 }}>{key}</Typography>}
              sx={{ mb: 0.5, display: "flex" }}
            />
          );
        }
        return (
          <Box key={key} sx={{ mb: 1 }}>
            <Typography sx={{ mb: 0.3, fontSize: 11.5, fontWeight: 600 }}>
              {key}
            </Typography>
            <OutlinedInput
              size="small"
              fullWidth
              type={type === "number" ? "number" : "text"}
              value={current === undefined || current === null ? "" : String(current)}
              placeholder={zh ? "支持 {{节点id.路径}} 引用" : "Supports {{nodeId.path}} refs"}
              onChange={(event) => {
                const raw = event.target.value;
                onChange(
                  key,
                  type === "number" ? (raw === "" ? undefined : Number(raw)) : raw,
                );
              }}
              sx={{ "& fieldset": { borderRadius: "var(--pm-radius-md)" } }}
            />
          </Box>
        );
      })}
      <Typography sx={{ mt: 0.5, fontSize: 10.5, color: "var(--pm-color-text-hint)", lineHeight: 1.6 }}>
        {zh
          ? "文本参数可填 {{节点id.路径}} 引用上游输出，例如 {{node1.files.0.id}}。"
          : "Text params accept {{nodeId.path}} to reference upstream output, e.g. {{node1.files.0.id}}."}
      </Typography>
    </Box>
  );
}
