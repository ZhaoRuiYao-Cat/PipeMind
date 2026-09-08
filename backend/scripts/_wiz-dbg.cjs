/* eslint-disable */
const { spawn } = require("node:child_process");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const CDP = 9369;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-sandbox", `--remote-debugging-port=${CDP}`, "--window-size=1500,980", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
  await sleep(2500);
  const page = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pend = new Map(); const exc = [];
  const send = (m, p = {}) => new Promise((resolve) => { const i = ++id; pend.set(i, resolve); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.onmessage = (ev) => {
    const d = JSON.parse(ev.data);
    if (d.id && pend.has(d.id)) { pend.get(d.id)(d.result); pend.delete(d.id); }
    if (d.method === "Runtime.exceptionThrown") {
      const det = d.params.exceptionDetails || {};
      exc.push((det.exception && (det.exception.description || det.exception.value)) || det.text || "uncaught");
    }
  };
  await send("Runtime.enable"); await send("Page.enable");
  await send("Page.navigate", { url: "http://127.0.0.1:4200" });
  await sleep(4500);
  const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
  const ui = await ev(`(() => {
    const root = document.getElementById('root');
    const paper = document.querySelector('.MuiPaper-root');
    const text = document.body ? document.body.innerText : '';
    return JSON.stringify({ rootChildren: root ? root.children.length : -1, paper: paper ? paper.className.slice(0, 60) : null, textHead: text.slice(0, 220) });
  })()`);
  console.log("UI", ui);
  console.log("EXC", exc.length ? exc.join(" | ").slice(0, 800) : "none");
  ws.close(); chrome.kill();
}
main().catch((e) => { console.log("ERR", e); process.exit(1); });
