"use client";

// 设备与基站：设备发起注册 → 管理端审批（同意签发一次性密钥/拒绝），巡航路线、基站管理
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import CellTowerRounded from "@mui/icons-material/CellTowerRounded";
import CheckRounded from "@mui/icons-material/CheckRounded";
import CloseRounded from "@mui/icons-material/CloseRounded";
import ContentCopyRounded from "@mui/icons-material/ContentCopyRounded";
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
  state: "pending" | "approved" | "rejected" | "revoked";
  description: string | null;
  registeredAt: string | null;
  createdAt: string;
}
interface StationItem {
  id: number;
  name: string;
  lon: number;
  lat: number;
  purpose: string;
  description: string | null;
}

/** 从 GeoJSON 提取管线坐标段（用于“地图点选基站”的背景底图） */
function extractGeoLines(raw: unknown): number[][][] {
  const lines: number[][][] = [];
  const fc = raw as { features?: Array<{ geometry?: { type?: string; coordinates?: unknown } }> };
  if (!fc?.features) return lines;
  for (const feature of fc.features) {
    const g = feature.geometry;
    if (!g) continue;
    const push = (coord: unknown): void => {
      if (!Array.isArray(coord)) return;
      const line = coord
        .filter((c): c is number[] => Array.isArray(c) && c.length >= 2)
        .map((c) => [Number(c[0]), Number(c[1])]);
      if (line.length >= 2) lines.push(line);
    };
    if (g.type === "MultiLineString" && Array.isArray(g.coordinates)) {
      (g.coordinates as unknown[]).forEach(push);
    } else if (g.type === "LineString") {
      push(g.coordinates);
    }
  }
  return lines;
}

/** 点选地图的视口变换（zoom + 平移偏移，CSS 像素坐标系） */
export interface PickerView {
  zoom: number;
  tx: number;
  ty: number;
}

const PAD = 30;

/** 依据数据范围计算“贴合画布”的基准投影几何 */
function pickerFit(
  lines: number[][][],
  width: number,
  height: number,
): { minLon: number; maxLat: number; cos: number; scale: number } {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const line of lines) {
    for (const [lon, lat] of line) {
      minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    }
  }
  if (!Number.isFinite(minLon)) {
    minLon = 126.5; maxLon = 127.5; minLat = 46.3; maxLat = 46.9;
  }
  const cos = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
  const spanLonM = (maxLon - minLon) * 111320 * cos;
  const spanLatM = (maxLat - minLat) * 110540;
  const scale = Math.min((width - PAD * 2) / Math.max(spanLonM, 1), (height - PAD * 2) / Math.max(spanLatM, 1));
  return { minLon, maxLat, cos, scale };
}

function pickerBasePoint(fit: { minLon: number; maxLat: number; cos: number; scale: number }, lon: number, lat: number): { x: number; y: number } {
  return {
    x: PAD + (lon - fit.minLon) * 111320 * fit.cos * fit.scale,
    y: PAD + (fit.maxLat - lat) * 110540 * fit.scale,
  };
}

function pickerToCss(width: number, height: number, view: PickerView, x: number, y: number): { x: number; y: number } {
  const cx = width / 2, cy = height / 2;
  return { x: (x - cx) * view.zoom + cx + view.tx, y: (y - cy) * view.zoom + cy + view.ty };
}

function pickerFromCss(
  lines: number[][][],
  width: number,
  height: number,
  view: PickerView,
  cssX: number,
  cssY: number,
): { lon: number; lat: number } {
  const fit = pickerFit(lines, width, height);
  const cx = width / 2, cy = height / 2;
  const bx = (cssX - view.tx - cx) / view.zoom + cx;
  const by = (cssY - view.ty - cy) / view.zoom + cy;
  const lon = fit.minLon + (bx - PAD) / (111320 * fit.cos * fit.scale);
  const lat = fit.maxLat - (by - PAD) / (110540 * fit.scale);
  return { lon, lat };
}

