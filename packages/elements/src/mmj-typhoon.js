/**
 * `<mmj-typhoon>` — 台風を、報道で見る形で描く。
 *
 * ```html
 * <mmj-map tiles="./tiles/demo.pmtiles" style-url="./styles/modern-dark.json">
 *   <mmj-typhoon src="./data/typhoon.json"></mmj-typhoon>
 * </mmj-map>
 * ```
 *
 * 強風域（黄）・暴風域（赤）・予報円（白の破線）・進路線（実績は実線／予報は破線）・中心。
 * 色は気象庁の配色を写したもので、こちらでは作っていない（`typhoon.js` の頭）。
 *
 * **データは MMJ が持たない**（D-001）。進路も半径も、置く側が渡す。
 * **MMJ は予報しない。**渡された点を描くだけで、外挿も補間もしない。
 *
 * 時刻を送るのは頁側の仕事。`showFrame(n)` を呼ぶ
 * （`<mmj-raster frames=…>` と同じ再生に合わせられるようにするため）。
 *
 * 組み立ての判断は `typhoon.js` にある。ここは地図に付けるだけ。
 */
import { areaFeatures, buildTyphoonSpec, centerFeatures, parseTrack, trackFeatures } from "./typhoon.js";

let serial = 0;

/**
 * 数として読めなければ undefined（読めない値で既定を上書きしない）
 * @param {string | null} value
 */
function readNumber(value) {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export class MmjTyphoon extends HTMLElement {
  /** @type {any} */
  owner = null;

  /** 時刻ごとの中心と半径 @type {any[]} */
  frames = [];

  /** いま何番目か */
  frame = 0;

  /** @type {string[]} */
  sourceIds = [];

  /** @type {string[]} */
  layerIds = [];

  connectedCallback() {
    const parent = this.closest("mmj-map");
    if (!parent) return void console.error("[mmj-typhoon] <mmj-map> の中に置いてください");
    this.owner = parent;

    const map = /** @type {any} */ (parent).map;
    if (map) return void this.#attach(map);
    // 親がまだ出来ていなければ待つ
    parent.addEventListener("mmj-ready", (/** @type {any} */ event) => this.#attach(event.detail.map), { once: true });
  }

  disconnectedCallback() {
    const map = /** @type {any} */ (this.owner)?.map;
    if (map === undefined || map === null) return;
    // 付けた順の逆で外す。layer を残したまま source を消すと地図が落ちる
    try {
      for (const id of this.layerIds) if (map.getLayer(id)) map.removeLayer(id);
      for (const id of this.sourceIds) if (map.getSource(id)) map.removeSource(id);
    } catch (error) {
      console.error("[mmj-typhoon] 外せませんでした", error);
    }
    this.layerIds = [];
    this.sourceIds = [];
  }

  /**
   * スタイルが出来るまで待つ（`mmj-poi` / `mmj-raster` と同じ理由）。
   * @param {any} map
   */
  #attach(map) {
    this.style.display = "none"; // 地図の上に出るもの。要素そのものは場所を取らない
    if (map.isStyleLoaded()) void this.#add(map);
    else map.once("load", () => void this.#add(map));
  }

  /** @param {any} map */
  async #add(map) {
    const src = this.getAttribute("src");
    if (!src) return void console.error("[mmj-typhoon] src に進路のデータを渡してください");

    let data;
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } catch (error) {
      // 握り潰さない（§8）。地図は殺さない——台風が出ないだけにする
      return void console.error(`[mmj-typhoon] 進路を読めませんでした: ${src}`, error);
    }

    this.frames = parseTrack(data);
    if (this.frames.length === 0) {
      return void console.error("[mmj-typhoon] 読める時刻が 1 つもありません（center は [経度, 緯度]）");
    }

    const spec = buildTyphoonSpec({
      id: this.getAttribute("layer-id") || `mmj-typhoon-${++serial}`,
      galeOpacity: readNumber(this.getAttribute("gale-opacity")),
      stormOpacity: readNumber(this.getAttribute("storm-opacity")),
    });

    try {
      const before = this.getAttribute("before");
      const anchor = before && map.getLayer(before) ? before : undefined;
      for (const entry of spec.sources) map.addSource(entry.id, entry.source);
      for (const layer of spec.layers) map.addLayer(layer, anchor);
      this.sourceIds = spec.sources.map((entry) => entry.id);
      this.layerIds = spec.layers.map((layer) => layer.id);
    } catch (error) {
      return void console.error("[mmj-typhoon] 置けませんでした", error);
    }

    this.showFrame(0);
    this.dispatchEvent(new CustomEvent("mmj-typhoon-ready", { bubbles: true, detail: { frames: this.frames.length } }));
  }

  /**
   * 時刻を送る。**図形は小さいので毎回作り直してよい**
   * （タイルと違って取りに行き直しが起きない）。
   * @param {number} index
   */
  showFrame(index) {
    const map = /** @type {any} */ (this.owner)?.map;
    if (!map || this.frames.length === 0 || this.sourceIds.length === 0) return;

    const count = this.frames.length;
    const next = ((index % count) + count) % count;
    const [areaId, trackId, centerId] = this.sourceIds;

    try {
      map.getSource(areaId)?.setData(areaFeatures(this.frames, next));
      map.getSource(trackId)?.setData(trackFeatures(this.frames, next));
      map.getSource(centerId)?.setData(centerFeatures(this.frames, next));
    } catch (error) {
      return void console.error("[mmj-typhoon] 時刻を送れませんでした", error);
    }

    this.frame = next;
    const current = this.frames[next];
    this.dispatchEvent(
      new CustomEvent("mmj-typhoon-frame", {
        bubbles: true,
        detail: { index: next, label: current?.label ?? "", pressure: current?.pressure ?? null },
      }),
    );
  }
}
