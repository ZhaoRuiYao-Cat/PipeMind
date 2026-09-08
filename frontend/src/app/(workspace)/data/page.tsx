"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import SearchRounded from "@mui/icons-material/SearchRounded";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import UploadFileRounded from "@mui/icons-material/UploadFileRounded";
import DownloadRounded from "@mui/icons-material/DownloadRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import FolderSharedRounded from "@mui/icons-material/FolderSharedRounded";
import InsertDriveFileRounded from "@mui/icons-material/InsertDriveFileRounded";
import PublicRounded from "@mui/icons-material/PublicRounded";
import DriveFileMoveOutlined from "@mui/icons-material/DriveFileMoveOutlined";
import { useI18n } from "@/lib/i18n";
import { API_BASE } from "@/lib/api";
import { notifyDataChanged, onDataChanged } from "@/lib/data-events";
import { IOSSwitch } from "@/components/ios-switch";

interface DataFileView {
  id: number;
  name: string;
  mime: string;
  size: number;
  sha256: string;
  shared: boolean;
  createdAt: string;
  owner?: { id: number; username: string };
}

type Lang = "zh-CN" | "en-US";

const T: Record<string, Record<Lang, string>> = {
  title: { "zh-CN": "数据", "en-US": "Data" },
  desc: {
    "zh-CN": "上传与管理文件；私有文件拖到右侧即共享，共享文件拖回左侧即取消",
    "en-US": "Upload and manage files; drag a private file right to share it, or drag a shared file back left to unshare",
  },
  uploadSection: { "zh-CN": "上传文件", "en-US": "Upload file" },
  uploadHint: {
    "zh-CN": "文件以流式传输上传，单个文件上限 2GB，默认不共享",
    "en-US": "Files stream to the server; single file up to 2GB, private by default",
  },
  chooseFile: { "zh-CN": "选择文件", "en-US": "Choose file" },
  uploading: { "zh-CN": "上传中", "en-US": "Uploading" },
  searchPlaceholder: {
    "zh-CN": "搜索文件名…",
    "en-US": "Search file name…",
  },
  mySection: { "zh-CN": "我的文件", "en-US": "My files" },
  myHint: {
    "zh-CN": "私有 · 拖到右侧共享",
    "en-US": "Private · drag right to share",
  },
  sharedSection: { "zh-CN": "共享数据", "en-US": "Shared data" },
  sharedOwnTitle: { "zh-CN": "我共享的", "en-US": "Shared by me" },
  sharedOtherTitle: { "zh-CN": "其他用户的共享", "en-US": "Shared by others" },
  mineEmpty: {
    "zh-CN": "没有私有文件，上传或拖回即可管理",
    "en-US": "No private files. Upload or drag files back to manage them",
  },
  sharedOwnEmpty: { "zh-CN": "还没有共享文件", "en-US": "Nothing shared yet" },
  sharedEmpty: {
    "zh-CN": "暂无其他用户共享的数据",
    "en-US": "No shared data from other users",
  },
  noMatch: { "zh-CN": "没有匹配的文件", "en-US": "No matching files" },
  download: { "zh-CN": "下载", "en-US": "Download" },
  deleting: { "zh-CN": "删除中", "en-US": "Deleting" },
  deleteFile: { "zh-CN": "删除", "en-US": "Delete" },
  sharedBadge: { "zh-CN": "共享中", "en-US": "Shared" },
  dragDropOwn: { "zh-CN": "拖到此处共享", "en-US": "Drop to share" },
  by: { "zh-CN": "来自", "en-US": "by" },
  toastUploaded: { "zh-CN": "上传成功", "en-US": "Upload complete" },
  toastUploadFailed: { "zh-CN": "上传失败", "en-US": "Upload failed" },
  toastDownloadFailed: {
    "zh-CN": "下载失败",
    "en-US": "Download failed",
  },
  toastShareFailed: { "zh-CN": "更新共享失败", "en-US": "Share update failed" },
  toastDeleteFailed: { "zh-CN": "删除失败", "en-US": "Delete failed" },
};

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

