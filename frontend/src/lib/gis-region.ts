"use client";

export interface RegionFeature {
  name: string;
  code: string;
  rings: number[][][];
  cx: number;
  cy: number;
}

interface GeoJsonFeature {
  properties?: Record<string, unknown>;
  geometry?: { coordinates?: unknown };
}

interface GeoCollection {
  features: GeoJsonFeature[];
}

const CACHE_PREFIX = "pm_gis_region_v1_";

function cacheKey(url: string): string {
  return CACHE_PREFIX + url.replace(/[^a-zA-Z0-9]/g, "_");
}

function readCache<T>(key: string): T | null {
  try {
    const raw = globalThis.localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

function writeCache(key: string, value: unknown): void {
  try {
    globalThis.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    void 0;
  }
}

function isPoint(value: unknown): value is number[] {
  return Array.isArray(value) && typeof value[0] === "number";
}

/**
 * 射线法判断点是否在环内。
 * @param {number[]} point - [lon, lat]
 * @param {number[][]} ring - 闭合环
 * @returns {boolean} 是否在内
 */
function pointInRing(point: number[], ring: number[][]): boolean {
  const x = point[0];
  const y = point[1];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * 判断点是否落在 geometry（Polygon/MultiPolygon）的任一外环内。
 * @param {number[]} point - [lon, lat]
 * @param {unknown} coords - geometry.coordinates
 * @returns {boolean} 是否命中
 */
export function pointInGeometry(point: number[], coords: unknown): boolean {
  let hit = false;
  const walk = (node: unknown): void => {
    if (hit || !Array.isArray(node)) {
      return;
    }
    if (node.length > 0 && isPoint(node[0])) {
      if (node.length >= 3 && pointInRing(point, node as unknown as number[][])) {
        hit = true;
      }
      return;
    }
    for (const child of node) {
      walk(child);
    }
  };
  walk(coords);
  return hit;
}

function lonLatToMeters(lon: number, lat: number): { x: number; y: number } {
  const cos = Math.cos((lat * Math.PI) / 180);
  return { x: lon * 111320 * cos, y: lat * 110540 };
}

function bboxCenter(coords: unknown): { x: number; y: number } {
  let minLon = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  const walk = (node: unknown): void => {
    if (!Array.isArray(node)) {
      return;
    }
    if (node.length > 0 && isPoint(node[0])) {
      const p = node as unknown as number[];
      minLon = Math.min(minLon, p[0]);
      maxLon = Math.max(maxLon, p[0]);
      minLat = Math.min(minLat, p[1]);
      maxLat = Math.max(maxLat, p[1]);
      return;
    }
    for (const child of node) {
      walk(child);
    }
  };
  walk(coords);
  if (!Number.isFinite(minLon)) {
    return { x: 0, y: 0 };
  }
  return lonLatToMeters((minLon + maxLon) / 2, (minLat + maxLat) / 2);
}

/**
 * 下载并缓存 GeoJSON。
 * @param {string} url - 地址
 * @returns {Promise<unknown>} GeoJSON
 */
export async function fetchCachedGeoJson(url: string): Promise<unknown> {
  const key = cacheKey(url);
  const cached = readCache<unknown>(key);
  if (cached !== null) {
    return cached;
  }
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`区域数据请求失败 HTTP ${response.status}`);
  }
  const data = (await response.json()) as unknown;
  writeCache(key, data);
  return data;
}

function asCollection(value: unknown): GeoCollection | null {
  if (
    value !== null &&
    typeof value === "object" &&
    Array.isArray((value as Record<string, unknown>).features)
  ) {
    return value as unknown as GeoCollection;
  }
  return null;
}

function findMatchingFeature(
  point: [number, number],
  collection: GeoCollection,
): GeoJsonFeature | null {
  for (const feature of collection.features) {
    const coords = feature.geometry?.coordinates;
    if (coords && pointInGeometry(point, coords)) {
      return feature;
    }
  }
  return null;
}

/**
 * 将 GeoJSON feature 转成区域 feature。
 * @param {GeoJsonFeature} feature - GeoJSON feature
 * @returns {RegionFeature | null} 区域 feature
 */
export function toRegionFeature(feature: GeoJsonFeature): RegionFeature | null {
  const props = feature.properties ?? {};
  const name = String(props.name ?? props.fullname ?? "");
  const code = String(props.code ?? props.adcode ?? "");
  const rings: number[][][] = [];
  const collect = (node: unknown): void => {
    if (!Array.isArray(node)) {
      return;
    }
    if (node.length > 0 && isPoint(node[0])) {
      if (node.length >= 3) {
        rings.push(node as unknown as number[][]);
      }
      return;
    }
    for (const child of node) {
      collect(child);
    }
  };
  collect(feature.geometry?.coordinates);
  if (rings.length === 0) {
    return null;
  }
  const center = bboxCenter(feature.geometry?.coordinates);
  return { name, code, rings, cx: center.x, cy: center.y };
}

function featuresOf(collection: GeoCollection): RegionFeature[] {
  return collection.features
    .map(toRegionFeature)
    .filter((f): f is RegionFeature => f !== null);
}

export interface RegionResult {
  features: RegionFeature[];
  label: string;
  level: string;
}

function cityLabel(name: string): string {
  const clean = name.replace(/市|地区|自治州|盟/g, "");
  return `${clean}市`;
}

const MUNICIPALITY_CODES = new Set([
  "110000",
  "120000",
  "310000",
  "500000",
]);

/**
 * 尝试用 DataV 加载某 code 下辖的区县边界。
 * @param {string} code - 行政区代码
 * @returns {Promise<RegionResult | null>} 区县结果或 null
 */
async function loadDistricts(
  code: string,
  label: string,
): Promise<RegionResult | null> {
  try {
    const district = asCollection(
      await fetchCachedGeoJson(
        `https://geo.datav.aliyun.com/areas_v3/bound/${code}_full.json`,
      ),
    );
    if (district && district.features.length > 0) {
      const features = featuresOf(district);
      if (features.length > 0) {
        return {
          features,
          label: `${label} · 区县界`,
          level: "district",
        };
      }
    }
  } catch {
    void 0;
  }
  return null;
}

/**
 * 根据中心点自动匹配行政区底图（省 → 地市 → 区县）。
 * @param {number} lon - 中心经度
 * @param {number} lat - 中心纬度
 * @returns {Promise<RegionResult>} 区域底图
 */
export async function locateRegion(
  lon: number,
  lat: number,
): Promise<RegionResult> {
  const point: [number, number] = [lon, lat];

  const national = asCollection(
    await fetchCachedGeoJson("https://geojson.cn/api/china/100000.json"),
  );
  if (!national) {
    throw new Error("无法加载全国区划数据");
  }
  const province = findMatchingFeature(point, national);
  if (!province) {
    throw new Error("未匹配到所在省份");
  }
  const pName = String((province.properties ?? {}).name ?? "");
  const pCode = String((province.properties ?? {}).code ?? "");
  const pLabel = pName.endsWith("市") ? pName : `${pName}省`;

  // direct-controlled municipality: its own districts = province-level _full
  if (MUNICIPALITY_CODES.has(pCode)) {
    const district = await loadDistricts(pCode, pName);
    if (district) {
      return district;
    }
    const singleProvince = toRegionFeature(province);
    if (singleProvince) {
      return {
        features: [singleProvince],
        label: pLabel,
        level: "province",
      };
    }
    throw new Error("未匹配到行政区");
  }

  // find which city the point belongs to via province-level file
  let cityFeature: GeoJsonFeature | null = null;
  let cityCode = "";
  let cityName = "";
  try {
    const cityCollection = asCollection(
      await fetchCachedGeoJson(`https://geojson.cn/api/china/${pCode}.json`),
    );
    if (cityCollection) {
      const matched = findMatchingFeature(point, cityCollection);
      if (matched) {
        cityFeature = matched;
        const props = matched.properties ?? {};
        cityName = String(props.name ?? "");
        cityCode = String(props.code ?? props.adcode ?? "");
      }
    }
  } catch {
    void 0;
  }

  if (cityFeature && cityCode) {
    const label = cityName ? cityLabel(cityName) : pLabel;
    const district = await loadDistricts(cityCode, label);
    if (district) {
      return district;
    }
    const single = toRegionFeature(cityFeature);
    if (single) {
      return { features: [single], label, level: "city" };
    }
  }

  const singleProvince = toRegionFeature(province);
  if (singleProvince) {
    return {
      features: [singleProvince],
      label: pLabel,
      level: "province",
    };
  }
  throw new Error("未匹配到行政区");
}

export interface LocalRegionFile {
  features: RegionFeature[];
  label: string;
  level: string;
}

/**
 * 从本地 GeoJSON 文件构造区域 feature。
 * @param {string} path - 文件路径
 * @param {string} label - 名称
 * @returns {Promise<LocalRegionFile>} 区域数据
 */
export async function loadLocalRegion(
  path: string,
  label: string,
): Promise<LocalRegionFile> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`本地底图加载失败 HTTP ${response.status}`);
  }
  const collection = asCollection(await response.json());
  if (!collection) {
    throw new Error("本地底图格式不正确");
  }
  return { features: featuresOf(collection), label, level: "local" };
}
