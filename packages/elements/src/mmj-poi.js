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
import { buildPopupOptions } from "./attrs.js";
import {
  indexOfShop,
  initialCardState,
  mapCardFields,
  needsChrome,
  panDelta,
  readShopParam,
  stepIndex,
  writeShopParam,
} from "./card.js";
import { mountCard } from "./card-dom.js";
import { POI_DEFAULTS, buildPoiSpec } from "./poi.js";
import { buildCardContent } from "./popup.js";
import { ensureCardContrast, ensurePopupContrast, popupColorsFrom, renderPopup } from "./popup-dom.js";
import { parseCount } from "./cluster.js";

/** 同じページに複数置ける。source 名が衝突すると後勝ちで消えるため、番号で分ける */
let serial = 0;

export class MmjPoi extends HTMLElement {
  /** @type {any} */
  map = null;
  /** @type {{ sourceId: string, source: any, layers: any[] } | null} */
  spec = null;

  /** 開いているカード。**開き直すたびに片付ける**（重ねて開かない） */
  /** @type {any} */
  card = null;

  /** @type {any} */
  popup = null;

  /**
   * 点の一覧。**`card-id` が指定されたときだけ読む。**
   *
   * 隣の店へ送るにも、URL から復元するにも、**順番の付いた一覧**が要る。
   * `map.querySourceFeatures` は**画面に出ているぶんしか返さず、順番も保証されない**ので、
   * 元の GeoJSON をそのまま読む。**同じ URL なのでブラウザの控えが効く**
   * （地図がすでに取っている）。
   * @type {any[]}
   */
  features = [];

  /** いま開いている点の位置。開いていなければ -1 */
  index = -1;

  /**
   * 親の `<mmj-map>`。**connectedCallback で捕まえておく。**
   * 親は描画時に `replaceChildren` で子を DOM から外すので、
   * **あとから `closest` を呼ぶと null になる**（配色を借り損ねていた）。
   * @type {any}
   */
  owner = null;

  connectedCallback() {
    const parent = this.closest("mmj-map");
    if (!parent) return void console.error("[mmj-poi] <mmj-map> の中に置いてください");
    this.owner = parent;

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

    const theme = this.owner?.theme;
    const accent = this.owner?.accent;

    try {
      this.spec = buildPoiSpec({
        id: this.getAttribute("layer-id") || `mmj-poi-${++serial}`,
        src,
        labelKey: this.getAttribute("label-key") ?? undefined,
        minZoom: parseCount(this.getAttribute("min-zoom"), POI_DEFAULTS.minZoom),
        // 指定が無ければ、サイトのテーマカラー（`<mmj-map accent>`）を既定にする。
        // 名前は地図のラベルと同じ色を借りる。**ここで色を作らない**
        // **出典と時点は、地図の中に出す。**持ち出された先では、
        // 配布元のページは付いて来ない（`© OpenStreetMap contributors` の隣に並ぶ）
        attribution: this.getAttribute("attribution") ?? undefined,
        color: this.getAttribute("color") ?? accent ?? undefined,
        textColor: this.getAttribute("text-color") ?? theme?.text ?? undefined,
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

    // **`card-id` があるときだけ一覧を読む。**無ければ送りも復元も出ないので、
    // 取りに行く理由が無い（**使わないものを取りに行かない**）
    if (this.getAttribute("card-id")) void this.#loadList(src);
  }

  /**
   * 点の一覧を読む。**読めなくても地図は出す。**
   * @param {string} src
   */
  async #loadList(src) {
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const json = await response.json();
      this.features = Array.isArray(json?.features) ? json.features : [];
    } catch (error) {
      // 握り潰さない（§8）。**送りと復元だけが消える**ことを名乗る
      console.error("[mmj-poi] 一覧を読めませんでした。次/前と URL の復元は出ません", error);
      return;
    }
    this.#restore();
  }

  /**
   * URL の `?shop=` から、その点を開く。
   *
   * **「この店いいよ」と送られた URL を開いた人**が、
   * 地図だけ見せられて終わらないようにするため。
   */
  #restore() {
    const at = indexOfShop(this.features, this.getAttribute("card-id"), readShopParam(location.search));
    if (at < 0) return;
    // **送られた URL では、その点まで地図を寄せる。**
    // 画面の外に開いても、受け取った人には何も見えない
    this.#openAt(at, true);
  }

