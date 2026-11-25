/**
 * 道案内の線を、管理画面で人が引くための判断。**ここは純粋関数。**DOM も地図も触らない。
 *
 * `<mmj-route-editor>` が使う。結果は `<mmj-route>` がそのまま読める GeoJSON
 * （線 1 本 ＋ 案内の点）になる。**経路は計算しない**——人が地図を押した順に繋ぐだけ。
 *
 * **どの関数も、元の経路を変えずに新しい経路を返す。**「1 つ戻す」は前の経路を
 * 取っておくだけで済む（変更の差分を覚えなくてよい）。
 *
 * **読めない入力では何もしない**（同じ経路を返す）。座標が読めないまま `[0,0]` に
 * 点を置くと、アフリカ沖の海に線が伸び、間違いだと気づきにくい。
 */
import { isSafeImage } from "./popup.js";
import { ROUTE_DEFAULTS } from "./route.js";

/** @typedef {[number, number]} LngLat */
/** @typedef {{ lngLat: LngLat, instruction: string, image: string }} EditStep */
/** @typedef {{ line: LngLat[], steps: EditStep[], from: string, to: string }} EditRoute */

/** 小数 7 桁（約 1 cm）。`drag.js` と同じ丸め @param {number} value */
const round = (value) => Math.round(value * 1e7) / 1e7;

/** @param {unknown} value @returns {value is LngLat} */
function isLngLat(value) {
  if (!Array.isArray(value) || value.length < 2) return false;
  const [lng, lat] = value;
  return (
    typeof lng === "number" &&
    typeof lat === "number" &&
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    Math.abs(lng) <= 180 &&
    Math.abs(lat) <= 90
  );
}

/** @param {LngLat} lngLat @returns {LngLat} */
const pair = (lngLat) => [lngLat[0], lngLat[1]];

/**
 * @param {{ from?: string, to?: string }} [names] 出発・到着の名札（`<mmj-route ends>` が出す）
 * @returns {EditRoute}
 */
export function emptyRoute(names = {}) {
  return { line: [], steps: [], from: names.from ?? "", to: names.to ?? "" };
}

/** 線の終わりに点を足す @param {EditRoute} route @param {LngLat} lngLat @returns {EditRoute} */
export function addVertex(route, lngLat) {
  if (!isLngLat(lngLat)) return route;
  return { ...route, line: [...route.line, pair(lngLat)] };
}

/** @param {EditRoute} route @param {number} index @param {LngLat} lngLat @returns {EditRoute} */
export function moveVertex(route, index, lngLat) {
  if (!isLngLat(lngLat) || route.line[index] === undefined) return route;
  return { ...route, line: route.line.map((point, i) => (i === index ? pair(lngLat) : point)) };
}

/** @param {EditRoute} route @param {number} index @returns {EditRoute} */
export function removeVertex(route, index) {
  if (route.line[index] === undefined) return route;
  return { ...route, line: route.line.filter((_, i) => i !== index) };
}

/** 案内の点を足す。ひとことと写真は空で始める @param {EditRoute} route @param {LngLat} lngLat @returns {EditRoute} */
export function addStep(route, lngLat) {
  if (!isLngLat(lngLat)) return route;
  return { ...route, steps: [...route.steps, { lngLat: pair(lngLat), instruction: "", image: "" }] };
}

/** @param {EditRoute} route @param {number} index @param {LngLat} lngLat @returns {EditRoute} */
export function moveStep(route, index, lngLat) {
  if (!isLngLat(lngLat) || route.steps[index] === undefined) return route;
  return { ...route, steps: route.steps.map((step, i) => (i === index ? { ...step, lngLat: pair(lngLat) } : step)) };
}

/**
 * ひとことと写真を書き換える。**渡したものだけ**変える（片方だけ打ち直せるように）。
 * @param {EditRoute} route @param {number} index
 * @param {{ instruction?: string, image?: string }} change
 * @returns {EditRoute}
 */
export function updateStep(route, index, change) {
  if (route.steps[index] === undefined) return route;
  const next = (/** @type {EditStep} */ step) => ({
    ...step,
    instruction: typeof change.instruction === "string" ? change.instruction : step.instruction,
    image: typeof change.image === "string" ? change.image.trim() : step.image,
  });
  return { ...route, steps: route.steps.map((step, i) => (i === index ? next(step) : step)) };
}

/** @param {EditRoute} route @param {number} index @returns {EditRoute} */
export function removeStep(route, index) {
  if (route.steps[index] === undefined) return route;
  return { ...route, steps: route.steps.filter((_, i) => i !== index) };
}

