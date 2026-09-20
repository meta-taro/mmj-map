/**
 * 建物を押し出して 3D にする。**ここは純粋関数**（DOM も MapLibre も触らない）。
 *
 * **データを足していない。**いま配っているタイルの `height` / `min_height` を
 * そのまま読む。実測（梅田 z16・pitch 60）では、3D にしても転送量は
 * **17 リクエスト / 735,015 バイトで 2D と 1 バイトも変わらなかった**。
 * 変わるのは描き方だけで、配信も取得も同じ。
 *
 * **色を決めていない。**押し出す面の色は、手書きスタイルの 2D 建物レイヤが
 * 持っている `fill-color` をそのまま読む。ここで新しい色を作ると、
 * 人が決めていない配色が既成事実になる（baseline §11 / D-002）。
 *
 * **陰影は MapLibre の既定のまま。**面ごとの明暗を自分で決めていない。
 * DESIGN.md に 3D の陰影の規定が無いため、**仮置き**として既定に委ねている
 * （D-011 でクラスタの色を仮置きにしたのと同じ扱い）。
 */

const EXTRUSION_ID = "buildings-3d";
const BUILDINGS_ID = "buildings";

/**
 * 2D の建物レイヤから、押し出しレイヤを作る。
 *
 * **高さを持つものだけを押し出す。**持たないものに既定値を入れると、
 * データに無い高さをあるように見せることになる。実測では 3 割ほどが
 * `height` を持たず、そこは 2D のまま平らに残る。
 *
 * @param {Record<string, any>} buildingsLayer 手書きスタイルの 2D 建物レイヤ
 * @returns {Record<string, any>}
 */
export function buildExtrusionLayer(buildingsLayer) {
  const color = buildingsLayer?.paint?.["fill-color"];
  if (color === undefined) {
    throw new Error(`${BUILDINGS_ID} に fill-color がありません（押し出す色を作らないため、ここで止めます）`);
  }

  return {
    id: EXTRUSION_ID,
    type: "fill-extrusion",
    source: buildingsLayer.source,
    "source-layer": buildingsLayer["source-layer"],
    // 2D 側より寄ってから出す。遠景で押し出すと、街が灰色の塊になる
    minzoom: 14,
    filter: ["all", ["==", ["geometry-type"], "Polygon"], ["has", "height"]],
    paint: {
      "fill-extrusion-color": color,
      "fill-extrusion-height": ["get", "height"],
      // 高架下や中空の建物が地面から生えないようにする
      "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0],
      "fill-extrusion-opacity": 0.9,
    },
  };
}

/**
 * スタイルに押し出しレイヤを足した、新しいスタイルを返す。
 *
 * **元のスタイルは書き換えない。**手書きの正本をメモリ上でも壊さないため。
 * 2D の建物レイヤは残す（高さを持たない建物が消えないように）。
 *
 * @param {Record<string, any>} style
 * @returns {Record<string, any>}
 */
export function addExtrusion(style) {
  const layers = style?.layers;
  if (!Array.isArray(layers)) throw new Error("スタイルに layers がありません");

  if (layers.some((layer) => layer?.id === EXTRUSION_ID)) return style;

  const at = layers.findIndex((layer) => layer?.id === BUILDINGS_ID);
  if (at === -1) {
    // 黙って何もしないと、3D にしたつもりの平らな地図が出て、原因が分からなくなる
    throw new Error(`スタイルに ${BUILDINGS_ID} レイヤがありません（押し出す対象が決まりません）`);
  }

  const next = [...layers];
  next.splice(at + 1, 0, buildExtrusionLayer(layers[at]));
  return { ...style, layers: next };
}
