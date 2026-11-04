/**
 * 読んだ場所から、貼るもの・エージェントへ渡すもの・見本のタイルを作る。**ここは純粋関数。**
 *
 * **Google の地点のデータは入れない**（D-034）。入るのは中心と縮尺だけで、
 * 目印（`<mmj-marker>`）は置き手が自分のデータで足す。
 */
import {
  DEMO_BASE,
  DEMO_DETAIL_BBOX,
  DEMO_OVERVIEW_MAX_ZOOM,
  MAPLIBRE_VERSION,
  PMTILES_VERSION,
  PUBLISHED_REGIONS,
} from "./constants.js";

/**
 * 切り出す範囲は「PC 幅の画面 1 枚」の 1.5 倍。ぴったりだと、少し動かしただけで縁に当たる。
 * 縦横は 1280×800 で見積もる（携帯幅はこれに収まる）。
 */
const SCREEN = { width: 1280, height: 800 };
const MARGIN = 1.5;
/** MapLibre の区画 1 枚の幅（px） */
const TILE_SIZE = 512;
/** Web メルカトルが描ける緯度の端 */
const MAX_LAT = 85;
const BBOX_DIGITS = 4;

/** @typedef {{ lng: number, lat: number, zoom: number }} Place */

/**
 * `npx @mmj-map/tiles extract` に渡す範囲。
 *
 * @param {Place} place
 * @returns {[number, number, number, number]} `[西, 南, 東, 北]`
 */
export function extractBbox({ lng, lat, zoom }) {
  const degreesPerPixel = 360 / (TILE_SIZE * 2 ** zoom);
  const halfWidth = (SCREEN.width / 2) * degreesPerPixel * MARGIN;
  // メルカトルでは、緯度 1 度の長さが経度 1 度の 1/cos(緯度) 倍になる
  const halfHeight = (SCREEN.height / 2) * degreesPerPixel * MARGIN * Math.cos((lat * Math.PI) / 180);
  return [
    round(Math.max(-180, lng - halfWidth)),
    round(Math.max(-MAX_LAT, lat - halfHeight)),
    round(Math.min(180, lng + halfWidth)),
    round(Math.min(MAX_LAT, lat + halfHeight)),
  ];
}

/**
 * 貼るもの。**`llms.txt` の「写して動く最小の 1 枚」と同じ形**にしてある。
 *
 * @param {Place} place
 * @returns {string}
 */
export function buildSnippet(place) {
  const bbox = extractBbox(place).join(",");
  return `<!-- タイルを切り出す: npx @mmj-map/tiles extract map --bbox=${bbox}
     出てきた ./tiles/map.<日付>.pmtiles に合わせて tiles を直す。
     スタイルと部品の置き方: https://github.com/meta-taro/mmj-map/blob/develop/docs/install/ja.md -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css">
<style>mmj-map { display: block; height: 70vh; }</style>

<mmj-map
  tiles="./tiles/map.pmtiles"
  style-url="./styles/modern-dark.json"
  center="${place.lng},${place.lat}"
  zoom="${place.zoom}">
</mmj-map>

<script type="module">
  import * as maplibregl from "https://cdn.jsdelivr.net/npm/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.mjs";
  window.maplibregl = maplibregl;
</script>
<script src="https://cdn.jsdelivr.net/npm/pmtiles@${PMTILES_VERSION}/dist/pmtiles.js"></script>
<script type="module" src="./elements/index.js"></script>`;
}

/**
 * エージェントへ渡すもの。**これ 1 枚で続きを組める**ように、手順・守ること・参照先を入れる。
 *
 * @param {Place} place
 * @returns {string} Markdown
 */
