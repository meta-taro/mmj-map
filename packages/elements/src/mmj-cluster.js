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
 *
 * `pin="machibari"` のときは、まとまりを**種別の割合の輪**、ばらの点を
 * **まち針の斜め刺し**で描く。絵は描こうとしたぶんだけ作る（`machibari.js`）。
 */
import { DEFAULTS, buildClusterSpec, parseCount, parsePinStyle, pickFilters } from "./cluster.js";
import { addImageResolver } from "./image-resolver.js";
import { ballOffset, drawNeedle, drawRing, needleGeometry, needleImageParts, ringImageParts, ringSize } from "./machibari.js";
import { parsePinColors } from "./pin.js";

/** 同じページに複数置ける。source 名が衝突すると後勝ちで消えるため、番号で分ける */
let serial = 0;

/**
 * 地図へ同時に置く輪とまち針の絵の上限。**超えたら古いものから捨てる。**
 * 捨てた絵は、また描こうとしたときに作り直される。輪は件数ごとに別の絵なので、
 * 寄ったり引いたりを繰り返すと溜まる。**数字は実測で決め直すこと。**
 */
const IMAGE_CAP = 256;

export class MmjCluster extends HTMLElement {
  /** @type {any} */
  map = null;
  /** @type {ReturnType<typeof buildClusterSpec> | null} */
  spec = null;
  /** @type {(() => void) | null} */
  imageCleanup = null;
  /** @type {string[]} 作った絵の id（古い順） */
  imageIds = [];

  /**
   * 親の `<mmj-map>`。**connectedCallback で捕まえておく。**
   * 親は描画時に `replaceChildren` で子を DOM から外すので、
   * **あとから `closest` を呼ぶと null になる**（配色を借り損ねていた）。
   * @type {any}
   */
  owner = null;

