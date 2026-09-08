"use client";

import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import {
  parseGisGeoJson,
  segmentBounds,
  lineLevel,
} from "@/lib/gis-pipeline";
import type { GisLineSegment } from "@/lib/gis-pipeline";
import {
  readActiveGisSource,
  fetchGisSourceContent,
  listenGisActiveChange,
} from "@/lib/gis-source";
import { io } from "socket.io-client";
import { API_BASE } from "@/lib/api";
import {
  locateRegion,
  loadLocalRegion,
} from "@/lib/gis-region";
import type { RegionFeature } from "@/lib/gis-region";
import { useI18n } from "@/lib/i18n";

/** 地图叠加层使用的结构化消息：key 为 i18n 词条，params 供模板插值。 */
interface SceneMsg {
  key: string;
  params?: Record<string, string | number>;
}

/** 网络类型 → i18n 词条（无对应词条时原样显示）。 */
const NETWORK_LABEL_KEYS: Record<string, string> = {
  给水: "mapNetWater",
  排水: "mapNetDrainage",
  污水: "mapNetSewage",
  雨水: "mapNetRain",
  供热: "mapNetHeating",
  燃气: "mapNetGas",
  电力: "mapNetPower",
  通讯: "mapNetTelecom",
  未知: "mapNetUnknown",
  Water: "mapNetWater",
  Drainage: "mapNetDrainage",
  Sewage: "mapNetSewage",
  Stormwater: "mapNetRain",
  Heating: "mapNetHeating",
  Gas: "mapNetGas",
  Electric: "mapNetPower",
  Telecom: "mapNetTelecom",
  Unknown: "mapNetUnknown",
};

function networkName(t: (key: string) => string, net: string | undefined | null): string {
  if (!net) {
    return "";
  }
  const key = NETWORK_LABEL_KEYS[net];
  return key ? t(key) : net;
}

const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LON = 111320;
const PIPE_COLOR = "#1664ff";

let projectionRefLat = 46.65;

function lonLatToMeters(lon: number, lat: number): { x: number; y: number } {
  const cos = Math.cos((projectionRefLat * Math.PI) / 180);
  return { x: lon * M_PER_DEG_LON * cos, y: lat * M_PER_DEG_LAT };
}

interface BaseFeature {
  name: string;
  rings: number[][][];
}

interface PipeStats {
  network: string;
  count: number;
  km: number;
}

function niceStep(scale: number): number {
  const target = 70 / scale;
  const magnitude = Math.pow(10, Math.floor(Math.log10(target)));
  for (const m of [1, 2, 5, 10]) {
    const candidate = m * magnitude;
    if (candidate * scale >= 40) {
      return candidate;
    }
  }
  return 10 * magnitude;
}

function ringCenter(rings: number[][][]): { x: number; y: number } {
  // 用点数最多的环（主体多边形）估算标签位置，避免被海南等离岛把标签拉到外海
  let biggest: number[][] | null = null;
  for (const ring of rings) {
    if (!biggest || ring.length > biggest.length) {
      biggest = ring;
    }
  }
  const target = biggest ?? [];
  let minLon = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  for (const point of target) {
    minLon = Math.min(minLon, point[0]);
    maxLon = Math.max(maxLon, point[0]);
    minLat = Math.min(minLat, point[1]);
    maxLat = Math.max(maxLat, point[1]);
  }
  if (!Number.isFinite(minLon)) {
    return { x: 0, y: 0 };
  }
  return lonLatToMeters((minLon + maxLon) / 2, (minLat + maxLat) / 2);
}

function toBaseFeatures(regions: RegionFeature[]): BaseFeature[] {
  return regions.map((region) => ({
    name: region.name,
    rings: region.rings,
  }));
}

const NET_PREFIX: Record<string, string> = {
  给水: "GS",
  排水: "PS",
  污水: "PS",
  雨水: "YS",
  供热: "GR",
  燃气: "RQ",
  电力: "DL",
  通讯: "TX",
};

function ensurePipeCodes(segments: GisLineSegment[]): void {
  const counters = new Map<string, number>();
  for (const seg of segments) {
    if (!seg.code) {
      const net = seg.network ?? "未知";
      const prefix = NET_PREFIX[net] ?? "GD";
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      seg.code = `${prefix}-${String(n).padStart(4, "0")}`;
    }
  }
}

