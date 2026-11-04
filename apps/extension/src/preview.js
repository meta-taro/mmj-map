/**
 * 見本の頁。仮の頁に `<mmj-map>` を 1 枚置き、携帯幅と PC 幅で見比べる。
 * 置き手はここで**自分の**名前・住所・ホームページ・ピンの位置を入れ、写すものへそのまま入れられる。
 *
 * **決めごとは `snippet.js`（純粋関数・試験あり）。**ここはそれを画面へ置くだけ。
 *
 * **タイルとスタイルはデモの公開先から読む。**読むのはデータだけで、
 * コード（MapLibre・pmtiles・部品）は拡張の中に同梱してある（MV3 は外のコードを読めない）。
 */
import { DEMO_BASE, MAP_STYLES } from "./constants.js";
import {
  buildAgentBrief,
  buildSnippet,
  detailPlaces,
  markerAttributes,
  pickPreviewTiles,
  pinLink,
} from "./snippet.js";
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

/**
 * 押されたボタンだけを「押されている」にする。
 *
 * @param {string} selector
 * @param {string} attribute
 * @param {string} value
 */
function pressOnly(selector, attribute, value) {
  for (const button of document.querySelectorAll(selector)) {
    button.setAttribute("aria-pressed", String(button.getAttribute(attribute) === value));
  }
}

