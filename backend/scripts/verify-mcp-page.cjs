const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const API = "http://localhost:3001/api";
const USERNAME = "PipeMind";
const PASSWORD = "PipeMind";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const CDP_PORT = 9348;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login() {
  const pkResp = await fetch(`${API}/auth/public-key`);
  const { publicKey } = await pkResp.json();
  const encrypted = crypto
    .publicEncrypt(
      {
        key: `-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----`,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      Buffer.from(PASSWORD, "utf8"),
    )
    .toString("base64");
  const resp = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USERNAME, encryptedPassword: encrypted, remember: false }),
    redirect: "manual",
  });
  const setCookie = resp.headers.get("set-cookie") ?? "";
  const cookies = {};
  for (const part of setCookie.split(/,(?=\s*\w+=)/).map((s) => s.trim())) {
    const first = part.split(";")[0].trim();
    const eq = first.indexOf("=");
    if (eq > 0) cookies[first.slice(0, eq).trim()] = first.slice(eq + 1).trim();
  }
  return cookies;
}

let ws;
let msgId = 0;
const pending = new Map();

function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function main() {
  const cookies = await login();
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-chrome-"));
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-sandbox", `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userDir}`, "about:blank"], { stdio: "ignore" });
  await sleep(2500);
  const version = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`).then((r) => r.json());
  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = (ev) => {
    const data = JSON.parse(ev.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(JSON.stringify(data.error)));
      else resolve(data.result);
    }
  };
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const attach = await send("Target.attachToTarget", { targetId, flatten: true });
  const sessionId = attach.sessionId;
  const pageSend = (method, params = {}) => {
    const id = ++msgId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  };
  await pageSend("Page.enable");
  await pageSend("Runtime.enable");
  await pageSend("Network.enable");
  for (const [name, value] of Object.entries(cookies)) {
    await pageSend("Network.setCookie", { name, value, url: "http://localhost:3000", httpOnly: name.includes("token"), sameSite: "Lax" });
  }
  await pageSend("Page.navigate", { url: "http://localhost:3000/mcp" });
  await sleep(7000);
  const evalJs = async (expression) => {
    const res = await pageSend("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    return res.result.value;
  };
  const info = await evalJs(`(() => {
    const text = document.body.innerText;
    const navHasMcp = [...document.querySelectorAll('button')].some(b => /MCP/.test(b.textContent));
    return JSON.stringify({
      hasTitle: text.includes('MCP 服务状态'),
      hasRunning: text.includes('服务运行中'),
      hasTools: text.includes('工具总数'),
      hasNavMcp: navHasMcp,
      snippet: text.slice(0, 300)
    });
  })()`);
  console.log(info);
  chrome.kill();
  process.exit(0);
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
