"use client";

// API 文档目录页：左侧接口列表，点选后右侧显示文档（请求方式/参数/响应），支持导出
import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import ContentCopyRounded from "@mui/icons-material/ContentCopyRounded";
import DownloadRounded from "@mui/icons-material/DownloadRounded";
import SearchRounded from "@mui/icons-material/SearchRounded";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Alert from "@mui/material/Alert";
import { useI18n } from "@/lib/i18n";
import { API_BASE } from "@/lib/api";

interface ApiDocEntry {
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

const METHOD_COLOR: Record<string, string> = {
  GET: "#1664ff",
  POST: "#0a8a5f",
  PUT: "#b25e09",
  PATCH: "#7a5af8",
  DELETE: "#cf1322",
};

function jsonBlock(value: unknown): string {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function buildCurl(entry: ApiDocEntry): string {
  const flag =
    entry.method === "GET"
      ? ""
      : ` -X ${entry.method}`;
  const bodyFlag =
    entry.method === "GET" ? "" : " -H 'Content-Type: application/json'";
  const data =
    entry.body !== undefined ? ` -d '${jsonBlock(entry.body)}'` : "";
  return `curl${flag}${bodyFlag} '${entry.path}'${data}`;
}

export default function ApiDocsPage() {
  const { lang } = useI18n();
  const zh = lang === "zh-CN";
  const [entries, setEntries] = useState<ApiDocEntry[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api-catalog`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => {
        const list = (data.entries ?? []) as ApiDocEntry[];
        setEntries(list);
        if (list.length > 0) setSelectedId((cur) => cur ?? list[0].id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const groups = useMemo(() => {
    const list = entries ?? [];
    const keyword = query.trim().toLowerCase();
    const filtered = list.filter(
      (e) =>
        keyword.length === 0 ||
        e.title.toLowerCase().includes(keyword) ||
        e.path.toLowerCase().includes(keyword) ||
        e.group.toLowerCase().includes(keyword),
    );
    const map = new Map<string, ApiDocEntry[]>();
    for (const entry of filtered) {
      const arr = map.get(entry.group) ?? [];
      arr.push(entry);
      map.set(entry.group, arr);
    }
    return Array.from(map.entries());
  }, [entries, query]);

  const selected = entries?.find((e) => e.id === selectedId) ?? null;

  const copyCurl = async (): Promise<void> => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(buildCurl(selected));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", px: { xs: 2, sm: 3 }, py: 2.5 }}>
      <Stack direction="row" sx={{ alignItems: "center", mb: 2 }}>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontSize: 20, fontWeight: 800 }}>{zh ? "API 接口文档" : "API Reference"}</Typography>
          <Typography sx={{ fontSize: 12.5, color: "var(--pm-color-text-hint)" }}>
            {zh
              ? "系统对外开放的全部接口：点击左侧接口查看文档、请求方式与响应示例，支持导出。"
              : "Every external API: pick one on the left to view docs, request method & response, export supported."}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Tooltip title={zh ? "导出 Markdown" : "Export Markdown"}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<DownloadRounded sx={{ fontSize: 16 }} />}
              onClick={() => window.open(`${API_BASE}/api-catalog/export?fmt=markdown`, "_blank")}
            >
              .md
            </Button>
          </Tooltip>
          <Tooltip title={zh ? "导出 JSON" : "Export JSON"}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<DownloadRounded sx={{ fontSize: 16 }} />}
              onClick={() => window.open(`${API_BASE}/api-catalog/export?fmt=json`, "_blank")}
            >
              .json
            </Button>
          </Tooltip>
        </Stack>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}

      {entries === null ? (
        <LinearProgress sx={{ mt: 2 }} />
      ) : (
        <Box sx={{ flex: 1, minHeight: 0, display: "flex", columnGap: 2 }}>
          {/* 左侧：分组接口列表 */}
          <Paper
            elevation={0}
            variant="outlined"
            sx={{ width: 320, flexShrink: 0, borderRadius: "14px", borderColor: "var(--pm-color-border)", display: "flex", flexDirection: "column", overflow: "hidden" }}
          >
            <Box sx={{ p: 1.25, borderBottom: "1px solid var(--pm-color-divider)" }}>
              <TextField
                size="small"
                fullWidth
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={zh ? "搜索接口…" : "Search endpoints…"}
                slotProps={{
                  input: {
                    startAdornment: <SearchRounded sx={{ fontSize: 16, mr: 0.5, color: "var(--pm-color-text-hint)" }} />,
                  },
                }}
                sx={{ "& .MuiOutlinedInput-notchedOutline": { border: "none" } }}
              />
            </Box>
            <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", p: 1 }}>
              {groups.length === 0 && (
                <Typography sx={{ p: 2, fontSize: 12, color: "var(--pm-color-text-hint)" }}>
                  {zh ? "没有匹配的接口" : "No matching endpoints"}
                </Typography>
              )}
              {groups.map(([group, list]) => (
                <Box key={group} sx={{ mb: 1 }}>
                  <Typography sx={{ px: 1, py: 0.5, fontSize: 11, fontWeight: 700, color: "var(--pm-color-text-hint)" }}>
                    {group}
                  </Typography>
                  {list.map((entry) => {
                    const active = entry.id === selected?.id;
                    return (
                      <Stack
                        key={entry.id}
                        direction="row"
                        onClick={() => setSelectedId(entry.id)}
                        sx={{
                          alignItems: "center",
                          columnGap: 1,
                          px: 1,
                          py: 0.75,
                          borderRadius: "10px",
                          cursor: "pointer",
                          backgroundColor: active ? "var(--pm-color-primary-soft)" : "transparent",
                          "&:hover": { backgroundColor: active ? "var(--pm-color-primary-soft)" : "rgba(0,0,0,0.04)" },
                        }}
                      >
                        <Box
                          sx={{
                            flexShrink: 0,
                            width: 46,
                            px: 0.5,
                            py: 0.2,
                            borderRadius: "999px",
                            textAlign: "center",
                            fontSize: 10,
                            fontWeight: 800,
                            color: "#fff",
                            backgroundColor: METHOD_COLOR[entry.method] ?? "#6b7280",
                          }}
                        >
                          {entry.method}
                        </Box>
                        <Typography
                          sx={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: 12,
                            fontWeight: active ? 700 : 500,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {entry.title}
                        </Typography>
                      </Stack>
                    );
                  })}
                </Box>
              ))}
            </Box>
          </Paper>

          {/* 右侧：接口文档 */}
          <Paper
            elevation={0}
            variant="outlined"
            sx={{ flex: 1, minWidth: 0, borderRadius: "14px", borderColor: "var(--pm-color-border)", overflow: "auto", p: 2.5 }}
          >
            {selected ? (
              <>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mb: 1 }}>
                  <Chip
                    label={selected.method}
                    size="small"
                    sx={{
                      color: "#fff",
                      fontWeight: 800,
                      backgroundColor: METHOD_COLOR[selected.method] ?? "#6b7280",
                    }}
                  />
                  <Typography
                    component="code"
                    sx={{
                      fontFamily: "Consolas, 'SF Mono', monospace",
                      fontSize: 14,
                      fontWeight: 600,
                      wordBreak: "break-all",
                    }}
                  >
                    {selected.path}
                  </Typography>
                  <Box sx={{ flex: 1 }} />
                  <IconButton size="small" onClick={() => void copyCurl()}>
                    <ContentCopyRounded sx={{ fontSize: 17, color: copied ? "#0a8a5f" : "var(--pm-color-text-secondary)" }} />
                  </IconButton>
                </Stack>

                <Typography sx={{ fontSize: 18, fontWeight: 800, mb: 0.5 }}>{selected.title}</Typography>
                <Typography sx={{ fontSize: 13, color: "var(--pm-color-text-secondary)", mb: 2 }}>
                  {selected.summary}
                </Typography>
                <Typography sx={{ fontSize: 11.5, color: "var(--pm-color-text-hint)", mb: 2 }}>
                  {zh
                    ? `鉴权：${selected.requiresAuth ? "需要 Cookie 登录（pm_access_token）" : "无需登录（@Public）"}`
                    : `Auth: ${selected.requiresAuth ? "Cookie session (pm_access_token)" : "public (@Public)"}`}
                </Typography>

                <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
                  {selected.query && (
                    <DocBlock title={zh ? "查询参数" : "Query"} code={jsonBlock(selected.query)} />
                  )}
                  {selected.body !== undefined && (
                    <DocBlock title={zh ? "请求体 Body" : "Body"} code={jsonBlock(selected.body)} />
                  )}
                  <DocBlock title={zh ? "响应示例" : "Response"} code={jsonBlock(selected.response)} />
                </Stack>

                <Typography sx={{ mt: 2, fontSize: 12, fontWeight: 700, color: "var(--pm-color-text-hint)" }}>
                  {zh ? "调用示例 curl" : "curl example"}
                </Typography>
                <Box
                  component="pre"
                  sx={{
                    mt: 0.75,
                    p: 1.5,
                    borderRadius: "12px",
                    backgroundColor: "#0f172a",
                    color: "#dbe4ff",
                    fontSize: 12,
                    overflowX: "auto",
                    fontFamily: "Consolas, 'SF Mono', monospace",
                  }}
                >
                  {buildCurl(selected)}
                </Box>
              </>
            ) : (
              <Typography sx={{ color: "var(--pm-color-text-hint)", fontSize: 13 }}>
                {zh ? "从左侧选择一个接口查看文档。" : "Select an endpoint on the left."}
              </Typography>
            )}
          </Paper>
        </Box>
      )}
    </Box>
  );
}

function DocBlock({ title, code }: { title: string; code: string }) {
  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: "var(--pm-color-text-hint)", mb: 0.5 }}>
        {title}
      </Typography>
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 1.25,
          borderRadius: "10px",
          border: "1px solid var(--pm-color-border)",
          backgroundColor: "var(--pm-color-bg-code, #f7f8fa)",
          fontSize: 11.5,
          overflowX: "auto",
          fontFamily: "Consolas, 'SF Mono', monospace",
          lineHeight: 1.5,
        }}
      >
        {code}
      </Box>
    </Box>
  );
}
