/**
 * 一覧と地図を繋ぐための判断。**ここは純粋関数。**DOM も地図も触らない。
 *
 * ## 2 つの向き
 *
 * - **地図 → 一覧**: 地図を動かし終えたら、いま見えている範囲にある点の id を渡す
 *   （`mmj-visible`）。一覧を絞るのは置く側（一覧の見た目は導入先の UI のもの）
 * - **一覧 → 地図**: 外から id を渡すと、その点まで寄って選ぶ（`select(id)`）
 *
 * ## 画面に描かれたものではなく、渡されたデータで数える
 *
 * MapLibre の `queryRenderedFeatures` は**描かれたものしか返さない**。まとめた丸の中の点、
 * 文字と重なって省かれた点、タイルを読み込み中の点は**数に入らない**。それでは
 * 「地図に見えている範囲にある店」と一覧が食い違う。だから**点の座標と範囲を比べる**。
 */

/**
 * 地図の見えている範囲。`map.getBounds()` の `getWest()` などをそのまま渡す。
 *
 * **経度は -180〜180 に収まっているとは限らない**（世界を横に何周も回せるので、
 * `west` が -200 になることがある）。
 *
 * @typedef {{ west: number, south: number, east: number, north: number }} Bounds
 */

/**
 * 範囲の中にある点の id を、渡された順に返す。
 *
 * - **点（Point）だけ。**線や面は「どこにあるか」が 1 点に決まらない
 * - **id は文字に揃える**（`7` と `"7"` を同じ店として扱う。`card.js` の `indexOfShop` と同じ）
 * - **同じ id は 1 回だけ**（同じ店が 2 行出る一覧にしない）
 * - id が無い点は数えない（一覧のどの行かを言い当てられない）
 *
 * @param {readonly any[] | null | undefined} features
 * @param {Bounds | null | undefined} bounds
 * @param {string | null | undefined} idKey
 * @returns {string[]}
 */
export function visibleIds(features, bounds, idKey) {
  if (!Array.isArray(features) || !isBounds(bounds)) return [];
  if (typeof idKey !== "string" || idKey === "") return [];
  const inside = containsLngLat(/** @type {Bounds} */ (bounds));
  const seen = new Set();
  /** @type {string[]} */
  const ids = [];
  for (const feature of features) {
    const id = idOf(feature, idKey);
    if (id === null || seen.has(id)) continue;
    const coordinates = pointOf(feature);
    if (coordinates === null || !inside(coordinates)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * 前と同じ並びか。**同じなら知らせない**——地図を少し引きずるたびに一覧が組み直されると、
 * 一覧の中で見ていた所を見失う。
 * @param {readonly string[] | null} before
 * @param {readonly string[]} after
 */
export function sameIds(before, after) {
  if (before === null || before.length !== after.length) return false;
  return before.every((id, index) => id === after[index]);
}

/**
 * 一覧から選んだ点へ寄るときの zoom。
 *
 * **点がばらで見える所まで寄る。**まとまったままだと、選んだ点が丸の中に隠れて
 * 「どれを選んだか」が地図に出ない。**今より引かない**（寄っていた人を遠ざけない）。
 *
 * @param {number} current いまの zoom
 * @param {number} atLeast 点がばらで見える最小の zoom
 */
export function focusZoom(current, atLeast) {
  if (!Number.isFinite(current)) return atLeast;
  return Math.max(current, atLeast);
}

/**
 * id で点を引く。**無ければ null。**数の id と文字の id を同じに扱う。
 * @param {readonly any[] | null | undefined} features
 * @param {string | null | undefined} idKey
 * @param {unknown} id
 * @returns {any | null}
 */
export function findPoint(features, idKey, id) {
  if (!Array.isArray(features) || typeof idKey !== "string" || idKey === "") return null;
  if (id === null || id === undefined || id === "") return null;
  const wanted = String(id);
  return features.find((feature) => idOf(feature, idKey) === wanted && pointOf(feature) !== null) ?? null;
}

/** @param {unknown} bounds */
function isBounds(bounds) {
  if (bounds === null || typeof bounds !== "object") return false;
  const { west, south, east, north } = /** @type {any} */ (bounds);
  return [west, south, east, north].every(Number.isFinite) && south <= north;
}

/**
 * 経度は**西の端から東へ何度か**で比べる（回り込んだ範囲でも同じ式で済む）。
 * @param {Bounds} bounds
 * @returns {(lngLat: [number, number]) => boolean}
 */
function containsLngLat(bounds) {
  const span = bounds.east - bounds.west;
  return ([lng, lat]) => {
    if (lat < bounds.south || lat > bounds.north) return false;
    if (span >= 360) return true;
    const fromWest = (((lng - bounds.west) % 360) + 360) % 360;
    return fromWest <= span;
  };
}

/** @param {any} feature @param {string} idKey @returns {string | null} */
function idOf(feature, idKey) {
  const value = feature?.properties?.[idKey];
  if (value === undefined || value === null) return null;
  const text = String(value);
  return text === "" ? null : text;
}

/** @param {any} feature @returns {[number, number] | null} */
function pointOf(feature) {
  const geometry = feature?.geometry;
  if (geometry?.type !== "Point" || !Array.isArray(geometry.coordinates)) return null;
  const [lng, lat] = geometry.coordinates;
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
}
