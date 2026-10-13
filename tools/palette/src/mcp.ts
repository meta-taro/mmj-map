/**
 * MCP の口（stdio）。
 *
 *   pnpm palette:mcp
 *
 * Claude Code などの設定に、この起動コマンドを登録して使う。
 * 詳しい登録の仕方は `tools/palette/README.md`。
 *
 * **stdout には応答しか書かない。**ログを 1 行でも混ぜると、
 * 相手は JSON として読もうとして接続が壊れる（原因が非常に分かりにくい）。
 * 出したいものは stderr へ。
 */
import { readFileSync, readdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { handle, type Deps } from "./server.js";

/**
 * 土台のスタイルを探す。**配った包みの中が先、リポジトリの根が後。**
 *
 * - 配ったとき: `<package>/styles/`（`prepublishOnly` が正本から写す）
 * - リポジトリで動かすとき: `<repo>/styles/`（**正本はこちら**・D-002）
 *
 * **両方を見る。**どちらか一方にすると、
 * 「手元では動くのに `npx` で動かない」か、その逆が起きる。
 */
function findStyleDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // src/mcp.ts なら ../styles、dist/mcp.js でも ../styles（どちらも包みの直下）
  const candidates = [resolve(here, "../styles"), resolve(here, "../../..", "styles")];
  for (const dir of candidates) {
    try {
      if (readdirSync(dir).some((name) => name.endsWith(".json"))) return dir;
    } catch {
      // 無い候補は次へ。**最後まで無ければ下で落とす**（黙って空で動かさない）
    }
  }
  throw new Error(`土台のスタイルが見つかりません: ${candidates.join(" / ")}`);
}

const styleDir = findStyleDir();

/**
 * 名乗る版を package.json から読む。**ここで数字を決め打たない。**
 * 決め打つと、版を上げた日に名乗りだけ古いまま残る（気づけない）。
 */
function readVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const path of [resolve(here, "../package.json"), resolve(here, "../../package.json")]) {
    try {
      const value = JSON.parse(readFileSync(path, "utf8")).version;
      if (typeof value === "string" && value !== "") return value;
    } catch {
      // 次の候補へ。**両方だめなら下で分かる値を返す**
    }
  }
  return "0.0.0-unknown";
}

const deps: Deps = {
  version: readVersion(),
  listBases: () =>
    readdirSync(styleDir)
      .filter((name) => name.endsWith(".json"))
      .map((name) => name.replace(/\.json$/, ""))
      .sort(),
  loadBase: (name) => {
    // 名前を経路として扱わせない。**`../` を渡されて外を読ませない**（§21）
    if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error(`土台の名前が不正です: ${name}`);
    return JSON.parse(readFileSync(resolve(styleDir, `${name}.json`), "utf8"));
  },
};

const lines = createInterface({ input: process.stdin });

lines.on("line", (line) => {
  const trimmed = line.trim();
  if (trimmed === "") return;

  let request: unknown;
  try {
    request = JSON.parse(trimmed);
  } catch {
    // 読めない行に応答を返しようがない（id が分からない）。**握り潰さず stderr へ**
    console.error("[mmj-palette] JSON として読めない行を無視しました");
    return;
  }

  const response = handle(request as never, deps);
  if (response !== null) process.stdout.write(`${JSON.stringify(response)}\n`);
});

lines.on("close", () => process.exit(0));

console.error(`[mmj-palette] MCP を stdio で待っています（土台: ${deps.listBases().join(" ")}）`);
