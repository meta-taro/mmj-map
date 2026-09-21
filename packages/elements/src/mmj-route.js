/**
 * `<mmj-route>` — 渡された経路を描き、曲がる地点に吹き出しを置く。
 *
 * ```html
 * <mmj-map tiles="..." style-url="...">
 *   <mmj-route src="/data/route.geojson" fit></mmj-route>
 * </mmj-map>
 * ```
 *
 * **経路を計算しない。**計算には道路グラフとルーティングエンジンが要り、
 * それは D-003（地図サーバーを立てない）の外側。**作るのは外（API でも AI でも）。**
 * ここがやるのは 4 つだけ。
 *   1. 線を縁取り付きで描く
 *   2. `instruction` を持つ点に、押すと開く吹き出しを置く（**写真も載る**）
 *   3. `fit` があれば経路ぜんぶが入るところまで寄せる
 *   4. 外れるときに、足したものを片付ける
 *
 * **後から足せる。**案内の点だけ増やした GeoJSON を渡せば、そのぶんだけ増える。
 */
import { buildPopupOptions } from "./attrs.js";
import { buildPopupContent } from "./popup.js";
import { ensurePopupContrast, popupColorsFrom, renderPopup } from "./popup-dom.js";
import { ROUTE_DEFAULTS, buildRouteSpec, extractSteps, routeBounds } from "./route.js";

/** 同じページに複数置ける。source 名が衝突すると後勝ちで消えるため、番号で分ける */
let serial = 0;

/** 寄せたときに端が画面の縁へ貼り付かないよう、少し余白を取る */
const FIT_PADDING = 48;

export class MmjRoute extends HTMLElement {
  /** @type {any} */
  map = null;
  /** @type {{ sourceId: string, source: any, layers: any[] } | null} */
  spec = null;
  /** @type {any[]} 曲がる地点に置いた目印 */
  markers = [];

  /**
   * 親の `<mmj-map>`。**connectedCallback で捕まえておく。**
   * 親は描画時に `replaceChildren` で子を DOM から外すので、
   * **あとから `closest` を呼ぶと null になる**。
   * @type {any}
   */
  owner = null;

  connectedCallback() {
    const parent = this.closest("mmj-map");
    if (!parent) return void console.error("[mmj-route] <mmj-map> の中に置いてください");
    this.owner = parent;

    const map = /** @type {any} */ (parent).map;
    if (map) return void this.#attach(map);
    parent.addEventListener(
      "mmj-ready",
      (/** @type {any} */ event) => this.#attach(event.detail.map),
      { once: true },
    );
  }

  disconnectedCallback() {
    for (const marker of this.markers) marker.remove();
    this.markers = [];
    if (this.map && this.spec) {
      for (const layer of this.spec.layers) {
        if (this.map.getLayer(layer.id)) this.map.removeLayer(layer.id);
      }
      if (this.map.getSource(this.spec.sourceId)) this.map.removeSource(this.spec.sourceId);
    }
    this.map = null;
    this.spec = null;
  }

  /** @param {any} map */
  #attach(map) {
    this.map = map;
    // **スタイルが読み終わる前に addSource すると落ちる。**mmj-ready は Map を作った直後に出る
    if (map.isStyleLoaded()) void this.#add(map);
    else map.once("load", () => void this.#add(map));
  }

  /** @param {any} map */
  async #add(map) {
    const src = this.getAttribute("src");
    if (!src) return void console.error("[mmj-route] src に経路の GeoJSON の URL が要ります");

    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`経路を取得できません: ${src} -> HTTP ${response.status}`);
      const data = await response.json();

      // 色は置く側が決める。無ければ地図のテーマカラー、それも無ければ route.js の既定
      const accent = this.owner?.accent;
      const theme = this.owner?.theme;

      this.spec = buildRouteSpec({
        id: this.getAttribute("layer-id") || `mmj-route-${++serial}`,
        data,
        color: this.getAttribute("color") ?? accent ?? undefined,
        // 縁取りは地図の地色。**明るい地図でも暗い地図でも、線が地に沈まない側**
        casingColor: this.getAttribute("casing-color") ?? theme?.background ?? undefined,
        width: readWidth(this.getAttribute("width")),
      });

      map.addSource(this.spec.sourceId, this.spec.source);
      for (const layer of this.spec.layers) map.addLayer(layer);

      this.#placeSteps(map, data, accent);

      if (this.hasAttribute("fit")) {
        const bounds = routeBounds(data);
        // **範囲が読めないときは動かさない。**[0,0] へ寄せるとアフリカ沖へ飛ぶ
        if (bounds !== null) map.fitBounds(bounds, { padding: FIT_PADDING, duration: 0 });
      }

      this.style.display = "none"; // 経路は地図の上に出る。要素そのものは場所を取らない
      this.dispatchEvent(
        new CustomEvent("mmj-route-ready", {
          bubbles: true,
          detail: { steps: this.markers.length },
        }),
      );
    } catch (error) {
      // 握り潰さない（§8）。ここで黙ると、経路が出ない理由が画面にもログにも残らない
      console.error("[mmj-route]", error);
    }
  }

  /**
   * 曲がる地点に吹き出しを置く。
   * @param {any} map
   * @param {any} data
   * @param {string | null | undefined} accent
   */
  #placeSteps(map, data, accent) {
    const maplibregl = /** @type {any} */ (window).maplibregl;
    const key = this.getAttribute("step-key") ?? ROUTE_DEFAULTS.stepKey;
    const className = ensurePopupContrast(popupColorsFrom(this.owner));
    const color = this.getAttribute("step-color") ?? accent ?? undefined;

    for (const step of extractSteps(data, key)) {
      const options = color ? { color } : {};
      const marker = new maplibregl.Marker(options).setLngLat(step.lngLat);
      // **写真も文字も DOM で組む。**`setHTML` は使わない（popup.js の頭に理由）
      const content = buildPopupContent({ text: step.text, image: step.image });
      marker.setPopup(
        new maplibregl.Popup(buildPopupOptions(className)).setDOMContent(renderPopup(content)),
      );
      marker.addTo(map);
      this.markers.push(marker);
    }
  }
}

/**
 * 太さを読む。読めなければ既定に任せる（`undefined` を返す）。
 * @param {string | null} value
 */
function readWidth(value) {
  if (typeof value !== "string") return undefined;
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}
