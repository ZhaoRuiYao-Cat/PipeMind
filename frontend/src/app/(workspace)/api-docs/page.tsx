"use client";

// API 接口文档：左侧分组接口列表，右侧文档（请求方式 / 参数 / 响应），支持导出
import { useEffect, useMemo, useState } from "react";
import { ThemeProvider } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ContentCopyRounded from "@mui/icons-material/ContentCopyRounded";
import DownloadRounded from "@mui/icons-material/DownloadRounded";
import SearchRounded from "@mui/icons-material/SearchRounded";
import ErrorOutlineRounded from "@mui/icons-material/ErrorOutlineRounded";
import { useI18n } from "@/lib/i18n";
import { pmTheme } from "@/lib/theme";
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

const METHOD_STYLE: Record<string, { color: string; bg: string }> = {
  GET: { color: "#1664ff", bg: "rgba(22,100,255,0.09)" },
  POST: { color: "#0a8a5f", bg: "rgba(10,138,95,0.09)" },
  PUT: { color: "#b25e09", bg: "rgba(178,94,9,0.09)" },
  PATCH: { color: "#7a5af8", bg: "rgba(122,90,248,0.09)" },
  DELETE: { color: "#cf1322", bg: "rgba(207,19,34,0.09)" },
};

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function curlOf(entry: ApiDocEntry): string {
  const method = entry.method === "GET" ? "" : ` -X ${entry.method}`;
  const headers = entry.method === "GET" ? "" : " -H 'Content-Type: application/json'";
  const data = entry.body !== undefined ? ` -d '${pretty(entry.body)}'` : "";
  return `curl${method}${headers} '${entry.path}'${data}`;
}

