/**
 * `<mmj-fill>` — 面を値で塗り分ける（浸水深・地盤・震度・土砂災害の区域）。
 *
 * ```html
 * <mmj-map tiles="./tiles/demo.pmtiles" style-url="./styles/modern-dark.json">
 *   <mmj-fill src="./data/flood.geojson" value-key="depth"
 *             steps="0.5:#cfe8ff,1:#8ec6ff,3:#3b82f6,5:#1e3a8a"
 *             legend="浸水深（m）"
 *             attribution="出典：○○市 洪水浸水想定区域図（○年○月時点）"></mmj-fill>
 * </mmj-map>
 * ```
 *
 * **色はこちらで作りません。**ハザードマップの配色は国や自治体が決めた
 * 意味のある色なので、**独自配色に置き換えると誤読を生みます**。
 *
 * **MMJ は判断しません。**「ここは危ない」とも「逃げろ」とも言わず、
 * 渡された値を渡された色で塗るところまでです。
 *
 * 組み立ての判断は `fill.js` にあります。ここは地図に付けて、凡例を出すだけ。
 */
import { buildFillSpec, legendItems, parseSteps } from "./fill.js";
import { firstSymbolLayerId } from "./raster.js";
import { popupColorsFrom } from "./popup-dom.js";

let serial = 0;

/**
 * 数として読めなければ undefined（**読めない値で既定を上書きしない**）
 * @param {string | null} value
 */
function readNumber(value) {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export class MmjFill extends HTMLElement {
  /** @type {any} */
  owner = null;

  /** @type {string | null} */
  sourceId = null;

  /** @type {HTMLElement | null} */
  legend = null;

  connectedCallback() {
    const parent = this.closest("mmj-map");
    if (!parent) return void console.error("[mmj-fill] <mmj-map> の中に置いてください");
    this.owner = parent;

    const map = /** @type {any} */ (parent).map;
    if (map) return void this.#attach(map);
    parent.addEventListener("mmj-ready", (/** @type {any} */ event) => this.#attach(event.detail.map), { once: true });
  }

  disconnectedCallback() {
    const map = /** @type {any} */ (this.owner)?.map;
    this.legend?.remove();
    this.legend = null;
    if (map === undefined || map === null || this.sourceId === null) return;
    // **付けた順の逆で外す。**layer を残したまま source を消すと地図が落ちる
    try {
      if (map.getLayer(`${this.sourceId}-fill`)) map.removeLayer(`${this.sourceId}-fill`);
      if (map.getSource(this.sourceId)) map.removeSource(this.sourceId);
    } catch (error) {
      console.error("[mmj-fill] 外せませんでした", error);
    }
    this.sourceId = null;
  }

  /**
   * **スタイルが出来るまで待つ。**`mmj-ready` はスタイル読み込みの前に出るので、
   * そのまま `addSource` すると `Style is not done loading.` で落ちる。
   * @param {any} map
   */
  #attach(map) {
    this.style.display = "none"; // 地図の上に出るもの。要素そのものは場所を取らない
    if (map.isStyleLoaded()) this.#add(map);
    else map.once("load", () => this.#add(map));
  }

  /** @param {any} map */
  #add(map) {
    const steps = parseSteps(this.getAttribute("steps"));
    let spec;
    try {
      spec = buildFillSpec({
        id: this.getAttribute("layer-id") || `mmj-fill-${++serial}`,
        src: this.getAttribute("src") ?? "",
        valueKey: this.getAttribute("value-key") ?? "",
        steps,
        opacity: readNumber(this.getAttribute("opacity")),
        // **出典と時点は、地図の中に出す。**持ち出された先では配布元の頁は付いて来ない
        attribution: this.getAttribute("attribution") ?? undefined,
      });
    } catch (error) {
      // 握り潰さない（§8）。**地図は殺さない**——重ねるものが出ないだけにする
      return void console.error("[mmj-fill]", /** @type {Error} */ (error).message);
    }

    try {
      map.addSource(spec.sourceId, spec.source);
      // **ラベルの下へ入れる。**上へ置くと地名も駅名も読めなくなる
      const before = this.getAttribute("before") ?? firstSymbolLayerId(map.getStyle());
      map.addLayer(spec.layers[0], before && map.getLayer(before) ? before : undefined);
      this.sourceId = spec.sourceId;
    } catch (error) {
      return void console.error("[mmj-fill] 重ねられませんでした", error);
    }

    this.#showLegend(map, steps);
  }

  /**
   * 凡例を出す。**色だけ出しても、濃い青が何メートルかは誰にも分からない。**
   *
   * **`legend` を渡さなければ出しません。**単位も見出しも知らないまま
   * 数字だけ並べると、**読んだ人が意味を作ってしまう**。
   *
   * @param {any} map
   * @param {{ at: number, color: string }[]} steps
   */
  #showLegend(map, steps) {
    const title = this.getAttribute("legend");
    if (title === null || title.trim() === "") return;

    const items = legendItems(steps);
    if (items.length === 0) return;

    const colors = popupColorsFrom(this.owner);
    const box = document.createElement("div");
    box.className = "mmj-fill-legend";
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", `凡例 ${title}`);
    // **色は読み込んだスタイルから借りる**（baseline §11・ここで色を作らない）。
    // 左上に置く——MapLibre は右上に操作系、右下に帰属表示を置くので**空いているのは左上**
    box.style.cssText =
      "position:absolute;left:10px;top:10px;z-index:2;" +
      `background:${colors.background};color:${colors.text};` +
      `border:1px solid ${colors.border};border-radius:6px;` +
      "padding:6px 8px;font:12px/1.5 system-ui,-apple-system,'Segoe UI'," +
      "'Hiragino Sans','Noto Sans JP',sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.35);";

    const heading = document.createElement("div");
    heading.textContent = title;
    heading.style.cssText = "font-weight:600;margin-bottom:4px;";
    box.append(heading);

    for (const item of items) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:6px;";
      const chip = document.createElement("span");
      // **凡例の色は、塗った色そのもの。**別の色を見せたら凡例の意味が無い
      chip.style.cssText =
        `display:inline-block;width:14px;height:14px;border-radius:3px;background:${item.color};` +
        `border:1px solid ${colors.border};flex:none;`;
      const label = document.createElement("span");
      label.textContent = item.label;
      row.append(chip, label);
      box.append(row);
    }

    map.getContainer().append(box);
    this.legend = box;
  }
}
