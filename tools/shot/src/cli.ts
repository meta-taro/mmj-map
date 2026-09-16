/**
 * ヘッドレスのブラウザで手元のデモを開き、撮って、**何が落ちたかも出す**。
 *
 *   pnpm shot                                              # 既定のトップを shot.png へ
 *   pnpm shot -- "http://localhost:8787/#15/34.70/135.49" docs/screenshots/umeda.png
 *
 * 依存は足していない。Node 24 の WebSocket と、機械に入っているブラウザの
 * CDP（DevTools Protocol）だけで動く。
 *
 * **撮れた絵の良し悪しは判断しない。**空でも撮って、通信と console をそのまま出す。
 * 「空の地図が撮れた」ことと「地図が出ない」ことを、人が区別できるようにするため。
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { isCountableRequest, nextWaitState, parseShotArgs, pickBrowser, type WaitState } from "./shot.js";

// pnpm はスクリプトをパッケージの中で走らせる。出力先を process.cwd() で解くと
// tools/shot/ の下に置かれてしまうので、**人が叩いた場所**（pnpm が INIT_CWD で教えてくる）で解く。
const invokedFrom = process.env["INIT_CWD"] ?? process.cwd();

const BROWSERS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

const PORT = Number(process.env["SHOT_CDP_PORT"] ?? 9334);
const QUIET_MS = 2500;

interface CdpMessage {
  readonly id?: number;
  readonly method?: string;
  readonly params?: Record<string, unknown>;
  readonly result?: Record<string, unknown>;
}

const args = parseShotArgs(process.argv.slice(2));
const browser = pickBrowser(process.env["SHOT_BROWSER"] ? [process.env["SHOT_BROWSER"]] : BROWSERS, existsSync);
const profile = resolve(invokedFrom, ".shot-profile").replaceAll("\\", "/");

const chrome = spawn(
  browser,
  [
    "--headless=new", "--no-sandbox", "--hide-scrollbars", "--enable-unsafe-swiftshader",
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    "--window-size=1280,860", "about:blank",
  ],
  { stdio: "ignore" },
);

async function cdpEndpoint(): Promise<string> {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      return ((await res.json()) as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl;
    } catch {
      await sleep(200);
    }
  }
  throw new Error(`ブラウザの CDP に繋がりません（port ${PORT}）。別の撮影が動いていませんか`);
}

const ws = new WebSocket(await cdpEndpoint());
await new Promise<void>((ok, ng) => {
  ws.onopen = () => ok();
  ws.onerror = () => ng(new Error("CDP の WebSocket が開けません"));
});

let nextId = 0;
const waiting = new Map<number, (msg: CdpMessage) => void>();
const events: CdpMessage[] = [];
ws.onmessage = (raw) => {
  const msg = JSON.parse(String(raw.data)) as CdpMessage;
  if (msg.id === undefined) return void events.push(msg);
  waiting.get(msg.id)?.(msg);
  waiting.delete(msg.id);
};

const send = (method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<CdpMessage> =>
  new Promise((ok) => {
    const id = ++nextId;
    waiting.set(id, ok);
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

const target = (await send("Target.createTarget", { url: "about:blank" })).result as { targetId: string };
const attached = (await send("Target.attachToTarget", { targetId: target.targetId, flatten: true })).result as {
  sessionId: string;
};
const session = attached.sessionId;

for (const method of ["Page.enable", "Runtime.enable", "Log.enable", "Network.enable"]) {
  await send(method, {}, session);
}

const inflight = new Map<string, string>();
const failures: string[] = [];
const logs: string[] = [];

function drainEvents(): void {
  for (const event of events.splice(0)) {
    const p = (event.params ?? {}) as Record<string, any>;
    switch (event.method) {
      case "Network.requestWillBeSent":
        {
          const url = String(p["request"]?.url ?? "?");
          if (isCountableRequest(url)) inflight.set(String(p["requestId"]), url);
        }
        break;
      case "Network.loadingFinished":
        inflight.delete(String(p["requestId"]));
        break;
      case "Network.loadingFailed":
        inflight.delete(String(p["requestId"]));
        failures.push(`通信に失敗: ${p["errorText"]}`);
        break;
      case "Network.responseReceived":
        if (Number(p["response"]?.status) >= 400) failures.push(`HTTP ${p["response"].status} ${p["response"].url}`);
        break;
      case "Runtime.consoleAPICalled":
        logs.push(`[console.${p["type"]}] ${(p["args"] ?? []).map((a: any) => a.description ?? a.value ?? "").join(" ")}`);
        break;
      case "Log.entryAdded":
        logs.push(`[${p["entry"].level}] ${p["entry"].text} ${p["entry"].url ?? ""}`.trim());
        break;
      case "Runtime.exceptionThrown":
        logs.push(`[例外] ${p["exceptionDetails"]?.exception?.description ?? p["exceptionDetails"]?.text}`);
        break;
      default:
        break;
    }
  }
}

await send("Page.navigate", { url: args.url }, session);

const deadline = Date.now() + args.waitMs;
let state: WaitState = { quietSince: null };
for (;;) {
  await sleep(250);
  drainEvents();
  const next = nextWaitState(state, inflight.size, Date.now(), QUIET_MS);
  state = next.state;
  if (next.done) break;
  if (Date.now() > deadline) {
    console.warn(`${args.waitMs}ms 待っても通信が止まりませんでした。その時点で撮ります`);
    for (const url of [...inflight.values()].slice(0, 5)) console.warn(`  終わっていない通信: ${url}`);
    break;
  }
}

const shot = (await send("Page.captureScreenshot", { format: "png" }, session)).result as { data: string };
const outPath = resolve(invokedFrom, args.out);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, Buffer.from(shot.data, "base64"));

const probe = (
  await send(
    "Runtime.evaluate",
    {
      expression: `JSON.stringify({
        notice: !document.getElementById('notice')?.hidden,
        webgl2: !!document.createElement('canvas').getContext('webgl2'),
        config: window.MMJ_CONFIG ?? null
      })`,
      returnByValue: true,
    },
    session,
  )
).result as { result: { value: string } };

console.log(`撮りました: ${outPath}`);
console.log(`画面の状態: ${probe.result.value}`);
console.log(`失敗した通信: ${failures.length} 件`);
for (const line of failures.slice(0, 15)) console.log(`  - ${line}`);
console.log(`console: ${logs.length} 件`);
for (const line of logs.slice(0, 15)) console.log(`  - ${line}`);

ws.close();
chrome.kill();

// 案内画面が出たまま撮れたなら、それは地図ではない。**成功として返さない。**
if (probe.result.value.includes('"notice":true')) {
  console.error("デモは案内画面のままです（配信元が設定されていません）");
  process.exitCode = 1;
}
