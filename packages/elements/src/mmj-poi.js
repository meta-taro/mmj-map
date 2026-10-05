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
  buildLinks,
  buildReviews,
  buildTabs,
  indexOfShop,
  initialCardState,
  liveUrl,
  mapCardFields,
  nearestByPoint,
  needsChrome,
  panDelta,
  parseLinks,
  parseHours,
  parseLive,
  parseTabs,
  readLiveText,
  readShopParam,
  stepIndex,
  todayKey,
  visibleArea,
  writeShopParam,
} from "./card.js";
import { mountCard } from "./card-dom.js";
import { loadIcon, parseIcons } from "./icons.js";
import { listEntries } from "./list.js";
import { ensureListContrast, mountList } from "./list-dom.js";
import { POI_DEFAULTS, buildPoiSpec } from "./poi.js";
import { buildCardContent, isSafeLink } from "./popup.js";
import {
  ensureCardContrast,
  ensurePopupContrast,
  popupColorsFrom,
  renderHours,
  renderReviews,
  renderTabbed,
} from "./popup-dom.js";
import { parseCount } from "./cluster.js";

/**
 * カードの幅。**狭い画面でははみ出さないように、画面の幅でも抑える。**
 * MapLibre の既定（240px）ではタブが 2 段に折れる。
 */
const CARD_WIDTH = "min(20rem, 86vw)";

/**
 * 押した点を「見えている」と見なす余白（px）。
 * 点の見た目（直径 13px）より少し広く取る。
 */
const MARK_HALF = 18;

/** 同じページに複数置ける。source 名が衝突すると後勝ちで消えるため、番号で分ける */
let serial = 0;

export class MmjPoi extends HTMLElement {
  /** @type {any} */
  map = null;
  /** @type {ReturnType<typeof buildPoiSpec> | null} */
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

  /** いま開いている点の座標。**地図を送って収めるのに要る** @type {[number, number]} */
  where = [0, 0];

  /**
   * いま開いている点の名前。**面が出ている間、点の上の小さな吹き出しに出す。**
   *
   * **`title` という名前にしない。**`HTMLElement.title` は要素の吹き出し（tooltip）で、
   * 上書きすると `<mmj-poi>` に触れただけでブラウザの吹き出しが出る。
   */
  openTitle = "";

  /** いま「ここ」の印が立っている点の id。**降ろすのに要る** @type {string | null} */
  picked = null;

  /** 繋いだ一覧。`list` 属性が無ければ null @type {any} */
  list = null;

