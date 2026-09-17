/**
 * `<mmj-poi>` — 利用者が持ち込む POI を、ベース地図の上に重ねる。
 *
 * ```html
 * <mmj-map tiles="..." style-url="...">
 *   <mmj-poi src="/data/our-poi.geojson" label-key="shop_name" min-zoom="15"></mmj-poi>
 * </mmj-map>
 * ```
 *
 * **ベース地図には触らない。**別 source を上に重ねるだけ（D-001・データを持たない）。
 * まとめたいときは `<mmj-cluster>`。こちらは 1 点ずつ名前を出す用途。
 *
 * 押したら `mmj-poi-click` が飛ぶ。**何を出すかは使う側が決める**（PRD §3・厚くしない）。
 */
import { POI_DEFAULTS, buildPoiSpec } from "./poi.js";
import { parseCount } from "./cluster.js";

/** 同じページに複数置ける。source 名が衝突すると後勝ちで消えるため、番号で分ける */
let serial = 0;

export class MmjPoi extends HTMLElement {
  /** @type {any} */
  map = null;
  /** @type {{ sourceId: string, source: any, layers: any[] } | null} */
  spec = null;

  connectedCallback() {
    const parent = this.closest("mmj-map");
    if (!parent) return void console.error("[mmj-poi] <mmj-map> の中に置いてください");

    const map = /** @type {any} */ (parent).map;
    if (map) return void this.#attach(map);
    parent.addEventListener("mmj-ready", (/** @type {any} */ event) => this.#attach(event.detail.map), { once: true });
  }

  disconnectedCallback() {
    if (this.map && this.spec) {
      for (const layer of this.spec.layers) if (this.map.getLayer(layer.id)) this.map.removeLayer(layer.id);
      if (this.map.getSource(this.spec.sourceId)) this.map.removeSource(this.spec.sourceId);
    }
    this.map = null;
    this.spec = null;
  }

  /** @param {any} map */
  #attach(map) {
    this.map = map;
    // **スタイルが読み終わる前に addSource すると落ちる。**mmj-ready は Map を作った直後に出る
    if (map.isStyleLoaded()) this.#add(map);
    else map.once("load", () => this.#add(map));
  }

  /** @param {any} map */
  #add(map) {
    const src = this.getAttribute("src");
    if (!src) return void console.error("[mmj-poi] src に点の GeoJSON の URL が要ります");

    try {
      this.spec = buildPoiSpec({
        id: this.getAttribute("layer-id") || `mmj-poi-${++serial}`,
        src,
        labelKey: this.getAttribute("label-key") ?? undefined,
        minZoom: parseCount(this.getAttribute("min-zoom"), POI_DEFAULTS.minZoom),
        color: this.getAttribute("color") ?? undefined,
        textColor: this.getAttribute("text-color") ?? undefined,
      });
    } catch (error) {
      // 握り潰さない（§8）。ここで黙ると、点が出ない理由が画面にもログにも残らない
      return void console.error("[mmj-poi]", error);
    }

    map.addSource(this.spec.sourceId, this.spec.source);
    for (const layer of this.spec.layers) map.addLayer(layer);

    const dotId = this.spec.layers[0].id;
    map.on("click", dotId, (/** @type {any} */ event) => this.#emit(event));
    map.on("mouseenter", dotId, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", dotId, () => (map.getCanvas().style.cursor = ""));

    this.style.display = "none"; // 点は地図の上に出る。要素そのものは場所を取らない
  }

  /** @param {any} event */
  #emit(event) {
    const feature = event.features?.[0];
    if (!feature) return;
    this.dispatchEvent(
      new CustomEvent("mmj-poi-click", {
        bubbles: true,
        detail: { properties: feature.properties, lngLat: feature.geometry.coordinates },
      }),
    );
  }
}
