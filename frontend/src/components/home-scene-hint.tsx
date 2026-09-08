"use client";

import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import OpenWithRounded from "@mui/icons-material/OpenWithRounded";
import ZoomInRounded from "@mui/icons-material/ZoomInRounded";
import CenterFocusStrongRounded from "@mui/icons-material/CenterFocusStrongRounded";
import { useI18n } from "@/lib/i18n";

interface HintRow {
  icon: ReactNode;
  keyLabel: string;
  action: string;
}

export function HomeSceneHint() {
  const { lang } = useI18n();
  const zh = lang === "zh-CN";

  const rows: HintRow[] = zh
    ? [
        {
          icon: <OpenWithRounded sx={{ fontSize: 17 }} />,
          keyLabel: "左键拖拽",
          action: "平移图纸",
        },
        {
          icon: <ZoomInRounded sx={{ fontSize: 17 }} />,
          keyLabel: "滚轮",
          action: "缩放",
        },
        {
          icon: <CenterFocusStrongRounded sx={{ fontSize: 17 }} />,
          keyLabel: "双击",
          action: "适配全部",
        },
      ]
    : [
        {
          icon: <OpenWithRounded sx={{ fontSize: 17 }} />,
          keyLabel: "Drag left button",
          action: "Pan sheet",
        },
        {
          icon: <ZoomInRounded sx={{ fontSize: 17 }} />,
          keyLabel: "Wheel",
          action: "Zoom",
        },
        {
          icon: <CenterFocusStrongRounded sx={{ fontSize: 17 }} />,
          keyLabel: "Double click",
          action: "Fit all",
        },
      ];

  return (
    <Box
      sx={{
        position: "absolute",
        right: { xs: 16, sm: 28 },
        bottom: { xs: 16, sm: 28 },
        zIndex: 2,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        rowGap: 0.75,
        pointerEvents: "none",
      }}
    >
      {rows.map((row, index) => (
        <Paper
          key={index}
          elevation={0}
          variant="outlined"
          sx={{
            display: "flex",
            alignItems: "center",
            columnGap: 1,
            px: 1.75,
            py: 0.75,
            borderRadius: "999px",
            borderColor: "var(--pm-color-border)",
            backgroundColor: "rgba(255, 255, 255, 0.82)",
            backdropFilter: "blur(14px) saturate(150%)",
            WebkitBackdropFilter: "blur(14px) saturate(150%)",
            boxShadow: "0 2px 6px rgb(16 24 40 / 0.05)",
            whiteSpace: "nowrap",
            color: "var(--pm-color-text-secondary)",
          }}
        >
          {row.icon}
          <Stack direction="row" sx={{ alignItems: "baseline", columnGap: 0.75 }}>
            <Typography
              sx={{
                fontSize: 12,
                color: "var(--pm-color-text-hint)",
              }}
            >
              {row.keyLabel}
            </Typography>
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--pm-color-text-secondary)",
              }}
            >
              {row.action}
            </Typography>
          </Stack>
        </Paper>
      ))}
    </Box>
  );
}
