/**
 * 手元用の配信を立てる。
 *
 *   pnpm serve                 # 既定 8787、dist/tiles と styles と apps/demo を配る
 *   pnpm serve -- --port=9000
 *
 * 出す URL を最後に表示する。**`tiles:check-range` にそのまま渡せる形**にしてある。
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createStaticServer, type Mount } from "./server.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function readPort(argv: readonly string[]): number {
  const flag = argv.find((a) => a.startsWith("--port="));
  if (flag === undefined) return 8787;
  const value = Number(flag.slice("--port=".length));
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`--port の値が不正です: ${flag}`);
  }
  return value;
}

const port = readPort(process.argv.slice(2));

const mounts: Mount[] = [
  { prefix: "/tiles", dir: resolve(repoRoot, "dist/tiles") },
  { prefix: "/styles", dir: resolve(repoRoot, "styles") },
  // Web Components はビルドしない。**素の ESM をそのまま配る**（packages/elements/src）
  { prefix: "/elements", dir: resolve(repoRoot, "packages/elements/src") },
  { prefix: "/", dir: resolve(repoRoot, "apps/demo") },
];

const tilesDir = mounts[0]!.dir;
if (!existsSync(tilesDir)) {
  // 黙って空の配信を立てない。地図が白いのか配信が空なのか分からなくなる
  console.error(`タイルがありません: ${tilesDir}`);
  console.error("先に `pnpm tiles:extract -- kansai` を実行してください。");
  process.exit(1);
}

const region = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "kansai";

// commit されている apps/demo/config.js は配信先が null のまま（Pages 上ではそれが事実）。
// 手元だけ、この配信自身を指す config を差し込む。**リポジトリのファイルは書き換えない。**
const devConfig = `// 開発用サーバーが差し込んだ設定。ファイルとしては存在しない。
window.MMJ_CONFIG = {
  tilesUrl: "http://localhost:${port}/tiles/${region}.pmtiles",
  glyphsUrl: null,
  styleUrl: "/styles/modern-dark.json",
};
`;

createStaticServer(mounts, { "/config.js": { type: "text/javascript; charset=utf-8", body: devConfig } }).listen(port, () => {
  console.log(`デモ:       http://localhost:${port}/`);
  console.log(`タイル:     http://localhost:${port}/tiles/${region}.pmtiles`);
  console.log(`スタイル:   http://localhost:${port}/styles/modern-dark.json`);
  console.log(`部品の例:   http://localhost:${port}/elements.html`);
  console.log(`点のまとめ: http://localhost:${port}/cluster.html`);
  console.log(`自前の POI: http://localhost:${port}/poi.html`);
  console.log("");
  console.log("Range の疎通確認:");
  console.log(`  pnpm tiles:check-range -- http://localhost:${port}/tiles/${region}.pmtiles`);
});
