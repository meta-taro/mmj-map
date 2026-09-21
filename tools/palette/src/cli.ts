/**
 * 指し値から配色を作る。
 *
 *   pnpm palette -- --land=#f7f9fb --water=#bfd7e8 --ink=#16202b --accent=#0a5fff
 *   pnpm palette -- ... --style --base=modern-dark --name="Acme Maps" --out=acme.json
 *   pnpm palette -- ... --set=road-minor=#ffffff        役割を手で上書きする
 *
 * 既定は **24 役割の JSON**（`<mmj-map palette-url>` にそのまま渡せる）。
 * `--style` を付けると**スタイルごと**作る（`<mmj-map style-url>` / 自分の配布物へ同梱）。
 *
 * **出したものは導入者のもの。**`styles/` へ置かないこと（D-002 / D-021）。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseArgs } from "./args.js";
import { deriveRoles } from "./derive.js";
import { buildStyle } from "./style.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * `--out` の基準にする場所。
 *
 * **`process.cwd()` は使えない。** `pnpm --filter` 越しに起動されると
 * パッケージのディレクトリになり、リポジトリのルートで打った相対パスが
 * `tools/palette/` の中へ落ちる（実際に落ちた）。
 * pnpm は打った場所を `INIT_CWD` で教えてくれる。
 */
const userDir = process.env["INIT_CWD"] ?? process.cwd();

function main(argv: readonly string[]): number {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error("");
    console.error(
      "例: pnpm palette -- --land=#f7f9fb --water=#bfd7e8 --ink=#16202b --accent=#0a5fff",
    );
    return 1;
  }

  const roles = deriveRoles(parsed.anchors, parsed.overrides);

  let output: unknown = roles;
  if (parsed.mode === "style") {
    // 名前を経路として扱わせない（§21）
    if (!/^[A-Za-z0-9._-]+$/.test(parsed.base)) {
      throw new Error(`土台の名前が不正です: ${parsed.base}`);
    }
    const base = JSON.parse(
      readFileSync(resolve(repoRoot, "styles", `${parsed.base}.json`), "utf8"),
    );
    output = buildStyle(base, roles, { name: parsed.name, anchors: parsed.anchors });
  }

  const text = `${JSON.stringify(output, null, 2)}\n`;
  if (parsed.out === null) {
    process.stdout.write(text);
    return 0;
  }

  writeFileSync(resolve(userDir, parsed.out), text, "utf8");
  // 何を書いたかを出す。**黙って終わると、書けたのかどうか分からない**
  console.error(
    `書きました: ${parsed.out}（${parsed.mode === "style" ? "スタイル" : "配色 24 役割"}）`,
  );
  if (parsed.mode === "style") console.error(`確かめる: pnpm style:check -- ${parsed.out}`);
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  // 握り潰さない（§8）。色が読めない等はここに出る
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
