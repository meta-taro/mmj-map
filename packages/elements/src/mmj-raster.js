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
import { buildFrameSpecs, buildRasterSpec, firstSymbolLayerId, parseFrames } from "./raster.js";

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

  /** 時刻ごとの layer id（時刻を使わないときは 1 本） @type {string[]} */
  layerIds = [];

  /** 時刻ごとの source id @type {string[]} */
  sourceIds = [];

  /** 時刻の見出し（置く側が書いたもの） @type {string[]} */
  frames = [];

  /** いま何番目か */
  frame = 0;

  /** 送りのタイマー @type {any} */
  timer = null;

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
    this.pause();
    const map = /** @type {any} */ (this.owner)?.map;
    if (map === undefined || map === null || this.sourceId === null) return;
    // **付けた順の逆で外す。**layer を残したまま source を消すと地図が落ちる
    try {
      for (const layerId of this.layerIds) if (map.getLayer(layerId)) map.removeLayer(layerId);
      for (const id of this.sourceIds) if (map.getSource(id)) map.removeSource(id);
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
    const id = this.getAttribute("layer-id") || `mmj-raster-${++serial}`;
    const common = {
      src: this.getAttribute("src") ?? "",
      opacity: readNumber(this.getAttribute("opacity")),
      tileSize: readNumber(this.getAttribute("tile-size")),
      minZoom: readNumber(this.getAttribute("min-zoom")),
      maxZoom: readNumber(this.getAttribute("max-zoom")),
      // **出典は地図の中に出す。**持ち出された先では配布元の頁は付いて来ない
      attribution: this.getAttribute("attribution") ?? undefined,
    };

    const frames = parseFrames(this.getAttribute("frames"));
    let specs;
    try {
      specs = frames.length > 0 ? buildFrameSpecs({ ...common, id, frames }) : [buildRasterSpec({ ...common, id })];
    } catch (error) {
      // 握り潰さない（§8）。**地図は殺さない**——重ねるものが出ないだけにする
      return void console.error("[mmj-raster]", /** @type {Error} */ (error).message);
    }

    try {
      // **ラベルの下へ入れる。**上へ置くと地名も駅名も読めなくなる。
      // `before` で明示もできる（既定より前へ出したいとき）
      const before = this.getAttribute("before") ?? firstSymbolLayerId(map.getStyle());
      const anchor = before && map.getLayer(before) ? before : undefined;
      for (const spec of specs) {
        map.addSource(spec.sourceId, spec.source);
        map.addLayer(spec.layer, anchor);
      }
      this.sourceId = specs[0]?.sourceId ?? null;
      this.layerIds = specs.map((spec) => spec.layer.id);
      this.sourceIds = specs.map((spec) => spec.sourceId);
    } catch (error) {
      return void console.error("[mmj-raster] 重ねられませんでした", error);
    }

    if (frames.length > 0) this.#startPlayer(frames);
  }

  /**
   * 時刻を送る。**見せ方だけを切り替える**（source は置いたまま）。
   * @param {number} index
   */
  showFrame(index) {
    const map = /** @type {any} */ (this.owner)?.map;
    if (!map || this.layerIds.length === 0) return;
    const count = this.layerIds.length;
    const next = ((index % count) + count) % count;
    for (const [at, layerId] of this.layerIds.entries()) {
      if (!map.getLayer(layerId)) continue;
      map.setLayoutProperty(layerId, "visibility", at === next ? "visible" : "none");
    }
    this.frame = next;
    this.dispatchEvent(
      new CustomEvent("mmj-raster-frame", {
        bubbles: true,
        detail: { index: next, label: this.frames[next] ?? "" },
      }),
    );
  }

  /** 送りを止める。**見えない紙芝居を回し続けない** */
  pause() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  /** 送りを始める。既定は 700ms——速すぎると読めず、遅すぎると動いて見えない */
  play() {
    this.pause();
    const interval = readNumber(this.getAttribute("interval")) ?? 700;
    this.timer = setInterval(() => this.showFrame(this.frame + 1), Math.max(120, interval));
  }

  /** @param {readonly string[]} frames */
  #startPlayer(frames) {
    this.frames = [...frames];
    if (this.hasAttribute("autoplay")) this.play();
  }
}
