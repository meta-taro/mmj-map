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
import { ROUTE_DEFAULTS, buildRouteSpec, extractSteps, routeBounds, stepPinSpec } from "./route.js";

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
      const spec = stepPinSpec(step, color ?? ROUTE_DEFAULTS.color);
      // **写真を持つ点だけ、自前の丸にする。**持たない点は既定のピンのまま
      // （見た目が違うこと自体が「ここに写真がある」の合図になる）
      // **尖りの先が座標。**`anchor: "bottom"` で箱の下端を地点へ合わせる
      const options = spec.kind === "photo"
        ? { element: photoPin(spec, step.text), anchor: "bottom" }
        : (color ? { color } : {});
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

const SVG_NS = "http://www.w3.org/2000/svg";

/** 丸く切るための `clipPath` の id。**同じ頁に何本経路があっても衝突しない** */
let clipSeq = 0;

/**
 * 写真を丸に入れたピンを組む。**`setHTML` は使わない**（`popup.js` の頭に理由）。
 *
 * **canvas を通さない。**画素を読み戻す必要が無いので、
 * **別オリジンの写真でも CORS の設定が要らない**（`<img src>` と同じ扱い）。
 *
 * **`preserveAspectRatio="xMidYMid slice"` で中央を切る。**縦長でも横長でも
 * 丸が欠けない。`slice` が無いと余白が出て、**丸の中に四角が浮く**。
 *
 * @param {{
 *   href: string | null, radius: number,
 *   body: number, tail: number,
 *   width: number, height: number, color: string, casing: string,
 * }} spec
 * @param {string} label 読み上げ用（その点の案内文）
 * @returns {SVGSVGElement}
 */
function photoPin(spec, label) {
  const { width, height, radius, body, color, casing } = spec;
  const center = width / 2;
  const clipId = `mmj-route-pin-${(clipSeq += 1)}`;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  // **読み上げに「写真あり」まで伝える。**丸の中身は目で見た人にしか分からない
  svg.setAttribute("aria-label", label === "" ? "写真のある地点" : `${label}（写真あり）`);
  svg.style.display = "block";
  svg.style.cursor = "pointer";

  const clip = document.createElementNS(SVG_NS, "clipPath");
  clip.setAttribute("id", clipId);
  clip.append(circleAt(center, radius));
  const defs = document.createElementNS(SVG_NS, "defs");
  defs.append(clip);

  const image = document.createElementNS(SVG_NS, "image");
  // **URL は確かめ済みのものだけが来る**（`route.js` の `stepPinSpec`）
  image.setAttribute("href", spec.href ?? "");
  image.setAttribute("x", String(center - radius));
  image.setAttribute("y", String(center - radius));
  image.setAttribute("width", String(radius * 2));
  image.setAttribute("height", String(radius * 2));
  image.setAttribute("preserveAspectRatio", "xMidYMid slice");
  image.setAttribute("clip-path", `url(#${clipId})`);

  // **縁は線の色と揃える。**地図の上では、縁が無いと写真が背景へ溶ける
  // **本体は、丸と先が繋がった 1 本の形（雫形）。**
  // 丸と三角を別々に置くと継ぎ目ができて、**「丸に針が刺さっている」**ように見える
  // （2026-10-09・「ちょと鋭利すぎてこわいので、かわいらしいピンがいい」）。
  //
  // 塗りは `color`。写真の丸より**本体のほうが大きい**ので、差がそのまま輪になる。
  // 縁取りは `casing`——経路の線と同じ色なので、**線の上でも溶けない**。
  const shape = document.createElementNS(SVG_NS, "path");
  const tipY = height - 1;
  shape.setAttribute(
    "d",
    `M ${center},${tipY}` +
      ` C ${center - body * 0.62},${center + body * 0.78}` +
      ` ${center - body},${center + body * 0.42} ${center - body},${center}` +
      ` A ${body},${body} 0 1,1 ${center + body},${center}` +
      ` C ${center + body},${center + body * 0.42}` +
      ` ${center + body * 0.62},${center + body * 0.78} ${center},${tipY} Z`,
  );
  shape.setAttribute("fill", color);
  shape.setAttribute("stroke", casing);
  shape.setAttribute("stroke-width", "1.5");
  shape.setAttribute("stroke-linejoin", "round");

  svg.append(defs, shape, image);
  return svg;
}

/** @param {number} center @param {number} radius */
function circleAt(center, radius) {
  const circle = document.createElementNS(SVG_NS, "circle");
  circle.setAttribute("cx", String(center));
  circle.setAttribute("cy", String(center));
  circle.setAttribute("r", String(radius));
  return circle;
}
