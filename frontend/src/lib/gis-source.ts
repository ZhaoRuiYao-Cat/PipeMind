"use client";

import { API_BASE } from "./api";

export interface ActiveGisSource {
  kind: "file" | "api";
  id: number;
  name: string;
  url?: string;
  token?: string;
}

export const GIS_ACTIVE_EVENT = "pm-gis-active-changed";

function readJson<T>(key: string): T | null {
  try {
    const raw = globalThis.localStorage.getItem(key);
    if (raw === null) {
      return null;
    }
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * 读取当前激活的 GIS 数据源。
 * @returns {ActiveGisSource | null} 当前激活数据源
 */
export function readActiveGisSource(): ActiveGisSource | null {
  const kind = readJson<string>("pm_gis_active_kind");
  if (kind === "api") {
    const pickedId = readJson<number>("pm_gis_api_picked");
    const sources = readJson<Array<{ id: number; name: string; url: string; token?: string }>>(
      "pm_gis_api_sources",
    );
    if (pickedId === null || !Array.isArray(sources)) {
      return null;
    }
    const found = sources.find((source) => source.id === pickedId);
    if (!found) {
      return null;
    }
    return {
      kind: "api",
      id: found.id,
      name: found.name,
      url: found.url,
      token: found.token,
    };
  }
  const file = readJson<{ id: number; name: string }>("pm_gis_source_file");
  if (!file) {
    return null;
  }
  return { kind: "file", id: file.id, name: file.name };
}

/**
 * 获取 GIS 数据源内容并返回解析后的对象。
 * @param {ActiveGisSource} source - 数据源
 * @returns {Promise<unknown>} GeoJSON 对象
 */
export async function fetchGisSourceContent(
  source: ActiveGisSource,
): Promise<unknown> {
  if (source.kind === "api") {
    if (!source.url) {
      throw new Error("API 数据源缺少地址");
    }
    const headers: Record<string, string> = {};
    if (source.token) {
      headers.Authorization = `Bearer ${source.token}`;
    }
    const response = await fetch(source.url, { headers });
    if (!response.ok) {
      throw new Error(`数据源请求失败 HTTP ${response.status}`);
    }
    return (await response.json()) as unknown;
  }
  const response = await fetch(
    `${API_BASE}/data-files/${source.id}/content`,
    { credentials: "include" },
  );
  if (!response.ok) {
    throw new Error(`自建文件下载失败 HTTP ${response.status}`);
  }
  return (await response.json()) as unknown;
}

export function listenGisActiveChange(listener: () => void): () => void {
  const handler = (): void => {
    listener();
  };
  globalThis.addEventListener(GIS_ACTIVE_EVENT, handler);
  return () => {
    globalThis.removeEventListener(GIS_ACTIVE_EVENT, handler);
  };
}

export function dispatchGisActiveChange(): void {
  globalThis.dispatchEvent(new Event(GIS_ACTIVE_EVENT));
}
