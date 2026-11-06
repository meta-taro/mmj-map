/**
 * 点をまとめて描くための source / layer を組み立てる。**ここは純粋関数。**
 *
 * まとめる計算そのものは **MapLibre の GeoJSON source が持っている**（supercluster）。
 * この部品が足しているのは「3 枚のレイヤを排他の filter で置く」という定型だけで、
 * **クラスタリングを自前で実装していない**（PRD §3・厚くしない）。
 */
import {
  ballOffset,
  needleImageExpression,
  needleOffset,
  ringClusterProperties,
  ringImageExpression,
} from "./machibari.js";

/**
 * 既定値。**色は提案であって、承認された色ではない**（baseline §11）。
 * `color` は MapLibre の Marker が元から使っている色、`textColor` は
 * `styles/modern-dark.json` に既にある値。**新しい色を足していない。**
 */
export const DEFAULTS = {
  color: "#3FB1CE",
  textColor: "#111418",
  pointColor: "#3FB1CE",
  // スタイルと同じフォント。増やすと glyphs が 404 になり、地図全体が白くなる
  font: "Noto Sans Regular",
  // まち針の輪の中の件数。輪の中は地図の地色で塗るので、**地図の上の字と同じ色**
  // （`poi.js` の `textColor` と同じ値。新しい色を足していない）
  labelColor: "#D8DCE1",
  radius: 50,
  maxZoom: 14,
};

/**
 * 0 以上の数として読む。読めなければ既定値。
 * **NaN や負の値を MapLibre へ渡さない**（渡すと source が黙って壊れる）。
 * @param {string | null | undefined} value
 * @param {number} fallback
 * @returns {number}
 */
export function parseCount(value, fallback) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!/^\d+\.?\d*$/.test(trimmed)) return fallback;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** まち針を押せる範囲の半径（px）。`poi.js` の `HIT_RADIUS` と同じ（直径 36px） */
const HIT_RADIUS = 18;

/**
 * ピンの形。**既定は丸**（いままでの見た目を変えない）。
 * `machibari` は、引くと種別の割合の輪、寄るとまち針の斜め刺し（`machibari.js`）。
 * @param {string | null | undefined} value
 * @returns {"circle" | "machibari"}
 */
export function parsePinStyle(value) {
  return typeof value === "string" && value.trim() === "machibari" ? "machibari" : "circle";
}

/**
 * 選んだ点を描き分ける filter。**`icon-image` は feature-state を読めない**ので、
 * 選んだ点は filter で別の層へ移す（同じ点を 2 本描かない）。
 * @param {string} idKey
 * @param {string | null} id `null` なら誰も選ばれていない
 * @returns {{ points: any[], picked: any[] }}
 */
export function pickFilters(idKey, id) {
  const single = ["!", ["has", "point_count"]];
  // **誰も選ばれていないときは、常に偽の式。**`["==", 1, 0]` は古い書式の filter と
  // 読まれて検証で落ち、**層ごと足されなかった**（実物で見た・2026-11-06）
  if (id === null) return { points: single, picked: ["boolean", false] };
  const same = ["==", ["to-string", ["get", idKey]], id];
  return { points: ["all", single, ["!", same]], picked: ["all", single, same] };
}

/**
 * @param {{
 *   id: string,
 *   src: string,
 *   radius?: number,
 *   maxZoom?: number,
 *   color?: string,
 *   textColor?: string,
 *   pointColor?: string,
 *   pin?: "circle" | "machibari",
 *   colorKey?: string | null,
 *   colors?: readonly { name: string, color: string }[],
 *   idKey?: string | null,
 *   labelColor?: string,
 * }} input
 * @returns {{ sourceId: string, source: any, layers: any[], pin: "circle" | "machibari",
 *   ids: { clusters: string, hit: string | null, points: string, picked: string | null },
 *   colors: { name: string, color: string }[], fallbackColor: string, casing: string,
 *   idKey: string | null }}
 */
