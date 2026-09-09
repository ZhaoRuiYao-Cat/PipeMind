"use client";

// 错误记录：机器人/检测终端上报的管道损伤（图片 + 详细位置 + 处理状态）
import { useCallback, useEffect, useMemo, useState } from "react";
import { ThemeProvider } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import ExpandLessRounded from "@mui/icons-material/ExpandLessRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import ImageRounded from "@mui/icons-material/ImageRounded";
import PlaceRounded from "@mui/icons-material/PlaceRounded";
import SearchRounded from "@mui/icons-material/SearchRounded";
import { useI18n } from "@/lib/i18n";
import { pmTheme } from "@/lib/theme";
import { API_BASE } from "@/lib/api";

interface DefectItem {
  id: number;
  deviceId: number | null;
  deviceName: string | null;
  type: string;
  title: string | null;
  description: string | null;
  lon: number;
  lat: number;
  depthM: number | null;
  imageUrl: string | null;
  status: "open" | "processing" | "fixed";
  createdAt: string;
  updatedAt: string;
}

type Lang = "zh-CN" | "en-US";
const T: Record<string, Record<Lang, string>> = {
  title: { "zh-CN": "错误记录", "en-US": "Defect Logs" },
  subtitle: {
    "zh-CN": "管道机器人/检测终端上报的损伤记录：含现场图片、坐标埋深与处理状态，支持跟踪处置闭环。",
    "en-US": "Damage reported by crawlers/drones: on-site image, location & depth, and handling status.",
  },
};

const TYPE_LABEL: Record<string, { zh: string; en: string; color: string; bg: string }> = {
  corrosion: { zh: "腐蚀", en: "Corrosion", color: "#b25e09", bg: "rgba(178,94,9,0.1)" },
  crack: { zh: "裂缝", en: "Crack", color: "#cf1322", bg: "rgba(207,19,34,0.09)" },
  leak: { zh: "渗漏", en: "Leak", color: "#1664ff", bg: "var(--pm-color-primary-soft)" },
  dent: { zh: "变形", en: "Dent", color: "#7a5af8", bg: "rgba(122,90,248,0.1)" },
  cover: { zh: "井盖/附属", en: "Cover", color: "#0a8a5f", bg: "rgba(10,138,95,0.1)" },
  other: { zh: "其他", en: "Other", color: "#6b7280", bg: "rgba(107,114,128,0.12)" },
};

const STATUS_LABEL: Record<string, { zh: string; en: string; color: string; bg: string }> = {
  open: { zh: "待处理", en: "Open", color: "#cf1322", bg: "rgba(207,19,34,0.09)" },
  processing: { zh: "处理中", en: "Processing", color: "#b25e09", bg: "rgba(178,94,9,0.1)" },
  fixed: { zh: "已修复", en: "Fixed", color: "#0a8a5f", bg: "rgba(10,138,95,0.1)" },
};

async function jfetch(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...init });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return res.json();
}

