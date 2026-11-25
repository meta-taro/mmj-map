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
 * **一覧と繋ぐ**（`id-key` があるとき）: 地図を動かし終えるたびに、見えている範囲の
 * 点の id を `mmj-visible` で渡す。外から `select(id)` を呼ぶと、その点まで寄って選ぶ。
 * 一覧の見た目は作らない（導入先の UI のもの）。
 *
 * `pin="machibari"` のときは、まとまりを**種別の割合の輪**、ばらの点を
 * **まち針の斜め刺し**で描く。絵は描こうとしたぶんだけ作る（`machibari.js`）。
 */
import { DEFAULTS, buildClusterSpec, parseCount, parsePinStyle, pickFilters } from "./cluster.js";
import { addImageResolver } from "./image-resolver.js";
import { listen } from "./listen.js";
import { ballOffset, drawNeedle, drawRing, needleGeometry, needleImageParts, ringImageParts, ringSize } from "./machibari.js";
import { paintImage } from "./machibari-image.js";
import { parsePinColors } from "./pin.js";
import { findPoint, focusZoom, sameIds, visibleIds } from "./sync.js";

/** 同じページに複数置ける。source 名が衝突すると後勝ちで消えるため、番号で分ける */
let serial = 0;

/**
 * 地図へ同時に置く輪とまち針の絵の上限。**超えたら古いものから捨てる。**
 * 捨てた絵は、また描こうとしたときに作り直される。輪は件数ごとに別の絵なので、
 * 寄ったり引いたりを繰り返すと溜まる。**数字は実測で決め直すこと。**
 */
const IMAGE_CAP = 256;

export class MmjCluster extends HTMLElement {
  /** 地図ができるのを待っているあいだの、待ちを外す口 @type {(() => void) | null} */
  stopWaiting = null;

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
   * 0.14.0 までは、親が描画時に子を DOM から外したので、
   * **あとから `closest` を呼ぶと null になった**（配色を借り損ねていた）。
   * @type {any}
   */
  owner = null;

  /** 読み込んだ点（`id-key` があるときだけ。一覧と繋ぐのに使う） @type {any[]} */
  features = [];

  /** 最後に知らせた、見えている点の id（同じなら知らせ直さない） @type {string[] | null} */
  lastVisible = null;

  /** @type {(() => void) | null} */
  moveCleanup = null;

  /** 地図に付けた click / mouseenter / mouseleave を外す（Issue #11） @type {(() => void) | null} */
  handlerCleanup = null;

  connectedCallback() {
    const parent = this.closest("mmj-map");
    if (!parent) return void console.error("[mmj-cluster] <mmj-map> の中に置いてください");
    this.owner = parent;
    // **もう付いているなら、付け直さない。**地図が引き取った子を頁へ戻すと、外さないまま
    // ここへ来る。付け直すと層と受け口が 2 組になり、前の組は誰も外せなくなる（Issue #11 の確かめで見つけた）
    if (this.map !== null) return;

    const map = /** @type {any} */ (parent).map;
    if (map) return void this.#attach(map);
    // **外されたら待つのをやめる。**待ちを残すと、外して戻したときに 2 回付く
    const onReady = (/** @type {any} */ event) => this.#attach(event.detail.map);
    parent.addEventListener("mmj-ready", onReady, { once: true });
    this.stopWaiting = () => parent.removeEventListener("mmj-ready", onReady);
  }

  disconnectedCallback() {
    this.stopWaiting?.();
    this.stopWaiting = null;
    this.imageCleanup?.();
    this.imageCleanup = null;
    this.moveCleanup?.();
    this.moveCleanup = null;
    this.handlerCleanup?.();
    this.handlerCleanup = null;
    if (this.map) this.map.getCanvas().style.cursor = "";
    if (this.map && this.spec) {
      for (const layer of this.spec.layers) if (this.map.getLayer(layer.id)) this.map.removeLayer(layer.id);
      if (this.map.getSource(this.spec.sourceId)) this.map.removeSource(this.spec.sourceId);
      for (const id of this.imageIds) if (this.map.hasImage(id)) this.map.removeImage(id);
    }
    this.imageIds = [];
    this.map = null;
    this.spec = null;
    this.features = [];
    this.lastVisible = null;
  }

  /** @param {any} map */
  #attach(map) {
    this.map = map;
    // **スタイルが読み終わる前に addSource すると落ちる。**mmj-ready は Map を作った直後に出る
    if (map.isStyleLoaded()) void this.#add(map);
    else map.once("load", () => void this.#add(map));
  }

  /**
   * **一覧と繋ぐときは、点をこちらで読む。**見えている範囲の点を数えるのに、
   * 点そのものが要る（MapLibre は描いたものしか返さない・`sync.js` の頭）。
   * 読んだものを MapLibre へそのまま渡すので、**同じ URL を 2 度取りに行かない**。
   * @param {any} map
   */
  async #add(map) {
    const src = this.getAttribute("src");
    if (!src) return void console.error("[mmj-cluster] src に点の GeoJSON の URL が要ります");

