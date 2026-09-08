"use client";

// 设备管理页：管道机器人 / 无人机（增删改查）+ 基于当前 GIS 数据源规划巡航路线 + 基站管理
import { useCallback, useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import AddRounded from "@mui/icons-material/AddRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import EditOutlined from "@mui/icons-material/EditOutlined";
import RouteRounded from "@mui/icons-material/RouteRounded";
import SmartToyRounded from "@mui/icons-material/SmartToyRounded";
import FlightTakeoffRounded from "@mui/icons-material/FlightTakeoffRounded";
import CellTowerRounded from "@mui/icons-material/CellTowerRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import { useI18n } from "@/lib/i18n";
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
interface RouteView {
  sourceText: string | null;
  pointsText: string | null;
  status: string;
}

type Lang = "zh-CN" | "en-US";
const T: Record<string, Record<Lang, string>> = {
  title: { "zh-CN": "设备与基站", "en-US": "Devices & Stations" },
  desc: {
    "zh-CN": "管理管道机器人 / 无人机等设备；基于当前 GIS 数据源规划巡航路线，并规划基站，供路径推算与指令下发。",
    "en-US": "Manage crawlers & drones; plan cruise routes from the active GIS source; place base stations for routing & commands.",
  },
};

async function jfetch(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
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
  const [filter, setFilter] = useState<"all" | "crawler" | "drone">("all");
  const [editing, setEditing] = useState<DeviceItem | null | "new">(null);
  const [form, setForm] = useState({ name: "", type: "crawler", status: "offline", description: "" });
  const [routeFor, setRouteFor] = useState<DeviceItem | null>(null);
  const [routeSourceName, setRouteSourceName] = useState("");
  const [pointsText, setPointsText] = useState("");
  const [stationDialog, setStationDialog] = useState<StationItem | "new" | null>(null);
  const [stationForm, setStationForm] = useState({ name: "", lon: "", lat: "", purpose: "charging", description: "" });
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

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
  const filtered = useMemo(() => {
    const list = devices ?? [];
    return filter === "all" ? list : list.filter((d) => d.type === filter);
  }, [devices, filter]);

  const saveDevice = async (): Promise<void> => {
    setBusy(true);
    try {
      if (editing === "new") {
        await jfetch("/devices", { method: "POST", body: JSON.stringify(form) });
      } else if (editing) {
        await jfetch(`/devices/${editing.id}`, { method: "PATCH", body: JSON.stringify(form) });
      }
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
    if (!globalThis.confirm(t(`确定删除“${device.name}”？`, `Delete "${device.name}"?`))) return;
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
      const saved = (await jfetch(`/devices/${device.id}/route`)) as RouteView | null;
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
      if (points.length < 2) throw new Error(t("数据源中没有可用管网点", "No usable points in source"));
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
      if (points.length < 2) throw new Error(t("路线至少 2 个点（每行：经度, 纬度）", "Need ≥2 points (lon, lat per line)"));
      const source = readActiveGisSource();
      await jfetch(`/devices/${routeFor.id}/route`, {
        method: "PUT",
        body: JSON.stringify({ source: source ? { kind: source.kind, id: source.id, name: source.name } : null, points }),
      });
      setRouteFor(null);
      setNotice({ kind: "success", text: t(`巡航路线已保存（${points.length} 点）`, `Route saved (${points.length} pts)`) });
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const saveStation = async (): Promise<void> => {
    setBusy(true);
    try {
      const payload = { name: stationForm.name.trim(), lon: Number(stationForm.lon), lat: Number(stationForm.lat), purpose: stationForm.purpose, description: stationForm.description.trim() || null };
      if (stationDialog === "new") await jfetch("/base-stations", { method: "POST", body: JSON.stringify(payload) });
      else if (stationDialog) await jfetch(`/base-stations/${stationDialog.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      setStationDialog(null);
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

  const statusColor = (status: string): string => (status === "online" ? "#0a8a5f" : status === "busy" ? "#b25e09" : status === "fault" ? "#cf1322" : "#86909c");
  const statusLabel = (status: string): string =>
    zh ? (status === "online" ? "在线" : status === "busy" ? "工作中" : status === "fault" ? "故障" : "离线") : status;

  return (
    <Box sx={{ px: { xs: 2, sm: 3 }, py: 2.5, overflowY: "auto", height: "100%" }}>
      <Stack direction="row" sx={{ alignItems: "center", mb: 2 }}>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontSize: 20, fontWeight: 800 }}>{T.title[lang]}</Typography>
          <Typography sx={{ fontSize: 12.5, color: "var(--pm-color-text-hint)", maxWidth: 760 }}>{T.desc[lang]}</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" startIcon={<RefreshRounded sx={{ fontSize: 16 }} />} onClick={() => void refresh()}>{t("刷新", "Refresh")}</Button>
          <Button size="small" variant="outlined" startIcon={<CellTowerRounded sx={{ fontSize: 16 }} />} onClick={() => { setStationDialog("new"); setStationForm({ name: "", lon: "", lat: "", purpose: "charging", description: "" }); }}>{t("新增基站", "Add station")}</Button>
          <Button size="small" variant="contained" disableElevation startIcon={<AddRounded sx={{ fontSize: 16 }} />} onClick={() => { setEditing("new"); setForm({ name: "", type: "crawler", status: "offline", description: "" }); }}>{t("新增设备", "Add device")}</Button>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
        {([["all", t("全部", "All")], ["crawler", t("管道机器人", "Crawler")], ["drone", t("无人机", "Drone")]] as const).map(([key, label]) => {
          const active = filter === key;
          return (
            <Button key={key} size="small" onClick={() => setFilter(key)} sx={{ borderRadius: "999px", px: 1.5, fontSize: 12.5, color: active ? "var(--pm-color-primary)" : "var(--pm-color-text-secondary)", backgroundColor: active ? "var(--pm-color-primary-soft)" : "transparent", "&:hover": { backgroundColor: active ? "var(--pm-color-primary-soft)" : "rgba(0,0,0,0.04)" } }}>
              {label}
            </Button>
          );
        })}
      </Stack>

      {devices === null || stations === null ? (
        <LinearProgress sx={{ mt: 2 }} />
      ) : (
        <>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(auto-fill, minmax(300px, 1fr))" }, gap: 1.5, mb: 3 }}>
            {filtered.length === 0 && (
              <Paper elevation={0} variant="outlined" sx={{ p: 3, borderRadius: "14px", borderColor: "var(--pm-color-border)" }}>
                <Typography sx={{ fontSize: 13, color: "var(--pm-color-text-hint)" }}>{t("暂无设备，点右上角“新增设备”", "No devices yet. Click “Add device”.")}</Typography>
              </Paper>
            )}
            {filtered.map((device) => (
              <Paper key={device.id} elevation={0} variant="outlined" sx={{ p: 1.75, borderRadius: "14px", borderColor: "var(--pm-color-border)", backgroundColor: "rgba(255,255,255,0.9)" }}>
                <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
                  {device.type === "drone" ? <FlightTakeoffRounded sx={{ fontSize: 22, color: "#1664ff" }} /> : <SmartToyRounded sx={{ fontSize: 22, color: "#1664ff" }} />}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 15, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{device.name}</Typography>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Chip size="small" label={t(device.type === "crawler" ? "管道机器人" : "无人机", device.type)} sx={{ height: 20, fontSize: 10.5, backgroundColor: "var(--pm-color-primary-soft)", color: "var(--pm-color-primary)" }} />
                      <Typography sx={{ fontSize: 11, fontWeight: 700, color: statusColor(device.status) }}>{statusLabel(device.status)}</Typography>
                    </Stack>
                  </Box>
                  <IconButton size="small" title={t("巡航路线", "Cruise route")} onClick={() => void openRoute(device)}><RouteRounded sx={{ fontSize: 18, color: "#1664ff" }} /></IconButton>
                  <IconButton size="small" title={t("编辑", "Edit")} onClick={() => { setEditing(device); setForm({ name: device.name, type: device.type, status: device.status, description: device.description ?? "" }); }}><EditOutlined sx={{ fontSize: 18, color: "var(--pm-color-text-secondary)" }} /></IconButton>
                  <IconButton size="small" title={t("删除", "Delete")} onClick={() => void removeDevice(device)}><DeleteOutlineRounded sx={{ fontSize: 18, color: "var(--pm-color-text-hint)" }} /></IconButton>
                </Stack>
                {device.description && <Typography sx={{ mt: 1, fontSize: 11.5, color: "var(--pm-color-text-hint)", lineHeight: 1.5 }}>{device.description}</Typography>}
              </Paper>
            ))}
          </Box>

          <Typography sx={{ fontSize: 15, fontWeight: 800, mb: 1 }}>{t("基站（供路径推算与指令下发）", "Base stations (for routing & commands)")}</Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(auto-fill, minmax(300px, 1fr))" }, gap: 1.5 }}>
            {stations.length === 0 && (
              <Paper elevation={0} variant="outlined" sx={{ p: 2, borderRadius: "14px", borderColor: "var(--pm-color-border)" }}>
                <Typography sx={{ fontSize: 13, color: "var(--pm-color-text-hint)" }}>
                  {t("尚未规划基站：可在此填经纬度新增；首页地图将支持直接点选标注基站位置。", "No stations yet: add lon/lat here; the Home map will support click-to-place stations.")}
                </Typography>
              </Paper>
            )}
            {stations.map((station) => (
              <Paper key={station.id} elevation={0} variant="outlined" sx={{ p: 1.75, borderRadius: "14px", borderColor: "var(--pm-color-border)" }}>
                <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
                  <CellTowerRounded sx={{ fontSize: 22, color: "#1664ff" }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 700 }}>{station.name}</Typography>
                    <Typography sx={{ fontSize: 11.5, color: "var(--pm-color-text-hint)", fontFamily: "Consolas, monospace" }}>
                      {station.lon.toFixed(6)}, {station.lat.toFixed(6)}
                    </Typography>
                  </Box>
                  <IconButton size="small" onClick={() => { setStationDialog(station); setStationForm({ name: station.name, lon: String(station.lon), lat: String(station.lat), purpose: station.purpose, description: station.description ?? "" }); }}><EditOutlined sx={{ fontSize: 17, color: "var(--pm-color-text-secondary)" }} /></IconButton>
                  <IconButton size="small" onClick={() => void removeStation(station)}><DeleteOutlineRounded sx={{ fontSize: 17, color: "var(--pm-color-text-hint)" }} /></IconButton>
                </Stack>
              </Paper>
            ))}
          </Box>
        </>
      )}

      <Dialog open={editing !== null} onClose={() => setEditing(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{editing === "new" ? t("新增设备", "Add device") : t("编辑设备", "Edit device")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label={t("名称", "Name")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Select size="small" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <MenuItem value="crawler">{t("管道机器人", "Crawler")}</MenuItem>
              <MenuItem value="drone">{t("无人机", "Drone")}</MenuItem>
            </Select>
            <Select size="small" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <MenuItem value="offline">{t("离线", "offline")}</MenuItem>
              <MenuItem value="online">{t("在线", "online")}</MenuItem>
              <MenuItem value="busy">{t("工作中", "busy")}</MenuItem>
              <MenuItem value="fault">{t("故障", "fault")}</MenuItem>
            </Select>
            <TextField label={t("备注", "Note")} multiline minRows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2 }}>
          <Button size="small" onClick={() => setEditing(null)}>{t("取消", "Cancel")}</Button>
          <Button size="small" variant="contained" disableElevation disabled={busy || !form.name.trim()} onClick={() => void saveDevice()}>{t("保存", "Save")}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={routeFor !== null} onClose={() => setRouteFor(null)} maxWidth="md" fullWidth>
        <DialogTitle>
          {t("规划巡航路线", "Plan cruise route")}
          {routeFor && <Typography component="span" sx={{ ml: 1, fontSize: 13, color: "var(--pm-color-text-hint)" }}>· {routeFor.name}</Typography>}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={1.5}>
            <Alert severity="info">
              {t(`路线来源（当前数据源）：${routeSourceName || "未选择"}。可基于数据源自动生成（沿管网取点），或手动逐行填“经度, 纬度”。`, `Source: ${routeSourceName || "none"}. Auto-generate along the network or type lon, lat per line.`)}
            </Alert>
            <Stack direction="row" spacing={1}>
              <Button size="small" variant="outlined" disabled={busy} onClick={() => void generateFromSource()}>{t("基于当前数据源自动生成", "Generate from active source")}</Button>
              <Button size="small" variant="text" disabled={busy || !pointsText.trim()} onClick={() => setPointsText("")}>{t("清空", "Clear")}</Button>
            </Stack>
            <TextField
              label={t("路线点列（每行：经度, 纬度）", "Points (lon, lat per line)")}
              multiline
              minRows={10}
              value={pointsText}
              onChange={(e) => setPointsText(e.target.value)}
              slotProps={{ input: { sx: { fontFamily: "Consolas, 'SF Mono', monospace", fontSize: 12 } } }}
            />
            <Typography sx={{ fontSize: 12, color: "var(--pm-color-text-hint)" }}>
              {pointsText.trim() ? `${pointsText.trim().split(/\r?\n/).filter(Boolean).length} ${t("个航点", "waypoints")}` : t("尚未生成航点", "No waypoints yet")}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2 }}>
          <Button size="small" onClick={() => setRouteFor(null)}>{t("取消", "Cancel")}</Button>
          <Button size="small" variant="contained" disableElevation disabled={busy} onClick={() => void saveRoute()}>{t("保存巡航路线", "Save route")}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={stationDialog !== null} onClose={() => setStationDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{stationDialog === "new" ? t("新增基站", "Add station") : t("编辑基站", "Edit station")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label={t("名称", "Name")} value={stationForm.name} onChange={(e) => setStationForm({ ...stationForm, name: e.target.value })} />
            <Stack direction="row" spacing={1.5}>
              <TextField label={t("经度", "Lon")} value={stationForm.lon} onChange={(e) => setStationForm({ ...stationForm, lon: e.target.value })} />
              <TextField label={t("纬度", "Lat")} value={stationForm.lat} onChange={(e) => setStationForm({ ...stationForm, lat: e.target.value })} />
            </Stack>
            <Select size="small" value={stationForm.purpose} onChange={(e) => setStationForm({ ...stationForm, purpose: e.target.value })}>
              <MenuItem value="charging">{t("充电站", "Charging")}</MenuItem>
              <MenuItem value="relay">{t("中继站", "Relay")}</MenuItem>
              <MenuItem value="command">{t("指挥站", "Command")}</MenuItem>
            </Select>
            <TextField label={t("备注", "Note")} value={stationForm.description} onChange={(e) => setStationForm({ ...stationForm, description: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2 }}>
          <Button size="small" onClick={() => setStationDialog(null)}>{t("取消", "Cancel")}</Button>
          <Button size="small" variant="contained" disableElevation disabled={busy || !stationForm.name.trim()} onClick={() => void saveStation()}>{t("保存", "Save")}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={notice !== null} autoHideDuration={3500} onClose={() => setNotice(null)} anchorOrigin={{ vertical: "top", horizontal: "center" }}>
        <Alert severity={notice?.kind ?? "info"} variant="outlined" onClose={() => setNotice(null)} sx={{ borderRadius: "999px", backgroundColor: "rgba(255,255,255,0.95)" }}>{notice?.text}</Alert>
      </Snackbar>
    </Box>
  );
}
