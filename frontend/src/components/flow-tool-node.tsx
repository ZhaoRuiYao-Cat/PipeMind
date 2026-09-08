"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import { toolDisplayName } from "@/lib/flow-api";

/** 工具节点的 data 载荷。 */
export interface FlowNodeData {
  tool: string;
  group: string;
  highRisk?: boolean;
  description?: string;
  params?: Record<string, unknown>;
  status?: "ok" | "failed" | "skipped" | "running";
  error?: string;
  [key: string]: unknown;
}

/** 统一使用主题蓝作为流程节点强调色。 */
export const NODE_ACCENT = "#1664ff";

const zhStatus = (status: string): string =>
  status === "ok"
    ? "执行成功"
    : status === "failed"
      ? "执行失败"
      : status === "running"
        ? "运行中"
        : "已跳过";

function FlowToolNodeComponent(props: NodeProps) {
  const data = (props.data ?? {}) as FlowNodeData;
  const selected = props.selected === true;
  // 统一使用主题蓝作为节点强调色，避免画布五颜六色
  const color = "var(--pm-color-primary)";
  const running = data.status === "running";
  const ok = data.status === "ok";
  const failed = data.status === "failed";
  const skipped = data.status === "skipped";

  return (
    <Box
      sx={{
        width: 210,
        borderRadius: "var(--pm-radius-lg)",
        border: "1px solid",
        borderColor: failed
          ? "#cf1322"
          : selected
            ? "var(--pm-color-primary)"
            : "var(--pm-color-border)",
        outline:
          selected || running
            ? `1.5px solid ${
                running ? "transparent" : "var(--pm-color-primary-ring)"
              }`
            : "none",
        backgroundColor: "rgba(255,255,255,0.96)",
        boxShadow: selected
          ? "0 10px 28px rgb(16 24 40 / 0.12)"
          : "0 2px 10px rgb(16 24 40 / 0.06)",
        overflow: "hidden",
        fontFamily: "var(--pm-font-family)",
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: 10,
          height: 10,
          border: "2px solid #ffffff",
          backgroundColor: color,
        }}
      />
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          columnGap: 0.75,
          px: 1.25,
          py: 0.75,
          background:
            selected || running
              ? "var(--pm-color-primary-soft)"
              : "transparent",
        }}
      >
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            flexShrink: 0,
            backgroundColor: color,
          }}
        />
        <Typography
          sx={{
            flex: 1,
            minWidth: 0,
            fontSize: 13,
            fontWeight: 600,
            color: "var(--pm-color-text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {toolDisplayName(data.tool)}
        </Typography>
        {data.highRisk === true && (
          <Box
            sx={{
              flexShrink: 0,
              px: 0.6,
              py: 0.1,
              borderRadius: 999,
              fontSize: 9.5,
              fontWeight: 700,
              color: "#cf1322",
              backgroundColor: "rgb(207 19 34 / 0.08)",
            }}
          >
            高危
          </Box>
        )}
      </Box>
      <Box sx={{ px: 1.25, py: 0.7 }}>
        <Typography
          sx={{
            fontSize: 10.5,
            lineHeight: 1.5,
            color: "var(--pm-color-text-hint)",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {data.description || data.tool}
        </Typography>
      </Box>
      {running && (
        <Box
          sx={{
            px: 1.25,
            py: 0.5,
            borderTop: "1px solid var(--pm-color-divider)",
            color: color,
            fontSize: 10.5,
            fontWeight: 600,
          }}
        >
          运行中…
        </Box>
      )}
      {(ok || failed || skipped) && (
        <Box
          sx={{
            px: 1.25,
            py: 0.55,
            borderTop: "1px solid var(--pm-color-divider)",
            color: failed
              ? "#cf1322"
              : skipped
                ? "var(--pm-color-text-hint)"
                : "#0a8a5f",
            fontSize: 10.5,
            fontWeight: 600,
          }}
        >
          {zhStatus(data.status ?? "")}
        </Box>
      )}
      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: 10,
          height: 10,
          border: "2px solid #ffffff",
          backgroundColor: color,
        }}
      />
    </Box>
  );
}

export const FlowToolNode = memo(FlowToolNodeComponent);
