/**
 * MapLibre を読み、`window.maplibregl` に置く。
 *
 * ## なぜ 1 枚挟むのか
 *
 * MapLibre 6 は ESM だけを配っている。`dist/maplibre-gl.js`（UMD）は無く、
 * `exports` は `./dist/maplibre-gl.mjs` の 1 本だけ（registry で実測・2026-10-06）。
 * だから 5 系で書いていた
 *
 *     <script src="./vendor/maplibre-gl/maplibre-gl.js"></script>
 *
 * は 404 になり、`maplibregl is not defined` で地図が 1 枚も出ない。
 *
 * 部品（`mmj-map` ほか）が見ているのは `window.maplibregl` で、ここは変えていない。
 * 5 系を読んでいる利用者の HTML は、そのまま動く。
 *
 * ## 既定の輸入を使わないこと
 *
 * 6 系に既定の輸出は無い。`import maplibregl from` と書くと `undefined` が入り、
 * **読み込みは成功したまま**地図だけが出ない。`import * as` でまとめて受ける。
 */
import * as maplibregl from "./vendor/maplibre-gl/maplibre-gl.mjs";

window.maplibregl = maplibregl;
