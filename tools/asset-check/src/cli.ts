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

import { extractReferences, findBasePathHazards, resolveReference, type Mount } from "./refs.js";

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

/**
 * **deploy が成果物の中に作るディレクトリ。**リポジトリには存在しない。
 *
 * `deploy.yml` が `packages/elements/src/*.js` と `styles/*.json` をここへコピーし、
 * タイルは Release から降ろす。**参照先を「無い」と言わないために、真の出どころへ読み替える。**
 *
 * **ここが `deploy.yml` とずれたら、この検査は嘘をつく。**片方を変えたら両方直すこと。
 */
const PRODUCED_AT_DEPLOY: Readonly<Record<string, string | null>> = {
  "apps/demo/elements": "packages/elements/src",
  "apps/demo/styles": "styles",
  // Release から降ろすので、リポジトリにも他のどこにも無い。**存在検査の対象外**
  "apps/demo/tiles": null,
};

/**
 * deploy が作るパスを、リポジトリの中の本当の場所へ読み替える。
 * 読み替え先が `null`（Release から来るもの）なら `undefined` を返し、検査しない。
 * @param target リポジトリ相対のパス
 */
function resolveProduced(target: string): string | undefined {
  for (const [produced, source] of Object.entries(PRODUCED_AT_DEPLOY)) {
    if (target !== produced && !target.startsWith(`${produced}/`)) continue;
    if (source === null) return undefined;
    return source + target.slice(produced.length);
  }
  return target;
}

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

  const references = extractReferences(html);

  // **公開先の base path で壊れる参照を止める。**
  // 手元の配信は `/` 直下なので、絶対パスでも通ってしまう。
  // 実際にこれで 4 枚のデモが公開先だけ地図を出せなくなった（2026-09-21）。
  for (const hazard of findBasePathHazards(references)) {
    console.error(`NG ${file}:${hazard.line} ${hazard.raw}`);
    console.error("   先頭の / は公開先の base path で壊れます。相対パスにしてください");
    console.error("   （GitHub Pages は /<repo>/ の下に置かれるため、/x は https://host/x を指す）");
    failed++;
  }

  for (const reference of references) {
    checked++;
    const resolved = resolveReference(reference.raw, fromDir, MOUNTS);
    // deploy が作るものは、真の出どころへ読み替えてから存在を見る
    const target = resolved === null ? null : (resolveProduced(resolved) ?? null);
    if (resolved !== null && target === null) continue; // Release から来るもの。検査しない

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
