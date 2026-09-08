"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { keyframes } from "@mui/material/styles";
import { useI18n } from "@/lib/i18n";
import { API_BASE } from "@/lib/api";

interface GuideStep {
  selector: string;
  titleKey: string;
  bodyKey: string;
  requires?: string;
}

const HOME_STEPS: GuideStep[] = [
  {
    selector: '[data-guide="home-thinking"]',
    titleKey: "gHomeThinkingTitle",
    bodyKey: "gHomeThinkingBody",
    requires: "deepThinking",
  },
  {
    selector: '[data-guide="home-search"]',
    titleKey: "gHomeSearchTitle",
    bodyKey: "gHomeSearchBody",
    requires: "webSearch",
  },
  {
    selector: '[data-guide="home-input"]',
    titleKey: "gHomeInputTitle",
    bodyKey: "gHomeInputBody",
  },
  {
    selector: '[data-guide="home-send"]',
    titleKey: "gHomeSendTitle",
    bodyKey: "gHomeSendBody",
  },
];

const FLOW_STEPS: GuideStep[] = [
  {
    selector: '[data-guide="flow-canvas"]',
    titleKey: "gFlowCanvasTitle",
    bodyKey: "gFlowCanvasBody",
  },
  {
    selector: '[data-guide="flow-toolbar"]',
    titleKey: "gFlowToolsTitle",
    bodyKey: "gFlowToolsBody",
  },
  {
    selector: '[data-guide="flow-minimap"]',
    titleKey: "gFlowMinimapTitle",
    bodyKey: "gFlowMinimapBody",
  },
];

const SETTINGS_STEPS: GuideStep[] = [
  {
    selector: '[data-guide="settings-account"]',
    titleKey: "gSettingsAccountTitle",
    bodyKey: "gSettingsAccountBody",
  },
  {
    selector: '[data-guide="settings-security"]',
    titleKey: "gSettingsSecurityTitle",
    bodyKey: "gSettingsSecurityBody",
  },
  {
    selector: '[data-guide="settings-sessions"]',
    titleKey: "gSettingsSessionsTitle",
    bodyKey: "gSettingsSessionsBody",
  },
  {
    selector: '[data-guide="settings-ai"]',
    titleKey: "gSettingsAiTitle",
    bodyKey: "gSettingsAiBody",
  },
];

const MCP_STEPS: GuideStep[] = [
  {
    selector: '[data-guide="mcp-status"]',
    titleKey: "gMcpStatusTitle",
    bodyKey: "gMcpStatusBody",
  },
  {
    selector: '[data-guide="mcp-groups"]',
    titleKey: "gMcpGroupsTitle",
    bodyKey: "gMcpGroupsBody",
  },
];

const DATA_STEPS: GuideStep[] = [
  {
    selector: '[data-guide="data-upload-card"]',
    titleKey: "gDataUploadTitle",
    bodyKey: "gDataUploadBody",
  },
  {
    selector: '[data-guide="data-mine-section"]',
    titleKey: "gDataMineTitle",
    bodyKey: "gDataMineBody",
  },
  {
    selector: '[data-guide="data-shared-section"]',
    titleKey: "gDataSharedTitle",
    bodyKey: "gDataSharedBody",
  },
];

const STEP_BY_PATH: Record<string, GuideStep[]> = {
  "/home": HOME_STEPS,
  "/agent": FLOW_STEPS,
  "/settings": SETTINGS_STEPS,
  "/mcp": MCP_STEPS,
  "/data": DATA_STEPS,
};

const guideCardIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(18px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
`;

const guideCardOut = keyframes`
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  to {
    opacity: 0;
    transform: translateY(12px) scale(0.98);
  }
`;

const guideBackdropOut = keyframes`
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
`;

interface GuideRect {
  left: number;
  top: number;
  width: number;
  height: number;
  visible: boolean;
}

export function GuidedTour({
  open,
  path,
  onClose,
}: {
  open: boolean;
  path: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const isHome = path === "/home";
  const [homeCapabilities, setHomeCapabilities] = useState<string[] | null>(
    null,
  );

  useEffect(() => {
    if (!isHome || !open) {
      return;
    }
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const response = await fetch(`${API_BASE}/ai/providers`, {
          credentials: "include",
        });
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as {
          providers?: Array<{ active?: boolean; capabilities?: string[] }>;
        };
        const active = (data.providers ?? []).find((p) => p.active);
        if (!cancelled) {
          setHomeCapabilities(active?.capabilities ?? []);
        }
      } catch {
        if (!cancelled) {
          setHomeCapabilities([]);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [isHome, open]);

  const capabilityLoading = isHome && open && homeCapabilities === null;
  const steps = useMemo(() => {
    const baseSteps = STEP_BY_PATH[path] ?? HOME_STEPS;
    if (capabilityLoading) {
      return [];
    }
    if (!isHome) {
      return baseSteps;
    }
    return baseSteps.filter(
      (step) =>
        !step.requires || (homeCapabilities ?? []).includes(step.requires),
    );
  }, [capabilityLoading, isHome, path, homeCapabilities]);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<GuideRect>({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    visible: false,
  });
  const [exiting, setExiting] = useState(false);
  const indexRef = useRef(0);
  const closeTimer = useRef(0);
  const measureRef = useRef<() => void>(() => {
    void 0;
  });
  const step = steps[index] ?? steps[0];
  const isLast = index >= steps.length - 1;

  const updateIndex = (next: number): void => {
    indexRef.current = next;
    setIndex(next);
  };

  const measure = useCallback((): void => {
    const current = steps[indexRef.current] ?? steps[0];
    if (!current) {
      setRect((value) => ({ ...value, visible: false }));
      return;
    }
    const element = document.querySelector<HTMLElement>(current.selector);
    if (!element) {
      setRect((value) => ({ ...value, visible: false }));
      return;
    }
    const bounds = element.getBoundingClientRect();
    setRect({
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
      visible: bounds.width > 0 && bounds.height > 0,
    });
  }, [steps]);

  useEffect(() => {
    measureRef.current = measure;
  }, [measure]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    updateIndex(0);
    setExiting(false);
    const frame = requestAnimationFrame(() => measureRef.current());
    const remeasure = (): void => measureRef.current();
    document.addEventListener("scroll", remeasure, true);
    window.addEventListener("resize", remeasure);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("scroll", remeasure, true);
      window.removeEventListener("resize", remeasure);
    };
  }, [open, capabilityLoading]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Escape" && !exiting) {
        setExiting(true);
        closeTimer.current = window.setTimeout(() => {
          onClose();
        }, 220);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [open, exiting, onClose]);

  useEffect(() => {
    if (!open || capabilityLoading) {
      return;
    }
    if (indexRef.current >= steps.length) {
      const next = Math.max(0, steps.length - 1);
      indexRef.current = next;
      setIndex(next);
      requestAnimationFrame(() => measure());
    }
  }, [steps, open, capabilityLoading, measure]);

  useEffect(() => {
    return () => {
      if (closeTimer.current) {
        window.clearTimeout(closeTimer.current);
      }
    };
  }, []);

  if (!open) {
    return null;
  }

  if (capabilityLoading) {
    return (
      <Box
        sx={{
          position: "fixed",
          inset: 0,
          zIndex: 2100,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <Paper
          elevation={0}
          sx={{
            pointerEvents: "auto",
            zIndex: 2102,
            px: 3,
            py: 2,
            borderRadius: "16px",
            border: "1px solid var(--pm-color-border)",
            backgroundColor: "rgba(255, 255, 255, 0.92)",
            boxShadow: "0 16px 48px rgb(16 24 40 / 0.16)",
          }}
        >
          <Typography
            sx={{
              fontSize: 14,
              color: "var(--pm-color-text-secondary)",
            }}
          >
            {t("guideLoading")}
          </Typography>
        </Paper>
      </Box>
    );
  }

  const requestClose = (): void => {
    if (exiting) {
      return;
    }
    setExiting(true);
    closeTimer.current = window.setTimeout(() => {
      onClose();
    }, 220);
  };

  const goNext = (): void => {
    if (isLast) {
      requestClose();
      return;
    }
    updateIndex(index + 1);
    requestAnimationFrame(() => measure());
  };

  const goPrev = (): void => {
    updateIndex(Math.max(0, index - 1));
    requestAnimationFrame(() => measure());
  };

  const cardOnTop = rect.visible && rect.top > window.innerHeight * 0.55;

  return (
    <Box
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: 2100,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: cardOnTop ? "flex-start" : "flex-end",
        pointerEvents: "none",
      }}
    >
      {rect.visible && (
        <Box
          sx={{
            position: "fixed",
            left: 0,
            top: 0,
            width: rect.width,
            height: rect.height,
            borderRadius: 2,
            pointerEvents: "none",
            zIndex: 2101,
            transform: `translate3d(${rect.left}px, ${rect.top}px, 0)`,
            willChange: "transform",
            transition: "transform 180ms cubic-bezier(0.22, 0.61, 0.36, 1)",
            animation: exiting ? `${guideBackdropOut} 180ms ease both` : "none",
            boxShadow: "0 0 0 9999px rgba(16, 24, 40, 0.42)",
            "&::after": {
              content: '""',
              position: "absolute",
              inset: -2,
              borderRadius: "10px",
              border: "2px solid var(--pm-color-primary)",
              pointerEvents: "none",
            },
          }}
        />
      )}
      <Paper
        elevation={0}
        sx={{
          pointerEvents: "auto",
          zIndex: 2102,
          m: 3,
          width: 440,
          maxWidth: "calc(100vw - 48px)",
          borderRadius: "16px",
          border: "1px solid var(--pm-color-border)",
          backgroundColor: "rgba(255, 255, 255, 0.9)",
          backdropFilter: "blur(18px) saturate(160%)",
          WebkitBackdropFilter: "blur(18px) saturate(160%)",
          boxShadow: "0 16px 48px rgb(16 24 40 / 0.16)",
          overflow: "hidden",
          transformOrigin: cardOnTop ? "top center" : "bottom center",
          animation: exiting
            ? `${guideCardOut} 200ms ease both`
            : `${guideCardIn} 260ms cubic-bezier(0.22, 0.61, 0.36, 1) both`,
        }}
      >
        <Box sx={{ px: 2.5, pt: 2, pb: 1.5 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Typography
              sx={{
                flex: 1,
                fontSize: 16,
                fontWeight: 600,
                color: "var(--pm-color-text-primary)",
              }}
            >
              {t(step.titleKey)}
            </Typography>
            <Typography
              sx={{
                fontSize: 12,
                color: "var(--pm-color-text-hint)",
              }}
            >
              {index + 1} / {steps.length}
            </Typography>
          </Stack>
          <Typography
            sx={{
              mt: 1,
              fontSize: 13,
              lineHeight: 1.7,
              color: "var(--pm-color-text-secondary)",
            }}
          >
            {t(step.bodyKey)}
          </Typography>
        </Box>
        <Stack
          direction="row"
          sx={{
            justifyContent: "space-between",
            alignItems: "center",
            px: 2.5,
            pb: 1.75,
          }}
        >
          <Button
            variant="outlined"
            size="small"
            onClick={requestClose}
            sx={{
              minWidth: 72,
              borderRadius: "999px",
              textTransform: "none",
              color: "var(--pm-color-text-secondary)",
              borderColor: "var(--pm-color-border)",
              "&:hover": {
                backgroundColor: "#f2f3f5",
                borderColor: "var(--pm-color-border-strong)",
              },
            }}
          >
            {t("guideSkip")}
          </Button>
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              size="small"
              disabled={index === 0}
              onClick={goPrev}
              sx={{
                minWidth: 84,
                borderRadius: "999px",
                textTransform: "none",
                color: "var(--pm-color-primary)",
              }}
            >
              {t("guidePrev")}
            </Button>
            <Button
              variant="contained"
              size="small"
              disableElevation
              onClick={goNext}
              sx={{
                minWidth: 84,
                borderRadius: "999px",
                textTransform: "none",
                color: "var(--pm-color-primary-contrast)",
                backgroundColor: "var(--pm-color-primary)",
                "&:hover": {
                  backgroundColor: "var(--pm-color-primary-hover)",
                },
              }}
            >
              {isLast ? t("guideDone") : t("guideNext")}
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}
