"use client";

import { useState } from "react";
import type {
  ChangeEvent,
  FormEvent,
  SyntheticEvent,
} from "react";
import {
  ThemeProvider,
  type SxProps,
  type Theme,
} from "@mui/material/styles";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import InputAdornment from "@mui/material/InputAdornment";
import Link from "@mui/material/Link";
import Snackbar from "@mui/material/Snackbar";
import type { SnackbarCloseReason } from "@mui/material/Snackbar";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import LockOutlined from "@mui/icons-material/LockOutlined";
import PersonOutlined from "@mui/icons-material/PersonOutlined";
import { encryptPasswordForLogin } from "@/lib/crypto";
import { API_BASE } from "@/lib/api";
import { pmTheme } from "@/lib/theme";
import { useI18n, localizeServerMessage } from "@/lib/i18n";

const calmFieldSx: SxProps<Theme> = {
  "& .MuiOutlinedInput-notchedOutline": {
    borderRadius: "999px",
    borderColor: "#e3e8ef",
    transition: "border-color 180ms ease",
  },
  "& .MuiInputBase-input": {
    borderRadius: "300px",
  },
  "& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: "#1664ff",
  },
  "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline":
    {
      borderColor: "#1664ff",
      borderWidth: 2,
    },
  "& .MuiOutlinedInput-root.Mui-focused:hover .MuiOutlinedInput-notchedOutline":
    {
      borderColor: "#1664ff",
      borderWidth: 2,
    },
  "&:hover .MuiInputLabel-root": {
    color: "#1664ff",
  },
  "& label.Mui-focused": {
    color: "#1664ff",
  },
  "& .MuiInputLabel-root": {
    fontSize: 14,
  },
  "& .MuiInputBase-input::placeholder": {
    color: "#b3bcc6",
    opacity: 1,
  },
};

const fieldIconSx: SxProps<Theme> = {
  fontSize: 19,
  color: "#9aa6b4",
};

