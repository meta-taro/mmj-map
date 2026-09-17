/**
 * タイルを開いて、中に何が何件入っているかを数える。
 *
 *   pnpm tile:inspect -- dist/tiles/kansai.pmtiles 15 28715 13016
 *   pnpm tile:inspect -- dist/tiles/kansai.pmtiles 15 28715 13016 --layer=pois
 *   pnpm tile:inspect -- dist/tiles/kansai.pmtiles 15 28715 13016 --layer=pois --by=kind
 *   pnpm tile:inspect -- dist/tiles/kansai.pmtiles 15 28715 13016 --layer=pois --at=15 --list
 *   pnpm tile:inspect -- --lonlat=135.4761,34.6693 --zoom=15   # 座標からタイル番号を出す
 *
 * **推測で地図を作らないための道具。**
 * 「大阪市のラベルが出ていない」「京セラドームが無い」のような話は、
 * タイルを開けば 1 分で切り分けられる（どちらも実際にそうだった）。
 *
 * go-pmtiles を外部コマンドとして呼ぶ。**依存は足していない。**
 * PATH に無ければ `PMTILES_BIN` で場所を渡す。
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { decodeTile, type Feature } from "./mvt.js";
import { tally, visibleAt } from "./tally.js";

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined =>
  argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const has = (name: string): boolean => argv.includes(`--${name}`);
const positional = argv.filter((a) => !a.startsWith("--"));

/** 経度緯度から z/x/y を出す。タイル番号を手で計算させないため */
function tileOf(lon: number, lat: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const rad = (lat * Math.PI) / 180;
  return {
    x: Math.floor(((lon + 180) / 360) * n),
    y: Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n),
  };
}

const lonlat = flag("lonlat");
if (lonlat !== undefined) {
  const [lon, lat] = lonlat.split(",").map(Number);
  const zoom = Number(flag("zoom") ?? 15);
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || !Number.isFinite(zoom)) {
    console.error("--lonlat=経度,緯度 と --zoom=数 を正しく渡してください");
    process.exit(1);
  }
  const { x, y } = tileOf(lon as number, lat as number, zoom);
  console.log(`${zoom} ${x} ${y}`);
  process.exit(0);
}

const [archive, z, x, y] = positional;
if (archive === undefined || z === undefined || x === undefined || y === undefined) {
  console.error("使い方: pnpm tile:inspect -- <archive.pmtiles> <z> <x> <y> [--layer=名] [--by=属性] [--at=倍率] [--list]");
  console.error("        pnpm tile:inspect -- --lonlat=経度,緯度 --zoom=15");
  process.exit(1);
}

// pnpm はスクリプトをパッケージの中で走らせる。相対パスを process.cwd() で解くと
// tools/tile-inspect/ の下を見にいくので、**人が叩いた場所**（INIT_CWD）で解く。
const archivePath = resolve(process.env["INIT_CWD"] ?? process.cwd(), archive);

const command = process.env["PMTILES_BIN"] ?? "pmtiles";
const result = spawnSync(command, ["tile", archivePath, z, x, y], { maxBuffer: 256 * 1024 * 1024 });

if (result.error !== undefined) {
  // 握り潰さない（§8）。ここで黙ると「タイルが空」と区別がつかない
  console.error(`go-pmtiles を起動できません: ${command}`);
  console.error("PATH に無い場合は PMTILES_BIN で場所を渡してください。");
  console.error(String(result.error));
  process.exit(1);
}
if (result.status !== 0) {
  // **何を開こうとして失敗したかを出す。**パスの解決ミスが一番多く、
  // 終了コードだけ出されると手元とパッケージのどちらの相対か分からない
  console.error(`go-pmtiles が失敗しました（終了コード ${result.status}）`);
  console.error(`  開こうとしたもの: ${archivePath}`);
  console.error(`  タイル: ${z}/${x}/${y}`);
  const stderr = result.stderr.toString("utf8").trim();
  if (stderr !== "") console.error(stderr);
  process.exit(1);
}

const layers = decodeTile(result.stdout);
if (layers.length === 0) {
  // **空のタイルは異常ではない。**そう言い切って終える（黙って 0 件を出さない）
  console.log(`${z}/${x}/${y}: レイヤが 1 つもありません（このタイルは空です）`);
  process.exit(0);
}

console.log(`${z}/${x}/${y}`);
console.log(layers.map((l) => `${l.name}(${l.features.length})`).join(" "));

// **読めなかったものは必ず出す。**黙って少ない数を出すと、
// 数え落としが「そういうデータ」に見える（実際に 2724 → 5 を数字だけ見て見逃しかけた）
const unreadable = layers.filter((l) => l.unreadable > 0);
if (unreadable.length > 0) {
  console.error("");
  for (const layer of unreadable) {
    console.error(`警告 ${layer.name}: ${layer.unreadable} 件を読めませんでした（下の数は、その分少ないです）`);
  }
  console.error("");
}

const wantLayer = flag("layer");
const by = flag("by") ?? "kind";
const at = flag("at");

for (const layer of layers) {
  if (wantLayer !== undefined && layer.name !== wantLayer) continue;

  let features: readonly Feature[] = layer.features;
  let title = `${layer.name}: ${features.length} 件`;

  if (at !== undefined) {
    const zoom = Number(at);
    features = visibleAt(features, zoom);
    // **上流の min_zoom で何件に減るか**は、スタイルを決めるときに要る数字
    title += ` → z${at} で出る資格があるのは ${features.length} 件`;
  }

  console.log(`\n--- ${title} ---`);
  const keys = new Set<string>();
  for (const feature of features) for (const key of Object.keys(feature.props)) keys.add(key);
  console.log(`属性キー: ${[...keys].sort().join(", ") || "(なし)"}`);

  console.log(`\n[${by}]`);
  for (const row of tally(features, by)) console.log(`  ${row.value}: ${row.count}`);

  if (has("list")) {
    console.log("\n[中身]");
    for (const feature of features) console.log(`  ${JSON.stringify(feature.props)}`);
  }
}
