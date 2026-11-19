/**
 * `<mmj-marker>` — `<mmj-map>` の中に置く目印。
 *
 * ```html
 * <mmj-marker lnglat="135.4959,34.7024" color="#7fb2ff" popup="梅田" popup-open></mmj-marker>
 * <mmj-marker lnglat="135.5023,34.6937" popup="北浜" image="./shop.jpg"></mmj-marker>
 * <mmj-marker lnglat="135.4874,34.6708" popup="株式会社サンプル" popup-body="大阪市西区1-2-3"
 *   popup-href="https://example.com/" popup-href-label="ホームページ" popup-open></mmj-marker>
 * ```
 *
 * **位置を直す**（`draggable`）: ピンを指・マウス・矢印キーで動かし、直した緯度経度を
 * `mmj-marker-move` で受け取る。`drag-radius`（m）で動かせる範囲を絞り、地図に薄く描く。
 * `reset()` で元の位置へ戻す。
 *
 * 親の地図がまだ出来ていなければ、`mmj-ready` を待ってから付ける。
 * **待たずに付けると、読み込み順で付いたり付かなかったりする**（再現しない不具合になる）。
 */
import { buildMarkerPopupOptions, parseLngLat } from "./attrs.js";
import { initialCardState, markerNeedsChrome } from "./card.js";
import { mountCard } from "./card-dom.js";
import { buildCircleSpec } from "./circle.js";
import { arrowStep, clampWithin, moveDetail, parseRadius } from "./drag.js";
import { buildPopupContent } from "./popup.js";
import { ensureCardContrast, ensurePopupContrast, popupColorsFrom, renderPopup } from "./popup-dom.js";

let serial = 0;

export class MmjMarker extends HTMLElement {
  /** @type {any} */
  marker = null;

  /** 中身が増えたときだけ持つ容れ物（`card-dom.js`）。短い吹き出しでは null */
  /** @type {any} */
  card = null;

  /**
   * 親の `<mmj-map>`。**connectedCallback で捕まえておく。**
   * 親は描画時に `replaceChildren` で子を DOM から外すので、
   * **あとから `closest` を呼ぶと null になる**（配色を借り損ねていた）。
   * @type {any}
   */
  owner = null;

  /** 動かす前の位置（`draggable` のとき。`reset()` で戻る先） @type {[number, number] | null} */
  origin = null;

  /** 動かせる範囲（m）。`null` なら絞らない @type {number | null} */
  radius = null;

  /** 範囲を描いた source / layer @type {{ map: any, sourceId: string, layerIds: string[] } | null} */
  range = null;

  connectedCallback() {
    const parent = this.closest("mmj-map");
    if (!parent) return void console.error("[mmj-marker] <mmj-map> の中に置いてください");
    this.owner = parent;

    const map = /** @type {any} */ (parent).map;
    if (map) return void this.#attach(map);
    // **待っている間に置き手が外したら、付けない。**外したあとも待ちが残っていて、地図ができた瞬間に
    // 外したはずの目印の吹き出しまで開いた（地図ができる前に名前を 3 回打つと、吹き出しが 3 つ重なった・2026-11-04）。
    // ただし**親が描くときに外した子は付ける**（`mmj-map.js` が `mmjAdopted` の印を付ける）。
    // 「頁に付いているか」だけで決めると、HTML に書いた目印が 1 つも付かなくなった
    parent.addEventListener(
      "mmj-ready",
      (/** @type {any} */ event) => {
        if (this.isConnected || /** @type {any} */ (this).mmjAdopted === true) this.#attach(event.detail.map);
      },
      { once: true },
    );
  }

