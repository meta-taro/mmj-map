/**
 * 「ここから半径◯ m」を描くための組み立て。**ここは純粋関数。**
 *
 * **外部サービスもデータも要らない。**地球を球として扱う幾何だけで出る。
 * 経路探索ではないので、`PRD.md` §2 にも触れない。
 *
 * ## 画面上の円を使わない理由
 *
 * MapLibre の `circle-radius` は**画面のピクセル**で、倍率を変えても大きさが変わらない。
 * **拡大すると実際の範囲より小さく、縮小すると大きく見える**——「半径 800 m」と
 * 書いてあるのに 800 m を指していない図になる。
 *
 * だから**地表の点を並べた多角形**にする。**倍率を変えても同じ場所を囲む。**
 *
 * ## 緯度で形が変わるのが正しい
 *
 * メルカトルの地図では、**同じ半径でも緯度が高いほど画面上は縦長に見える**。
 * それは歪みではなく、**地図の側の都合**。ここでは地表の距離で点を置く。
 */

/** 地球の半径（m）。WGS84 の平均半径 */
const EARTH_RADIUS = 6_371_008.8;

/** 円周の分割数。**粗いと多角形に見える** */
const DEFAULT_STEPS = 96;

export const CIRCLE_DEFAULTS = {
  steps: DEFAULT_STEPS,
  /** 面の濃さ。**下の地図が読めないと、どこの話か分からない** */
  fillOpacity: 0.12,
  lineWidth: 1.5,
};

/** @param {number} deg */
const toRad = (deg) => (deg * Math.PI) / 180;
/** @param {number} rad */
const toDeg = (rad) => (rad * 180) / Math.PI;

/**
 * 中心から半径 `meters` の円を、地表の点で並べた GeoJSON にする。
 *
 * **画面の円ではなく地表の円。**倍率を変えても同じ場所を囲む。
 *
 * @param {[number, number]} center `[経度, 緯度]`（GeoJSON と同じ並び）
 * @param {number} meters 半径（m）
 * @param {number} [steps] 円周の分割数
 * @returns {any} Polygon の Feature
 */
export function circleFeature(center, meters, steps = DEFAULT_STEPS) {
  const [lng, lat] = center ?? [];
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    throw new Error(`中心を読めません: ${JSON.stringify(center)}`);
  }
  if (!Number.isFinite(meters) || meters <= 0) {
    // **0 や負の半径で、見えない図形を黙って置かない**
    throw new Error(`半径は 0 より大きい数（m）で指定してください: ${meters}`);
  }

  const angular = meters / EARTH_RADIUS;
  const latRad = toRad(/** @type {number} */ (lat));
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const sinA = Math.sin(angular);
  const cosA = Math.cos(angular);

  /** @type {[number, number][]} */
  const ring = [];
  for (let i = 0; i < steps; i += 1) {
    const bearing = toRad((i * 360) / steps);
    const pointLat = Math.asin(sinLat * cosA + cosLat * sinA * Math.cos(bearing));
    const pointLng =
      toRad(/** @type {number} */ (lng)) +
      Math.atan2(Math.sin(bearing) * sinA * cosLat, cosA - sinLat * Math.sin(pointLat));
    // **経度を -180〜180 に畳む。**日付変更線をまたぐ円で、地図が横に飛ぶのを防ぐ
    ring.push([((toDeg(pointLng) + 540) % 360) - 180, toDeg(pointLat)]);
  }
  // 多角形は閉じる（最初の点をもう一度）
  const first = ring[0];
  if (first !== undefined) ring.push([first[0], first[1]]);

  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

/**
 * 人が読む形の半径。**単位を混ぜない。**
 *
 * 「800 m」と「0.8 km」なら前者のほうが歩く距離として読みやすい。
 * 1000 m 以上で km へ切り替える。
 * @param {number} meters
 */
export function formatRadius(meters) {
  if (meters >= 1000) {
    const km = meters / 1000;
    return `${Number.isInteger(km) ? km : km.toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

/**
 * source と layer を組む。面と縁の 2 枚。
 *
 * **縁だけにしない。**面が無いと「内側なのか外側なのか」が一目で読めない。
 * **面だけにもしない。**薄い面は、縮小すると境界が消える。
 *
 * @param {{
 *   id: string,
 *   center: [number, number],
 *   radius: number,
 *   color?: string,
 *   steps?: number,
 *   fillOpacity?: number,
 * }} input
 */
export function buildCircleSpec(input) {
  if (!input.id) throw new Error("id が要ります（source 名が衝突すると後勝ちで消えます）");

  const color = input.color ?? "#8fa9b8";
  const fillOpacity =
    typeof input.fillOpacity === "number" && Number.isFinite(input.fillOpacity)
      ? Math.min(1, Math.max(0, input.fillOpacity))
      : CIRCLE_DEFAULTS.fillOpacity;

  return {
    sourceId: input.id,
    source: {
      type: "geojson",
      data: circleFeature(input.center, input.radius, input.steps ?? CIRCLE_DEFAULTS.steps),
    },
    layers: [
      {
        id: `${input.id}-fill`,
        type: "fill",
        source: input.id,
        paint: { "fill-color": color, "fill-opacity": fillOpacity },
      },
      {
        id: `${input.id}-line`,
        type: "line",
        source: input.id,
        paint: { "line-color": color, "line-width": CIRCLE_DEFAULTS.lineWidth },
      },
    ],
  };
}