export default function DataPage() {
  const { lang } = useI18n();
  const zh = lang === "zh-CN";
  const t = (key: string): string => T[key]?.[lang] ?? key;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [mine, setMine] = useState<DataFileView[]>([]);
  const [othersShared, setOthersShared] = useState<DataFileView[]>([]);
  const [search, setSearch] = useState("");
  const [uploadingName, setUploadingName] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [busyFile, setBusyFile] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<"mine" | "shared" | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeText, setNoticeText] = useState("");

  const showNotice = (message: string): void => {
    setNoticeText(message);
    setNoticeOpen(true);
  };

  const loadAll = useCallback(async (): Promise<void> => {
    try {
      const [mineRes, sharedRes] = await Promise.all([
        fetch(`${API_BASE}/data-files`, { credentials: "include" }),
        fetch(`${API_BASE}/data-files/shared`, { credentials: "include" }),
      ]);
      if (mineRes.ok) {
        const mineData = (await mineRes.json()) as { files?: DataFileView[] };
        setMine(mineData.files ?? []);
      }
      if (sharedRes.ok) {
        const sharedData = (await sharedRes.json()) as {
          files?: DataFileView[];
        };
        setOthersShared(sharedData.files ?? []);
      }
    } catch {
      void 0;
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const unsubscribe = onDataChanged(() => {
      void loadAll();
    });
    return unsubscribe;
  }, [loadAll]);

  const handlePickFile = (): void => {
    fileInputRef.current?.click();
  };

  const uploadFile = (file: File): void => {
    const query = [
      `name=${encodeURIComponent(file.name)}`,
      `mime=${encodeURIComponent(file.type || "application/octet-stream")}`,
      "shared=false",
    ].join("&");

    setUploadingName(file.name);
    setUploadProgress(0);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/data-files/upload?${query}`);
    xhr.withCredentials = true;
    xhr.responseType = "json";
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (event: ProgressEvent): void => {
      if (event.lengthComputable) {
        const ratio = event.total > 0 ? event.loaded / event.total : 0;
        setUploadProgress(Math.min(99, Math.round(ratio * 100)));
      }
    };
    xhr.onload = (): void => {
      setUploadingName(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        showNotice(t("toastUploaded"));
        notifyDataChanged();
        void loadAll();
      } else {
        showNotice(t("toastUploadFailed"));
      }
    };
    xhr.onerror = (): void => {
      setUploadingName(null);
      showNotice(t("toastUploadFailed"));
    };
    xhr.upload.onload = (): void => {
      setUploadProgress(100);
    };
    xhr.send(file);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    event.target.value = "";
    uploadFile(file);
  };

  const applyShared = async (
    file: DataFileView,
    nextShared: boolean,
  ): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE}/data-files/${file.id}/shared`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shared: nextShared }),
      });
      if (!response.ok) {
        throw new Error("failed");
      }
      notifyDataChanged();
      void loadAll();
    } catch {
      showNotice(t("toastShareFailed"));
    }
  };

  const handleToggleShare = (file: DataFileView): void => {
    void applyShared(file, !file.shared);
  };

  const handleDownload = async (file: DataFileView): Promise<void> => {
    try {
      const response = await fetch(
        `${API_BASE}/data-files/${file.id}/content`,
        { credentials: "include" },
      );
      if (!response.ok) {
        throw new Error("failed");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      showNotice(t("toastDownloadFailed"));
    }
  };

  const handleDelete = async (file: DataFileView): Promise<void> => {
    setBusyFile(file.id);
    try {
      const response = await fetch(`${API_BASE}/data-files/${file.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("failed");
      }
      notifyDataChanged();
      void loadAll();
    } catch {
      showNotice(t("toastDeleteFailed"));
    } finally {
      setBusyFile(null);
    }
  };

  const fileMeta = (file: DataFileView): string => {
    const date = new Date(file.createdAt);
    const time = Number.isNaN(date.getTime())
      ? "—"
      : date.toLocaleString(lang === "zh-CN" ? "zh-CN" : "en-US", {
          hour12: false,
        });
    return `${formatSize(file.size)} · ${time}`;
  };

  const matches = useMemo(
    () => (file: DataFileView): boolean => {
      const keyword = search.trim().toLowerCase();
      return keyword.length === 0 || file.name.toLowerCase().includes(keyword);
    },
    [search],
  );

  const privateFiles = mine.filter((file) => !file.shared && matches(file));
  const mySharedFiles = mine.filter((file) => file.shared && matches(file));
  const otherFiles = othersShared.filter(matches);
  const searching = search.trim().length > 0;

  const dragFileIdRef = useRef<number | null>(null);

  const handleRowDragStart = (file: DataFileView): void => {
    dragFileIdRef.current = file.id;
  };

  const handleDropToShared = async (): Promise<void> => {
    const id = dragFileIdRef.current;
    dragFileIdRef.current = null;
    if (id === null) {
      return;
    }
    const file = mine.find((item) => item.id === id);
    if (file && !file.shared) {
      await applyShared(file, true);
    }
  };

  const handleDropToMine = async (): Promise<void> => {
    const id = dragFileIdRef.current;
    dragFileIdRef.current = null;
    if (id === null) {
      return;
    }
    const file = mine.find((item) => item.id === id);
    if (file && file.shared) {
      await applyShared(file, false);
    }
  };

  const rowActions = (file: DataFileView): React.ReactNode => (
    <>
      {file.shared && (
        <Typography
          sx={{
            fontSize: 12,
            color: "#2e9e5b",
            whiteSpace: "nowrap",
          }}
        >
          {t("sharedBadge")}
        </Typography>
      )}
      <Tooltip title={t("download")} placement="top">
        <IconButton
          size="small"
          aria-label={t("download")}
          data-guide={`data-download-${file.id}`}
          onClick={() => void handleDownload(file)}
          sx={{
            width: 32,
            height: 32,
            color: "var(--pm-color-text-secondary)",
            "&:hover": {
              backgroundColor: "var(--pm-color-primary-soft)",
              color: "var(--pm-color-primary)",
            },
          }}
        >
          <DownloadRounded sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>
    </>
  );

  const ownerRowActions = (file: DataFileView): React.ReactNode => (
    <>
      {rowActions(file)}
      <Tooltip
        title={busyFile === file.id ? t("deleting") : t("deleteFile")}
        placement="top"
      >
        <IconButton
          size="small"
          disabled={busyFile === file.id}
          aria-label={t("deleteFile")}
          data-guide={`data-delete-${file.id}`}
          onClick={() => void handleDelete(file)}
          sx={{
            width: 32,
            height: 32,
            color: "var(--pm-color-text-hint)",
            "&:hover": {
              backgroundColor: "rgba(207, 19, 34, 0.08)",
              color: "#cf1322",
            },
          }}
        >
          {busyFile === file.id ? (
            <CircularProgress
              size={16}
              sx={{ color: "var(--pm-color-primary)" }}
            />
          ) : (
            <DeleteOutlineRounded sx={{ fontSize: 18 }} />
          )}
        </IconButton>
      </Tooltip>
      <IOSSwitch
        checked={file.shared}
        data-guide={`data-share-${file.id}`}
        onChange={() => handleToggleShare(file)}
        aria-label={t("sharedBadge")}
      />
    </>
  );

  const renderLine = (
    file: DataFileView,
    opts: { owner: boolean; draggable: boolean },
  ): React.ReactNode => (
    <Box
      key={`${file.id}-${opts.owner ? "o" : "m"}`}
      draggable={opts.draggable}
      onDragStart={() => handleRowDragStart(file)}
      sx={{
        ...(opts.draggable && { cursor: "grab" }),
        "&:active": opts.draggable ? { cursor: "grabbing" } : undefined,
      }}
    >
      <Divider sx={{ mx: 2.5, borderColor: "var(--pm-color-divider)" }} />
      <Stack
        direction="row"
        sx={{
          minHeight: 72,
          alignItems: "center",
          justifyContent: "space-between",
          columnGap: 3,
          px: 2.5,
          py: 1.5,
        }}
      >
        <Stack
          direction="row"
          sx={{
            minWidth: 0,
            alignItems: "center",
            columnGap: 1.5,
            flex: 1,
          }}
        >
          <InsertDriveFileRounded
            sx={{
              fontSize: 22,
              flexShrink: 0,
              color: "var(--pm-color-text-secondary)",
            }}
          />
          <Box sx={{ minWidth: 0 }}>
            <Typography
              sx={{
                fontSize: 14,
                color: "var(--pm-color-text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {file.name}
            </Typography>
            <Stack
              direction="row"
              sx={{
                mt: 0.25,
                alignItems: "center",
                columnGap: 1,
                flexWrap: "wrap",
              }}
            >
              <Typography
                sx={{
                  fontSize: 12,
                  color: "var(--pm-color-text-hint)",
                }}
              >
                {fileMeta(file)}
              </Typography>
              {opts.owner && file.owner && (
                <Stack
                  direction="row"
                  sx={{ alignItems: "center", columnGap: 0.5 }}
                >
                  <PublicRounded
                    sx={{
                      fontSize: 13,
                      color: "var(--pm-color-text-hint)",
                    }}
                  />
                  <Typography
                    sx={{
                      fontSize: 12,
                      color: "var(--pm-color-text-secondary)",
                    }}
                  >
                    {t("by")} {file.owner.username}
                  </Typography>
                </Stack>
              )}
            </Stack>
          </Box>
        </Stack>
        <Stack
          direction="row"
          sx={{ alignItems: "center", columnGap: 0.5, flexShrink: 0 }}
        >
          {opts.owner ? rowActions(file) : ownerRowActions(file)}
        </Stack>
      </Stack>
    </Box>
  );

  const panel = (
    guideId: string,
    title: string,
    subtitle: string | null,
    emptyText: string,
    files: DataFileView[],
    dropTarget: "mine" | "shared",
    children?: React.ReactNode,
  ): React.ReactNode => (
    <Paper
      variant="outlined"
      elevation={0}
      data-guide={guideId}
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(dropTarget);
      }}
      onDragLeave={() => setDragOver((value) => (value === dropTarget ? null : value))}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(null);
        if (dropTarget === "shared") {
          void handleDropToShared();
        } else {
          void handleDropToMine();
        }
      }}
      sx={{
        flex: 1,
        minWidth: 0,
        borderRadius: "16px",
        borderColor:
          dragOver === dropTarget ? "var(--pm-color-primary)" : "var(--pm-color-border)",
        borderStyle: dragOver === dropTarget ? "dashed" : "solid",
        borderWidth: dragOver === dropTarget ? 2 : 1,
        backgroundColor: "var(--pm-color-surface)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Stack
        direction="row"
        sx={{
          alignItems: "baseline",
          justifyContent: "space-between",
          columnGap: 1,
          px: 2.5,
          pt: 2,
          pb: 1,
          borderBottom: "1px solid var(--pm-color-divider)",
        }}
      >
        <Stack direction="row" sx={{ alignItems: "baseline", columnGap: 1 }}>
          <Typography
            sx={{
              fontSize: 15,
              fontWeight: 600,
              color: "var(--pm-color-text-primary)",
            }}
          >
            {title}
          </Typography>
          {subtitle && (
            <Typography
              sx={{
                fontSize: 12,
                color: "var(--pm-color-text-hint)",
              }}
            >
              {subtitle}
            </Typography>
          )}
        </Stack>
        {dropTarget === "shared" && (
          <Stack
            direction="row"
            sx={{
              alignItems: "center",
              columnGap: 0.5,
              color: "var(--pm-color-text-hint)",
            }}
          >
            <DriveFileMoveOutlined sx={{ fontSize: 15 }} />
            <Typography sx={{ fontSize: 11 }}>{t("dragDropOwn")}</Typography>
          </Stack>
        )}
      </Stack>
      <Box sx={{ flex: 1, overflowY: "auto" }}>
        {children}
        {files.length === 0 ? (
          <Stack
            sx={{
              alignItems: "center",
              justifyContent: "center",
              minHeight: 96,
            }}
          >
            <Typography
              sx={{
                fontSize: 13,
                color: "var(--pm-color-text-hint)",
              }}
            >
              {searching ? t("noMatch") : emptyText}
            </Typography>
          </Stack>
        ) : (
          files.map((file) => renderLine(file, { owner: false, draggable: true }))
        )}
      </Box>
    </Paper>
  );

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        px: { xs: 2.5, sm: 4, md: 10 },
        pt: { xs: 10, sm: 12 },
        pb: 5,
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
          {t("title")}
        </Typography>
        <Typography
          sx={{
            mt: 1,
            mb: 4,
            fontSize: 13,
            color: "var(--pm-color-text-hint)",
          }}
        >
          {t("desc")}
        </Typography>

        <Paper
          variant="outlined"
          elevation={0}
          data-guide="data-upload-card"
          sx={{
            mb: 3,
            borderRadius: "16px",
            borderColor: "var(--pm-color-border)",
            backgroundColor: "var(--pm-color-surface)",
            overflow: "hidden",
          }}
        >
          <Box sx={{ px: 2.5, pt: 2.5, pb: 2 }}>
            <Stack
              direction="row"
              sx={{
                alignItems: "center",
                justifyContent: "space-between",
                columnGap: 2,
                flexWrap: "wrap",
                rowGap: 1.5,
              }}
            >
              <Stack direction="row" sx={{ alignItems: "center", columnGap: 1.5 }}>
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "999px",
                    backgroundColor: "var(--pm-color-primary-soft)",
                    color: "var(--pm-color-primary)",
                  }}
                >
                  <FolderSharedRounded sx={{ fontSize: 22 }} />
                </Box>
                <Box>
                  <Typography
                    sx={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--pm-color-text-primary)",
                    }}
                  >
                    {t("uploadSection")}
                  </Typography>
                  <Typography
                    sx={{
                      mt: 0.25,
                      fontSize: 12,
                      color: "var(--pm-color-text-hint)",
                    }}
                  >
                    {t("uploadHint")}
                  </Typography>
                </Box>
              </Stack>
              <Stack
                direction="row"
                sx={{ alignItems: "center", columnGap: 2, flexShrink: 0 }}
              >
                <Button
                  variant="contained"
                  size="small"
                  disableElevation
                  startIcon={<UploadFileRounded sx={{ fontSize: 17 }} />}
                  disabled={uploadingName !== null}
                  data-guide="data-upload"
                  onClick={handlePickFile}
                  sx={{
                    borderRadius: "999px",
                    textTransform: "none",
                    px: 2,
                    color: "var(--pm-color-primary-contrast)",
                    backgroundColor: "var(--pm-color-primary)",
                    "&:hover": {
                      backgroundColor: "var(--pm-color-primary-hover)",
                    },
                  }}
                >
                  {uploadingName !== null ? t("uploading") : t("chooseFile")}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  hidden
                  data-guide="data-upload-input"
                  onChange={handleFileChange}
                />
              </Stack>
            </Stack>

            {uploadingName !== null && (
              <Box sx={{ mt: 2 }}>
                <Stack
                  direction="row"
                  sx={{
                    alignItems: "center",
                    justifyContent: "space-between",
                    mb: 0.5,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 12,
                      color: "var(--pm-color-text-secondary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {uploadingName}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 12,
                      color: "var(--pm-color-text-hint)",
                    }}
                  >
                    {uploadProgress}%
                  </Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={uploadProgress}
                  sx={{
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: "var(--pm-color-divider)",
                    "& .MuiLinearProgress-bar": {
                      backgroundColor: "var(--pm-color-primary)",
                    },
                  }}
                />
              </Box>
            )}
          </Box>
        </Paper>

        <TextField
          fullWidth
          size="small"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("searchPlaceholder")}
          sx={{
            mb: 2,
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
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRounded
                    sx={{ fontSize: 18, color: "var(--pm-color-text-hint)" }}
                  />
                </InputAdornment>
              ),
            },
          }}
        />

        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={{ xs: 2, sm: 3 }}
          sx={{ alignItems: "stretch" }}
        >
          {panel(
            "data-mine-section",
            t("mySection"),
            t("myHint"),
            t("mineEmpty"),
            privateFiles,
            "mine",
          )}
          <Paper
            variant="outlined"
            elevation={0}
            data-guide="data-shared-section"
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver("shared");
            }}
            onDragLeave={() =>
              setDragOver((value) => (value === "shared" ? null : value))
            }
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(null);
              void handleDropToShared();
            }}
            sx={{
              flex: 1,
              minWidth: 0,
              borderRadius: "16px",
              borderColor:
                dragOver === "shared"
                  ? "var(--pm-color-primary)"
                  : "var(--pm-color-border)",
              borderStyle: dragOver === "shared" ? "dashed" : "solid",
              borderWidth: dragOver === "shared" ? 2 : 1,
              backgroundColor: "var(--pm-color-surface)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <Stack
              direction="row"
              sx={{
                alignItems: "center",
                justifyContent: "space-between",
                columnGap: 1,
                px: 2.5,
                pt: 2,
                pb: 1,
                borderBottom: "1px solid var(--pm-color-divider)",
              }}
            >
              <Stack direction="row" sx={{ alignItems: "baseline", columnGap: 1 }}>
                <Typography
                  sx={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: "var(--pm-color-text-primary)",
                  }}
                >
                  {t("sharedSection")}
                </Typography>
              </Stack>
              <Stack
                direction="row"
                sx={{
                  alignItems: "center",
                  columnGap: 0.5,
                  color: "var(--pm-color-text-hint)",
                }}
              >
                <DriveFileMoveOutlined sx={{ fontSize: 15 }} />
                <Typography sx={{ fontSize: 11 }}>{t("dragDropOwn")}</Typography>
              </Stack>
            </Stack>
            <Box sx={{ flex: 1, overflowY: "auto" }}>
              <Typography
                sx={{
                  px: 2.5,
                  pt: 1.25,
                  pb: 0.5,
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--pm-color-text-hint)",
                }}
              >
                {t("sharedOwnTitle")}
              </Typography>
              {mySharedFiles.length === 0 ? (
                <Typography
                  sx={{
                    px: 2.5,
                    py: 1,
                    fontSize: 13,
                    color: "var(--pm-color-text-hint)",
                  }}
                >
                  {searching ? t("noMatch") : t("sharedOwnEmpty")}
                </Typography>
              ) : (
                mySharedFiles.map((file) =>
                  renderLine(file, { owner: false, draggable: true }),
                )
              )}
              <Typography
                sx={{
                  px: 2.5,
                  pt: 1.5,
                  pb: 0.5,
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--pm-color-text-hint)",
                }}
              >
                {t("sharedOtherTitle")}
              </Typography>
              {otherFiles.length === 0 ? (
                <Typography
                  sx={{
                    px: 2.5,
                    py: 1,
                    pb: 3,
                    fontSize: 13,
                    color: "var(--pm-color-text-hint)",
                  }}
                >
                  {searching ? t("noMatch") : t("sharedEmpty")}
                </Typography>
              ) : (
                otherFiles.map((file) =>
                  renderLine(file, { owner: true, draggable: false }),
                )
              )}
            </Box>
          </Paper>
        </Stack>

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
    </Box>
  );
}