  /**
   * 最初から開いておく。**このときだけ、中のリンクへ焦点を移さない。**
   * 移すと、頁を開いた瞬間に焦点が地図へ飛んで頁が送られ、横の入力欄で打った字も吸われた
   * （「ABC商店」が「A商店」になった・2026-11-04）。**押して開くときは移す**（キーボードで中へ行けるように）
   */
  #openAtLoad() {
    const popup = this.marker?.getPopup();
    if (!popup) return;
    popup.options.focusAfterOpen = false;
    this.marker.togglePopup();
    popup.options.focusAfterOpen = true;
  }

  disconnectedCallback() {
    this.#removeRange();
    this.card?.destroy();
    this.card = null;
    this.marker?.remove();
    this.marker = null;
  }

  /** @param {any} map */
  #attach(map) {
    const maplibregl = /** @type {any} */ (window).maplibregl;
    const lngLat = parseLngLat(this.getAttribute("lnglat"));
    if (!lngLat) {
      // 座標が読めないまま [0,0] へ置かない。置くと海の上に出て、間違いだと気づきにくい
      return void console.error(`[mmj-marker] lnglat を読めません: ${this.getAttribute("lnglat")}`);
    }

    const parent = this.owner;
    const options = {};
    // 指定が無ければ、サイトのテーマカラー（`<mmj-map accent>`）を既定にする。
    // それも無ければ MapLibre の既定色。**ここで色を作らない**
    const color = this.getAttribute("color") ?? /** @type {any} */ (parent)?.accent;
    if (color) options.color = color;
    const draggable = this.hasAttribute("draggable");
    // **指とマウスは MapLibre の Marker が持っている**（自前で当たり判定を書かない）
    if (draggable) options.draggable = true;

    this.marker = new maplibregl.Marker(options).setLngLat(lngLat);

    // **写真も文字も、DOM で組む。**`setHTML` は使わない（popup.js の頭に理由）
    const content = buildPopupContent({
      text: this.getAttribute("popup"),
      image: this.getAttribute("image"),
      imageAlt: this.getAttribute("image-alt"),
      body: this.getAttribute("popup-body"),
      href: this.getAttribute("popup-href"),
      hrefLabel: this.getAttribute("popup-href-label"),
    });
    if (content.length > 0) {
      const colors = popupColorsFrom(parent);
      const className = ensurePopupContrast(colors);
      const popup = new maplibregl.Popup(buildMarkerPopupOptions(className));

      // **短い吹き出しは今までどおり。**「大阪城」の 3 文字にボタンを並べると
      // 箱がボタンで埋まる。中身が増えたときだけ容れ物にする。
      // 名前・住所・リンクだけなら容れ物にしない（`markerNeedsChrome` に理由）
      if (markerNeedsChrome(content)) {
        ensureCardContrast(colors, className);
        this.card = mountCard({
          body: renderPopup(content),
          container: map.getContainer(),
          popup,
          className,
          // **狭い画面では最大化から始める。**幅 360px に写真は入らない
          initial: initialCardState({ width: window.innerWidth, rich: true }),
        });
        popup.setDOMContent(this.card.content);
      } else {
        popup.setDOMContent(renderPopup(content));
      }

      this.marker.setPopup(popup);
    }

    this.marker.addTo(map);
    // 最初から開いておきたい場合（案内したい 1 点がある地図）。**付けなければ閉じたまま**
    if (content.length > 0 && this.hasAttribute("popup-open")) this.#openAtLoad();
    if (draggable) this.#enableDrag(map, lngLat, color ?? undefined);
    this.style.display = "none"; // 目印は地図の上に出る。要素そのものは場所を取らない
  }

  /**
   * ピンを動かせるようにする。**指・マウス・キーボードの 3 つとも。**
   *
   * - 指とマウス: MapLibre の Marker の `draggable`。動かしている間も範囲の外へ出さない
   * - キーボード: ピンに焦点を置けるようにし、矢印キーで動かす（Shift で大きく）
   *
   * @param {any} map
   * @param {[number, number]} lngLat
   * @param {string | undefined} color
   */
  #enableDrag(map, lngLat, color) {
    this.origin = lngLat;
    this.radius = parseRadius(this.getAttribute("drag-radius"));
    const marker = this.marker;

    marker.on("drag", () => {
      const now = marker.getLngLat();
      const kept = clampWithin(lngLat, [now.lng, now.lat], this.radius);
      if (kept[0] !== now.lng || kept[1] !== now.lat) marker.setLngLat(kept);
    });
    marker.on("dragend", () => this.#announceMove(false));

    const element = marker.getElement();
    element.tabIndex = 0;
    const name = this.getAttribute("popup") ?? "ピン";
    element.setAttribute(
      "aria-label",
      `${name}。矢印キーで位置を直せます（Shift で大きく）${this.radius === null ? "" : `。元の位置から ${this.radius} m まで`}`,
    );
    element.addEventListener("keydown", (/** @type {KeyboardEvent} */ event) => {
      const step = arrowStep(event.key, event.shiftKey);
      if (step === null) return;
      // **地図を動かさない。**矢印キーは地図の送りにも使われている
      event.preventDefault();
      event.stopPropagation();
      const at = map.project(marker.getLngLat());
      const next = map.unproject([at.x + step[0], at.y + step[1]]);
      marker.setLngLat(clampWithin(lngLat, [next.lng, next.lat], this.radius));
    });
    // **離したときに 1 回だけ知らせる**（押しっぱなしで何十回も保存させない）
    element.addEventListener("keyup", (/** @type {KeyboardEvent} */ event) => {
      if (arrowStep(event.key, false) !== null) this.#announceMove(false);
    });

    if (this.radius !== null) this.#drawRange(map, lngLat, this.radius, color);
  }

  /**
   * 動かせる範囲を薄く描く。**どこまで動かせるかが見えないと、縁で止まったのが不具合に見える。**
   * @param {any} map
   * @param {[number, number]} center
   * @param {number} radius
   * @param {string | undefined} color
   */
  #drawRange(map, center, radius, color) {
    const add = () => {
      if (this.marker === null) return;
      const spec = buildCircleSpec({ id: `mmj-marker-range-${++serial}`, center, radius, color, fillOpacity: 0.08 });
      try {
        map.addSource(spec.sourceId, spec.source);
        for (const layer of spec.layers) map.addLayer(layer);
        this.range = { map, sourceId: spec.sourceId, layerIds: spec.layers.map((layer) => layer.id) };
      } catch (error) {
        // 握り潰さない（§8）。**ピンは動かせる**——範囲の絵だけが出ない
        console.error("[mmj-marker] 動かせる範囲を描けませんでした", error);
      }
    };
    if (map.isStyleLoaded()) add();
    else map.once("load", add);
  }

  #removeRange() {
    const range = this.range;
    this.range = null;
    if (range === null) return;
    try {
      for (const id of range.layerIds.toReversed()) if (range.map.getLayer(id)) range.map.removeLayer(id);
      if (range.map.getSource(range.sourceId)) range.map.removeSource(range.sourceId);
    } catch (error) {
      console.error("[mmj-marker] 範囲を外せませんでした", error);
    }
  }

  /**
   * **元の位置へ戻す口。**戻したことも `mmj-marker-move` で知らせる（`detail.reset` が `true`）。
   * @returns {boolean} 戻せたら `true`（動かせるピンでなければ `false`）
   */
  reset() {
    if (this.marker === null || this.origin === null) return false;
    this.marker.setLngLat(this.origin);
    this.#announceMove(true);
    return true;
  }

  /**
   * 直した位置を知らせる。**2 か所へ出す**——親の `<mmj-map>` は描画時に子を DOM から外すので、
   * この要素から出した出来事は `document` まで上がらない（`mmj-poi.js` と同じ穴）。
   * @param {boolean} reset
   */
  #announceMove(reset) {
    if (this.marker === null || this.origin === null) return;
    const now = this.marker.getLngLat();
    const detail = { ...moveDetail(this.origin, [now.lng, now.lat]), origin: this.origin, reset, id: this.id || null };
    this.dispatchEvent(new CustomEvent("mmj-marker-move", { bubbles: true, detail }));
    if (this.owner && this.owner !== this && !this.owner.contains(this)) {
      this.owner.dispatchEvent(new CustomEvent("mmj-marker-move", { bubbles: true, detail }));
    }
  }
}
