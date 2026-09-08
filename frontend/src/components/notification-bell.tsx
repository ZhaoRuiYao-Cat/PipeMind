"use client";

import { forwardRef, useCallback, useEffect, useState } from "react";
import type { MouseEvent } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Badge from "@mui/material/Badge";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import Grow from "@mui/material/Grow";
import type { GrowProps } from "@mui/material/Grow";
import IconButton from "@mui/material/IconButton";
import NotificationsOutlined from "@mui/icons-material/NotificationsOutlined";
import Popover from "@mui/material/Popover";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { API_BASE } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { onDataChanged } from "@/lib/data-events";

interface NoticeItem {
  id: number;
  type: string;
  title: string;
  content: string;
  isRead: boolean;
  createdAt: string;
}

const TYPE_KEY: Record<string, string> = {
  login: "typeLogin",
  announcement: "typeAnnouncement",
  system: "typeSystem",
};

const GrowOrigin = forwardRef<HTMLDivElement, GrowProps>(
  function GrowOrigin(props, ref) {
    return (
      <Grow
        {...props}
        ref={ref}
        timeout={{ enter: 180, exit: 140 }}
      />
    );
  },
);

/**
 * @param {string} iso - ISO 时间字符串
 * @returns {string} 本地化展示时间
 */
function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function NotificationBell() {
  const { t } = useI18n();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [items, setItems] = useState<NoticeItem[]>([]);
  const [busy, setBusy] = useState(false);
  const open = anchor !== null;
  const unread = items.filter((item) => !item.isRead).length;

  const loadNotices = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE}/notifications`, {
        credentials: "include",
      });
      if (response.ok) {
        const data = (await response.json()) as {
          items: NoticeItem[];
          unread: number;
        };
        setItems(data.items);
      }
    } catch {
      void 0;
    }
  }, []);

  useEffect(() => {
    void loadNotices();
    const unsubscribe = onDataChanged(() => {
      void loadNotices();
    });
    return unsubscribe;
  }, [loadNotices]);

  /**
   * @param {MouseEvent<HTMLElement>} event - 铃铛点击事件
   */
  const handleToggle = (event: MouseEvent<HTMLElement>): void => {
    if (open) {
      setAnchor(null);
    } else {
      setAnchor(event.currentTarget);
      void loadNotices();
    }
  };

  const handleClose = (): void => {
    setAnchor(null);
  };

  /**
   * @param {number} id - 信息 id
   */
  const handleMarkRead = async (id: number): Promise<void> => {
    setBusy(true);
    try {
      const response = await fetch(`${API_BASE}/notifications/${id}/read`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (response.ok) {
        setItems((current) =>
          current.map((item) =>
            item.id === id ? { ...item, isRead: true } : item,
          ),
        );
      }
    } catch {
      void 0;
    }
    setBusy(false);
  };

  const handleMarkAllRead = async (): Promise<void> => {
    setBusy(true);
    try {
      const response = await fetch(`${API_BASE}/notifications/read-all`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (response.ok) {
        setItems((current) =>
          current.map((item) => ({ ...item, isRead: true })),
        );
      }
    } catch {
      void 0;
    }
    setBusy(false);
  };

  /**
   * @param {number} id - 信息 id
   */
  const handleRemove = async (id: number): Promise<void> => {
    setBusy(true);
    try {
      const response = await fetch(`${API_BASE}/notifications/${id}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (response.ok) {
        setItems((current) => current.filter((item) => item.id !== id));
      }
    } catch {
      void 0;
    }
    setBusy(false);
  };

  return (
    <>
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
        <Badge
          overlap="circular"
          variant="dot"
          invisible={unread === 0}
          color="error"
        >
          <Button
            size="small"
            onClick={handleToggle}
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
            <NotificationsOutlined sx={{ fontSize: 18 }} />
          </Button>
        </Badge>
      </Stack>

      <Popover
        open={open}
        anchorEl={anchor}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slots={{ transition: GrowOrigin }}
        slotProps={{
          paper: {
            variant: "outlined",
            elevation: 0,
            tabIndex: -1,
            sx: {
              width: 460,
              maxWidth: "92vw",
              maxHeight: 480,
              display: "flex",
              flexDirection: "column",
              borderRadius: "16px",
              borderColor: "rgba(229, 230, 235, 0.6)",
              backgroundColor: "rgba(255, 255, 255, 0.66)",
              backdropFilter: "blur(18px) saturate(160%)",
              WebkitBackdropFilter: "blur(18px) saturate(160%)",
              boxShadow: "0 12px 32px rgb(16 24 40 / 0.10)",
              overflow: "hidden",
              transformOrigin: "top right",
              mt: 1.25,
              ml: "-44px",
            },
          },
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 2,
            py: 1.5,
            borderBottom: "1px solid var(--pm-color-divider)",
          }}
        >
          <Typography
            sx={{
              fontSize: 15,
              color: "var(--pm-color-text-primary)",
            }}
          >
            {t("inboxTitle")}
          </Typography>
          <Button
            size="small"
            variant="text"
            disabled={busy || unread === 0}
            onClick={handleMarkAllRead}
            sx={{
              textTransform: "none",
              fontSize: 13,
              color: "var(--pm-color-primary)",
            }}
          >
            {t("inboxMarkAllRead")}
          </Button>
        </Box>

        {items.length === 0 ? (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 160,
            }}
          >
            <Typography
              sx={{
                fontSize: 13,
                color: "var(--pm-color-text-hint)",
              }}
            >
              {t("inboxEmpty")}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ flex: 1, overflowY: "auto", p: 1.5 }}>
            {items.map((item) => (
              <Box
                key={item.id}
                onClick={() => void handleMarkRead(item.id)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  columnGap: 1.5,
                  px: 1.75,
                  py: 1.5,
                  mb: 1,
                  borderRadius: "10px",
                  cursor: "pointer",
                  "&:hover": {
                    backgroundColor: "#f5f7fa",
                  },
                }}
              >
                <Stack
                  direction="column"
                  spacing={0.5}
                  sx={{ flex: 1, minWidth: 0 }}
                >
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "center" }}
                  >
                    {!item.isRead && (
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          flexShrink: 0,
                          backgroundColor: "var(--pm-color-primary)",
                        }}
                      />
                    )}
                    <Typography
                      sx={{
                        fontSize: 14,
                        color: "var(--pm-color-text-primary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      [{t(TYPE_KEY[item.type] ?? "system")}] {item.title}
                    </Typography>
                  </Stack>
                  <Typography
                    sx={{
                      fontSize: 12,
                      lineHeight: 1.5,
                      color: "var(--pm-color-text-secondary)",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {item.content}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 11,
                      color: "var(--pm-color-text-hint)",
                    }}
                  >
                    {formatTime(item.createdAt)}
                  </Typography>
                </Stack>
                <IconButton
                  size="small"
                  disabled={busy}
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleRemove(item.id);
                  }}
                  sx={{
                    flexShrink: 0,
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    p: 0,
                    color: "var(--pm-color-text-hint)",
                    border: "1px solid var(--pm-color-border)",
                    backgroundColor: "var(--pm-color-surface)",
                    "&:hover": {
                      backgroundColor: "rgba(245, 34, 45, 0.08)",
                      color: "#cf1322",
                      borderColor: "rgba(207, 19, 34, 0.35)",
                    },
                  }}
                >
                  <DeleteOutlined sx={{ fontSize: 16 }} />
                </IconButton>
              </Box>
            ))}
          </Box>
        )}
      </Popover>
    </>
  );
}
