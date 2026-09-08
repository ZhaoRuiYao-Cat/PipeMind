"use client";

import { useEffect, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { ThemeProvider } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import PsychologyRounded from "@mui/icons-material/PsychologyRounded";
import PublicOutlined from "@mui/icons-material/PublicOutlined";
import SendRounded from "@mui/icons-material/SendRounded";
import ChatBubbleOutlineRounded from "@mui/icons-material/ChatBubbleOutlineRounded";
import { pmTheme } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { API_BASE } from "@/lib/api";
import { ChatTranscript } from "@/components/chat-transcript";
import { useChat } from "@/lib/chat";

const ALL_CAPABILITIES = ["deepThinking", "webSearch"];

interface AiProviderInfo {
  key: string;
  active: boolean;
  capabilities?: string[];
}

export function AgentComposer() {
  const { t } = useI18n();
  const { send, sending } = useChat();
  const [draft, setDraft] = useState("");
  const [deepThinking, setDeepThinking] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [capabilities, setCapabilities] = useState<string[]>(ALL_CAPABILITIES);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadActiveCapabilities = async (): Promise<void> => {
      try {
        const response = await fetch(`${API_BASE}/ai/providers`, {
          credentials: "include",
        });
        if (response.ok) {
          const data = (await response.json()) as {
            providers?: AiProviderInfo[];
          };
          const active = (data.providers ?? []).find(
            (provider) => provider.active,
          );
          if (!cancelled && active && active.capabilities) {
            setCapabilities(active.capabilities);
          }
        }
      } catch {
        void 0;
      }
    };
    void loadActiveCapabilities();
    return () => {
      cancelled = true;
    };
  }, []);

  const supportsDeepThinking = capabilities.includes("deepThinking");
  const supportsWebSearch = capabilities.includes("webSearch");

  const effectiveDeepThinking = deepThinking && supportsDeepThinking;
  const effectiveWebSearch = webSearch && supportsWebSearch;

  /**
   * @param {ChangeEvent<HTMLInputElement | HTMLTextAreaElement>} event - 输入框内容变更事件
   */
  const handleDraftChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ): void => {
    setDraft(event.target.value);
  };

  /**
   * @param {KeyboardEvent<HTMLDivElement>} event - 输入框键盘事件
   */
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitMessage();
    }
  };

  const submitMessage = async (): Promise<void> => {
    const content = draft.trim();
    if (content.length === 0 || sending) {
      return;
    }
    setDraft("");
    await send(content);
  };

  const toggleHistory = (): void => {
    setHistoryOpen((value) => !value);
  };

  return (
    <ThemeProvider theme={pmTheme}>
      <Box
        sx={{
          position: "fixed",
          inset: 0,
          zIndex: 100,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-end",
          px: { xs: 3, sm: 6 },
          pb: { xs: 2, sm: 3 },
          pointerEvents: "none",
        }}
      >
        <Box
          sx={{
            width: "100%",
            maxWidth: 760,
            pointerEvents: "auto",
          }}
        >
          <Box
            sx={{
              borderRadius: 3,
              border: "1px solid var(--pm-color-border)",
              backgroundColor: "rgba(255, 255, 255, 0.82)",
              backdropFilter: "blur(14px) saturate(150%)",
              WebkitBackdropFilter: "blur(14px) saturate(150%)",
              boxShadow: "0 2px 6px rgb(16 24 40 / 0.05)",
              overflow: "hidden",
            }}
          >
            <Collapse in={historyOpen}>
              <Box
                sx={{
                  height: 200,
                  borderBottom: "1px solid var(--pm-color-divider)",
                }}
              >
                <ChatTranscript sx={{ height: "100%" }} />
              </Box>
            </Collapse>

            <Box sx={{ px: 1.5, pt: 1, pb: 2 }}>
              <Box
                data-guide="home-input"
                sx={{
                  display: "flex",
                  alignItems: "center",
                  columnGap: 0.75,
                }}
              >
                <TextField
                  fullWidth
                  multiline
                  minRows={1}
                  maxRows={6}
                  variant="standard"
                  value={draft}
                  onChange={handleDraftChange}
                  onKeyDown={handleKeyDown}
                  placeholder={t("homePlaceholder")}
                  slotProps={{
                    input: {
                      disableUnderline: true,
                    },
                    htmlInput: {
                      "aria-label": "对话输入框",
                    },
                  }}
                  sx={{
                    "& .MuiInputBase-input": {
                      px: 1,
                      py: "8px",
                      fontSize: 15,
                      lineHeight: 1.6,
                    },
                  }}
                />
                <Tooltip
                  title={
                    historyOpen
                      ? t("chatHistoryHide")
                      : t("chatHistoryShow")
                  }
                  placement="top"
                >
                  <IconButton
                    size="small"
                    onClick={toggleHistory}
                    aria-label={
                      historyOpen
                        ? t("chatHistoryHide")
                        : t("chatHistoryShow")
                    }
                    sx={{
                      width: 32,
                      height: 32,
                      flexShrink: 0,
                      borderRadius: "50%",
                      color: historyOpen
                        ? "var(--pm-color-primary)"
                        : "var(--pm-color-text-secondary)",
                      "&:hover": {
                        backgroundColor: "var(--pm-color-primary-soft)",
                        color: "var(--pm-color-primary)",
                      },
                    }}
                  >
                    <ChatBubbleOutlineRounded sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              </Box>

              <Stack
                direction="row"
                spacing={0.75}
                sx={{ alignItems: "center", mt: 0.75 }}
              >
                {supportsDeepThinking && (
                  <Button
                    size="small"
                    startIcon={<PsychologyRounded sx={{ fontSize: 17 }} />}
                    onClick={() => setDeepThinking((value) => !value)}
                    disableRipple
                    data-guide="home-thinking"
                    sx={{
                      borderRadius: 9,
                      px: 1.25,
                      py: 0.25,
                      textTransform: "none",
                      whiteSpace: "nowrap",
                      fontSize: 12,
                      minWidth: 0,
                      color: effectiveDeepThinking
                        ? "var(--pm-color-primary)"
                        : "var(--pm-color-text-secondary)",
                      backgroundColor: effectiveDeepThinking
                        ? "var(--pm-color-primary-soft)"
                        : "transparent",
                      "&:hover": {
                        backgroundColor: effectiveDeepThinking
                          ? "var(--pm-color-primary-soft)"
                          : "rgba(0, 0, 0, 0.04)",
                      },
                    }}
                  >
                    {t("homeThinking")}
                  </Button>
                )}
                {supportsWebSearch && (
                  <Button
                    size="small"
                    startIcon={<PublicOutlined sx={{ fontSize: 17 }} />}
                    onClick={() => setWebSearch((value) => !value)}
                    disableRipple
                    data-guide="home-search"
                    sx={{
                      borderRadius: 9,
                      px: 1.25,
                      py: 0.25,
                      textTransform: "none",
                      whiteSpace: "nowrap",
                      fontSize: 12,
                      minWidth: 0,
                      color: effectiveWebSearch
                        ? "var(--pm-color-primary)"
                        : "var(--pm-color-text-secondary)",
                      backgroundColor: effectiveWebSearch
                        ? "var(--pm-color-primary-soft)"
                        : "transparent",
                      "&:hover": {
                        backgroundColor: effectiveWebSearch
                          ? "var(--pm-color-primary-soft)"
                          : "rgba(0, 0, 0, 0.04)",
                      },
                    }}
                  >
                    {t("homeWebSearch")}
                  </Button>
                )}
                <Box sx={{ flex: 1 }} />
                {sending ? (
                  <Box
                    sx={{
                      width: 30,
                      height: 30,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <CircularProgress
                      size={18}
                      sx={{ color: "var(--pm-color-primary)" }}
                    />
                  </Box>
                ) : (
                  <Tooltip title={t("chatTitle")} placement="top">
                    <IconButton
                      size="small"
                      data-guide="home-send"
                      onClick={() => void submitMessage()}
                      disabled={draft.trim().length === 0}
                      aria-label={t("chatTitle")}
                      sx={{
                        width: 30,
                        height: 30,
                        borderRadius: "999px",
                        backgroundColor: "var(--pm-color-primary)",
                        color: "var(--pm-color-primary-contrast)",
                        "&:hover": {
                          backgroundColor: "var(--pm-color-primary-hover)",
                        },
                        "&.Mui-disabled": {
                          backgroundColor: "var(--pm-color-primary-soft)",
                          color: "var(--pm-color-text-disabled)",
                        },
                      }}
                    >
                      <SendRounded sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                )}
              </Stack>
            </Box>
          </Box>

          <Typography
            sx={{
              mt: 1,
              textAlign: "center",
              fontSize: 12,
              color: "var(--pm-color-text-hint)",
            }}
          >
            {t("homeHint")}
          </Typography>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
