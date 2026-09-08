import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keyframes } from "@emotion/react";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Stepper from "@mui/material/Stepper";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import LinearProgress from "@mui/material/LinearProgress";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import CancelRounded from "@mui/icons-material/CancelRounded";
import WarningRounded from "@mui/icons-material/WarningRounded";
import InfoRounded from "@mui/icons-material/InfoRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import PlayArrowRounded from "@mui/icons-material/PlayArrowRounded";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import OpenInNewRounded from "@mui/icons-material/OpenInNewRounded";
import RestartAltRounded from "@mui/icons-material/RestartAltRounded";
import DeleteSweepRounded from "@mui/icons-material/DeleteSweepRounded";
import PauseRounded from "@mui/icons-material/PauseRounded";
import { api, type Meta, type Checks, type JobSnapshot, type InstallOptions } from "./api";

const STEPS_LABEL = ["环境检查", "部署配置", "一键安装", "完成"];

// 步骤切换过渡动画：前进从右滑入，后退从左滑入
const stepForward = keyframes`
  from { opacity: 0; transform: translateX(42px); }
  to   { opacity: 1; transform: translateX(0); }
`;
const stepBackward = keyframes`
  from { opacity: 0; transform: translateX(-42px); }
  to   { opacity: 1; transform: translateX(0); }
`;

function iconFor(item: { ok: boolean; severity: string }) {
  if (item.ok) return <CheckCircleRounded color="success" />;
  if (item.severity === "warning") return <WarningRounded color="warning" />;
  return <CancelRounded color="error" />;
}

