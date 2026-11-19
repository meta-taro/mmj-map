/**
 * ピンを動かして位置を直すための判断。**ここは純粋関数。**DOM も地図も触らない。
 *
 * 住所から付けた座標は、建物の真ん中や道の上に落ちることがある。
 * 人がピンを動かして入口に合わせ、直した緯度経度を受け取る（`<mmj-marker draggable>`）。
 *
 * **動かせる範囲を絞れる**（`drag-radius`）。打ち間違いや指の滑りで、
 * 隣の町までピンが飛んだまま保存されるのを防ぐ。
 */

/** 地球の半径（m）。`circle.js` と同じ WGS84 の平均半径 */
const EARTH_RADIUS = 6_371_008.8;

/**
 * 矢印キー 1 回で動かす量（画面の px）。**既定は細かく**——入口に合わせるのが目的なので、
 * 大きく動かしたいときだけ Shift を押す。
 */
export const KEY_STEP = { fine: 4, coarse: 24 };

/** 小数 7 桁（約 1 cm）に丸める @param {number} value */
const round = (value) => Math.round(value * 1e7) / 1e7;

/** @param {number} deg */
const toRad = (deg) => (deg * Math.PI) / 180;

/**
 * 2 点の間の地表の距離（m）。半正矢の公式。
 * @param {[number, number]} a `[経度, 緯度]`
 * @param {[number, number]} b
 */
export function distanceMeters(a, b) {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * 元の点から `meters` の外へ出た位置を、**同じ向きのまま縁へ戻す。**
 *
 * 縁の外で指を離しても、ピンは「行こうとした向きの、行ける所まで」に止まる
 * （元の点へ戻すと、どこまで動かせるのかが分からない）。
 *
 * 範囲は数十〜数百 m の想定なので、元の点のまわりを平面と見て縮める
 * （1 km でも誤差は 1 m に届かない）。
 *
 * @param {[number, number]} origin
 * @param {[number, number]} target
 * @param {number | null} meters `null` なら絞らない
 * @returns {[number, number]}
 */
export function clampWithin(origin, target, meters) {
  if (meters === null || !Number.isFinite(meters) || meters <= 0) return target;
  const distance = distanceMeters(origin, target);
  if (distance <= meters) return target;
  const ratio = meters / distance;
  return [origin[0] + (target[0] - origin[0]) * ratio, origin[1] + (target[1] - origin[1]) * ratio];
}

/**
 * 動かせる範囲（m）を読む。**読めなければ絞らない**（`null`）。
 * 0 や負の数で、ピンを 1 mm も動かせなくしない。
 * @param {string | null | undefined} value
 * @returns {number | null}
 */
export function parseRadius(value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * 矢印キーを、画面の上で動かす量（px）にする。矢印でなければ `null`。
 * @param {string} key `KeyboardEvent.key`
 * @param {boolean} coarse Shift を押しているか
 * @returns {[number, number] | null}
 */
export function arrowStep(key, coarse) {
  const step = coarse ? KEY_STEP.coarse : KEY_STEP.fine;
  switch (key) {
    case "ArrowLeft":
      return [-step, 0];
    case "ArrowRight":
      return [step, 0];
    case "ArrowUp":
      return [0, -step];
    case "ArrowDown":
      return [0, step];
    default:
      return null;
  }
}

/**
 * 動かした結果として渡すもの。**小数 7 桁（約 1 cm）に丸める**——
 * 浮動小数の端数（`135.49590000000001`）を、そのまま保存させない。
 *
 * @param {[number, number]} origin
 * @param {[number, number]} lngLat
 */
export function moveDetail(origin, lngLat) {
  const lng = round(lngLat[0]);
  const lat = round(lngLat[1]);
  return {
    lng,
    lat,
    lngLat: /** @type {[number, number]} */ ([lng, lat]),
    moved: Math.round(distanceMeters(origin, [lng, lat]) * 10) / 10,
  };
}
