/**
 * まち針を、**MMJ の要素を使わない頁**（maplibre-gl を直に使うサイト）へ貸し出す口。
 *
 * ## なぜ要るか
 *
 * 形そのものは `machibari.js` にある（0.8.0 から `<mmj-cluster pin="machibari">` で使える）。
 * ただ、maplibre-gl を直に使っているサイトは要素を置けないので、
 * **同じ形を各リポで手描きしていた**（2026-11-16・導入先から）。
 * ここで「画像を 1 枚作る」と「針先を座標へ合わせる配置」を外へ出し、手描きをやめてもらう。
 *
 * `@mmj-map/elements/machibari` から import する。地図は持たず、`map.addImage` へ渡す画像を返すだけ。
 */
import { drawNeedle, MACHIBARI, needleGeometry, needleOffset } from "./machibari.js";

export { MACHIBARI, drawNeedle, needleGeometry, needleOffset };

/** 輪郭の既定。**地図の地色に近い白**（玉が背景から浮いて見える） */
const DEFAULT_CASING = "#ffffff";

/**
 * 絵を 1 枚、倍率つきで描いて `ImageData` にする。**`<mmj-cluster>` も同じものを使う。**
 *
 * @param {number} width CSS px
 * @param {number} height CSS px
 * @param {number} ratio 画面の倍率
 * @param {(context: any) => void} draw
 * @param {(width: number, height: number) => any} [createCanvas] 試験や Node で差し替える
 * @returns {any | null} `ImageData`。描けないときは null
 */
export function paintImage(width, height, ratio, draw, createCanvas = defaultCanvas) {
  const canvas = createCanvas(Math.round(width * ratio), Math.round(height * ratio));
  const context = canvas?.getContext("2d") ?? null;
  if (context === null) return null;
  context.scale(ratio, ratio);
  draw(context);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * まち針 1 本の画像。`map.addImage(id, image, { pixelRatio })` にそのまま渡せる形で返す。
 *
 * ```js
 * const { image, pixelRatio } = needleImage({ color: "#e4572e" });
 * map.addImage("pin-rest", image, { pixelRatio });
 * ```
 *
 * @param {{ color: string, casing?: string, picked?: boolean, pixelRatio?: number,
 *   createCanvas?: (width: number, height: number) => any }} input
 * @returns {{ image: any, pixelRatio: number } | null}
 */
export function needleImage(input) {
  const picked = input.picked === true;
  const pixelRatio = validRatio(input.pixelRatio) ?? screenRatio();
  const { width, height } = needleGeometry(picked);
  const image = paintImage(
    width,
    height,
    pixelRatio,
    (context) => drawNeedle(context, { color: input.color, casing: input.casing ?? DEFAULT_CASING, picked }),
    input.createCanvas,
  );
  return image === null ? null : { image, pixelRatio };
}

/**
 * symbol 層の `layout` に混ぜる配置。**針先がその点の座標を指す。**
 *
 * maplibre の既定（`icon-anchor: center`）のままだと、絵の真ん中が座標に乗り、
 * **針先は別の場所を指す**。必ずこれを混ぜる。
 *
 * @param {boolean} [picked]
 * @returns {{ "icon-anchor": "top-left", "icon-offset": [number, number],
 *   "icon-allow-overlap": true, "icon-ignore-placement": true }}
 */
export function needleLayout(picked = false) {
  return {
    "icon-anchor": "top-left",
    "icon-offset": needleOffset(picked),
    // **重なっても消さない。**まち針は重なっても先が見えるのが取り柄
    "icon-allow-overlap": true,
    "icon-ignore-placement": true,
  };
}

/** @param {unknown} value */
function validRatio(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function screenRatio() {
  return validRatio(globalThis.devicePixelRatio) ?? 1;
}

/**
 * @param {number} width
 * @param {number} height
 */
function defaultCanvas(width, height) {
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(width, height);
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