/** @param {number} width */
function setWidth(width) {
  byId("mock-page").style.width = `${width}px`;
  pressOnly("[data-width]", "data-width", String(width));
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
 * **この場所で、見本がどこまで出るかを言う。**黒い四角を見て「壊れている」と思わせない。
 *
 * @param {ReturnType<typeof pickPreviewTiles>} tiles
 * @param {number} zoom 見ていた縮尺
 */
function showCoverage(tiles, zoom) {
  byId("coverage").dataset["detail"] = String(tiles.detail);
  byId("coverage-title").textContent = tiles.detail
    ? `この場所は、見本でも街路まで出ます（${tiles.label}）`
    : "この場所は、見本では全国の俯瞰だけです";
  const zoomed = tiles.zoomed ? `見本は縮尺 ${zoom} を ${tiles.zoom} に変えて出しています（写す HTML は ${zoom} のまま）。` : "";
  byId("coverage-text").textContent = tiles.detail
    ? zoomed
    : `${zoomed}街路は、写した HTML の先頭にあるコマンドで自分の場所を切り出すと出ます。`;
  byId("coverage-places").textContent = detailPlaces().join("・");
}

/**
 * ピンを描き直す。`<mmj-marker>` は属性の変化を見ないので、**外して置き直す**。
 * 置く属性は写すものと同じ（`markerAttributes`）。
 *
 * @param {HTMLElement} map
 * @param {import("./snippet.js").Pin | null} pin
 */
function renderPin(map, pin) {
  map.querySelector("mmj-marker")?.remove();
  if (pin === null) return;
  const marker = document.createElement("mmj-marker");
  for (const [name, value] of markerAttributes(pin)) marker.setAttribute(name, value);
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

/**
 * 地図を 1 枚作る。**色を変えたら作り直す**（`<mmj-map>` は `style-url` の変化を見ない）。
 *
 * @param {{ file: string, lang?: string }} tiles
 * @param {string} style
 * @param {{ lng: number, lat: number, zoom: number }} view
 */
function createMap(tiles, style, view) {
  const map = document.createElement("mmj-map");
  map.setAttribute("tiles", `${DEMO_BASE}tiles/${tiles.file}.pmtiles`);
  map.setAttribute("style-url", `${DEMO_BASE}styles/${style}.json`);
  map.setAttribute("center", `${view.lng},${view.lat}`);
  map.setAttribute("zoom", String(view.zoom));
  if (tiles.lang !== undefined) map.setAttribute("lang", tiles.lang);
  return map;
}

/** @param {(id: string) => void} choose */
function renderStyleChoices(choose) {
  const box = byId("style-choices");
  for (const { id, label } of MAP_STYLES) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset["style"] = id;
    button.textContent = label;
    button.addEventListener("click", () => choose(id));
    box.append(button);
  }
}

async function main() {
  const place = readPreviewQuery(location.search);
  if (place === null) {
    byId("coverage-title").textContent = "場所が読めませんでした。拡張の窓から開き直してください。";
    return;
  }

  const maplibregl = await import(MAPLIBRE);
  maplibregl.setWorkerUrl(new URL(MAPLIBRE_WORKER, import.meta.url).href);
  /** @type {any} */ (window).maplibregl = maplibregl;
  await import(ELEMENTS);

  const tiles = pickPreviewTiles(place);
  showCoverage(tiles, place.zoom);
  setWidth(1100);

  // **ピンは最初、見ていた場所の真ん中に立てる。**置き手が押して動かす
  const pin = { lng: place.lng, lat: place.lat, name: "", note: "", url: "" };
  let pinned = true;
  let style = MAP_STYLES[0]?.id ?? "modern-light";
  const current = () => (pinned ? { ...pin } : null);

  let map = createMap(tiles, style, { ...place, zoom: tiles.zoom });
  byId("map-slot").replaceWith(map);
  /** @type {any} */
  let engine = null;

  const name = inputById("pin-name");
  const memo = inputById("pin-note");
  const url = inputById("pin-url");
  const urlError = byId("pin-url-error");
  const toggle = byId("pin-toggle");
  const update = () => {
    pin.name = name.value;
    pin.note = memo.value;
    pin.url = url.value;
    // **通らない URL は入れずに、入れていないことを言う**（黙って落とさない）
    const bad = pinLink(url.value) === null;
    urlError.hidden = !bad;
    url.setAttribute("aria-invalid", String(bad));
    toggle.textContent = pinned ? "ピンを外す" : "ピンを置く";
    renderPin(map, current());
  };
  for (const input of [name, memo, url]) input.addEventListener("input", update);
  toggle.addEventListener("click", () => {
    pinned = !pinned;
    update();
  });

  /** @param {{ lng: number, lat: number }} lngLat */
  const moveTo = ({ lng, lat }) => {
    pin.lng = roundPin(lng);
    pin.lat = roundPin(lat);
    pinned = true;
    update();
  };

  const mount = async () => {
    engine = await whenReady(map);
    update();
    engine.on("click", (/** @type {any} */ event) => moveTo(event.lngLat));
  };

  /** いま地図に出ている色。**選んだ色（`style`）と食い違ったら作り直す** */
  let mountedStyle = style;
  /** @returns {Promise<void>} */
  const remount = async () => {
    if (engine === null || mountedStyle === style) return;
    // 見ていた場所と縮尺は持ち越す。**色を変えただけで地図が飛ばないように**
    const { lng, lat } = engine.getCenter();
    const fresh = createMap(tiles, style, { lng, lat, zoom: engine.getZoom() });
    map.replaceWith(fresh);
    map = fresh;
    mountedStyle = style;
    engine = null;
    await mount();
    // 作り直している間に、また色が選ばれていたら追いつく
    await remount();
  };
  /**
   * **切り替えは 1 本の列で順に処理する。**素早く 2 回押すと、作り直しの途中で
   * 2 回目が捨てられ、見本の色と写すものの色が食い違った（レビューで指摘・2026-11-04）。
   */
  let switching = Promise.resolve();
  const catchUp = () => {
    switching = switching.then(remount).catch((/** @type {unknown} */ error) => {
      byId("coverage-title").textContent = `地図を作り直せませんでした: ${error instanceof Error ? error.message : String(error)}`;
      console.error(error);
    });
  };
  /** @param {string} next */
  const chooseStyle = (next) => {
    style = next;
    pressOnly("[data-style]", "data-style", style);
    catchUp();
  };
  renderStyleChoices(chooseStyle);
  pressOnly("[data-style]", "data-style", style);

  await mount();
  // 最初の地図ができる前に色を選ばれていたら、ここで追いつく
  catchUp();
  // **マウスで出来ることを、キーボードでも出来るように。**矢印で地図を動かし、このボタンで寄せる
  byId("pin-center").addEventListener("click", () => engine && moveTo(engine.getCenter()));

  // 幅を変えたら、**貼る HTML と同じく**ピンを真ん中に置き直す（携帯幅でピンが端で切れないか見るため）
  for (const button of document.querySelectorAll("[data-width]")) {
    button.addEventListener("click", () => {
      setWidth(Number(button.getAttribute("data-width")));
      if (pinned && engine) engine.jumpTo({ center: [pin.lng, pin.lat] });
    });
  }

  bindCopy(byId("copy-html"), () => buildSnippet(place, { pin: current(), style }));
  bindCopy(byId("copy-brief"), () => buildAgentBrief(place, { pin: current(), style }));
}

main().catch((error) => {
  byId("coverage-title").textContent = `見本を出せませんでした: ${error instanceof Error ? error.message : String(error)}`;
  console.error(error);
});
