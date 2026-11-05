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
  MAPLIBRE_FILES,
  MAPLIBRE_VERSION,
  MAP_STYLES,
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
 * 置き手が見本の頁で入れるピン。**名前・住所・ホームページ・位置はどれも置き手自身のデータ**で、
 * Google の地点のデータではない（D-034）。
 *
 * @typedef {{ lng: number, lat: number, name: string, note: string, url?: string }} Pin
 */

/** 吹き出しのリンクに出す文字 */
const LINK_LABEL = "ホームページ";

/**
 * **人が打った文字を属性値へ入れるときは、必ずここを通す。**
 * `"` 1 つで属性が閉じ、続きが HTML として貼られる。
 *
 * @param {string} text
 */
function escapeAttribute(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * ホームページの URL として写してよいか。
 *
 * **通すのは http / https だけ。**`javascript:` は押した瞬間に、貼った先の頁で走る。
 * 部品（`isSafeLink`）も弾くが、**弾かれるものを写すものに入れない。**
 * 「example.com」のように `https://` が無いものも通さない。直して通すと、
 * 打った人の思った所と違う所へ飛ぶことがある。**通さず、見本の頁で知らせる。**
 *
 * @param {string | undefined} value
 * @returns {string | null} 通る URL。空なら ""、通らなければ null
 */
export function pinLink(value) {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") return "";
  // 読み方はブラウザに任せる（タブを挟んだ `java\tscript:` も、ここで `javascript:` に戻る）
  if (!URL.canParse(trimmed)) return null;
  const { protocol } = new URL(trimmed);
  return protocol === "https:" || protocol === "http:" ? trimmed : null;
}

/**
 * ピン 1 本に置く属性の並び。**見本の頁と写すもので同じものを置く**ため、ここ 1 か所で決める。
 *
 * - 1 行目（`popup`）は名前。**この行は折り返さない**
 * - 住所は名前が無くても、いつも 2 行目（`popup-body`・折り返す）。**1 行目に入れると、
 *   長い住所で吹き出しが携帯の地図の外へ伸びた**（2026-11-04、2 回踏んだ）
 * - ホームページは通る URL のときだけ
 * - 何か出るものがあれば、吹き出しを最初から開いておく
 *   （会社の頁の地図は、開いた瞬間に「ここです」と読めるほうがよい）
 *
 * @param {Pin} pin
 * @returns {Array<[string, string]>} 値が "" のものは、値を持たない属性
 */
export function markerAttributes(pin) {
  const name = pin.name.trim();
  const note = pin.note.trim();
  const link = pinLink(pin.url);
  /** @type {Array<[string, string]>} */
  const attributes = [["lnglat", `${pin.lng},${pin.lat}`]];
  if (name !== "") attributes.push(["popup", name]);
  if (note !== "") attributes.push(["popup-body", note]);
  if (link) attributes.push(["popup-href", link], ["popup-href-label", LINK_LABEL]);
  if (attributes.length > 1) attributes.push(["popup-open", ""]);
  return attributes;
}

/**
 * ピン 1 本の `<mmj-marker>`。**人が打った文字は、必ず逃がしてから入れる。**
 *
 * @param {Pin} pin
 * @returns {string}
 */
export function buildMarker(pin) {
  const attributes = markerAttributes(pin)
    .map(([name, value]) => (value === "" ? name : `${name}="${escapeAttribute(value)}"`))
    .join(" ");
  return `<mmj-marker ${attributes}></mmj-marker>`;
}

/**
 * 地図の配色。**知らない名前は既定へ戻す**（属性値へそのまま入るため）。
 *
 * @param {string | undefined} style
 */
function styleOf(style) {
  return MAP_STYLES.find(({ id }) => id === style)?.id ?? MAP_STYLES[0]?.id ?? "modern-light";
}

/**
 * @typedef {{ pin?: Pin | null, style?: string }} SnippetOptions
 */

/**
 * 地図の中心。**ピンを置いたら、ピンを真ん中にする。**見ていた場所の中心のままだと、
 * 携帯幅でピンが端で切れる。縮尺は見ていたもののまま。
 *
 * @param {Place} place
 * @param {Pin | null} pin
 * @returns {Place}
 */
function centerOf(place, pin) {
  return pin === null ? place : { lng: pin.lng, lat: pin.lat, zoom: place.zoom };
}

/**
 * 貼るもの。`llms.txt` の「写して動く最小の 1 枚」と同じ組み立てで、
 * **MapLibre と pmtiles だけは CDN ではなく頁の隣（`./vendor/`）から読む**。
 * MV3 の審査は、拡張が実行しない文面でも、中にある CDN の `<script src>` で落とす
 * （2026-11-05、Blue Argon で拒否された）。置き方は先頭の注記に書く。
 *
 * @param {Place} place
 * @param {SnippetOptions} [options] 置き手が見本の頁で置いたピンと、選んだ配色
 * @returns {string}
 */
export function buildSnippet(place, { pin = null, style } = {}) {
  const center = centerOf(place, pin);
  const bbox = extractBbox(center).join(",");
  const marker = pin === null ? "" : `  ${buildMarker(pin)}\n`;
  const maplibreFiles = MAPLIBRE_FILES.map((name) => `node_modules/maplibre-gl/dist/${name}`).join(" ");
  return `<!-- 頁の隣に置くもの
     1. タイル: npx @mmj-map/tiles extract map --bbox=${bbox}
        出てきた ./tiles/map.<日付>.pmtiles に合わせて tiles を直す。
     2. MapLibre と pmtiles: npm i maplibre-gl@${MAPLIBRE_VERSION} pmtiles@${PMTILES_VERSION} のあと
        ${maplibreFiles} を ./vendor/maplibre-gl/ へ、
        node_modules/pmtiles/dist/pmtiles.js を ./vendor/pmtiles/ へ写す。
     3. スタイルと部品: https://github.com/meta-taro/mmj-map/blob/develop/docs/install/ja.md -->
<link rel="stylesheet" href="./vendor/maplibre-gl/maplibre-gl.css">
<style>mmj-map { display: block; height: 70vh; }</style>

<mmj-map
  tiles="./tiles/map.pmtiles"
  style-url="./styles/${styleOf(style)}.json"
  center="${center.lng},${center.lat}"
  zoom="${place.zoom}">
${marker}</mmj-map>

<script type="module">
  import * as maplibregl from "./vendor/maplibre-gl/maplibre-gl.mjs";
  window.maplibregl = maplibregl;
</script>
<script src="./vendor/pmtiles/pmtiles.js"></script>
<script type="module" src="./elements/index.js"></script>`;
}

/**
 * エージェントへ渡すもの。**これ 1 枚で続きを組める**ように、手順・守ること・参照先を入れる。
 *
 * @param {Place} place
 * @param {SnippetOptions} [options] 置き手が見本の頁で置いたピンと、選んだ配色
 * @returns {string} Markdown
 */
export function buildAgentBrief(place, options = {}) {
  const center = centerOf(place, options.pin ?? null);
  const bbox = extractBbox(center).join(",");
  return `# この場所に MMJ の地図を置く

MMJ（mmj-map）は、API キーもタイルサーバーも要らない地図の部品です。
PMTiles 1 ファイルとスタイル JSON を静的に置くだけで動きます。

- 中心: 経度 ${center.lng}、緯度 ${center.lat}
- 縮尺: ${place.zoom}（MapLibre の縮尺。Google マップの表示より 1 小さい数で同じ範囲になる）

## 手順

1. タイルを切り出す: \`npx @mmj-map/tiles extract map --bbox=${bbox}\`
2. スタイルと部品を置く: https://github.com/meta-taro/mmj-map/blob/develop/docs/install/ja.md
3. 下の HTML を貼り、\`tiles\` を 1 で出てきたファイル名に直す

\`\`\`html
${buildSnippet(place, options)}
\`\`\`

## 守ること

- \`© OpenStreetMap contributors\` の帰属表示を画面から外さない（ODbL）
- Google マップから店名やピンを写さない。目印は自分のデータで \`<mmj-marker lnglat="経度,緯度" popup="名前" popup-body="住所" popup-href="https://…">\` を足す

## 参照

- 部品の属性の全文: ${DEMO_BASE}llms-full.txt
- 見本: ${DEMO_BASE}
`;
}

/**
 * 見本で使うタイルと、見本を出す縮尺。都市のタイルがあればそれ、無ければデモ。
 *
 * 見本のタイルが持つ範囲に合わせて縮尺を変えたときは、`zoomed: true` で知らせる。
 * **貼るものの縮尺は変えない。**街路まで出る場所かどうかは `detail` で返す
 * （見本の頁に出す。「どこにタイルがあるか分からない」と言われた・2026-11-04）。
 *
 * - **都市のタイルは都市しか持たない。**画面がタイルより広いと、真ん中に都市があるだけの
 *   黒い四角になるので、画面が収まるまで寄せる
 * - **デモは大阪中心部の外を z9 の俯瞰までしか持たない。**その外では z9 まで引く
 *
 * @param {Place} place
 * @returns {{ file: string, label: string, zoom: number, zoomed: boolean, detail: boolean, lang?: string }}
 */
export function pickPreviewTiles({ lng, lat, zoom }) {
  const region = PUBLISHED_REGIONS.find(({ bbox }) => contains(bbox, lng, lat));
  if (region !== undefined) {
    const { file, label, lang, bbox } = region;
    const fitted = Math.max(zoom, zoomToFit(bbox, lat));
    const picked = { file, label, zoom: fitted, zoomed: fitted > zoom, detail: true };
    return lang === undefined ? picked : { ...picked, lang };
  }
  if (contains(DEMO_DETAIL_BBOX, lng, lat)) {
    return { file: "demo", label: DEMO_DETAIL_LABEL, zoom, zoomed: false, detail: true };
  }
  const capped = Math.min(zoom, DEMO_OVERVIEW_MAX_ZOOM);
  return { file: "demo", label: "全国の俯瞰（z9 まで）", zoom: capped, zoomed: capped < zoom, detail: false };
}

/** デモが街路まで持つ範囲の名前 */
const DEMO_DETAIL_LABEL = "大阪中心部";

/**
 * 見本で街路まで出る場所の名前。**見本の頁に一覧で出す**（行けば街路まで見られる場所）。
 *
 * @returns {string[]}
 */
export function detailPlaces() {
  return [DEMO_DETAIL_LABEL, ...PUBLISHED_REGIONS.map((region) => region.label)];
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
