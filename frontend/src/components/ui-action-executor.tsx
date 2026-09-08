"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { API_BASE } from "@/lib/api";
import { notifyDataChanged } from "@/lib/data-events";

interface PendingUiAction {
  id: number;
  action: string;
  params: Record<string, string | number>;
}

const ALLOWED_PATHS = new Set(["/home", "/agent", "/settings", "/mcp", "/data"]);

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });

function findScrollContainers(): HTMLElement[] {
  const all = Array.from(document.querySelectorAll<HTMLElement>("*"));
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  return all
    .filter((el) => {
      const style = window.getComputedStyle(el);
      const overflowY = style.overflowY;
      if (overflowY !== "auto" && overflowY !== "scroll") {
        return false;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return false;
      }
      if (rect.top > viewportHeight || rect.bottom < 0) {
        return false;
      }
      return el.scrollHeight > el.clientHeight + 4;
    })
    .sort((a, b) => {
      const areaA = a.getBoundingClientRect().height;
      const areaB = b.getBoundingClientRect().height;
      return areaB - areaA;
    });
}

export function UiActionExecutor() {
  const router = useRouter();
  const runningRef = useRef(false);

  const resolveAction = async (
    id: number,
    status: "done" | "failed",
    message?: string,
  ): Promise<void> => {
    try {
      await fetch(`${API_BASE}/ui/actions/${id}/resolve`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, message }),
      });
    } catch {
      void 0;
    }
  };

  const runAction = async (action: PendingUiAction): Promise<void> => {
    try {
      if (action.action === "navigate") {
        const path = String(action.params.path ?? "");
        if (!ALLOWED_PATHS.has(path)) {
          await resolveAction(action.id, "failed", "目标页面不在允许范围");
          return;
        }
        router.push(path);
        await sleep(700);
        await resolveAction(action.id, "done");
        return;
      }
      if (action.action === "scroll") {
        const position = String(action.params.position ?? "") === "top" ? "top" : "bottom";
        const containers = findScrollContainers();
        if (containers.length > 0) {
          const main = containers[0];
          main.scrollTo({
            top: position === "top" ? 0 : main.scrollHeight,
            behavior: "smooth",
          });
        } else {
          globalThis.scrollTo({
            top:
              position === "top"
                ? 0
                : document.documentElement.scrollHeight,
            behavior: "smooth",
          });
        }
        await sleep(600);
        await resolveAction(action.id, "done");
        return;
      }
      if (action.action === "click") {
        const guide = action.params.guide ?? "";
        const target = document.querySelector<HTMLElement>(
          `[data-guide="${CSS.escape(String(guide))}"]`,
        );
        if (!target) {
          await resolveAction(action.id, "failed", `未找到元素：${guide}`);
          return;
        }
        target.click();
        await sleep(400);
        await resolveAction(action.id, "done");
        return;
      }
      if (action.action === "gis_focus") {
        const fileId = Number(action.params.fileId ?? 0);
        const code = String(action.params.code ?? "");
        const minLon = Number(action.params.minLon ?? 0);
        const maxLon = Number(action.params.maxLon ?? 0);
        const minLat = Number(action.params.minLat ?? 0);
        const maxLat = Number(action.params.maxLat ?? 0);
        if (
          !Number.isFinite(fileId) ||
          !Number.isFinite(minLon) ||
          !Number.isFinite(maxLon) ||
          !Number.isFinite(minLat) ||
          !Number.isFinite(maxLat) ||
          maxLon <= minLon ||
          maxLat <= minLat
        ) {
          await resolveAction(action.id, "failed", "定位参数无效");
          return;
        }
        window.dispatchEvent(
          new CustomEvent("pm-gis-focus", {
            detail: { fileId, code, minLon, maxLon, minLat, maxLat },
          }),
        );
        await sleep(700);
        await resolveAction(action.id, "done");
        return;
      }
      await resolveAction(action.id, "failed", "未知指令类型");
    } catch {
      await resolveAction(action.id, "failed", "指令执行异常");
    }
  };

  const pollOnce = async (): Promise<void> => {
    if (runningRef.current) {
      return;
    }
    runningRef.current = true;
    try {
      const response = await fetch(`${API_BASE}/ui/actions/pending`, {
        credentials: "include",
      });
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as {
        actions?: PendingUiAction[];
      };
      const pending = data.actions ?? [];
      if (pending.length === 0) {
        return;
      }
      for (const action of pending) {
        await runAction(action);
        notifyDataChanged();
        await sleep(300);
      }
    } catch {
      void 0;
    } finally {
      runningRef.current = false;
    }
  };

  useEffect(() => {
    const timer = globalThis.setInterval(() => {
      void pollOnce();
    }, 900);
    void pollOnce();
    return () => {
      globalThis.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
