"use client";

// 设备与基站：设备注册审批、巡航路线、巡航/实时；基站直接在地图组件上管理（右键新建/左键编辑删除）
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
import SaveOutlined from "@mui/icons-material/SaveOutlined";
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

type Lang = "zh-CN" | "en-US";
const T: Record<string, Record<Lang, string>> = {
  title: { "zh-CN": "设备与基站", "en-US": "Devices & Stations" },
  subtitle: {
    "zh-CN": "设备端注册 → 审批接入；为已注册设备基于 GIS 数据源规划巡航路线；基站直接在下图地图上规划管理。",
    "en-US": "Devices register and are approved here; plan cruise routes from the GIS source; manage base stations right on the map.",
  },
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

// ---------- 地图工具 ----------
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
    if (g.type === "MultiLineString" && Array.isArray(g.coordinates)) (g.coordinates as unknown[]).forEach(push);
    else if (g.type === "LineString") push(g.coordinates);
  }
  return lines;
}

export interface PickerView { zoom: number; tx: number; ty: number }
const PAD = 30;
interface PickerFit { minLon: number; maxLat: number; cos: number; scale: number; offX: number; offY: number }
function pickerFit(lines: number[][][], width: number, height: number, extras: number[][] = []): PickerFit {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  const visit = (lon: number, lat: number): void => {
    minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
  };
  for (const line of lines) for (const [lon, lat] of line) visit(lon, lat);
  for (const [lon, lat] of extras) visit(lon, lat);
  if (!Number.isFinite(minLon)) { minLon = 126.5; maxLon = 127.5; minLat = 46.3; maxLat = 46.9; }
  const cos = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
  const spanLonM = (maxLon - minLon) * 111320 * cos;
  const spanLatM = (maxLat - minLat) * 110540;
  const scale = Math.min((width - PAD * 2) / Math.max(spanLonM, 1), (height - PAD * 2) / Math.max(spanLatM, 1));
  const lenX = spanLonM * scale;
  const lenY = spanLatM * scale;
  // 双轴几何居中：剩余空间平均分配到两侧（不足 PAD 时按 PAD 收缩）
  const offX = Math.max(PAD, (width - lenX) / 2);
  const offY = Math.max(PAD, (height - lenY) / 2);
  return { minLon, maxLat, cos, scale, offX, offY };
}
function basePoint(fit: PickerFit, lon: number, lat: number): { x: number; y: number } {
  return { x: fit.offX + (lon - fit.minLon) * 111320 * fit.cos * fit.scale, y: fit.offY + (fit.maxLat - lat) * 110540 * fit.scale };
}
function toCss(W: number, H: number, v: PickerView, x: number, y: number): { x: number; y: number } {
  return { x: (x - W / 2) * v.zoom + W / 2 + v.tx, y: (y - H / 2) * v.zoom + H / 2 + v.ty };
}
function fromCss(lines: number[][][], W: number, H: number, v: PickerView, cx: number, cy: number, extras: number[][] = []): { lon: number; lat: number } {
  const fit = pickerFit(lines, W, H, extras);
  const bx = (cx - v.tx - W / 2) / v.zoom + W / 2;
  const by = (cy - v.ty - H / 2) / v.zoom + H / 2;
  return {
    lon: fit.minLon + (bx - fit.offX) / (111320 * fit.cos * fit.scale),
    lat: fit.maxLat - (by - fit.offY) / (110540 * fit.scale),
  };
}

