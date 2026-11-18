/**
 * 「名前の付いた範囲」までの距離。**ここは純粋関数。**
 *
 * 店の場所が「東口のあたり」「駅から 500 m」のような**範囲**で示されるとき、
 * 「現在地から近い順に並べる」には、点と点の距離ではなく**範囲の縁までの距離**が要る。
 * 範囲の中にいれば 0。並べ替えと一覧の見た目は利用側で行う。
 *
 * **描くのは店の範囲まで。**人ひとりの今いる場所を範囲として出す使い方は受けない
 * （付きまといに使えてしまうため）。
 *
 * 範囲は 2 つの形で受ける:
 * - `{ center: [経度, 緯度], radius: m }` — `<mmj-circle>` と同じ
 * - GeoJSON の Polygon / MultiPolygon（Feature で包んでもよい）— `<mmj-fill>` と同じ
 */
import { distance } from "./walk.js";

/** @typedef {[number, number]} LngLat */

const RAD = Math.PI / 180;
/** 緯度 1 度の長さ（m）。`walk.js` と同じ地球の半径から */
const METERS_PER_DEG = 6_371_008.8 * RAD;

/**
 * 範囲までの距離（m）。**中にいれば 0。**
 *
 * **読めない入力には null を返す。**作った距離で並べると、無い範囲が先頭に来る。
 *
 * @param {LngLat} point `[経度, 緯度]`
 * @param {{ center: LngLat, radius: number } | any} area
 * @returns {number | null}
 */
export function distanceToArea(point, area) {
  if (!isLngLat(point) || area === null || typeof area !== "object") return null;
  if ("center" in area) return toCircle(point, area);
  const polygons = polygonsOf(area.type === "Feature" ? area.geometry : area);
  if (polygons === null) return null;
  let nearest = Number.POSITIVE_INFINITY;
  for (const rings of polygons) {
    const meters = toPolygon(point, rings);
    if (meters === 0) return 0;
    nearest = Math.min(nearest, meters);
  }
  return Number.isFinite(nearest) ? nearest : null;
}

/** @param {unknown} value @returns {value is LngLat} */
function isLngLat(value) {
  return Array.isArray(value) && Number.isFinite(value[0]) && Number.isFinite(value[1]);
}

/**
 * @param {LngLat} point
 * @param {{ center: unknown, radius: unknown }} circle
 */
function toCircle(point, circle) {
  const { center, radius } = circle;
  if (!isLngLat(center) || typeof radius !== "number" || !Number.isFinite(radius) || radius <= 0) return null;
  return Math.max(0, distance(point, center) - radius);
}

/**
 * Polygon / MultiPolygon を「多角形（輪の並び）の並び」へ揃える。読めなければ null。
 * @param {any} geometry
 * @returns {LngLat[][][] | null}
 */
function polygonsOf(geometry) {
  if (geometry?.type === "Polygon" && Array.isArray(geometry.coordinates)) return [geometry.coordinates];
  if (geometry?.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) return geometry.coordinates;
  return null;
}

/**
 * 1 つの多角形（外周＋穴）までの距離。
 *
 * **点のまわりだけを平らな m の座標へ移して測る。**店の範囲は数 km までなので、
 * この近似で足りる（10 km 先でも誤差は 1% に届かない）。
 *
 * @param {LngLat} point
 * @param {LngLat[][]} rings
 */
function toPolygon(point, rings) {
  const scaleX = METERS_PER_DEG * Math.cos(point[1] * RAD);
  /** @param {LngLat} p @returns {LngLat} */
  const local = (p) => [(p[0] - point[0]) * scaleX, (p[1] - point[1]) * METERS_PER_DEG];
  const flat = rings.filter((ring) => Array.isArray(ring) && ring.length >= 3).map((ring) => ring.map(local));
  const [outer, ...holes] = flat;
  if (outer === undefined) return Number.POSITIVE_INFINITY;
  // 外周の中にいて、どの穴の中にもいなければ「範囲の中」
  if (containsOrigin(outer) && !holes.some(containsOrigin)) return 0;
  return Math.min(...flat.map(edgeDistance));
}

/**
 * 原点（測る点）が輪の中にあるか。半直線を右へ伸ばし、横切る辺の数で決める。
 * @param {LngLat[]} ring
 */
function containsOrigin(ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = /** @type {LngLat} */ (ring[i]);
    const [xj, yj] = /** @type {LngLat} */ (ring[j]);
    if (yi > 0 !== yj > 0 && 0 < (xj - xi) * (-yi / (yj - yi)) + xi) inside = !inside;
  }
  return inside;
}

/**
 * 原点から輪のいちばん近い辺までの距離。
 * @param {LngLat[]} ring
 */
function edgeDistance(ring) {
  let nearest = Number.POSITIVE_INFINITY;
  for (let i = 1; i < ring.length; i += 1) {
    nearest = Math.min(nearest, segmentDistance(/** @type {LngLat} */ (ring[i - 1]), /** @type {LngLat} */ (ring[i])));
  }
  return nearest;
}

/**
 * 原点から線分 ab までの距離。
 * @param {LngLat} a @param {LngLat} b
 */
function segmentDistance(a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / lengthSq));
  return Math.hypot(a[0] + t * dx, a[1] + t * dy);
}