/** 画“地图点选”底图：管线 + 已选点，支持 view 平移/缩放 */
function paintStationPicker(
  canvas: HTMLCanvasElement,
  lines: number[][][],
  pick: { lon: number; lat: number } | null,
  view: PickerView,
): void {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const W = Math.max(1, rect.width || 1);
  const H = Math.max(1, rect.height || 1);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const fit = pickerFit(lines, W, H);
  const at = (lon: number, lat: number): { x: number; y: number } =>
    pickerToCss(W, H, view, pickerBasePoint(fit, lon, lat).x, pickerBasePoint(fit, lon, lat).y);
  // 网格（固定屏幕空间）
  ctx.strokeStyle = "#eef2f7";
  ctx.lineWidth = 1;
  for (let i = 0; i < W; i += 40) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke(); }
  for (let i = 0; i < H; i += 40) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(W, i); ctx.stroke(); }
  // 管线
  ctx.lineCap = "round";
  for (const line of lines) {
    ctx.strokeStyle = "#8fb7ff";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    line.forEach(([lon, lat], i) => {
      const p = at(lon, lat);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
  }
  if (lines.length === 0) {
    ctx.fillStyle = "#9aa4b2";
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("滚轮缩放 / 拖拽平移 / 点击选点（当前无 GIS 底图）", W / 2, H / 2 - 30);
  }
  // 已选点
  if (pick) {
    const p = at(pick.lon, pick.lat);
    ctx.strokeStyle = "#cf1322";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x - 12, p.y); ctx.lineTo(p.x + 12, p.y);
    ctx.moveTo(p.x, p.y - 12); ctx.lineTo(p.x, p.y + 12);
    ctx.stroke();
  }
}

type Lang = "zh-CN" | "en-US";
const T: Record<string, Record<Lang, string>> = {
  title: { "zh-CN": "设备与基站", "en-US": "Devices & Stations" },
  subtitle: {
    "zh-CN": "设备端发起注册申请，由本系统审批同意后签发一次性密钥接入；并为已注册设备规划基于 GIS 数据源的巡航路线，管理基站。",
    "en-US": "Devices apply to join; the system approves them and issues a one-time secret. Plan cruise routes from the GIS source and manage base stations.",
  },
};