/** 基站管理地图：底图 + 基站 + 交互（缩放/平移/点选/右键新建由父层监听） */
function paintFleetMap(
  canvas: HTMLCanvasElement,
  lines: number[][][],
  stations: StationItem[],
  selectedId: number | null,
  v: PickerView,
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
  const extras = stations.map((s) => [s.lon, s.lat] as [number, number]);
  const fit = pickerFit(lines, W, H, extras);
  const at = (lon: number, lat: number): { x: number; y: number } => toCss(W, H, v, basePoint(fit, lon, lat).x, basePoint(fit, lon, lat).y);
  // 网格
  ctx.strokeStyle = "#eef2f7"; ctx.lineWidth = 1;
  for (let i = 0; i < W; i += 40) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke(); }
  for (let i = 0; i < H; i += 40) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(W, i); ctx.stroke(); }
  // 管线
  ctx.lineCap = "round";
  for (const line of lines) {
    ctx.strokeStyle = "#9dbaf0"; ctx.lineWidth = 1.4;
    ctx.beginPath();
    line.forEach(([lon, lat], i) => { const p = at(lon, lat); i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); });
    ctx.stroke();
  }
  if (lines.length === 0) {
    ctx.fillStyle = "#9aa4b2"; ctx.font = "12px system-ui, sans-serif"; ctx.textAlign = "center";
    ctx.fillText("右键：新建基站 · 左键：选中基站 · 滚轮/拖拽：浏览地图", W / 2, H / 2 - 26);
  }
  // 基站
  ctx.textAlign = "left";
  for (const st of stations) {
    const p = at(st.lon, st.lat);
    const selected = st.id === selectedId;
    ctx.fillStyle = selected ? "#1664ff" : "#2e9e5b";
    ctx.beginPath(); ctx.arc(p.x, p.y, selected ? 7 : 5.5, 0, Math.PI * 2); ctx.fill();
    if (selected) { ctx.strokeStyle = "#1664ff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = selected ? "#1664ff" : "#0a8a5f";
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.fillText(st.name, p.x + 10, p.y + 4);
  }
  if (stations.length === 0) {
    ctx.fillStyle = "#9aa4b2"; ctx.font = "12px system-ui, sans-serif"; ctx.textAlign = "center";
    ctx.fillText("暂无基站：在地图上右键即可新建", W / 2, H / 2 - 6);
  }
}

