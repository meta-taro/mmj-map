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
 * 親の地図がまだ出来ていなければ、`mmj-ready` を待ってから付ける。
 * **待たずに付けると、読み込み順で付いたり付かなかったりする**（再現しない不具合になる）。
 */
import { buildMarkerPopupOptions, parseLngLat } from "./attrs.js";
import { initialCardState, markerNeedsChrome } from "./card.js";
import { mountCard } from "./card-dom.js";
import { buildPopupContent } from "./popup.js";
import { ensureCardContrast, ensurePopupContrast, popupColorsFrom, renderPopup } from "./popup-dom.js";

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

  connectedCallback() {
    const parent = this.closest("mmj-map");
    if (!parent) return void console.error("[mmj-marker] <mmj-map> の中に置いてください");
    this.owner = parent;

    const map = /** @type {any} */ (parent).map;
    if (map) return void this.#attach(map);
    parent.addEventListener("mmj-ready", (/** @type {any} */ event) => this.#attach(event.detail.map), { once: true });
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
    this.style.display = "none"; // 目印は地図の上に出る。要素そのものは場所を取らない
  }
}
