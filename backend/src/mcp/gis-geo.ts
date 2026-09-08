export interface GisPipeHit {
  code: string;
  network: string;
  diameterMm?: number;
  depthM?: number;
  material?: string;
  lengthM: number;
  centerLon: number;
  centerLat: number;
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
  index: number;
}

export interface GisInspect {
  count: number;
  totalKm: number;
  bounds: { minLon: number; maxLon: number; minLat: number; maxLat: number } | null;
  networks: Record<string, number>;
}

interface GeoFeature {
  properties?: Record<string, unknown>;
  geometry?: { coordinates?: unknown };
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function isPoint(value: unknown): value is number[] {
  return Array.isArray(value) && typeof value[0] === 'number';
}

/**
 * 遍历线要素（LineString / MultiLineString），每条线作为一个管段。
 * @param {unknown} raw - 解析后的 GeoJSON
 * @param {(line: number[][], props: Record<string, unknown>) => void} visit - 回调
 */
export function walkGisLines(
  raw: unknown,
  visit: (line: number[][], props: Record<string, unknown>) => void,
): void {
  const walk = (node: unknown, props: Record<string, unknown>): void => {
    if (node === null || typeof node !== 'object') {
      return;
    }
    const entry = node as Record<string, unknown>;
    const type = entry.type;
    const geometry = entry.geometry as Record<string, unknown> | undefined;
    const properties = (entry.properties ??
      {}) as Record<string, unknown>;
    if (type === 'FeatureCollection' && Array.isArray(entry.features)) {
      for (const feature of entry.features) {
        walk(feature, {});
      }
      return;
    }
    if (type === 'GeometryCollection' && Array.isArray(entry.geometries)) {
      for (const sub of entry.geometries) {
        walk(sub, properties);
      }
      return;
    }
    const effectiveType = geometry?.type ?? type;
    const effectiveCoords = geometry?.coordinates ?? entry.coordinates;
    if (effectiveType === 'LineString') {
      collect(effectiveCoords, properties, visit);
    } else if (effectiveType === 'MultiLineString') {
      if (Array.isArray(effectiveCoords)) {
        for (const part of effectiveCoords) {
          collect(part, properties, visit);
        }
      }
    }
  };
  const collect = (
    coords: unknown,
    props: Record<string, unknown>,
    callback: (line: number[][], p: Record<string, unknown>) => void,
  ): void => {
    if (!Array.isArray(coords)) {
      return;
    }
    const line: number[][] = [];
    for (const point of coords) {
      if (Array.isArray(point) && isPoint(point)) {
        line.push([asNumber(point[0]) ?? 0, asNumber(point[1]) ?? 0]);
      }
    }
    if (line.length >= 2) {
      callback(line, props);
    }
  };
  walk(raw, {});
}

function networkName(props: Record<string, unknown>): string {
  const raw = String(
    props.network ?? props.type ?? props.kind ?? props.usage ?? '',
  ).trim();
  if (raw) {
    return raw;
  }
  return '未知';
}

function diameterOf(props: Record<string, unknown>): number | undefined {
  return asNumber(props.diameter_mm ?? props.diameter ?? props.dn ?? props.管径);
}

function depthOf(props: Record<string, unknown>): number | undefined {
  return asNumber(props.depth_m ?? props.depth ?? props.埋深 ?? props.elevation);
}

function materialOf(props: Record<string, unknown>): string | undefined {
  const raw = String(props.material ?? props.材质 ?? props.mat ?? '').trim();
  return raw || undefined;
}

function codeOf(props: Record<string, unknown>): string {
  const raw = String(
    props.code ?? props.编号 ?? props.id ?? props.name ?? props.管道编号 ?? '',
  ).trim();
  return raw || '';
}

const M_PER_LON = 111320;
const M_PER_LAT = 110540;

/**
 * 解析 GeoJSON 中所有管段并返回带编号/包围盒的信息。
 * @param {unknown} raw - 解析后的 GeoJSON
 * @returns {GisPipeHit[]} 管段列表
 */
export function parseGisPipes(raw: unknown): GisPipeHit[] {
  const hits: GisPipeHit[] = [];
  const counters = new Map<string, number>();
  const prefixOf: Record<string, string> = {
    给水: 'GS',
    排水: 'PS',
    污水: 'PS',
    雨水: 'YS',
    供热: 'GR',
    燃气: 'RQ',
    电力: 'DL',
    通讯: 'TX',
  };
  walkGisLines(raw, (line, props) => {
    const network = networkName(props);
    const code = codeOf(props);
    const prefix = prefixOf[network] ?? 'GD';
    const n = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, n);
    const displayCode = code || `${prefix}-${String(n).padStart(4, '0')}`;
    let minLon = Number.POSITIVE_INFINITY;
    let maxLon = Number.NEGATIVE_INFINITY;
    let minLat = Number.POSITIVE_INFINITY;
    let maxLat = Number.NEGATIVE_INFINITY;
    let lengthM = 0;
    for (let i = 0; i < line.length; i += 1) {
      const lon = line[i][0];
      const lat = line[i][1];
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      if (i > 0) {
        const cos = Math.cos((lat * Math.PI) / 180);
        const dx = (lon - line[i - 1][0]) * M_PER_LON * cos;
        const dy = (lat - line[i - 1][1]) * M_PER_LAT;
        lengthM += Math.hypot(dx, dy);
      }
    }
    hits.push({
      code: displayCode,
      network,
      diameterMm: diameterOf(props),
      depthM: depthOf(props),
      material: materialOf(props),
      lengthM,
      centerLon: (minLon + maxLon) / 2,
      centerLat: (minLat + maxLat) / 2,
      minLon,
      maxLon,
      minLat,
      maxLat,
      index: hits.length,
    });
  });
  return hits;
}

/**
 * 统计文件概览。
 * @param {unknown} raw - 解析后的 GeoJSON
 * @returns {GisInspect} 概览
 */
export function inspectGis(raw: unknown): GisInspect {
  const hits = parseGisPipes(raw);
  const totalKm = hits.reduce((sum, hit) => sum + hit.lengthM, 0) / 1000;
  const networks: Record<string, number> = {};
  let minLon = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  for (const hit of hits) {
    networks[hit.network] = (networks[hit.network] ?? 0) + 1;
    minLon = Math.min(minLon, hit.minLon);
    maxLon = Math.max(maxLon, hit.maxLon);
    minLat = Math.min(minLat, hit.minLat);
    maxLat = Math.max(maxLat, hit.maxLat);
  }
  return {
    count: hits.length,
    totalKm: Number(totalKm.toFixed(2)),
    bounds:
      hits.length > 0
        ? { minLon, maxLon, minLat, maxLat }
        : null,
    networks,
  };
}
