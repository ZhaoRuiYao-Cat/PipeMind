"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CheckRounded from "@mui/icons-material/CheckRounded";
import Collapse from "@mui/material/Collapse";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import AddRounded from "@mui/icons-material/AddRounded";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import EditOutlined from "@mui/icons-material/EditOutlined";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import InsertDriveFileRounded from "@mui/icons-material/InsertDriveFileRounded";
import Paper from "@mui/material/Paper";
import PublicRounded from "@mui/icons-material/PublicRounded";
import SearchRounded from "@mui/icons-material/SearchRounded";
import Stack from "@mui/material/Stack";
import HttpRounded from "@mui/icons-material/HttpRounded";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useI18n } from "@/lib/i18n";
import { API_BASE } from "@/lib/api";
import { onDataChanged } from "@/lib/data-events";
import { dispatchGisActiveChange } from "@/lib/gis-source";

export type GisSource = "local" | "api";

interface GisFileItem {
  id: number;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
  shared?: boolean;
  owner?: { id: number; username: string };
}

interface PickedFile {
  id: number;
  name: string;
}

interface ApiSourceItem {
  id: number;
  name: string;
  url: string;
  token?: string;
}

const SOURCE_KEY = "pm_gis_source";
const FILE_KEY = "pm_gis_source_file";
const API_SOURCES_KEY = "pm_gis_api_sources";
const API_PICKED_KEY = "pm_gis_api_picked";
const ACTIVE_KIND_KEY = "pm_gis_active_kind";

