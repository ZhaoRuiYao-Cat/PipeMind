"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Collapse from "@mui/material/Collapse";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Avatar from "@mui/material/Avatar";
import HelpOutlineRounded from "@mui/icons-material/HelpOutlineRounded";
import LogoutRounded from "@mui/icons-material/LogoutRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import { NotificationBell } from "@/components/notification-bell";
import { AppNavMenu } from "@/components/app-nav-menu";
import { GuidedTour } from "@/components/guided-tour";
import { GuideProgress } from "@/components/guide-progress";
import { UiActionExecutor } from "@/components/ui-action-executor";
import { useSession } from "@/lib/session";
import { API_BASE } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const { t } = useI18n();
  const pathname = usePathname();
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const avatarInitial = (user?.username ?? "P").charAt(0).toUpperCase();

  const handleHelpClick = (): void => {
    setGuideOpen(true);
  };

  const handleRefresh = (): void => {
    globalThis.location.reload();
  };

  const handleLogoutClick = (): void => {
    setConfirmingLogout(true);
  };

  const handleLogoutCancel = (): void => {
    setConfirmingLogout(false);
  };

  const handleLogoutConfirm = async (): Promise<void> => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      void 0;
    }
    globalThis.location.href = "/";
  };

  return (
    <Box
      sx={{
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--pm-color-page-bg)",
        position: "relative",
      }}
    >
      <AppNavMenu />
      <Box
        sx={{
          position: "fixed",
          left: { xs: "16px", sm: "32px" },
          bottom: "24px",
          zIndex: 1200,
          width: 40,
          height: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "50%",
          border: "1px solid var(--pm-color-border)",
          backgroundColor: "rgba(255, 255, 255, 0.72)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          boxShadow: "0 1px 2px rgb(16 24 40 / 0.06)",
        }}
      >
        <Tooltip title={t("guideAccess")} placement="right">
          <Button
            size="small"
            onClick={handleHelpClick}
            disableRipple
            aria-label={t("help")}
            sx={{
              flexShrink: 0,
              minWidth: 0,
              width: 32,
              height: 32,
              p: 0,
              borderRadius: 999,
              color: "var(--pm-color-text-secondary)",
              "&:hover": {
                backgroundColor: "var(--pm-color-primary-soft)",
                color: "var(--pm-color-primary)",
              },
            }}
          >
            <HelpOutlineRounded sx={{ fontSize: 18 }} />
          </Button>
        </Tooltip>
      </Box>
      <Box
        component="header"
        sx={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1300,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          pt: 1.5,
          px: { xs: 2, sm: 4 },
          pointerEvents: "none",
        }}
      >
        <Box
          component="img"
          src="/favicon.svg"
          alt="PipeMind"
          sx={{
            height: 26,
            width: "auto",
            display: "block",
            flexShrink: 0,
            pointerEvents: "auto",
          }}
        />
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            columnGap: 1.5,
            flexShrink: 0,
            pointerEvents: "auto",
          }}
        >
          <NotificationBell />
          <Stack
            direction="row"
            sx={{
              alignItems: "center",
              height: 40,
              px: 0.5,
              borderRadius: 12,
              border: "1px solid var(--pm-color-border)",
              backgroundColor: "var(--pm-color-surface)",
              boxShadow: "0 1px 2px rgb(16 24 40 / 0.06)",
              flexShrink: 0,
            }}
          >
            <Avatar
              sx={{
                width: 32,
                height: 32,
                fontSize: 14,
                fontWeight: 600,
                backgroundColor: "var(--pm-color-primary-soft)",
                color: "var(--pm-color-primary)",
              }}
            >
              {avatarInitial}
            </Avatar>
          </Stack>
          <Stack
            direction="row"
            sx={{
              alignItems: "center",
              px: 0.5,
              py: 0.5,
              height: 40,
              borderRadius: 12,
              border: "1px solid var(--pm-color-border)",
              backgroundColor: "var(--pm-color-surface)",
              boxShadow: "0 1px 2px rgb(16 24 40 / 0.06)",
              flexShrink: 0,
              overflow: "hidden",
            }}
          >
            <Collapse
              in={!confirmingLogout}
              orientation="horizontal"
              timeout={{ enter: 200, exit: 180 }}
              sx={{ display: "flex" }}
            >
              <Stack
                direction="row"
                spacing={0.25}
                sx={{ alignItems: "center", height: 32 }}
              >
                <Button
                  size="small"
                  onClick={handleRefresh}
                  disableRipple
                  sx={{
                    flexShrink: 0,
                    minWidth: 0,
                    width: 32,
                    height: 32,
                    p: 0,
                    borderRadius: 10,
                    color: "var(--pm-color-text-secondary)",
                    "&:hover": {
                      backgroundColor: "var(--pm-color-primary-soft)",
                      color: "var(--pm-color-primary)",
                    },
                  }}
                >
                  <RefreshRounded sx={{ fontSize: 18 }} />
                </Button>
                <Box
                  sx={{
                    width: 1,
                    height: 16,
                    backgroundColor: "var(--pm-color-divider)",
                  }}
                />
                <Button
                  size="small"
                  onClick={handleLogoutClick}
                  disableRipple
                  sx={{
                    flexShrink: 0,
                    minWidth: 0,
                    width: 32,
                    height: 32,
                    p: 0,
                    borderRadius: 10,
                    color: "var(--pm-color-text-secondary)",
                    "&:hover": {
                      backgroundColor: "var(--pm-color-primary-soft)",
                      color: "var(--pm-color-primary)",
                    },
                  }}
                >
                  <LogoutRounded sx={{ fontSize: 18 }} />
                </Button>
              </Stack>
            </Collapse>
            <Collapse
              in={confirmingLogout}
              orientation="horizontal"
              timeout={{ enter: 200, exit: 180 }}
              sx={{ display: "flex" }}
            >
              <Stack
                direction="row"
                spacing={0.25}
                sx={{ alignItems: "center", height: 32 }}
              >
                <Button
                  size="small"
                  onClick={handleLogoutCancel}
                  disableRipple
                  sx={{
                    flexShrink: 0,
                    minWidth: 0,
                    height: 32,
                    px: 1.5,
                    borderRadius: 10,
                    textTransform: "none",
                    fontSize: 13,
                    whiteSpace: "nowrap",
                    color: "var(--pm-color-text-secondary)",
                    "&:hover": {
                      backgroundColor: "var(--pm-color-primary-soft)",
                      color: "var(--pm-color-primary)",
                    },
                  }}
                >
                  {t("btnCancel")}
                </Button>
                <Button
                  size="small"
                  onClick={handleLogoutConfirm}
                  disableRipple
                  sx={{
                    flexShrink: 0,
                    minWidth: 0,
                    height: 32,
                    px: 1.5,
                    borderRadius: 10,
                    textTransform: "none",
                    fontSize: 13,
                    whiteSpace: "nowrap",
                    color: "var(--pm-color-primary)",
                    "&:hover": {
                      backgroundColor: "var(--pm-color-primary-soft)",
                    },
                  }}
                >
                  {t("logout")}
                </Button>
              </Stack>
            </Collapse>
          </Stack>
        </Box>
      </Box>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </Box>

      <GuideProgress />

      <UiActionExecutor />

      <GuidedTour
        open={guideOpen}
        path={pathname}
        onClose={() => setGuideOpen(false)}
      />
    </Box>
  );
}
