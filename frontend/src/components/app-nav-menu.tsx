"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Collapse from "@mui/material/Collapse";
import Typography from "@mui/material/Typography";
import HomeRounded from "@mui/icons-material/HomeRounded";
import SettingsRounded from "@mui/icons-material/SettingsRounded";
import AutoAwesomeRounded from "@mui/icons-material/AutoAwesomeRounded";
import HubOutlined from "@mui/icons-material/HubOutlined";
import FolderSharedRounded from "@mui/icons-material/FolderSharedRounded";
import SmartToyRounded from "@mui/icons-material/SmartToyRounded";
import ApiRounded from "@mui/icons-material/ApiRounded";
import ReportProblemRounded from "@mui/icons-material/ReportProblemRounded";
import { useI18n } from "@/lib/i18n";

interface NavEntry {
  key: string;
  path: string;
  textKey: string;
  icon: ReactNode;
}

const NAV_ENTRIES: NavEntry[] = [
  {
    key: "home",
    path: "/home",
    textKey: "navHome",
    icon: <HomeRounded sx={{ fontSize: 20 }} />,
  },
  {
    key: "devices",
    path: "/devices",
    textKey: "navDevices",
    icon: <SmartToyRounded sx={{ fontSize: 20 }} />,
  },
  {
    key: "agent",
    path: "/agent",
    textKey: "navAgent",
    icon: <AutoAwesomeRounded sx={{ fontSize: 20 }} />,
  },
  {
    key: "mcp",
    path: "/mcp",
    textKey: "navMcp",
    icon: <HubOutlined sx={{ fontSize: 20 }} />,
  },
  {
    key: "data",
    path: "/data",
    textKey: "navData",
    icon: <FolderSharedRounded sx={{ fontSize: 20 }} />,
  },
  {
    key: "api",
    path: "/api-docs",
    textKey: "navApi",
    icon: <ApiRounded sx={{ fontSize: 20 }} />,
  },
  {
    key: "defects",
    path: "/defects",
    textKey: "navDefects",
    icon: <ReportProblemRounded sx={{ fontSize: 20 }} />,
  },
  {
    key: "settings",
    path: "/settings",
    textKey: "navSettings",
    icon: <SettingsRounded sx={{ fontSize: 20 }} />,
  },
];

export function AppNavMenu() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  return (
    <Box
      onMouseLeave={() => setHoverKey(null)}
      sx={{
        position: "fixed",
        left: { xs: 6, sm: 22 },
        top: "50%",
        transform: "translateY(-50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        rowGap: 1,
        py: 0.5,
        width: "auto",
        zIndex: 1200,
      }}
    >
      {NAV_ENTRIES.map((entry) => {
        const active = pathname === entry.path;
        const hovered = hoverKey === entry.key;
        return (
          <Box
            key={entry.key}
            onMouseEnter={() => setHoverKey(entry.key)}
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              width: "auto",
            }}
          >
            <Button
              size="small"
              disableRipple
              data-guide={`nav-${entry.key}`}
              onClick={() => {
                if (!active) {
                  router.push(entry.path);
                }
              }}
              sx={{
                flexShrink: 0,
                minWidth: 0,
                width: 40,
                height: 40,
                p: 0,
                borderRadius: "999px",
                color: active
                  ? "var(--pm-color-primary)"
                  : "var(--pm-color-text-secondary)",
                backgroundColor: active
                  ? "var(--pm-color-primary-soft)"
                  : "transparent",
                transition:
                  "background-color 160ms ease, color 160ms ease",
                "&:hover": {
                  backgroundColor: active
                    ? "var(--pm-color-primary-soft)"
                    : "rgba(0, 0, 0, 0.04)",
                  color: active
                    ? "var(--pm-color-primary)"
                    : "var(--pm-color-text-secondary)",
                },
              }}
            >
              {entry.icon}
            </Button>
            <Collapse
              in={hovered}
              timeout={{ enter: 160, exit: 120 }}
              sx={{ width: "100%" }}
            >
              <Typography
                sx={{
                  mt: 0.5,
                  fontSize: 11,
                  textAlign: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: active
                    ? "var(--pm-color-primary)"
                    : "var(--pm-color-text-secondary)",
                  userSelect: "none",
                }}
              >
                {t(entry.textKey)}
              </Typography>
            </Collapse>
          </Box>
        );
      })}
    </Box>
  );
}