export default function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [navDir, setNavDir] = useState<"next" | "back">("next");
  // 已安装时的选择门槛：ask=待选择 continue=保留现有继续 resetting=正在清除
  const [installedAction, setInstalledAction] = useState<"ask" | "continue" | "resetting">("ask");
  const [checks, setChecks] = useState<Checks | null>(null);
  const [checksLoading, setChecksLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [job, setJob] = useState<JobSnapshot | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logRef = useRef<HTMLPreElement | null>(null);

  // 配置表单
  const [dbHost, setDbHost] = useState("127.0.0.1");
  const [dbPort, setDbPort] = useState("3306");
  const [dbUser, setDbUser] = useState("root");
  const [dbPassword, setDbPassword] = useState("");
  const [dbName, setDbName] = useState("pipemind");
  const [adminUser, setAdminUser] = useState("PipeMind");
  const [adminPassword, setAdminPassword] = useState("PipeMind");
  const [backendPort, setBackendPort] = useState("3001");
  const [frontendPort, setFrontendPort] = useState("3000");
  const [frontendOrigin, setFrontendOrigin] = useState("http://localhost:3000");

  const runChecks = useCallback(async () => {
    setChecksLoading(true);
    setError(null);
    try {
      setChecks(await api.check());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setChecksLoading(false);
    }
  }, []);

  useEffect(() => {
    api
      .meta()
      .then((m) => {
        setMeta(m);
        void runChecks();
        // 已安装过时预填现有配置
        return api.config();
      })
      .then((cfg) => {
        const env = cfg.backendEnv ?? {};
        if (env.DB_HOST) setDbHost(env.DB_HOST);
        if (env.DB_PORT) setDbPort(env.DB_PORT);
        if (env.DB_USER) setDbUser(env.DB_USER);
        if (env.DB_PASSWORD !== undefined) setDbPassword(env.DB_PASSWORD ?? "");
        if (env.DB_NAME) setDbName(env.DB_NAME);
        if (env.AUTH_ADMIN_USERNAME) setAdminUser(env.AUTH_ADMIN_USERNAME);
        if (env.PORT) setBackendPort(env.PORT);
        if (env.CORS_ORIGIN) {
          setFrontendOrigin(env.CORS_ORIGIN);
          try {
            const u = new URL(env.CORS_ORIGIN);
            if (u.port) setFrontendPort(u.port);
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {
        /* meta 失败在下方提示 */
      });
  }, [runChecks]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [job?.logs.length]);

  const checkOk = useMemo(() => (checks ? checks.ok : false), [checks]);
  const checkErrors = useMemo(() => (checks ? checks.items.filter((i) => !i.ok) : []), [checks]);

  function goTo(step: number, dir: "next" | "back") {
    // 越过"已有安装"门槛即视为选择"继续（保留现有配置）"
    if (installedAction === "ask" && dir === "next") setInstalledAction("continue");
    setNavDir(dir);
    setActiveStep(step);
  }

  async function clearAndReset() {
    setInstalledAction("resetting");
    setError(null);
    try {
      await api.reset();
      const m = await api.meta();
      setMeta(m);
      setInstalledAction("ask");
      void runChecks();
    } catch (err) {
      setInstalledAction("ask");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // 轮询任务进度：done/error 结束，paused/running 持续刷新
  const startPolling = useCallback(
    (id: string) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const snap = await api.job(id);
          setJob(snap);
          if (snap.status === "done" || snap.status === "error") {
            stopPolling();
            setInstalling(false);
            if (snap.status === "done") goTo(3, "next");
          }
        } catch {
          /* 轮询失败继续重试 */
        }
      }, 800);
    },
    [stopPolling],
  );

  // 组件卸载时停止轮询
  useEffect(() => () => stopPolling(), [stopPolling]);

  // 进程检测：页面打开时若已有安装任务在跑/暂停，直接跳到"一键安装(终端)"步骤并接上进度
  useEffect(() => {
    if (!meta || activeStep !== 0) return;
    api
      .active()
      .then((r) => {
        if (r.active && r.job) {
          setJob(r.job);
          setInstalling(true);
          goTo(2, "next");
          startPolling(r.job.id);
        }
      })
      .catch(() => {
        /* 检测失败不阻塞正常流程 */
      });
  }, [meta]); // eslint-disable-line react-hooks/exhaustive-deps

  async function beginInstall() {
    setError(null);
    const opts: InstallOptions = {
      db: { host: dbHost.trim(), port: dbPort.trim(), user: dbUser.trim(), password: dbPassword, name: dbName.trim() },
      admin: { username: adminUser.trim(), password: adminPassword },
      backendPort: backendPort.trim(),
      frontendPort: frontendPort.trim(),
      frontendOrigin: frontendOrigin.trim(),
    };
    try {
      const { id } = await api.install(opts);
      setJob({ id, status: "queued", paused: false, error: null, current: -1, steps: [], percent: 0, logs: [] });
      setInstalling(true);
      goTo(2, "next");
      startPolling(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function pauseJob() {
    if (!job) return;
    try {
      setJob(await api.pause(job.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function resumeJob() {
    if (!job) return;
    try {
      setJob(await api.resume(job.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function retry() {
    if (job && job.status === "error") {
      setError(null);
      setJob(null);
      goTo(1, "back");
    } else {
      setError(null);
      goTo(0, "back");
    }
  }

  async function startServices() {
    try {
      await api.start({ backendPort, frontendPort });
      const m = await api.meta();
      setMeta(m);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const jobSteps = job?.steps?.length ? job.steps : (meta?.steps ?? []);

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Paper elevation={0} sx={{ p: 3, border: "1px solid rgba(22,100,255,0.18)", borderRadius: 3 }}>
        {/* 品牌头 */}
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" fontWeight={800} sx={{ letterSpacing: 0.2 }}>
              PipeMind 安装向导
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Underground Utility Network Platform · One-click Installer
            </Typography>
          </Box>
          <Button size="small" startIcon={<RefreshRounded />} onClick={runChecks}>
            刷新环境
          </Button>
        </Stack>

        <Stepper activeStep={activeStep} sx={{ my: 2 }}>
          {STEPS_LABEL.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {/* 已安装选择门槛：继续（保留现有） / 清除缓存重来 */}
        {installedAction === "resetting" && <LinearProgress sx={{ mb: 2 }} />}
        {meta?.installed && activeStep !== 3 && installedAction === "ask" && (
          <Paper
            variant="outlined"
            sx={{
              mb: 2,
              p: 2,
              borderColor: "rgba(22,100,255,0.35)",
              bgcolor: "rgba(22,100,255,0.04)",
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <InfoRounded color="primary" />
              <Typography variant="subtitle1" fontWeight={700}>
                检测到已有安装
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              本机已完成过安装，请选择后续方式：
              <br />• <b>继续（保留现有）</b>：保留现有配置，可启动服务或按新参数覆盖安装；
              <br />• <b>清除缓存，重新安装</b>：删除向导生成的配置（backend/.env、frontend/.env.local、运行状态），回到全新安装流程（不会删除数据库与已安装依赖）。
            </Typography>
            <Stack direction="row" spacing={1.5} sx={{ justifyContent: "flex-end" }}>
              <Button
                variant="outlined"
                color="error"
                startIcon={<DeleteSweepRounded />}
                disabled={installedAction === "resetting"}
                onClick={() => void clearAndReset()}
              >
                清除缓存，重新安装
              </Button>
              <Button
                variant="contained"
                startIcon={<RestartAltRounded />}
                disabled={installedAction === "resetting"}
                onClick={() => setInstalledAction("continue")}
              >
                继续（保留现有）
              </Button>
            </Stack>
          </Paper>
        )}
        {meta?.installed && activeStep !== 3 && installedAction === "continue" && (
          <Alert
            severity="info"
            sx={{ mb: 2 }}
            action={
              <Stack direction="row" spacing={1}>
                <Button size="small" color="error" startIcon={<DeleteSweepRounded />} onClick={() => setInstalledAction("ask")}>
                  清除重来
                </Button>
                <Button size="small" startIcon={<PlayArrowRounded />} onClick={() => void startServices()}>
                  启动服务
                </Button>
              </Stack>
            }
          >
            已保留现有配置：可点"启动服务"直接运行，或继续下一步用新参数覆盖安装。
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* 步骤内容：切换时按方向播放过渡动画 */}
        <Box key={activeStep} sx={{ animation: `${navDir === "back" ? stepBackward : stepForward} 0.32s ease` }}>

        {/* Step 0 —— 环境检查 */}
        {activeStep === 0 && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              开始前先确认目标机器满足以下条件（Node.js ≥ 20、MySQL 8、端口可用）。
            </Typography>
            <Paper variant="outlined" sx={{ bgcolor: "background.default" }}>
              {checksLoading ? (
                <Box sx={{ p: 3 }}>
                  <LinearProgress />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                    正在检测运行环境…
                  </Typography>
                </Box>
              ) : (
                <List dense disablePadding>
                  {checks?.items.map((item) => (
                    <ListItem key={item.key} divider>
                      <ListItemIcon sx={{ minWidth: 36 }}>{iconFor(item)}</ListItemIcon>
                      <ListItemText primary={item.label} secondary={item.message} />
                    </ListItem>
                  ))}
                </List>
              )}
            </Paper>
            <Typography variant="body2" color={checkOk ? "success.main" : "error.main"} sx={{ mt: 2 }}>
              {checks?.summary ?? "…"}
            </Typography>
            {/* 操作按钮统一靠右 */}
            <Stack direction="row" sx={{ justifyContent: "flex-end", mt: 1.5 }}>
              <Button
                variant="contained"
                disabled={!checkOk || checksLoading}
                endIcon={<ArrowForwardRounded />}
                onClick={() => goTo(1, "next")}
              >
                下一步：部署配置
              </Button>
            </Stack>
          </Box>
        )}

        {/* Step 1 —— 部署配置 */}
        {activeStep === 1 && (
          <Box>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
              数据库 / MySQL
            </Typography>
            <Stack spacing={2}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField label="数据库地址" value={dbHost} onChange={(e) => setDbHost(e.target.value)} fullWidth />
                <TextField label="端口" value={dbPort} onChange={(e) => setDbPort(e.target.value)} sx={{ width: { xs: "100%", sm: 160 } }} />
              </Stack>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField label="用户名" value={dbUser} onChange={(e) => setDbUser(e.target.value)} fullWidth />
                <TextField label="密码" type="password" value={dbPassword} onChange={(e) => setDbPassword(e.target.value)} fullWidth />
              </Stack>
              <TextField label="数据库名（不存在将自动创建）" value={dbName} onChange={(e) => setDbName(e.target.value)} />
            </Stack>

            <Typography variant="subtitle1" fontWeight={700} sx={{ mt: 3, mb: 1 }}>
              初始管理员 / Administrator
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField label="用户名" value={adminUser} onChange={(e) => setAdminUser(e.target.value)} fullWidth />
              <TextField label="密码（至少 4 位）" type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} fullWidth />
            </Stack>

            <Typography variant="subtitle1" fontWeight={700} sx={{ mt: 3, mb: 1 }}>
              服务端口 / Ports
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField label="后端端口" value={backendPort} onChange={(e) => setBackendPort(e.target.value)} sx={{ width: { xs: "100%", sm: 180 } }} />
              <TextField label="前端端口" value={frontendPort} onChange={(e) => setFrontendPort(e.target.value)} sx={{ width: { xs: "100%", sm: 180 } }} />
              <TextField label="前端访问地址" value={frontendOrigin} onChange={(e) => setFrontendOrigin(e.target.value)} fullWidth />
            </Stack>

            <Alert severity="info" sx={{ mt: 2.5 }}>
              安装过程：写入配置 → 安装前后端依赖（npm ci）→ 初始化数据库与账号 → 编译 → 自动启动并完成健康检查。耗时取决于网络与机器性能，请保持页面打开。
            </Alert>

            {/* 上一步 / 一键安装 统一靠右 */}
            <Stack direction="row" spacing={1.5} sx={{ justifyContent: "flex-end", mt: 2 }}>
              <Button variant="outlined" onClick={() => goTo(0, "back")}>
                上一步
              </Button>
              <Button variant="contained" startIcon={<PlayArrowRounded />} onClick={() => void beginInstall()}>
                一键安装
              </Button>
            </Stack>
          </Box>
        )}

        {/* Step 2 —— 安装进度 */}
        {activeStep === 2 && (
          <Box>
            <LinearProgress
              variant={job?.status === "paused" ? "indeterminate" : "determinate"}
              value={job?.percent ?? 0}
              sx={{ height: 8, borderRadius: 4, mb: 2 }}
            />
            {/* 进度 + 暂停/继续（操作靠右） */}
            <Stack direction="row" alignItems="center" sx={{ mb: 1.5 }}>
              <Typography variant="body2" color="text.secondary">
                安装进度 {job?.percent ?? 0}%
                {job?.paused && <Box component="span" sx={{ ml: 1, color: "warning.main", fontWeight: 700 }}>· 已暂停</Box>}
              </Typography>
              <Box sx={{ flex: 1 }} />
              {job &&
                (job.paused ? (
                  <Button size="small" variant="contained" startIcon={<PlayArrowRounded />} onClick={() => void resumeJob()}>
                    继续
                  </Button>
                ) : (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<PauseRounded />}
                    disabled={job.status === "done" || job.status === "error"}
                    onClick={() => void pauseJob()}
                  >
                    暂停
                  </Button>
                ))}
            </Stack>
            <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1} sx={{ mb: 2 }}>
              {jobSteps.map((s) => {
                const state = s.state ?? "pending";
                return (
                  <Box
                    key={s.key}
                    sx={{
                      px: 1.2,
                      py: 0.5,
                      borderRadius: 999,
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: state === "done" ? "#0a8a5f" : state === "error" ? "#cf1322" : state === "running" ? "primary.main" : "text.secondary",
                      bgcolor:
                        state === "done"
                          ? "rgba(10,138,95,0.08)"
                          : state === "error"
                            ? "rgba(207,19,34,0.08)"
                            : state === "running"
                              ? "rgba(22,100,255,0.08)"
                              : "action.hover",
                    }}
                  >
                    {s.label}
                  </Box>
                );
              })}
            </Stack>
            {job?.error && (
              <Alert severity="error" sx={{ mb: 1 }}>
                <AlertTitle>安装未完成</AlertTitle>
                {job.error}
              </Alert>
            )}
            {job?.status === "error" && (
              <Stack direction="row" sx={{ justifyContent: "flex-end", mt: 1.5 }}>
                <Button variant="outlined" startIcon={<RefreshRounded />} onClick={retry}>
                  返回修改
                </Button>
              </Stack>
            )}
            <Paper variant="outlined" sx={{ bgcolor: "#0f172a", borderRadius: 2, overflow: "hidden" }}>
              <pre
                ref={logRef}
                style={{
                  margin: 0,
                  padding: 12,
                  height: 320,
                  overflow: "auto",
                  color: "#dbe4ff",
                  fontSize: 12,
                  lineHeight: 1.55,
                  fontFamily: "Consolas, 'SF Mono', monospace",
                }}
              >
                {(job?.logs ?? []).map((l, i) => (
                  <div key={i} style={{ color: l.level === "error" ? "#ff8f9a" : l.level === "warn" ? "#f5c76a" : "#dbe4ff" }}>
                    {l.text}
                  </div>
                ))}
                {installing && job?.status === "queued" && <div>任务排队中…</div>}
              </pre>
            </Paper>
          </Box>
        )}

        {/* Step 3 —— 完成 */}
        {activeStep === 3 && (
          <Box>
            <Stack alignItems="center" sx={{ py: 2 }}>
              <CheckCircleRounded color="success" sx={{ fontSize: 64 }} />
              <Typography variant="h6" fontWeight={700} sx={{ mt: 1 }}>
                安装完成，服务已启动
              </Typography>
              <Typography variant="body2" color="text.secondary">
                初始管理员账号已就绪，可使用以下地址访问系统
              </Typography>
            </Stack>
            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
              <List dense disablePadding>
                <ListItem divider>
                  <ListItemText primary="系统入口" secondary={frontendOrigin} />
                </ListItem>
                <ListItem divider>
                  <ListItemText primary="后端 API" secondary={`http://localhost:${backendPort}/api`} />
                </ListItem>
                <ListItem>
                  <ListItemText primary="初始管理员" secondary={`${adminUser || "PipeMind"} / ${adminPassword || "PipeMind"}`} />
                </ListItem>
              </List>
            </Paper>
            {/* 返回 / 打开系统 统一靠右 */}
            <Stack direction="row" spacing={1.5} sx={{ justifyContent: "flex-end" }}>
              <Button variant="outlined" onClick={() => goTo(0, "back")}>
                返回首页
              </Button>
              <Button
                variant="contained"
                startIcon={<OpenInNewRounded />}
                onClick={() => window.open(frontendOrigin, "_blank")}
              >
                打开系统
              </Button>
            </Stack>
          </Box>
        )}
        </Box>
      </Paper>

      <Stack direction="row" alignItems="center" spacing={1} sx={{ justifyContent: "center", mt: 3 }}>
        <InfoRounded sx={{ fontSize: 15, color: "text.hint" }} />
        <Typography variant="caption" color="text.hint">
          PipeMind Installer · 仅监听 127.0.0.1:{meta?.uiPort ?? 4200}，安装完成后可在系统内登录并修改管理员密码
        </Typography>
      </Stack>
    </Container>
  );
}
