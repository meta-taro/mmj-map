/**
 * 重ねるラスタ（画像タイル）の組み立て。**ここは純粋関数。**DOM も地図も触らない。
 *
 * **1 つで広く効く。**雨雲レーダー・ハザードマップ・地盤・震度・空中写真は、
 * どれもラスタタイルで配られている。**面を塗る部品を作るより先に、これが要る。**
 *
 * **データは MMJ が持たない**（D-001）。導入者が出どころを指し、出典を名乗る。
 * `<mmj-poi>` と同じ線。
 *
 * ## 気をつけること
 *
 * **ラベルの上に重ねない。**重ねた瞬間、地名も駅名も読めなくなる。
 * 既定では**いちばん手前のラベルの下**へ入れる（`firstSymbolLayerId`）。
 *
 * **不透明のまま重ねない。**下の地図が見えないと、**その色がどこの話なのか**が読めない。
 * 浸水想定でも雨雲でも、**現在地と道が透けて見えて初めて使える**。
 */

/** 重ねるものの既定。**下の地図が透けないと、どこの話か読めない** */
export const RASTER_DEFAULTS = {
  opacity: 0.7,
  tileSize: 256,
};

/**
 * タイルの URL の形として通してよいか。
 *
 * **`{z}` `{x}` `{y}` が揃っていること。**揃っていないと MapLibre は
 * **同じ 1 枚を延々と貼り続ける**——地図は出るので、見ても間違いだと分からない。
 *
 * スキームは http / https と相対パスだけ（`popup.js` の画像と同じ理由）。
 * @param {string} value
 */
export function isTileTemplate(value) {
  const url = typeof value === "string" ? value.trim() : "";
  if (url === "") return false;

  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url);
  if (scheme !== null) {
    const name = scheme[1]?.toLowerCase();
    if (name !== "http" && name !== "https") return false;
  }
  return url.includes("{z}") && url.includes("{x}") && url.includes("{y}");
}

/**
 * いちばん手前のラベル（symbol レイヤ）の id。無ければ null。
 *
 * **重ねたものをこの下へ入れる。**上へ置くと地名が消える。
 * @param {any} style 読み込み済みのスタイル（`map.getStyle()`）
 * @returns {string | null}
 */
export function firstSymbolLayerId(style) {
  const layers = Array.isArray(style?.layers) ? style.layers : [];
  const found = layers.find((/** @type {any} */ layer) => layer?.type === "symbol");
  return typeof found?.id === "string" ? found.id : null;
}

/**
 * source と layer を組む。
 *
 * @param {{
 *   id: string,
 *   src: string,
 *   opacity?: number,
 *   tileSize?: number,
 *   minZoom?: number,
 *   maxZoom?: number,
 *   attribution?: string,
 * }} input
 * @returns {{ sourceId: string, source: any, layer: any }}
 */
export function buildRasterSpec(input) {
  if (!input.id) throw new Error("id が要ります（source 名が衝突すると後勝ちで消えます）");
  if (!isTileTemplate(input.src)) {
    // **黙って 1 枚を貼り続けない。**地図は出るので、間違いに気づけない
    throw new Error(`src は {z}/{x}/{y} を含む http(s) か相対の URL で指定してください: ${input.src}`);
  }

  const opacity =
    typeof input.opacity === "number" && Number.isFinite(input.opacity)
      ? Math.min(1, Math.max(0, input.opacity))
      : RASTER_DEFAULTS.opacity;

  /** @type {any} */
  const source = {
    type: "raster",
    tiles: [input.src],
    tileSize: input.tileSize ?? RASTER_DEFAULTS.tileSize,
  };
  // **出典は地図の中に出す。**持ち出された先では、配布元の頁は付いて来ない。
  // 渡されなければ付けない（空の出典欄は、出どころを騙ることになる）
  const attribution = typeof input.attribution === "string" ? input.attribution.trim() : "";
  if (attribution !== "") source.attribution = attribution;

  /** @type {any} */
  const layer = {
    id: `${input.id}-raster`,
    type: "raster",
    source: input.id,
    paint: { "raster-opacity": opacity },
  };
  if (typeof input.minZoom === "number") layer.minzoom = input.minZoom;
  if (typeof input.maxZoom === "number") layer.maxzoom = input.maxZoom;

  return { sourceId: input.id, source, layer };
}
