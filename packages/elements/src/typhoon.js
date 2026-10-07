/**
 * 台風の描き方を決める。純粋関数（GeoJSON と layer の形を返すだけ）。
 *
 * ## 何を描くか
 *
 * 報道で見る形に合わせてある。並びには意味があるので崩さない。
 *
 * | 要素 | 見た目 | 何を言っているか |
 * | --- | --- | --- |
 * | 強風域 | 黄色の面 | 風速 15 m/s 以上 |
 * | 暴風域 | 赤の面（強風域の内側） | 風速 25 m/s 以上 |
 * | 予報円 | 白の破線 | 中心が入ると見込まれる範囲。台風の大きさではない |
 * | 進路線 | 実線（実績）／破線（予報） | 中心が通った道と、これから通る道 |
 * | 中心 | 記号 | いまの中心 |
 *
 * ## 色は作らない
 *
 * 黄色と赤は外界が決めている（気象庁の配色）。独自の色に置き換えると、
 * 赤が弱い側に見えるような誤読を生む。写すもので、作るものではない。
 *
 * ## 予報円を「台風の大きさ」と混同させない
 *
 * 予報円は中心の位置の不確かさで、進むほど大きくなる。暴風域とは別物。
 * 破線にし、塗らないのはそのため。塗ると「この範囲が暴風」と読まれる。
 */

import { circleFeature } from "./circle.js";

/** 報道で使われている配色。写したもの（作っていない） */
export const TYPHOON_COLORS = {
  /** 強風域（15 m/s 以上） */
  gale: "#f2d64b",
  /** 暴風域（25 m/s 以上） */
  storm: "#e2483d",
  /** 予報円・進路線 */
  track: "#ffffff",
};

export const TYPHOON_DEFAULTS = {
  galeOpacity: 0.22,
  stormOpacity: 0.38,
  /** 円周の分割数。粗いと多角形に見える */
  steps: 96,
};

/**
 * 1 時刻ぶんの形。
 *
 * @typedef {object} TyphoonFrame
 * @property {string} label 時刻の見出し（置く側が書く）
 * @property {[number, number]} center `[経度, 緯度]`
 * @property {number} [stormKm] 暴風域の半径（km）
 * @property {number} [galeKm] 強風域の半径（km）
 * @property {number} [forecastKm] 予報円の半径（km）
 * @property {number} [pressure] 中心気圧（hPa）
 * @property {boolean} [forecast] これから先の予報か（進路線を破線にする）
 */

/**
 * 読めない時刻を落とす。途中で欠けていても、地図は殺さない。
 * @param {any} data
 * @returns {TyphoonFrame[]}
 */
export function parseTrack(data) {
  const frames = Array.isArray(data) ? data : Array.isArray(data?.frames) ? data.frames : [];
  return frames.filter((/** @type {any} */ frame) => {
    const center = frame?.center;
    return Array.isArray(center) && Number.isFinite(center[0]) && Number.isFinite(center[1]);
  });
}

/**
 * km を m へ。読めない値は null（0 の円を描かない）
 * @param {unknown} km
 */
const metres = (km) => (typeof km === "number" && Number.isFinite(km) && km > 0 ? km * 1000 : null);

/**
 * いまの時刻の面（強風域・暴風域・予報円）。
 *
 * 外側から順に入れる。あとに入れたものが上に乗るので、
 * 強風域 → 暴風域 の順でないと暴風域が隠れる。
 *
 * @param {readonly TyphoonFrame[]} track
 * @param {number} index
 */
export function areaFeatures(track, index) {
  const frame = track[index];
  if (frame === undefined) return { type: "FeatureCollection", features: [] };

  /** @type {any[]} */
  const features = [];
  /**
   * @param {number | undefined} km
   * @param {string} kind
   */
  const add = (km, kind) => {
    const radius = metres(km);
    if (radius === null) return;
    const feature = circleFeature(frame.center, radius, TYPHOON_DEFAULTS.steps);
    feature.properties = { ...feature.properties, kind };
    features.push(feature);
  };

  add(frame.galeKm, "gale");
  add(frame.stormKm, "storm");
  add(frame.forecastKm, "forecast");

  return { type: "FeatureCollection", features };
}

/**
 * 進路線。通ってきた道は実線、これからは破線にするため 2 本に分ける。
 *
 * いまの時刻までを実績、それより先を予報とする。
 * `forecast: true` を持つ時刻があれば、そこから先は常に予報として扱う。
 *
 * @param {readonly TyphoonFrame[]} track
 * @param {number} index
 */
