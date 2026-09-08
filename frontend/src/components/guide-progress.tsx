"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { keyframes } from "@mui/material/styles";
import { usePathname } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import FlagRounded from "@mui/icons-material/FlagRounded";
import { API_BASE } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

const rippleKf = keyframes`
  0% {
    box-shadow: 0 0 0 2px rgb(22 100 255 / 0.55);
    opacity: 1;
  }
  100% {
    box-shadow: 0 0 0 14px rgb(22 100 255 / 0);
    opacity: 0;
  }
`;

interface GuideView {
  id: number;
  action: string;
  params: Record<string, string>;
  status: string;
}

interface GuideStep {
  text: string;
  target?: string;
  manual?: boolean;
}

const NAV_SETTINGS = '[data-guide="nav-settings"]';
const NAV_DATA = '[data-guide="nav-data"]';

const PROVIDER_LABEL: Record<string, string> = {
  openai: "OpenAI",
  deepseek: "DeepSeek",
  gemini: "Gemini",
  doubao: "Doubao",
};

interface FlowSpec {
  titleKey: string;
  steps: (params: Record<string, string>, zh: boolean) => GuideStep[];
}

const FLOW_SPECS: Record<string, FlowSpec> = {
  "account.change_username": {
    titleKey: "guideActionAccountChangeUsername",
    steps: (params, zh) => [
      {
        text: zh
          ? "在“账户设置”中点击“用户名”行"
          : "In Account, click the Username row",
        target: '[data-guide="settings-username-row"]',
      },
      {
        text: zh
          ? `输入新用户名：${params.username ?? ""}，然后点击“下一步”`
          : `Enter the new username: ${params.username ?? ""}, then click Next`,
        manual: true,
      },
      {
        text: zh
          ? "点击“保存”完成修改"
          : "Click Save to confirm",
        target: '[data-guide="settings-username-save"]',
      },
    ],
  },
  "account.change_password": {
    titleKey: "guideActionAccountChangePassword",
    steps: (_, zh) => [
      {
        text: zh
          ? "在“安全设置”中点击“登录密码”行"
          : "In Security, click the Password row",
        target: '[data-guide="settings-password-row"]',
      },
      {
        text: zh
          ? "填写原密码与新密码（确认一致），然后点击“下一步”"
          : "Fill the current and new passwords, then click Next",
        manual: true,
      },
      {
        text: zh
          ? "点击“确认修改”完成"
          : "Click Confirm to finish",
        target: '[data-guide="settings-password-save"]',
      },
    ],
  },
  "sessions.revoke": {
    titleKey: "guideActionSessionsRevoke",
    steps: (params, zh) => [
      {
        text: zh
          ? "在“登录设备”栏目找到目标设备，点击其对应的“下线”按钮"
          : "In Devices, click Sign out on the target device",
        target: `[data-guide="settings-session-signout-${params.id ?? ""}"]`,
      },
    ],
  },
  "sessions.revoke_others": {
    titleKey: "guideActionSessionsRevokeOthers",
    steps: (_, zh) => [
      {
        text: zh
          ? "在“登录设备”栏目点击“全部下线”"
          : "In Devices, click Sign out all",
        target: '[data-guide="settings-sessions-signout-all"]',
      },
    ],
  },
  "ai_providers.set_active": {
    titleKey: "guideActionAiSetActive",
    steps: (params, zh) => {
      const provider =
        PROVIDER_LABEL[params.key ?? ""] ?? params.key ?? "";
      return [
        {
          text: zh
            ? `在“AI 配置”栏目点击 ${provider} 的“设为系统使用”`
            : `In AI configuration, click Use as system AI on ${provider}`,
          target: `[data-guide="settings-ai-use-${params.key ?? ""}"]`,
        },
      ];
    },
  },
  "ai_providers.save": {
    titleKey: "guideActionAiSave",
    steps: (params, zh) => {
      const provider =
        PROVIDER_LABEL[params.key ?? ""] ?? params.key ?? "";
      return [
        {
          text: zh
            ? `在“AI 配置”栏目点击 ${provider} 的“配置”`
            : `In AI configuration, click Configure on ${provider}`,
          target: `[data-guide="settings-ai-edit-${params.key ?? ""}"]`,
        },
        {
          text: zh
            ? "填写服务地址 / 密钥，然后点击“下一步”"
            : "Fill the endpoint / key, then click Next",
          manual: true,
        },
        {
          text: zh
            ? "点击“保存配置”完成"
            : "Click Save to finish",
          target: `[data-guide="settings-ai-save-${params.key ?? ""}"]`,
        },
      ];
    },
  },
  "data_files.set_shared": {
    titleKey: "guideActionDataFileShared",
    steps: (params, zh) => {
      const turnOn =
        params.shared === "true" || String(params.shared ?? "") === "true";
      const fileLabel =
        (params.name as string | undefined)?.trim() ||
        `#${String(params.id ?? "")}`;
      return [
        {
          text: zh
            ? `在“我的文件”列表中找到文件「${fileLabel}」，点击其右侧共享开关，使共享状态变为「${turnOn ? "开启" : "关闭"}」，完成后点击“完成”`
            : `In My files, find the file "${fileLabel}" and click its share switch so sharing turns ${
                turnOn ? "on" : "off"
              }, then click Done`,
          target: `[data-guide="data-share-${params.id ?? ""}"]`,
          manual: true,
        },
      ];
    },
  },
  "data_files.remove": {
    titleKey: "guideActionDataFileRemove",
    steps: (params, zh) => {
      const fileLabel =
        (params.name as string | undefined)?.trim() ||
        `#${String(params.id ?? "")}`;
      return [
        {
          text: zh
            ? `在“我的文件”列表中找到文件「${fileLabel}」，点击其右侧删除按钮删除该文件，完成后点击“完成”`
            : `In My files, find the file "${fileLabel}", click its delete button to remove it, then click Done`,
          target: `[data-guide="data-delete-${params.id ?? ""}"]`,
          manual: true,
        },
      ];
    },
  },
};

