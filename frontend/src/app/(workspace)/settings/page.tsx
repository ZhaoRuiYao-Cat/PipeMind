"use client";

import { useCallback, useEffect, useState } from "react";
import type { SelectChangeEvent } from "@mui/material/Select";
import type { SxProps, Theme } from "@mui/material/styles";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Collapse from "@mui/material/Collapse";
import Divider from "@mui/material/Divider";
import EditOutlined from "@mui/icons-material/EditOutlined";
import FormControl from "@mui/material/FormControl";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useSession } from "@/lib/session";
import { API_BASE } from "@/lib/api";
import { encryptPasswordForLogin } from "@/lib/crypto";
import { useI18n, localizeServerMessage, resolveAppLang } from "@/lib/i18n";
import { onDataChanged } from "@/lib/data-events";
import { IOSSwitch } from "@/components/ios-switch";

type Lang = "zh-CN" | "en-US";

interface DeviceSession {
  id: number;
  device: string | null;
  ip: string | null;
  createdAt: string;
  expiresAt: string;
  current: boolean;
}

interface AiProviderView {
  key: string;
  baseUrl: string | null;
  hasKey: boolean;
  maskedKey: string | null;
  active: boolean;
}

const PROVIDER_LABELS: Record<string, Record<Lang, string>> = {
  openai: { "zh-CN": "OpenAI", "en-US": "OpenAI" },
  deepseek: { "zh-CN": "DeepSeek", "en-US": "DeepSeek" },
  gemini: { "zh-CN": "Gemini", "en-US": "Gemini" },
  doubao: { "zh-CN": "豆包", "en-US": "Doubao" },
};

const PROVIDER_DEFAULT_BASE_URL: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  deepseek: "https://api.deepseek.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  doubao: "https://ark.cn-beijing.volces.com/api/v3",
};

const UI_TEXT: Record<string, Record<Lang, string>> = {
  pageTitle: { "zh-CN": "设置", "en-US": "Settings" },
  pageDesc: {
    "zh-CN": "管理账户、安全与系统偏好",
    "en-US": "Manage account, security and system preferences",
  },
  secAccount: { "zh-CN": "账户设置", "en-US": "Account" },
  rowUsername: { "zh-CN": "用户名", "en-US": "Username" },
  rowUsernameDesc: {
    "zh-CN": "点击修改当前登录用户名",
    "en-US": "Click to change your username",
  },
  secSecurity: { "zh-CN": "安全设置", "en-US": "Security" },
  rowPassword: { "zh-CN": "登录密码", "en-US": "Password" },
  rowPasswordDesc: {
    "zh-CN": "点击展开修改登录密码",
    "en-US": "Click to change password",
  },
  secSystem: { "zh-CN": "系统设置", "en-US": "System" },
  editorUsernameTitle: { "zh-CN": "修改用户名", "en-US": "Change username" },
  labelNewUsername: { "zh-CN": "新用户名", "en-US": "New username" },
  hintUsername: {
    "zh-CN": "用户名与登录相关，修改后请使用新用户名登录",
    "en-US": "Username is used for sign-in; sign in with the new name after change",
  },
  btnCancel: { "zh-CN": "取消", "en-US": "Cancel" },
  btnSave: { "zh-CN": "保存", "en-US": "Save" },
  rowAccountStatus: { "zh-CN": "账户状态", "en-US": "Account status" },
  rowAccountStatusDesc: { "zh-CN": "账户当前使用状态", "en-US": "Current status of the account" },
  statusOk: { "zh-CN": "正常", "en-US": "Active" },
  editorPasswordTitle: { "zh-CN": "修改密码", "en-US": "Change password" },
  labelOldPassword: { "zh-CN": "原密码", "en-US": "Current password" },
  labelNewPassword: { "zh-CN": "修改密码", "en-US": "New password" },
  labelConfirmPassword: { "zh-CN": "确认修改密码", "en-US": "Confirm new password" },
  hintPassword: {
    "zh-CN": "新密码长度需为 6-128 位",
    "en-US": "New password must be 6-128 characters",
  },
  btnConfirm: { "zh-CN": "确认修改", "en-US": "Confirm" },
  rowNotify: { "zh-CN": "登录安全提醒", "en-US": "Login alerts" },
  rowNotifyDesc: {
    "zh-CN": "登录后向信息箱写入登录时间、IP 与设备信息",
    "en-US": "Record login time, IP and device into the inbox after sign-in",
  },
  rowLanguage: { "zh-CN": "界面语言", "en-US": "Language" },
  rowLanguageDesc: { "zh-CN": "设置界面显示语言", "en-US": "Language of the interface" },
  rowAssistant: { "zh-CN": "助手提示", "en-US": "Assistant hint" },
  rowAssistantDesc: {
    "zh-CN": "在首页底部显示内容来源提示",
    "en-US": "Show the content source hint at the bottom of home",
  },
  rowTheme: { "zh-CN": "主题", "en-US": "Theme" },
  rowThemeDesc: { "zh-CN": "当前跟随浅色冷静主题", "en-US": "Currently following the light calm theme" },
  themeLight: { "zh-CN": "浅色", "en-US": "Light" },
  rowVersion: { "zh-CN": "版本信息", "en-US": "Version" },
  rowVersionDesc: {
    "zh-CN": "PipeMind 地下管网数字化管理平台",
    "en-US": "PipeMind underground pipeline digital management platform",
  },
};

