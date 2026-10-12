/**
 * 駅の印を、置く側の SVG に差し替える。**ここは純粋関数。**
 *
 * ## なぜ 2 段構えなのか
 *
 * 駅の印は**スタイルの中の円**が既定で、これは誰にでも効く——
 * **スタイルを MapLibre へそのまま渡している人**（自前のタイルとグリフで使う人）にも出る。
 *
 * スプライト（`sprite`）では、そこが壊れる。MapLibre は
 * **スプライトの URL に相対を認めない**（`Invalid sprite URL ... must be absolute`）。
 * スタイルに絶対 URL を焼けば、**自前配信なのにこちらのドメインに依存する**ことになる。
 *
 * だから**資産を増やさない円を既定にし、差し替えは実行時に足す**。
 * `<mmj-map station-icon="./icons/station.svg">` を書いた地図だけが記号になり、
 * 書いていない地図とスタイル直読みの人は、今までどおり円のまま。
 *
 * ## 円を消さずに隠す
 *
 * 円の層（`station-dot`）は**残す**。消すと `palette.js` の役割
 * （`station` / `station-fill`）の宛先が無くなり、**色を渡しても当たらない地図**ができる。
 * 描かないだけにして、役割はそのまま効かせる。
 */

/** 差し替えたときに足す層の id。**`palette.js` と `docs` もこの名前** */
export const STATION_ICON_LAYER = "station-icon";

/** 既定の円の層。**ここは消さない**（役割の宛先が消えるため） */
const STATION_DOT_LAYER = "station-dot";

/**
 * 駅の円を隠し、同じ条件で記号を出す層を足す。**元のスタイルは書き換えない。**
 *
 * @param {any} style 読み込んだスタイル
 * @param {string} imageId 地図へ入れた画像の名前
 * @param {number} [size] `icon-size`。既定は 1
 * @returns {any} 新しいスタイル。**円の層が無ければ、何もせず元を返す**
 */
export function withStationIcon(style, imageId, size = 1) {
  const layers = Array.isArray(style?.layers) ? style.layers : null;
  if (layers === null || typeof imageId !== "string" || imageId === "") return style;

  const at = layers.findIndex((/** @type {any} */ l) => l?.id === STATION_DOT_LAYER);
  // **知らないスタイルを壊さない。**自前のスタイルには円が無いこともある
  if (at < 0) return style;

  const dot = layers[at];
  const hidden = {
    ...dot,
    paint: { ...dot.paint, "circle-opacity": 0, "circle-stroke-opacity": 0 },
  };

  const icon = {
    id: STATION_ICON_LAYER,
    type: "symbol",
    source: dot.source,
    "source-layer": dot["source-layer"],
    ...(dot.minzoom === undefined ? {} : { minzoom: dot.minzoom }),
    ...(dot.maxzoom === undefined ? {} : { maxzoom: dot.maxzoom }),
    ...(dot.filter === undefined ? {} : { filter: dot.filter }),
    layout: {
      "icon-image": imageId,
      "icon-size": size,
      // **駅は隠れてはいけない。**ラベルとぶつかっても、印のほうを残す
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  };

  return { ...style, layers: [...layers.slice(0, at), hidden, icon, ...layers.slice(at + 1)] };
}