    /** @type {string | object} */
    let data = src;
    if (this.#idKey() !== null) {
      try {
        const response = await fetch(src);
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        data = await response.json();
      } catch (error) {
        // **推測した点を描かない。**読めなければ何も描かず、理由を残す
        return void console.error(`[mmj-cluster] 点を読めませんでした: ${src}`, error);
      }
      // 読んでいる間に置き手が外したなら付けない
      if (!this.isConnected) return;
      if (this.map !== map) return;
      this.features = Array.isArray(/** @type {any} */ (data)?.features) ? /** @type {any} */ (data).features : [];
    }

    const theme = this.owner?.theme;
    const accent = this.owner?.accent;

    try {
      this.spec = buildClusterSpec({
        id: this.getAttribute("layer-id") || `mmj-cluster-${++serial}`,
        src: data,
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
        weightKey: this.getAttribute("weight-key"),
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
    const pointer = () => (map.getCanvas().style.cursor = "pointer");
    const plain = () => (map.getCanvas().style.cursor = "");
    // **付けた受け口は、外すときに全部外す**（`listen.js`・Issue #11）
    this.handlerCleanup = listen(map, [
      ["click", clusters, (/** @type {any} */ event) => this.#zoomIntoCluster(map, clusters, event)],
      [
        "click",
        (/** @type {any} */ event) => {
          const found = map.queryRenderedFeatures(event.point, { layers: pointLayers });
          if (found.length > 0) return void this.#emitPoint(map, event.point, found);
          // **何も無いところを押したら、選んだ針を寝かせる**（選びっぱなしにしない）
          this.#pick(map, null);
        },
      ],
      ...[clusters, ...pointLayers].flatMap((id) => /** @type {import("./listen.js").Handler[]} */ ([
        ["mouseenter", id, pointer],
        ["mouseleave", id, plain],
      ])),
    ]);

    this.style.display = "none"; // 点は地図の上に出る。要素そのものは場所を取らない

    if (this.hasAttribute("weight-key") && this.spec.weightKey === null) {
      // 握り潰さない（§8）。**まち針の輪は、種別の割合を点の数で描く**ので件数を混ぜない
      console.error("[mmj-cluster] weight-key は丸の形のときだけ効きます（pin=\"machibari\" では点の数で数えます）");
    }
    this.#watchVisible(map);
  }

  /** @returns {string | null} */
  #idKey() {
    const value = this.getAttribute("id-key");
    return value !== null && value.trim() !== "" ? value.trim() : null;
  }

  /**
   * 動かし終えるたびに、見えている点を知らせる。**最初に 1 回**（一覧を最初から絞れるように）。
   * @param {any} map
   */
  #watchVisible(map) {
    const idKey = this.#idKey();
    if (idKey === null) return;
    const send = () => {
      const bounds = map.getBounds();
      const ids = visibleIds(
        this.features,
        { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() },
        idKey,
      );
      if (sameIds(this.lastVisible, ids)) return;
      this.lastVisible = ids;
      this.#announce("mmj-visible", { ids, total: this.features.length, source: this.spec?.sourceId ?? null });
    };
    map.on("moveend", send);
    this.moveCleanup = () => map.off("moveend", send);
    send();
  }

  /**
   * **一覧から選ぶ口。**その点まで寄り、選んだ状態にする。
   *
   * まとまりが解ける所まで寄る（丸の中に隠れたままでは、どれを選んだか分からない）。
   * 今より引かない。**見つからなければ何もしない**（推測した点へ飛ばない）。
   *
   * @param {string | number} id `id-key` の値
   * @returns {boolean} 寄れたら `true`
   */
  select(id) {
    const map = this.map;
    const spec = this.spec;
    const feature = findPoint(this.features, this.#idKey(), id);
    if (map === null || spec === null || feature === null) return false;
    this.#pick(map, String(id));
    map.easeTo({ center: feature.geometry.coordinates, zoom: focusZoom(map.getZoom(), spec.maxZoom + 1), duration: 400 });
    return true;
  }

  /**
   * 出来事を出す。要素から出せば、地図と `document` まで上がる（0.15.0 から、地図は子を DOM から外さない）。
   * @param {string} name
   * @param {any} detail
   */
  #announce(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));
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

    const draw = (/** @type {any} */ context) => {
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
    };
    const image = paintImage(width, height, ratio, draw);
    if (image === null) return false;

    // **倍率を伝える。**伝えないと、高精細の画面で 2 倍の大きさで出る
    map.addImage(id, image, { pixelRatio: ratio });
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
    this.#announce("mmj-cluster-point", { properties: feature.properties, lngLat: feature.geometry.coordinates });
  }
}
