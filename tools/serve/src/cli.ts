/**
 * 手元用の配信を立てる。
 *
 *   pnpm serve                              # 既定 8787、dist/tiles と styles と apps/demo を配る
 *   pnpm serve -- --port=9000
 *   pnpm serve -- --base=/mmj-map  # **公開先と同じ形で配る**
 *
 * `--base` を付けると、mount がまるごとその下へ移り、**base の外は 404 になる**。
 * GitHub Pages は `/<repo>/` の下に置かれるので、絶対パス参照の壊れ方を
 * 手元で再現できる。付けないと手元だけ通ってしまう（2026-09-21 にそれで壊した）。
 *
 * 出す URL を最後に表示する。**`tiles:check-range` にそのまま渡せる形**にしてある。
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createStaticServer, type Mount } from "./server.js";
import { readBase, readPort, withBasePath } from "./options.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const argv = process.argv.slice(2);
const port = readPort(argv);
const base = readBase(argv);

const mounts: Mount[] = withBasePath(
  [
    { prefix: "/tiles", dir: resolve(repoRoot, "dist/tiles") },
    { prefix: "/styles", dir: resolve(repoRoot, "styles") },
    // Web Components はビルドしない。**素の ESM をそのまま配る**（packages/elements/src）
    { prefix: "/elements", dir: resolve(repoRoot, "packages/elements/src") },
    { prefix: "/", dir: resolve(repoRoot, "apps/demo") },
  ],
  base,
);

const tilesDir = resolve(repoRoot, "dist/tiles");
if (!existsSync(tilesDir)) {
  // 黙って空の配信を立てない。地図が白いのか配信が空なのか分からなくなる
  console.error(`タイルがありません: ${tilesDir}`);
  console.error("先に `pnpm tiles:extract -- kansai` を実行してください。");
  process.exit(1);
}

const region = argv.find((a) => !a.startsWith("--")) ?? "kansai";

// commit されている apps/demo/config.js は配信先が null のまま（Pages 上ではそれが事実）。
// 手元だけ、この配信自身を指す config を差し込む。**リポジトリのファイルは書き換えない。**
//
// **URL の組み立て方を deploy.yml と揃えてある**（document.baseURI 起点の相対）。
// ここだけ絶対パスで書くと、`--base` を付けても手元では通ってしまい、
// 再現したかった壊れ方が再現できない。
const devConfig = `// 開発用サーバーが差し込んだ設定。ファイルとしては存在しない。
window.MMJ_CONFIG = {
  tilesUrl: new URL('tiles/${region}.pmtiles', document.baseURI).href,
  glyphsUrl: null,
  styleUrl: new URL('styles/modern-dark.json', document.baseURI).href,
};
`;

const root = `http://localhost:${port}${base}/`;

createStaticServer(mounts, {
  [`${base}/config.js`]: { type: "text/javascript; charset=utf-8", body: devConfig },
}).listen(port, () => {
  if (base !== "") console.log(`base path: ${base}  （この外は 404。公開先と同じ形です）`);
  console.log(`デモ:       ${root}`);
  console.log(`タイル:     ${root}tiles/${region}.pmtiles`);
  console.log(`スタイル:   ${root}styles/modern-dark.json`);
  console.log(`部品の例:   ${root}elements.html`);
  console.log(`建物を立てる: ${root}3d.html`);
  console.log(`点のまとめ: ${root}cluster.html`);
  console.log(`自前の POI: ${root}poi.html`);
  console.log("");
  console.log("Range の疎通確認:");
  console.log(`  pnpm tiles:check-range -- ${root}tiles/${region}.pmtiles`);
});
