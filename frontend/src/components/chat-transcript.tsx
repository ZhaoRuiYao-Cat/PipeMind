"use client";

import { useEffect, useRef } from "react";
import type { SxProps, Theme } from "@mui/material/styles";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useChat } from "@/lib/chat";
import { useI18n } from "@/lib/i18n";

export function ChatTranscript({ sx }: { sx?: SxProps<Theme> }) {
  const { messages, sending } = useChat();
  const { t } = useI18n();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const list = scrollRef.current;
    if (list) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages, sending]);

  return (
    <Box
      ref={scrollRef}
      sx={{
        overflowY: "auto",
        px: 1.5,
        pt: 2,
        pb: 1.25,
        ...sx,
      }}
    >
      {messages.length === 0 && !sending ? (
        <Stack
          sx={{
            minHeight: "100%",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          <Typography
            sx={{
              fontSize: 13,
              color: "var(--pm-color-text-hint)",
              lineHeight: 1.7,
              whiteSpace: "pre-line",
            }}
          >
            {t("chatEmpty")}
          </Typography>
        </Stack>
      ) : (
        <Stack>
          {messages.map((message) => (
            <Stack
              key={message.id}
              sx={{
                alignItems:
                  message.role === "user" ? "flex-end" : "flex-start",
                mb: 1,
              }}
            >
              <Box
                sx={{
                  maxWidth: "84%",
                  px: 1.5,
                  py: 1,
                  borderRadius: "14px",
                  fontSize: 13,
                  lineHeight: 1.6,
                  color:
                    message.role === "user"
                      ? "#ffffff"
                      : "var(--pm-color-text-primary)",
                  backgroundColor:
                    message.role === "user"
                      ? "var(--pm-color-primary)"
                      : "var(--pm-color-surface)",
                  border:
                    message.role === "user"
                      ? "none"
                      : "1px solid var(--pm-color-border)",
                  wordBreak: "break-word",
                  whiteSpace: "pre-wrap",
                }}
              >
                {message.content}
              </Box>
            </Stack>
          ))}
          {sending && (
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: "center" }}
            >
              <CircularProgress
                size={14}
                sx={{ color: "var(--pm-color-primary)" }}
              />
              <Typography
                sx={{
                  fontSize: 12,
                  color: "var(--pm-color-text-hint)",
                }}
              >
                {t("chatTyping")}
              </Typography>
            </Stack>
          )}
        </Stack>
      )}
    </Box>
  );
}