const pillFieldSx: SxProps<Theme> = {
  "& .MuiOutlinedInput-notchedOutline": {
    borderRadius: "999px",
    borderColor: "var(--pm-color-border)",
    transition: "border-color 180ms ease",
  },
  "& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: "#1664ff",
  },
  "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline":
    {
      borderColor: "#1664ff",
      borderWidth: 2,
    },
};

const editorBodySx: SxProps<Theme> = {
  px: 2.5,
  pb: 2.5,
  pt: 1,
};

const editorTitleSx: SxProps<Theme> = {
  mb: 1.5,
  fontSize: 14,
  fontWeight: 600,
  color: "var(--pm-color-text-primary)",
};

interface SettingRowProps {
  title: string;
  description: string;
  control?: React.ReactNode;
}

function SettingRow({ title, description, control }: SettingRowProps) {
  return (
    <Stack
      direction="row"
      sx={{
        alignItems: "center",
        justifyContent: "space-between",
        columnGap: 3,
        px: 2.5,
        minHeight: 72,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography
          sx={{
            fontSize: 14,
            color: "var(--pm-color-text-primary)",
          }}
        >
          {title}
        </Typography>
        <Typography
          sx={{
            mt: 0.25,
            fontSize: 12,
            lineHeight: 1.5,
            color: "var(--pm-color-text-hint)",
          }}
        >
          {description}
        </Typography>
      </Box>
      {control ?? null}
    </Stack>
  );
}

interface SettingSectionProps {
  title: string;
  children: React.ReactNode;
  guideId?: string;
}

function SettingSection({ title, children, guideId }: SettingSectionProps) {
  return (
    <Box>
      <Typography
        sx={{
          mb: 1,
          fontSize: 15,
          fontWeight: 600,
          color: "var(--pm-color-text-primary)",
        }}
      >
        {title}
      </Typography>
      <Paper
        variant="outlined"
        elevation={0}
        data-guide={guideId}
        sx={{
          borderRadius: "16px",
          borderColor: "var(--pm-color-border)",
          backgroundColor: "var(--pm-color-surface)",
          overflow: "hidden",
        }}
      >
        {children}
      </Paper>
    </Box>
  );
}

export default function SettingsPage() {
  const { lang, setLang, t } = useI18n();
  const { user, updateUser } = useSession();
  const [notifyLogin, setNotifyLogin] = useState(true);
  const [editingUsername, setEditingUsername] = useState(false);
  const [draftUsername, setDraftUsername] = useState(user?.username ?? "");
  const [savingUsername, setSavingUsername] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeText, setNoticeText] = useState("");
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [sessionsReady, setSessionsReady] = useState(false);
  const [revokingId, setRevokingId] = useState<number | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);
  const [providers, setProviders] = useState<AiProviderView[]>([]);
  const [providersReady, setProvidersReady] = useState(false);
  const [editingAiKey, setEditingAiKey] = useState<string | null>(null);
  const [aiBaseUrl, setAiBaseUrl] = useState("");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [switchingAiKey, setSwitchingAiKey] = useState<string | null>(null);
  const [aiTestingKey, setAiTestingKey] = useState<string | null>(null);
  const [aiTestResults, setAiTestResults] = useState<
    Record<string, { ok: boolean; text: string }>
  >({});

  const showNotice = (message: string): void => {
    setNoticeText(message);
    setNoticeOpen(true);
  };

  const fetchSessionsOnce = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE}/auth/sessions`, {
        credentials: "include",
      });
      if (response.ok) {
        const data = (await response.json()) as {
          sessions?: DeviceSession[];
        };
        setSessions(data.sessions ?? []);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const loadSessions = useCallback(async (): Promise<void> => {
    setSessionsReady(false);
    const ok = await fetchSessionsOnce();
    if (!ok) {
      const refreshed = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (refreshed.ok) {
        await fetchSessionsOnce();
      }
    }
    setSessionsReady(true);
  }, [fetchSessionsOnce]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    const onFocus = (): void => {
      void loadSessions();
    };
    const onVisibility = (): void => {
      if (document.visibilityState === "visible") {
        void loadSessions();
      }
    };
    globalThis.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      globalThis.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadSessions]);

  const handleRevokeSession = async (id: number): Promise<void> => {
    setRevokingId(id);
    try {
      const response = await fetch(`${API_BASE}/auth/sessions/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(t("toastOperationFailed"));
      }
      await loadSessions();
      showNotice(t("toastDeviceSignedOut"));
    } catch {
      showNotice(t("toastOperationFailed"));
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeOthers = async (): Promise<void> => {
    setRevokingOthers(true);
    try {
      const response = await fetch(`${API_BASE}/auth/sessions/others`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(t("toastOperationFailed"));
      }
      const data = (await response.json()) as { revokedCount?: number };
      await loadSessions();
      showNotice(
        data.revokedCount && data.revokedCount > 0
          ? t("toastSignedOutOthersCount").replace(
              "{count}",
              String(data.revokedCount),
            )
          : t("toastNoOthersSignedOut"),
      );
    } catch {
      showNotice(t("toastOperationFailed"));
    } finally {
      setRevokingOthers(false);
    }
  };

  const loadProvidersOnce = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE}/ai/providers`, {
        credentials: "include",
      });
      if (response.ok) {
        const data = (await response.json()) as {
          providers?: AiProviderView[];
        };
        setProviders(data.providers ?? []);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const loadProviders = useCallback(async (): Promise<void> => {
    setProvidersReady(false);
    const ok = await loadProvidersOnce();
    if (!ok) {
      const refreshed = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (refreshed.ok) {
        await loadProvidersOnce();
      }
    }
    setProvidersReady(true);
  }, [loadProvidersOnce]);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  const refreshUserSettings = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE}/settings`, {
        credentials: "include",
      });
      if (response.ok) {
        const data = (await response.json()) as {
          settings?: Record<string, string>;
        };
        const saved = data.settings ?? {};
        setNotifyLogin(saved["security.login_notify"] !== "false");
        const serverLang = resolveAppLang(saved["system.language"]);
        if (serverLang) {
          setLang(serverLang);
        }
      }
    } catch {
      void 0;
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onDataChanged(() => {
      void loadSessions();
      void loadProviders();
      void refreshUserSettings();
    });
    return unsubscribe;
  }, [loadSessions, loadProviders, refreshUserSettings]);

  const handleOpenAiEditor = (provider: AiProviderView): void => {
    if (editingAiKey === provider.key) {
      setEditingAiKey(null);
      return;
    }
    setAiBaseUrl(
      provider.baseUrl ??
        (PROVIDER_DEFAULT_BASE_URL[provider.key] ?? ""),
    );
    setAiApiKey("");
    setEditingAiKey(provider.key);
  };

  const handleSaveAiProvider = async (): Promise<void> => {
    const target = editingAiKey;
    if (!target) {
      return;
    }
    setAiBusy(true);
    try {
      const payload: {
        key: string;
        baseUrl?: string;
        apiKey?: string;
      } = { key: target, baseUrl: aiBaseUrl.trim() };
      if (aiApiKey.trim().length > 0) {
        payload.apiKey = aiApiKey.trim();
      }
      const response = await fetch(`${API_BASE}/ai/providers`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providers: [payload] }),
      });
      const data = (await response.json()) as {
        message?: string | string[];
      };
      if (!response.ok) {
        const message = Array.isArray(data.message)
          ? data.message.join("，")
          : (data.message ?? t("toastOperationFailed"));
        throw new Error(message);
      }
      await loadProvidersOnce();
      setEditingAiKey(null);
      setAiBaseUrl("");
      setAiApiKey("");
      showNotice(t("aiConfiguredSuccess"));
    } catch (err) {
      showNotice(
        err instanceof Error
          ? localizeServerMessage(t, err.message)
          : t("toastOperationFailed"),
      );
    } finally {
      setAiBusy(false);
    }
  };

  const handleTestAiProvider = async (): Promise<void> => {
    const target = editingAiKey;
    if (!target) {
      return;
    }
    setAiTestingKey(target);
    setAiTestResults((current) => {
      const next = { ...current };
      delete next[target];
      return next;
    });
    try {
      const payload: {
        key: string;
        baseUrl?: string;
        apiKey?: string;
      } = { key: target };
      if (aiBaseUrl.trim().length > 0) {
        payload.baseUrl = aiBaseUrl.trim();
      }
      if (aiApiKey.trim().length > 0) {
        payload.apiKey = aiApiKey.trim();
      }
      const response = await fetch(`${API_BASE}/ai/providers/test`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        code?: string;
        status?: number;
        detail?: string;
        message?: string | string[];
      };
      if (!response.ok || !data.code) {
        const message = Array.isArray(data.message)
          ? data.message.join("，")
          : (data.message ?? t("toastOperationFailed"));
        throw new Error(message);
      }
      const code = data.code;
      let result: string;
      if (code === "success") {
        result = data.detail
          ? `${t("aiTestSuccess")} · ${data.detail}`
          : t("aiTestSuccess");
      } else if (code === "not_configured") {
        result = t("aiTestNotConfigured");
      } else if (code === "unauthorized") {
        result = t("aiTestUnauthorized");
      } else if (code === "http_error") {
        result = t("aiTestHttpError").replace(
          "{status}",
          String(data.status ?? "?"),
        );
      } else {
        result =
          data.detail === "连接超时"
            ? t("aiTestTimedOut")
            : t("aiTestUnreachable");
      }
      setAiTestResults((current) => ({
        ...current,
        [target]: { ok: code === "success", text: result },
      }));
    } catch (err) {
      showNotice(
        err instanceof Error
          ? localizeServerMessage(t, err.message)
          : t("toastOperationFailed"),
      );
    } finally {
      setAiTestingKey(null);
    }
  };

  const handleSwitchAiProvider = async (key: string): Promise<void> => {
    setSwitchingAiKey(key);
    try {
      const response = await fetch(`${API_BASE}/ai/providers`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providers: [{ key, active: true }] }),
      });
      if (!response.ok) {
        throw new Error(t("toastOperationFailed"));
      }
      await loadProvidersOnce();
      showNotice(t("aiActiveChanged"));
    } catch {
      showNotice(t("toastOperationFailed"));
    } finally {
      setSwitchingAiKey(null);
    }
  };

  const aiDesc = (provider: AiProviderView): string => {
    const parts: string[] = [];
    parts.push(provider.baseUrl?.trim() || t("aiNotConfigured"));
    parts.push(
      provider.hasKey
        ? `${t("aiKeyConfigured")}${provider.maskedKey ? ` (${provider.maskedKey})` : ""}`
        : t("aiKeyNotSet"),
    );
    return parts.join(" · ");
  };

  useEffect(() => {
    void refreshUserSettings();
  }, [refreshUserSettings]);

  const persistSettings = async (
    values: Record<string, string>,
  ): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE}/settings`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      });
      return response.ok;
    } catch {
      return false;
    }
  };

  /**
   * @param {boolean} next - 目标开关状态
   */
  const handleNotifyLoginChange = async (next: boolean): Promise<void> => {
    const previous = notifyLogin;
    setNotifyLogin(next);
    const ok = await persistSettings({ "security.login_notify": String(next) });
    if (!ok) {
      setNotifyLogin(previous);
      showNotice(t("toastSaveFailed"));
    }
  };

  /**
   * @param {SelectChangeEvent} event - 语言选择事件
   */
  const handleLanguageChange = (event: SelectChangeEvent): void => {
    const next = event.target.value as "zh-CN" | "en-US";
    const previous = lang;
    setLang(next);
    void (async () => {
      const ok = await persistSettings({ "system.language": next });
      if (!ok) {
        setLang(previous);
        showNotice(t("toastSaveFailed"));
      }
    })();
  };

  const handleToggleUsernameEditor = (): void => {
    setEditingUsername((value) => {
      if (!value) {
        setDraftUsername(user?.username ?? "");
      }
      return !value;
    });
  };

  const handleSaveUsername = async (): Promise<void> => {
    const next = draftUsername.trim();
    if (next.length < 2 || next.length > 64) {
      showNotice(t("toastUsernameLength"));
      return;
    }
    if (!/^[A-Za-z0-9_-]+$/.test(next)) {
      showNotice(t("toastUsernameChars"));
      return;
    }
    setSavingUsername(true);
    try {
      const response = await fetch(`${API_BASE}/auth/username`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: next }),
      });
      const data = (await response.json()) as {
        user?: { id: number; username: string };
        message?: string | string[];
      };
      if (!response.ok || !data.user) {
        const message = Array.isArray(data.message)
          ? data.message.join("，")
          : (data.message ?? t("toastSaveFailed"));
        throw new Error(message);
      }
      updateUser(data.user);
      setEditingUsername(false);
      showNotice(t("toastUsernameUpdated"));
    } catch (err) {
      showNotice(
        err instanceof Error
          ? localizeServerMessage(t, err.message)
          : t("toastSaveFailed"),
      );
    } finally {
      setSavingUsername(false);
    }
  };

  const handleTogglePasswordEditor = (): void => {
    setEditingPassword((value) => {
      if (!value) {
        setOldPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
      return !value;
    });
  };

  const handleCancelPassword = (): void => {
    setEditingPassword(false);
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleChangePassword = async (): Promise<void> => {
    if (!oldPassword) {
      showNotice(t("toastOldPasswordRequired"));
      return;
    }
    if (newPassword.length < 6 || newPassword.length > 128) {
      showNotice(t("toastNewPasswordLen"));
      return;
    }
    if (newPassword !== confirmPassword) {
      showNotice(t("toastPasswordMismatch"));
      return;
    }
    setPasswordBusy(true);
    try {
      const encryptedOldPassword = await encryptPasswordForLogin(
        oldPassword,
        API_BASE,
      );
      const encryptedNewPassword = await encryptPasswordForLogin(
        newPassword,
        API_BASE,
      );
      const response = await fetch(`${API_BASE}/auth/password`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          encryptedOldPassword,
          encryptedNewPassword,
        }),
      });
      const data = (await response.json()) as {
        message?: string | string[];
      };
      if (!response.ok) {
        const message = Array.isArray(data.message)
          ? data.message.join("，")
          : (data.message ?? t("toastChangeFailed"));
        throw new Error(message);
      }
      setEditingPassword(false);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      showNotice(t("toastPasswordUpdated"));
    } catch (err) {
      showNotice(
        err instanceof Error
          ? localizeServerMessage(t, err.message)
          : t("toastChangeFailed"),
      );
    } finally {
      setPasswordBusy(false);
    }
  };

  const otherSessionCount = sessions.filter(
    (item) => !item.current,
  ).length;

  const otherTokensDesc =
    lang === "zh-CN"
      ? `${otherSessionCount} 个其他设备仍保持登录`
      : `${otherSessionCount} other device(s) still signed in`;

  const formatDeviceTime = (value: string | undefined): string => {
    if (!value) {
      return "—";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "—";
    }
    return date.toLocaleString(lang === "zh-CN" ? "zh-CN" : "en-US", {
      hour12: false,
    });
  };

  const editableRowSx = {
    minHeight: 72,
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: 3,
    px: 2.5,
    cursor: "pointer",
    transition: "background-color 160ms ease",
    "&:hover": {
      backgroundColor: "#f7f8fa",
    },
  } as const;

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        px: { xs: 2.5, sm: 4, md: 13 },
        pt: { xs: 10, sm: 12 },
        pb: 24,
      }}
    >
      <Box sx={{ width: "100%", maxWidth: 880, mx: "auto" }}>
        <Typography
          sx={{
            fontSize: 22,
            fontWeight: 700,
            color: "var(--pm-color-text-primary)",
          }}
        >
          {t("pageTitle")}
        </Typography>
        <Typography
          sx={{
            mt: 1,
            mb: 6,
            fontSize: 13,
            color: "var(--pm-color-text-hint)",
          }}
        >
          {t("pageDesc")}
        </Typography>

        <Stack spacing={4}>
          <SettingSection title={t("secAccount")} guideId="settings-account">
            <Stack
              direction="row"
              data-guide="settings-username-row"
              onClick={handleToggleUsernameEditor}
              sx={editableRowSx}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  sx={{
                    fontSize: 14,
                    color: "var(--pm-color-text-primary)",
                  }}
                >
                  {t("rowUsername")}
                </Typography>
                <Typography
                  sx={{
                    mt: 0.25,
                    fontSize: 12,
                    color: "var(--pm-color-text-hint)",
                  }}
                >
                  {t("rowUsernameDesc")}
                </Typography>
              </Box>
              <Stack
                direction="row"
                spacing={0.5}
                sx={{ alignItems: "center" }}
              >
                <Typography
                  sx={{
                    fontSize: 14,
                    color: "var(--pm-color-text-secondary)",
                  }}
                >
                  {user?.username ?? "-"}
                </Typography>
                <IconButton
                  size="small"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleToggleUsernameEditor();
                  }}
                  sx={{
                    width: 28,
                    height: 28,
                    color: "var(--pm-color-text-hint)",
                  }}
                >
                  <EditOutlined sx={{ fontSize: 16 }} />
                </IconButton>
              </Stack>
            </Stack>

            <Collapse in={editingUsername}>
              <Box sx={editorBodySx}>
                <Typography sx={editorTitleSx}>
                  {t("editorUsernameTitle")}
                </Typography>
                <TextField
                  fullWidth
                  label={t("labelNewUsername")}
                  value={draftUsername}
                  onChange={(event) => setDraftUsername(event.target.value)}
                  disabled={savingUsername}
                  autoFocus
                  sx={pillFieldSx}
                />
                <Stack
                  direction="row"
                  sx={{
                    alignItems: "center",
                    justifyContent: "space-between",
                    columnGap: 2,
                    mt: 2,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 12,
                      lineHeight: 1.5,
                      color: "var(--pm-color-text-hint)",
                    }}
                  >
                    {t("hintUsername")}
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                    <Button
                      variant="outlined"
                      size="small"
                      disabled={savingUsername}
                      onClick={handleToggleUsernameEditor}
                      sx={{
                        minWidth: 76,
                        borderRadius: "999px",
                        textTransform: "none",
                        color: "var(--pm-color-primary)",
                      }}
                    >
                      {t("btnCancel")}
                    </Button>
                    <Button
                      variant="contained"
                      size="small"
                      disableElevation
                      disabled={savingUsername}
                      data-guide="settings-username-save"
                      onClick={handleSaveUsername}
                      sx={{
                        minWidth: 76,
                        borderRadius: "999px",
                        textTransform: "none",
                        color: "var(--pm-color-primary-contrast)",
                        backgroundColor: "var(--pm-color-primary)",
                        "&:hover": {
                          backgroundColor: "var(--pm-color-primary-hover)",
                        },
                      }}
                    >
                      {savingUsername ? (
                        <CircularProgress size={16} sx={{ color: "var(--pm-color-primary)" }} />
                      ) : (
                        t("btnSave")
                      )}
                    </Button>
                  </Stack>
                </Stack>
              </Box>
            </Collapse>

            <Divider
              sx={{ mx: 2.5, borderColor: "var(--pm-color-divider)" }}
            />
            <SettingRow
              title={t("rowAccountStatus")}
              description={t("rowAccountStatusDesc")}
              control={
                <Typography sx={{ fontSize: 13, color: "#2e9e5b" }}>
                  {t("statusOk")}
                </Typography>
              }
            />
          </SettingSection>

          <SettingSection title={t("secSecurity")} guideId="settings-security">
            <Stack
              direction="row"
              data-guide="settings-password-row"
              onClick={handleTogglePasswordEditor}
              sx={editableRowSx}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  sx={{
                    fontSize: 14,
                    color: "var(--pm-color-text-primary)",
                  }}
                >
                  {t("rowPassword")}
                </Typography>
                <Typography
                  sx={{
                    mt: 0.25,
                    fontSize: 12,
                    color: "var(--pm-color-text-hint)",
                  }}
                >
                  {t("rowPasswordDesc")}
                </Typography>
              </Box>
              <Stack
                direction="row"
                spacing={0.5}
                sx={{ alignItems: "center" }}
              >
                <Typography
                  sx={{
                    fontSize: 14,
                    color: "var(--pm-color-text-hint)",
                  }}
                >
                  ••••••••
                </Typography>
                <IconButton
                  size="small"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleTogglePasswordEditor();
                  }}
                  sx={{
                    width: 28,
                    height: 28,
                    color: "var(--pm-color-text-hint)",
                  }}
                >
                  <EditOutlined sx={{ fontSize: 16 }} />
                </IconButton>
              </Stack>
            </Stack>

            <Collapse in={editingPassword}>
              <Box sx={editorBodySx}>
                <Typography sx={editorTitleSx}>
                  {t("editorPasswordTitle")}
                </Typography>
                <TextField
                  fullWidth
                  label={t("labelOldPassword")}
                  type="password"
                  autoComplete="current-password"
                  value={oldPassword}
                  onChange={(event) => setOldPassword(event.target.value)}
                  disabled={passwordBusy}
                  sx={pillFieldSx}
                />
                <Stack direction="row" spacing={1.5} sx={{ mt: 1.5 }}>
                  <TextField
                    fullWidth
                    label={t("labelNewPassword")}
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    disabled={passwordBusy}
                    sx={pillFieldSx}
                  />
                  <TextField
                    fullWidth
                    label={t("labelConfirmPassword")}
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    disabled={passwordBusy}
                    sx={pillFieldSx}
                  />
                </Stack>
                <Stack
                  direction="row"
                  sx={{
                    alignItems: "center",
                    justifyContent: "space-between",
                    columnGap: 2,
                    mt: 2,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 12,
                      color: "var(--pm-color-text-hint)",
                    }}
                  >
                    {t("hintPassword")}
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                    <Button
                      variant="outlined"
                      size="small"
                      disabled={passwordBusy}
                      onClick={handleCancelPassword}
                      sx={{
                        minWidth: 68,
                        borderRadius: "999px",
                        textTransform: "none",
                        color: "var(--pm-color-primary)",
                      }}
                    >
                      {t("btnCancel")}
                    </Button>
                    <Button
                      variant="contained"
                      size="small"
                      disableElevation
                      disabled={passwordBusy}
                      data-guide="settings-password-save"
                      onClick={handleChangePassword}
                      sx={{
                        minWidth: 88,
                        borderRadius: "999px",
                        textTransform: "none",
                        color: "var(--pm-color-primary-contrast)",
                        backgroundColor: "var(--pm-color-primary)",
                        "&:hover": {
                          backgroundColor: "var(--pm-color-primary-hover)",
                        },
                      }}
                    >
                      {passwordBusy ? (
                        <CircularProgress size={16} sx={{ color: "var(--pm-color-primary)" }} />
                      ) : (
                        t("btnConfirm")
                      )}
                    </Button>
                  </Stack>
                </Stack>
              </Box>
            </Collapse>

            <Divider
              sx={{ mx: 2.5, borderColor: "var(--pm-color-divider)" }}
            />
            <SettingRow
              title={t("rowNotify")}
              description={t("rowNotifyDesc")}
              control={
                <IOSSwitch
                  checked={notifyLogin}
                  onChange={(event) =>
                    void handleNotifyLoginChange(event.target.checked)
                  }
                />
              }
            />
          </SettingSection>

          <SettingSection title={t("secDevices")} guideId="settings-sessions">
            {!sessionsReady ? (
              <Stack
                direction="row"
                sx={{
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 96,
                }}
              >
                <CircularProgress
                  size={22}
                  sx={{ color: "var(--pm-color-primary)" }}
                />
              </Stack>
            ) : sessions.length === 0 ? (
              <Stack
                direction="row"
                sx={{
                  alignItems: "center",
                  justifyContent: "space-between",
                  columnGap: 3,
                  px: 2.5,
                  minHeight: 72,
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    sx={{
                      fontSize: 14,
                      color: "var(--pm-color-text-primary)",
                    }}
                  >
                    {t("devEmpty")}
                  </Typography>
                  <Typography
                    sx={{
                      mt: 0.25,
                      fontSize: 12,
                      lineHeight: 1.5,
                      color: "var(--pm-color-text-hint)",
                    }}
                  >
                    {t("devEmptyDesc")}
                  </Typography>
                </Box>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => void loadSessions()}
                  sx={{
                    minWidth: 68,
                    borderRadius: "999px",
                    textTransform: "none",
                    color: "var(--pm-color-primary)",
                  }}
                >
                  {t("actRefresh")}
                </Button>
              </Stack>
            ) : (
              sessions.map((session, index) => {
                const label = session.device?.trim() || t("devUnknown");
                const detail = [session.ip?.trim(), formatDeviceTime(session.createdAt)]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <Box key={session.id}>
                    {index > 0 && (
                      <Divider
                        sx={{
                          mx: 2.5,
                          borderColor: "var(--pm-color-divider)",
                        }}
                      />
                    )}
                    <SettingRow
                      title={label}
                      description={detail || "—"}
                      control={
                        session.current ? (
                          <Typography
                            sx={{
                              fontSize: 12,
                              color: "var(--pm-color-primary)",
                            }}
                          >
                            {t("devCurrent")}
                          </Typography>
                        ) : (
                          <Button
                            variant="outlined"
                            size="small"
                            disabled={revokingId === session.id}
                            data-guide={`settings-session-signout-${session.id}`}
                            onClick={() => void handleRevokeSession(session.id)}
                            sx={{
                              minWidth: 68,
                              borderRadius: "999px",
                              textTransform: "none",
                              color: "var(--pm-color-primary)",
                            }}
                          >
                            {revokingId === session.id ? (
                              <CircularProgress size={16} sx={{ color: "var(--pm-color-primary)" }} />
                            ) : (
                              t("actSignOut")
                            )}
                          </Button>
                        )
                      }
                    />
                  </Box>
                );
              })
            )}
          </SettingSection>

          <SettingSection title={t("secTokens")}>
            <SettingRow
              title={t("rowToken")}
              description={t("rowTokenDesc")}
              control={
                <Typography
                  sx={{
                    fontSize: 13,
                    color: "#2e9e5b",
                    whiteSpace: "nowrap",
                  }}
                >
                  {t("tokenEnabled")}
                </Typography>
              }
            />
            <Divider
              sx={{ mx: 2.5, borderColor: "var(--pm-color-divider)" }}
            />
            <SettingRow
              title={t("rowTokenExpiry")}
              description={t("rowTokenExpiryDesc")}
              control={
                <Typography
                  sx={{
                    fontSize: 13,
                    color: "var(--pm-color-text-secondary)",
                  }}
                >
                  {formatDeviceTime(
                    sessions.find((item) => item.current)?.expiresAt,
                  )}
                </Typography>
              }
            />
            <Divider
              sx={{ mx: 2.5, borderColor: "var(--pm-color-divider)" }}
            />
            <SettingRow
              title={t("rowOtherTokens")}
              description={otherTokensDesc}
              control={
                <Button
                  variant="outlined"
                  size="small"
                  disabled={
                    otherSessionCount === 0 || revokingOthers
                  }
                  data-guide="settings-sessions-signout-all"
                  onClick={() => void handleRevokeOthers()}
                  sx={{
                    minWidth: 76,
                    borderRadius: "999px",
                    textTransform: "none",
                    color: "var(--pm-color-primary)",
                  }}
                >
                  {revokingOthers ? (
                    <CircularProgress size={16} sx={{ color: "var(--pm-color-primary)" }} />
                  ) : (
                    t("actSignOutAll")
                  )}
                </Button>
              }
            />
          </SettingSection>

          <SettingSection title={t("secSystem")}>
            <SettingRow
              title={t("rowLanguage")}
              description={t("rowLanguageDesc")}
              control={
                <FormControl size="small" sx={{ minWidth: 150 }}>
                  <Select
                    value={lang}
                    onChange={handleLanguageChange}
                    sx={{
                      borderRadius: 2,
                      fontSize: 13,
                      backgroundColor: "var(--pm-color-surface)",
                      "& .MuiOutlinedInput-notchedOutline": {
                        borderColor: "var(--pm-color-border)",
                        transition: "border-color 180ms ease",
                      },
                      "& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline":
                        {
                          borderColor: "#1664ff",
                        },
                      "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline":
                        {
                          borderColor: "#1664ff",
                          borderWidth: 2,
                        },
                    }}
                  >
                    <MenuItem value="zh-CN">简体中文</MenuItem>
                    <MenuItem value="en-US">English</MenuItem>
                  </Select>
                </FormControl>
              }
            />
            <Divider
              sx={{ mx: 2.5, borderColor: "var(--pm-color-divider)" }}
            />
            <SettingRow
              title={t("rowVersion")}
              description={t("rowVersionDesc")}
              control={
                <Typography
                  sx={{
                    fontSize: 13,
                    color: "var(--pm-color-text-hint)",
                  }}
                >
                  v0.1.0
                </Typography>
              }
            />
          </SettingSection>

          <SettingSection title={t("secAi")} guideId="settings-ai">
            {!providersReady ? (
              <Stack
                direction="row"
                sx={{
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 96,
                }}
              >
                <CircularProgress
                  size={22}
                  sx={{ color: "var(--pm-color-primary)" }}
                />
              </Stack>
            ) : (
              <Box>
                <Box
                  sx={{
                    px: 2.5,
                    pt: 1.75,
                    pb: 1.25,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 13,
                      color: "var(--pm-color-text-hint)",
                    }}
                  >
                    {t("aiHint")}
                  </Typography>
                </Box>
                <Divider
                  sx={{ mx: 2.5, borderColor: "var(--pm-color-divider)" }}
                />
                {providers.length === 0 ? (
                  <SettingRow
                    title={t("aiKeyNotSet")}
                    description=""
                    control={null}
                  />
                ) : (
                  providers.map((provider, index) => {
                    const label =
                      PROVIDER_LABELS[provider.key]?.[lang] ?? provider.key;
                    return (
                      <Box key={provider.key}>
                        {index > 0 && (
                          <Divider
                            sx={{
                              mx: 2.5,
                              borderColor: "var(--pm-color-divider)",
                            }}
                          />
                        )}
                    <Stack
                      direction="row"
                      onClick={() => handleOpenAiEditor(provider)}
                      sx={{
                        minHeight: 72,
                        alignItems: "center",
                        justifyContent: "space-between",
                        columnGap: 3,
                        px: 2.5,
                        cursor: "pointer",
                        transition: "background-color 160ms ease",
                        "&:hover": {
                          backgroundColor: "#f7f8fa",
                        },
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          sx={{
                            fontSize: 14,
                            color: "var(--pm-color-text-primary)",
                          }}
                        >
                          {label}
                        </Typography>
                        <Typography
                          sx={{
                            mt: 0.25,
                            fontSize: 12,
                            lineHeight: 1.5,
                            color: "var(--pm-color-text-hint)",
                          }}
                        >
                          {aiDesc(provider)}
                        </Typography>
                      </Box>
                      <Stack
                        direction="row"
                        spacing={0.75}
                        sx={{
                          alignItems: "center",
                          flexShrink: 0,
                        }}
                      >
                        {provider.active ? (
                          <Typography
                            sx={{
                              fontSize: 12,
                              color: "#2e9e5b",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {t("aiInUse")}
                          </Typography>
                        ) : (
                          <Button
                            variant="outlined"
                            size="small"
                            disabled={switchingAiKey === provider.key}
                            data-guide={`settings-ai-use-${provider.key}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleSwitchAiProvider(provider.key);
                            }}
                            sx={{
                              minWidth: 104,
                              borderRadius: "999px",
                              textTransform: "none",
                              color: "var(--pm-color-primary)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {switchingAiKey === provider.key ? (
                              <CircularProgress size={16} sx={{ color: "var(--pm-color-primary)" }} />
                            ) : (
                              t("aiUseAsSystem")
                            )}
                          </Button>
                        )}
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={
                            <EditOutlined sx={{ fontSize: 14 }} />
                          }
                          data-guide={`settings-ai-edit-${provider.key}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleOpenAiEditor(provider);
                          }}
                          sx={{
                            minWidth: 0,
                            px: 1.5,
                            borderRadius: "999px",
                            textTransform: "none",
                            color: "var(--pm-color-text-secondary)",
                            borderColor: "var(--pm-color-border)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {t("aiConfigure")}
                        </Button>
                      </Stack>
                    </Stack>
                    <Collapse in={editingAiKey === provider.key}>                      <Box sx={editorBodySx}>
                        <Typography sx={editorTitleSx}>
                          {t("aiEditTitle")} · {label}
                        </Typography>
                        <TextField
                          fullWidth
                          label={t("aiBaseUrlLabel")}
                          value={aiBaseUrl}
                          onChange={(event) => setAiBaseUrl(event.target.value)}
                          disabled={aiBusy}
                          placeholder={t("aiBaseUrlPlaceholder")}
                          sx={pillFieldSx}
                        />
                        <TextField
                          fullWidth
                          label={t("aiApiKeyLabel")}
                          type="password"
                          value={aiApiKey}
                          onChange={(event) => setAiApiKey(event.target.value)}
                          disabled={aiBusy}
                          placeholder={t("aiApiKeyPlaceholder")}
                          sx={{ ...pillFieldSx, mt: 1.5 }}
                        />
                        <Stack
                          direction="row"
                          sx={{
                            alignItems: "center",
                            justifyContent: "space-between",
                            columnGap: 2,
                            mt: 2,
                          }}
                        >
                          <Typography
                            sx={{
                              fontSize: 12,
                              lineHeight: 1.5,
                              color: "var(--pm-color-text-hint)",
                            }}
                          >
                            {provider.hasKey
                              ? `${t("aiKeyConfigured")}: ${provider.maskedKey ?? ""}`
                              : t("aiKeyNotSet")}
                          </Typography>
                          <Stack
                            direction="row"
                            spacing={1}
                            sx={{ flexShrink: 0 }}
                          >
                            <Button
                              variant="outlined"
                              size="small"
                              disabled={aiBusy || aiTestingKey === provider.key}
                              onClick={() => void handleTestAiProvider()}
                              sx={{
                                minWidth: 76,
                                borderRadius: "999px",
                                textTransform: "none",
                                color: "var(--pm-color-text-secondary)",
                                borderColor: "var(--pm-color-border)",
                              }}
                            >
                              {aiTestingKey === provider.key ? (
                                <CircularProgress
                                  size={16}
                                  sx={{ color: "var(--pm-color-primary)" }}
                                />
                              ) : (
                                t("aiTest")
                              )}
                            </Button>
                            <Button
                              variant="outlined"
                              size="small"
                              disabled={aiBusy}
                              onClick={() => setEditingAiKey(null)}
                              sx={{
                                minWidth: 76,
                                borderRadius: "999px",
                                textTransform: "none",
                                color: "var(--pm-color-primary)",
                              }}
                            >
                              {t("btnCancel")}
                            </Button>
                            <Button
                              variant="contained"
                              size="small"
                              disableElevation
                              disabled={aiBusy}
                              data-guide={`settings-ai-save-${provider.key}`}
                              onClick={() => void handleSaveAiProvider()}
                              sx={{
                                minWidth: 88,
                                borderRadius: "999px",
                                textTransform: "none",
                                color: "var(--pm-color-primary-contrast)",
                                backgroundColor: "var(--pm-color-primary)",
                                "&:hover": {
                                  backgroundColor:
                                    "var(--pm-color-primary-hover)",
                                },
                              }}
                            >
                              {aiBusy ? (
                                <CircularProgress size={16} sx={{ color: "var(--pm-color-primary)" }} />
                              ) : (
                                t("aiSave")
                              )}
                            </Button>
                          </Stack>
                        </Stack>
                        {aiTestResults[provider.key] !== undefined && (
                          <Typography
                            sx={{
                              mt: 1.5,
                              fontSize: 12,
                              lineHeight: 1.5,
                              color: aiTestResults[provider.key].ok
                                ? "#2e9e5b"
                                : "#cf1322",
                            }}
                          >
                            {aiTestResults[provider.key].text}
                          </Typography>
                        )}
                      </Box>
                    </Collapse>
                  </Box>
                );
              })
              )}
              </Box>
            )}
          </SettingSection>
        </Stack>
      </Box>

      <Snackbar
        open={noticeOpen}
        autoHideDuration={2500}
        onClose={() => setNoticeOpen(false)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        sx={{ mt: 2 }}
      >
        <Alert
          severity="info"
          variant="outlined"
          sx={{
            borderRadius: 999,
            borderColor: "rgba(22, 100, 255, 0.4)",
            backgroundColor: "rgba(255, 255, 255, 0.66)",
            backdropFilter: "blur(18px) saturate(160%)",
            WebkitBackdropFilter: "blur(18px) saturate(160%)",
            boxShadow: "0 8px 24px rgb(16 24 40 / 0.08)",
          }}
        >
          {noticeText}
        </Alert>
      </Snackbar>
    </Box>
  );
}
