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
import { buildPopupOptions, buildPopupStyle, parseLngLat, POPUP_COLORS } from "./attrs.js";
import { themeClassName } from "./palette.js";

/**
 * ポップアップを、その地図の上で読める形にする。
 *
 * **色は新しく作っていない**（baseline §11）。**読み込んだスタイルから借りる**。
 * 借り先が読めないときだけ `POPUP_COLORS`（`modern-dark.json` の値）へ落ちる。
 *
 * 撮って初めて分かった不具合が 4 つある。
 *
 * 1. **白地に明るい文字。**暗いページだと文字色を継承して読めなくなる
 * 2. **右上の「謎の四角」。**閉じるボタン（×）が絶対配置で、短い文字だと重なって潰れる
 * 3. **白い紙が 1 枚浮く。**暗い地図の上で MapLibre 既定の白地が浮く
 * 4. **明るい地図の上で暗い箱が浮く。**色を部品側へ焼き込んでいたため（D-019 で 6 枚になって露見）
 *
 * CSS は配色ごとに 1 枚だけ入れる。**1 枚を共有すると、配色違いを並べたとき
 * 最初の 1 枚の色が全部へ効く**（`themes.html` は 6 枚並ぶ）。
 *
 * @param {{ background: string, text: string, border: string }} colors
 * @returns {string} この配色に対応する CSS クラス名
 */
function ensurePopupContrast(colors) {
  const className = themeClassName(colors);
  if (!document.getElementById(className)) {
    const style = document.createElement("style");
    style.id = className;
    style.textContent = buildPopupStyle(colors, className);
    document.head.append(style);
  }
  return className;
}

/**
 * 親の地図が読んだ配色を借りる。読めないところだけ既定へ落とす。
 * @param {Element | null} parent
 */
function popupColorsFrom(parent) {
  const theme = /** @type {any} */ (parent)?.theme;
  return {
    background: theme?.background ?? POPUP_COLORS.background,
    text: theme?.text ?? POPUP_COLORS.text,
    border: theme?.border ?? POPUP_COLORS.border,
  };
}

export class MmjMarker extends HTMLElement {
  /** @type {any} */
  marker = null;

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

    const parent = this.owner;
    const options = {};
    // 指定が無ければ、サイトのテーマカラー（`<mmj-map accent>`）を既定にする。
    // それも無ければ MapLibre の既定色。**ここで色を作らない**
    const color = this.getAttribute("color") ?? /** @type {any} */ (parent)?.accent;
    if (color) options.color = color;

    this.marker = new maplibregl.Marker(options).setLngLat(lngLat);

    const popup = this.getAttribute("popup");
    if (popup) {
      const className = ensurePopupContrast(popupColorsFrom(parent));
      this.marker.setPopup(new maplibregl.Popup(buildPopupOptions(className)).setText(popup));
    }

    this.marker.addTo(map);
    // 最初から開いておきたい場合（案内したい 1 点がある地図）。**付けなければ閉じたまま**
    if (popup && this.hasAttribute("popup-open")) this.marker.togglePopup();
    this.style.display = "none"; // 目印は地図の上に出る。要素そのものは場所を取らない
  }
}