export function buildAgentBrief(place) {
  const bbox = extractBbox(place).join(",");
  return `# この場所に MMJ の地図を置く

MMJ（mmj-map）は、API キーもタイルサーバーも要らない地図の部品です。
PMTiles 1 ファイルとスタイル JSON を静的に置くだけで動きます。

- 中心: 経度 ${place.lng}、緯度 ${place.lat}
- 縮尺: ${place.zoom}（MapLibre の縮尺。Google マップの表示より 1 小さい数で同じ範囲になる）

## 手順

1. タイルを切り出す: \`npx @mmj-map/tiles extract map --bbox=${bbox}\`
2. スタイルと部品を置く: https://github.com/meta-taro/mmj-map/blob/develop/docs/install/ja.md
3. 下の HTML を貼り、\`tiles\` を 1 で出てきたファイル名に直す

\`\`\`html
${buildSnippet(place)}
\`\`\`

## 守ること

- \`© OpenStreetMap contributors\` の帰属表示を画面から外さない（ODbL）
- Google マップから店名やピンを写さない。目印は自分のデータで \`<mmj-marker lnglat="経度,緯度">\` を足す

## 参照

- 部品の属性の全文: ${DEMO_BASE}llms-full.txt
- 見本: ${DEMO_BASE}
`;
}

/**
 * 見本で使うタイルと、見本を出す縮尺。都市のタイルがあればそれ、無ければデモ。
 *
 * 見本のタイルが持つ範囲に合わせて縮尺を変えたときは、`zoomed: true` で知らせる。
 * **貼るものの縮尺は変えない。**
 *
 * - **都市のタイルは都市しか持たない。**画面がタイルより広いと、真ん中に都市があるだけの
 *   黒い四角になるので、画面が収まるまで寄せる
 * - **デモは大阪中心部の外を z9 の俯瞰までしか持たない。**その外では z9 まで引く
 *
 * @param {Place} place
 * @returns {{ file: string, label: string, zoom: number, zoomed: boolean, lang?: string }}
 */
export function pickPreviewTiles({ lng, lat, zoom }) {
  const region = PUBLISHED_REGIONS.find(({ bbox }) => contains(bbox, lng, lat));
  if (region !== undefined) {
    const { file, label, lang, bbox } = region;
    const fitted = Math.max(zoom, zoomToFit(bbox, lat));
    const picked = { file, label, zoom: fitted, zoomed: fitted > zoom };
    return lang === undefined ? picked : { ...picked, lang };
  }
  if (contains(DEMO_DETAIL_BBOX, lng, lat)) return { file: "demo", label: "大阪中心部", zoom, zoomed: false };
  const capped = Math.min(zoom, DEMO_OVERVIEW_MAX_ZOOM);
  return { file: "demo", label: "全国の俯瞰（z9 まで）", zoom: capped, zoomed: capped < zoom };
}

/**
 * PC 幅の画面（`SCREEN`）が `bbox` に収まる、いちばん引いた縮尺。
 *
 * @param {readonly number[]} bbox `[西, 南, 東, 北]`
 * @param {number} lat 画面の中心の緯度
 */
function zoomToFit([west = 0, south = 0, east = 0, north = 0], lat) {
  const cos = Math.cos((lat * Math.PI) / 180);
  // 縮尺 z の画面は、横 width * 360 / (512 * 2^z) 度・縦はその cos(緯度) 倍
  const byWidth = Math.log2((SCREEN.width * 360) / (TILE_SIZE * (east - west)));
  const byHeight = Math.log2((SCREEN.height * 360 * cos) / (TILE_SIZE * (north - south)));
  return Math.ceil(Math.max(byWidth, byHeight) * 100) / 100;
}

/**
 * @param {readonly number[]} bbox `[西, 南, 東, 北]`
 * @param {number} lng
 * @param {number} lat
 */
function contains([west = 0, south = 0, east = 0, north = 0], lng, lat) {
  return lng >= west && lng <= east && lat >= south && lat <= north;
}

/** @param {number} value */
function round(value) {
  const scale = 10 ** BBOX_DIGITS;
  return Math.round(value * scale) / scale;
}
