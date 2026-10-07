/**
 * 見本のラスタタイルを書き出す。
 *
 *   pnpm sample-raster                                    # 大阪 z12 のまわり
 *   pnpm sample-raster -- --out-dir=apps/demo/sample-raster
 *
 * **`<mmj-raster>` が重なることを見せるためだけの格子です。**
 * 実在のハザード・雨雲・地盤ではありません（理由は `plan.ts` の頭）。
 *
 * **依存は足していません。**PNG は Node の zlib だけで組みます
 * （画像ライブラリを 1 つ入れるより、40 行書くほうが軽い）。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";

import { EDGE_ALPHA, planTiles, SAMPLE_ALPHA, sampleReport, TILE_SIZE, tileAt } from "./plan.js";
import { FRAME_COUNT, pixelColor, pixelToLngLat } from "./rain.js";

// pnpm はスクリプトをパッケージの中で走らせる。**人が叩いた場所**で解く
const invokedFrom = process.env["INIT_CWD"] ?? process.cwd();
const args = process.argv.slice(2).filter((arg) => arg !== "--");

const outFlag = args.find((arg) => arg.startsWith("--out-dir="))?.slice("--out-dir=".length);
const outDir = path.resolve(invokedFrom, outFlag ?? "dist/sample-raster");

/** PNG の CRC32。**表を作らず素直に回す**（49 枚程度なら十分速い） */
function crc32(buffer: Buffer): number {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xed_b8_83_20 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

/** ベタ塗り ＋ 濃い縁の PNG（RGBA・8bit） */
function png(rgb: readonly [number, number, number]): Buffer {
  const [r, g, b] = rgb;
  // 各行の先頭に filter type(0) が要る
  const raw = Buffer.alloc((TILE_SIZE * 4 + 1) * TILE_SIZE);
  for (let y = 0; y < TILE_SIZE; y += 1) {
    const rowStart = y * (TILE_SIZE * 4 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < TILE_SIZE; x += 1) {
      const at = rowStart + 1 + x * 4;
      const onEdge = x < 3 || y < 3 || x > TILE_SIZE - 4 || y > TILE_SIZE - 4;
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
      raw[at + 3] = onEdge ? EDGE_ALPHA : SAMPLE_ALPHA;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(TILE_SIZE, 0);
  ihdr.writeUInt32BE(TILE_SIZE, 4);
  ihdr[8] = 8; // ビット深度
  ihdr[9] = 6; // RGBA

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** 画素ごとに色を決める PNG（雨雲の見本） */
function pngField(z: number, x: number, y: number, frame: number): Buffer {
  const raw = Buffer.alloc((TILE_SIZE * 4 + 1) * TILE_SIZE);
  for (let py = 0; py < TILE_SIZE; py += 1) {
    const rowStart = py * (TILE_SIZE * 4 + 1);
    raw[rowStart] = 0;
    for (let px = 0; px < TILE_SIZE; px += 1) {
      const [lng, lat] = pixelToLngLat(z, x, y, px, py);
      const [r, g, b, a] = pixelColor(lng, lat, frame, px, py);
      const at = rowStart + 1 + px * 4;
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
      raw[at + 3] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(TILE_SIZE, 0);
  ihdr.writeUInt32BE(TILE_SIZE, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// 1. しくみを見せる格子。**ここは変えない**——
//    四角が大きくて人工的なのは意図で、「z/x/y の画像が並んでいるだけ」を一目で言うため。
//    大阪のデモタイルに重なる範囲（`demo.pmtiles` が持っている場所に合わせる）
const tiles = planTiles([135.5023, 34.6937], 12, 3);

let bytes = 0;
for (const tile of tiles) {
  const dir = path.join(outDir, String(tile.z), String(tile.x));
  mkdirSync(dir, { recursive: true });
  const body = png(tile.rgb);
  writeFileSync(path.join(dir, `${tile.y}.png`), body);
  bytes += body.byteLength;
}

console.log(`${outDir} へ置きました`);
console.log(sampleReport(tiles.length, bytes));

// 2. ここまでできる、を見せる雨雲。**時刻ごとに 1 式**置く。
//
//    `rain/{t}/{z}/{x}/{y}.png`。z は 1 段だけ作り、寄ったときは拡大で見せる
//    （段を増やすと枚数が倍々に増え、CI の成果物が重くなる）。
//    **見せる倍率ぶんを作る。**source の最小倍率を下回ると、MapLibre は何も描かない
//    （実測・2026-10-07: z8 だけ置いて z6.4 で開き、雨雲が 1 滴も出なかった）。
//    台風は広い現象なので z6 から。寄ったぶんは拡大で見せる。
const RAIN_LEVELS = [
  { z: 6, radius: 2 },
  { z: 7, radius: 3 },
];
let rainBytes = 0;
let rainCount = 0;
for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
  for (const level of RAIN_LEVELS) {
    const origin = tileAt(135.5023, 34.6937, level.z);
    for (let x = origin.x - level.radius; x <= origin.x + level.radius; x += 1) {
      for (let y = origin.y - level.radius; y <= origin.y + level.radius; y += 1) {
        const dir = path.join(outDir, "rain", String(frame), String(level.z), String(x));
        mkdirSync(dir, { recursive: true });
        const body = pngField(level.z, x, y, frame);
        writeFileSync(path.join(dir, `${y}.png`), body);
        rainBytes += body.byteLength;
        rainCount += 1;
      }
    }
  }
}

console.log(
  `雨雲の見本: ${FRAME_COUNT} 時刻 × ${rainCount / FRAME_COUNT} 枚（z6〜z7）= ${rainCount} 枚 / ` +
    `${(rainBytes / 1024 / 1024).toFixed(1)} MB — 実在の気象データではありません。` +
    "画素に SAMPLE の字を焼き込んであります。",
);
