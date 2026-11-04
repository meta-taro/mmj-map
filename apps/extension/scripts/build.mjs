/**
 * 拡張を `dist/` に組む。**組むといっても写すだけ**（バンドラは使わない）。
 *
 *   pnpm --filter @mmj-map/extension build
 *
 * できた `dist/` を chrome://extensions の「パッケージ化されていない拡張機能を読み込む」で選ぶ。
 *
 * **MV3 は外からコードを読めない**ので、MapLibre・pmtiles・部品を中へ同梱する。
 * 元はどれもリポにあるもので、デモ（`deploy.yml`）が公開先へ写しているものと同じ。
 */
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, "..");
const repo = resolve(app, "../..");
const dist = resolve(app, "dist");

const MAPLIBRE_FILES = ["maplibre-gl.mjs", "maplibre-gl-shared.mjs", "maplibre-gl-worker.mjs", "maplibre-gl.css"];

/** @type {Array<[string, string]>} [元, 先] */
const copies = [
  [resolve(app, "src"), dist],
  [resolve(repo, "packages/elements/src"), resolve(dist, "elements")],
  [resolve(repo, "node_modules/pmtiles/dist/pmtiles.js"), resolve(dist, "vendor/pmtiles/pmtiles.js")],
  ...MAPLIBRE_FILES.map(
    (name) =>
      /** @type {[string, string]} */ ([
        resolve(repo, "node_modules/maplibre-gl/dist", name),
        resolve(dist, "vendor/maplibre-gl", name),
      ]),
  ),
];

// **無いものを黙って飛ばさない。**1 つ欠けると、読み込んだ拡張の地図が白いまま何も言わない
const missing = copies.filter(([from]) => !existsSync(from)).map(([from]) => from);
if (missing.length > 0) {
  console.error(`見つかりません（pnpm install を済ませてください）:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}

rmSync(dist, { recursive: true, force: true });
for (const [from, to] of copies) cpSync(from, to, { recursive: true });
console.log(`組みました: ${dist}`);
