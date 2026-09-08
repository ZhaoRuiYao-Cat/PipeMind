"use client";

import { useCallback, useEffect, useState } from "react";
import { ThemeProvider } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import ErrorOutlineRounded from "@mui/icons-material/ErrorOutlineRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import { pmTheme } from "@/lib/theme";
import { API_BASE } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

interface McpToolView {
  name: string;
  description: string;
  jsonSchema: {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
  highRisk: boolean;
}

interface McpStatusView {
  name: string;
  version: string;
  protocol: string;
  totalTools: number;
  sessionCount: number;
  groups: Record<string, McpToolView[]>;
}

const GROUP_LABELS: Record<string, { "zh-CN": string; "en-US": string }> = {
  notifications: { "zh-CN": "通知", "en-US": "Notifications" },
  user_settings: { "zh-CN": "用户设置", "en-US": "User settings" },
  ai_providers: { "zh-CN": "AI 配置", "en-US": "AI providers" },
  sessions: { "zh-CN": "登录会话", "en-US": "Sessions" },
  account: { "zh-CN": "账户", "en-US": "Account" },
  ui: { "zh-CN": "界面控制", "en-US": "UI control" },
  data_files: { "zh-CN": "数据文件", "en-US": "Data files" },
  core: { "zh-CN": "核心", "en-US": "Core" },
};

export default function McpStatusPage() {
  const { t, lang } = useI18n();
  const zh = lang === "zh-CN";
  const [status, setStatus] = useState<McpStatusView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE}/mcp/status`, {
        credentials: "include",
      });
      if (!response.ok) {
        setError(`HTTP ${response.status}`);
        setLoading(false);
        return;
      }
      const data = (await response.json()) as McpStatusView;
      setStatus(data);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 10000);
    return () => {
      window.clearInterval(timer);
    };
  }, [load]);

  return (
    <ThemeProvider theme={pmTheme}>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          px: { xs: 2.5, sm: 4, md: 10 },
          pt: { xs: 10, sm: 12 },
          pb: 24,
        }}
      >
        <Box sx={{ width: "100%", maxWidth: 880, mx: "auto" }}>
          <Typography
            sx={{
              fontSize: 22,
              fontWeight: 700,
              color: "var(--pm-color-text-primary)",
            }}
          >
            {zh ? "MCP 服务状态" : "MCP Service Status"}
          </Typography>
          <Typography
            sx={{
              mt: 1,
              mb: 4,
              fontSize: 13,
              color: "var(--pm-color-text-hint)",
            }}
          >
            {zh
              ? "模型可调用的工具目录与连接状态，所有功能统一通过 MCP 暴露"
              : "Tool catalog exposed to AI and live connection status"}
          </Typography>

          {loading && !status ? (
            <Stack
              sx={{
                alignItems: "center",
                justifyContent: "center",
                minHeight: 240,
              }}
            >
              <CircularProgress
                size={24}
                sx={{ color: "var(--pm-color-primary)" }}
              />
            </Stack>
          ) : error && !status ? (
            <Paper
              elevation={0}
              variant="outlined"
              sx={{
                borderRadius: "16px",
                borderColor: "var(--pm-color-border)",
                p: 4,
                textAlign: "center",
              }}
            >
              <ErrorOutlineRounded
                sx={{ fontSize: 40, color: "#cf1322" }}
              />
              <Typography
                sx={{
                  mt: 1.5,
                  fontSize: 14,
                  color: "var(--pm-color-text-secondary)",
                }}
              >
                {error}
              </Typography>
              <Button
                variant="outlined"
                size="small"
                onClick={() => void load()}
                sx={{
                  mt: 2,
                  borderRadius: "999px",
                  textTransform: "none",
                  color: "var(--pm-color-primary)",
                }}
              >
                {zh ? "重试" : "Retry"}
              </Button>
            </Paper>
          ) : (
            status && (
              <>
                <Paper
                  elevation={0}
                  variant="outlined"
                  data-guide="mcp-status"
                  sx={{
                    borderRadius: "16px",
                    borderColor: "var(--pm-color-border)",
                    px: { xs: 2.5, sm: 4 },
                    py: { xs: 2.5, sm: 3 },
                  }}
                >
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "center" }}
                  >
                    {error ? (
                      <ErrorOutlineRounded
                        sx={{ fontSize: 20, color: "#cf1322" }}
                      />
                    ) : (
                      <CheckCircleRounded
                        sx={{ fontSize: 20, color: "#2e9e5b" }}
                      />
                    )}
                    <Typography
                      sx={{
                        flex: 1,
                        fontSize: 15,
                        fontWeight: 600,
                        color: "var(--pm-color-text-primary)",
                      }}
                    >
                      {error
                        ? zh
                          ? "连接异常"
                          : "Connection error"
                        : zh
                          ? "服务运行中"
                          : "Service running"}
                    </Typography>
                    <IconButtonSize onClick={() => void load()} />
                  </Stack>
                  <Stack
                    direction="row"
                    sx={{ mt: 2.5, alignItems: "stretch" }}
                  >
                    <StatusItem
                      label={zh ? "服务名" : "Name"}
                      value={status.name}
                      last={false}
                    />
                    <StatusItem
                      label={zh ? "版本" : "Version"}
                      value={status.version}
                      last={false}
                    />
                    <StatusItem
                      label={zh ? "协议" : "Protocol"}
                      value={status.protocol}
                      last={false}
                    />
                    <StatusItem
                      label={zh ? "活跃会话" : "Sessions"}
                      value={String(status.sessionCount)}
                      last={false}
                    />
                    <StatusItem
                      label={zh ? "工具总数" : "Tools"}
                      value={String(status.totalTools)}
                      last
                    />
                  </Stack>
                </Paper>

                <Stack spacing={3} sx={{ mt: 4 }} data-guide="mcp-groups">
                  {Object.entries(status.groups).map(([group, tools]) => {
                    const label =
                      GROUP_LABELS[group]?.[lang] ?? group;
                    return (
                      <Box key={group}>
                        <Stack
                          direction="row"
                          spacing={1.5}
                          sx={{ alignItems: "baseline", mb: 1.5 }}
                        >
                          <Typography
                            sx={{
                              fontSize: 16,
                              fontWeight: 600,
                              color: "var(--pm-color-text-primary)",
                            }}
                          >
                            {label}
                          </Typography>
                          <Typography
                            sx={{
                              fontSize: 12,
                              color: "var(--pm-color-text-hint)",
                            }}
                          >
                            {group}
                          </Typography>
                        </Stack>
                        <Paper
                          elevation={0}
                          variant="outlined"
                          sx={{
                            borderRadius: "16px",
                            borderColor: "var(--pm-color-border)",
                            overflow: "hidden",
                          }}
                        >
                          {tools.map((tool, index) => (
                            <Box key={tool.name}>
                              {index > 0 && (
                                <Box
                                  sx={{
                                    height: 1,
                                    mx: 2.5,
                                    backgroundColor:
                                      "var(--pm-color-divider)",
                                  }}
                                />
                              )}
                              <Box sx={{ px: 2.5, py: 2 }}>
                                <Stack
                                  direction="row"
                                  spacing={1}
                                  sx={{ alignItems: "center" }}
                                >
                                  <Typography
                                    component="code"
                                    sx={{
                                      fontSize: 13,
                                      fontWeight: 600,
                                      color: "var(--pm-color-primary)",
                                    }}
                                  >
                                    {tool.name}
                                  </Typography>
                                  {tool.highRisk && (
                                    <Chip
                                      label={
                                        zh ? "高危" : "High risk"
                                      }
                                      size="small"
                                      sx={{
                                        height: 20,
                                        fontSize: 11,
                                        color: "#cf1322",
                                        backgroundColor:
                                          "rgba(207, 19, 34, 0.08)",
                                      }}
                                    />
                                  )}
                                </Stack>
                                <Typography
                                  sx={{
                                    mt: 0.75,
                                    fontSize: 13,
                                    lineHeight: 1.6,
                                    color: "var(--pm-color-text-secondary)",
                                  }}
                                >
                                  {tool.description}
                                </Typography>
                                {tool.jsonSchema?.properties &&
                                  Object.keys(
                                    tool.jsonSchema.properties,
                                  ).length > 0 && (
                                    <Stack
                                      direction="row"
                                      sx={{
                                        flexWrap: "wrap",
                                        rowGap: 0.5,
                                        columnGap: 1.5,
                                        mt: 1,
                                      }}
                                    >
                                      {Object.entries(
                                        tool.jsonSchema.properties,
                                      ).map(([key, value]) => {
                                        const schema = value as {
                                          type?: string;
                                          enum?: unknown[];
                                        };
                                        const required =
                                          tool.jsonSchema.required?.includes(
                                            key,
                                          ) ?? false;
                                        return (
                                          <Typography
                                            key={key}
                                            component="code"
                                            sx={{
                                              fontSize: 11,
                                              color: required
                                                ? "var(--pm-color-text-primary)"
                                                : "var(--pm-color-text-hint)",
                                            }}
                                          >
                                            {key}
                                            {required ? "*" : ""}
                                            {schema.enum
                                              ? `: ${schema.enum.join("|")}`
                                              : `: ${schema.type ?? ""}`}
                                          </Typography>
                                        );
                                      })}
                                    </Stack>
                                  )}
                              </Box>
                            </Box>
                          ))}
                        </Paper>
                      </Box>
                    );
                  })}
                </Stack>
              </>
            )
          )}
        </Box>
      </Box>
    </ThemeProvider>
  );
}

function StatusItem({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        px: 2,
        py: 1,
        borderRight: last
          ? "none"
          : "1px solid var(--pm-color-divider)",
      }}
    >
      <Typography
        sx={{
          fontSize: 11,
          color: "var(--pm-color-text-hint)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          mt: 0.5,
          fontSize: 15,
          fontWeight: 600,
          color: "var(--pm-color-text-primary)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function IconButtonSize({ onClick }: { onClick: () => void }) {
  const { lang } = useI18n();
  const zh = lang === "zh-CN";
  return (
    <Button
      variant="outlined"
      size="small"
      startIcon={<RefreshRounded sx={{ fontSize: 15 }} />}
      onClick={onClick}
      sx={{
        borderRadius: "999px",
        textTransform: "none",
        fontSize: 12,
        color: "var(--pm-color-text-secondary)",
        borderColor: "var(--pm-color-border)",
        "&:hover": {
          borderColor: "var(--pm-color-primary)",
          color: "var(--pm-color-primary)",
        },
      }}
    >
      {zh ? "刷新" : "Refresh"}
    </Button>
  );
}
