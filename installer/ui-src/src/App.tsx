import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import SettingsEthernetRounded from "@mui/icons-material/SettingsEthernetRounded";
import { api, type Meta, type Checks, type JobSnapshot, type InstallOptions } from "./api";

const STEPS_LABEL = ["环境检查", "部署配置", "一键安装", "完成"];

function iconFor(item: { ok: boolean; severity: string }) {
  if (item.ok) return <CheckCircleRounded color="success" />;
  if (item.severity === "warning") return <WarningRounded color="warning" />;
  return <CancelRounded color="error" />;
}

export default function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [activeStep, setActiveStep] = useState(0);
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

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const checkOk = useMemo(() => (checks ? checks.ok : false), [checks]);
  const checkErrors = useMemo(() => (checks ? checks.items.filter((i) => !i.ok) : []), [checks]);

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
      setJob({ id, status: "queued", error: null, current: -1, steps: [], percent: 0, logs: [] });
      setInstalling(true);
      setActiveStep(2);
      pollRef.current = setInterval(async () => {
        try {
          const snap = await api.job(id);
          setJob(snap);
          if (snap.status === "done" || snap.status === "error") {
            if (pollRef.current) clearInterval(pollRef.current);
            setInstalling(false);
            if (snap.status === "done") setActiveStep(3);
          }
        } catch {
          /* 轮询失败继续重试 */
        }
      }, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function retry() {
    if (job && job.status === "error") {
      setError(null);
      setJob(null);
      setActiveStep(1);
    } else {
      setError(null);
      setActiveStep(0);
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
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: "12px",
              bgcolor: "primary.main",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <SettingsEthernetRounded />
          </Box>
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

        {meta?.installed && activeStep !== 3 && (
          <Alert severity="info" sx={{ mb: 2 }} action={
            <Button size="small" onClick={() => void startServices()} startIcon={<PlayArrowRounded />}>
              启动服务
            </Button>
          }>
            检测到已有安装记录。可继续按新参数安装（将覆盖配置并重建依赖），或在安装完成后直接打开系统。
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

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
            <Stack direction="row" justifyContent="space-between" sx={{ mt: 2 }}>
              <Typography variant="body2" color={checkOk ? "success.main" : "error.main"}>
                {checks?.summary ?? "…"}
              </Typography>
              <Button
                variant="contained"
                disabled={!checkOk || checksLoading}
                endIcon={<ArrowForwardRounded />}
                onClick={() => setActiveStep(1)}
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

            <Stack direction="row" justifyContent="space-between" sx={{ mt: 2 }}>
              <Button onClick={() => setActiveStep(0)}>上一步</Button>
              <Button variant="contained" size="large" startIcon={<PlayArrowRounded />} onClick={() => void beginInstall()}>
                一键安装
              </Button>
            </Stack>
          </Box>
        )}

        {/* Step 2 —— 安装进度 */}
        {activeStep === 2 && (
          <Box>
            <LinearProgress variant="determinate" value={job?.percent ?? 0} sx={{ height: 8, borderRadius: 4, mb: 2 }} />
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              安装进度 {job?.percent ?? 0}%
            </Typography>
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
              <Alert severity="error" sx={{ mb: 2 }} action={
                <Button size="small" onClick={retry} startIcon={<RefreshRounded />}>
                  返回修改
                </Button>
              }>
                <AlertTitle>安装未完成</AlertTitle>
                {job.error}
              </Alert>
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
            <Stack direction="row" justifyContent="center" spacing={2}>
              <Button
                variant="contained"
                size="large"
                startIcon={<OpenInNewRounded />}
                onClick={() => window.open(frontendOrigin, "_blank")}
              >
                打开系统
              </Button>
              <Button size="large" onClick={() => setActiveStep(0)}>
                返回首页
              </Button>
            </Stack>
          </Box>
        )}
      </Paper>

      <Stack direction="row" alignItems="center" justifyContent="center" spacing={1} sx={{ mt: 3 }}>
        <InfoRounded sx={{ fontSize: 15, color: "text.hint" }} />
        <Typography variant="caption" color="text.hint">
          PipeMind Installer · 仅监听 127.0.0.1:{meta?.uiPort ?? 4200}，安装完成后可在系统内登录并修改管理员密码
        </Typography>
      </Stack>
    </Container>
  );
}
