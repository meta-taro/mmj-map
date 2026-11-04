/**
 * 見本の頁。仮の頁に `<mmj-map>` を 1 枚置き、携帯幅と PC 幅で見比べる。
 * 置き手はここで**自分の**名前・住所・ピンの位置を入れ、写すものへそのまま入れられる。
 *
 * **タイルとスタイルはデモの公開先から読む。**読むのはデータだけで、
 * コード（MapLibre・pmtiles・部品）は拡張の中に同梱してある（MV3 は外のコードを読めない）。
 */
import { DEMO_BASE } from "./constants.js";
import { buildAgentBrief, buildSnippet, pickPreviewTiles, pinText } from "./snippet.js";
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
/** ピンの座標の桁。小数 5 桁は約 1 m（`view.js` と同じ） */
const PIN_DIGITS = 5;

/** @param {string} id */
function byId(id) {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`頁に #${id} がありません`);
  return element;
}

/** @param {string} id */
function inputById(id) {
  return /** @type {HTMLInputElement} */ (byId(id));
}

/** @param {number} value */
function roundPin(value) {
  const scale = 10 ** PIN_DIGITS;
  return Math.round(value * scale) / scale;
}

/** @param {number} width */
function setWidth(width) {
  byId("mock-page").style.width = `${width}px`;
  for (const button of document.querySelectorAll("[data-width]")) {
    button.setAttribute("aria-pressed", String(button.getAttribute("data-width") === String(width)));
  }
}

/**
 * @param {HTMLElement} button
 * @param {() => string} text 押した時点の中身を作る
 */
function bindCopy(button, text) {
  const label = button.textContent;
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(text());
      button.textContent = "写しました";
    } catch (error) {
      button.textContent = "写せませんでした";
      console.error(error);
    }
    setTimeout(() => {
      button.textContent = label;
    }, COPIED_MS);
  });
}

/**
 * ピンを描き直す。`<mmj-marker>` は属性の変化を見ないので、**外して置き直す**。
 *
 * @param {HTMLElement} map
 * @param {import("./snippet.js").Pin | null} pin
 */
function renderPin(map, pin) {
  map.querySelector("mmj-marker")?.remove();
  if (pin === null) return;
  const marker = document.createElement("mmj-marker");
  marker.setAttribute("lnglat", `${pin.lng},${pin.lat}`);
  const text = pinText(pin);
  if (text !== "") {
    marker.setAttribute("popup", text);
    marker.setAttribute("popup-open", "");
  }
  map.append(marker);
}

/**
 * @param {HTMLElement} map
 * @returns {Promise<any>} MapLibre の地図
 */
function whenReady(map) {
  const ready = /** @type {any} */ (map).map;
  if (ready) return Promise.resolve(ready);
  return new Promise((resolve) => {
    map.addEventListener("mmj-ready", (/** @type {any} */ event) => resolve(event.detail.map), { once: true });
  });
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

  setWidth(1100);

  // **ピンは最初、見ていた場所の真ん中に立てる。**置き手が押して動かす
  const pin = { lng: place.lng, lat: place.lat, name: "", note: "" };
  let pinned = true;
  const current = () => (pinned ? { ...pin } : null);

  const name = inputById("pin-name");
  const memo = inputById("pin-note");
  const toggle = byId("pin-toggle");
  const update = () => {
    pin.name = name.value;
    pin.note = memo.value;
    toggle.textContent = pinned ? "ピンを外す" : "ピンを置く";
    renderPin(map, current());
  };
  name.addEventListener("input", update);
  memo.addEventListener("input", update);
  toggle.addEventListener("click", () => {
    pinned = !pinned;
    update();
  });

  const engine = await whenReady(map);
  update();
  /** @param {{ lng: number, lat: number }} lngLat */
  const moveTo = ({ lng, lat }) => {
    pin.lng = roundPin(lng);
    pin.lat = roundPin(lat);
    pinned = true;
    update();
  };
  engine.on("click", (/** @type {any} */ event) => moveTo(event.lngLat));
  // **マウスで出来ることを、キーボードでも出来るように。**矢印で地図を動かし、このボタンで寄せる
  byId("pin-center").addEventListener("click", () => moveTo(engine.getCenter()));

  // 幅を変えたら、**貼る HTML と同じく**ピンを真ん中に置き直す（携帯幅でピンが端で切れないか見るため）
  for (const button of document.querySelectorAll("[data-width]")) {
    button.addEventListener("click", () => {
      setWidth(Number(button.getAttribute("data-width")));
      if (pinned) engine.jumpTo({ center: [pin.lng, pin.lat] });
    });
  }

  bindCopy(byId("copy-html"), () => buildSnippet(place, current()));
  bindCopy(byId("copy-brief"), () => buildAgentBrief(place, current()));
}

main().catch((error) => {
  byId("tiles-note").textContent = `見本を出せませんでした: ${error instanceof Error ? error.message : String(error)}`;
  console.error(error);
});