export function trackFeatures(track, index) {
  if (track.length === 0) return { type: "FeatureCollection", features: [] };

  const firstForecast = track.findIndex((frame) => frame.forecast === true);
  const edge = firstForecast === -1 ? index : Math.min(index, firstForecast);
  const past = track.slice(0, Math.max(1, edge + 1)).map((frame) => frame.center);
  const future = track.slice(Math.max(0, edge)).map((frame) => frame.center);

  /** @type {any[]} */
  const features = [];
  if (past.length > 1) {
    features.push({
      type: "Feature",
      properties: { kind: "past" },
      geometry: { type: "LineString", coordinates: past },
    });
  }
  if (future.length > 1) {
    features.push({
      type: "Feature",
      properties: { kind: "future" },
      geometry: { type: "LineString", coordinates: future },
    });
  }
  return { type: "FeatureCollection", features };
}

/**
 * いまの中心（記号と、気圧などの見出し）。
 *
 * @param {readonly TyphoonFrame[]} track
 * @param {number} index
 */
export function centerFeatures(track, index) {
  const frame = track[index];
  if (frame === undefined) return { type: "FeatureCollection", features: [] };

  const parts = [];
  if (typeof frame.label === "string" && frame.label !== "") parts.push(frame.label);
  if (typeof frame.pressure === "number" && Number.isFinite(frame.pressure)) parts.push(`${frame.pressure} hPa`);

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { label: parts.join(" · ") },
        geometry: { type: "Point", coordinates: frame.center },
      },
    ],
  };
}

/**
 * source と layer を組む。
 *
 * source は 3 本だけ。時刻が変わっても作り直さず `setData` で差し替える
 * （図形は小さいので、タイルと違って取りに行き直しが起きない）。
 *
 * @param {{id: string, galeOpacity?: number, stormOpacity?: number}} input
 */
export function buildTyphoonSpec(input) {
  if (!input.id) throw new Error("id が要ります（source 名が衝突すると後勝ちで消えます）");

  const galeOpacity = input.galeOpacity ?? TYPHOON_DEFAULTS.galeOpacity;
  const stormOpacity = input.stormOpacity ?? TYPHOON_DEFAULTS.stormOpacity;
  const empty = { type: "FeatureCollection", features: [] };

  return {
    sources: [
      { id: `${input.id}-area`, source: { type: "geojson", data: empty } },
      { id: `${input.id}-track`, source: { type: "geojson", data: empty } },
      { id: `${input.id}-center`, source: { type: "geojson", data: empty } },
    ],
    layers: [
      {
        id: `${input.id}-gale`,
        type: "fill",
        source: `${input.id}-area`,
        filter: ["==", ["get", "kind"], "gale"],
        paint: { "fill-color": TYPHOON_COLORS.gale, "fill-opacity": galeOpacity },
      },
      {
        id: `${input.id}-storm`,
        type: "fill",
        source: `${input.id}-area`,
        filter: ["==", ["get", "kind"], "storm"],
        paint: { "fill-color": TYPHOON_COLORS.storm, "fill-opacity": stormOpacity },
      },
      // 予報円は塗らない。塗ると「この範囲が暴風」と読まれる
      {
        id: `${input.id}-forecast`,
        type: "line",
        source: `${input.id}-area`,
        filter: ["==", ["get", "kind"], "forecast"],
        paint: {
          "line-color": TYPHOON_COLORS.track,
          "line-width": 1.6,
          "line-dasharray": [3, 2],
          "line-opacity": 0.85,
        },
      },
      {
        id: `${input.id}-track-past`,
        type: "line",
        source: `${input.id}-track`,
        filter: ["==", ["get", "kind"], "past"],
        paint: { "line-color": TYPHOON_COLORS.track, "line-width": 2, "line-opacity": 0.9 },
      },
      {
        id: `${input.id}-track-future`,
        type: "line",
        source: `${input.id}-track`,
        filter: ["==", ["get", "kind"], "future"],
        paint: {
          "line-color": TYPHOON_COLORS.track,
          "line-width": 2,
          "line-dasharray": [2, 2],
          "line-opacity": 0.65,
        },
      },
      {
        id: `${input.id}-center`,
        type: "circle",
        source: `${input.id}-center`,
        paint: {
          "circle-radius": 5,
          "circle-color": TYPHOON_COLORS.storm,
          "circle-stroke-color": TYPHOON_COLORS.track,
          "circle-stroke-width": 2,
        },
      },
    ],
  };
}