export function HomeScene() {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scaleLineRef = useRef<HTMLDivElement | null>(null);
  const scaleLabelRef = useRef<HTMLSpanElement | null>(null);
  const baseRef = useRef<BaseFeature[]>([]);
  const pipesRef = useRef<GisLineSegment[]>([]);
  const activeFileIdRef = useRef<number | null>(null);
  const hoverSegRef = useRef<GisLineSegment | null>(null);
  const hoverPosRef = useRef<{ x: number; y: number } | null>(null);
  // 首页叠加：基站与设备实时位置（Socket 驱动）
  const stationsRef = useRef<
    Array<{ id: number; name: string; lon: number; lat: number; purpose: string }>
  >([]);
  const deviceMetaRef = useRef<
    Array<{ id: number; name: string; type: string; status: string }>
  >([]);
  const telemetryRef = useRef<Map<number, { lon: number; lat: number; ts: number }>>(new Map());
  const redrawRef = useRef<(() => void) | null>(null);
  const [pipeStats, setPipeStats] = useState<PipeStats[]>([]);
  const [statusMsg, setStatusMsg] = useState<SceneMsg | null>(null);
  const [baseMsg, setBaseMsg] = useState<SceneMsg>({ key: "mapBaseLoading" });
  const [hoverSeg, setHoverSeg] = useState<GisLineSegment | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(
    null,
  );

  const formatMsg = (msg: SceneMsg | null): string => {
    if (!msg) {
      return "";
    }
    let text = t(msg.key);
    const params = msg.params ?? {};
    for (const [name, value] of Object.entries(params)) {
      // 参数值若为已知词条 key（例如底图名称“中国全国”），则先取其当前语言文本
      const rendered = t(String(value));
      text = text.split(`{${name}}`).join(rendered);
    }
    return text;
  };

  const updateStatus = (msg: SceneMsg | null): void => {
    setStatusMsg(msg);
  };

  const updateBaseStatus = (msg: SceneMsg): void => {
    setBaseMsg(msg);
  };

  const clearHover = (): void => {
    hoverSegRef.current = null;
    hoverPosRef.current = null;
    setHoverSeg(null);
    setHoverPos(null);
  };

  function segMeters(seg: GisLineSegment): number {
    let len = 0;
    for (let i = 1; i < seg.coords.length; i += 1) {
      const a = lonLatToMeters(seg.coords[i - 1][0], seg.coords[i - 1][1]);
      const b = lonLatToMeters(seg.coords[i][0], seg.coords[i][1]);
      len += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return len;
  }

  // 首页实时叠加：基站 + 已注册设备位置（Socket 推送 + 周期兜底刷新）
  useEffect(() => {
    let disposed = false;
    const redraw = (): void => redrawRef.current?.();
    const load = async (): Promise<void> => {
      try {
        const res = await fetch(`${API_BASE}/base-stations`);
        if (res.ok) {
          const body = (await res.json()) as Array<{
            id: number;
            name: string;
            lon: number;
            lat: number;
            purpose: string;
          }>;
          stationsRef.current = Array.isArray(body) ? body : [];
        }
      } catch {
        /* 基站加载失败不影响地图 */
      }
      try {
        const devRes = await fetch(`${API_BASE}/devices`);
        if (devRes.ok) {
          const body = (await devRes.json()) as Array<{
            id: number;
            name: string;
            type: string;
            status: string;
            state: string;
          }>;
          deviceMetaRef.current = (Array.isArray(body) ? body : [])
            .filter((d) => d.state === "approved")
            .map((d) => ({ id: d.id, name: d.name, type: d.type, status: d.status }));
        }
      } catch {
        /* ignore */
      }
      try {
        const tRes = await fetch(`${API_BASE}/devices/telemetry/latest`);
        if (tRes.ok) {
          const body = (await tRes.json()) as { devices?: Array<{ deviceId: number; lon: number; lat: number; ts?: number }> };
          const map = telemetryRef.current;
          for (const item of body.devices ?? []) {
            map.set(item.deviceId, { lon: item.lon, lat: item.lat, ts: item.ts ?? Date.now() });
          }
        }
      } catch {
        /* ignore */
      }
      if (!disposed) redraw();
    };
    void load();

    let sock: ReturnType<typeof io> | null = null;
    try {
      const wsUrl = API_BASE.replace(/\/api$/, "");
      sock = io(wsUrl, { path: "/socket.io", transports: ["websocket", "polling"], reconnection: true });
      sock.on("pm:telemetry", (p: { deviceId: number; lon: number; lat: number; ts?: number; status?: string }) => {
        telemetryRef.current.set(p.deviceId, { lon: p.lon, lat: p.lat, ts: p.ts ?? Date.now() });
        const dev = deviceMetaRef.current.find((x) => x.id === p.deviceId);
        if (dev && p.status) dev.status = p.status;
        redraw();
      });
      sock.on("pm:stations-changed", () => void load());
      sock.on("pm:devices-changed", () => void load());
      sock.on("pm:hello", () => void load());
    } catch {
      /* socket 不可用时保留 REST 轮询兜底 */
    }
    const timer = window.setInterval(() => void load(), 20000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      sock?.close();
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    const view = { cx: 0, cy: 0, scale: 0.001 };
    const size = { w: 0, h: 0 };

    const toScreen = (x: number, y: number): { sx: number; sy: number } => {
      return {
        sx: (x - view.cx) * view.scale + size.w / 2,
        sy: size.h / 2 - (y - view.cy) * view.scale,
      };
    };
    const toWorld = (px: number, py: number): { x: number; y: number } => {
      return {
        x: view.cx + (px - size.w / 2) / view.scale,
        y: view.cy - (py - size.h / 2) / view.scale,
      };
    };

    const draw = (): void => {
      if (size.w <= 0 || size.h <= 0) {
        return;
      }
      ctx.clearRect(0, 0, size.w, size.h);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size.w, size.h);
      ctx.fillStyle = "#fcfdfe";
      ctx.fillRect(0, 0, size.w, size.h);

      // grid lines
      const step = niceStep(view.scale);
      ctx.strokeStyle = "rgba(120, 145, 170, 0.16)";
      ctx.lineWidth = 1;
      const worldTL = toWorld(0, 0);
      const worldBR = toWorld(size.w, size.h);
      const minX = Math.min(worldTL.x, worldBR.x);
      const maxX = Math.max(worldTL.x, worldBR.x);
      const minY = Math.min(worldTL.y, worldBR.y);
      const maxY = Math.max(worldTL.y, worldBR.y);
      ctx.beginPath();
      for (let gx = Math.floor(minX / step) * step; gx <= maxX; gx += step) {
        const s = toScreen(gx, 0);
        ctx.moveTo(s.sx, 0);
        ctx.lineTo(s.sx, size.h);
      }
      for (let gy = Math.floor(minY / step) * step; gy <= maxY; gy += step) {
        const s = toScreen(0, gy);
        ctx.moveTo(0, s.sy);
        ctx.lineTo(size.w, s.sy);
      }
      ctx.stroke();

      // base polygons (district boundaries)
      for (const feature of baseRef.current) {
        ctx.fillStyle = "rgba(224, 236, 248, 0.55)";
        ctx.strokeStyle = "#7f9cc0";
        ctx.lineWidth = 1.1;
        for (const ring of feature.rings) {
          ctx.beginPath();
          const first = lonLatToMeters(ring[0][0], ring[0][1]);
          let p = toScreen(first.x, first.y);
          ctx.moveTo(p.sx, p.sy);
          for (let i = 1; i < ring.length; i += 1) {
            const m = lonLatToMeters(ring[i][0], ring[i][1]);
            p = toScreen(m.x, m.y);
            ctx.lineTo(p.sx, p.sy);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }

      // pipe lines
      const levelWidth = [1.2, 2.4, 4];
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      const hovered = hoverSegRef.current;
      for (const seg of pipesRef.current) {
        if (seg.coords.length < 2) {
          continue;
        }
        const isHover = hovered !== null && hovered === seg;
        if (isHover) {
          continue;
        }
        ctx.strokeStyle = PIPE_COLOR;
        ctx.lineWidth = levelWidth[lineLevel(seg.diameterMm)];
        ctx.globalAlpha = hovered ? 0.35 : 1;
        ctx.beginPath();
        const first = lonLatToMeters(seg.coords[0][0], seg.coords[0][1]);
        let p = toScreen(first.x, first.y);
        ctx.moveTo(p.sx, p.sy);
        for (let i = 1; i < seg.coords.length; i += 1) {
          const m = lonLatToMeters(seg.coords[i][0], seg.coords[i][1]);
          p = toScreen(m.x, m.y);
          ctx.lineTo(p.sx, p.sy);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // hovered pipe drawn on top with label
      if (hovered && hovered.coords.length >= 2) {
        ctx.strokeStyle = "#0b5cd6";
        ctx.lineWidth = Math.max(3, levelWidth[lineLevel(hovered.diameterMm)] + 2);
        ctx.beginPath();
        const hFirst = lonLatToMeters(hovered.coords[0][0], hovered.coords[0][1]);
        let hp = toScreen(hFirst.x, hFirst.y);
        ctx.moveTo(hp.sx, hp.sy);
        for (let i = 1; i < hovered.coords.length; i += 1) {
          const m = lonLatToMeters(hovered.coords[i][0], hovered.coords[i][1]);
          hp = toScreen(m.x, m.y);
          ctx.lineTo(hp.sx, hp.sy);
        }
        ctx.stroke();
      }

      // pipe codes (labels) once zoomed in enough
      if (view.scale > 0.00004) {
        ctx.font = "11px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (const seg of pipesRef.current) {
          if (seg.coords.length < 2) {
            continue;
          }
          const label = seg.code ?? "";
          if (!label) {
            continue;
          }
          const midIndex = Math.floor(seg.coords.length / 2);
          const mid = lonLatToMeters(
            seg.coords[midIndex][0],
            seg.coords[midIndex][1],
          );
          const sp = toScreen(mid.x, mid.y);
          if (
            sp.sx < -60 ||
            sp.sx > size.w + 60 ||
            sp.sy < -18 ||
            sp.sy > size.h + 18
          ) {
            continue;
          }
          // skip when pipe is short on screen to avoid clutter
          const aM = lonLatToMeters(seg.coords[0][0], seg.coords[0][1]);
          const bM = lonLatToMeters(
            seg.coords[seg.coords.length - 1][0],
            seg.coords[seg.coords.length - 1][1],
          );
          const pa = toScreen(aM.x, aM.y);
          const pb = toScreen(bM.x, bM.y);
          const screenLen = Math.hypot(pb.sx - pa.sx, pb.sy - pa.sy);
          if (screenLen < 46) {
            continue;
          }
          const w = ctx.measureText(label).width;
          const bg = "rgba(255,255,255,0.72)";
          ctx.fillStyle = bg;
          ctx.strokeStyle = "rgba(120,145,170,0.4)";
          ctx.lineWidth = 0.6;
          const bw = w + 10;
          const bx = sp.sx - bw / 2;
          const by = sp.sy - 9;
          ctx.beginPath();
          ctx.roundRect(bx, by, bw, 18, 5);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = "#0b5cd6";
          ctx.font = "600 11px system-ui, sans-serif";
          ctx.fillText(label, sp.sx, sp.sy + 0.5);
          ctx.font = "11px system-ui, sans-serif";
        }
      }

      // district labels
      ctx.font = "12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const feature of baseRef.current) {
        const center = ringCenter(feature.rings);
        const p = toScreen(center.x, center.y);
        if (
          p.sx < -60 ||
          p.sx > size.w + 60 ||
          p.sy < -24 ||
          p.sy > size.h + 24
        ) {
          continue;
        }
        ctx.fillStyle = "#5f7c99";
        ctx.fillText(feature.name, p.sx, p.sy);
      }

      // ---- 首页叠加：基站（绿点）----
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      for (const st of stationsRef.current) {
        const m0 = lonLatToMeters(st.lon, st.lat);
        const sp = toScreen(m0.x, m0.y);
        if (sp.sx < -40 || sp.sx > size.w + 40 || sp.sy < -40 || sp.sy > size.h + 40) {
          continue;
        }
        ctx.fillStyle = "#2e9e5b";
        ctx.beginPath();
        ctx.arc(sp.sx, sp.sy, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
        if (view.scale > 0.00002) {
          ctx.fillStyle = "#0b6a45";
          ctx.font = "600 11px system-ui, sans-serif";
          ctx.fillText(st.name, sp.sx + 9, sp.sy);
        }
      }
      // ---- 设备实时位置（管道机器人=蓝圆，无人机=紫方块）----
      ctx.font = "600 11px system-ui, sans-serif";
      for (const dev of deviceMetaRef.current) {
        const tel = telemetryRef.current.get(dev.id);
        if (!tel) {
          continue;
        }
        const m0 = lonLatToMeters(tel.lon, tel.lat);
        const sp = toScreen(m0.x, m0.y);
        if (sp.sx < -40 || sp.sx > size.w + 40 || sp.sy < -40 || sp.sy > size.h + 40) {
          continue;
        }
        const color = dev.type === "drone" ? "#7a5af8" : "#1664ff";
        ctx.fillStyle = color;
        if (dev.type === "drone") {
          ctx.fillRect(sp.sx - 5.5, sp.sy - 5.5, 11, 11);
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2;
          ctx.strokeRect(sp.sx - 5.5, sp.sy - 5.5, 11, 11);
        } else {
          ctx.beginPath();
          ctx.arc(sp.sx, sp.sy, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        if (view.scale > 0.00002) {
          ctx.fillStyle = color;
          ctx.fillText(dev.name, sp.sx + 9, sp.sy);
        }
      }

      // keep DOM scale bar (below legend) in sync
      const mPerPx = 1 / view.scale;
      const target = 110 * mPerPx;
      const mag = Math.pow(10, Math.floor(Math.log10(target)));
      let len = mag;
      for (const m of [1, 2, 5, 10]) {
        if (m * mag <= target) {
          len = m * mag;
        }
      }
      const px = Math.max(24, len * view.scale);
      const label =
        len >= 1000
          ? `${(len / 1000).toFixed(len >= 10000 ? 0 : 1)} km`
          : `${Math.round(len)} m`;
      if (scaleLineRef.current) {
        scaleLineRef.current.style.width = `${px.toFixed(1)}px`;
      }
      if (scaleLabelRef.current) {
        scaleLabelRef.current.textContent = label;
      }
      redrawRef.current = draw;
    };

    const targetViewForBounds = (
      minLon: number,
      maxLon: number,
      minLat: number,
      maxLat: number,
      factor = 1,
    ): { cx: number; cy: number; scale: number } => {
      if (!Number.isFinite(minLon) || !Number.isFinite(maxLon)) {
        return { cx: view.cx, cy: view.cy, scale: view.scale };
      }
      const a = lonLatToMeters(minLon, minLat);
      const b = lonLatToMeters(maxLon, maxLat);
      const spanX = Math.abs(b.x - a.x) || 1;
      const spanY = Math.abs(b.y - a.y) || 1;
      const base = Math.max(
        0.000005,
        Math.min((size.w - 80) / spanX, (size.h - 80) / spanY),
      );
      return {
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
        scale: base * factor,
      };
    };

    const fitBoundsLonLat = (
      minLon: number,
      maxLon: number,
      minLat: number,
      maxLat: number,
      factor = 1,
    ): void => {
      const target = targetViewForBounds(minLon, maxLon, minLat, maxLat, factor);
      view.cx = target.cx;
      view.cy = target.cy;
      view.scale = target.scale;
    };

    const fitPipes = (factor = 1): void => {
      const pipes = pipesRef.current;
      if (pipes.length === 0) {
        fitBase(factor);
        return;
      }
      const bounds = segmentBounds(pipes);
      if (!bounds) {
        fitBase(factor);
        return;
      }
      fitBoundsLonLat(
        bounds.minLon,
        bounds.maxLon,
        bounds.minLat,
        bounds.maxLat,
        factor,
      );
    };

    const fitBase = (factor = 1): void => {
      let minLon = Number.POSITIVE_INFINITY;
      let maxLon = Number.NEGATIVE_INFINITY;
      let minLat = Number.POSITIVE_INFINITY;
      let maxLat = Number.NEGATIVE_INFINITY;
      for (const feature of baseRef.current) {
        for (const ring of feature.rings) {
          for (const point of ring) {
            minLon = Math.min(minLon, point[0]);
            maxLon = Math.max(maxLon, point[0]);
            minLat = Math.min(minLat, point[1]);
            maxLat = Math.max(maxLat, point[1]);
          }
        }
      }
      fitBoundsLonLat(minLon, maxLon, minLat, maxLat, factor);
    };

    const fitAll = (factor = 1.6): void => {
      if (pipesRef.current.length > 0) {
        fitPipes(factor);
      } else {
        fitBase(factor);
      }
    };

    const resize = (): void => {
      const rect = host.getBoundingClientRect();
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
      size.w = Math.max(1, rect.width);
      size.h = Math.max(1, rect.height);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };

    const observer = new ResizeObserver(() => resize());
    observer.observe(host);

    let baseRequestSeq = 0;

    const applyBase = (
      features: BaseFeature[],
      name: string,
    ): void => {
      baseRef.current = features;
      updateBaseStatus(
        features.length > 0
          ? { key: "mapBaseReady", params: { name } }
          : { key: "mapBaseEmpty" },
      );
      draw();
    };

    const loadAutoBase = async (lon: number, lat: number): Promise<void> => {
      const seq = ++baseRequestSeq;
      updateBaseStatus({ key: "mapBaseMatching" });
      try {
        projectionRefLat = lat;
        const region = await locateRegion(lon, lat);
        if (seq !== baseRequestSeq) {
          return;
        }
        applyBase(toBaseFeatures(region.features), region.label);
        if (pipesRef.current.length === 0) {
          fitBase();
        }
        draw();
      } catch {
        if (seq !== baseRequestSeq) {
          return;
        }
        baseRef.current = [];
        updateBaseStatus({ key: "mapBaseMatchFailed" });
        draw();
      }
    };

    // 默认中国全国底图：没有任何数据源时展示整幅中国地图（中心中国），读取到数据后由上层自动聚焦
    const loadChinaBase = async (): Promise<void> => {
      const seq = ++baseRequestSeq;
      updateBaseStatus({ key: "mapChinaLoading" });
      try {
        projectionRefLat = 35;
        const local = await loadLocalRegion("/gis/china-full.json", "中国");
        if (seq !== baseRequestSeq) {
          return;
        }
        // 过滤无名称的九段线装饰要素，只保留省级行政区
        const named = local.features.filter((feature) => feature.name.length > 0);
        applyBase(toBaseFeatures(named), "mapChinaName");
        if (pipesRef.current.length === 0) {
          fitBase();
        }
        draw();
      } catch {
        if (seq !== baseRequestSeq) {
          return;
        }
        baseRef.current = [];
        updateBaseStatus({ key: "mapChinaFailed" });
        draw();
      }
    };

    const loadPipes = async (): Promise<void> => {
      const source = readActiveGisSource();
      if (!source) {
        activeFileIdRef.current = null;
        pipesRef.current = [];
        setPipeStats([]);
        updateStatus({ key: "mapStatusNoSource" });
        await loadChinaBase();
        return;
      }
      activeFileIdRef.current = source.kind === "file" ? source.id : null;
      try {
        const raw = await fetchGisSourceContent(source);
        const data = parseGisGeoJson(raw);
        ensurePipeCodes(data.segments);
        pipesRef.current = data.segments;
        updateStatus({
          key: "mapStatusSource",
          params: {
            name: source.name,
            count: data.segments.length,
          },
        });
        const bounds = segmentBounds(data.segments);
        if (bounds) {
          // 用数据范围中心纬度作为投影参考，与绘制/悬停长度保持一致
          projectionRefLat = (bounds.minLat + bounds.maxLat) / 2;
        }
        const statMap = new Map<string, { count: number; km: number }>();
        for (const seg of data.segments) {
          const net = seg.network ?? "未知";
          const stat = statMap.get(net) ?? { count: 0, km: 0 };
          stat.count += 1;
          for (let i = 1; i < seg.coords.length; i += 1) {
            const a = lonLatToMeters(seg.coords[i - 1][0], seg.coords[i - 1][1]);
            const b = lonLatToMeters(seg.coords[i][0], seg.coords[i][1]);
            stat.km += Math.hypot(b.x - a.x, b.y - a.y) / 1000;
          }
          statMap.set(net, stat);
        }
        setPipeStats(
          Array.from(statMap.entries())
            .map(([network, value]) => ({
              network,
              ...value,
            }))
            .sort((x, y) => y.km - x.km),
        );
        if (bounds) {
          const centerLon = (bounds.minLon + bounds.maxLon) / 2;
          const centerLat = (bounds.minLat + bounds.maxLat) / 2;
          await loadAutoBase(centerLon, centerLat);
          fitAll();
        } else {
          await loadChinaBase();
        }
        draw();
      } catch {
        pipesRef.current = [];
        setPipeStats([]);
        updateStatus({ key: "mapStatusLoadFailed" });
        await loadChinaBase();
        draw();
      }
    };

    const unsubscribe = listenGisActiveChange(() => {
      void loadPipes();
    });

    // smooth fly-to animation (used by agent focus)
    let animFrame = 0;
    const cancelFlyTo = (): void => {
      if (animFrame !== 0) {
        globalThis.cancelAnimationFrame(animFrame);
        animFrame = 0;
      }
    };
    const flyTo = (
      targetCx: number,
      targetCy: number,
      targetScale: number,
      duration = 600,
    ): void => {
      cancelFlyTo();
      const fromCx = view.cx;
      const fromCy = view.cy;
      const fromScale = view.scale;
      const start = performance.now();
      const ease = (t: number): number =>
        t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const step = (now: number): void => {
        const t = Math.min(1, (now - start) / duration);
        const e = ease(t);
        view.cx = fromCx + (targetCx - fromCx) * e;
        view.cy = fromCy + (targetCy - fromCy) * e;
        view.scale = fromScale + (targetScale - fromScale) * e;
        draw();
        if (t < 1) {
          animFrame = globalThis.requestAnimationFrame(step);
        } else {
          animFrame = 0;
          view.cx = targetCx;
          view.cy = targetCy;
          view.scale = targetScale;
          draw();
        }
      };
      animFrame = globalThis.requestAnimationFrame(step);
    };

    const onGisFocus = (event: Event): void => {
      const detail = (event as CustomEvent<{
        fileId?: number;
        code?: string;
        minLon?: number;
        maxLon?: number;
        minLat?: number;
        maxLat?: number;
      }>).detail;
      if (!detail) {
        return;
      }
      const fileId =
        typeof detail.fileId === "number" ? detail.fileId : null;
      if (fileId !== null && activeFileIdRef.current !== fileId) {
        updateStatus({
          key: "mapStatusFocusOtherFile",
          params: { fileId },
        });
        return;
      }
      const minLon = detail.minLon;
      const maxLon = detail.maxLon;
      const minLat = detail.minLat;
      const maxLat = detail.maxLat;
      if (
        typeof minLon !== "number" ||
        typeof maxLon !== "number" ||
        typeof minLat !== "number" ||
        typeof maxLat !== "number" ||
        maxLon <= minLon ||
        maxLat <= minLat
      ) {
        return;
      }
      const target = targetViewForBounds(minLon, maxLon, minLat, maxLat, 1.6);
      const code = detail.code ? ` · ${detail.code}` : "";
      updateStatus({ key: "mapStatusLocated", params: { code } });
      flyTo(target.cx, target.cy, target.scale, 700);
    };
    window.addEventListener("pm-gis-focus", onGisFocus);

    // hover hit detection over pipe polylines
    const hitTest = (
      px: number,
      py: number,
    ): { seg: GisLineSegment | null; dist: number } => {
      const w = toWorld(px, py);
      const threshold = 10 / view.scale; // 10px in world units
      let bestSeg: GisLineSegment | null = null;
      let bestDist = threshold;
      for (const seg of pipesRef.current) {
        if (seg.coords.length < 2) {
          continue;
        }
        for (let i = 1; i < seg.coords.length; i += 1) {
          const a = lonLatToMeters(seg.coords[i - 1][0], seg.coords[i - 1][1]);
          const b = lonLatToMeters(seg.coords[i][0], seg.coords[i][1]);
          const ax = a.x - w.x;
          const ay = a.y - w.y;
          const abx = b.x - a.x;
          const aby = b.y - a.y;
          const len2 = abx * abx + aby * aby;
          let t = 0;
          if (len2 > 1e-9) {
            t = Math.max(0, Math.min(1, (ax * abx + ay * aby) / len2));
          }
          const cx = ax - abx * t;
          const cy = ay - aby * t;
          const d = Math.sqrt(cx * cx + cy * cy);
          if (d < bestDist) {
            bestDist = d;
            bestSeg = seg;
          }
        }
      }
      return { seg: bestSeg, dist: bestDist };
    };

    const updateHover = (event: PointerEvent): void => {
      const rect = canvas.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const hit = hitTest(px, py);
      if (hit.seg) {
        hoverSegRef.current = hit.seg;
        hoverPosRef.current = { x: event.clientX, y: event.clientY };
        setHoverSeg(hit.seg);
        setHoverPos({ x: event.clientX, y: event.clientY });
      } else if (hoverSegRef.current) {
        clearHover();
      }
      draw();
    };

    let dragStart: { x: number; y: number } | null = null;
    let dragView: { cx: number; cy: number } | null = null;
    const pointerDown = (event: PointerEvent): void => {
      cancelFlyTo();
      const rect = canvas.getBoundingClientRect();
      dragStart = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      dragView = { cx: view.cx, cy: view.cy };
      canvas.setPointerCapture(event.pointerId);
    };
    const pointerMove = (event: PointerEvent): void => {
      if (!dragStart || !dragView) {
        updateHover(event);
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const dx = event.clientX - rect.left - dragStart.x;
      const dy = event.clientY - rect.top - dragStart.y;
      view.cx = dragView.cx - dx / view.scale;
      view.cy = dragView.cy + dy / view.scale;
      updateHover(event);
    };
    const pointerUp = (): void => {
      dragStart = null;
      dragView = null;
    };
    const pointerLeave = (): void => {
      if (!dragStart) {
        clearHover();
      }
    };
    const wheel = (event: WheelEvent): void => {
      event.preventDefault();
      cancelFlyTo();
      const rect = canvas.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const oldScale = view.scale;
      const scale = Math.max(0.000005, Math.min(2, oldScale * Math.exp(-event.deltaY * 0.0015)));
      const anchor = toWorld(px, py);
      view.scale = scale;
      view.cx = anchor.x - (px - size.w / 2) / scale;
      view.cy = anchor.y + (py - size.h / 2) / scale;
      draw();
    };
    const dblClick = (): void => {
      cancelFlyTo();
      fitAll(1);
      draw();
    };

    resize();
    // 先展示中国全国底图作为默认视图；随后数据读取完成后 loadPipes 会自动聚焦
    void loadChinaBase();
    void loadPipes();
    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerUp);
    canvas.addEventListener("pointercancel", pointerUp);
    canvas.addEventListener("wheel", wheel, { passive: false });
    canvas.addEventListener("dblclick", dblClick);
    canvas.addEventListener("pointerleave", pointerLeave);

    return () => {
      cancelFlyTo();
      observer.disconnect();
      unsubscribe();
      window.removeEventListener("pm-gis-focus", onGisFocus);
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", pointerUp);
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("dblclick", dblClick);
      canvas.removeEventListener("pointerleave", pointerLeave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Box
        ref={hostRef}
        sx={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          backgroundColor: "#ffffff",
          "& canvas": {
            display: "block",
            outline: "none",
            cursor: "grab",
            touchAction: "none",
          },
        }}
      >
        <canvas ref={canvasRef} aria-hidden="true" />
      </Box>
      <Box
        sx={{
          position: "absolute",
          right: { xs: 16, sm: 32 },
          top: { xs: 120, sm: 128 },
          zIndex: 2,
          pointerEvents: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 30,
          height: 30,
          color: "var(--pm-color-text-secondary)",
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-label={t("mapNorth")}>
          <path
            d="M12 2 L15 12 L12 10 L9 12 Z"
            fill="#4c6b8a"
            stroke="#4c6b8a"
            strokeWidth="0.6"
          />
          <path
            d="M12 22 L15 12 L12 14 L9 12 Z"
            fill="#c3d2e0"
            stroke="#9db1c5"
            strokeWidth="0.6"
          />
          <text
            x="12"
            y="7"
            textAnchor="middle"
            fontSize="5"
            fill="#6b7f95"
            fontWeight={700}
          >
            N
          </text>
        </svg>
      </Box>
      <Box
        sx={{
          position: "absolute",
          left: { xs: 16, sm: 28 },
          top: { xs: 66, sm: 72 },
          zIndex: 2,
          pointerEvents: "none",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          rowGap: 1.2,
        }}
      >
        {pipeStats.length > 0 ? (
          <Box sx={{ display: "flex", flexDirection: "column", rowGap: 0.5 }}>
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--pm-color-text-primary)",
              }}
            >
              {t("mapLegendTitle")}
            </Typography>
            {pipeStats.map((stat) => (
              <Box
                key={stat.network}
                sx={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  columnGap: 1,
                }}
              >
                <Box
                  sx={{
                    width: 18,
                    height: 4,
                    borderRadius: 3,
                    backgroundColor: PIPE_COLOR,
                    flexShrink: 0,
                  }}
                />
                <Typography sx={{ fontSize: 12, color: "var(--pm-color-text-secondary)" }}>
                  {networkName(t, stat.network)}
                </Typography>
                <Typography
                  sx={{
                    fontSize: 12,
                    color: "var(--pm-color-text-hint)",
                  }}
                >
                  {t("mapSegmentsStat")
                    .split("{count}")
                    .join(String(stat.count))
                    .split("{km}")
                    .join(stat.km.toFixed(1))}
                </Typography>
              </Box>
            ))}
          </Box>
        ) : (
          <Typography sx={{ fontSize: 12, color: "var(--pm-color-text-hint)" }}>
            {formatMsg(statusMsg)}
          </Typography>
        )}
        <Box
          sx={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            columnGap: 0.6,
          }}
        >
          <Typography sx={{ fontSize: 11, color: "var(--pm-color-text-hint)" }}>
            {t("mapScale")}
          </Typography>
          <Box
            ref={scaleLineRef}
            sx={{
              height: 0,
              borderTop: "2px solid var(--pm-color-text-secondary)",
              minWidth: 24,
            }}
          />
          <Typography
            component="span"
            ref={scaleLabelRef}
            sx={{ fontSize: 11, color: "var(--pm-color-text-secondary)" }}
          >
            —
          </Typography>
        </Box>
        <Typography sx={{ fontSize: 11, color: "var(--pm-color-text-hint)" }}>
          {formatMsg(baseMsg)}
        </Typography>
      </Box>
      {hoverSeg && hoverPos && (
        <Box
          sx={{
            position: "fixed",
            left: hoverPos.x + 14,
            top: hoverPos.y + 16,
            zIndex: 1300,
            pointerEvents: "none",
            maxWidth: 280,
            transform: "translateY(-6px)",
          }}
        >
          <Paper
            elevation={0}
            variant="outlined"
            sx={{
              borderRadius: 2,
              borderColor: "var(--pm-color-border)",
              backgroundColor: "rgba(255,255,255,0.94)",
              backdropFilter: "blur(10px)",
              boxShadow: "0 8px 24px rgb(16 24 40 / 0.12)",
              px: 1.4,
              py: 1.1,
            }}
          >
            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 700,
                mb: 0.4,
                color: "#0b5cd6",
              }}
            >
              {hoverSeg.code ??
                (networkName(t, hoverSeg.network) || t("mapHoverPipe"))}
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", rowGap: 0.25 }}>
              <Box sx={{ display: "flex", flexDirection: "row", columnGap: 1.6 }}>
                <Typography sx={{ fontSize: 12, minWidth: 56, color: "var(--pm-color-text-hint)" }}>
                  {t("mapHoverType")}
                </Typography>
                <Typography sx={{ fontSize: 12, color: "var(--pm-color-text-secondary)" }}>
                  {networkName(t, hoverSeg.network) || "—"}
                </Typography>
              </Box>
              <Box sx={{ display: "flex", flexDirection: "row", columnGap: 1.6 }}>
                <Typography sx={{ fontSize: 12, minWidth: 56, color: "var(--pm-color-text-hint)" }}>
                  {t("mapHoverDiameter")}
                </Typography>
                <Typography sx={{ fontSize: 12, color: "var(--pm-color-text-secondary)" }}>
                  {hoverSeg.diameterMm ? `DN${hoverSeg.diameterMm}` : "—"}
                </Typography>
              </Box>
              <Box sx={{ display: "flex", flexDirection: "row", columnGap: 1.6 }}>
                <Typography sx={{ fontSize: 12, minWidth: 56, color: "var(--pm-color-text-hint)" }}>
                  {t("mapHoverMaterial")}
                </Typography>
                <Typography sx={{ fontSize: 12, color: "var(--pm-color-text-secondary)" }}>
                  {hoverSeg.material ?? "—"}
                </Typography>
              </Box>
              <Box sx={{ display: "flex", flexDirection: "row", columnGap: 1.6 }}>
                <Typography sx={{ fontSize: 12, minWidth: 56, color: "var(--pm-color-text-hint)" }}>
                  {t("mapHoverDepth")}
                </Typography>
                <Typography sx={{ fontSize: 12, color: "var(--pm-color-text-secondary)" }}>
                  {hoverSeg.depthM !== undefined ? `${hoverSeg.depthM} m` : "—"}
                </Typography>
              </Box>
              <Box sx={{ display: "flex", flexDirection: "row", columnGap: 1.6 }}>
                <Typography sx={{ fontSize: 12, minWidth: 56, color: "var(--pm-color-text-hint)" }}>
                  {t("mapHoverLength")}
                </Typography>
                <Typography sx={{ fontSize: 12, color: "var(--pm-color-text-secondary)" }}>
                  {`${(segMeters(hoverSeg) / 1000).toFixed(2)} km`}
                </Typography>
              </Box>
            </Box>
          </Paper>
        </Box>
      )}
    </>
  );
}
