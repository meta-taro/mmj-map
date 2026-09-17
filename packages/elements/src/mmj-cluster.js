/**
 * `<mmj-cluster>` — 点が多いときに、まとめて描く。
 *
 * ```html
 * <mmj-map tiles="..." style-url="...">
 *   <mmj-cluster src="/data/points.geojson" radius="50" max-zoom="14"></mmj-cluster>
 * </mmj-map>
 * ```
 *
 * **まとめる計算は MapLibre が持っている。**この部品がやるのは 4 つだけ。
 *   1. スタイルが読み終わってから source / layer を足す（先に足すと例外で落ちる）
 *   2. まとまりを押したら、そこが解ける zoom まで寄る
 *   3. ばらの点を押したら、**その点の中身をイベントで渡す**
 *      （ポップアップの形は使う側が決める。ここで決めると厚くなる・PRD §3）
 *   4. 外れるときに、足したものを片付ける
 */
import { DEFAULTS, buildClusterSpec, parseCount } from "./cluster.js";

/** 同じページに複数置ける。source 名が衝突すると後勝ちで消えるため、番号で分ける */
let serial = 0;

export class MmjCluster extends HTMLElement {
  /** @type {any} */
  map = null;
  /** @type {{ sourceId: string, source: any, layers: any[] } | null} */
  spec = null;

  connectedCallback() {
    const parent = this.closest("mmj-map");
    if (!parent) return void console.error("[mmj-cluster] <mmj-map> の中に置いてください");

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
    if (!src) return void console.error("[mmj-cluster] src に点の GeoJSON の URL が要ります");

    try {
      this.spec = buildClusterSpec({
        id: this.getAttribute("layer-id") || `mmj-cluster-${++serial}`,
        src,
        radius: parseCount(this.getAttribute("radius"), DEFAULTS.radius),
        maxZoom: parseCount(this.getAttribute("max-zoom"), DEFAULTS.maxZoom),
        color: this.getAttribute("color") ?? undefined,
        textColor: this.getAttribute("text-color") ?? undefined,
        pointColor: this.getAttribute("point-color") ?? undefined,
      });
    } catch (error) {
      // 握り潰さない（§8）。ここで黙ると、点が出ない理由が画面にもログにも残らない
      return void console.error("[mmj-cluster]", error);
    }

    map.addSource(this.spec.sourceId, this.spec.source);
    for (const layer of this.spec.layers) map.addLayer(layer);

    const [clusters, , points] = this.spec.layers;
    map.on("click", clusters.id, (/** @type {any} */ event) => this.#zoomIntoCluster(map, clusters.id, event));
    map.on("click", points.id, (/** @type {any} */ event) => this.#emitPoint(event));
    for (const id of [clusters.id, points.id]) {
      map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
    }

    this.style.display = "none"; // 点は地図の上に出る。要素そのものは場所を取らない
  }

  /**
   * まとまりを押したら、それが解ける zoom まで寄る。
   * @param {any} map
   * @param {string} layerId
   * @param {any} event
   */
  #zoomIntoCluster(map, layerId, event) {
    const feature = map.queryRenderedFeatures(event.point, { layers: [layerId] })[0];
    if (!feature || !this.spec) return;

    map
      .getSource(this.spec.sourceId)
      .getClusterExpansionZoom(feature.properties.cluster_id)
      .then((/** @type {number} */ zoom) => map.easeTo({ center: feature.geometry.coordinates, zoom }))
      .catch((/** @type {unknown} */ error) => console.error("[mmj-cluster]", error));
  }

  /** @param {any} event */
  #emitPoint(event) {
    const feature = event.features?.[0];
    if (!feature) return;
    this.dispatchEvent(
      new CustomEvent("mmj-cluster-point", {
        bubbles: true,
        detail: { properties: feature.properties, lngLat: feature.geometry.coordinates },
      }),
    );
  }
}
