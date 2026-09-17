/**
 * `<mmj-marker>` — `<mmj-map>` の中に置く目印。
 *
 * ```html
 * <mmj-marker lnglat="135.4959,34.7024" color="#7fb2ff" popup="梅田" popup-open></mmj-marker>
 * ```
 *
 * 親の地図がまだ出来ていなければ、`mmj-ready` を待ってから付ける。
 * **待たずに付けると、読み込み順で付いたり付かなかったりする**（再現しない不具合になる）。
 */
import { buildPopupOptions, buildPopupStyle, parseLngLat } from "./attrs.js";

/**
 * ポップアップを、暗い地図の上で読める形にする。
 *
 * **色は新しく作っていない**（baseline §11）。すべて `styles/modern-dark.json` に
 * ある値を借りている（`POPUP_COLORS`・借りていることはテストで縛ってある）。
 *
 * 撮って初めて分かった不具合が 3 つある。
 *
 * 1. **白地に明るい文字。**暗いページだと文字色を継承して読めなくなる
 * 2. **右上の「謎の四角」。**閉じるボタン（×）が絶対配置で、短い文字だと重なって潰れる
 * 3. **白い紙が 1 枚浮く。**暗い地図の上で MapLibre 既定の白地が浮く
 */
function ensurePopupContrast() {
  const id = "mmj-popup-contrast";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = buildPopupStyle();
  document.head.append(style);
}

export class MmjMarker extends HTMLElement {
  /** @type {any} */
  marker = null;

  connectedCallback() {
    const parent = this.closest("mmj-map");
    if (!parent) return void console.error("[mmj-marker] <mmj-map> の中に置いてください");

    const map = /** @type {any} */ (parent).map;
    if (map) return void this.#attach(map);
    parent.addEventListener("mmj-ready", (/** @type {any} */ event) => this.#attach(event.detail.map), { once: true });
  }

  disconnectedCallback() {
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

    const options = {};
    const color = this.getAttribute("color");
    if (color) options.color = color;

    this.marker = new maplibregl.Marker(options).setLngLat(lngLat);

    const popup = this.getAttribute("popup");
    if (popup) {
      ensurePopupContrast();
      this.marker.setPopup(new maplibregl.Popup(buildPopupOptions()).setText(popup));
    }

    this.marker.addTo(map);
    // 最初から開いておきたい場合（案内したい 1 点がある地図）。**付けなければ閉じたまま**
    if (popup && this.hasAttribute("popup-open")) this.marker.togglePopup();
    this.style.display = "none"; // 目印は地図の上に出る。要素そのものは場所を取らない
  }
}
