/**
 * デモの各頁をヘッドレスで開いて、**人が見なくても分かる壊れ方**を止める。
 *
 *   pnpm smoke                                   # 手元の pnpm serve に対して
 *   pnpm smoke -- --base=https://example.com/    # 本番へ
 *   pnpm smoke -- --widths=390x844
 *
 * **撮るのは `tools/shot`、合否を出すのはこちら。**
 * 絵の良し悪しは見ない（それは人の領域）。見るのは `checks.ts` に書いたものだけ。
 *
 * 依存は足していない。Node の WebSocket と、機械に入っているブラウザの CDP だけ。
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { type Finding, type PageReport, report, runChecks } from "./checks.js";
import { PROBE, readProbe } from "./probe.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** **撮るためだけの頁は見ない。**`og.html` は 1200x630 の社交カードで、人は開かない */
const SKIP = new Set(["og.html"]);

/**
 * 頁ごとに、この規則だけ外す。**理由を書かずに増やさないこと。**
 *
 * `plain.html` は**素の MapLibre をそのまま置いた比較用の頁**で、
 * `<mmj-map>` を通していない。操作ボタンが 29px なのは MapLibre の既定であって、
 * **そこを直すと「MMJ を通すと何が変わるか」が見えなくなる**。
 * 的の大きさは `<mmj-map>` 側で直してあり、他の 14 頁では効いている。
 */
const EXEMPT = new Map([["plain.html", new Set(["tap"])]]);

const BROWSERS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

interface CdpMessage {
  readonly id?: number;
  readonly method?: string;
  readonly params?: Record<string, unknown>;
  readonly result?: Record<string, unknown>;
}

const argv = process.argv.slice(2);
const option = (name: string, fallback: string): string =>
  argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;

const base = option("base", "http://localhost:8787/").replace(/\/?$/, "/");
// **携帯と PC の両方。**片方だけ見て出さない（`ui-flow.md` 手順 1）
const widths = option("widths", "390x844,1440x900")
  .split(",")
  .map((pair) => {
    const [w, h] = pair.split("x").map(Number);
    return { width: w ?? 0, height: h ?? 0 };
  })
  .filter((size) => size.width > 0 && size.height > 0);

const pages = option("pages", "")
  .split(",")
  .filter((name) => name !== "");
const targets =
  pages.length > 0
    ? pages
    : readdirSync(resolve(repoRoot, "apps/demo"))
        .filter((name) => name.endsWith(".html") && !SKIP.has(name))
        .sort();

const browser = process.env["MMJ_BROWSER"] ?? BROWSERS.find((path) => existsSync(path));
if (browser === undefined) {
  console.error("ブラウザが見つかりません。MMJ_BROWSER に実行ファイルの場所を入れてください");
  process.exit(2);
}