async function jfetch(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...init });
  if (!res.ok) {
    const body = await res.text();
    let message = `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(body) as { message?: string };
      if (parsed.message) message = parsed.message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
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

const STATE_CHIP: Record<string, { label: (zh: boolean) => string; color: string; bg: string }> = {
  pending: { label: (zh) => (zh ? "待审批" : "Pending"), color: "#b25e09", bg: "rgba(178,94,9,0.1)" },
  approved: { label: (zh) => (zh ? "已注册" : "Approved"), color: "#1664ff", bg: "var(--pm-color-primary-soft)" },
  rejected: { label: (zh) => (zh ? "已拒绝" : "Rejected"), color: "#cf1322", bg: "rgba(207,19,34,0.08)" },
  revoked: { label: (zh) => (zh ? "已注销" : "Revoked"), color: "#86909c", bg: "rgba(134,144,156,0.12)" },
};

export default function DevicesPage() {
  const { lang } = useI18n();
  const zh = lang === "zh-CN";
  const t = (zhText: string, enText: string): string => (zh ? zhText : enText);

  const [devices, setDevices] = useState<DeviceItem[] | null>(null);
  const [stations, setStations] = useState<StationItem[] | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // 审批密钥（一次性展示）
  const [secretDialog, setSecretDialog] = useState<{ name: string; id: number; secret: string } | null>(null);
  const [copied, setCopied] = useState<"secret" | "curl" | null>(null);

  // 编辑（仅名称/备注）、路线、基站
  const [editing, setEditing] = useState<DeviceItem | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "" });
  const [routeFor, setRouteFor] = useState<DeviceItem | null>(null);
  const [routeSourceName, setRouteSourceName] = useState("");
  const [pointsText, setPointsText] = useState("");
  const [stationDialog, setStationDialog] = useState<StationItem | "new" | null>(null);
  const [stationForm, setStationForm] = useState({ name: "", purpose: "charging", description: "" });
  // 地图点选基站（不手输经纬度）
  const stationCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stationLines, setStationLines] = useState<number[][][]>([]);
  const [stationPick, setStationPick] = useState<{ lon: number; lat: number } | null>(null);

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
      crawler: list.filter((d) => d.type === "crawler" && d.state !== "revoked").length,
      drone: list.filter((d) => d.type === "drone" && d.state !== "revoked").length,
      pending: list.filter((d) => d.state === "pending").length,
      approved: list.filter((d) => d.state === "approved").length,
    };
  }, [devices]);

  const orderedDevices = useMemo(() => {
    const order: Record<string, number> = { pending: 0, approved: 1, rejected: 2, revoked: 3 };
    const list = devices ?? [];
    return [...list].sort((a, b) => (order[a.state] ?? 9) - (order[b.state] ?? 9) || a.createdAt.localeCompare(b.createdAt));
  }, [devices]);

  // ---------- 设备入网审批 ----------
  const approveDevice = async (device: DeviceItem): Promise<void> => {
    if (!globalThis.confirm(t(`同意“${device.name}”入网？批准后将签发一次性设备密钥。`, `Approve "${device.name}"? A one-time secret will be issued.`))) return;
    setBusy(true);
    try {
      const resp = (await jfetch(`/devices/${device.id}/approve`, { method: "POST" })) as { device: DeviceItem; secret: string };
      setSecretDialog({ name: resp.device.name, id: resp.device.id, secret: resp.secret });
      await refresh();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const rejectDevice = async (device: DeviceItem): Promise<void> => {
    if (!globalThis.confirm(t(`拒绝“${device.name}”的注册申请？`, `Reject "${device.name}" registration?`))) return;
    try {
      await jfetch(`/devices/${device.id}/reject`, { method: "POST" });
      await refresh();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    }
  };

  const removeDevice = async (device: DeviceItem): Promise<void> => {
    if (!globalThis.confirm(t(`删除“${device.name}”？`, `Remove "${device.name}"?`))) return;
    try {
      await jfetch(`/devices/${device.id}`, { method: "DELETE" });
      await refresh();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    }
  };

  const saveEdit = async (): Promise<void> => {
    if (!editing) return;
    setBusy(true);
    try {
      await jfetch(`/devices/${editing.id}`, { method: "PATCH", body: JSON.stringify(editForm) });
      setEditing(null);
      await refresh();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  // ---------- 巡航路线 ----------
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

  // ---------- 基站 ----------
  const saveStation = async (): Promise<void> => {
    if (!stationPick) {
      setNotice({ kind: "error", text: t("请先在地图上点选基站位置", "Click the map to place the station first") });
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: stationForm.name.trim(),
        lon: Number(stationPick.lon.toFixed(6)),
        lat: Number(stationPick.lat.toFixed(6)),
        purpose: stationForm.purpose,
        description: stationForm.description.trim() || null,
      };
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

  /** 打开基站对话框：同步当前 GIS 数据源作为点选底图 */
  const openStationDialog = async (station: StationItem | "new"): Promise<void> => {
    setStationDialog(station);
    setStationPick(station === "new" ? null : { lon: station.lon, lat: station.lat });
    setStationForm({
      name: station === "new" ? t(`基站 ${(stations?.length ?? 0) + 1}`, `Station ${(stations?.length ?? 0) + 1}`) : station.name,
      purpose: station === "new" ? "charging" : station.purpose,
      description: station === "new" ? "" : station.description ?? "",
    });
    const source = readActiveGisSource();
    if (!source) {
      setStationLines([]);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/data-files/${source.id}/content`, { credentials: "include" });
      if (res.ok) setStationLines(extractGeoLines((await res.json()) as unknown));
    } catch {
      /* 底图加载失败不阻塞点选 */
    }
  };

  // 点选地图：支持缩放/平移/点击选点
  const stationViewRef = useRef<PickerView>({ zoom: 1, tx: 0, ty: 0 });
  const stationDragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const repaintPicker = (): void => {
    const cv = stationCanvasRef.current;
    if (cv) paintStationPicker(cv, stationLines, stationPick, stationViewRef.current);
  };

  // 打开对话框 / 更换底图：重置视图、绘制并挂载滚轮缩放（原生非被动，可阻止页面滚动）
  useEffect(() => {
    const cv = stationCanvasRef.current;
    if (!cv || stationDialog === null) return;
    stationViewRef.current = { zoom: 1, tx: 0, ty: 0 };
    const frame = requestAnimationFrame(repaintPicker);
    const wheelHandler = (ev: WheelEvent): void => {
      ev.preventDefault();
      zoomStationAt(ev.clientX, ev.clientY, ev.deltaY);
    };
    cv.addEventListener("wheel", wheelHandler, { passive: false });
    return () => {
      cancelAnimationFrame(frame);
      cv.removeEventListener("wheel", wheelHandler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationDialog, stationLines]);

  const zoomStationAt = (clientX: number, clientY: number, deltaY: number): void => {
    const cv = stationCanvasRef.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const W = Math.max(1, rect.width || 1);
    const H = Math.max(1, rect.height || 1);
    const cssX = clientX - rect.left;
    const cssY = clientY - rect.top;
    const v = stationViewRef.current;
    const factor = deltaY < 0 ? 1.18 : 1 / 1.18;
    const nextZoom = Math.min(24, Math.max(0.3, v.zoom * factor));
    if (Math.abs(nextZoom - v.zoom) < 0.0001) return;
    const cxx = cssX - W / 2;
    const cyy = cssY - H / 2;
    const baseX = (cxx - v.tx) / v.zoom;
    const baseY = (cyy - v.ty) / v.zoom;
    v.zoom = nextZoom;
    v.tx = cxx - baseX * nextZoom;
    v.ty = cyy - baseY * nextZoom;
    repaintPicker();
  };

  // 选点变化后重绘（保留当前缩放/平移）
  useEffect(() => {
    if (stationDialog === null) return;
    const frame = requestAnimationFrame(repaintPicker);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationPick]);

  const onStationPointerDown = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (event.button !== 0) return;
    (event.currentTarget as HTMLCanvasElement).setPointerCapture?.(event.pointerId);
    stationDragRef.current = { x: event.clientX, y: event.clientY, moved: false };
  };

  const onStationPointerMove = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const drag = stationDragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (drag.moved) {
      const v = stationViewRef.current;
      v.tx += dx;
      v.ty += dy;
      stationDragRef.current = { x: event.clientX, y: event.clientY, moved: true };
      repaintPicker();
    }
  };

  const onStationPointerUp = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const cv = stationCanvasRef.current;
    const drag = stationDragRef.current;
    stationDragRef.current = null;
    if (!cv || !drag || drag.moved) return;
    const rect = cv.getBoundingClientRect();
    const cssX = event.clientX - rect.left;
    const cssY = event.clientY - rect.top;
    const p = pickerFromCss(stationLines, Math.max(1, rect.width || 1), Math.max(1, rect.height || 1), stationViewRef.current, cssX, cssY);
    setStationPick({ lon: p.lon, lat: p.lat });
  };

  const onStationPointerCancel = (): void => {
    stationDragRef.current = null;
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

  const copyText = async (text: string, key: "secret" | "curl"): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1400);
    } catch {
      /* ignore */
    }
  };

  const secretCurl = (id: number, secret: string): string =>
    `curl -X POST 'http://localhost:3001/api/devices/${id}/telemetry' \\\n  -H 'Content-Type: application/json' \\\n  -H 'x-device-key: ${secret}' \\\n  -d '{"lon":126.9,"lat":46.61,"speed":1.2}'`;

  const runtimeStatus = (status: string): { color: string; label: string } => {
    const map: Record<string, { color: string; label: string }> = {
      online: { color: "#2e9e5b", label: zh ? "在线" : "Online" },
      busy: { color: "#b25e09", label: zh ? "工作中" : "Busy" },
      fault: { color: "#cf1322", label: zh ? "故障" : "Fault" },
      offline: { color: "#86909c", label: zh ? "离线" : "Offline" },
    };
    return map[status] ?? map.offline;
  };

  const pillBtn = {
    borderRadius: "999px",
    textTransform: "none" as const,
    fontSize: 12,
  };
  const ghost = (color = "var(--pm-color-text-secondary)") => ({
    color,
    "&:hover": { backgroundColor: "var(--pm-color-primary-soft)", color: "#1664ff" },
  });

  return (
    <ThemeProvider theme={pmTheme}>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: { xs: 2.5, sm: 4, md: 10 }, pt: { xs: 10, sm: 12 }, pb: 24 }}>
        <Box sx={{ width: "100%", maxWidth: 880, mx: "auto" }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start", mb: 4 }}>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontSize: 22, fontWeight: 700, color: "var(--pm-color-text-primary)" }}>{T.title[lang]}</Typography>
              <Typography sx={{ mt: 1, fontSize: 13, color: "var(--pm-color-text-hint)" }}>{T.subtitle[lang]}</Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button size="small" variant="outlined" startIcon={<RefreshRounded sx={{ fontSize: 15 }} />} onClick={() => void refresh()} sx={{ ...pillBtn, color: "var(--pm-color-text-secondary)", borderColor: "var(--pm-color-border)", "&:hover": { borderColor: "#1664ff", color: "#1664ff" } }}>
                {zh ? "刷新" : "Refresh"}
              </Button>
              <Button size="small" variant="outlined" startIcon={<CellTowerRounded sx={{ fontSize: 15 }} />} onClick={() => void openStationDialog("new")} sx={{ ...pillBtn, color: "var(--pm-color-text-secondary)", borderColor: "var(--pm-color-border)", "&:hover": { borderColor: "#1664ff", color: "#1664ff" } }}>
                {zh ? "新建基站" : "Add station"}
              </Button>
            </Stack>
          </Stack>

          {devices === null || stations === null ? (
            <Stack sx={{ alignItems: "center", justifyContent: "center", minHeight: 240 }}>
              <CircularProgress size={24} sx={{ color: "var(--pm-color-primary)" }} />
            </Stack>
          ) : (
            <>
              <Paper elevation={0} variant="outlined" sx={{ borderRadius: "16px", borderColor: "var(--pm-color-border)", px: { xs: 2.5, sm: 4 }, py: { xs: 2.5, sm: 3 }, mb: 4 }}>
                <Stack direction="row" sx={{ alignItems: "stretch" }}>
                  <StatCell label={zh ? "设备总数" : "Total"} value={String(counts.total)} />
                  <StatCell label={zh ? "管道机器人" : "Crawlers"} value={String(counts.crawler)} />
                  <StatCell label={zh ? "无人机" : "Drones"} value={String(counts.drone)} />
                  <StatCell label={zh ? "已注册" : "Approved"} value={String(counts.approved)} last={false} />
                  <StatCell label={zh ? "待审批" : "Pending"} value={String(counts.pending)} last />
                </Stack>
              </Paper>

              <Stack direction="row" spacing={1.5} sx={{ alignItems: "baseline", mb: 1.5 }}>
                <Typography sx={{ fontSize: 16, fontWeight: 600, color: "var(--pm-color-text-primary)" }}>
                  {zh ? "设备" : "Devices"}
                </Typography>
                <Typography sx={{ fontSize: 12, color: "var(--pm-color-text-hint)" }}>
                  {zh ? "待审批设备请点「同意」并配置一次性密钥" : "Approve pending devices to issue their one-time secret"}
                </Typography>
              </Stack>

              <Paper elevation={0} variant="outlined" sx={{ borderRadius: "16px", borderColor: "var(--pm-color-border)", overflow: "hidden", mb: 4 }}>
                {orderedDevices.length === 0 ? (
                  <Box sx={{ p: 5, textAlign: "center" }}>
                    <Typography sx={{ fontSize: 13, color: "var(--pm-color-text-hint)" }}>
                      {zh ? "暂无设备。设备端通过 POST /api/devices/register 发起入网申请，待审批的设备将出现在此处。" : "No devices yet. Devices apply via POST /api/devices/register; pending requests appear here."}
                    </Typography>
                  </Box>
                ) : (
                  orderedDevices.map((device, index) => {
                    const stateChip = STATE_CHIP[device.state] ?? STATE_CHIP.pending;
                    const runtime = device.state === "approved" ? runtimeStatus(device.status) : null;
                    return (
                      <Box key={device.id}>
                        {index > 0 && <Divider sx={{ mx: 3, borderColor: "var(--pm-color-divider)" }} />}
                        <Box sx={{ px: { xs: 2.5, sm: 3 }, py: 2 }}>
                          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                            <Box sx={{ width: 38, height: 38, flexShrink: 0, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", color: "#1664ff", backgroundColor: "var(--pm-color-primary-soft)" }}>
                              {device.type === "drone" ? <FlightTakeoffRounded sx={{ fontSize: 20 }} /> : <SmartToyRounded sx={{ fontSize: 20 }} />}
                            </Box>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                                <Typography sx={{ fontSize: 15, fontWeight: 600, color: "var(--pm-color-text-primary)" }}>{device.name}</Typography>
                                <Chip size="small" label={stateChip.label(zh)} sx={{ height: 20, fontSize: 10.5, color: stateChip.color, backgroundColor: stateChip.bg }} />
                                {runtime && (
                                  <>
                                    <Box sx={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: runtime.color }} />
                                    <Typography sx={{ fontSize: 11.5, color: runtime.color }}>{runtime.label}</Typography>
                                  </>
                                )}
                              </Stack>
                              <Typography sx={{ mt: 0.25, fontSize: 12, color: "var(--pm-color-text-hint)" }}>
                                {device.type === "crawler" ? t("管道机器人", "Crawler") : t("无人机", "Drone")}
                                {device.description ? ` · ${device.description}` : ""}
                                {device.state === "approved" && device.registeredAt
                                  ? ` · ${t("接入于", "Joined")} ${new Date(device.registeredAt).toLocaleString(zh ? "zh-CN" : "en-US", { hour12: false })}`
                                  : device.state === "pending"
                                    ? ` · ${t("等待审批…", "Awaiting approval…")}`
                                    : ""}
                              </Typography>
                            </Box>

                            {device.state === "pending" ? (
                              <Stack direction="row" spacing={1}>
                                <Button size="small" variant="contained" disableElevation startIcon={<CheckRounded sx={{ fontSize: 15 }} />} disabled={busy} onClick={() => void approveDevice(device)} sx={{ ...pillBtn, color: "#fff", backgroundColor: "#1664ff", "&:hover": { backgroundColor: "#0f54d6" } }}>
                                  {zh ? "同意" : "Approve"}
                                </Button>
                                <Button size="small" variant="outlined" startIcon={<CloseRounded sx={{ fontSize: 15 }} />} onClick={() => void rejectDevice(device)} sx={{ ...pillBtn, color: "#cf1322", borderColor: "rgba(207,19,34,0.35)", "&:hover": { borderColor: "#cf1322", backgroundColor: "rgba(207,19,34,0.04)" } }}>
                                  {zh ? "拒绝" : "Reject"}
                                </Button>
                              </Stack>
                            ) : device.state === "approved" ? (
                              <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                                <IconButton size="small" title={t("规划巡航路线", "Plan cruise route")} onClick={() => void openRoute(device)} sx={ghost("#1664ff")}><RouteRounded sx={{ fontSize: 19 }} /></IconButton>
                                <IconButton size="small" title={t("编辑", "Edit")} onClick={() => { setEditing(device); setEditForm({ name: device.name, description: device.description ?? "" }); }} sx={ghost()}><EditOutlined sx={{ fontSize: 18 }} /></IconButton>
                                <IconButton size="small" title={t("删除", "Delete")} onClick={() => void removeDevice(device)} sx={ghost()}><DeleteOutlineRounded sx={{ fontSize: 18 }} /></IconButton>
                              </Stack>
                            ) : (
                              <IconButton size="small" title={t("删除", "Delete")} onClick={() => void removeDevice(device)} sx={ghost()}><DeleteOutlineRounded sx={{ fontSize: 18 }} /></IconButton>
                            )}
                          </Stack>
                        </Box>
                      </Box>
                    );
                  })
                )}
              </Paper>

              <Stack direction="row" spacing={1.5} sx={{ alignItems: "baseline", mb: 1.5 }}>
                <Typography sx={{ fontSize: 16, fontWeight: 600, color: "var(--pm-color-text-primary)" }}>{zh ? "基站" : "Base stations"}</Typography>
                <Typography sx={{ fontSize: 12, color: "var(--pm-color-text-hint)" }}>{zh ? "用于路径推算与指令下发：点「新建基站」在地图上点选即可" : "For routing & commands: “Add station” and pick a point on the map"}</Typography>
              </Stack>
              <Paper elevation={0} variant="outlined" sx={{ borderRadius: "16px", borderColor: "var(--pm-color-border)", overflow: "hidden" }}>
                {stations.length === 0 ? (
                  <Box sx={{ p: 5, textAlign: "center" }}>
                    <Typography sx={{ fontSize: 13, color: "var(--pm-color-text-hint)" }}>
                      {zh ? "尚未规划基站：点击右上角「新建基站」，在地图上点选位置即可放置" : "No base stations yet. Click “Add station” and pick a location on the map."}
                    </Typography>
                  </Box>
                ) : (
                  stations.map((station, index) => (
                    <Box key={station.id}>
                      {index > 0 && <Divider sx={{ mx: 3, borderColor: "var(--pm-color-divider)" }} />}
                      <Box sx={{ px: { xs: 2.5, sm: 3 }, py: 1.75 }}>
                        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                          <Box sx={{ width: 38, height: 38, flexShrink: 0, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", color: "#1664ff", backgroundColor: "var(--pm-color-primary-soft)" }}>
                            <CellTowerRounded sx={{ fontSize: 20 }} />
                          </Box>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                              <Typography sx={{ fontSize: 15, fontWeight: 600, color: "var(--pm-color-text-primary)" }}>{station.name}</Typography>
                              <Chip size="small" label={station.purpose === "charging" ? t("充电站", "Charging") : station.purpose === "relay" ? t("中继站", "Relay") : t("指挥站", "Command")} sx={{ height: 20, fontSize: 10.5, color: "#1664ff", backgroundColor: "var(--pm-color-primary-soft)" }} />
                            </Stack>
                            <Typography sx={{ mt: 0.25, fontSize: 12, fontFamily: "Consolas, monospace", color: "var(--pm-color-text-hint)" }}>
                              {station.lon.toFixed(6)}, {station.lat.toFixed(6)}
                              {station.description ? ` · ${station.description}` : ""}
                            </Typography>
                          </Box>
                          <IconButton size="small" title={t("编辑", "Edit")} onClick={() => void openStationDialog(station)} sx={ghost()}><EditOutlined sx={{ fontSize: 18 }} /></IconButton>
                          <IconButton size="small" title={t("删除", "Delete")} onClick={() => void removeStation(station)} sx={ghost()}><DeleteOutlineRounded sx={{ fontSize: 18 }} /></IconButton>
                        </Stack>
                      </Box>
                    </Box>
                  ))
                )}
              </Paper>
            </>
          )}

          {/* 密钥发放（一次性） */}
          <Dialog open={secretDialog !== null} onClose={() => setSecretDialog(null)} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ fontSize: 17, fontWeight: 700 }}>{zh ? "设备已注册" : "Device approved"}</DialogTitle>
            <DialogContent>
              {secretDialog && (
                <Stack spacing={1.5}>
                  <Alert severity="success" sx={{ borderRadius: "12px" }}>
                    {zh
                      ? `已同意「${secretDialog.name}」入网。设备密钥仅显示这一次，请立即配置到设备并妥善保存。`
                      : `"${secretDialog.name}" approved. The secret is shown only once — configure it on the device now.`}
                  </Alert>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Typography sx={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: "var(--pm-color-text-secondary)" }}>{zh ? "设备密钥 x-device-key" : "Device secret"}</Typography>
                    <Button size="small" variant="outlined" startIcon={<ContentCopyRounded sx={{ fontSize: 15 }} />} onClick={() => void copyText(secretDialog.secret, "secret")} sx={pillBtn}>
                      {copied === "secret" ? t("已复制", "Copied") : t("复制", "Copy")}
                    </Button>
                  </Stack>
                  <Box component="pre" sx={{ m: 0, p: 1.75, borderRadius: "10px", backgroundColor: "#0f172a", color: "#9be8c6", fontSize: 12.5, lineHeight: 1.6, overflowX: "auto", fontFamily: "Consolas, 'SF Mono', monospace", userSelect: "all" }}>
                    {secretDialog.secret}
                  </Box>
                  <Typography sx={{ fontSize: 12, fontWeight: 600, color: "var(--pm-color-text-hint)" }}>{zh ? "设备上报示例" : "Telemetry example"}</Typography>
                  <Box component="pre" sx={{ m: 0, p: 1.75, borderRadius: "10px", backgroundColor: "#f8f9fb", border: "1px solid var(--pm-color-border)", fontSize: 11.5, lineHeight: 1.6, overflowX: "auto", fontFamily: "Consolas, 'SF Mono', monospace" }}>
                    {secretCurl(secretDialog.id, secretDialog.secret)}
                  </Box>
                  <Button size="small" variant="outlined" startIcon={<ContentCopyRounded sx={{ fontSize: 15 }} />} onClick={() => void copyText(secretCurl(secretDialog.id, secretDialog.secret), "curl")} sx={{ ...pillBtn, alignSelf: "flex-start" }}>
                    {copied === "curl" ? t("已复制", "Copied") : t("复制上报示例", "Copy example")}
                  </Button>
                </Stack>
              )}
            </DialogContent>
            <DialogActions sx={{ px: 2.5, pb: 2 }}>
              <Button size="small" variant="contained" disableElevation onClick={() => setSecretDialog(null)} sx={{ ...pillBtn, color: "#fff", backgroundColor: "#1664ff" }}>
                {t("我已保存", "Saved")}
              </Button>
            </DialogActions>
          </Dialog>

          {/* 编辑已注册设备 */}
          <Dialog open={editing !== null} onClose={() => setEditing(null)} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ fontSize: 17, fontWeight: 700 }}>{zh ? "编辑设备" : "Edit device"}</DialogTitle>
            <DialogContent>
              <Stack spacing={2} sx={{ mt: 1 }}>
                <TextField size="small" label={t("名称", "Name")} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                <TextField size="small" label={t("备注", "Note")} multiline minRows={2} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 2.5, pb: 2 }}>
              <Button size="small" onClick={() => setEditing(null)} sx={pillBtn}>{t("取消", "Cancel")}</Button>
              <Button size="small" variant="contained" disableElevation disabled={busy || !editForm.name.trim()} onClick={() => void saveEdit()} sx={{ ...pillBtn, color: "#fff", backgroundColor: "#1664ff" }}>{t("保存", "Save")}</Button>
            </DialogActions>
          </Dialog>

          {/* 巡航路线 */}
          <Dialog open={routeFor !== null} onClose={() => setRouteFor(null)} maxWidth="md" fullWidth>
            <DialogTitle sx={{ fontSize: 17, fontWeight: 700 }}>
              {zh ? "规划巡航路线" : "Plan cruise route"}
              {routeFor && <Typography component="span" sx={{ ml: 1, fontSize: 13, color: "var(--pm-color-text-hint)" }}>· {routeFor.name}</Typography>}
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
                  <Button size="small" variant="outlined" disabled={busy} onClick={() => void generateFromSource()} sx={pillBtn}>{t("基于当前数据源自动生成", "Generate from active source")}</Button>
                  <Button size="small" variant="text" disabled={busy || !pointsText.trim()} onClick={() => setPointsText("")} sx={pillBtn}>{t("清空", "Clear")}</Button>
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
              <Button size="small" onClick={() => setRouteFor(null)} sx={pillBtn}>{t("取消", "Cancel")}</Button>
              <Button size="small" variant="contained" disableElevation disabled={busy} onClick={() => void saveRoute()} sx={{ ...pillBtn, color: "#fff", backgroundColor: "#1664ff" }}>{t("保存巡航路线", "Save route")}</Button>
            </DialogActions>
          </Dialog>

          {/* 基站（地图点选） */}
          <Dialog open={stationDialog !== null} onClose={() => setStationDialog(null)} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ fontSize: 17, fontWeight: 700 }}>
              {stationDialog === "new" ? t("新建基站 · 地图点选", "Add station · pick on map") : t("编辑基站 · 地图点选", "Edit station · pick on map")}
            </DialogTitle>
            <DialogContent>
              <Stack spacing={1.5}>
                <Box
                  sx={{
                    position: "relative",
                    height: 300,
                    borderRadius: "12px",
                    overflow: "hidden",
                    border: "1px solid var(--pm-color-border)",
                  }}
                >
                  <canvas
                    ref={stationCanvasRef}
                    style={{ display: "block", width: "100%", height: "100%", cursor: "crosshair", touchAction: "none" }}
                    onPointerDown={onStationPointerDown}
                    onPointerMove={onStationPointerMove}
                    onPointerUp={onStationPointerUp}
                    onPointerCancel={onStationPointerCancel}
                  />
                  <Box
                    sx={{
                      position: "absolute",
                      left: 10,
                      top: 10,
                      px: 1,
                      py: 0.25,
                      borderRadius: "8px",
                      backgroundColor: "rgba(255,255,255,0.92)",
                      fontSize: 11,
                      color: "var(--pm-color-text-hint)",
                      pointerEvents: "none",
                    }}
                  >
                    {zh ? "滚轮缩放 · 拖拽平移 · 单击选点" : "Scroll to zoom · drag to pan · click to pick"}
                  </Box>
                </Box>
                <Alert severity={stationPick ? "success" : "warning"} sx={{ borderRadius: "10px" }}>
                  {stationPick
                    ? `${zh ? "已选位置" : "Position"}: ${stationPick.lon.toFixed(6)}, ${stationPick.lat.toFixed(6)}`
                    : zh
                      ? "尚未选点：请在上方地图中点击基站所在位置"
                      : "No point yet: click the map to choose the station location"}
                </Alert>
                <TextField size="small" label={t("名称", "Name")} value={stationForm.name} onChange={(e) => setStationForm({ ...stationForm, name: e.target.value })} />
                <Select size="small" value={stationForm.purpose} onChange={(e) => setStationForm({ ...stationForm, purpose: e.target.value })}>
                  <MenuItem value="charging">{t("充电站", "Charging")}</MenuItem>
                  <MenuItem value="relay">{t("中继站", "Relay")}</MenuItem>
                  <MenuItem value="command">{t("指挥站", "Command")}</MenuItem>
                </Select>
                <TextField size="small" label={t("备注", "Note")} value={stationForm.description} onChange={(e) => setStationForm({ ...stationForm, description: e.target.value })} />
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 2.5, pb: 2 }}>
              <Button size="small" onClick={() => setStationDialog(null)} sx={pillBtn}>{t("取消", "Cancel")}</Button>
              <Button size="small" variant="contained" disableElevation disabled={busy || !stationForm.name.trim() || !stationPick} onClick={() => void saveStation()} sx={{ ...pillBtn, color: "#fff", backgroundColor: "#1664ff" }}>{t("保存", "Save")}</Button>
            </DialogActions>
          </Dialog>

          <Snackbar open={notice !== null} autoHideDuration={4000} onClose={() => setNotice(null)} anchorOrigin={{ vertical: "top", horizontal: "center" }}>
            <Alert severity={notice?.kind ?? "info"} variant="outlined" onClose={() => setNotice(null)} sx={{ borderRadius: "999px", backgroundColor: "rgba(255,255,255,0.95)" }}>{notice?.text}</Alert>
          </Snackbar>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

function StatCell({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <Box sx={{ flex: 1, minWidth: 0, px: 2, py: 0.5, borderRight: last ? "none" : "1px solid var(--pm-color-divider)" }}>
      <Typography sx={{ fontSize: 11, color: "var(--pm-color-text-hint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</Typography>
      <Typography sx={{ mt: 0.5, fontSize: 20, fontWeight: 600, color: "var(--pm-color-text-primary)" }}>{value}</Typography>
    </Box>
  );
}
