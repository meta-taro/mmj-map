/**
 * 拡張が外へ書き出す値。**ここ 1 か所で決め、試験でリポの正本と突き合わせる**
 * （`test/snippet.test.js` の `constants`）。
 */

/** 貼るものが頁の隣へ置いてもらう版。ルートの `package.json` の devDependencies と同じにする */
export const MAPLIBRE_VERSION = "6.14.0";
export const PMTILES_VERSION = "4.5.0";

/**
 * MapLibre 6 の ESM が動くのに要るファイル。拡張の `dist/vendor/maplibre-gl/` へ同梱するものと、
 * 貼るものが置き手に頁の隣へ写してもらうものは**同じ一覧**にする（`scripts/build.mjs` も読む）。
 * **CDN から読む形は書かない。**MV3 の審査は、拡張が実行しない文面でも中の文字列で落とす（2026-11-05）
 */
export const MAPLIBRE_FILES = ["maplibre-gl.mjs", "maplibre-gl-shared.mjs", "maplibre-gl-worker.mjs", "maplibre-gl.css"];

/** デモの公開先。見本はここのタイルとスタイルを読む */
export const DEMO_BASE = "https://meta-taro.github.io/mmj-map/";

/**
 * 見本の頁で選べる地図の配色。**リポの `styles/` にあるものだけ**（試験で突き合わせる）。
 * **先頭が既定。**会社の頁は白地が多く、暗い地図に暗い吹き出しは読みにくかった（2026-11-04）。
 *
 * @type {ReadonlyArray<{ id: string, label: string }>}
 */
export const MAP_STYLES = [
  { id: "modern-light", label: "明るい" },
  { id: "modern-dark", label: "暗い" },
];

/**
 * デモ（`demo.pmtiles`）が街路まで持つ範囲。`tools/tiles/regions/demo-osaka.geojson` を囲む四角。
 * **この外は z9 の俯瞰までしか無い**ので、見本をそれより寄せると黒い四角になる
 * （2026-11-04、東京駅を z14 で開いて「入っていない範囲です」だけが出た）。
 */
export const DEMO_DETAIL_BBOX = /** @type {const} */ ([135.4, 34.6, 135.6, 34.76]);
export const DEMO_OVERVIEW_MAX_ZOOM = 9;

/**
 * 見本で使える、街路まで入った都市のタイル。**公開先へ出しているものだけ**
 * （`deploy.yml` の `for region in …`）。範囲は `tools/tiles/manifest.json` と同じ。
 *
 * ここに無い場所の見本は `demo`（全国を z9 まで・街路は大阪中心部だけ）で出す。
 *
 * @type {ReadonlyArray<{ file: string, label: string, bbox: [number, number, number, number], lang?: string }>}
 */
export const PUBLISHED_REGIONS = [
  { file: "maihama", label: "舞浜", bbox: [139.873, 35.621, 139.897, 35.64] },
  { file: "taipei", label: "台北", bbox: [121.3, 24.9, 121.72, 25.21], lang: "zh-Hant" },
  { file: "shanghai", label: "上海", bbox: [121.2, 30.95, 121.83, 31.43], lang: "zh-Hans" },
  { file: "hochiminh", label: "ホーチミン", bbox: [106.58, 10.68, 106.8, 10.87], lang: "vi" },
  { file: "hanoi", label: "ハノイ", bbox: [105.75, 20.93, 105.92, 21.09], lang: "vi" },
  { file: "singapore", label: "シンガポール", bbox: [103.6, 1.21, 104.05, 1.48], lang: "en" },
  { file: "seoul", label: "ソウル", bbox: [126.76, 37.42, 127.18, 37.7], lang: "ko" },
  { file: "newyork", label: "ニューヨーク", bbox: [-74.03, 40.65, -73.9, 40.83], lang: "en" },
];
