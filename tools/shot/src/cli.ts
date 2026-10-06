/**
 * ヘッドレスのブラウザで手元のデモを開き、撮って、**何が落ちたかも出す**。
 *
 *   pnpm shot                                              # 既定のトップを shot.png へ
 *   pnpm shot -- "http://localhost:8787/#15/34.70/135.49" docs/screenshots/umeda.png
 *   pnpm shot -- "http://localhost:8787/og.html" apps/demo/og.png --size=1200x630
 *   pnpm shot -- "…/shops.html?shop=akari" pay.png --click="button:text(決済)"
 *
 * `--size=` は**出てくる絵の大きさ**。窓の大きさではない（SNS のカードのように
 * 寸法が決まっているものを撮るため）。位置引数とは数えないので、順番はどこでもよい。
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

import {
  isCountableRequest,
  isNoticeShown,
  nextWaitState,
  parseShotArgs,
  pickBrowser,
  type WaitState,
} from "./shot.js";

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
    `--window-size=${args.width},${args.height}`, "about:blank",
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
  ws.addEventListener("open", () => ok(), { once: true });
  ws.addEventListener("error", () => ng(new Error("CDP の WebSocket が開けません")), { once: true });
});

let nextId = 0;
const waiting = new Map<number, (msg: CdpMessage) => void>();
const events: CdpMessage[] = [];
ws.addEventListener("message", (raw) => {
  const msg = JSON.parse(String(raw.data)) as CdpMessage;
  if (msg.id === undefined) return void events.push(msg);
  waiting.get(msg.id)?.(msg);
  waiting.delete(msg.id);
});

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

// **確かめる側が古いものを掴まない。**
// プロファイル（`.shot-profile`）は使い回すので、直した CSS や JS が当たっていない絵を
// 撮り続けることになる。2026-10-02 に実際に踏んだ——配信は新しいのに、
// **撮れた絵には古い CSS が当たっていて**、頁の不具合だと誤読しかけた。
// service worker も別経路で控えを返すので、両方を切る。
await send("Network.setCacheDisabled", { cacheDisabled: true }, session);
await send("Network.setBypassServiceWorker", { bypass: true }, session);

// **絵の大きさは窓ではなくここで決める。**`--window-size` は OS の枠のぶんだけずれるし、
// ブラウザの外から窓を変える手も効かなかった（拡張で resize しても `innerWidth` が
// 変わらないのを実測・2026-09-25）。SNS のカードのように寸法が決まっているものは、
// ずれた時点で勝手に切られる。
await send(
  "Emulation.setDeviceMetricsOverride",
  { width: args.width, height: args.height, deviceScaleFactor: 1, mobile: false },
  session,
);

const inflight = new Map<string, string>();
const failures: string[] = [];
const logs: string[] = [];
/**
 * 読み終えたか。**これを見ないと、読み込みが始まる前に撮る。**
 * HTML を受け取ってから CSS を要求するまでの隙間で、通信は一瞬 0 件になる。
 */
let loaded = false;

function drainEvents(): void {
  for (const event of events.splice(0)) {
    const p = (event.params ?? {}) as Record<string, any>;
    switch (event.method) {
      case "Page.loadEventFired":
        loaded = true;
        break;
      case "Network.requestWillBeSent":
        {
          const url = String(p["request"]?.url ?? "?");
          const initiator = String(p["initiator"]?.type ?? "other");
          if (isCountableRequest(url, initiator)) inflight.set(String(p["requestId"]), url);
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
  const next = nextWaitState(state, inflight.size, Date.now(), QUIET_MS, loaded);
  state = next.state;
  if (next.done) break;
  if (Date.now() > deadline) {
    // **読み終える前に撮るなら、そう言う。**黙って撮ると、
    // 半分しか出ていない画面を「異常なし」として配ることになる
    console.warn(
      loaded
        ? `${args.waitMs}ms 待っても通信が止まりませんでした。その時点で撮ります`
        : `${args.waitMs}ms 待っても読み終えませんでした（load が来ていません）。**この絵は途中です**`,
    );
    for (const url of [...inflight.values()].slice(0, 5)) console.warn(`  終わっていない通信: ${url}`);
    break;
  }
}

// **「つながらなくても出る」は、切ってみないと言えない。**
// 一度読み終えてから通信を落とし、読み込み直して同じように待つ。
// **掴めていなければ、ここで地図が出なくなる。**それが見たいこと。
if (args.offline) {
  await send(
    "Network.emulateNetworkConditions",
    { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 },
    session,
  );
  console.log("通信を切って、読み込み直します");
  // **読み直すので、読み終えた印も戻す。**戻さないと、前回の load で
  // 「もう読み終えている」と誤判定して、読み込み途中を撮る
  loaded = false;
  await send("Page.reload", {}, session);

  const offlineDeadline = Date.now() + args.waitMs;
  state = { quietSince: null };
  for (;;) {
    await sleep(250);
    drainEvents();
    const next = nextWaitState(state, inflight.size, Date.now(), QUIET_MS, loaded);
    state = next.state;
    if (next.done) break;
    if (Date.now() > offlineDeadline) break;
  }
}

// **撮る前に押す。**タブや開閉の中身は、押さないと画面に出ない。
// `button:text(決済)` のように文字でも選べる（タブに id が無いため）。
// **押せなかったら言う。**黙って撮ると、押したつもりの絵を確認に使ってしまう。
if (args.click !== "") {
  const clicked = (
    await send(
      "Runtime.evaluate",
      {
        expression: `(() => {
          const want = ${JSON.stringify(args.click)};
          const text = /^(.*):text\\((.*)\\)$/.exec(want);
          const target = text
            ? [...document.querySelectorAll(text[1])].find((el) => el.textContent?.trim() === text[2])
            : document.querySelector(want);
          if (!target) return "見つかりません";
          target.click();
          return "押しました";
        })()`,
        returnByValue: true,
      },
      session,
    )
  ).result as { result?: { value?: string } };
  const said = clicked.result?.value ?? "？";
  console.log(`${args.click}: ${said}`);
  if (said !== "押しました") {
    console.error("押すものが見つかりませんでした。**この絵は押す前の状態です**");
    process.exitCode = 1;
  }
  await sleep(600); // 押したあとの描き換えを待つ
}

// **形式は引数で決める。**頁に並べる絵は JPEG（PNG だと地図 1 枚で数百 KB）
const shot = (
  await send(
    "Page.captureScreenshot",
    args.format === "jpeg" ? { format: "jpeg", quality: args.quality } : { format: "png" },
    session,
  )
).result as { data: string };
const outPath = resolve(invokedFrom, args.out);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, Buffer.from(shot.data, "base64"));

const probe = (
  await send(
    "Runtime.evaluate",
    {
      expression: `JSON.stringify({
        // 3 状態で返す。**無いページを「出ている」と混同しない**（isNoticeShown を見ること）
        notice: (() => { const el = document.getElementById('notice'); return el ? !el.hidden : null; })(),
        webgl2: !!document.createElement('canvas').getContext('webgl2'),
        config: window.MMJ_CONFIG ?? null,
        // **撮った時点の状態。**「失敗 0 件」だけでは、読み込み途中かどうか分からない
        ready: document.readyState,
        sheets: document.styleSheets.length
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
if (isNoticeShown(probe.result.value)) {
  console.error("デモは案内画面のままです（配信元が設定されていません）");
  process.exitCode = 1;
}
