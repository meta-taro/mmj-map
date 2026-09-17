/**
 * 利用者が持ち込む POI の source / layer を組み立てる。**ここは純粋関数。**
 *
 * ベース地図の `pois` とは別の層。**ベースには触らない**（D-001・データを持たない）。
 * まとめないのがこの部品の役目で、まとめたいときは `<mmj-cluster>`（D-011）。
 */

/**
 * 既定値。**色は提案であって、承認された色ではない**（baseline §11）。
 * `color` は MapLibre の Marker が元から使っている色、`textColor` と `haloColor` は
 * `styles/modern-dark.json` に既にある値。**新しい色を足していない。**
 */
export const POI_DEFAULTS = {
  color: "#3FB1CE",
  textColor: "#D8DCE1",
  haloColor: "#111418",
  // スタイルと同じフォント。増やすと glyphs が 404 になり、地図全体が白くなる
  font: "Noto Sans Regular",
  labelKey: "name",
  minZoom: 13,
};

/**
 * @param {{
 *   id: string,
 *   src: string,
 *   labelKey?: string,
 *   minZoom?: number,
 *   color?: string,
 *   textColor?: string,
 * }} input
 * @returns {{ sourceId: string, source: any, layers: any[] }}
 */
export function buildPoiSpec(input) {
  if (!input.id) throw new Error("id が要ります（source 名が衝突すると後勝ちで消えます）");
  if (!input.src) throw new Error("src が要ります（点の GeoJSON の URL）");

  const sourceId = input.id;
  const color = input.color ?? POI_DEFAULTS.color;
  const textColor = input.textColor ?? POI_DEFAULTS.textColor;
  // **件数を知っているのは持ち込む側だけ。**3 件と 3000 件で出しはじめは変わる
  const minzoom = input.minZoom ?? POI_DEFAULTS.minZoom;

  return {
    sourceId,
    source: { type: "geojson", data: input.src },
    layers: [
      {
        id: `${sourceId}-dot`,
        type: "circle",
        source: sourceId,
        minzoom,
        paint: {
          "circle-color": color,
          "circle-radius": 5,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": POI_DEFAULTS.haloColor,
        },
      },
      {
        id: `${sourceId}-label`,
        type: "symbol",
        source: sourceId,
        minzoom,
        layout: {
          // 媒体ごとに name / title / shop_name と違う。**MMJ が決め打ちしない**
          "text-field": ["get", input.labelKey ?? POI_DEFAULTS.labelKey],
          "text-font": [POI_DEFAULTS.font],
          "text-size": 12,
          "text-offset": [0, 1.1],
          "text-anchor": "top",
          // 衝突したら消す。**重ねて出しても読めない**（点は残るので場所は分かる）
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": textColor,
          // 地図の上の字は、縁が無いと背景に溶ける
          "text-halo-color": POI_DEFAULTS.haloColor,
          "text-halo-width": 1.2,
        },
      },
    ],
  };
}
