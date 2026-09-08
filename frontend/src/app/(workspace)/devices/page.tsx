"use client";

// 设备与基站：管道机器人 / 无人机 CRUD、基于当前 GIS 数据源规划巡航路线、基站管理
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
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import AddRounded from "@mui/icons-material/AddRounded";
import CellTowerRounded from "@mui/icons-material/CellTowerRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import EditOutlined from "@mui/icons-material/EditOutlined";
import FlightTakeoffRounded from "@mui/icons-material/FlightTakeoffRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import RouteRounded from "@mui/icons-material/RouteRounded";
import SmartToyRounded from "@mui/icons-material/SmartToyRounded";
import { useI18n } from "@/lib/i18n";
import { pmTheme } from "@/lib/theme";
import { API_BASE } from "@/lib/api";
import { readActiveGisSource } from "@/lib/gis-source";

interface DeviceItem {
  id: number;
  name: string;
  type: "crawler" | "drone";
  status: string;
  description: string | null;
}
interface StationItem {
  id: number;
  name: string;
  lon: number;
  lat: number;
  purpose: string;
  description: string | null;
}

type Lang = "zh-CN" | "en-US";
const T: Record<string, Record<Lang, string>> = {
  title: { "zh-CN": "设备与基站", "en-US": "Devices & Stations" },
  subtitle: {
    "zh-CN": "管理管道机器人与无人机，基于当前 GIS 数据源规划巡航路线，并在地图上规划基站用于路径推算与指令下发",
    "en-US": "Manage crawlers & drones, plan cruise routes from the active GIS source, and place base stations for routing and commands",
  },
  devicesSection: { "zh-CN": "设备", "en-US": "Devices" },
  stationsSection: { "zh-CN": "基站", "en-US": "Base stations" },
};

async function jfetch(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...init });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function samplePoints(raw: unknown, maxPoints = 120): Array<{ lon: number; lat: number }> {
  const out: Array<{ lon: number; lat: number }> = [];
  const fc = raw as { features?: Array<{ geometry?: { type?: string; coordinates?: unknown } }> };
  if (!fc?.features) return out;
  for (const feature of fc.features) {
    const g = feature.geometry;
    if (!g) continue;
    if (g.type === "MultiLineString" && Array.isArray(g.coordinates)) {
      for (const line of g.coordinates as unknown[][]) {
        if (!Array.isArray(line)) continue;
        for (let i = 0; i < line.length; i += 1) {
          const coord = line[i] as number[];
          if (Array.isArray(coord) && coord.length >= 2) out.push({ lon: coord[0], lat: coord[1] });
        }
      }
    } else if (g.type === "LineString" && Array.isArray(g.coordinates)) {
      for (const coord of g.coordinates as number[][]) {
        if (Array.isArray(coord) && coord.length >= 2) out.push({ lon: coord[0], lat: coord[1] });
      }
    }
  }
  if (out.length <= maxPoints) return out;
  const step = out.length / maxPoints;
  const sampled: Array<{ lon: number; lat: number }> = [];
  for (let i = 0; i < out.length; i += step) sampled.push(out[Math.floor(i)]);
  sampled.push(out[out.length - 1]);
  return sampled;
}

