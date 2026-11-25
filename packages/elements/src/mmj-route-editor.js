/**
 * `<mmj-route-editor>` — 地図を押して道案内の線を引き、案内の点（ひとこと・写真）を置く。
 * **管理画面のための部品。**結果は `<mmj-route>` がそのまま読める GeoJSON。
 *
 * ```html
 * <mmj-map tiles="..." style-url="...">
 *   <mmj-route-editor from="A2 出口" to="店の名前" value='{"type":"FeatureCollection","features":[]}' fit></mmj-route-editor>
 * </mmj-map>
 * <script type="module">
 *   document.querySelector("mmj-map").addEventListener("mmj-route-change", (event) => {
 *     hiddenInput.value = event.detail.text; // 保存する GeoJSON（文字）
 *   });
 * </script>
 * ```
 *
 * **経路は計算しない。**人が押した順に繋ぐ。道に沿わせるのは人の目（地図の道の上を押す）。
 *
 * **指・マウス・キーボードの 3 つとも**で引ける。
 *   - 線を引く: 地図を押すと線の終わりに点が足される。点は掴んで動かせる。押すと「この点を消す」
 *   - 案内を置く: 地図を押すと点が立ち、ひとことと写真の URL を打つ欄が開く
 *   - キーボード: 地図を矢印キーで送り「真ん中に置く」。点に焦点を置いて矢印で動かし、Delete で消す
 *
 * 判断は `route-edit.js`（純粋関数）、画面の部品は `route-editor-dom.js`。
 */
import { buildPopupOptions } from "./attrs.js";
import { ensurePopupContrast, popupColorsFrom } from "./popup-dom.js";
import { keepPopupInside } from "./popup-fit.js";
import { ROUTE_DEFAULTS, routeBounds } from "./route.js";
import {
  addStep,
  addVertex,
  editIssues,
  emptyRoute,
  fromGeoJSON,
  moveStep,
  moveVertex,
  removeStep,
  removeVertex,
  toGeoJSON,
  updateStep,
} from "./route-edit.js";
import { buildPanel, ensureEditorStyle, RESIZE_EVENT, stepForm, vertexElement, vertexMenu } from "./route-editor-dom.js";
import { arrowStep } from "./drag.js";
import { formatWalk, walkSummary } from "./walk.js";

let serial = 0;

/** 「1 つ戻す」で戻れる回数。管理画面を開きっぱなしにしても膨らまないように */
const HISTORY_LIMIT = 100;

/** 寄せたときの余白（px）。`mmj-route.js` と同じ */
const FIT_PADDING = 48;

/** 案内を置くとき、線の点からこの距離（画面の px）の内側なら点の上へ寄せる。点の見た目の半径ほど */
const SNAP_PX = 16;

/** 地図を押したとき、これらの上なら点を足さない（点・吹き出し・操作の帯を押しただけ） */
const NOT_THE_MAP = ".maplibregl-marker, .maplibregl-popup, .maplibregl-ctrl";

/** @typedef {import("./route-edit.js").EditRoute} EditRoute */

export class MmjRouteEditor extends HTMLElement {
  static observedAttributes = ["from", "to"];

  /** @type {any} */
  map = null;
  /** @type {any} 親の `<mmj-map>`（connectedCallback で捕まえる。`mmj-route.js` と同じ理由） */
  owner = null;
  /** @type {EditRoute} */
  route = emptyRoute();
  /** @type {EditRoute[]} */
  history = [];
  /** @type {"line" | "step"} */
  mode = "line";
  /** @type {any[]} */
  markers = [];
  /** @type {ReturnType<typeof buildPanel> | null} */
  panel = null;
  /** @type {any} */
  control = null;
  sourceId = "";
  /** 地図ができる前に `value` で入れた経路（`#start` が属性より先に使う） @type {EditRoute | null} */
  pending = null;
  /** 一度でも読み終えたか。**付け直したときに、編集中の経路を属性で上書きしない** */
  loaded = false;
  /** @type {((event: any) => void) | null} */
  onMapClick = null;