export default function DefectsPage() {
  const { lang } = useI18n();
  const zh = lang === "zh-CN";
  const t = (zhText: string, enText: string): string => (zh ? zhText : enText);

  const [items, setItems] = useState<DefectItem[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<"" | "open" | "processing" | "fixed">("");
  const [keyword, setKeyword] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [copiedCoord, setCopiedCoord] = useState<number | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (keyword.trim()) params.set("q", keyword.trim());
      const query = params.toString() ? `?${params.toString()}` : "";
      const data = (await jfetch(`/defects${query}`)) as DefectItem[];
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    }
  }, [statusFilter, keyword]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const list = items ?? [];
    return {
      open: list.filter((d) => d.status === "open").length,
      processing: list.filter((d) => d.status === "processing").length,
      fixed: list.filter((d) => d.status === "fixed").length,
      total: list.length,
    };
  }, [items]);

  const setStatus = async (item: DefectItem, status: string): Promise<void> => {
    setBusy(true);
    try {
      await jfetch(`/defects/${item.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await load();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (confirmId === null) return;
    try {
      await jfetch(`/defects/${confirmId}`, { method: "DELETE" });
      if (expandedId === confirmId) setExpandedId(null);
      await load();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setConfirmId(null);
    }
  };

  const copyCoord = async (lon: number, lat: number): Promise<void> => {
    try {
      await navigator.clipboard.writeText(`${lon.toFixed(6)}, ${lat.toFixed(6)}`);
      setCopiedCoord(lon);
      window.setTimeout(() => setCopiedCoord(null), 1400);
    } catch {
      /* ignore */
    }
  };

  const filterChips: Array<["" | "open" | "processing" | "fixed", string]> = [
    ["", t("全部", "All")],
    ["open", t("待处理", "Open")],
    ["processing", t("处理中", "Processing")],
    ["fixed", t("已修复", "Fixed")],
  ];

  return (
    <ThemeProvider theme={pmTheme}>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: { xs: 2.5, sm: 4, md: 13 }, pt: { xs: 10, sm: 12 }, pb: 24 }}>
        <Box sx={{ width: "100%", maxWidth: 880, mx: "auto" }}>
          <Typography sx={{ fontSize: 22, fontWeight: 700, color: "var(--pm-color-text-primary)" }}>
            {T.title[lang]}
          </Typography>
          <Typography sx={{ mt: 1, mb: 5, fontSize: 13, color: "var(--pm-color-text-hint)" }}>
            {T.subtitle[lang]}
          </Typography>

          {/* 筛选与操作 */}
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2, flexWrap: "wrap", rowGap: 1 }}>
            {filterChips.map(([key, label]) => {
              const active = statusFilter === key;
              const badge = key === "" ? counts.total : counts[key as "open" | "processing" | "fixed"];
              return (
                <Button
                  key={key}
                  size="small"
                  onClick={() => setStatusFilter(key)}
                  sx={{
                    borderRadius: "999px",
                    px: 1.5,
                    fontSize: 12.5,
                    color: active ? "var(--pm-color-primary)" : "var(--pm-color-text-secondary)",
                    backgroundColor: active ? "var(--pm-color-primary-soft)" : "transparent",
                    "&:hover": { backgroundColor: active ? "var(--pm-color-primary-soft)" : "rgba(0,0,0,0.04)" },
                  }}
                >
                  {label} {badge}
                </Button>
              );
            })}
            <Box sx={{ flex: 1 }} />
            <TextField
              size="small"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={zh ? "搜索标题/描述/设备…" : "Search title, notes or device…"}
              slotProps={{ input: { startAdornment: <SearchRounded sx={{ fontSize: 16, mr: 0.5, color: "var(--pm-color-text-hint)" }} /> } }}
              sx={{ width: { xs: "100%", sm: 240 }, "& .MuiOutlinedInput-root": { borderRadius: "999px", backgroundColor: "#fff" }, "& fieldset": { border: "none" } }}
            />
            <Button size="small" variant="outlined" startIcon={<RefreshRounded sx={{ fontSize: 15 }} />} onClick={() => void load()} sx={{ borderRadius: "999px", textTransform: "none", fontSize: 12, color: "var(--pm-color-text-secondary)", borderColor: "var(--pm-color-border)", "&:hover": { borderColor: "#1664ff", color: "#1664ff" } }}>
              {zh ? "刷新" : "Refresh"}
            </Button>
          </Stack>

          {items === null ? (
            <Stack sx={{ alignItems: "center", justifyContent: "center", minHeight: 240 }}>
              <CircularProgress size={24} sx={{ color: "var(--pm-color-primary)" }} />
            </Stack>
          ) : items.length === 0 ? (
            <Paper elevation={0} variant="outlined" sx={{ borderRadius: "16px", borderColor: "var(--pm-color-border)", p: 6, textAlign: "center" }}>
              <Typography sx={{ fontSize: 13, color: "var(--pm-color-text-hint)" }}>
                {zh ? "暂无记录。机器人上报（POST /api/defects，携带设备密钥）后会自动出现在这里。" : "No records yet. Device reports via POST /api/defects will appear here."}
              </Typography>
            </Paper>
          ) : (
            <Paper elevation={0} variant="outlined" sx={{ borderRadius: "16px", borderColor: "var(--pm-color-border)", overflow: "hidden" }}>
              {items.map((item, index) => {
                const type = TYPE_LABEL[item.type] ?? TYPE_LABEL.other;
                const status = STATUS_LABEL[item.status] ?? STATUS_LABEL.open;
                const expanded = expandedId === item.id;
                return (
                  <Box key={item.id}>
                    {index > 0 && <Divider sx={{ mx: 3, borderColor: "var(--pm-color-divider)" }} />}
                    <Box sx={{ px: { xs: 2.5, sm: 3 }, py: 1.75 }}>
                      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                        <Box
                          sx={{
                            width: 56,
                            height: 44,
                            flexShrink: 0,
                            borderRadius: "10px",
                            overflow: "hidden",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#1664ff",
                            backgroundColor: "var(--pm-color-primary-soft)",
                          }}
                        >
                          {item.imageUrl ? (
                            <Box component="img" src={`${API_BASE}${item.imageUrl}`} alt="" sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <ImageRounded sx={{ fontSize: 20 }} />
                          )}
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                            <Typography sx={{ fontSize: 15, fontWeight: 600, color: "var(--pm-color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {item.title || (item.type ? TYPE_LABEL[item.type]?.zh ?? item.type : t("管道损伤", "Pipe damage"))}
                            </Typography>
                            <Chip size="small" label={type[zh ? "zh" : "en"]} sx={{ height: 20, fontSize: 10.5, color: type.color, backgroundColor: type.bg }} />
                            <Chip size="small" label={status[zh ? "zh" : "en"]} sx={{ height: 20, fontSize: 10.5, color: status.color, backgroundColor: status.bg }} />
                          </Stack>
                          <Typography sx={{ mt: 0.25, fontSize: 12, color: "var(--pm-color-text-hint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {[
                              item.deviceName ? t(`来源：${item.deviceName}`, `Source: ${item.deviceName}`) : t("来源：手工/测试", "Source: manual"),
                              `${item.lon.toFixed(6)}, ${item.lat.toFixed(6)}`,
                              item.depthM != null ? `${zh ? "埋深" : "Depth"} ${item.depthM} m` : "",
                              new Date(item.createdAt).toLocaleString(zh ? "zh-CN" : "en-US", { hour12: false }),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </Typography>
                        </Box>
                        <Button size="small" variant={expanded ? "contained" : "outlined"} disableElevation onClick={() => setExpandedId(expanded ? null : item.id)} sx={{ ...btnPill, ...(expanded ? { color: "#fff", backgroundColor: "#1664ff" } : { color: "var(--pm-color-text-secondary)", borderColor: "var(--pm-color-border)" }) }}>
                          {expanded ? t("收起", "Collapse") : t("详情", "Detail")}
                          {expanded ? <ExpandLessRounded sx={{ fontSize: 16 }} /> : <ExpandMoreRounded sx={{ fontSize: 16 }} />}
                        </Button>
                      </Stack>

                      {expanded && (
                        <Box sx={{ mt: 2, ml: 0, pl: { sm: 1.5 } }}>
                          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "260px 1fr" }, gap: 2 }}>
                            {item.imageUrl ? (
                              <Box
                                component="img"
                                src={`${API_BASE}${item.imageUrl}`}
                                alt=""
                                sx={{ width: "100%", borderRadius: "10px", border: "1px solid var(--pm-color-border)", maxHeight: 220, objectFit: "cover" }}
                              />
                            ) : (
                              <Paper elevation={0} variant="outlined" sx={{ borderRadius: "10px", borderColor: "var(--pm-color-border)", p: 3, textAlign: "center" }}>
                                <ImageRounded sx={{ fontSize: 34, color: "var(--pm-color-text-hint)" }} />
                                <Typography sx={{ mt: 1, fontSize: 12, color: "var(--pm-color-text-hint)" }}>{zh ? "未附图片" : "No image"}</Typography>
                              </Paper>
                            )}
                            <Box>
                              <Typography sx={{ fontSize: 13.5, lineHeight: 1.8, color: "var(--pm-color-text-secondary)", whiteSpace: "pre-wrap" }}>
                                {item.description || t("（无补充描述）", "(no extra notes)")}
                              </Typography>
                              <Stack direction="row" spacing={1} sx={{ alignItems: "center", mt: 1, flexWrap: "wrap", rowGap: 1 }}>
                                <Chip
                                  icon={<PlaceRounded sx={{ fontSize: 14 }} />}
                                  size="small"
                                  label={`${item.lon.toFixed(6)}, ${item.lat.toFixed(6)}`}
                                  onClick={() => void copyCoord(item.lon, item.lat)}
                                  sx={{ height: 24, fontSize: 11.5, color: copiedCoord === item.lon ? "#0a8a5f" : "var(--pm-color-text-secondary)", backgroundColor: "#f5f6f8" }}
                                />
                                {item.depthM != null && (
                                  <Chip size="small" label={`${zh ? "埋深" : "Depth"} ${item.depthM} m`} sx={{ height: 24, fontSize: 11.5, color: "var(--pm-color-text-secondary)", backgroundColor: "#f5f6f8" }} />
                                )}
                                {item.deviceName && (
                                  <Chip size="small" label={`${zh ? "设备" : "Device"}: ${item.deviceName}`} sx={{ height: 24, fontSize: 11.5, color: "var(--pm-color-text-secondary)", backgroundColor: "#f5f6f8" }} />
                                )}
                              </Stack>
                            </Box>
                          </Box>
                          <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end", mt: 1.5 }}>
                            {item.status === "open" && (
                              <Button size="small" variant="outlined" disabled={busy} onClick={() => void setStatus(item, "processing")} sx={{ ...btnPill, color: "#b25e09", borderColor: "rgba(178,94,9,0.4)" }}>
                                {t("标记处理中", "Mark processing")}
                              </Button>
                            )}
                            {item.status !== "fixed" && (
                              <Button size="small" variant="contained" disableElevation disabled={busy} onClick={() => void setStatus(item, "fixed")} sx={{ ...btnPill, color: "#fff", backgroundColor: "#0a8a5f", "&:hover": { backgroundColor: "#087a53" } }}>
                                {t("标记已修复", "Mark fixed")}
                              </Button>
                            )}
                            <IconButton size="small" title={t("删除", "Delete")} onClick={() => setConfirmId(item.id)} sx={{ color: "var(--pm-color-text-hint)", "&:hover": { color: "#cf1322", backgroundColor: "rgba(207,19,34,0.06)" } }}>
                              <DeleteOutlineRounded sx={{ fontSize: 19 }} />
                            </IconButton>
                          </Stack>
                        </Box>
                      )}
                    </Box>
                  </Box>
                );
              })}
            </Paper>
          )}

          {/* 删除确认 */}
          <Dialog open={confirmId !== null} onClose={() => setConfirmId(null)} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ fontSize: 17, fontWeight: 700 }}>{zh ? "删除记录" : "Delete record"}</DialogTitle>
            <DialogContent>
              <Typography sx={{ fontSize: 13.5, color: "var(--pm-color-text-secondary)" }}>
                {zh ? "确定删除这条损伤记录？图片与元数据将一并移除。" : "Remove this defect record and its image?"}
              </Typography>
            </DialogContent>
            <DialogActions sx={{ px: 2.5, pb: 2 }}>
              <Button size="small" onClick={() => setConfirmId(null)} sx={btnPill}>{t("取消", "Cancel")}</Button>
              <Button size="small" variant="contained" disableElevation color="error" onClick={() => void remove()} sx={{ ...btnPill, color: "#fff" }}>{t("删除", "Delete")}</Button>
            </DialogActions>
          </Dialog>

          <Snackbar open={notice !== null} autoHideDuration={4000} onClose={() => setNotice(null)} anchorOrigin={{ vertical: "top", horizontal: "center" }}>
            {notice ? (
              <Alert severity={notice.kind} variant="outlined" onClose={() => setNotice(null)} sx={{ borderRadius: "999px", backgroundColor: "rgba(255,255,255,0.95)" }}>{notice.text}</Alert>
            ) : (
              <Box sx={{ display: "none" }} />
            )}
          </Snackbar>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

const btnPill = { borderRadius: "999px", textTransform: "none" as const, fontSize: 12 };