export function buildClusterSpec(input) {
  if (!input.id) throw new Error("id が要ります（source 名が衝突すると後勝ちで消えます）");
  if (!input.src) throw new Error("src が要ります（点の GeoJSON の URL）");

  const color = input.color ?? DEFAULTS.color;
  const textColor = input.textColor ?? DEFAULTS.textColor;
  const pointColor = input.pointColor ?? DEFAULTS.pointColor;
  const sourceId = input.id;
  const source = {
    type: "geojson",
    data: input.src,
    cluster: true,
    clusterRadius: input.radius ?? DEFAULTS.radius,
    clusterMaxZoom: input.maxZoom ?? DEFAULTS.maxZoom,
  };

  if (input.pin === "machibari") return buildMachibariSpec(input, { sourceId, source, pointColor, textColor });

  return {
    sourceId,
    pin: "circle",
    ids: { clusters: `${sourceId}-clusters`, hit: null, points: `${sourceId}-points`, picked: null },
    colors: [],
    fallbackColor: pointColor,
    casing: textColor,
    idKey: null,
    source,
    layers: [
      {
        id: `${sourceId}-clusters`,
        type: "circle",
        source: sourceId,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": color,
          // **件数は大きさで表す。**色を段階で変えると配色を決めたことになる（§11）
          "circle-radius": ["step", ["get", "point_count"], 14, 50, 18, 200, 24],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": textColor,
        },
      },
      {
        id: `${sourceId}-count`,
        type: "symbol",
        source: sourceId,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": [DEFAULTS.font],
          "text-size": 12,
          // 数が出ない丸は、ただの模様になる。**衝突しても必ず出す**
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: { "text-color": textColor },
      },
      {
        id: `${sourceId}-points`,
        type: "circle",
        source: sourceId,
        // まとまりに入らなかった点だけ。**排他にしないと二重に出る**
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": pointColor,
          "circle-radius": 6,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": textColor,
        },
      },
    ],
  };
}

/**
 * まち針の組み。層は 4 枚——**輪と件数（1 枚に両方）・押せる範囲・まち針・選んだまち針**。
 *
 * **重なる順は画面の縦位置**（`symbol-z-order` の既定 `auto` は、重なりを許す記号を
 * 画面の下にあるものほど手前に描く）。試作の「南ほど手前」と同じになる。
 *
 * @param {Parameters<typeof buildClusterSpec>[0]} input
 * @param {{ sourceId: string, source: any, pointColor: string, textColor: string }} base
 * @returns {ReturnType<typeof buildClusterSpec>}
 */
function buildMachibariSpec(input, base) {
  const { sourceId, pointColor, textColor } = base;
  const colorKey = typeof input.colorKey === "string" && input.colorKey !== "" ? input.colorKey : null;
  const colors = colorKey === null || !Array.isArray(input.colors) ? [] : [...input.colors];
  const idKey = typeof input.idKey === "string" && input.idKey !== "" ? input.idKey : null;
  const labelColor = input.labelColor ?? DEFAULTS.labelColor;
  const ids = {
    clusters: `${sourceId}-clusters`,
    hit: `${sourceId}-hit`,
    points: `${sourceId}-points`,
    picked: idKey === null ? null : `${sourceId}-picked`,
  };
  const filters = pickFilters(idKey ?? "", null);
  /** @param {boolean} picked */
  const needleLayout = (picked) => ({
    "icon-image": needleImageExpression({ sourceId, picked, colorKey, colors, fallbackColor: pointColor }),
    // **針先が座標を指す。**左上を基準に置き、針先のぶんだけ戻す
    "icon-anchor": "top-left",
    "icon-offset": needleOffset(picked),
    // **重なっても消さない。**まち針は重なっても先が見えるのが取り柄
    "icon-allow-overlap": true,
    "icon-ignore-placement": true,
  });

  return {
    sourceId,
    pin: "machibari",
    ids,
    colors,
    fallbackColor: pointColor,
    casing: textColor,
    idKey,
    source: {
      ...base.source,
      // **種別ごとの件数は MapLibre が数える**（D-011）。対応が無ければ数えない
      ...(colors.length === 0 ? {} : { clusterProperties: ringClusterProperties(String(colorKey), colors) }),
    },
    layers: [
      {
        id: ids.clusters,
        type: "symbol",
        source: sourceId,
        filter: ["has", "point_count"],
        layout: {
          "icon-image": ringImageExpression(sourceId, colors.length),
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": [DEFAULTS.font],
          "text-size": 11,
          // 数が出ない輪は、ただの模様になる。**衝突しても必ず出す**
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: { "text-color": labelColor },
      },
      // **押す目標は玉、見えない丸で広げる。**玉は直径 10px しかなく、指で狙えない
      // （目安 36px 以上・`poi.js` の当たり判定と同じ半径）。**いちばん下**に置く
      {
        id: ids.hit,
        type: "circle",
        source: sourceId,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": HIT_RADIUS,
          "circle-color": pointColor,
          "circle-opacity": 0,
          "circle-translate": ballOffset(false),
        },
      },
      { id: ids.points, type: "symbol", source: sourceId, filter: filters.points, layout: needleLayout(false) },
      // **選んだ点は 1 枚上の層。**同じ層の中では前後を選べないので、隣の針の下に潜る
      ...(ids.picked === null
        ? []
        : [{ id: ids.picked, type: "symbol", source: sourceId, filter: filters.picked, layout: needleLayout(true) }]),
    ],
  };
}
