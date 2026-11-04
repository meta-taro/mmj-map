/**
 * 見本の頁。仮の頁に `<mmj-map>` を 1 枚置き、携帯幅と PC 幅で見比べる。
 *
 * **タイルとスタイルはデモの公開先から読む。**読むのはデータだけで、
 * コード（MapLibre・pmtiles・部品）は拡張の中に同梱してある（MV3 は外のコードを読めない）。
 */
import { DEMO_BASE } from "./constants.js";
import { buildSnippet, pickPreviewTiles } from "./snippet.js";
import { readPreviewQuery } from "./view.js";

/**
 * **MapLibre は、拡張の中では worker の在りかを自分で見つけられない。**
 * 自分の URL が `http(s):` のときしか worker の URL を組み立てず、
 * `chrome-extension:` では空のまま地図が出ない。だから明示して渡す。
 *
 * 輸入先を変数に置いているのは、`dist/` にしか無いファイルを型検査に追わせないため。
 */
const MAPLIBRE = "./vendor/maplibre-gl/maplibre-gl.mjs";
const MAPLIBRE_WORKER = "./vendor/maplibre-gl/maplibre-gl-worker.mjs";
const ELEMENTS = "./elements/index.js";

/** 「写しました」を出しておく時間 */
const COPIED_MS = 1500;

/** @param {string} id */
function byId(id) {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`頁に #${id} がありません`);
  return element;
}

/** @param {number} width */
function setWidth(width) {
  byId("mock-page").style.width = `${width}px`;
  for (const button of document.querySelectorAll("[data-width]")) {
    button.setAttribute("aria-pressed", String(button.getAttribute("data-width") === String(width)));
  }
}

async function main() {
  const place = readPreviewQuery(location.search);
  const note = byId("tiles-note");
  if (place === null) {
    note.textContent = "場所が読めませんでした。拡張の窓から開き直してください。";
    return;
  }

  const maplibregl = await import(MAPLIBRE);
  maplibregl.setWorkerUrl(new URL(MAPLIBRE_WORKER, import.meta.url).href);
  /** @type {any} */ (window).maplibregl = maplibregl;
  await import(ELEMENTS);

  const tiles = pickPreviewTiles(place);
  const changed = tiles.zoomed
    ? `見本のタイルが持つ範囲に合わせて、縮尺 ${place.zoom} を ${tiles.zoom} に変えて出しています（写す HTML は ${place.zoom} のまま）。`
    : "";
  note.textContent =
    `見本のタイルはデモのもの（${tiles.label}）です。${changed}` +
    "自分の場所は、写した HTML の先頭にあるコマンドで切り出すと、街路まで出ます。";

  const map = document.createElement("mmj-map");
  map.setAttribute("tiles", `${DEMO_BASE}tiles/${tiles.file}.pmtiles`);
  map.setAttribute("style-url", `${DEMO_BASE}styles/modern-dark.json`);
  map.setAttribute("center", `${place.lng},${place.lat}`);
  map.setAttribute("zoom", String(tiles.zoom));
  if (tiles.lang !== undefined) map.setAttribute("lang", tiles.lang);
  byId("map-slot").replaceWith(map);

  for (const button of document.querySelectorAll("[data-width]")) {
    button.addEventListener("click", () => setWidth(Number(button.getAttribute("data-width"))));
  }
  setWidth(1100);

  const copyHtml = byId("copy-html");
  copyHtml.addEventListener("click", async () => {
    const label = copyHtml.textContent;
    try {
      await navigator.clipboard.writeText(buildSnippet(place));
      copyHtml.textContent = "写しました";
    } catch (error) {
      copyHtml.textContent = "写せませんでした";
      console.error(error);
    }
    setTimeout(() => {
      copyHtml.textContent = label;
    }, COPIED_MS);
  });
}

main().catch((error) => {
  byId("tiles-note").textContent = `見本を出せませんでした: ${error instanceof Error ? error.message : String(error)}`;
  console.error(error);
});