/**
 * `<mmj-route>` が読む GeoJSON にする。
 *
 * - **線は点が 2 つ以上のときだけ**入れる（1 点の線は描けず、`<mmj-route>` が断る）
 * - `from` / `to` と写真は、**空なら書かない**（空の名札を出させない）
 * - ひとことは空でも書く（あとで埋める場所が分かるように）。地図には出ない（`editIssues` が言う）
 *
 * @param {EditRoute} route
 * @param {string} [stepKey] ひとことを書く属性名（`<mmj-route step-key>` と揃える）
 */
export function toGeoJSON(route, stepKey = ROUTE_DEFAULTS.stepKey) {
  /** @type {any[]} */
  const features = [];
  if (route.line.length >= 2) {
    /** @type {Record<string, string>} */
    const properties = {};
    if (route.from !== "") properties.from = route.from;
    if (route.to !== "") properties.to = route.to;
    features.push({
      type: "Feature",
      properties,
      geometry: { type: "LineString", coordinates: route.line.map(([lng, lat]) => [round(lng), round(lat)]) },
    });
  }
  for (const step of route.steps) {
    /** @type {Record<string, string>} */
    const properties = { [stepKey]: step.instruction };
    if (step.image !== "") properties.image = step.image;
    features.push({
      type: "Feature",
      properties,
      geometry: { type: "Point", coordinates: [round(step.lngLat[0]), round(step.lngLat[1])] },
    });
  }
  return { type: "FeatureCollection", features };
}

/**
 * 保存してある経路を読み直す。**文字（属性・入力欄）でも、読んだ GeoJSON でも受ける。**
 *
 * - 線は**最初の 1 本だけ**（編集できるのは 1 本。2 本目を黙って繋がない）
 * - 点は、ひとことが無くても読む（写真だけ置いた点を落とさない）
 * - **読めなければ空から始める。**投げない——管理画面が丸ごと止まる
 *
 * @param {unknown} input
 * @param {string} [stepKey]
 * @returns {EditRoute}
 */
export function fromGeoJSON(input, stepKey = ROUTE_DEFAULTS.stepKey) {
  const data = typeof input === "string" ? parseJson(input) : input;
  const features = Array.isArray(/** @type {any} */ (data)?.features) ? /** @type {any} */ (data).features : [];
  const first = features
    .filter((/** @type {any} */ f) => f?.geometry?.type === "LineString" && Array.isArray(f.geometry.coordinates))
    .map((/** @type {any} */ f) => ({ line: f.geometry.coordinates.filter(isLngLat).map(pair), properties: f.properties ?? {} }))
    .find((/** @type {{ line: LngLat[] }} */ candidate) => candidate.line.length >= 2);
  /** @type {EditStep[]} */
  const steps = features
    .filter((/** @type {any} */ f) => f?.geometry?.type === "Point" && isLngLat(f.geometry.coordinates))
    .map((/** @type {any} */ f) => ({
      lngLat: pair(f.geometry.coordinates),
      instruction: text(f.properties?.[stepKey]),
      image: text(f.properties?.image),
    }));
  if (first === undefined) return { ...emptyRoute(), steps };
  return { line: first.line, steps, from: text(first.properties.from), to: text(first.properties.to) };
}

/** @param {string} value */
function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    // 投げない理由は fromGeoJSON の頭。**呼ぶ側は空の経路を受け取る**
    return null;
  }
}

/** @param {unknown} value */
const text = (value) => (typeof value === "string" ? value : "");

/**
 * **保存する前に、地図に出ないものを言う。**部品は黙って直さない（人が書いたものを消さない）。
 * 管理画面は、これを保存ボタンのそばに出せばよい。
 *
 * @param {EditRoute} route
 * @returns {{ kind: "line" | "words" | "image", message: string, count?: number }[]}
 */
export function editIssues(route) {
  /** @type {{ kind: "line" | "words" | "image", message: string, count?: number }[]} */
  const issues = [];
  if (route.line.length < 2) {
    issues.push({ kind: "line", message: "線の点が 2 つ未満です（駅の出口から店まで、2 つ以上置いてください）" });
  }
  const silent = route.steps.filter((step) => step.instruction.trim() === "").length;
  if (silent > 0) {
    issues.push({ kind: "words", message: `ひとことが空の案内が ${silent} 件あります（地図に出ません）`, count: silent });
  }
  const unsafe = route.steps.filter((step) => step.image !== "" && !isSafeImage(step.image)).length;
  if (unsafe > 0) {
    issues.push({
      kind: "image",
      message: `使えない写真の URL が ${unsafe} 件あります（http / https / 相対パスだけ）`,
      count: unsafe,
    });
  }
  return issues;
}