function samplePoints(raw: unknown, maxPoints = 120): Array<{ lon: number; lat: number }> {
  const lines = extractGeoLines(raw);
  const out: Array<{ lon: number; lat: number }> = [];
  for (const line of lines) for (const [lon, lat] of line) out.push({ lon, lat });
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

/** 保留最后一个非空值：Dialog 关闭动画期间内容不因数据置空而闪空窗 */
function useKeepLast<T>(value: T): T {
  const ref = useRef<T>(value);
  const blank = value === null || value === undefined || (typeof value === "string" && value === "");
  if (!blank) {
    ref.current = value;
  }
  return blank ? ref.current : value;
}

export default function DevicesPage() {
  const { lang } = useI18n();
  const zh = lang === "zh-CN";
  const t = (zhText: string, enText: string): string => (zh ? zhText : enText);

  const [devices, setDevices] = useState<DeviceItem[] | null>(null);
  const [stations, setStations] = useState<StationItem[] | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // 确认框（不使用原生 alert）
  const [confirmBox, setConfirmBox] = useState<{ title: string; text: string; onOk: () => void } | null>(null);
  const askConfirm = (title: string, text: string, onOk: () => void): void => {
    setConfirmBox({ title, text, onOk });
  };
  const runConfirmOk = (): void => {
    const box = confirmBox;
    setConfirmBox(null);
    if (box) box.onOk();
  };
  // 关闭动画期间仍用“最后一个有效内容”渲染，避免空弹窗闪现
  const secretView = useKeepLast(secretDialog);
  const routeView = useKeepLast(routeFor);
  const confirmView = useKeepLast(confirmBox);

  // 设备审批/密钥/编辑/巡航
  const [secretDialog, setSecretDialog] = useState<{ name: string; id: number; secret: string } | null>(null);
  const [copied, setCopied] = useState<"secret" | "curl" | null>(null);
  const [editing, setEditing] = useState<DeviceItem | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "" });
  const [routeFor, setRouteFor] = useState<DeviceItem | null>(null);
  const [routeSourceName, setRouteSourceName] = useState("");
  const [pointsText, setPointsText] = useState("");

  // 基站地图
  const mapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mapViewRef = useRef<PickerView>({ zoom: 1, tx: 0, ty: 0 });
  const mapDragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [mapLines, setMapLines] = useState<number[][][]>([]);
  const [selectedStation, setSelectedStation] = useState<StationItem | null>(null);
  const [draft, setDraft] = useState({ name: "", purpose: "charging", description: "" });

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

  // 地图底图来自当前 GIS 数据源
  const loadMapSource = useCallback(async (): Promise<void> => {
    const source = readActiveGisSource();
    if (!source) { setMapLines([]); return; }
    try {
      const res = await fetch(`${API_BASE}/data-files/${source.id}/content`, { credentials: "include" });
      if (res.ok) setMapLines(extractGeoLines((await res.json()) as unknown));
    } catch {
      /* 底图加载失败不阻塞 */
    }
  }, []);
  useEffect(() => {
    void loadMapSource();
  }, [loadMapSource]);

  const repaintMap = (): void => {
    const cv = mapCanvasRef.current;
    if (cv) paintFleetMap(cv, mapLines, stations ?? [], selectedStation?.id ?? null, mapViewRef.current);
  };
  useEffect(() => {
    const cv = mapCanvasRef.current;
    if (!cv) return;
    mapViewRef.current = { zoom: 1, tx: 0, ty: 0 };
    const frame = requestAnimationFrame(repaintMap);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLines, stations]);
  useEffect(() => {
    if (!stations) return;
    const frame = requestAnimationFrame(repaintMap);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStation?.id, selectedStation?.name, draft.purpose]);

  const zoomAt = (clientX: number, clientY: number, deltaY: number): void => {
    const cv = mapCanvasRef.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const W = Math.max(1, rect.width || 1), H = Math.max(1, rect.height || 1);
    const v = mapViewRef.current;
    const cssX = clientX - rect.left, cssY = clientY - rect.top;
    const factor = deltaY < 0 ? 1.18 : 1 / 1.18;
    const next = Math.min(24, Math.max(0.3, v.zoom * factor));
    if (Math.abs(next - v.zoom) < 0.0001) return;
    const cxx = cssX - W / 2, cyy = cssY - H / 2;
    const baseX = (cxx - v.tx) / v.zoom, baseY = (cyy - v.ty) / v.zoom;
    v.zoom = next;
    v.tx = cxx - baseX * next;
    v.ty = cyy - baseY * next;
    repaintMap();
  };

  const mapCoordsAt = (clientX: number, clientY: number): { lon: number; lat: number } | null => {
    const cv = mapCanvasRef.current;
    if (!cv) return null;
    const rect = cv.getBoundingClientRect();
    const extras = (stations ?? []).map((s) => [s.lon, s.lat] as [number, number]);
    return fromCss(
      mapLines,
      Math.max(1, rect.width || 1),
      Math.max(1, rect.height || 1),
      mapViewRef.current,
      clientX - rect.left,
      clientY - rect.top,
      extras,
    );
  };

  const onMapDown = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (event.button !== 0) return;
    (event.currentTarget as HTMLCanvasElement).setPointerCapture?.(event.pointerId);
    mapDragRef.current = { x: event.clientX, y: event.clientY, moved: false };
  };
  const onMapMove = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const drag = mapDragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (drag.moved) {
      const v = mapViewRef.current;
      v.tx += dx; v.ty += dy;
      mapDragRef.current = { x: event.clientX, y: event.clientY, moved: true };
      repaintMap();
    }
  };
  const onMapUp = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const cv = mapCanvasRef.current;
    const drag = mapDragRef.current;
    mapDragRef.current = null;
    if (!cv || !drag || drag.moved) return;
    // 命中基站？（视野适配需包含基站，保证点击换算与绘制一致）
    const rect = cv.getBoundingClientRect();
    const cssX = event.clientX - rect.left, cssY = event.clientY - rect.top;
    const W = Math.max(1, rect.width || 1), H = Math.max(1, rect.height || 1);
    const stationList = stations ?? [];
    const fit = pickerFit(mapLines, W, H, stationList.map((s) => [s.lon, s.lat] as [number, number]));
    let hit: StationItem | null = null;
    for (const st of stationList) {
      const p = toCss(W, H, mapViewRef.current, basePoint(fit, st.lon, st.lat).x, basePoint(fit, st.lon, st.lat).y);
      if (Math.hypot(p.x - cssX, p.y - cssY) < 13) { hit = st; break; }
    }
    if (hit) {
      setSelectedStation(hit);
      setDraft({ name: hit.name, purpose: hit.purpose, description: hit.description ?? "" });
    } else {
      setSelectedStation(null);
    }
  };
  const onMapCancel = (): void => { mapDragRef.current = null; };

  // 右键新建基站（就地创建并选中，浮层内继续改名称/用途）
  const onCreateStation = (clientX: number, clientY: number): void => {
    const coords = mapCoordsAt(clientX, clientY);
    if (!coords) return;
    void (async () => {
      try {
        const nextName = t(`基站 ${(stations?.length ?? 0) + 1}`, `Station ${(stations?.length ?? 0) + 1}`);
        const created = (await jfetch("/base-stations", {
          method: "POST",
          body: JSON.stringify({ name: nextName, lon: coords.lon, lat: coords.lat, purpose: "charging", description: null }),
        })) as StationItem;
        await refresh();
        setSelectedStation(created);
        setDraft({ name: created.name, purpose: created.purpose, description: created.description ?? "" });
        setNotice({ kind: "success", text: t(`已新建基站“${created.name}”，可在左栏卡片调整`, `Station "${created.name}" created — tweak it in the side card`) });
      } catch (err) {
        setNotice({ kind: "error", text: err instanceof Error ? err.message : String(err) });
      }
    })();
  };

  const saveSelectedStation = async (): Promise<void> => {
    if (!selectedStation) return;
    setBusy(true);
    try {
      await jfetch(`/base-stations/${selectedStation.id}`, { method: "PATCH", body: JSON.stringify(draft) });
      await refresh();
      const updated = (stations ?? []).find((s) => s.id === selectedStation.id) ?? null;
      setSelectedStation(updated);
      if (updated) setDraft({ name: updated.name, purpose: updated.purpose, description: updated.description ?? "" });
      setNotice({ kind: "success", text: t("基站已保存", "Station saved") });
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const removeSelectedStation = (): void => {
    if (!selectedStation) return;
    const st = selectedStation;
    askConfirm(
      zh ? "删除基站" : "Delete station",
      t(`确定删除基站“${st.name}”？（坐标 ${st.lon.toFixed(6)}, ${st.lat.toFixed(6)}）`, `Delete station "${st.name}"? (${st.lon.toFixed(6)}, ${st.lat.toFixed(6)})`),
      () => {
        void (async () => {
          try {
            await jfetch(`/base-stations/${st.id}`, { method: "DELETE" });
            setSelectedStation(null);
            await refresh();
          } catch (err) {
            setNotice({ kind: "error", text: err instanceof Error ? err.message : String(err) });
          }
        })();
      },
    );
  };

  // ---------- 设备动作 ----------
  const approveDevice = (device: DeviceItem): void => {
    askConfirm(
      zh ? "同意设备入网" : "Approve device",
      t(`同意“${device.name}”入网？批准后将签发一次性设备密钥（仅显示一次）。`, `Approve "${device.name}"? A one-time secret will be issued (shown once).`),
      () => {
        void (async () => {
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
        })();
      },
    );
  };

  const rejectDevice = (device: DeviceItem): void => {
    askConfirm(
      zh ? "拒绝入网" : "Reject device",
      t(`确定拒绝“${device.name}”的注册申请？`, `Reject "${device.name}" registration?`),
      () => {
        void (async () => {
          try {
            await jfetch(`/devices/${device.id}/reject`, { method: "POST" });
            await refresh();
          } catch (err) {
            setNotice({ kind: "error", text: err instanceof Error ? err.message : String(err) });
          }
        })();
      },
    );
  };

  const removeDevice = (device: DeviceItem): void => {
    askConfirm(
      zh ? "删除设备" : "Remove device",
      t(`确定删除“${device.name}”？此操作会同时注销其密钥。`, `Remove "${device.name}"? Its secret will be revoked too.`),
      () => {
        void (async () => {
          try {
            await jfetch(`/devices/${device.id}`, { method: "DELETE" });
            await refresh();
          } catch (err) {
            setNotice({ kind: "error", text: err instanceof Error ? err.message : String(err) });
          }
        })();
      },
    );
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

  const openRoute = async (device: DeviceItem): Promise<void> => {
    setRouteFor(device);
    setRouteSourceName(readActiveGisSource()?.name ?? "");
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
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  };

  const generateFromSource = async (): Promise<void> => {
    const source = readActiveGisSource();
    if (!source) { setNotice({ kind: "error", text: t("当前没有 GIS 数据源，请先在首页选择", "No active GIS source; pick one on Home first") }); return; }
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
      const lines = pointsText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const points = lines.map((line) => { const parts = line.split(","); return { lon: Number(parts[0]), lat: Number(parts[1] ?? parts[0]) }; });
      if (points.length < 2) throw new Error(t("路线至少需要 2 个点（每行：经度, 纬度）", "Need ≥2 points (lon, lat per line)"));
      const source = readActiveGisSource();
      await jfetch(`/devices/${routeFor.id}/route`, { method: "PUT", body: JSON.stringify({ source: source ? { kind: source.kind, id: source.id, name: source.name } : null, points }) });
      setRouteFor(null);
      setNotice({ kind: "success", text: t(`巡航路线已保存（${points.length} 个点）`, `Cruise route saved (${points.length} pts)`) });
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const copyText = async (text: string, key: "secret" | "curl"): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1400);
    } catch { /* ignore */ }
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

  const counts = useMemo(() => {
    const list = devices ?? [];
    return {
      total: list.length,
      crawler: list.filter((d) => d.type === "crawler" && d.state !== "revoked").length,
      drone: list.filter((d) => d.type === "drone" && d.state !== "revoked").length,
      pending: list.filter((d) => d.state === "pending").length,
      approved: list.filter((d) => d.state === "approved").length,
      stations: stations?.length ?? 0,
    };
  }, [devices, stations]);

  const orderedDevices = useMemo(() => {
    const order: Record<string, number> = { pending: 0, approved: 1, rejected: 2, revoked: 3 };
    const list = devices ?? [];
    return [...list].sort((a, b) => (order[a.state] ?? 9) - (order[b.state] ?? 9) || a.createdAt.localeCompare(b.createdAt));
  }, [devices]);

  const pillBtn = { borderRadius: "999px", textTransform: "none" as const, fontSize: 12 };
  const ghost = (color = "var(--pm-color-text-secondary)") => ({ color, "&:hover": { backgroundColor: "var(--pm-color-primary-soft)", color: "#1664ff" } });

  return (
    <ThemeProvider theme={pmTheme}>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: { xs: 2.5, sm: 4, md: 10 }, pt: { xs: 10, sm: 12 }, pb: 24 }}>
        <Box sx={{ width: "100%", maxWidth: 880, mx: "auto" }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start", mb: 4 }}>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontSize: 22, fontWeight: 700, color: "var(--pm-color-text-primary)" }}>{T.title[lang]}</Typography>
              <Typography sx={{ mt: 1, fontSize: 13, color: "var(--pm-color-text-hint)" }}>{T.subtitle[lang]}</Typography>
            </Box>
            <Button size="small" variant="outlined" startIcon={<RefreshRounded sx={{ fontSize: 15 }} />} onClick={() => void refresh()} sx={{ ...pillBtn, color: "var(--pm-color-text-secondary)", borderColor: "var(--pm-color-border)", "&:hover": { borderColor: "#1664ff", color: "#1664ff" } }}>
              {zh ? "刷新" : "Refresh"}
            </Button>
          </Stack>

          {devices === null || stations === null ? (
            <Stack sx={{ alignItems: "center", justifyContent: "center", minHeight: 240 }}>
              <CircularProgress size={24} sx={{ color: "var(--pm-color-primary)" }} />
            </Stack>
          ) : (
            <>
              {/* 数据统计 */}
              <Paper elevation={0} variant="outlined" sx={{ borderRadius: "16px", borderColor: "var(--pm-color-border)", px: { xs: 2.5, sm: 4 }, py: { xs: 2.5, sm: 3 }, mb: 3 }}>
                <Stack direction="row" sx={{ alignItems: "stretch" }}>
                  <StatCell label={zh ? "设备总数" : "Total"} value={String(counts.total)} />
                  <StatCell label={zh ? "管道机器人" : "Crawlers"} value={String(counts.crawler)} />
                  <StatCell label={zh ? "无人机" : "Drones"} value={String(counts.drone)} />
                  <StatCell label={zh ? "已注册" : "Approved"} value={String(counts.approved)} />
                  <StatCell label={zh ? "待审批" : "Pending"} value={String(counts.pending)} />
                  <StatCell label={zh ? "基站" : "Stations"} value={String(counts.stations)} last />
                </Stack>
              </Paper>

              {/* 基站地图（统计正下方）：右键新建 / 左键选中编辑删除 */}
              <Paper elevation={0} variant="outlined" sx={{ borderRadius: "16px", borderColor: "var(--pm-color-border)", overflow: "hidden", mb: 4 }}>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", px: { xs: 2.5, sm: 3 }, py: 1.75, borderBottom: "1px solid var(--pm-color-divider)" }}>
                  <CellTowerRounded sx={{ fontSize: 18, color: "#1664ff" }} />
                  <Typography sx={{ flex: 1, fontSize: 15, fontWeight: 600, color: "var(--pm-color-text-primary)" }}>
                    {zh ? "基站规划地图" : "Base station map"}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: "var(--pm-color-text-hint)" }}>
                    {zh ? "右键新建 · 左键选中编辑/删除 · 滚轮缩放/拖拽平移" : "Right-click to add · left-click to edit/delete · wheel/drag to navigate"}
                  </Typography>
                </Stack>
                <Box sx={{ position: "relative", height: 420 }}>
                  <canvas
                    ref={mapCanvasRef}
                    style={{ display: "block", width: "100%", height: "100%", cursor: "crosshair", touchAction: "none" }}
                    onPointerDown={onMapDown}
                    onPointerMove={onMapMove}
                    onPointerUp={onMapUp}
                    onPointerCancel={onMapCancel}
                    onContextMenu={(e) => { e.preventDefault(); onCreateStation(e.clientX, e.clientY); }}
                  />
                  {selectedStation && (
                    <Paper
                      elevation={0}
                      variant="outlined"
                      sx={{
                        position: "absolute",
                        right: 14,
                        top: 14,
                        width: 264,
                        p: 1.5,
                        borderRadius: "12px",
                        borderColor: "var(--pm-color-border)",
                        backgroundColor: "rgba(255,255,255,0.97)",
                        boxShadow: "0 10px 30px rgb(16 24 40 / 0.14)",
                      }}
                    >
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
                        <CellTowerRounded sx={{ fontSize: 17, color: "#1664ff" }} />
                        <Typography sx={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: "var(--pm-color-text-primary)" }}>
                          {selectedStation.name}
                        </Typography>
                        <IconButton size="small" onClick={() => setSelectedStation(null)} sx={ghost()}><CloseRounded sx={{ fontSize: 17 }} /></IconButton>
                      </Stack>
                      <Stack spacing={1}>
                        <TextField size="small" label={t("名称", "Name")} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                        <Select size="small" value={draft.purpose} onChange={(e) => setDraft({ ...draft, purpose: e.target.value })}>
                          <MenuItem value="charging">{t("充电站", "Charging")}</MenuItem>
                          <MenuItem value="relay">{t("中继站", "Relay")}</MenuItem>
                          <MenuItem value="command">{t("指挥站", "Command")}</MenuItem>
                        </Select>
                        <TextField size="small" label={t("备注", "Note")} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
                        <Typography sx={{ fontSize: 11, fontFamily: "Consolas, monospace", color: "var(--pm-color-text-hint)" }}>
                          {selectedStation.lon.toFixed(6)}, {selectedStation.lat.toFixed(6)}
                        </Typography>
                        <Stack direction="row" spacing={1}>
                          <Button size="small" variant="contained" disableElevation startIcon={<SaveOutlined sx={{ fontSize: 15 }} />} disabled={busy || !draft.name.trim()} onClick={() => void saveSelectedStation()} sx={{ ...pillBtn, flex: 1, color: "#fff", backgroundColor: "#1664ff" }}>
                            {t("保存", "Save")}
                          </Button>
                          <IconButton size="small" title={t("删除", "Delete")} onClick={() => void removeSelectedStation()} sx={{ color: "#cf1322", "&:hover": { backgroundColor: "rgba(207,19,34,0.08)" } }}>
                            <DeleteOutlineRounded sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Stack>
                      </Stack>
                    </Paper>
                  )}
                </Box>
              </Paper>

              {/* 设备列表 */}
              <Stack direction="row" spacing={1.5} sx={{ alignItems: "baseline", mb: 1.5 }}>
                <Typography sx={{ fontSize: 16, fontWeight: 600, color: "var(--pm-color-text-primary)" }}>{zh ? "设备" : "Devices"}</Typography>
                <Typography sx={{ fontSize: 12, color: "var(--pm-color-text-hint)" }}>
                  {zh ? "待审批设备点「同意」并配置一次性密钥" : "Approve pending devices to issue their one-time secret"}
                </Typography>
              </Stack>
              <Paper elevation={0} variant="outlined" sx={{ borderRadius: "16px", borderColor: "var(--pm-color-border)", overflow: "hidden" }}>
                {orderedDevices.length === 0 ? (
                  <Box sx={{ p: 5, textAlign: "center" }}>
                    <Typography sx={{ fontSize: 13, color: "var(--pm-color-text-hint)" }}>
                      {zh ? "暂无设备。设备端通过 POST /api/devices/register 发起入网申请。" : "No devices yet. Devices apply via POST /api/devices/register."}
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
                              </Typography>
                            </Box>
                            {device.state === "pending" ? (
                              <Stack direction="row" spacing={1}>
                                <Button size="small" variant="contained" disableElevation startIcon={<CheckRounded sx={{ fontSize: 15 }} />} disabled={busy} onClick={() => void approveDevice(device)} sx={{ ...pillBtn, color: "#fff", backgroundColor: "#1664ff", "&:hover": { backgroundColor: "#0f54d6" } }}>
                                  {zh ? "同意" : "Approve"}
                                </Button>
                                <Button size="small" variant="outlined" startIcon={<CloseRounded sx={{ fontSize: 15 }} />} onClick={() => void rejectDevice(device)} sx={{ ...pillBtn, color: "#cf1322", borderColor: "rgba(207,19,34,0.35)" }}>
                                  {zh ? "拒绝" : "Reject"}
                                </Button>
                              </Stack>
                            ) : device.state === "approved" ? (
                              <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                                <IconButton size="small" title={t("巡航路线", "Route")} onClick={() => void openRoute(device)} sx={ghost("#1664ff")}><RouteRounded sx={{ fontSize: 19 }} /></IconButton>
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
            </>
          )}

          {/* 密钥发放（一次性） */}
          <Dialog open={secretDialog !== null} onClose={() => setSecretDialog(null)} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ fontSize: 17, fontWeight: 700 }}>{zh ? "设备已注册" : "Device approved"}</DialogTitle>
            <DialogContent>
              {secretView && (
                <Stack spacing={1.5}>
                  <Alert severity="success" sx={{ borderRadius: "12px" }}>
                    {zh ? `已同意「${secretView.name}」入网。设备密钥仅显示这一次，请立即配置到设备并妥善保存。` : `"${secretView.name}" approved. The secret is shown only once.`}
                  </Alert>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Typography sx={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>{zh ? "设备密钥 x-device-key" : "Device secret"}</Typography>
                    <Button size="small" variant="outlined" startIcon={<ContentCopyRounded sx={{ fontSize: 15 }} />} onClick={() => void copyText(secretView.secret, "secret")} sx={pillBtn}>
                      {copied === "secret" ? t("已复制", "Copied") : t("复制", "Copy")}
                    </Button>
                  </Stack>
                  <Box component="pre" sx={{ m: 0, p: 1.75, borderRadius: "10px", backgroundColor: "#0f172a", color: "#9be8c6", fontSize: 12.5, overflowX: "auto", userSelect: "all", fontFamily: "Consolas, 'SF Mono', monospace" }}>
                    {secretView.secret}
                  </Box>
                  <Box component="pre" sx={{ m: 0, p: 1.75, borderRadius: "10px", backgroundColor: "#f8f9fb", border: "1px solid var(--pm-color-border)", fontSize: 11.5, overflowX: "auto", fontFamily: "Consolas, 'SF Mono', monospace" }}>
                    {secretCurl(secretView.id, secretView.secret)}
                  </Box>
                  <Button size="small" variant="outlined" startIcon={<ContentCopyRounded sx={{ fontSize: 15 }} />} onClick={() => void copyText(secretCurl(secretView.id, secretView.secret), "curl")} sx={{ ...pillBtn, alignSelf: "flex-start" }}>
                    {copied === "curl" ? t("已复制", "Copied") : t("复制上报示例", "Copy example")}
                  </Button>
                </Stack>
              )}
            </DialogContent>
            <DialogActions sx={{ px: 2.5, pb: 2 }}>
              <Button size="small" variant="contained" disableElevation onClick={() => setSecretDialog(null)} sx={{ ...pillBtn, color: "#fff", backgroundColor: "#1664ff" }}>{t("我已保存", "Saved")}</Button>
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
              {routeView && <Typography component="span" sx={{ ml: 1, fontSize: 13, color: "var(--pm-color-text-hint)" }}>· {routeView.name}</Typography>}
            </DialogTitle>
            <DialogContent>
              <Stack spacing={1.5}>
                <Alert severity="info" sx={{ borderRadius: "12px" }}>
                  {t(`路线来源（当前数据源）：${routeSourceName || "未选择"}。可基于数据源自动生成（沿管网取点），或手动逐行填“经度, 纬度”。`, `Source: ${routeSourceName || "none"}. Generate along the network automatically, or type lon, lat per line.`)}
                </Alert>
                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="outlined" disabled={busy} onClick={() => void generateFromSource()} sx={pillBtn}>{t("基于当前数据源自动生成", "Generate from active source")}</Button>
                  <Button size="small" variant="text" disabled={busy || !pointsText.trim()} onClick={() => setPointsText("")} sx={pillBtn}>{t("清空", "Clear")}</Button>
                </Stack>
                <TextField
                  size="small"
                  label={t("路线点列（每行：经度, 纬度）", "Points (lon, lat per line)")}
                  multiline
                  minRows={9}
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
              <Button size="small" onClick={() => setRouteFor(null)} sx={pillBtn}>{t("取消", "Cancel")}</Button>
              <Button size="small" variant="contained" disableElevation disabled={busy} onClick={() => void saveRoute()} sx={{ ...pillBtn, color: "#fff", backgroundColor: "#1664ff" }}>{t("保存巡航路线", "Save route")}</Button>
            </DialogActions>
          </Dialog>

          {/* 确认框（替代原生 alert） */}
          <Dialog open={confirmBox !== null} onClose={() => setConfirmBox(null)} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ fontSize: 17, fontWeight: 700 }}>{confirmView?.title ?? ""}</DialogTitle>
            <DialogContent>
              <Typography sx={{ fontSize: 13.5, color: "var(--pm-color-text-secondary)", lineHeight: 1.7 }}>
                {confirmView?.text ?? ""}
              </Typography>
            </DialogContent>
            <DialogActions sx={{ px: 2.5, pb: 2 }}>
              <Button size="small" onClick={() => setConfirmBox(null)} sx={pillBtn}>{t("取消", "Cancel")}</Button>
              <Button size="small" variant="contained" disableElevation autoFocus onClick={runConfirmOk} sx={{ ...pillBtn, color: "#fff", backgroundColor: "#1664ff" }}>{t("确定", "Confirm")}</Button>
            </DialogActions>
          </Dialog>

          <Snackbar open={notice !== null} autoHideDuration={4000} onClose={() => setNotice(null)} anchorOrigin={{ vertical: "top", horizontal: "center" }}>
            {notice ? (
              <Alert severity={notice.kind} variant="outlined" onClose={() => setNotice(null)} sx={{ borderRadius: "999px", backgroundColor: "rgba(255,255,255,0.95)" }}>
                {notice.text}
              </Alert>
            ) : (
              <Box sx={{ display: "none" }} />
            )}
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