  connectedCallback() {
    const parent = this.closest("mmj-map");
    if (!parent) return void console.error("[mmj-cluster] <mmj-map> の中に置いてください");
    this.owner = parent;

    const map = /** @type {any} */ (parent).map;
    if (map) return void this.#attach(map);
    parent.addEventListener("mmj-ready", (/** @type {any} */ event) => this.#attach(event.detail.map), { once: true });
  }

  disconnectedCallback() {
    this.imageCleanup?.();
    this.imageCleanup = null;
    if (this.map && this.spec) {
      for (const layer of this.spec.layers) if (this.map.getLayer(layer.id)) this.map.removeLayer(layer.id);
      if (this.map.getSource(this.spec.sourceId)) this.map.removeSource(this.spec.sourceId);
      for (const id of this.imageIds) if (this.map.hasImage(id)) this.map.removeImage(id);
    }
    this.imageIds = [];
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

    const theme = this.owner?.theme;
    const accent = this.owner?.accent;

    try {
      this.spec = buildClusterSpec({
        id: this.getAttribute("layer-id") || `mmj-cluster-${++serial}`,
        src,
        radius: parseCount(this.getAttribute("radius"), DEFAULTS.radius),
        maxZoom: parseCount(this.getAttribute("max-zoom"), DEFAULTS.maxZoom),
        // 指定が無ければ、サイトのテーマカラー（`<mmj-map accent>`）を既定にする。
        // 文字は地図の地色を借りる（**明るい地図でも暗い地図でも、丸の上で読める側**）。
        // どちらも読めなければ cluster.js の既定へ落ちる。**ここで色を作らない**
        color: this.getAttribute("color") ?? accent ?? undefined,
        textColor: this.getAttribute("text-color") ?? theme?.background ?? undefined,
        pointColor: this.getAttribute("point-color") ?? accent ?? undefined,
        pin: parsePinStyle(this.getAttribute("pin")),
        colorKey: this.getAttribute("pin-color-key"),
        // **種別の色は導入側が渡す**（§11・MMJ は色を作らない）
        colors: parsePinColors(this.getAttribute("pin-colors")),
        idKey: this.getAttribute("id-key"),
        // 輪の中は地図の地色で塗るので、件数は**地図の上の字の色**
        labelColor: this.getAttribute("count-color") ?? theme?.text ?? undefined,
      });
    } catch (error) {
      // 握り潰さない（§8）。ここで黙ると、点が出ない理由が画面にもログにも残らない
      return void console.error("[mmj-cluster]", error);
    }

    // **絵は層より先に受け口を置く。**層を足した瞬間に描こうとして聞いてくる
    if (this.spec.pin === "machibari") {
      this.imageCleanup = addImageResolver(map, (/** @type {unknown} */ id) => this.#addImage(map, id));
    }

    map.addSource(this.spec.sourceId, this.spec.source);
    for (const layer of this.spec.layers) map.addLayer(layer);

    const { clusters, hit, points, picked } = this.spec.ids;
    /** @type {string[]} 押せる点の層。**1 本の受け口に束ねる**（層ごとに繋ぐと 1 回の押下で 2 度飛ぶ） */
    const pointLayers = [hit, points, picked].filter((id) => id !== null);
    map.on("click", clusters, (/** @type {any} */ event) => this.#zoomIntoCluster(map, clusters, event));
    map.on("click", (/** @type {any} */ event) => {
      const found = map.queryRenderedFeatures(event.point, { layers: pointLayers });
      if (found.length > 0) return void this.#emitPoint(map, event.point, found);
      // **何も無いところを押したら、選んだ針を寝かせる**（選びっぱなしにしない）
      this.#pick(map, null);
    });
    for (const id of [clusters, ...pointLayers]) {
      map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
    }

    this.style.display = "none"; // 点は地図の上に出る。要素そのものは場所を取らない
  }

  /**
   * 輪かまち針の絵を 1 枚作って、地図へ入れる。**自分の source の id だけ**を引き受ける。
   * @param {any} map
   * @param {unknown} id
   * @returns {Promise<boolean>}
   */
  async #addImage(map, id) {
    const spec = this.spec;
    if (spec === null || typeof id !== "string") return false;
    if (map.hasImage(id)) return true;

    const needle = needleImageParts(spec.sourceId, id);
    const ring = needle === null ? ringImageParts(spec.sourceId, id) : null;
    if (needle === null && ring === null) return false;

    const ratio = typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1;
    const box = needle !== null ? needleGeometry(needle.picked) : { width: 0, height: 0 };
    const side = ring !== null ? ringSize(ring.total) : 0;
    const width = needle !== null ? box.width : side;
    const height = needle !== null ? box.height : side;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext("2d");
    if (context === null) return false;
    context.scale(ratio, ratio);

    if (needle !== null) drawNeedle(context, { color: needle.color, casing: spec.casing, picked: needle.picked });
    else if (ring !== null) {
      drawRing(context, {
        total: ring.total,
        counts: ring.counts,
        colors: spec.colors.map((c) => c.color),
        fallbackColor: spec.fallbackColor,
        // 輪の中は地図の地色。**件数の字（地図の上の字の色）が読める側**
        fill: spec.casing,
      });
    }

    // **倍率を伝える。**伝えないと、高精細の画面で 2 倍の大きさで出る
    map.addImage(id, context.getImageData(0, 0, canvas.width, canvas.height), { pixelRatio: ratio });
    this.imageIds.push(id);
    while (this.imageIds.length > IMAGE_CAP) {
      const old = this.imageIds.shift();
      if (old !== undefined && map.hasImage(old)) map.removeImage(old);
    }
    return true;
  }

  /**
   * 選んだ点を立てる。**`id-key` が無ければ何もしない**（どの点かを言い当てられない）。
   * @param {any} map
   * @param {string | null} id
   */
  #pick(map, id) {
    const spec = this.spec;
    if (spec === null || spec.idKey === null || spec.ids.picked === null) return;
    const filters = pickFilters(spec.idKey, id);
    map.setFilter(spec.ids.points, filters.points);
    map.setFilter(spec.ids.picked, filters.picked);
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

  /**
   * 押した点を選んで、中身を渡す。**当たり判定は隣と重なる**ので、
   * まち針は**指にいちばん近い玉**を選ぶ（丸は従来どおり先頭）。
   * @param {any} map
   * @param {{ x: number, y: number }} point
   * @param {any[]} found
   */
  #emitPoint(map, point, found) {
    const [dx, dy] = this.spec?.pin === "machibari" ? ballOffset(false) : [0, 0];
    const distance = (/** @type {any} */ f) => {
      const p = map.project(f.geometry.coordinates);
      return Math.hypot(p.x + dx - point.x, p.y + dy - point.y);
    };
    const feature = found.reduce((best, f) => (distance(f) < distance(best) ? f : best), found[0]);
    if (!feature) return;
    const idKey = this.spec?.idKey ?? null;
    if (idKey !== null) {
      const raw = feature.properties?.[idKey];
      if (raw !== undefined && raw !== null) this.#pick(map, String(raw));
    }
    this.dispatchEvent(
      new CustomEvent("mmj-cluster-point", {
        bubbles: true,
        detail: { properties: feature.properties, lngLat: feature.geometry.coordinates },
      }),
    );
  }
}
