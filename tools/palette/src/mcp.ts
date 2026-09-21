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

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const styleDir = resolve(repoRoot, "styles");

const deps: Deps = {
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
