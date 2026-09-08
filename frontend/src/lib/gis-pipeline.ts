"use client";

export interface GisLineSegment {
  coords: number[][];
  diameterMm?: number;
  network?: string;
  depthM?: number;
  code?: string;
  material?: string;
}

export interface GisGeoData {
  segments: GisLineSegment[];
}

const NETWORK_COLORS: Record<string, string> = {
  给水: "#3f8cff",
  给水管: "#3f8cff",
  排水: "#17a05e",
  污水: "#17a05e",
  污水管: "#17a05e",
  雨水: "#2fbf71",
  供热: "#f08c32",
  燃气: "#e5484d",
  电力: "#8f6ce8",
  通讯: "#2a9db3",
};

const NETWORK_ALIAS: Record<string, string> = {
  water: "给水",
  water_supply: "给水",
  sewer: "排水",
  sewage: "排水",
  drain: "排水",
  storm: "雨水",
  heating: "供热",
  gas: "燃气",
  power: "电力",
  telecom: "通讯",
};

/**
 * 依据网络类型返回图纸颜色（CSS）。
 * @param {string | undefined} network - 网络类型
 * @returns {string} 颜色值
 */
export function resolveColorHex(network: string | undefined): string {
  const key = (network ?? "").trim();
  return NETWORK_COLORS[key] ?? "#1a6fc4";
}

/**
 * 依据管径返回图纸线宽档位。
 * @param {number | undefined} diameterMm - 管径（毫米）
 * @returns {number} 线宽档（0-2）
 */
export function lineLevel(diameterMm: number | undefined): number {
  const d = diameterMm ?? 300;
  if (d >= 2000) return 2;
  if (d >= 1000) return 1;
  return 0;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function pushLines(
  target: GisLineSegment[],
  coordinates: unknown,
  props: Record<string, unknown>,
): void {
  if (!Array.isArray(coordinates)) {
    return;
  }
  const rawNetwork = String(
    props.network ?? props.type ?? props.kind ?? props.usage ?? "",
  ).trim();
  const network =
    NETWORK_ALIAS[rawNetwork.toLowerCase()] ?? (rawNetwork || undefined);
  const diameterMm = asNumber(
    props.diameter_mm ?? props.diameter ?? props.dn ?? props.管径,
  );
  const depthM = asNumber(
    props.depth_m ?? props.depth ?? props.埋深 ?? props.elevation,
  );
  const code =
    String(
      props.code ?? props.编号 ?? props.id ?? props.name ?? props.管道编号 ?? "",
    ).trim() || undefined;
  const material =
    String(props.material ?? props.材质 ?? props.mat ?? "").trim() ||
    undefined;
  if (coordinates.length > 0 && Array.isArray(coordinates[0])) {
    const coords = (coordinates as unknown[][]).map((point) => {
      const lon = asNumber(point[0]);
      const lat = asNumber(point[1]);
      return [lon ?? 0, lat ?? 0];
    });
    target.push({ coords, network, diameterMm, depthM, code, material });
  }
}

/**
 * 解析 GeoJSON/GeoJSON Feature 数据，收集全部线要素。
 * @param {unknown} raw - GeoJSON 数据
 * @returns {GisGeoData} 线要素集合
 */
export function parseGisGeoJson(raw: unknown): GisGeoData {
  const segments: GisLineSegment[] = [];
  if (raw === null || typeof raw !== "object") {
    return { segments };
  }
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== "object") {
      return;
    }
    const entry = node as Record<string, unknown>;
    const type = entry.type;
    const geometry = entry.geometry as Record<string, unknown> | undefined;
    const properties = (entry.properties ?? {}) as Record<string, unknown>;
    if (type === "FeatureCollection" && Array.isArray(entry.features)) {
      for (const feature of entry.features) {
        walk(feature);
      }
      return;
    }
    if (type === "GeometryCollection" && Array.isArray(entry.geometries)) {
      for (const sub of entry.geometries) {
        walk({ type: "Feature", geometry: sub, properties });
      }
      return;
    }
    const effectiveType = geometry?.type ?? type;
    const effectiveCoords = geometry?.coordinates ?? entry.coordinates;
    if (effectiveType === "LineString") {
      pushLines(segments, effectiveCoords, properties);
    } else if (effectiveType === "MultiLineString") {
      if (Array.isArray(effectiveCoords)) {
        for (const part of effectiveCoords) {
          pushLines(segments, part, properties);
        }
      }
    }
  };
  walk(raw);
  return { segments };
}

export interface GeoBounds {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

/**
 * 计算一组线要素的经纬度包围盒。
 * @param {GisLineSegment[]} segments - 线要素
 * @returns {GeoBounds | null} 包围盒
 */
export function segmentBounds(segments: GisLineSegment[]): GeoBounds | null {
  let minLon = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let any = false;
  for (const seg of segments) {
    for (const [lon, lat] of seg.coords) {
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      any = true;
    }
  }
  return any ? { minLon, maxLon, minLat, maxLat } : null;
}

/**
 * 遍历 GeoJSON 的所有多边形环（含 MultiPolygon/洞）。
 * @param {unknown} coords - GeoJSON coordinates
 * @param {(ring: number[][]) => void} visit - 环回调
 */
export function forEachRing(
  coords: unknown,
  visit: (ring: number[][]) => void,
): void {
  const isPoint = (value: unknown): value is number[] =>
    Array.isArray(value) && typeof value[0] === "number";
  const walk = (node: unknown): void => {
    if (!Array.isArray(node)) {
      return;
    }
    if (node.length > 0 && isPoint(node[0])) {
      if (node.length >= 3) {
        visit(node as unknown as number[][]);
      }
      return;
    }
    for (const child of node) {
      walk(child);
    }
  };
  walk(coords);
}

const EARTH_M_PER_DEG_LAT = 110540;
const EARTH_M_PER_DEG_LON = 111320;

/**
 * 将经纬度转换为以参考纬度展开的平面米制坐标。
 * @param {number} lon - 经度
 * @param {number} lat - 纬度
 * @param {number} refLat - 参考纬度（弧度）
 * @returns {{ x: number; y: number }} 平面坐标
 */
export function projectMeter(
  lon: number,
  lat: number,
  refLat: number,
): { x: number; y: number } {
  const cosLat = Math.cos(refLat);
  return {
    x: lon * EARTH_M_PER_DEG_LON * cosLat,
    y: lat * EARTH_M_PER_DEG_LAT,
  };
}
