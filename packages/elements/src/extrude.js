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

export const EXTRUSION_ID = "buildings-3d";
const BUILDINGS_ID = "buildings";

/**
 * 押し出しを出しはじめる寄り。**遠景で押し出すと、街が灰色の塊になる。**
 * `buildExtrusionLayer` の `minzoom` と同じ値。
 */
const EXTRUSION_MINZOOM = 14;

/** 押し出しが見える最低限の傾き。**真上から見ると、立てても平らに見える** */
const EXTRUSION_PITCH = 45;

/**
 * 建物を立てるとき、地図をどこまで動かすか。
 *
 * **立てたのに何も起きないように見えるのを防ぐ。**押し出しは
 * **寄って（z14 未満では 1 棟も出ない）・傾けて**初めて見える。
 * どちらも足りない状態で入れると、**押しても画面が変わらず、壊れて見える**。
 *
 * 実測（2026-09-29・`route.html` 携帯幅）: 経路に合わせた寄りは z14.8 で、
 * **傾き 0 のままでも 86 棟は描かれていた**が、真上から見ているので平らにしか見えない。
 * 45 度へ倒すと 114 棟、60 度で 163 棟。**寄りより傾きのほうが効く。**
 *
 * **下げない。**すでに寄っている／傾けている人から、その値を奪わない。
 *
 * @param {{ zoom: number, pitch: number } | null | undefined} camera いまの地図
 * @returns {{ zoom?: number, pitch?: number } | null} 動かす必要が無ければ `null`
 */
export function extrusionCamera(camera) {
  if (!camera) return null;
  /** @type {{ zoom?: number, pitch?: number }} */
  const next = {};
  if (camera.zoom < EXTRUSION_MINZOOM) next.zoom = EXTRUSION_MINZOOM;
  if (camera.pitch < EXTRUSION_PITCH) next.pitch = EXTRUSION_PITCH;
  return Object.keys(next).length === 0 ? null : next;
}

/**
 * **走っている地図へ後から足すとき**、どのレイヤの前へ差し込むか。
 *
 * `addExtrusion` はスタイルを読み込む前に 1 回だけ使うもので、
 * **建物を歩きながら立てたり寝かせたりはできなかった**。
 * 知らない街では「その角のビルの形」が効くが、**ずっと立っていると
 * 上から道をたどるのが読みにくい**ので、切り替えられるほうがいい。
 *
 * 置き場所は `addExtrusion` と同じ「2D の建物のすぐ上」。
 * **後から足された経路や目印より下へ入る**ので、案内の線は建物に隠れない。
 *
 * @param {readonly string[] | null | undefined} layerIds いまの地図のレイヤ id（並び順のまま）
 * @returns {string | undefined} この id の前へ入れる。`undefined` は「いちばん上へ」
 */
export function extrusionBeforeId(layerIds) {
  if (!Array.isArray(layerIds)) return undefined;
  const at = layerIds.indexOf(BUILDINGS_ID);
  if (at === -1) {
    // 黙って何もしないと、立てたつもりの平らな地図が出て、原因が分からなくなる
    throw new Error(`スタイルに ${BUILDINGS_ID} レイヤがありません（押し出す対象が決まりません）`);
  }
  return layerIds[at + 1];
}

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
    minzoom: EXTRUSION_MINZOOM,
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