  /**
   * 開いた回数。**取りに行った結果が遅れて返ったとき、古いものを捨てるため。**
   * 送って回っている間に前の応答が返ると、**別の店の情報が今の店の顔で出る**。
   */
  opened = 0;

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
    this.list?.destroy();
    this.list = null;
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
        // **点を id で引けるようにする。**「いまここ」の印を立てるのに要る
        idKey: this.getAttribute("card-id") ?? undefined,
        // **一目で何屋か分かるようにする。**絵は持ち込む側のもの（D-001）
        iconKey: this.getAttribute("icon-key") ?? undefined,
        icons: parseIcons(this.getAttribute("icons"), isSafeLink),
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
    // **絵を先に入れてから層を足す。**逆にすると、MapLibre が
    // 「そんな画像は無い」と言い続ける（層は出るが絵は出ない）
    const spec = this.spec;
    void this.#addIcons(map).then(() => {
      for (const layer of spec.layers) if (!map.getLayer(layer.id)) map.addLayer(layer);
    });

    // **押す対象は、見える点ではなく当たり判定の層**（直径 36px）。
    // 見える点は 13px しかなく、指で狙うには小さい
    const hitId = this.spec.hitId;
    map.on("click", hitId, (/** @type {any} */ event) => this.#emit(event));
    map.on("mouseenter", hitId, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", hitId, () => (map.getCanvas().style.cursor = ""));

    this.style.display = "none"; // 点は地図の上に出る。要素そのものは場所を取らない

    // **`card-id` があるときだけ一覧を読む。**無ければ送りも復元も出ないので、
    // 取りに行く理由が無い（**使わないものを取りに行かない**）
    if (this.getAttribute("card-id")) void this.#loadList(src);
  }

  /**
   * 絵を地図へ入れる。**1 枚読めなくても地図は出す。**
   *
   * 読めなかった名前は読み替えに残るが、**MapLibre は無い画像を黙って飛ばす**。
   * その点は丸も出ない（丸は「絵を持つ名前」で切ってあるため）ので、
   * **必ずログに名前を残す**。
   *
   * @param {any} map
   */
  async #addIcons(map) {
    const icons = parseIcons(this.getAttribute("icons"), isSafeLink);
    if (icons.length === 0 || this.spec === null) return;

    const ratio = typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1;
    /** @type {string[]} */
    const missing = [];

    await Promise.all(
      icons.map(async (icon) => {
        const id = this.spec?.imageIdFor(icon.name);
        if (id === undefined || map.hasImage(id)) return;
        const data = await loadIcon(icon.url, ratio);
        if (data === null) return void missing.push(`${icon.name}（${icon.url}）`);
        // **倍率を伝える。**伝えないと、高精細の画面で 2 倍の大きさで出る
        map.addImage(id, data, { pixelRatio: ratio });
      }),
    );

    // 握り潰さない（§8）。**絵が出ない理由が画面にもログにも残らないのが一番困る**
    if (missing.length > 0) {
      console.error(`[mmj-poi] 読めなかったアイコン（その点には何も出ません）: ${missing.join(", ")}`);
    }
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
    this.#mountList();
    this.#restore();
  }

  /**
   * 一覧を地図へ繋ぐ。**`list` に入れ物のセレクタが指定されたときだけ。**
   *
   * カードは送りボタンで 1 件ずつしか回れない。3 件なら足りるが、
   * **20 件を「探す」ことはできない**。
   *
   * **HTML に一覧があれば、それを繋ぐだけ**（中身には触らない）。
   * 置く側が書いたものは検索にも JS 無しにも効くので、作り直すと
   * **検索に出ていた文字を JS で消す**ことになる。
   * 空の入れ物なら点の一覧から作る（**そちらは検索に効かない**）。
   */
  #mountList() {
    const selector = this.getAttribute("list");
    if (selector === null || selector === "") return;

    const container = document.querySelector(selector);
    if (!(container instanceof HTMLElement)) {
      // 握り潰さない（§8）。**一覧だけが黙って出ないのが一番気づきにくい**
      return void console.error(`[mmj-poi] list の指す入れ物がありません: ${selector}`);
    }

    const entries = listEntries(
      this.features,
      {
        idKey: this.getAttribute("card-id"),
        titleKey: this.getAttribute("card-title"),
        search: location.search,
      },
      writeShopParam,
    );

    const className = ensureListContrast(popupColorsFrom(this.owner));

    this.list = mountList({
      container,
      entries,
      className,
      // **地図を寄せる。**一覧から選んだのに画面の外で開いても、何も見えない
      onPick: (id) => this.#openAt(indexOfShop(this.features, this.getAttribute("card-id"), id), true),
    });
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
    // **当たり判定を広げたぶん、隣と重なる。**先頭を取ると、
    // 目で見て選んだ点と違うものが開く
    const feature = nearestByPoint(event.features ?? [], event.point, (coordinates) =>
      this.map.project(coordinates),
    );
    if (!feature) return;

    // **出来事は出すだけで、どこへも送らない。**送り先を決めるのは媒体
    // （「利用者がどこを見たかが第三者に渡らない」が MMJ の主張なので、
    // 部品が勝手に送り始めたら、その主張が嘘になる）
    this.#announce("mmj-poi-click", {
      properties: feature.properties,
      lngLat: feature.geometry.coordinates,
    });

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

  /**
   * 出来事を出す。**どこへも送らない**（何を数えるかは受けた側が決める）。
   *
   * **2 か所へ出す。**親の <mmj-map> は描画時に子を DOM から外すので、
   * この要素から出した出来事は**どこへも上がらない**。
   * `document.addEventListener('mmj-card-open', ...)` で待っている人には
   * **一生届かなかった**（実測・2026-09-29。要素に直接付けた人だけ受け取れていた）。
   *
   * 要素に付けた人・地図に付けた人・document で待つ人、**どれも 1 回だけ**受け取る。
   *
   * @param {string} name
   * @param {any} detail
   */
  #announce(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));
    // 親は DOM に残っている。**こちらから出すと document まで上がる**
    if (this.owner && this.owner !== this) {
      this.owner.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));
    }
  }

  /** `card-*` で指定された属性名。**推測しない**（媒体ごとに名前が違う） */
  #cardKeys() {
    return {
      title: this.getAttribute("card-title"),
      images: this.getAttribute("card-images"),
      // 写真の提供元が「写真に添えて撮影者名を出すこと」を条件にしていることがある。
      // **リンクは任意**（無ければ名前だけ出し、行は消さない）
      imageCredit: this.getAttribute("card-image-credit"),
      imageCreditHref: this.getAttribute("card-image-credit-href"),
      body: this.getAttribute("card-body"),
      rating: this.getAttribute("card-rating"),
      ratingCount: this.getAttribute("card-rating-count"),
      href: this.getAttribute("card-href"),
      hrefLabel: this.getAttribute("card-href-label"),
    };
  }

  /**
   * いま開いている点に「ここ」の印を立てる。**前のものは必ず降ろす。**
   *
   * 降ろし忘れると**開いた点が全部大きいまま**になり、
   * かえってどれが今なのか分からなくなる。
   *
   * @param {unknown} id `card-id` が指す値。無ければ印は立たない
   */
  #mark(id) {
    const map = this.map;
    const source = this.spec?.sourceId;
    if (!map || !source || this.spec?.pickedId === null) return;

    // **同じ点なら触らない。**立て直すと、送るたびに一瞬消える
    const next = id === null || id === undefined || id === "" ? null : String(id);
    if (next === this.picked) return;

    if (this.picked !== null) map.setFeatureState({ source, id: this.picked }, { picked: false });
    if (next !== null) map.setFeatureState({ source, id: next }, { picked: true });
    this.picked = next;
    // **一覧にも同じ印を。**地図と一覧で「いまどれか」が食い違うと、どちらも信用されない
    this.list?.mark(next);
  }

  /**
   * 面が出ている間、点の上に残す小さな吹き出しの中身。**名前だけ。**
   *
   * 読むものは面にある。ここは「どの点の話か」を示すためだけに出す。
   * **文字列から DOM を作らない**（`popup.js` の頭に理由）。
   *
   * @returns {Node | null} 名前が無ければ `null`（空の吹き出しを出さない）
   */
  #miniBalloon() {
    if (this.openTitle === "") return null;
    const node = document.createElement("div");
    node.className = "mmj-popup-text";
    node.textContent = this.openTitle;
    return node;
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

    const properties = feature.properties ?? {};
    const content = buildCardContent({
      ...mapCardFields(properties, keys),
      // **URL の確かめ方を 2 か所に書かない。**popup.js のものを渡す
      links: buildLinks(properties, parseLinks(this.getAttribute("card-links")), isSafeLink),
    });
    if (content.length === 0) return; // **空の箱を開かない**

    const map = this.map;
    const where = feature.geometry.coordinates;
    this.where = where;
    // **面の上に出す名前。**矢印で送ったとき、どの点の話かが分かるように
    this.openTitle = String(properties[this.getAttribute("card-title") ?? ""] ?? "");
    this.#mark(properties[this.getAttribute("card-id") ?? ""]);

    this.opened += 1;

    // **開いているなら、中身だけ差し替える。**閉じて開き直すと、
    // 最大化していたら縮み、めくった写真も戻る（**送るたびに元へ戻る**）
    if (this.card && this.popup) {
      this.card.setBody(this.#renderBody(content, feature));
      this.popup.setLngLat(where);
      // **点の上の名前も入れ替える。**入れ替えないと、送った先でも
      // 前の店の名前が点に貼り付いたままになる（実測・2026-09-30）
      this.card.sync?.();
    } else {
      this.#mount(feature, content, where);
    }

    // **送られた URL では、その点まで寄せる。**画面の外に開いても何も見えない
    // **開いたことを出すだけ。**どこへも送らない（何を数えるかは受けた側が決める）。
    // `mmj-poi-click` は「点が押された」、こちらは「カードが開いた」——
    // **URL から復元したときや、隣へ送ったときにも出る**ので、数えるならこちら
    this.#announce("mmj-card-open", {
      properties: feature.properties,
      lngLat: where,
      index: this.index,
      total: this.features.length,
      id: this.getAttribute("card-id")
        ? String(feature.properties?.[String(this.getAttribute("card-id"))] ?? "")
        : null,
    });

    if (move) {
      map.easeTo({ center: where, duration: 400 });
      map.once("moveend", () => this.#fit());
    } else {
      // 1 枚描いてから測る。**出した直後は、まだ位置が決まっていない**
      requestAnimationFrame(() => this.#fit());
    }
    this.#writeUrl(feature);
    void this.#loadLive(feature, content);
  }

  /**
   * カードが地図からはみ出していたら、地図のほうを送って収める。
   *
   * **カードを動かさず、地図を動かす。**吹き出しは地図の座標に貼り付いているので、
   * カードだけずらすと、**指している点から離れてしまう**。
   */
  #fit() {
    const map = this.map;
    if (!map) return;
    const mapRect = map.getContainer().getBoundingClientRect();
    const pane = this.card?.pane?.();

    if (pane?.isConnected) {
      // 全面のときは、送っても地図が見えない。**何もしない**
      const area = visibleArea(mapRect, pane.getBoundingClientRect());
      if (area === null) return;
      // **面を出したら、カードではなく「押した点」を見えるところへ。**
      // 点が面の下に隠れると、**どこの店の話か分からなくなる**
      const at = map.project(this.where);
      const mark = {
        top: mapRect.top + at.y - MARK_HALF,
        bottom: mapRect.top + at.y + MARK_HALF,
        left: mapRect.left + at.x - MARK_HALF,
        right: mapRect.left + at.x + MARK_HALF,
      };
      const [dx, dy] = panDelta(mark, area, MARK_HALF);
      if (dx !== 0 || dy !== 0) map.panBy([dx, dy], { duration: 200 });
      return;
    }

    const element = this.popup?.getElement();
    if (!element) return;
    const [dx, dy] = panDelta(element.getBoundingClientRect(), mapRect);
    if (dx === 0 && dy === 0) return;
    map.panBy([dx, dy], { duration: 200 });
  }

  /**
   * カードの中身を組む。**タブの指定が無ければ、いままでどおり。**
   * @param {any[]} content
   * @param {any} feature
   */
  /**
   * @param {any[]} content
   * @param {any} feature
   * @param {{ label: string, text: string } | null} [live] 取ってきた「いまの情報」
   */
  #renderBody(content, feature, live = null) {
    const properties = feature.properties ?? {};
    const tabs = buildTabs(properties, parseTabs(this.getAttribute("card-tabs")));

    // 曜日ごとの営業時間。**「営業中」とは書かない**（判断しない）
    const hours = parseHours(properties[String(this.getAttribute("card-hours") ?? "")]);
    if (hours.length > 0) {
      tabs.push({ label: "営業時間", node: renderHours(hours, todayKey(new Date())) });
    }

    // 口コミ本文。**書いた人の言葉のまま**（要約しない）
    const reviews = buildReviews(properties, this.getAttribute("card-reviews"));
    if (reviews.length > 0) {
      tabs.push({ label: `口コミ（${reviews.length}）`, node: renderReviews(reviews) });
    }
    // **取れたときだけ足す。**取れなければタブそのものが出ない
    return renderTabbed({ parts: content, tabs: live === null ? tabs : [...tabs, live] });
  }

  /**
   * 時間で変わる中身を取りに行く。**開いたときだけ。控えない。**
   *
   * **これを使うと「どの店を開いたか」が配信元に伝わる。**
   * MMJ の部品はどこへも送らないが、**取りに行く先は使う側のサーバー**なので
   * そこには残る。**既定では取りに行かない**（属性が無ければ何もしない）。
   *
   * @param {any} feature
   * @param {any[]} content
   */
  async #loadLive(feature, content) {
    const spec = parseLive(this.getAttribute("card-live"));
    const idKey = this.getAttribute("card-id");
    if (spec === null || !idKey) return;

    const url = liveUrl(spec.template, feature.properties?.[idKey]);
    if (url === null) {
      console.error("[mmj-poi] card-live の URL に {id} がありません（全店で同じものを取りに行きます）");
      return;
    }

    const ticket = this.opened;
    let text = null;
    try {
      // **控えない。**古いクーポンを今日の顔で出さないための機能なので、
      // ここで掴むと目的そのものが消える
      const response = await fetch(url, { cache: "no-store" });
      // **404 は異常ではない。**「この店には、いまの情報が無い」ということ。
      // ここで騒ぐと、**本当の異常（500・切断）が記録に埋もれる**
      if (response.status === 404) return;
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      text = readLiveText(await response.json());
    } catch (error) {
      // 握り潰さない（§8）。**カードは出たままで、このタブだけが出ない**
      console.error("[mmj-poi] いまの情報を取れませんでした", error);
      return;
    }

    // **開き直された後なら捨てる。**別の店の情報を今の店の顔で出さない
    if (text === null || ticket !== this.opened || this.card === null) return;
    this.card.setBody(this.#renderBody(content, feature, { label: spec.label, text }));
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
    box.style.setProperty("--mmj-card-max", Math.round(box.clientHeight * 0.72) + "px");
    const colors = popupColorsFrom(this.owner);
    const className = ensurePopupContrast(colors);
    ensureCardContrast(colors, className);

    const popup = new maplibregl.Popup(buildPopupOptions(className, CARD_WIDTH)).setLngLat(where);
    this.popup = popup;

    // **閉じ方は 1 つではない。**見出しバーの ✕ でも、地図を押しても閉じる
    // （`closeOnClick`）。**どちらで閉じても URL を戻す**
    popup.on("close", () => {
      if (this.popup !== popup) return; // 次のカードに差し替わったあとは触らない
      this.card?.destroy();
      this.card = null;
      this.popup = null;
      this.index = -1;
      // **印も降ろす。**MapLibre が自分で閉じたときは、こちらの「閉じる」処理が
      // 走らないので、**印が立ったまま・名前が隠れたまま**になっていた
      // （2026-09-30・もう一度押すと吹き出しが消え、名前の無い青い丸だけが残る、
      // という指摘。選ばれた点の名前は地図から消しているので、
      // 印だけ残ると**名前の無い大きな丸**になる）。
      this.#mark(null);
      this.openTitle = "";
      this.#writeUrl(null);
    });

    this.card = mountCard({
      body: this.#renderBody(content, feature),
      container: map.getContainer(),
      popup,
      className,
      // **窓ではなく、地図の入れ物の幅で決める。**
      // 地図が頁の一部に小さく置かれていることがある（LP がまさにそれ）。
      // **窓が広くても、地図が 360px なら、そこに吹き出しは入らない。**
      //
      // 窓の幅で決めていたときは、**頁の横はみ出しにも引きずられた**
      // （実測・2026-09-29。画面 390px の頁が中身のせいで 1343px 幅になっており、
      // スマホなのに「広い画面」と判断して吹き出しで開いていた）。
      // 入れ物の幅なら、**その地図に何が入るか**だけを見ることになる。
      initial: initialCardState({ width: box.clientWidth, rich: needsChrome(content) }),
      // 一覧を読めているときだけ送りボタンを出す
      siblings: this.index >= 0 ? this.features.length : 1,
      onStep: (delta) => {
        this.#announce("mmj-card-step", { delta, index: this.index, total: this.features.length });
        this.#openAt(stepIndex(this.index, delta, this.features.length), true);
      },
      // **広げたら、点が面の裏へ入る。**幅が伸びきってから送る
      // （伸びている最中に測ると、伸びる前の幅で計算してしまう）
      onShape: (state) => {
        // **閉じたら印を降ろす。**残すと、開いていないのに「ここ」が立ったままになる
        if (state === "closed") return void this.#mark(null);
        setTimeout(() => this.#fit(), 260);
      },
      // **面が出ていても、点の上に名前を残す**（どの点の話かが分かるように）
      mini: () => this.#miniBalloon(),
    });
    popup.setDOMContent(this.card.content).addTo(map);
    // **地図へ足した後でないと吹き出しを掴めない。**面が出ているなら、ここで隠す
    this.card.sync?.();
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