const port = Number(process.env["MMJ_CDP_PORT"] ?? 9344);
// **作業用の置き場をリポジトリの中に作らない。**ブラウザが拡張の JS を数百個
// 展開するので、`pnpm lint` がそれを読んで数千件の指摘を出した（実測・2026-09-30）。
const profile = resolve(tmpdir(), "mmj-smoke-profile").replaceAll("\\", "/");
const chrome = spawn(
  browser,
  [
    "--headless=new",
    "--no-sandbox",
    "--hide-scrollbars",
    "--enable-unsafe-swiftshader",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  // **ブラウザの言い分を捨てない。**`ignore` にしていたせいで、
  // CI で起動しなかったときに**理由がどこにも残らなかった**（2026-09-30）。
  { stdio: ["ignore", "pipe", "pipe"] },
);

/** ブラウザが自分で言ったこと。**起動に失敗したとき、これだけが手がかりになる** */
let said = "";
for (const stream of [chrome.stdout, chrome.stderr]) {
  stream?.on("data", (chunk: Buffer) => {
    said += String(chunk);
  });
}

let exited: string | null = null;
chrome.on("exit", (code, signal) => {
  exited = `終了コード ${code ?? "なし"}${signal === null ? "" : ` / シグナル ${signal}`}`;
});

/**
 * ブラウザが CDP を開くまで待つ。
 *
 * **待ち時間は長めに取る。**12 秒で諦めていたが、混んだ CI の機械では
 * Chrome の初回起動がそれを超えることがある（2026-09-30 に 1 回落ちた）。
 * **遅いだけのものを不具合として報告しない。**
 */
async function cdpEndpoint(): Promise<string> {
  const limit = 150; // 200ms × 150 = 30 秒
  for (let i = 0; i < limit; i++) {
    // 先に落ちていたら待つ意味がない。**理由ごと出す**
    if (exited !== null) {
      throw new Error(`ブラウザが起動しませんでした（${exited}）\n${said.trim() || "（出力なし）"}`);
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      return ((await res.json()) as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl;
    } catch {
      await sleep(200);
    }
  }
  throw new Error(
    `ブラウザの CDP に ${(limit * 200) / 1000} 秒つないでも応答がありません（port ${port}）\n` +
      `使ったブラウザ: ${browser}\n${said.trim() || "（出力なし）"}`,
  );
}

const ws = new WebSocket(await cdpEndpoint());
await new Promise<void>((ok, ng) => {
  ws.addEventListener("open", () => ok(), { once: true });
  ws.addEventListener("error", () => ng(new Error("CDP の WebSocket が開けません")), { once: true });
});

let nextId = 0;
const waiting = new Map<number, (msg: CdpMessage) => void>();
let errors: string[] = [];
ws.addEventListener("message", (raw) => {
  const msg = JSON.parse(String(raw.data)) as CdpMessage;
  if (msg.id !== undefined) {
    waiting.get(msg.id)?.(msg);
    waiting.delete(msg.id);
    return;
  }
  const params = (msg.params ?? {}) as Record<string, any>;
  // **コンソールの error は、それ自体が不具合。**拾ってそのまま指摘にする
  if (msg.method === "Runtime.consoleAPICalled" && params["type"] === "error") {
    errors.push(params["args"]?.map((a: any) => a?.value ?? a?.description ?? "?").join(" ") ?? "?");
  }
  if (msg.method === "Runtime.exceptionThrown") {
    errors.push(String(params["exceptionDetails"]?.exception?.description ?? params["exceptionDetails"]?.text ?? "?"));
  }
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
for (const method of ["Page.enable", "Runtime.enable", "Network.enable"]) await send(method, {}, session);
// **掴んだものを疑う**（`ui-flow.md` 手順 5）。使い回した控えが古い JS を返す
await send("Network.setCacheDisabled", { cacheDisabled: true }, session);
// **サービスワーカーは `setCacheDisabled` を素通りする。**
// デモは自分で控えを持つので、profile を使い回すと**直したはずの CSS と JS が
// 古いまま返り、「直っていない」と誤って報告する**（実測・2026-09-30。
// 的の大きさを直したのに 2 回とも古い値が出た）。
await send("Network.setBypassServiceWorker", { bypass: true }, session);

const found: Finding[] = [];
let seen = 0;

for (const size of widths) {
  const phone = size.width < 500;
  await send(
    "Emulation.setDeviceMetricsOverride",
    { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: phone },
    session,
  );
  // **指の端末として振る舞わせる。**そうしないと `pointer: coarse` の CSS が効かず、
  // 携帯でしか出ないもの・出ないはずのものを見誤る（実測・2026-09-29）
  if (phone) {
    await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }, session);
    await send("Emulation.setEmitTouchEventsForMouse", { enabled: true, configuration: "mobile" }, session);
  }

  for (const name of targets) {
    errors = [];
    const went = (await send("Page.navigate", { url: `${base}${name}` }, session)).result as {
      errorText?: string;
    };
    seen += 1;

    // **開けなかったことを、中身の指摘として出さない。**
    // ブラウザのエラー画面にも「Reload」「Details」というボタンがあるので、
    // そのまま測ると**「的が小さい」という嘘の指摘が 30 件**出る
    // （実測・2026-09-30。CI で配信が立っておらず、本当の原因に気づくのが遅れた）。
    if (went?.errorText !== undefined && went.errorText !== "") {
      found.push({ rule: "open", detail: `${name} @${size.width}: 開けません（${went.errorText}）` });
      continue;
    }

    // **地図は待たない。**配信元が無い手元では地図が出ないのが正しい姿で、
    // ここが見るのは頁の骨格（`checks.ts`）。待つのは描画が落ち着くまで
    await sleep(1500);

    const result = (await send("Runtime.evaluate", { expression: PROBE, returnByValue: true }, session)).result as {
      result?: { value?: unknown };
    };
    const probe = readProbe(result?.result?.value);

    if (probe === null) {
      found.push({ rule: "probe", detail: `${name} @${size.width}: 頁を測れませんでした（開けていない可能性）` });
      continue;
    }

    const page: PageReport = {
      url: name,
      width: size.width,
      height: size.height,
      ...probe,
      consoleErrors: errors,
    };
    const exempt = EXEMPT.get(name);
    found.push(...runChecks(page).filter((finding) => !exempt?.has(finding.rule)));
  }
}

console.log(report(seen, found));

ws.close();
chrome.kill();
// **落ちたら CI を止める。**出すだけにすると、次に増えても誰も気づかない
process.exit(found.length === 0 ? 0 : 1);