export default function ApiDocsPage() {
  const { lang } = useI18n();
  const zh = lang === "zh-CN";
  const [entries, setEntries] = useState<ApiDocEntry[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api-catalog`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        const list = (data.entries ?? []) as ApiDocEntry[];
        setEntries(list);
        if (list.length > 0) setSelectedId(list[0].id);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        setEntries([]);
      });
  }, []);

  const groups = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    const filtered = (entries ?? []).filter(
      (e) =>
        k.length === 0 ||
        e.title.toLowerCase().includes(k) ||
        e.path.toLowerCase().includes(k) ||
        e.group.toLowerCase().includes(k),
    );
    const map = new Map<string, ApiDocEntry[]>();
    for (const entry of filtered) {
      const arr = map.get(entry.group) ?? [];
      arr.push(entry);
      map.set(entry.group, arr);
    }
    return Array.from(map.entries());
  }, [entries, keyword]);

  const selected = entries?.find((e) => e.id === selectedId) ?? null;

  const copyCurl = async (): Promise<void> => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(curlOf(selected));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  };

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
          <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start", mb: 4 }}>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontSize: 22, fontWeight: 700, color: "var(--pm-color-text-primary)" }}>
                {zh ? "API 接口文档" : "API Reference"}
              </Typography>
              <Typography sx={{ mt: 1, fontSize: 13, color: "var(--pm-color-text-hint)" }}>
                {zh
                  ? "系统对外开放的接口总览：点选接口查看请求方式、参数与响应，支持导出文档"
                  : "Browse every external endpoint: request method, parameters, response and export"}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<DownloadRounded sx={{ fontSize: 15 }} />}
                onClick={() => window.open(`${API_BASE}/api-catalog/export?fmt=markdown`, "_blank")}
                sx={{
                  borderRadius: "999px",
                  textTransform: "none",
                  fontSize: 12,
                  color: "var(--pm-color-text-secondary)",
                  borderColor: "var(--pm-color-border)",
                  "&:hover": { borderColor: "#1664ff", color: "#1664ff" },
                }}
              >
                .md
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<DownloadRounded sx={{ fontSize: 15 }} />}
                onClick={() => window.open(`${API_BASE}/api-catalog/export?fmt=json`, "_blank")}
                sx={{
                  borderRadius: "999px",
                  textTransform: "none",
                  fontSize: 12,
                  color: "var(--pm-color-text-secondary)",
                  borderColor: "var(--pm-color-border)",
                  "&:hover": { borderColor: "#1664ff", color: "#1664ff" },
                }}
              >
                .json
              </Button>
            </Stack>
          </Stack>

          {error && (
            <Paper
              elevation={0}
              variant="outlined"
              sx={{ borderRadius: "16px", borderColor: "var(--pm-color-border)", p: 4, textAlign: "center" }}
            >
              <ErrorOutlineRounded sx={{ fontSize: 40, color: "#cf1322" }} />
              <Typography sx={{ mt: 1.5, fontSize: 14, color: "var(--pm-color-text-secondary)" }}>{error}</Typography>
            </Paper>
          )}

          {entries === null ? (
            <Stack sx={{ alignItems: "center", justifyContent: "center", minHeight: 240 }}>
              <CircularProgress size={24} sx={{ color: "var(--pm-color-primary)" }} />
            </Stack>
          ) : (
            <Box sx={{ display: "flex", columnGap: 3, alignItems: "flex-start" }}>
              <Paper
                elevation={0}
                variant="outlined"
                sx={{ width: 300, flexShrink: 0, borderRadius: "16px", borderColor: "var(--pm-color-border)", overflow: "hidden" }}
              >
                <Box sx={{ p: 1.5, borderBottom: "1px solid var(--pm-color-divider)" }}>
                  <TextField
                    size="small"
                    fullWidth
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder={zh ? "搜索接口…" : "Search endpoints…"}
                    slotProps={{
                      input: {
                        startAdornment: <SearchRounded sx={{ fontSize: 16, mr: 0.5, color: "var(--pm-color-text-hint)" }} />,
                      },
                    }}
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: "999px", backgroundColor: "#f6f7f9" }, "& fieldset": { border: "none" } }}
                  />
                </Box>
                <Box sx={{ p: 1 }}>
                  {groups.length === 0 && (
                    <Typography sx={{ p: 2, fontSize: 12, color: "var(--pm-color-text-hint)" }}>
                      {zh ? "没有匹配的接口" : "No matching endpoints"}
                    </Typography>
                  )}
                  {groups.map(([group, list]) => (
                    <Box key={group} sx={{ mb: 1 }}>
                      <Typography sx={{ px: 1, py: 0.75, fontSize: 11, fontWeight: 600, color: "var(--pm-color-text-hint)" }}>
                        {group}
                      </Typography>
                      {list.map((entry) => {
                        const active = entry.id === selected?.id;
                        const style = METHOD_STYLE[entry.method] ?? METHOD_STYLE.GET;
                        return (
                          <Stack
                            key={entry.id}
                            direction="row"
                            spacing={1}
                            onClick={() => setSelectedId(entry.id)}
                            sx={{
                              alignItems: "center",
                              px: 1,
                              py: 0.75,
                              borderRadius: "10px",
                              cursor: "pointer",
                              backgroundColor: active ? "var(--pm-color-primary-soft)" : "transparent",
                              "&:hover": { backgroundColor: active ? "var(--pm-color-primary-soft)" : "rgba(0,0,0,0.04)" },
                            }}
                          >
                            <Box
                              component="span"
                              sx={{
                                flexShrink: 0,
                                px: 0.75,
                                py: 0.15,
                                borderRadius: "6px",
                                fontSize: 10,
                                fontWeight: 700,
                                fontFamily: "Consolas, monospace",
                                color: style.color,
                                backgroundColor: style.bg,
                              }}
                            >
                              {entry.method}
                            </Box>
                            <Typography
                              sx={{
                                flex: 1,
                                minWidth: 0,
                                fontSize: 13,
                                fontWeight: active ? 600 : 500,
                                color: active ? "var(--pm-color-text-primary)" : "var(--pm-color-text-secondary)",
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

              <Paper
                elevation={0}
                variant="outlined"
                sx={{ flex: 1, minWidth: 0, borderRadius: "16px", borderColor: "var(--pm-color-border)", px: { xs: 2.5, sm: 4 }, py: { xs: 2.5, sm: 3 } }}
              >
                {!selected ? (
                  <Typography sx={{ py: 4, textAlign: "center", fontSize: 13, color: "var(--pm-color-text-hint)" }}>
                    {zh ? "请从左侧选择一个接口" : "Select an endpoint on the left"}
                  </Typography>
                ) : (
                  <>
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                      <Box
                        component="span"
                        sx={{
                          px: 1,
                          py: 0.25,
                          borderRadius: "6px",
                          fontSize: 11,
                          fontWeight: 700,
                          fontFamily: "Consolas, monospace",
                          color: METHOD_STYLE[selected.method].color,
                          backgroundColor: METHOD_STYLE[selected.method].bg,
                        }}
                      >
                        {selected.method}
                      </Box>
                      <Typography component="code" sx={{ flex: 1, fontSize: 14, fontWeight: 600, color: "var(--pm-color-primary)", wordBreak: "break-all" }}>
                        {selected.path}
                      </Typography>
                      <IconButton size="small" onClick={() => void copyCurl()}>
                        <ContentCopyRounded sx={{ fontSize: 17, color: copied ? "#0a8a5f" : "var(--pm-color-text-hint)" }} />
                      </IconButton>
                    </Stack>
                    <Typography sx={{ mt: 1.5, fontSize: 18, fontWeight: 700, color: "var(--pm-color-text-primary)" }}>
                      {selected.title}
                    </Typography>
                    <Typography sx={{ mt: 0.5, fontSize: 13, lineHeight: 1.7, color: "var(--pm-color-text-secondary)" }}>
                      {selected.summary}
                    </Typography>
                    <Typography sx={{ mt: 1.5, fontSize: 12, color: "var(--pm-color-text-hint)" }}>
                      {zh
                        ? selected.requiresAuth
                          ? "鉴权：需要登录 Cookie（pm_access_token）"
                          : "鉴权：无需登录（公开接口）"
                        : selected.requiresAuth
                          ? "Auth: login cookie (pm_access_token) required"
                          : "Auth: public"}
                    </Typography>

                    <Box
                      sx={{
                        mt: 3,
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", md: selected.query && selected.body !== undefined ? "1fr 1fr" : "1fr" },
                        columnGap: 3,
                        rowGap: 2,
                      }}
                    >
                      {selected.query && <CodeBlock title={zh ? "查询参数 Query" : "Query"} code={pretty(selected.query)} />}
                      {selected.body !== undefined && <CodeBlock title={zh ? "请求体 Body" : "Body"} code={pretty(selected.body)} />}
                      <CodeBlock
                        title={zh ? "响应示例 Response" : "Response"}
                        code={pretty(selected.response)}
                        fullWidth={!selected.query && selected.body === undefined}
                      />
                    </Box>

                    <Typography sx={{ mt: 3, mb: 0.75, fontSize: 12, fontWeight: 600, color: "var(--pm-color-text-hint)" }}>
                      {zh ? "curl 示例" : "curl example"}
                    </Typography>
                    <Box
                      component="pre"
                      sx={{ m: 0, p: 2, borderRadius: "10px", backgroundColor: "#0f172a", color: "#dbe4ff", fontSize: 12, lineHeight: 1.6, overflowX: "auto", fontFamily: "Consolas, 'SF Mono', monospace" }}
                    >
                      {curlOf(selected)}
                    </Box>
                  </>
                )}
              </Paper>
            </Box>
          )}
        </Box>
      </Box>
    </ThemeProvider>
  );
}

function CodeBlock({ title, code, fullWidth }: { title: string; code: string; fullWidth?: boolean }) {
  return (
    <Box sx={{ gridColumn: fullWidth ? "1 / -1" : undefined }}>
      <Typography sx={{ mb: 0.75, fontSize: 12, fontWeight: 600, color: "var(--pm-color-text-hint)" }}>{title}</Typography>
      <Box
        component="pre"
        sx={{ m: 0, p: 1.75, borderRadius: "10px", border: "1px solid var(--pm-color-border)", backgroundColor: "#f8f9fb", fontSize: 12, lineHeight: 1.6, overflowX: "auto", fontFamily: "Consolas, 'SF Mono', monospace" }}
      >
        {code}
      </Box>
    </Box>
  );
}