export default function DevicesPage() {
  const { lang } = useI18n();
  const zh = lang === "zh-CN";
  const t = (zhText: string, enText: string): string => (zh ? zhText : enText);

  const [devices, setDevices] = useState<DeviceItem[] | null>(null);
  const [stations, setStations] = useState<StationItem[] | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<DeviceItem | null | "new">(null);
  const [form, setForm] = useState({ name: "", type: "crawler", status: "offline", description: "" });
  const [routeFor, setRouteFor] = useState<DeviceItem | null>(null);
  const [routeSourceName, setRouteSourceName] = useState("");
  const [pointsText, setPointsText] = useState("");
  const [stationDialog, setStationDialog] = useState<StationItem | "new" | null>(null);
  const [stationForm, setStationForm] = useState({ name: "", lon: "", lat: "", purpose: "charging", description: "" });

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const [dev, sta] = (await Promise.all([jfetch("/devices"), jfetch("/base-stations")])) as [DeviceItem[], StationItem[]];
      setDevices(dev);
      setStations(sta);
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activeSource = useMemo(() => readActiveGisSource(), []);

  const counts = useMemo(() => {
    const list = devices ?? [];
    return {
      total: list.length,
      crawler: list.filter((d) => d.type === "crawler").length,
      drone: list.filter((d) => d.type === "drone").length,
      online: list.filter((d) => d.status === "online").length,
    };
  }, [devices]);

  const saveDevice = async (): Promise<void> => {
    setBusy(true);
    try {
      if (editing === "new") await jfetch("/devices", { method: "POST", body: JSON.stringify(form) });
      else if (editing) await jfetch(`/devices/${editing.id}`, { method: "PATCH", body: JSON.stringify(form) });
      setEditing(null);
      setNotice({ kind: "success", text: t("设备已保存", "Device saved") });
      await refresh();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const removeDevice = async (device: DeviceItem): Promise<void> => {
    if (!globalThis.confirm(t(`删除设备“${device.name}”？`, `Delete device "${device.name}"?`))) return;
    try {
      await jfetch(`/devices/${device.id}`, { method: "DELETE" });
      await refresh();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    }
  };

  const openRoute = async (device: DeviceItem): Promise<void> => {
    setRouteFor(device);
    setRouteSourceName(activeSource?.name ?? "");
    setPointsText("");
    try {
      const saved = (await jfetch(`/devices/${device.id}/route`)) as { sourceText: string | null; pointsText: string | null } | null;
      if (saved?.pointsText) {
        const pts = JSON.parse(saved.pointsText) as Array<{ lon: number; lat: number }>;
        setPointsText(pts.map((p) => `${p.lon}, ${p.lat}`).join("\n"));
      }
      if (saved?.sourceText) {
        try {
          const src = JSON.parse(saved.sourceText) as { name?: string };
          if (src?.name) setRouteSourceName(src.name);
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  };

  const generateFromSource = async (): Promise<void> => {
    const source = readActiveGisSource();
    if (!source) {
      setNotice({ kind: "error", text: t("当前没有 GIS 数据源，请先在首页选择", "No active GIS source; pick one on Home first") });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/data-files/${source.id}/content`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const points = samplePoints((await res.json()) as unknown);
      if (points.length < 2) throw new Error(t("数据源中没有可用的管网点", "No usable points in the source"));
      setPointsText(points.map((p) => `${p.lon.toFixed(6)}, ${p.lat.toFixed(6)}`).join("\n"));
      setRouteSourceName(source.name);
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const saveRoute = async (): Promise<void> => {
    if (!routeFor) return;
    setBusy(true);
    try {
      const lines = pointsText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const points = lines.map((line) => {
        const parts = line.split(",");
        return { lon: Number(parts[0]), lat: Number(parts[1] ?? parts[0]) };
      });
      if (points.length < 2) throw new Error(t("路线至少需要 2 个点（每行：经度, 纬度）", "Need at least 2 points (lon, lat per line)"));
      const source = readActiveGisSource();
      await jfetch(`/devices/${routeFor.id}/route`, {
        method: "PUT",
        body: JSON.stringify({ source: source ? { kind: source.kind, id: source.id, name: source.name } : null, points }),
      });
      setRouteFor(null);
      setNotice({ kind: "success", text: t(`巡航路线已保存（${points.length} 个点）`, `Cruise route saved (${points.length} pts)`) });
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const saveStation = async (): Promise<void> => {
    setBusy(true);
    try {
      const payload = {
        name: stationForm.name.trim(),
        lon: Number(stationForm.lon),
        lat: Number(stationForm.lat),
        purpose: stationForm.purpose,
        description: stationForm.description.trim() || null,
      };
      if (stationDialog === "new") await jfetch("/base-stations", { method: "POST", body: JSON.stringify(payload) });
      else if (stationDialog) await jfetch(`/base-stations/${stationDialog.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      setStationDialog(null);
      setNotice({ kind: "success", text: t("基站已保存", "Station saved") });
      await refresh();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const removeStation = async (station: StationItem): Promise<void> => {
    if (!globalThis.confirm(t(`删除基站“${station.name}”？`, `Delete station "${station.name}"?`))) return;
    try {
      await jfetch(`/base-stations/${station.id}`, { method: "DELETE" });
      await refresh();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    }
  };

  const statusMeta = (status: string): { color: string; label: string } => {
    const map: Record<string, { color: string; label: string }> = {
      online: { color: "#2e9e5b", label: zh ? "在线" : "Online" },
      busy: { color: "#b25e09", label: zh ? "工作中" : "Busy" },
      fault: { color: "#cf1322", label: zh ? "故障" : "Fault" },
      offline: { color: "#86909c", label: zh ? "离线" : "Offline" },
    };
    return map[status] ?? map.offline;
  };

  const ghostIcon = (color = "var(--pm-color-text-secondary)") => ({
    color,
    "&:hover": { backgroundColor: "var(--pm-color-primary-soft)", color: "#1664ff" },
  });

  return (
    <ThemeProvider theme={pmTheme}>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: { xs: 2.5, sm: 4, md: 10 }, pt: { xs: 10, sm: 12 }, pb: 24 }}>
        <Box sx={{ width: "100%", maxWidth: 960, mx: "auto" }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start", mb: 4 }}>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontSize: 22, fontWeight: 700, color: "var(--pm-color-text-primary)" }}>
                {T.title[lang]}
              </Typography>
              <Typography sx={{ mt: 1, fontSize: 13, color: "var(--pm-color-text-hint)" }}>
                {T.subtitle[lang]}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<RefreshRounded sx={{ fontSize: 15 }} />}
                onClick={() => void refresh()}
                sx={{ borderRadius: "999px", textTransform: "none", fontSize: 12, color: "var(--pm-color-text-secondary)", borderColor: "var(--pm-color-border)", "&:hover": { borderColor: "#1664ff", color: "#1664ff" } }}
              >
                {zh ? "刷新" : "Refresh"}
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<CellTowerRounded sx={{ fontSize: 15 }} />}
                onClick={() => { setStationDialog("new"); setStationForm({ name: "", lon: "", lat: "", purpose: "charging", description: "" }); }}
                sx={{ borderRadius: "999px", textTransform: "none", fontSize: 12, color: "var(--pm-color-text-secondary)", borderColor: "var(--pm-color-border)", "&:hover": { borderColor: "#1664ff", color: "#1664ff" } }}
              >
                {zh ? "新增基站" : "Add station"}
              </Button>
              <Button
                size="small"
                variant="contained"
                disableElevation
                startIcon={<AddRounded sx={{ fontSize: 15 }} />}
                onClick={() => { setEditing("new"); setForm({ name: "", type: "crawler", status: "offline", description: "" }); }}
                sx={{ borderRadius: "999px", textTransform: "none", fontSize: 12, color: "var(--pm-color-primary-contrast, #fff)", backgroundColor: "#1664ff", "&:hover": { backgroundColor: "#0f54d6" } }}
              >
                {zh ? "新增设备" : "Add device"}
              </Button>
            </Stack>
          </Stack>

          {devices === null || stations === null ? (
            <Stack sx={{ alignItems: "center", justifyContent: "center", minHeight: 240 }}>
              <CircularProgress size={24} sx={{ color: "var(--pm-color-primary)" }} />
            </Stack>
          ) : (
            <>
              {/* 概览统计 */}
              <Paper elevation={0} variant="outlined" sx={{ borderRadius: "16px", borderColor: "var(--pm-color-border)", px: { xs: 2.5, sm: 4 }, py: { xs: 2.5, sm: 3 }, mb: 4 }}>
                <Stack direction="row" sx={{ alignItems: "stretch" }}>
                  <StatCell label={zh ? "设备总数" : "Total"} value={String(counts.total)} />
                  <StatCell label={zh ? "管道机器人" : "Crawlers"} value={String(counts.crawler)} />
                  <StatCell label={zh ? "无人机" : "Drones"} value={String(counts.drone)} />
                  <StatCell label={zh ? "在线" : "Online"} value={String(counts.online)} last />
                </Stack>
              </Paper>

              {/* 设备列表 */}
              <Stack direction="row" spacing={1.5} sx={{ alignItems: "baseline", mb: 1.5 }}>
                <Typography sx={{ fontSize: 16, fontWeight: 600, color: "var(--pm-color-text-primary)" }}>
                  {T.devicesSection[lang]}
                </Typography>
                <Typography sx={{ fontSize: 12, color: "var(--pm-color-text-hint)" }}>
                  {zh ? "点击右侧图标规划巡航路线 / 编辑 / 删除" : "Route / edit / delete via right-side icons"}
                </Typography>
              </Stack>
              <Paper elevation={0} variant="outlined" sx={{ borderRadius: "16px", borderColor: "var(--pm-color-border)", overflow: "hidden", mb: 4 }}>
                {(devices.length === 0 ? [] : devices).map((device, index) => {
                  const meta = statusMeta(device.status);
                  return (
                    <Box key={device.id}>
                      {index > 0 && <Divider sx={{ mx: 3, borderColor: "var(--pm-color-divider)" }} />}
                      <Box sx={{ px: { xs: 2.5, sm: 3 }, py: 2 }}>
                        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                          <Box
                            sx={{
                              width: 38,
                              height: 38,
                              flexShrink: 0,
                              borderRadius: "10px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "#1664ff",
                              backgroundColor: "var(--pm-color-primary-soft)",
                            }}
                          >
                            {device.type === "drone" ? <FlightTakeoffRounded sx={{ fontSize: 20 }} /> : <SmartToyRounded sx={{ fontSize: 20 }} />}
                          </Box>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                              <Typography sx={{ fontSize: 15, fontWeight: 600, color: "var(--pm-color-text-primary)" }}>{device.name}</Typography>
                              <Box sx={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: meta.color }} />
                              <Typography sx={{ fontSize: 11.5, color: meta.color }}>{meta.label}</Typography>
                            </Stack>
                            <Typography sx={{ mt: 0.25, fontSize: 12, color: "var(--pm-color-text-hint)" }}>
                              {device.type === "crawler" ? t("管道机器人", "Crawler") : t("无人机", "Drone")}
                              {device.description ? ` · ${device.description}` : ""}
                            </Typography>
                          </Box>
                          <IconButton size="small" title={t("规划巡航路线", "Plan cruise route")} onClick={() => void openRoute(device)} sx={ghostIcon("#1664ff")}>
                            <RouteRounded sx={{ fontSize: 19 }} />
                          </IconButton>
                          <IconButton size="small" title={t("编辑", "Edit")} onClick={() => { setEditing(device); setForm({ name: device.name, type: device.type, status: device.status, description: device.description ?? "" }); }} sx={ghostIcon()}>
                            <EditOutlined sx={{ fontSize: 18 }} />
                          </IconButton>
                          <IconButton size="small" title={t("删除", "Delete")} onClick={() => void removeDevice(device)} sx={ghostIcon()}>
                            <DeleteOutlineRounded sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Stack>
                      </Box>
                    </Box>
                  );
                })}
                {devices.length === 0 && (
                  <Box sx={{ p: 5, textAlign: "center" }}>
                    <Typography sx={{ fontSize: 13, color: "var(--pm-color-text-hint)" }}>
                      {zh ? "暂无设备，点击右上角「新增设备」添加管道机器人或无人机" : "No devices yet. Click “Add device” to create a crawler or drone."}
                    </Typography>
                  </Box>
                )}
              </Paper>

              {/* 基站列表 */}
              <Stack direction="row" spacing={1.5} sx={{ alignItems: "baseline", mb: 1.5 }}>
                <Typography sx={{ fontSize: 16, fontWeight: 600, color: "var(--pm-color-text-primary)" }}>
                  {T.stationsSection[lang]}
                </Typography>
                <Typography sx={{ fontSize: 12, color: "var(--pm-color-text-hint)" }}>
                  {zh ? "供路径推算与指令下发；首页地图可点选位置标注" : "For routing & commands; click-to-place coming on Home map"}
                </Typography>
              </Stack>
              <Paper elevation={0} variant="outlined" sx={{ borderRadius: "16px", borderColor: "var(--pm-color-border)", overflow: "hidden" }}>
                {stations.length === 0 ? (
                  <Box sx={{ p: 5, textAlign: "center" }}>
                    <Typography sx={{ fontSize: 13, color: "var(--pm-color-text-hint)" }}>
                      {zh ? "尚未规划基站：点击右上角「新增基站」填写经纬度" : "No base stations yet. Click “Add station” and enter lon/lat."}
                    </Typography>
                  </Box>
                ) : (
                  stations.map((station, index) => (
                    <Box key={station.id}>
                      {index > 0 && <Divider sx={{ mx: 3, borderColor: "var(--pm-color-divider)" }} />}
                      <Box sx={{ px: { xs: 2.5, sm: 3 }, py: 1.75 }}>
                        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                          <Box
                            sx={{
                              width: 38,
                              height: 38,
                              flexShrink: 0,
                              borderRadius: "10px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "#1664ff",
                              backgroundColor: "var(--pm-color-primary-soft)",
                            }}
                          >
                            <CellTowerRounded sx={{ fontSize: 20 }} />
                          </Box>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                              <Typography sx={{ fontSize: 15, fontWeight: 600, color: "var(--pm-color-text-primary)" }}>{station.name}</Typography>
                              <Chip
                                size="small"
                                label={station.purpose === "charging" ? t("充电站", "Charging") : station.purpose === "relay" ? t("中继站", "Relay") : t("指挥站", "Command")}
                                sx={{ height: 20, fontSize: 10.5, color: "#1664ff", backgroundColor: "var(--pm-color-primary-soft)" }}
                              />
                            </Stack>
                            <Typography sx={{ mt: 0.25, fontSize: 12, fontFamily: "Consolas, monospace", color: "var(--pm-color-text-hint)" }}>
                              {station.lon.toFixed(6)}, {station.lat.toFixed(6)}
                              {station.description ? ` · ${station.description}` : ""}
                            </Typography>
                          </Box>
                          <IconButton size="small" title={t("编辑", "Edit")} onClick={() => { setStationDialog(station); setStationForm({ name: station.name, lon: String(station.lon), lat: String(station.lat), purpose: station.purpose, description: station.description ?? "" }); }} sx={ghostIcon()}>
                            <EditOutlined sx={{ fontSize: 18 }} />
                          </IconButton>
                          <IconButton size="small" title={t("删除", "Delete")} onClick={() => void removeStation(station)} sx={ghostIcon()}>
                            <DeleteOutlineRounded sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Stack>
                      </Box>
                    </Box>
                  ))
                )}
              </Paper>
            </>
          )}

          {/* 设备新增/编辑 */}
          <Dialog open={editing !== null} onClose={() => setEditing(null)} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ fontSize: 17, fontWeight: 700 }}>
              {editing === "new" ? t("新增设备", "Add device") : t("编辑设备", "Edit device")}
            </DialogTitle>
            <DialogContent>
              <Stack spacing={2} sx={{ mt: 1 }}>
                <TextField size="small" label={t("名称", "Name")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <Select size="small" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <MenuItem value="crawler">{t("管道机器人", "Crawler")}</MenuItem>
                  <MenuItem value="drone">{t("无人机", "Drone")}</MenuItem>
                </Select>
                <Select size="small" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <MenuItem value="offline">{t("离线", "Offline")}</MenuItem>
                  <MenuItem value="online">{t("在线", "Online")}</MenuItem>
                  <MenuItem value="busy">{t("工作中", "Busy")}</MenuItem>
                  <MenuItem value="fault">{t("故障", "Fault")}</MenuItem>
                </Select>
                <TextField size="small" label={t("备注", "Note")} multiline minRows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 2.5, pb: 2 }}>
              <Button size="small" onClick={() => setEditing(null)} sx={{ borderRadius: "999px", textTransform: "none" }}>{t("取消", "Cancel")}</Button>
              <Button size="small" variant="contained" disableElevation disabled={busy || !form.name.trim()} onClick={() => void saveDevice()} sx={{ borderRadius: "999px", textTransform: "none" }}>
                {t("保存", "Save")}
              </Button>
            </DialogActions>
          </Dialog>

          {/* 巡航路线 */}
          <Dialog open={routeFor !== null} onClose={() => setRouteFor(null)} maxWidth="md" fullWidth>
            <DialogTitle sx={{ fontSize: 17, fontWeight: 700 }}>
              {t("规划巡航路线", "Plan cruise route")}
              {routeFor && (
                <Typography component="span" sx={{ ml: 1, fontSize: 13, color: "var(--pm-color-text-hint)" }}>
                  · {routeFor.name}
                </Typography>
              )}
            </DialogTitle>
            <DialogContent>
              <Stack spacing={1.5}>
                <Alert severity="info" sx={{ borderRadius: "12px" }}>
                  {t(
                    `路线来源（当前 GIS 数据源）：${routeSourceName || "未选择"}。可基于数据源自动生成（沿管网取点），或手动逐行填“经度, 纬度”。`,
                    `Source: ${routeSourceName || "none"}. Generate along the network automatically, or type one lon, lat per line.`,
                  )}
                </Alert>
                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="outlined" disabled={busy} onClick={() => void generateFromSource()} sx={{ borderRadius: "999px", textTransform: "none" }}>
                    {t("基于当前数据源自动生成", "Generate from active source")}
                  </Button>
                  <Button size="small" variant="text" disabled={busy || !pointsText.trim()} onClick={() => setPointsText("")} sx={{ borderRadius: "999px", textTransform: "none" }}>
                    {t("清空", "Clear")}
                  </Button>
                </Stack>
                <TextField
                  size="small"
                  label={t("路线点列（每行：经度, 纬度）", "Points (lon, lat per line)")}
                  multiline
                  minRows={10}
                  value={pointsText}
                  onChange={(e) => setPointsText(e.target.value)}
                  slotProps={{ input: { sx: { fontFamily: "Consolas, 'SF Mono', monospace", fontSize: 12 } } }}
                />
                <Typography sx={{ fontSize: 12, color: "var(--pm-color-text-hint)" }}>
                  {pointsText.trim()
                    ? `${pointsText.trim().split(/\r?\n/).filter(Boolean).length} ${t("个航点", "waypoints")}`
                    : t("尚未生成航点", "No waypoints yet")}
                </Typography>
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 2.5, pb: 2 }}>
              <Button size="small" onClick={() => setRouteFor(null)} sx={{ borderRadius: "999px", textTransform: "none" }}>{t("取消", "Cancel")}</Button>
              <Button size="small" variant="contained" disableElevation disabled={busy} onClick={() => void saveRoute()} sx={{ borderRadius: "999px", textTransform: "none" }}>
                {t("保存巡航路线", "Save route")}
              </Button>
            </DialogActions>
          </Dialog>

          {/* 基站 */}
          <Dialog open={stationDialog !== null} onClose={() => setStationDialog(null)} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ fontSize: 17, fontWeight: 700 }}>
              {stationDialog === "new" ? t("新增基站", "Add station") : t("编辑基站", "Edit station")}
            </DialogTitle>
            <DialogContent>
              <Stack spacing={2} sx={{ mt: 1 }}>
                <TextField size="small" label={t("名称", "Name")} value={stationForm.name} onChange={(e) => setStationForm({ ...stationForm, name: e.target.value })} />
                <Stack direction="row" spacing={1.5}>
                  <TextField size="small" label={t("经度", "Lon")} value={stationForm.lon} onChange={(e) => setStationForm({ ...stationForm, lon: e.target.value })} />
                  <TextField size="small" label={t("纬度", "Lat")} value={stationForm.lat} onChange={(e) => setStationForm({ ...stationForm, lat: e.target.value })} />
                </Stack>
                <Select size="small" value={stationForm.purpose} onChange={(e) => setStationForm({ ...stationForm, purpose: e.target.value })}>
                  <MenuItem value="charging">{t("充电站", "Charging")}</MenuItem>
                  <MenuItem value="relay">{t("中继站", "Relay")}</MenuItem>
                  <MenuItem value="command">{t("指挥站", "Command")}</MenuItem>
                </Select>
                <TextField size="small" label={t("备注", "Note")} value={stationForm.description} onChange={(e) => setStationForm({ ...stationForm, description: e.target.value })} />
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 2.5, pb: 2 }}>
              <Button size="small" onClick={() => setStationDialog(null)} sx={{ borderRadius: "999px", textTransform: "none" }}>{t("取消", "Cancel")}</Button>
              <Button size="small" variant="contained" disableElevation disabled={busy || !stationForm.name.trim()} onClick={() => void saveStation()} sx={{ borderRadius: "999px", textTransform: "none" }}>
                {t("保存", "Save")}
              </Button>
            </DialogActions>
          </Dialog>

          <Snackbar
            open={notice !== null}
            autoHideDuration={3500}
            onClose={() => setNotice(null)}
            anchorOrigin={{ vertical: "top", horizontal: "center" }}
          >
            <Alert severity={notice?.kind ?? "info"} variant="outlined" onClose={() => setNotice(null)} sx={{ borderRadius: "999px", backgroundColor: "rgba(255,255,255,0.95)" }}>
              {notice?.text}
            </Alert>
          </Snackbar>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

function StatCell({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <Box sx={{ flex: 1, minWidth: 0, px: 2, py: 0.5, borderRight: last ? "none" : "1px solid var(--pm-color-divider)" }}>
      <Typography sx={{ fontSize: 11, color: "var(--pm-color-text-hint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
      </Typography>
      <Typography sx={{ mt: 0.5, fontSize: 20, fontWeight: 600, color: "var(--pm-color-text-primary)" }}>
        {value}
      </Typography>
    </Box>
  );
}