  /** 保存する GeoJSON（`<mmj-route>` が読む形） */
  get value() {
    return toGeoJSON(this.route, this.#stepKey());
  }

  /** 外から経路を入れ直す（GeoJSON か、その文字）。「1 つ戻す」の履歴は消える */
  set value(input) {
    this.history = [];
    const route = this.#withNames(fromGeoJSON(input, this.#stepKey()));
    // **地図ができる前に入れた値も捨てない。**捨てると、属性の経路（か空）で開いてしまう
    if (this.map === null || this.panel === null) this.pending = route;
    this.#replace(route, "set");
  }

  connectedCallback() {
    const parent = this.closest("mmj-map");
    if (!parent) return void console.error("[mmj-route-editor] <mmj-map> の中に置いてください");
    this.owner = parent;
    const map = /** @type {any} */ (parent).map;
    if (map) return void this.#attach(map);
    parent.addEventListener(
      "mmj-ready",
      (/** @type {any} */ event) => {
        // **待っている間に外されたら付けない**（付けた層と帯を、誰も片付けなくなる）。
        // 親が描くときに外した子は付ける（`mmj-marker.js` と同じ）
        if (this.isConnected || /** @type {any} */ (this).mmjAdopted === true) this.#attach(event.detail.map);
      },
      { once: true },
    );
  }

  disconnectedCallback() {
    for (const marker of this.markers) marker.remove();
    this.markers = [];
    const map = this.map;
    this.map = null;
    if (!map) return;
    if (this.onMapClick) map.off("click", this.onMapClick);
    if (this.control) map.removeControl(this.control);
    this.control = null;
    for (const id of [`${this.sourceId}-line`, `${this.sourceId}-casing`]) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(this.sourceId)) map.removeSource(this.sourceId);
    map.getCanvas().style.cursor = "";
  }

  /** @param {string} name */
  attributeChangedCallback(name) {
    if (this.map === null || (name !== "from" && name !== "to")) return;
    // 名札は属性が持つ。「1 つ戻す」の履歴には積まない（戻すと属性と食い違う）
    this.#replace(this.#withNames(this.route), "names");
  }

  /** 1 つ戻す。戻せたら `true` */
  undo() {
    const previous = this.history.at(-1);
    if (previous === undefined) return false;
    this.history = this.history.slice(0, -1);
    this.#replace(this.#withNames(previous), "undo");
    return true;
  }

  /** 線も案内も消す（名札の名前は残す）。戻せる */
  clear() {
    this.#commit(this.#withNames(emptyRoute()), "clear");
  }

  /** @param {any} map */
  #attach(map) {
    this.map = map;
    if (map.isStyleLoaded()) void this.#start(map);
    else map.once("load", () => void this.#start(map));
  }