const NEEDS_SETTINGS = (action: string): boolean =>
  action.startsWith("account.") ||
  action.startsWith("sessions.") ||
  action.startsWith("ai_providers.");

const NEEDS_DATA = (action: string): boolean =>
  action.startsWith("data_files.");

export function GuideProgress() {
  const { t, lang } = useI18n();
  const pathname = usePathname();
  const zh = lang === "zh-CN";
  const [guides, setGuides] = useState<GuideView[]>([]);
  const [indexes, setIndexes] = useState<Record<number, number>>({});

  const setIndex = useCallback((guideId: number, value: number): void => {
    setIndexes((current) => ({ ...current, [guideId]: value }));
  }, []);

  const completeGuide = useCallback(
    async (guideId: number): Promise<void> => {
      try {
        await fetch(`${API_BASE}/guides/${guideId}/complete`, {
          method: "POST",
          credentials: "include",
        });
      } catch {
        void 0;
      }
      setGuides((current) => current.filter((g) => g.id !== guideId));
    },
    [],
  );

  const loadGuides = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE}/guides/pending`, {
        credentials: "include",
      });
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as { guides?: GuideView[] };
      const next = data.guides ?? [];
      setGuides(next);
      setIndexes((current) => {
        const merged: Record<number, number> = {};
        for (const guide of next) {
          merged[guide.id] = current[guide.id] ?? 0;
        }
        return merged;
      });
    } catch {
      void 0;
    }
  }, []);

  useEffect(() => {
    void loadGuides();
    const timer = window.setInterval(() => {
      void loadGuides();
    }, 2000);
    return () => {
      window.clearInterval(timer);
    };
  }, [loadGuides]);

  useEffect(() => {
    const onClick = (event: globalThis.MouseEvent): void => {
      const targetEl = event.target as HTMLElement | null;
      if (!targetEl) {
        return;
      }
      for (const guide of guides) {
        const spec = FLOW_SPECS[guide.action];
        if (!spec) {
          continue;
        }
        const steps = spec.steps(guide.params ?? {}, zh);
        const index = indexes[guide.id] ?? 0;
        const step = steps[index];
        if (!step || step.manual || !step.target) {
          continue;
        }
        if (targetEl.closest(step.target)) {
          if (index >= steps.length - 1) {
            void completeGuide(guide.id);
          } else {
            setIndex(guide.id, index + 1);
          }
        }
      }
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
    };
  }, [guides, indexes, completeGuide, setIndex, zh]);

  if (guides.length === 0) {
    return null;
  }

  return (
    <Box
      sx={{
        position: "fixed",
        top: 64,
        right: { xs: 16, sm: 32 },
        zIndex: 1290,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        rowGap: 1.5,
        maxHeight: "calc(100dvh - 84px)",
        overflowY: "auto",
      }}
    >
      {guides.map((guide) => (
        <GuideCard
          key={guide.id}
          guide={guide}
          index={indexes[guide.id] ?? 0}
          onSetIndex={setIndex}
          onComplete={() => void completeGuide(guide.id)}
        />
      ))}
    </Box>
  );
}

function GuideCard({
  guide,
  index,
  onSetIndex,
  onComplete,
}: {
  guide: GuideView;
  index: number;
  onSetIndex: (guideId: number, value: number) => void;
  onComplete: () => void;
}) {
  const { t, lang } = useI18n();
  const pathname = usePathname();
  const zh = lang === "zh-CN";
  const spec = FLOW_SPECS[guide.action];

  const goToSettings = NEEDS_SETTINGS(guide.action) && pathname !== "/settings";
  const goToData = NEEDS_DATA(guide.action) && pathname !== "/data";
  const steps =
    goToSettings || goToData
      ? [
          {
            text: goToSettings
              ? zh
                ? "点击左侧菜单中的“设置”图标，进入设置页"
                : "Click the Settings icon in the left menu to open Settings"
              : zh
                ? "点击左侧菜单中的“数据”图标，进入数据页"
                : "Click the Data icon in the left menu to open Data",
            target: goToSettings ? NAV_SETTINGS : NAV_DATA,
          },
          ...(spec?.steps(guide.params ?? {}, zh) ?? []),
        ]
      : (spec?.steps(guide.params ?? {}, zh) ?? []);
  const current = steps[index] ?? steps[steps.length - 1];
  const isLast = index >= steps.length - 1;

  const [rect, setRect] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    radius: 12,
    visible: false,
  });
  const lastTargetRef = useRef("");

  const readRadius = (el: HTMLElement): number => {
    const raw = globalThis.getComputedStyle(el).borderRadius;
    const first = raw.split(/\s+/)[0] ?? "0px";
    if (first.endsWith("%")) {
      const pct = Number.parseFloat(first) || 0;
      const size = Math.min(
        el.getBoundingClientRect().width,
        el.getBoundingClientRect().height,
      );
      return Math.round((size * pct) / 100);
    }
    const px = Number.parseFloat(first);
    return Number.isFinite(px) ? px : 12;
  };

  useEffect(() => {
    if (!current?.target) {
      setRect((value) => ({ ...value, visible: false }));
      return;
    }
    let timer = 0;
    let stop = false;
    const loop = (): void => {
      if (stop) {
        return;
      }
      const el = document.querySelector<HTMLElement>(current.target ?? "");
      if (el) {
        const bounds = el.getBoundingClientRect();
        setRect({
          left: bounds.left,
          top: bounds.top,
          width: bounds.width,
          height: bounds.height,
          radius: readRadius(el),
          visible: bounds.width > 0 && bounds.height > 0,
        });
        if (lastTargetRef.current !== current.target) {
          lastTargetRef.current = current.target ?? "";
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      } else {
        lastTargetRef.current = current.target ?? "";
        setRect((value) => ({ ...value, visible: false }));
      }
      timer = window.setTimeout(loop, 400);
    };
    loop();
    return () => {
      stop = true;
      window.clearTimeout(timer);
      lastTargetRef.current = "";
      setRect((value) => ({ ...value, visible: false }));
    };
  }, [current?.target, current?.text]);

  if (!spec) {
    return null;
  }

  const goNext = (): void => {
    if (isLast) {
      onComplete();
      return;
    }
    onSetIndex(guide.id, index + 1);
  };

  const goPrev = (): void => {
    onSetIndex(guide.id, Math.max(0, index - 1));
  };

  return (
    <>
      {rect.visible && (
        <Box
          sx={{
            position: "fixed",
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            pointerEvents: "none",
            zIndex: 1289,
            overflow: "visible",
          }}
        >
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              borderRadius: `${rect.radius}px`,
              animation: `${rippleKf} 1.4s ease-out infinite`,
            }}
          />
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              borderRadius: `${rect.radius}px`,
              animation: `${rippleKf} 1.4s ease-out 0.7s infinite`,
            }}
          />
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              borderRadius: `${rect.radius}px`,
              boxShadow: "inset 0 0 0 1.5px var(--pm-color-primary)",
            }}
          />
        </Box>
      )}
      <Paper
        elevation={0}
        data-testid="guide-flow-card"
        sx={{
          width: 320,
          maxWidth: "88vw",
          borderRadius: "14px",
          border: "1px solid var(--pm-color-border)",
          backgroundColor: "#ffffff",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: "center",
          px: 2,
          py: 1.25,
          borderBottom: "1px solid var(--pm-color-divider)",
        }}
      >
        <FlagRounded
          sx={{ fontSize: 16, color: "var(--pm-color-primary)" }}
        />
        <Typography
          sx={{
            flex: 1,
            fontSize: 13,
            fontWeight: 600,
            color: "var(--pm-color-text-primary)",
          }}
        >
          {t(spec.titleKey)}
        </Typography>
        <Typography
          sx={{
            fontSize: 11,
            color: "var(--pm-color-text-hint)",
          }}
        >
          {index + 1} / {steps.length}
        </Typography>
      </Stack>
      <Box sx={{ px: 2, py: 1.25 }}>
        <Typography
          sx={{
            fontSize: 13,
            lineHeight: 1.7,
            color: "var(--pm-color-text-secondary)",
          }}
        >
          {current?.text ?? ""}
        </Typography>
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: "center", mt: 1.25 }}
        >
          {!isLast && (
            <Button
              variant="outlined"
              size="small"
              onClick={onComplete}
              startIcon={<CheckCircleRounded sx={{ fontSize: 15 }} />}
              sx={{
                borderRadius: "999px",
                textTransform: "none",
                fontSize: 12,
                color: "#2e9e5b",
                borderColor: "rgba(46, 158, 91, 0.4)",
              }}
            >
              {t("guideCompleteNow")}
            </Button>
          )}
          <Box sx={{ flex: 1 }} />
          {index > 0 && (
            <Button
              variant="outlined"
              size="small"
              onClick={goPrev}
              sx={{
                borderRadius: "999px",
                textTransform: "none",
                fontSize: 12,
                color: "var(--pm-color-primary)",
              }}
            >
              {t("guidePrev")}
            </Button>
          )}
          {!isLast ? (
            <Button
              variant="contained"
              size="small"
              disableElevation
              onClick={goNext}
              sx={{
                borderRadius: "999px",
                textTransform: "none",
                fontSize: 12,
                color: "var(--pm-color-primary-contrast)",
                backgroundColor: "var(--pm-color-primary)",
                "&:hover": {
                  backgroundColor: "var(--pm-color-primary-hover)",
                },
              }}
            >
              {t("guideNext")}
            </Button>
          ) : (
            <Button
              variant="contained"
              size="small"
              disableElevation
              onClick={onComplete}
              sx={{
                borderRadius: "999px",
                textTransform: "none",
                fontSize: 12,
                color: "var(--pm-color-primary-contrast)",
                backgroundColor: "var(--pm-color-primary)",
                "&:hover": {
                  backgroundColor: "var(--pm-color-primary-hover)",
                },
              }}
            >
              {t("guideDone")}
            </Button>
          )}
        </Stack>
      </Box>
      </Paper>
    </>
  );
}
