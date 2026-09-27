/**
 * `<mmj-circle>` — 「ここから半径◯ m」を描く。
 *
 * ```html
 * <mmj-map tiles="./tiles/maihama.pmtiles" style-url="./styles/modern-dark.json" locate>
 *   <mmj-circle center="139.8850,35.6305" radius="800"></mmj-circle>
 * </mmj-map>
 * ```
 *
 * **外部サービスもデータも要らない。**幾何だけで出る。
 * 経路探索ではないので `PRD.md` §2 にも触れない。
 *
 * **「何分で行けるか」は出さない。**それは経路探索で、
 * **災害時はとくに危ない**（崩れた道・浸水した道を「行ける」と言う）。
 * ここが出すのは**直線距離**だけ。
 *
 * 判断は `circle.js` にある。ここは地図に付けるだけ。
 */
import { parseLngLat } from "./attrs.js";
import { buildCircleSpec } from "./circle.js";

let serial = 0;

/**
 * 数として読めなければ undefined
 * @param {string | null} value
 * @returns {number | undefined}
 */
function readNumber(value) {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export class MmjCircle extends HTMLElement {
  /** @type {any} */
  owner = null;

  /** @type {string | null} */
  sourceId = null;

  connectedCallback() {
    const parent = this.closest("mmj-map");
    if (!parent) return void console.error("[mmj-circle] <mmj-map> の中に置いてください");
    this.owner = parent;

    const map = /** @type {any} */ (parent).map;
    if (map) return void this.#attach(map);
    parent.addEventListener("mmj-ready", (/** @type {any} */ event) => this.#attach(event.detail.map), { once: true });
  }

  disconnectedCallback() {
    const map = /** @type {any} */ (this.owner)?.map;
    if (map === undefined || map === null || this.sourceId === null) return;
    // **付けた順の逆で外す。**layer を残したまま source を消すと地図が落ちる
    try {
      for (const suffix of ["-line", "-fill"]) {
        const id = `${this.sourceId}${suffix}`;
        if (map.getLayer(id)) map.removeLayer(id);
      }
      if (map.getSource(this.sourceId)) map.removeSource(this.sourceId);
    } catch (error) {
      console.error("[mmj-circle] 外せませんでした", error);
    }
    this.sourceId = null;
  }

  /**
   * **スタイルが出来るまで待つ**（`mmj-ready` は読み込み前に出る）。
   * @param {any} map
   */
  #attach(map) {
    this.style.display = "none";
    if (map.isStyleLoaded()) this.#add(map);
    else map.once("load", () => this.#add(map));
  }

  /** @param {any} map */
  #add(map) {
    const center = parseLngLat(this.getAttribute("center"));
    if (!center) {
      // **[0,0] へ置かない。**海の上に出ると、間違いだと気づきにくい
      return void console.error(`[mmj-circle] center を読めません: ${this.getAttribute("center")}`);
    }

    let spec;
    try {
      spec = buildCircleSpec({
        id: this.getAttribute("layer-id") || `mmj-circle-${++serial}`,
        center,
        radius: readNumber(this.getAttribute("radius")) ?? Number.NaN,
        // 指定が無ければサイトのテーマカラー。**ここで色を作らない**
        color: this.getAttribute("color") ?? /** @type {any} */ (this.owner)?.accent ?? undefined,
        fillOpacity: readNumber(this.getAttribute("fill-opacity")),
        steps: readNumber(this.getAttribute("steps")),
      });
    } catch (error) {
      // 握り潰さない（§8）。**地図は殺さない**
      return void console.error("[mmj-circle]", /** @type {Error} */ (error).message);
    }

    try {
      map.addSource(spec.sourceId, spec.source);
      // **ラベルの下へ入れる。**面が上に乗ると、中の地名が読めなくなる
      const before = this.getAttribute("before");
      for (const layer of spec.layers) {
        map.addLayer(layer, before && map.getLayer(before) ? before : undefined);
      }
      this.sourceId = spec.sourceId;
    } catch (error) {
      console.error("[mmj-circle] 描けませんでした", error);
    }
  }
}