  /** @param {any} map */
  async #start(map) {
    const initial = this.pending ?? (this.loaded ? this.route : await this.#readInitial());
    this.pending = null;
    if (this.map !== map) return; // 読んでいる間に外された（足したものを誰も消さなくなる）
    ensureEditorStyle();
    const colors = popupColorsFrom(this.owner);
    const color = this.#color();
    const container = map.getContainer();
    container.style.setProperty("--mmj-re-accent", color);
    container.style.setProperty("--mmj-re-ground", colors.background);
    container.style.setProperty("--mmj-re-ink", colors.text);

    this.sourceId = this.getAttribute("layer-id") || `mmj-route-editor-${++serial}`;
    map.addSource(this.sourceId, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    const width = ROUTE_DEFAULTS.width;
    const layout = { "line-cap": "round", "line-join": "round" };
    // 縁取りが先、本体が後（`route.js` と同じ。逆だと本体が隠れる）
    map.addLayer({
      id: `${this.sourceId}-casing`,
      type: "line",
      source: this.sourceId,
      layout,
      paint: { "line-color": colors.background, "line-width": width + ROUTE_DEFAULTS.casingExtra },
    });
    map.addLayer({ id: `${this.sourceId}-line`, type: "line", source: this.sourceId, layout, paint: { "line-color": color, "line-width": width } });

    this.panel = buildPanel({
      onMode: (mode) => this.#setMode(mode),
      onCenter: () => this.#place(map.getCenter()),
      onUndo: () => this.undo(),
      onClear: () => this.clear(),
    });
    const panel = this.panel.element;
    this.control = { onAdd: () => panel, onRemove: () => panel.remove() };
    map.addControl(this.control, this.getAttribute("controls") || "top-left");

    this.onMapClick = (/** @type {any} */ event) => {
      const target = /** @type {Element | null} */ (event.originalEvent?.target ?? null);
      if (target?.closest?.(NOT_THE_MAP)) return;
      this.#place(event.lngLat);
    };
    map.on("click", this.onMapClick);

    this.route = this.#withNames(initial);
    this.loaded = true;
    this.#setMode("line");
    this.#render(null);
    this.#fit(map);
    this.style.display = "none"; // 部品は地図の上に出る。要素そのものは場所を取らない
    this.#announce("load");
  }

  /** 最初の経路。`value`（文字）が先、無ければ `src` を読む。**読めなければ空から始める** */
  async #readInitial() {
    const key = this.#stepKey();
    const text = this.getAttribute("value");
    if (text !== null && text.trim() !== "") return fromGeoJSON(text, key);
    const src = this.getAttribute("src");
    if (!src) return emptyRoute();
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`経路を取得できません: ${src} -> HTTP ${response.status}`);
      return fromGeoJSON(await response.json(), key);
    } catch (error) {
      // 握り潰さない。**空から引けるようにはしておく**（管理画面を止めない）
      console.error("[mmj-route-editor]", error);
      return emptyRoute();
    }
  }

  /** @param {any} map */
  #fit(map) {
    if (!this.hasAttribute("fit")) return;
    const bounds = routeBounds(this.value);
    if (bounds !== null) map.fitBounds(bounds, { padding: FIT_PADDING, maxZoom: 18, duration: 0 });
  }

  /** @param {"line" | "step"} mode */
  #setMode(mode) {
    this.mode = mode;
    this.panel?.setMode(mode);
    if (!this.map) return;
    this.map.getCanvas().style.cursor = "crosshair";
    // **案内を置くときは、線の点を押しても点の小窓を開かない。**案内は曲がり角＝線の点の上に
    // 置くことが多く、押すたびに「この点を消す」が開いて置けなかった（2026-11-25・手元で押して見つけた）
    this.map.getContainer().classList.toggle("mmj-re-step-mode", mode === "step");
  }

  /** @param {{ lng: number, lat: number }} lngLat */
  #place(lngLat) {
    // **経度を -180〜180 へ戻す。**地図を横へ回した先（世界の写し）を押すと、181 度のような値が来る
    const wrapped = typeof (/** @type {any} */ (lngLat).wrap) === "function" ? /** @type {any} */ (lngLat).wrap() : lngLat;
    const at = /** @type {[number, number]} */ ([wrapped.lng, wrapped.lat]);
    if (this.mode === "line") return void this.#commit(addVertex(this.route, at), "line");
    const before = this.route.steps.length;
    this.#commit(addStep(this.route, this.#snapToVertex(at)), "step");
    // **置いたらすぐ書ける**ように、新しい点の欄を開いて焦点を移す（置けなかったら、前の点の欄を開かない）
    if (this.route.steps.length > before) this.#openStep(this.route.steps.length - 1);
  }

  /**
   * 線の点のすぐそばを押したら、その点の上に置く。**角から数 m ずれた案内**にしない。
   * @param {[number, number]} at
   * @returns {[number, number]}
   */
  #snapToVertex(at) {
    const map = this.map;
    const pressed = map.project(at);
    const near = this.route.line.find((point) => {
      const p = map.project(point);
      return Math.hypot(p.x - pressed.x, p.y - pressed.y) <= SNAP_PX;
    });
    return near ?? at;
  }

  /** @param {EditRoute} route */
  #withNames(route) {
    return { ...route, from: this.getAttribute("from") ?? route.from, to: this.getAttribute("to") ?? route.to };
  }

  /** 変えた経路を受け取る。**同じなら何もしない**（履歴も出来事も増やさない） @param {EditRoute} next @param {string} reason */
  #commit(next, reason) {
    // 中身が同じなら何もしない（同じ所へ動かした・空のまま全部消した）
    if (next === this.route || JSON.stringify(next) === JSON.stringify(this.route)) return;
    this.history = [...this.history, this.route].slice(-HISTORY_LIMIT);
    this.#replace(next, reason);
  }

  /** @param {EditRoute} next @param {string} reason */
  #replace(next, reason) {
    const focused = this.#focusedMarker();
    this.route = next;
    if (this.map === null) return;
    this.#render(focused);
    this.#announce(reason);
  }

  /** いま焦点のある点（描き直したあと、同じ点へ焦点を戻すため） */
  #focusedMarker() {
    const index = this.markers.findIndex((marker) => marker.getElement().contains(document.activeElement));
    return index === -1 ? null : this.markers[index].mmjKey;
  }

  /** @param {string | null} focusKey */
  #render(focusKey) {
    const map = this.map;
    if (!map) return;
    map.getSource(this.sourceId)?.setData(this.value);
    for (const marker of this.markers) marker.remove();
    this.markers = [
      ...this.route.line.map((_, index) => this.#vertexMarker(map, index)),
      ...this.route.steps.map((_, index) => this.#stepMarker(map, index)),
    ];
    const again = this.markers.find((marker) => marker.mmjKey === focusKey);
    again?.getElement().focus();
    this.#status();
  }

  /** 帯の「線の点 3・案内 1・徒歩 5 分・400m」と、地図に出ないものの注意 */
  #status() {
    const walk = walkSummary(this.value, readSpeed(this.getAttribute("walk-speed")));
    const parts = [`線の点 ${this.route.line.length}`, `案内 ${this.route.steps.length}`];
    if (walk.meters > 0) parts.push(formatWalk(walk));
    this.panel?.setStatus(
      parts.join("・"),
      editIssues(this.route).map((issue) => issue.message),
      { canUndo: this.history.length > 0, empty: this.route.line.length === 0 && this.route.steps.length === 0 },
    );
  }

  /** @param {any} map @param {number} index */
  #vertexMarker(map, index) {
    const maplibregl = /** @type {any} */ (window).maplibregl;
    const last = this.route.line.length - 1;
    const role = index === 0 ? "start" : index === last ? "end" : "middle";
    const name = role === "start" ? "出発の点" : role === "end" ? "到着の点" : `線の点 ${index + 1}`;
    const element = vertexElement(role, `${name}。矢印キーで動かす・Delete で消す`);
    const marker = new maplibregl.Marker({ element, draggable: true }).setLngLat(this.route.line[index]);
    marker.mmjKey = `v${index}`;
    marker.on("dragend", () => this.#commit(moveVertex(this.route, index, lngLatOf(marker)), "move"));
    const popup = new maplibregl.Popup(buildPopupOptions(ensurePopupContrast(popupColorsFrom(this.owner))));
    popup.setDOMContent(vertexMenu(() => this.#commit(removeVertex(this.route, index), "remove")));
    marker.setPopup(popup);
    this.#keyboard(marker, map, () => this.#commit(moveVertex(this.route, index, lngLatOf(marker)), "move"), () =>
      this.#commit(removeVertex(this.route, index), "remove"),
    );
    return marker.addTo(map);
  }

  /** @param {any} map @param {number} index */
  #stepMarker(map, index) {
    const maplibregl = /** @type {any} */ (window).maplibregl;
    const step = /** @type {import("./route-edit.js").EditStep} */ (this.route.steps[index]);
    const marker = new maplibregl.Marker({ color: this.#color(), draggable: true }).setLngLat(step.lngLat);
    marker.mmjKey = `s${index}`;
    const element = marker.getElement();
    element.tabIndex = 0;
    element.setAttribute("aria-label", stepLabel(index, step.instruction));
    marker.on("dragend", () => this.#commit(moveStep(this.route, index, lngLatOf(marker)), "move"));
    const { form, focus } = stepForm(step, {
      onChange: (change) => {
        // **点を描き直さない。**欄を離れた先（写真の欄）を押した瞬間に吹き出しが作り直されると、
        // 押した欄から焦点が外れて、続きが打てない。数と注意だけ書き直す
        const next = updateStep(this.route, index, change);
        if (next === this.route || JSON.stringify(next) === JSON.stringify(this.route)) return;
        this.history = [...this.history, this.route].slice(-HISTORY_LIMIT);
        this.route = next;
        element.setAttribute("aria-label", stepLabel(index, next.steps[index]?.instruction ?? ""));
        this.#status();
        this.#announce("words");
      },
      onRemove: () => this.#commit(removeStep(this.route, index), "remove"),
    });
    const popup = new maplibregl.Popup({ ...buildPopupOptions(ensurePopupContrast(popupColorsFrom(this.owner))), focusAfterOpen: false });
    popup.setDOMContent(form);
    popup.on("open", () => {
      focus();
      keepPopupInside(map, popup);
    });
    // 写真が入って欄が伸びたら、向きを選び直し、はみ出したぶん地図を送る
    form.addEventListener(RESIZE_EVENT, () => {
      keepPopupInside(map, popup);
    });
    marker.setPopup(popup);
    this.#keyboard(marker, map, () => this.#commit(moveStep(this.route, index, lngLatOf(marker)), "move"), () =>
      this.#commit(removeStep(this.route, index), "remove"),
    );
    return marker.addTo(map);
  }

  /** 案内の欄を開く @param {number} index */
  #openStep(index) {
    const marker = this.markers.find((m) => m.mmjKey === `s${index}`);
    if (marker && !marker.getPopup()?.isOpen()) marker.togglePopup();
  }

  /**
   * 点をキーボードで動かす・消す。**押している間は動かすだけ、離したときに 1 回渡す**
   * （`mmj-marker.js` と同じ。押しっぱなしで履歴を何十も積まない）。
   * @param {any} marker @param {any} map @param {() => void} onMoved @param {() => void} onRemove
   */
  #keyboard(marker, map, onMoved, onRemove) {
    const element = marker.getElement();
    element.addEventListener("keydown", (/** @type {KeyboardEvent} */ event) => {
      if (event.target !== element) return; // 吹き出しの欄で打った矢印・Delete を奪わない
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        return void onRemove();
      }
      const step = arrowStep(event.key, event.shiftKey);
      if (step === null) return;
      event.preventDefault();
      event.stopPropagation(); // 地図を送らない
      const at = map.project(marker.getLngLat());
      marker.setLngLat(map.unproject([at.x + step[0], at.y + step[1]]));
    });
    element.addEventListener("keyup", (/** @type {KeyboardEvent} */ event) => {
      if (event.target === element && arrowStep(event.key, false) !== null) onMoved();
    });
  }

  /**
   * 変わったことを知らせる。**2 か所へ出す**——親の `<mmj-map>` は描画時に子を DOM から外すので、
   * この要素から出した出来事は `document` まで上がらない（`mmj-marker.js` と同じ穴）。
   * @param {string} reason
   */
  #announce(reason) {
    const geojson = this.value;
    const walk = walkSummary(geojson, readSpeed(this.getAttribute("walk-speed")));
    const detail = {
      geojson,
      text: JSON.stringify(geojson),
      meters: walk.meters,
      minutes: walk.minutes,
      points: this.route.line.length,
      steps: this.route.steps.length,
      issues: editIssues(this.route),
      reason,
    };
    this.dispatchEvent(new CustomEvent("mmj-route-change", { bubbles: true, detail }));
    if (this.owner && this.owner !== this && !this.owner.contains(this)) {
      this.owner.dispatchEvent(new CustomEvent("mmj-route-change", { bubbles: true, detail }));
    }
  }

  #stepKey() {
    return this.getAttribute("step-key") ?? ROUTE_DEFAULTS.stepKey;
  }

  #color() {
    return this.getAttribute("color") ?? this.owner?.accent ?? ROUTE_DEFAULTS.color;
  }
}

/** 案内の点の読み上げ @param {number} index @param {string} instruction */
function stepLabel(index, instruction) {
  const words = instruction.trim() === "" ? "（ひとこと未入力）" : `「${instruction}」`;
  return `案内 ${index + 1}${words}。Enter で書く・矢印キーで動かす・Delete で消す`;
}

/** @param {any} marker @returns {[number, number]} */
function lngLatOf(marker) {
  const at = marker.getLngLat();
  return [at.lng, at.lat];
}

/** @param {string | null} value */
function readSpeed(value) {
  const parsed = Number(value);
  return value !== null && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
