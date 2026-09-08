export interface Meta {
  name: string;
  installed: boolean;
  running: boolean;
  backendRunning: boolean;
  frontendRunning: boolean;
  uiPort: number;
  defaultBackendPort: number;
  defaultFrontendPort: number;
  steps: { key: string; label: string; labelEn: string }[];
  pids: { backend: number | null; frontend: number | null };
}

export interface CheckItem {
  key: string;
  label: string;
  ok: boolean;
  message: string;
  severity: "ok" | "warning" | "error";
}

export interface Checks {
  ok: boolean;
  errors: number;
  warnings: number;
  items: CheckItem[];
  summary: string;
}

export interface StepState {
  key: string;
  label: string;
  labelEn: string;
  state: "pending" | "running" | "done" | "error" | "skipped";
}

export interface JobSnapshot {
  id: string;
  status: "queued" | "running" | "paused" | "done" | "error" | "cancelled";
  paused: boolean;
  error: string | null;
  current: number;
  steps: StepState[];
  percent: number;
  logs: { t: string; level: string; text: string }[];
}

export interface InstallOptions {
  db: { host: string; port: string; user: string; password: string; name: string };
  admin: { username: string; password: string };
  backendPort: string;
  frontendPort: string;
  frontendOrigin: string;
  dbSync?: boolean;
  cookieSecure?: boolean;
  accessTtl?: string;
  refreshTtl?: string;
  rememberTtl?: string;
  rsaPrivatePem?: string;
  rsaPublicPem?: string;
  rsaRegenerate?: boolean;
}

export interface ActiveJobResult {
  active: boolean;
  job: JobSnapshot | null;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body.error ?? "";
    } catch {
      /* ignore */
    }
    throw new Error(`${res.status} ${detail}`.trim());
  }
  return res.json() as Promise<T>;
}

export const api = {
  meta: () => fetchJson<Meta>("/api/meta"),
  check: () => fetchJson<Checks>("/api/check"),
  config: () => fetchJson<{ backendEnv: Record<string, string> }>("/api/config"),
  install: (opts: InstallOptions) =>
    fetchJson<{ id: string }>("/api/install", { method: "POST", body: JSON.stringify(opts) }),
  job: (id: string) => fetchJson<JobSnapshot>(`/api/jobs/${id}`),
  active: () => fetchJson<ActiveJobResult>("/api/install/active"),
  pause: (id: string) => fetchJson<JobSnapshot>(`/api/jobs/${id}/pause`, { method: "POST", body: "{}" }),
  resume: (id: string) => fetchJson<JobSnapshot>(`/api/jobs/${id}/resume`, { method: "POST", body: "{}" }),
  start: (opts: { backendPort?: string; frontendPort?: string }) =>
    fetchJson<{
      ok: boolean;
      message?: string;
      backendReady?: boolean;
      frontendReady?: boolean;
      backendRunning?: boolean;
      frontendRunning?: boolean;
      urls?: { backend: string; frontend: string };
    }>("/api/start", { method: "POST", body: JSON.stringify(opts) }),
  stop: () => fetchJson<{ ok: boolean }>("/api/stop", { method: "POST", body: "{}" }),
  reset: () =>
    fetchJson<{ ok: boolean; cancelled: boolean; installed: boolean }>("/api/reset", { method: "POST", body: "{}" }),
};