export default function LoginPage() {
  const { lang, t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeText, setNoticeText] = useState("");
  const [rememberAccount, setRememberAccount] = useState(false);

  const showNotice = (message: string): void => {
    setNoticeText(message);
    setNoticeOpen(true);
  };

  /**
   * @param {SyntheticEvent | Event} event - 触发关闭的事件
   * @param {SnackbarCloseReason | undefined} reason - 关闭原因
   */
  const handleNoticeClose = (
    _event: SyntheticEvent | Event,
    reason?: SnackbarCloseReason,
  ): void => {
    if (reason === "clickaway") {
      return;
    }
    setNoticeOpen(false);
  };

  /**
   * @param {ChangeEvent<HTMLInputElement>} event - 记住登录勾选事件
   */
  const handleRememberChange = (
    event: ChangeEvent<HTMLInputElement>,
  ): void => {
    setRememberAccount(event.target.checked);
  };

  /**
   * @param {FormEvent<HTMLFormElement>} event - 登录表单提交事件
   */
  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (loading) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    const username = String(formData.get("account") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    if (!username || !password) {
      showNotice(t("toastLoginFieldsRequired"));
      return;
    }
    setNoticeOpen(false);
    setLoading(true);
    try {
      const encryptedPassword = await encryptPasswordForLogin(
        password,
        API_BASE,
      );
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          encryptedPassword,
          remember: rememberAccount,
        }),
      });
      const data = (await response.json()) as {
        user?: { id: number; username: string };
        message?: string | string[];
      };
      if (!response.ok || !data.user) {
        const message = Array.isArray(data.message)
          ? data.message.join("，")
          : (data.message ?? t("toastLoginFailed"));
        throw new Error(message);
      }
      globalThis.location.href = "/home";
    } catch (err) {
      showNotice(
        err instanceof Error
          ? localizeServerMessage(t, err.message)
          : t("toastLoginFailed"),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemeProvider theme={pmTheme}>
      <Box
        sx={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--pm-color-page-bg)",
          px: 3,
          py: 6,
        }}
      >
        <Box
          component="form"
          noValidate
          onSubmit={handleSubmit}
          sx={{
            width: "100%",
            maxWidth: 400,
          }}
        >
          <Box sx={{ textAlign: "center" }}>
            <Box
              component="img"
              src="/favicon.svg"
              alt="PipeMind"
              sx={{ height: 44, width: "auto", display: "inline-block" }}
            />
            <Typography
              sx={{
                mt: 2.5,
                fontSize: 13,
                lineHeight: 1.7,
                color: "#98a2b3",
              }}
            >
              {t("loginSubtitle")}
            </Typography>
          </Box>

          <Box sx={{ mt: 6 }}>
            <TextField
              fullWidth
              label={t("loginAccount")}
              name="account"
              autoComplete="username"
              placeholder={t("loginAccountPlaceholder")}
              sx={calmFieldSx}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <PersonOutlined sx={fieldIconSx} />
                    </InputAdornment>
                  ),
                },
              }}
            />
          </Box>

          <Box sx={{ mt: 2.5 }}>
            <TextField
              fullWidth
              label={t("loginPassword")}
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder={t("loginPasswordPlaceholder")}
              sx={calmFieldSx}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockOutlined sx={fieldIconSx} />
                    </InputAdornment>
                  ),
                },
              }}
            />
          </Box>

          <Box
            sx={{
              mt: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <FormControlLabel
              control={<Checkbox size="small" />}
              label={
                <Typography
                  sx={{
                    fontSize: 13,
                    color: "#5c6b7a",
                  }}
                >
                  {t("loginRemember")}
                </Typography>
              }
              sx={{ mx: 0 }}
            />
            <Link
              component="button"
              type="button"
              underline="hover"
              sx={{ fontSize: 13, color: "#5c6b7a" }}
            >
              {t("loginForgot")}
            </Link>
          </Box>

          <Button
            type="submit"
            variant="contained"
            size="large"
            fullWidth
            disableElevation
            disabled={loading}
            sx={{
              mt: 3.5,
              height: 46,
              fontSize: 15,
              fontWeight: 500,
              textTransform: "none",
              color: "var(--pm-color-primary-contrast)",
              backgroundColor: "var(--pm-color-primary)",
              borderRadius: 3,
              "&:hover": {
                backgroundColor: "var(--pm-color-primary-hover)",
              },
              "&.Mui-disabled": {
                color: "var(--pm-color-primary-contrast)",
                backgroundColor: "var(--pm-color-primary)",
                opacity: 0.75,
              },
            }}
          >
            {loading ? (
              <CircularProgress size={20} color="inherit" />
            ) : (
              t("loginSubmit")
            )}
          </Button>

          <Typography
            sx={{
              mt: 4,
              fontSize: 12,
              textAlign: "center",
              color: "#98a2b3",
            }}
          >
            {t("agreePrefix")}
            <Link
              component="button"
              type="button"
              underline="hover"
              sx={{ fontSize: 12, color: "#5c6b7a" }}
            >
              {t("terms")}
            </Link>
            {lang === "en-US" ? " and " : " 和 "}
            <Link
              component="button"
              type="button"
              underline="hover"
              sx={{ fontSize: 12, color: "#5c6b7a" }}
            >
              {t("privacy")}
            </Link>
          </Typography>
        </Box>

        <Typography
          sx={{
            mt: 3,
            fontSize: 12,
            textAlign: "center",
            color: "#98a2b3",
          }}
        >
          {t("copyright")}
        </Typography>
      </Box>

      <Snackbar
        open={noticeOpen}
        autoHideDuration={3000}
        onClose={handleNoticeClose}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        sx={{ mt: 2 }}
      >
        <Alert
          severity="error"
          variant="outlined"
          sx={{
            borderRadius: "999px",
            px: 3,
            color: "#cf1322",
            backgroundColor: "rgba(255, 255, 255, 0.66)",
            backdropFilter: "blur(18px) saturate(160%)",
            WebkitBackdropFilter: "blur(18px) saturate(160%)",
            borderColor: "rgba(255, 163, 158, 0.9)",
            boxShadow: "0 8px 24px rgb(207 19 34 / 0.08)",
            "& .MuiAlert-icon": {
              color: "#cf1322",
            },
          }}
        >
          {noticeText}
        </Alert>
      </Snackbar>
    </ThemeProvider>
  );
}