function readJson<T>(key: string, fallback: T): T {
  if (typeof globalThis === "undefined") {
    return fallback;
  }
  try {
    const raw = globalThis.localStorage.getItem(key);
    if (raw === null) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${unit}`;
}

function maskApiUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const port = parsed.port ? `:${parsed.port}` : "";
    const rawPath = parsed.pathname === "/" ? "" : parsed.pathname;
    const path =
      rawPath.length > 26 ? `${rawPath.slice(0, 24)}…` : rawPath;
    const queryHint = parsed.search ? (parsed.search.length > 1 ? "?" : "") : "";
    return `${host}${port}${path}${queryHint}`;
  } catch {
    return url.length > 44 ? `${url.slice(0, 42)}…` : url;
  }
}

export function GisSourcePicker() {
  const { lang } = useI18n();
  const zh = lang === "zh-CN";
  const [source, setSource] = useState<GisSource>(() =>
    readJson<GisSource>(SOURCE_KEY, "local"),
  );
  const [mine, setMine] = useState<GisFileItem[]>([]);
  const [shared, setShared] = useState<GisFileItem[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [fileSearch, setFileSearch] = useState("");
  const [picked, setPicked] = useState<PickedFile | null>(() =>
    readJson<PickedFile | null>(FILE_KEY, null),
  );
  const [apiSources, setApiSources] = useState<ApiSourceItem[]>(() =>
    readJson<ApiSourceItem[]>(API_SOURCES_KEY, []),
  );
  const [apiPickedId, setApiPickedId] = useState<number | null>(() =>
    readJson<number | null>(API_PICKED_KEY, null),
  );
  const [apiSearch, setApiSearch] = useState("");
  const [addingApi, setAddingApi] = useState(false);
  const [apiDraftName, setApiDraftName] = useState("");
  const [apiDraftUrl, setApiDraftUrl] = useState("");
  const [apiDraftToken, setApiDraftToken] = useState("");
  const [apiDraftError, setApiDraftError] = useState("");
  const [filesOpen, setFilesOpen] = useState(true);
  const [apiOpen, setApiOpen] = useState(true);
  const [selectedKind, setSelectedKind] = useState<"file" | "api" | null>(
    () => {
      if (typeof globalThis === "undefined") {
        return null;
      }
      const savedFile = readJson<PickedFile | null>(FILE_KEY, null);
      const savedApiId = readJson<number | null>(API_PICKED_KEY, null);
      const savedSources = readJson<ApiSourceItem[]>(API_SOURCES_KEY, []);
      if (savedFile) {
        return "file";
      }
      if (savedApiId !== null && savedSources.some((s) => s.id === savedApiId)) {
        return "api";
      }
      return null;
    },
  );
  const [viewMode, setViewMode] = useState<"select" | "chosen">(() => {
    if (typeof globalThis === "undefined") {
      return "select";
    }
    const savedFile = readJson<PickedFile | null>(FILE_KEY, null);
    const savedApiId = readJson<number | null>(API_PICKED_KEY, null);
    const savedSources = readJson<ApiSourceItem[]>(API_SOURCES_KEY, []);
    const hasSaved =
      savedFile !== null ||
      (savedApiId !== null &&
        savedSources.some((item) => item.id === savedApiId));
    return hasSaved ? "chosen" : "select";
  });
  const selectRowRef = useRef<HTMLDivElement | null>(null);
  const chosenRowRef = useRef<HTMLDivElement | null>(null);
  const [barWidth, setBarWidth] = useState<number | null>(null);

  const t = (zhText: string, enText: string): string =>
    zh ? zhText : enText;

  const setActiveKind = (kind: "file" | "api"): void => {
    try {
      globalThis.localStorage.setItem(ACTIVE_KIND_KEY, JSON.stringify(kind));
    } catch {
      void 0;
    }
    dispatchGisActiveChange();
  };

  useEffect(() => {
    try {
      globalThis.localStorage.setItem(SOURCE_KEY, JSON.stringify(source));
    } catch {
      void 0;
    }
  }, [source]);

  useEffect(() => {
    try {
      if (picked) {
        globalThis.localStorage.setItem(FILE_KEY, JSON.stringify(picked));
      } else {
        globalThis.localStorage.removeItem(FILE_KEY);
      }
    } catch {
      void 0;
    }
  }, [picked]);

  useEffect(() => {
    try {
      globalThis.localStorage.setItem(API_SOURCES_KEY, JSON.stringify(apiSources));
      if (apiPickedId !== null) {
        globalThis.localStorage.setItem(API_PICKED_KEY, JSON.stringify(apiPickedId));
      } else {
        globalThis.localStorage.removeItem(API_PICKED_KEY);
      }
    } catch {
      void 0;
    }
  }, [apiSources, apiPickedId]);

  const loadFiles = useCallback(async (): Promise<void> => {
    try {
      const [mineRes, sharedRes] = await Promise.all([
        fetch(`${API_BASE}/data-files`, { credentials: "include" }),
        fetch(`${API_BASE}/data-files/shared`, { credentials: "include" }),
      ]);
      if (mineRes.ok) {
        const data = (await mineRes.json()) as { files?: GisFileItem[] };
        setMine(data.files ?? []);
      }
      if (sharedRes.ok) {
        const data = (await sharedRes.json()) as { files?: GisFileItem[] };
        setShared(data.files ?? []);
      }
    } catch {
      void 0;
    } finally {
      setFilesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFiles();
    const unsubscribe = onDataChanged(() => {
      void loadFiles();
    });
    return unsubscribe;
  }, [loadFiles]);

  const optionButton = (
    value: GisSource,
    label: string,
    dot: boolean,
  ): React.ReactNode => (
    <Button
      size="small"
      disableRipple
      data-guide={value === "local" ? "gis-source-local" : "gis-source-api"}
      onClick={() => setSource(value)}
      startIcon={
        dot ? (
          <Box
            component="span"
            sx={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              flexShrink: 0,
              backgroundColor:
                source === value
                  ? "var(--pm-color-primary)"
                  : "var(--pm-color-text-hint)",
            }}
          />
        ) : (
          <HttpRounded
            sx={{
              fontSize: 14,
              flexShrink: 0,
              color:
                source === value
                  ? "var(--pm-color-primary)"
                  : "var(--pm-color-text-hint)",
            }}
          />
        )
      }
      sx={{
        flexShrink: 0,
        minWidth: 0,
        px: 1.5,
        py: 0.5,
        borderRadius: "999px",
        textTransform: "none",
        whiteSpace: "nowrap",
        fontSize: 12,
        fontWeight: source === value ? 600 : 500,
        color:
          source === value
            ? "var(--pm-color-primary)"
            : "var(--pm-color-text-secondary)",
        backgroundColor:
          source === value
            ? "var(--pm-color-primary-soft)"
            : "transparent",
        "&:hover": {
          backgroundColor:
            source === value
              ? "var(--pm-color-primary-soft)"
              : "rgba(0, 0, 0, 0.04)",
        },
      }}
    >
      {label}
    </Button>
  );

  const fileRow = (file: GisFileItem, withOwner: boolean): React.ReactNode => {
    const active = picked?.id === file.id;
    const date = new Date(file.createdAt);
    const time = Number.isNaN(date.getTime())
      ? "—"
      : date.toLocaleString(zh ? "zh-CN" : "en-US", { hour12: false });
    return (
      <Stack
        key={`${withOwner ? "s" : "m"}-${file.id}`}
        direction="row"
        data-guide={withOwner ? `gis-shared-${file.id}` : `gis-file-${file.id}`}
        onClick={() => {
          setPicked({ id: file.id, name: file.name });
          setSelectedKind("file");
          setViewMode("chosen");
          setActiveKind("file");
        }}
        sx={{
          alignItems: "center",
          columnGap: 1,
          px: 1.5,
          py: 1,
          minWidth: 0,
          borderRadius: "10px",
          cursor: "pointer",
          backgroundColor: active ? "var(--pm-color-primary-soft)" : "transparent",
          "&:hover": {
            backgroundColor: active
              ? "var(--pm-color-primary-soft)"
              : "rgba(0, 0, 0, 0.04)",
          },
        }}
      >
        <InsertDriveFileRounded
          sx={{
            fontSize: 18,
            flexShrink: 0,
            color: active ? "var(--pm-color-primary)" : "var(--pm-color-text-hint)",
          }}
        />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            sx={{
              fontSize: 13,
              fontWeight: active ? 600 : 500,
              color: "var(--pm-color-text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {file.name}
          </Typography>
          <Stack direction="row" sx={{ alignItems: "center", columnGap: 0.75, minWidth: 0 }}>
            <Typography sx={{ fontSize: 11, color: "var(--pm-color-text-hint)" }}>
              {formatSize(file.size)} · {time}
            </Typography>
            {withOwner && file.owner && (
              <Stack direction="row" sx={{ alignItems: "center", columnGap: 0.25 }}>
                <PublicRounded sx={{ fontSize: 11, color: "var(--pm-color-text-hint)" }} />
                <Typography sx={{ fontSize: 11, color: "var(--pm-color-text-hint)" }}>
                  {file.owner.username}
                </Typography>
              </Stack>
            )}
          </Stack>
        </Box>
        {active && (
          <CheckRounded sx={{ fontSize: 17, flexShrink: 0, color: "var(--pm-color-primary)" }} />
        )}
      </Stack>
    );
  };

  const fileGroup = (
    title: string,
    files: GisFileItem[],
    withOwner: boolean,
    emptyText: string,
  ): React.ReactNode => (
    <Box>
      <Typography
        sx={{
          px: 1,
          pt: 1,
          pb: 0.5,
          fontSize: 11,
          fontWeight: 600,
          color: "var(--pm-color-text-hint)",
        }}
      >
        {title}
      </Typography>
      {files.length === 0 ? (
        <Typography sx={{ px: 1.5, py: 1, fontSize: 12, color: "var(--pm-color-text-hint)" }}>
          {emptyText}
        </Typography>
      ) : (
        files.map((file) => fileRow(file, withOwner))
      )}
    </Box>
  );

  const submitApiSource = (): void => {
    const name = apiDraftName.trim();
    const url = apiDraftUrl.trim();
    if (!name) {
      setApiDraftError(t("请输入名称", "Enter a name"));
      return;
    }
    if (!/^https?:\/\/.+/i.test(url)) {
      setApiDraftError(t("请输入以 http(s):// 开头的地址", "Enter an http(s):// URL"));
      return;
    }
    const token = apiDraftToken.trim();
    const item: ApiSourceItem = {
      id: Date.now(),
      name,
      url,
      token: token.length > 0 ? token : undefined,
    };
    setApiSources((current) => [...current, item]);
    setApiPickedId(item.id);
    setSelectedKind("api");
    setViewMode("chosen");
    setActiveKind("api");
    setAddingApi(false);
    setApiDraftName("");
    setApiDraftUrl("");
    setApiDraftToken("");
    setApiDraftError("");
  };

  const removeApiSource = (id: number): void => {
    setApiSources((current) => current.filter((item) => item.id !== id));
    setApiPickedId((current) => (current === id ? null : current));
    if (apiPickedId === id) {
      setSelectedKind(null);
      setViewMode("select");
    }
  };

  const keyword = apiSearch.trim().toLowerCase();
  const visibleApiSources = apiSources.filter(
    (item) =>
      keyword.length === 0 ||
      item.name.toLowerCase().includes(keyword) ||
      item.url.toLowerCase().includes(keyword),
  );
  const selectedApiSource =
    apiSources.find((item) => item.id === apiPickedId) ?? null;

  useEffect(() => {
    const target =
      viewMode === "select" ? selectRowRef.current : chosenRowRef.current;
    if (!target) {
      return;
    }
    const measure = (): void => {
      setBarWidth(target.getBoundingClientRect().width);
    };
    measure();
    const frame = globalThis.requestAnimationFrame(measure);
    return () => {
      globalThis.cancelAnimationFrame(frame);
    };
  }, [
    viewMode,
    selectedKind,
    picked?.id,
    picked?.name,
    selectedApiSource?.id,
    selectedApiSource?.url,
  ]);

  const apiFormFieldSx = {
    "& .MuiOutlinedInput-notchedOutline": {
      borderRadius: "999px",
      borderColor: "var(--pm-color-border)",
    },
    "& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline": {
      borderColor: "#1664ff",
    },
    "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": {
      borderColor: "#1664ff",
      borderWidth: 2,
    },
  };

  const searchField = (
    value: string,
    onChange: (value: string) => void,
  ): React.ReactNode => (
    <TextField
      fullWidth
      size="small"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={t("搜索…", "Search…")}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchRounded sx={{ fontSize: 17, color: "var(--pm-color-text-hint)" }} />
            </InputAdornment>
          ),
        },
      }}
      sx={{
        "& .MuiOutlinedInput-notchedOutline": {
          borderRadius: "999px",
          borderColor: "var(--pm-color-border)",
        },
        "& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline": {
          borderColor: "#1664ff",
        },
        "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": {
          borderColor: "#1664ff",
          borderWidth: 2,
        },
      }}
    />
  );

  return (
    <Stack direction="column" sx={{ alignItems: "flex-end", rowGap: 1 }}>
      <Paper
        elevation={0}
        variant="outlined"
        data-guide="gis-source-bar"
        sx={{
          display: "inline-block",
          maxWidth: "min(92vw, 460px)",
          overflow: "hidden",
          borderRadius: "999px",
          borderColor: "var(--pm-color-border)",
          backgroundColor: "rgba(255, 255, 255, 0.82)",
          backdropFilter: "blur(14px) saturate(150%)",
          WebkitBackdropFilter: "blur(14px) saturate(150%)",
          boxShadow: "0 2px 6px rgb(16 24 40 / 0.05)",
          width: barWidth ? `${Math.round(barWidth)}px` : "auto",
          transition: "width 260ms cubic-bezier(0.22, 0.61, 0.36, 1)",
        }}
      >
        <Box
          sx={{
            position: "relative",
            height: 44,
          }}
        >
          <Stack
            ref={selectRowRef}
            direction="row"
            data-guide="gis-source-select"
            sx={{
              position: "absolute",
              top: 0,
              left: 0,
              height: 44,
              alignItems: "center",
              columnGap: 1.25,
              px: 1.5,
              whiteSpace: "nowrap",
              transition: "transform 260ms cubic-bezier(0.22, 0.61, 0.36, 1)",
              transform:
                viewMode === "select"
                  ? "translateX(0)"
                  : "translateX(-100%)",
              opacity: viewMode === "select" ? 1 : 0,
              pointerEvents: viewMode === "select" ? "auto" : "none",
            }}
          >
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--pm-color-text-secondary)",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {t("GIS 数据源", "GIS source")}
            </Typography>
            <Stack direction="row" sx={{ alignItems: "center", columnGap: 0.25 }}>
              {optionButton("local", t("自建数据", "Self data"), true)}
              {optionButton("api", t("API 数据", "API data"), false)}
            </Stack>
          </Stack>
          <Stack
            ref={chosenRowRef}
            direction="row"
            data-guide="gis-source-chosen"
            sx={{
              position: "absolute",
              top: 0,
              left: 0,
              height: 44,
              alignItems: "center",
              columnGap: 0.75,
              px: 1.25,
              whiteSpace: "nowrap",
              transition: "transform 260ms cubic-bezier(0.22, 0.61, 0.36, 1)",
              transform:
                viewMode === "chosen"
                  ? "translateX(0)"
                  : "translateX(100%)",
              opacity: viewMode === "chosen" ? 1 : 0,
              pointerEvents: viewMode === "chosen" ? "auto" : "none",
            }}
          >
            {selectedKind === "file" ? (
              <InsertDriveFileRounded sx={{ fontSize: 16, flexShrink: 0, color: "var(--pm-color-primary)" }} />
            ) : (
              <HttpRounded sx={{ fontSize: 16, flexShrink: 0, color: "var(--pm-color-primary)" }} />
            )}
            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--pm-color-text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {selectedKind === "file"
                ? picked?.name ?? t("未选择", "Not selected")
                : selectedApiSource
                  ? maskApiUrl(selectedApiSource.url)
                  : t("未选择", "Not selected")}
            </Typography>
            <Tooltip title={t("编辑数据源", "Edit source")} placement="bottom">
              <IconButton
                size="small"
                data-guide="gis-source-edit"
                onClick={() => {
                  setViewMode("select");
                  setSource(selectedKind === "file" ? "local" : "api");
                }}
                sx={{
                  width: 30,
                  height: 30,
                  ml: 0.25,
                  flexShrink: 0,
                  color: "var(--pm-color-text-secondary)",
                  "&:hover": {
                    backgroundColor: "var(--pm-color-primary-soft)",
                    color: "var(--pm-color-primary)",
                  },
                }}
              >
                <EditOutlined sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>
      </Paper>

      {viewMode === "select" && source === "local" && (
        <Paper
          elevation={0}
          variant="outlined"
          data-guide="gis-local-files"
          sx={{
            width: 360,
            maxWidth: "calc(100vw - 32px)",
            borderRadius: "16px",
            borderColor: "var(--pm-color-border)",
            backgroundColor: "rgba(255, 255, 255, 0.9)",
            backdropFilter: "blur(18px) saturate(160%)",
            WebkitBackdropFilter: "blur(18px) saturate(160%)",
            boxShadow: "0 8px 24px rgb(16 24 40 / 0.08)",
            overflow: "hidden",
          }}
        >
          <Stack
            direction="row"
            data-guide="gis-local-toggle"
            onClick={() => setFilesOpen((value) => !value)}
            sx={{
              alignItems: "center",
              columnGap: 0.75,
              px: 1.5,
              py: 1,
              cursor: "pointer",
              borderBottom: filesOpen ? "1px solid var(--pm-color-divider)" : "none",
              "&:hover": {
                backgroundColor: "rgba(0, 0, 0, 0.03)",
              },
            }}
          >
            <Typography
              sx={{
                flex: 1,
                fontSize: 13,
                fontWeight: 600,
                color: "var(--pm-color-text-secondary)",
                whiteSpace: "nowrap",
              }}
            >
              {t("自建数据文件", "Self-hosted files")}
            </Typography>
            <ExpandMoreRounded
              sx={{
                fontSize: 18,
                flexShrink: 0,
                color: "var(--pm-color-text-hint)",
                transform: filesOpen ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 200ms ease",
              }}
            />
          </Stack>
          <Collapse in={filesOpen}>
            <Box sx={{ px: 1.5, pt: 1.5 }}>
              {searchField(fileSearch, setFileSearch)}
            </Box>
            <Box sx={{ px: 1, pb: 1, maxHeight: 320, overflowY: "auto" }}>
              {filesLoading ? (
                <Typography sx={{ px: 1.5, py: 2, fontSize: 12, color: "var(--pm-color-text-hint)" }}>
                  {t("加载中…", "Loading…")}
                </Typography>
              ) : (
                <>
                  {fileGroup(
                    t(`我的文件（${mine.filter((f) => !fileSearch.trim() || f.name.toLowerCase().includes(fileSearch.trim().toLowerCase())).length}）`, `My files (${mine.filter((f) => !fileSearch.trim() || f.name.toLowerCase().includes(fileSearch.trim().toLowerCase())).length})`),
                    mine.filter((f) => !fileSearch.trim() || f.name.toLowerCase().includes(fileSearch.trim().toLowerCase())),
                    false,
                    fileSearch.trim()
                      ? t("无匹配文件", "No matching files")
                      : t("还没有上传文件", "No files uploaded yet"),
                  )}
                  {fileGroup(
                    t(`共享数据（${shared.filter((f) => !fileSearch.trim() || f.name.toLowerCase().includes(fileSearch.trim().toLowerCase())).length}）`, `Shared data (${shared.filter((f) => !fileSearch.trim() || f.name.toLowerCase().includes(fileSearch.trim().toLowerCase())).length})`),
                    shared.filter((f) => !fileSearch.trim() || f.name.toLowerCase().includes(fileSearch.trim().toLowerCase())),
                    true,
                    fileSearch.trim()
                      ? t("无匹配文件", "No matching files")
                      : t("暂无其他用户共享的数据", "No shared data from others"),
                  )}
                </>
              )}
            </Box>
          </Collapse>
        </Paper>
      )}

      {viewMode === "select" && source === "api" && (
        <Paper
          elevation={0}
          variant="outlined"
          data-guide="gis-api-panel"
          sx={{
            width: 360,
            maxWidth: "calc(100vw - 32px)",
            borderRadius: "16px",
            borderColor: "var(--pm-color-border)",
            backgroundColor: "rgba(255, 255, 255, 0.9)",
            backdropFilter: "blur(18px) saturate(160%)",
            WebkitBackdropFilter: "blur(18px) saturate(160%)",
            boxShadow: "0 8px 24px rgb(16 24 40 / 0.08)",
            overflow: "hidden",
          }}
        >
          <Stack
            direction="row"
            data-guide="gis-api-toggle"
            onClick={() => setApiOpen((value) => !value)}
            sx={{
              alignItems: "center",
              columnGap: 0.75,
              px: 1.5,
              py: 1,
              cursor: "pointer",
              borderBottom: apiOpen ? "1px solid var(--pm-color-divider)" : "none",
              "&:hover": {
                backgroundColor: "rgba(0, 0, 0, 0.03)",
              },
            }}
          >
            <Typography
              sx={{
                flex: 1,
                fontSize: 13,
                fontWeight: 600,
                color: "var(--pm-color-text-secondary)",
                whiteSpace: "nowrap",
              }}
            >
              {t("API 数据源", "API sources")}
            </Typography>
            <ExpandMoreRounded
              sx={{
                fontSize: 18,
                flexShrink: 0,
                color: "var(--pm-color-text-hint)",
                transform: apiOpen ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 200ms ease",
              }}
            />
          </Stack>
          <Collapse in={apiOpen}>
          <Box sx={{ pt: 1.5, pb: 2 }}>
            <Stack direction="row" sx={{ alignItems: "center", px: 1.5, columnGap: 1 }}>
              <Box sx={{ flex: 1 }}>{searchField(apiSearch, setApiSearch)}</Box>
            <Button
              size="small"
              variant="contained"
              disableElevation
              startIcon={<AddRounded sx={{ fontSize: 16 }} />}
              data-guide="gis-api-add"
              onClick={() => {
                setAddingApi(true);
                setApiDraftError("");
              }}
              sx={{
                flexShrink: 0,
                borderRadius: "999px",
                textTransform: "none",
                px: 1.5,
                whiteSpace: "nowrap",
                color: "var(--pm-color-primary-contrast)",
                backgroundColor: "var(--pm-color-primary)",
                "&:hover": {
                  backgroundColor: "var(--pm-color-primary-hover)",
                },
              }}
            >
              {t("新增", "Add")}
            </Button>
          </Stack>

          <Box sx={{ px: 1, pt: 2.5, pb: 1, maxHeight: 320, overflowY: "auto" }}>
            {apiSources.length === 0 && !addingApi ? (
              <Typography sx={{ px: 1.5, py: 2, fontSize: 12, color: "var(--pm-color-text-hint)" }}>
                {t("尚未配置 API 数据源，点击“新增”添加", "No API source yet. Click Add to create one")}
              </Typography>
            ) : (
              visibleApiSources.map((item) => {
                const active = apiPickedId === item.id;
                return (
                  <Stack
                    key={item.id}
                    direction="row"
                    data-guide={`gis-api-item-${item.id}`}
                    onClick={() => {
                      setApiPickedId(item.id);
                      setSelectedKind("api");
                      setViewMode("chosen");
                      setActiveKind("api");
                    }}
                    sx={{
                      alignItems: "center",
                      columnGap: 1,
                      px: 1.5,
                      py: 1,
                      minWidth: 0,
                      borderRadius: "10px",
                      cursor: "pointer",
                      backgroundColor: active ? "var(--pm-color-primary-soft)" : "transparent",
                      "&:hover": {
                        backgroundColor: active
                          ? "var(--pm-color-primary-soft)"
                          : "rgba(0, 0, 0, 0.04)",
                      },
                    }}
                  >
                    <HttpRounded
                      sx={{
                        fontSize: 18,
                        flexShrink: 0,
                        color: active ? "var(--pm-color-primary)" : "var(--pm-color-text-hint)",
                      }}
                    />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography
                        sx={{
                          fontSize: 13,
                          fontWeight: active ? 600 : 500,
                          color: "var(--pm-color-text-primary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.name}
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: 11,
                          color: "var(--pm-color-text-hint)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.url}
                      </Typography>
                    </Box>
                    {item.token && (
                      <Box
                        component="span"
                        sx={{
                          flexShrink: 0,
                          px: 0.75,
                          py: 0.25,
                          borderRadius: "999px",
                          fontSize: 10,
                          color: "#1664ff",
                          backgroundColor: "rgba(22, 100, 255, 0.08)",
                        }}
                      >
                        {t("密钥", "Key")}
                      </Box>
                    )}
                    {active && (
                      <CheckRounded sx={{ fontSize: 17, flexShrink: 0, color: "var(--pm-color-primary)" }} />
                    )}
                    <Tooltip title={t("删除", "Delete")} placement="top">
                      <Box
                        component="span"
                        data-guide={`gis-api-delete-${item.id}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          removeApiSource(item.id);
                        }}
                        sx={{
                          flexShrink: 0,
                          width: 26,
                          height: 26,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "50%",
                          color: "var(--pm-color-text-hint)",
                          cursor: "pointer",
                          "&:hover": {
                            backgroundColor: "rgba(207, 19, 34, 0.08)",
                            color: "#cf1322",
                          },
                        }}
                      >
                        <DeleteOutlineRounded sx={{ fontSize: 16 }} />
                      </Box>
                    </Tooltip>
                  </Stack>
                );
              })
            )}

            {addingApi && (
              <Box sx={{ px: 1.5, pt: 2.5, pb: 1 }}>
                <Stack spacing={1.25}>
                  <TextField
                    size="small"
                    label={t("名称", "Name")}
                    value={apiDraftName}
                    onChange={(event) => setApiDraftName(event.target.value)}
                    sx={apiFormFieldSx}
                  />
                  <TextField
                    size="small"
                    label={t("API 地址", "API URL")}
                    placeholder="https://example.com/geojson"
                    value={apiDraftUrl}
                    onChange={(event) => setApiDraftUrl(event.target.value)}
                    sx={apiFormFieldSx}
                  />
                  <TextField
                    size="small"
                    label={t("密钥（可选）", "Token (optional)")}
                    type="password"
                    value={apiDraftToken}
                    onChange={(event) => setApiDraftToken(event.target.value)}
                    sx={apiFormFieldSx}
                  />
                    {apiDraftError && (
                      <Typography sx={{ fontSize: 12, color: "#cf1322" }}>
                        {apiDraftError}
                      </Typography>
                    )}
                    <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => {
                          setAddingApi(false);
                          setApiDraftError("");
                        }}
                        sx={{
                          borderRadius: "999px",
                          textTransform: "none",
                          color: "var(--pm-color-primary)",
                        }}
                      >
                        {t("取消", "Cancel")}
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        disableElevation
                        data-guide="gis-api-save"
                        onClick={submitApiSource}
                        sx={{
                          borderRadius: "999px",
                          textTransform: "none",
                          color: "var(--pm-color-primary-contrast)",
                          backgroundColor: "var(--pm-color-primary)",
                          "&:hover": {
                            backgroundColor: "var(--pm-color-primary-hover)",
                          },
                        }}
                      >
                        {t("保存", "Save")}
                      </Button>
                    </Stack>
                </Stack>
              </Box>
            )}
          </Box>
          </Box>
          </Collapse>
        </Paper>
      )}
    </Stack>
  );
}