  /**
   * 一覧の n 番目を開く。
   * @param {number} at
   * @param {boolean} move 地図をその点まで寄せるか
   */
  #openAt(at, move) {
    const feature = this.features[at];
    if (!feature) return;
    this.index = at;
    this.#openCard(feature, move);
  }

  /** @param {any} event */
  #emit(event) {
    const feature = event.features?.[0];
    if (!feature) return;

    // **出来事は出すだけで、どこへも送らない。**送り先を決めるのは媒体
    // （「利用者がどこを見たかが第三者に渡らない」が MMJ の主張なので、
    // 部品が勝手に送り始めたら、その主張が嘘になる）
    this.dispatchEvent(
      new CustomEvent("mmj-poi-click", {
        bubbles: true,
        detail: { properties: feature.properties, lngLat: feature.geometry.coordinates },
      }),
    );

    // **一覧の中の位置が分かるなら、そちらで開く**（次/前と URL が効く）。
    // 分からなければ、押された点そのものを開く（今までどおり）
    const idKey = this.getAttribute("card-id");
    const at = idKey ? indexOfShop(this.features, idKey, feature.properties?.[idKey]) : -1;
    if (at >= 0) this.#openAt(at, false);
    else {
      this.index = -1;
      this.#openCard(feature, false);
    }
  }

  /** `card-*` で指定された属性名。**推測しない**（媒体ごとに名前が違う） */
  #cardKeys() {
    return {
      title: this.getAttribute("card-title"),
      images: this.getAttribute("card-images"),
      body: this.getAttribute("card-body"),
      rating: this.getAttribute("card-rating"),
      ratingCount: this.getAttribute("card-rating-count"),
      href: this.getAttribute("card-href"),
      hrefLabel: this.getAttribute("card-href-label"),
    };
  }

  /**
   * 押された点のカードを開く。
   *
   * **`card-*` が 1 つも指定されていなければ何もしない。**
   * 勝手に属性名を推測して、関係のない値をカードに出さない。
   *
   * @param {any} feature
   * @param {boolean} [move] 地図をその点まで寄せるか
   */
  #openCard(feature, move = false) {
    const keys = this.#cardKeys();
    if (Object.values(keys).every((value) => value === null)) return;

    const content = buildCardContent(mapCardFields(feature.properties ?? {}, keys));
    if (content.length === 0) return; // **空の箱を開かない**

    const map = this.map;
    const where = feature.geometry.coordinates;

    // **開いているなら、中身だけ差し替える。**閉じて開き直すと、
    // 最大化していたら縮み、めくった写真も戻る（**送るたびに元へ戻る**）
    if (this.card && this.popup) {
      this.card.setBody(renderPopup(content));
      this.popup.setLngLat(where);
    } else {
      this.#mount(feature, content, where);
    }

    // **送られた URL では、その点まで寄せる。**画面の外に開いても何も見えない
    if (move) {
      map.easeTo({ center: where, duration: 400 });
      map.once("moveend", () => this.#fit());
    } else {
      // 1 枚描いてから測る。**出した直後は、まだ位置が決まっていない**
      requestAnimationFrame(() => this.#fit());
    }
    this.#writeUrl(feature);
  }

  /**
   * カードが地図からはみ出していたら、地図のほうを送って収める。
   *
   * **カードを動かさず、地図を動かす。**吹き出しは地図の座標に貼り付いているので、
   * カードだけずらすと、**指している点から離れてしまう**。
   */
  #fit() {
    const element = this.popup?.getElement();
    if (!element || !this.map) return;
    const [dx, dy] = panDelta(
      element.getBoundingClientRect(),
      this.map.getContainer().getBoundingClientRect(),
    );
    if (dx === 0 && dy === 0) return;
    this.map.panBy([dx, dy], { duration: 200 });
  }

  /**
   * 吹き出しとカードを新しく作る。
   * @param {any} feature
   * @param {any[]} content
   * @param {[number, number]} where
   */
  #mount(feature, content, where) {
    const maplibregl = /** @type {any} */ (window).maplibregl;
    const map = this.map;
    // **上限は地図の高さから決める。**地図が画面より小さいと、画面基準では収まらない
    const box = map.getContainer();
    box.style.setProperty("--mmj-card-max", Math.round(box.clientHeight * 0.6) + "px");
    const colors = popupColorsFrom(this.owner);
    const className = ensurePopupContrast(colors);
    ensureCardContrast(colors, className);

    const popup = new maplibregl.Popup(buildPopupOptions(className)).setLngLat(where);
    this.popup = popup;

    // **閉じ方は 1 つではない。**見出しバーの ✕ でも、地図を押しても閉じる
    // （`closeOnClick`）。**どちらで閉じても URL を戻す**
    popup.on("close", () => {
      if (this.popup !== popup) return; // 次のカードに差し替わったあとは触らない
      this.card?.destroy();
      this.card = null;
      this.popup = null;
      this.index = -1;
      this.#writeUrl(null);
    });

    this.card = mountCard({
      body: renderPopup(content),
      container: map.getContainer(),
      popup,
      className,
      // **狭い画面では最大化から始める。**幅 360px に写真は入らない
      initial: initialCardState({ width: window.innerWidth, rich: needsChrome(content) }),
      // 一覧を読めているときだけ送りボタンを出す
      siblings: this.index >= 0 ? this.features.length : 1,
      onStep: (delta) => this.#openAt(stepIndex(this.index, delta, this.features.length), true),
    });
    popup.setDOMContent(this.card.content).addTo(map);
  }

  /**
   * いま開いている点を URL に書く。**`card-id` が無ければ触らない。**
   *
   * `replaceState` を使うので、**戻るボタンの履歴を店の数だけ埋めない**
   * （押して回るたびに履歴が積まれると、頁から出るのに何度も戻ることになる）。
   *
   * @param {any} feature `null` で外す
   */
  #writeUrl(feature) {
    const idKey = this.getAttribute("card-id");
    if (!idKey) return;
    const raw = feature?.properties?.[idKey];
    const id = raw === undefined || raw === null ? null : String(raw);
    history.replaceState(null, "", `${location.pathname}${writeShopParam(location.search, id)}${location.hash}`);
  }
}
