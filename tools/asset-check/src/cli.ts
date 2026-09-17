/**
 * 参照されているのに存在しないアセットを、実行時より前に止める（baseline §23）。
 *
 *   pnpm asset:check
 *
 * `apps/demo` は素の HTML で**ビルド工程が無い**。綴りを 1 文字間違えても、
 * typecheck も test も通ったまま、**開いたときにだけ壊れる**。
 *
 * 見ているのは「配信されたときに解ける参照かどうか」で、
 * 対応表は手元の配信（`tools/serve`）と本番（`.github/workflows/deploy.yml`）の
 * 両方で同じになるようにしてある。**片方だけで通る参照を作らないため。**
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative, sep } from "node:path";

import { extractReferences, resolveReference, type Mount } from "./refs.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * URL の先頭と、リポジトリの中の実ディレクトリ。
 *
 * **`tools/serve/src/cli.ts` の mounts と、`deploy.yml` のコピー先と揃えること。**
 * ここがずれると、手元では通って本番で 404 になる（またはその逆）。
 */
const MOUNTS: Mount[] = [
  { prefix: "/elements", dir: "packages/elements/src" },
  { prefix: "/styles", dir: "styles" },
  { prefix: "/", dir: "apps/demo" },
];

/** 検査する HTML の置き場所 */
const SCAN_DIR = "apps/demo";

function htmlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(resolve(repoRoot, dir), { withFileTypes: true })) {
    const child = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...htmlFiles(child));
    else if (entry.name.endsWith(".html")) out.push(child);
  }
  return out.sort();
}

/** リポジトリ相対のパスを、区切りを "/" に揃えて返す */
function posix(path: string): string {
  return path.split(sep).join("/");
}

const files = htmlFiles(SCAN_DIR);
if (files.length === 0) {
  // 黙って 0 件で通さない。**検査対象が消えたことに気づけなくなる**
  console.error(`検査する HTML が 1 つもありません: ${SCAN_DIR}`);
  process.exit(1);
}

let checked = 0;
let failed = 0;

for (const file of files) {
  const html = readFileSync(resolve(repoRoot, file), "utf8");
  const fromDir = posix(relative(repoRoot, dirname(resolve(repoRoot, file))));

  for (const reference of extractReferences(html)) {
    checked++;
    const target = resolveReference(reference.raw, fromDir, MOUNTS);

    if (target === null) {
      console.error(`NG ${file}:${reference.line} ${reference.raw}`);
      console.error(`   どの配信先にも当たりません（mounts: ${MOUNTS.map((m) => m.prefix).join(" ")}）`);
      failed++;
      continue;
    }

    const full = resolve(repoRoot, target);
    if (!existsSync(full) || !statSync(full).isFile()) {
      console.error(`NG ${file}:${reference.line} ${reference.raw}`);
      console.error(`   参照先がありません: ${target}`);
      failed++;
    }
  }
}

console.log(`検査: HTML ${files.length} 件 / 参照 ${checked} 件`);
if (failed > 0) {
  console.error("");
  console.error(`参照されているのに存在しないアセットが ${failed} 件あります（baseline §23）。`);
  console.error("参照を足したら、同じ作業で実体まで置いてください。");
  process.exit(1);
}
console.log("OK すべての参照が実在します");
