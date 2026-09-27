/**
 * `<mmj-raster>` — 地図に重ねる画像タイル。
 *
 * ```html
 * <mmj-map tiles="./tiles/demo.pmtiles" style-url="./styles/modern-dark.json">
 *   <mmj-raster src="https://example.com/hazard/{z}/{x}/{y}.png"
 *               attribution="出典：○○市 洪水浸水想定区域図（2026 年 9 月時点）"
 *               opacity="0.6"></mmj-raster>
 * </mmj-map>
 * ```
 *
 * **1 つで広く効く。**雨雲レーダー・ハザードマップ・地盤・震度・空中写真は、
 * どれもラスタタイルで配られている。
 *
 * **データは MMJ が持たない**（D-001）。出どころを指すのも、出典を名乗るのも導入者。
 * **MMJ は判断しない。**重ねた色が何を意味するかも、いつ時点のものかも解釈しない。
 *
 * 組み立ての判断は `raster.js` にある。ここは地図に付けるだけ。
 */
import { buildRasterSpec, firstSymbolLayerId } from "./raster.js";

let serial = 0;

/**
 * 数として読めなければ undefined（**読めない値で既定を上書きしない**）
 * @param {string | null} value
 * @returns {number | undefined}
 */
function readNumber(value) {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export class MmjRaster extends HTMLElement {
  /** @type {any} */
  owner = null;

  /** @type {string | null} */
  sourceId = null;

  connectedCallback() {
    const parent = this.closest("mmj-map");
    if (!parent) return void console.error("[mmj-raster] <mmj-map> の中に置いてください");
    this.owner = parent;

    const map = /** @type {any} */ (parent).map;
    if (map) return void this.#attach(map);
    // 親がまだ出来ていなければ待つ。**待たずに付けると、読み込み順で付いたり付かなかったりする**
    parent.addEventListener("mmj-ready", (/** @type {any} */ event) => this.#attach(event.detail.map), { once: true });
  }

  disconnectedCallback() {
    const map = /** @type {any} */ (this.owner)?.map;
    if (map === undefined || map === null || this.sourceId === null) return;
    // **付けた順の逆で外す。**layer を残したまま source を消すと地図が落ちる
    try {
      if (map.getLayer(`${this.sourceId}-raster`)) map.removeLayer(`${this.sourceId}-raster`);
      if (map.getSource(this.sourceId)) map.removeSource(this.sourceId);
    } catch (error) {
      console.error("[mmj-raster] 外せませんでした", error);
    }
    this.sourceId = null;
  }

  /**
   * **スタイルが出来るまで待つ。**`mmj-ready` はスタイル読み込みの前に出るので、
   * そのまま `addSource` すると `Style is not done loading.` で落ちる
   * （実測・2026-09-27。`mmj-poi` / `mmj-cluster` が先に同じ穴を踏んでいる）。
   * @param {any} map
   */
  #attach(map) {
    this.style.display = "none"; // 地図の上に出るもの。要素そのものは場所を取らない
    if (map.isStyleLoaded()) this.#add(map);
    else map.once("load", () => this.#add(map));
  }

  /** @param {any} map */
  #add(map) {
    let spec;
    try {
      spec = buildRasterSpec({
        id: this.getAttribute("layer-id") || `mmj-raster-${++serial}`,
        src: this.getAttribute("src") ?? "",
        opacity: readNumber(this.getAttribute("opacity")),
        tileSize: readNumber(this.getAttribute("tile-size")),
        minZoom: readNumber(this.getAttribute("min-zoom")),
        maxZoom: readNumber(this.getAttribute("max-zoom")),
        // **出典は地図の中に出す。**持ち出された先では配布元の頁は付いて来ない
        attribution: this.getAttribute("attribution") ?? undefined,
      });
    } catch (error) {
      // 握り潰さない（§8）。**地図は殺さない**——重ねるものが出ないだけにする
      return void console.error("[mmj-raster]", /** @type {Error} */ (error).message);
    }

    try {
      map.addSource(spec.sourceId, spec.source);
      // **ラベルの下へ入れる。**上へ置くと地名も駅名も読めなくなる。
      // `before` で明示もできる（既定より前へ出したいとき）
      const before = this.getAttribute("before") ?? firstSymbolLayerId(map.getStyle());
      map.addLayer(spec.layer, before && map.getLayer(before) ? before : undefined);
      this.sourceId = spec.sourceId;
    } catch (error) {
      console.error("[mmj-raster] 重ねられませんでした", error);
    }
  }
}
