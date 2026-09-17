/**
 * 点をまとめて描くための source / layer を組み立てる。**ここは純粋関数。**
 *
 * まとめる計算そのものは **MapLibre の GeoJSON source が持っている**（supercluster）。
 * この部品が足しているのは「3 枚のレイヤを排他の filter で置く」という定型だけで、
 * **クラスタリングを自前で実装していない**（PRD §3・厚くしない）。
 */

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

/**
 * @param {{
 *   id: string,
 *   src: string,
 *   radius?: number,
 *   maxZoom?: number,
 *   color?: string,
 *   textColor?: string,
 *   pointColor?: string,
 * }} input
 * @returns {{ sourceId: string, source: any, layers: any[] }}
 */
export function buildClusterSpec(input) {
  if (!input.id) throw new Error("id が要ります（source 名が衝突すると後勝ちで消えます）");
  if (!input.src) throw new Error("src が要ります（点の GeoJSON の URL）");

  const color = input.color ?? DEFAULTS.color;
  const textColor = input.textColor ?? DEFAULTS.textColor;
  const pointColor = input.pointColor ?? DEFAULTS.pointColor;
  const sourceId = input.id;

  return {
    sourceId,
    source: {
      type: "geojson",
      data: input.src,
      cluster: true,
      clusterRadius: input.radius ?? DEFAULTS.radius,
      clusterMaxZoom: input.maxZoom ?? DEFAULTS.maxZoom,
    },
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
