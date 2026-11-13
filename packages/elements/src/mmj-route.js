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
 * ここがやるのは次のことだけ。
 *   1. 線を縁取り付きで描く
 *   2. `instruction` を持つ点に、押すと開く吹き出しを置く（**写真も載る**）
 *   3. `fit` があれば経路ぜんぶが入るところまで寄せる
 *   4. 外れるときに、足したものを片付ける
 *
 * **線しか無くても、歩く人に要るものを出せる**（属性を書いたときだけ・0.9.0）。
 * 判断は全部 `walk.js`（純粋関数）にある。
 *   - `steps`     … 線の折れ角から「左へ（その先 120m）」を置く
 *   - `landmarks` … その角のそばの店（ベース地図にもう入っているもの）を案内に入れる
 *   - `ends`      … 出発と到着に名札を出す（名前は線の `from` / `to`）
 *   - `summary`   … 「徒歩 5 分・400m」を地図の隅に出す（`walk-speed` で 1 分の距離を変えられる）
 *
 * **後から足せる。**案内の点だけ増やした GeoJSON を渡せば、そのぶんだけ増える。
 */
import { buildPopupOptions } from "./attrs.js";
import { buildPopupContent } from "./popup.js";
import { ensurePopupContrast, popupColorsFrom, renderPopup } from "./popup-dom.js";
import { pinPath } from "./pin.js";
import { ROUTE_DEFAULTS, buildRouteSpec, extractSteps, routeBounds, stepPinSpec } from "./route.js";
import { formatWalk, routeEnds, turnSteps, walkSummary } from "./walk.js";

/** 同じページに複数置ける。source 名が衝突すると後勝ちで消えるため、番号で分ける */
let serial = 0;

/** 寄せたときに端が画面の縁へ貼り付かないよう、少し余白を取る */
const FIT_PADDING = 48;

/** 名札（出発・到着）が地点の上に立つ高さ（px）。札 1 段 ＋ 尖り ＋ 隅の部品 1 段ぶん */
const END_TAG_ROOM = 48;

/** 目印のためにタイルの読み込みを待つ上限（ms）。過ぎたら、読めている店だけで案内を出す */
const LANDMARK_WAIT_MS = 3000;

export class MmjRoute extends HTMLElement {
  /** @type {any} */
  map = null;
  /** @type {{ sourceId: string, source: any, layers: any[] } | null} */
  spec = null;
  /** @type {any[]} 曲がる地点に置いた目印 */
  markers = [];
  /** @type {any} 「徒歩 5 分・400m」の札（地図の隅の部品） */
  summaryControl = null;

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
    if (this.map && this.summaryControl) this.map.removeControl(this.summaryControl);
    this.summaryControl = null;
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
      // **待っている間に外されていたら、何も足さない。**外したときの片付けはもう済んでいて、
      // ここで足したものは誰も消さない（2026-11-13 のレビュー）
      if (this.map !== map) return;

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

      const key = this.getAttribute("step-key") ?? ROUTE_DEFAULTS.stepKey;
      this.#placeSteps(map, extractSteps(data, key), accent);

      if (this.hasAttribute("fit")) {
        const bounds = routeBounds(data);
        // **範囲が読めないときは動かさない。**[0,0] へ寄せるとアフリカ沖へ飛ぶ
        // **名札を出すなら、上を札の高さぶん空ける。**札は地点の上に立つので、
        // 同じ余白だと出発の札が地図の縁と隅の部品に潜る（2026-11-13・手元で撮って見つけた）
        const top = this.hasAttribute("ends") ? FIT_PADDING + END_TAG_ROOM : FIT_PADDING;
        if (bounds !== null) {
          map.fitBounds(bounds, {
            padding: { top, bottom: FIT_PADDING, left: FIT_PADDING, right: FIT_PADDING },
            duration: 0,
          });
        }
      }

      const walk = walkSummary(data, readWidth(this.getAttribute("walk-speed")));
      // **線が読めなければ出さない。**作った「徒歩 1 分・10m」を見せない
      if (this.hasAttribute("summary") && walk.meters > 0) this.#showSummary(map, walk);
      const autoSteps = this.hasAttribute("steps") ? await this.#autoSteps(map, data, key) : [];
      if (this.map !== map) return; // 目印を待つ間に外された（上と同じ理由）
      this.#placeSteps(map, autoSteps, accent);
      // **案内の数は、両端の札を置く前に数える。**札まで数えると「案内 3 件」に化ける
      const steps = this.markers.length;
      if (this.hasAttribute("ends")) this.#placeEnds(map, data, accent, walk);

      this.style.display = "none"; // 経路は地図の上に出る。要素そのものは場所を取らない
      this.dispatchEvent(
        new CustomEvent("mmj-route-ready", {
          bubbles: true,
          // **目印の数も返す。**0 件でも案内は出るので、数を見ないと効いていないことに気づけない
          detail: {
            steps,
            landmarks: autoSteps.filter((step) => step.landmark !== null).length,
            meters: walk.meters,
            minutes: walk.minutes,
          },
        }),
      );
    } catch (error) {
      // 握り潰さない（§8）。ここで黙ると、経路が出ない理由が画面にもログにも残らない
      console.error("[mmj-route]", error);
    }
  }

  /**
   * 線の折れから案内を作る。`landmarks` があれば、角のそばの店の名前を入れる。
   *
   * **目印はベース地図から拾う（データを持たない）。**拾えるのは読み込み済みのタイルだけなので、
   * 寄せたあと地図が落ち着く（`idle`）のを待ってから読む。待たないと、目印がほとんど空になる。
   *
   * @param {any} map @param {any} data @param {string} key
   */
  async #autoSteps(map, data, key) {
    if (!this.hasAttribute("landmarks")) return turnSteps(data, { stepKey: key });
    // **待つのは決まった時間まで。**裏のタブでは描画が止まり、`idle` が来ない。
    // 来ないまま待つと、案内も名札も出ず、`mmj-route-ready` も飛ばない。
    // 時間が来たら、そのとき読めている店だけで案内を出す（目印が無くても案内は出る）
    await new Promise((resolve) => {
      if (map.loaded() && !map.isMoving()) return void resolve(undefined);
      const done = () => {
        clearTimeout(timer);
        map.off("idle", done);
        resolve(undefined);
      };
      const timer = setTimeout(done, LANDMARK_WAIT_MS);
      map.once("idle", done);
    });
    return turnSteps(data, { stepKey: key, landmarks: basemapLandmarks(map, this.getAttribute("landmarks")) });
  }

  /**
   * 出発と到着に名札を出す。**押さなくても名前が見える**（「A2 出口」は探すための手がかり）。
   * 色は吹き出しと同じ求め方で、地図の配色から借りる（新しい色を作らない）。
   *
   * @param {any} map @param {any} data @param {string | null | undefined} accent
   * @param {{ meters: number, minutes: number }} walk
   */
  #placeEnds(map, data, accent, walk) {
    const ends = routeEnds(data);
    if (ends === null) return;
    const maplibregl = /** @type {any} */ (window).maplibregl;
    const colors = popupColorsFrom(this.owner);
    const edge = this.getAttribute("color") ?? accent ?? ROUTE_DEFAULTS.color;
    const places = [
      { ...ends.start, role: "出発", detail: "" },
      { ...ends.end, role: "到着", detail: walk.meters > 0 ? formatWalk(walk) : "" },
    ];
    for (const place of places) {
      const tag = endTag(place.label, place.role, place.detail, colors, edge);
      const marker = new maplibregl.Marker({ element: tag, anchor: "bottom" }).setLngLat(place.lngLat).addTo(map);
      this.markers.push(marker);
    }
  }

  /**
   * 「徒歩 5 分・400m」を地図の隅に出す。**地図の部品（control）として置く**ので、
   * 帰属表示や縮尺と同じく配色に合わせて塗られ、ほかの部品と重ならない。
   *
   * @param {any} map @param {{ meters: number, minutes: number }} walk
   */
  #showSummary(map, walk) {
    const box = document.createElement("div");
    box.className = "maplibregl-ctrl maplibregl-ctrl-group mmj-route-summary";
    box.textContent = formatWalk(walk);
    box.setAttribute("role", "status");
    Object.assign(box.style, { padding: "4px 10px", fontSize: "13px", fontWeight: "600", lineHeight: "1.6" });
    this.summaryControl = { onAdd: () => box, onRemove: () => box.remove() };
    map.addControl(this.summaryControl, this.getAttribute("summary") || "top-left");
  }

  /**
   * 曲がる地点に吹き出しを置く。
   * @param {any} map
   * @param {{ lngLat: [number, number], text: string, image: string | null }[]} steps
   * @param {string | null | undefined} accent
   */
  #placeSteps(map, steps, accent) {
    const maplibregl = /** @type {any} */ (window).maplibregl;
    const className = ensurePopupContrast(popupColorsFrom(this.owner));
    const color = this.getAttribute("step-color") ?? accent ?? undefined;

    for (const step of steps) {
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
  const { width, height, radius, color, casing } = spec;
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
  // **形は `pin.js` が持つ。**お店の点（canvas）でも同じ文字列を使う
  shape.setAttribute("d", pinPath(spec));
  shape.setAttribute("fill", color);
  shape.setAttribute("stroke", casing);
  shape.setAttribute("stroke-width", "1.5");
  shape.setAttribute("stroke-linejoin", "round");

  svg.append(defs, shape, image);
  return svg;
}

/**
 * ベース地図の `pois` から、目印の候補を読む。**データは持たず、タイルにあるものを借りる。**
 *
 * source 名は既定で `basemap`（`styles/*.json` の名前）。自前のスタイルなら `landmarks="名前"`。
 * **読めないときは空で返し、理由をログに残す**（目印が出ないだけで、案内そのものは出す）。
 *
 * @param {any} map @param {string | null} sourceName
 * @returns {{ name: string, kind: string, lngLat: [number, number] }[]}
 */
function basemapLandmarks(map, sourceName) {
  const source = sourceName && sourceName.trim() !== "" ? sourceName.trim() : "basemap";
  if (!map.getSource(source)) {
    console.warn(`[mmj-route] 目印を読む source「${source}」がありません（landmarks="source 名" で指定できます）`);
    return [];
  }
  return map
    .querySourceFeatures(source, { sourceLayer: "pois" })
    .filter((/** @type {any} */ f) => f?.geometry?.type === "Point")
    .map((/** @type {any} */ f) => ({
      // **地図に出ている名前と同じものを使う**（`label-poi` は name:ja → name の順）
      name: String(f.properties?.["name:ja"] ?? f.properties?.name ?? ""),
      kind: String(f.properties?.kind ?? ""),
      lngLat: /** @type {[number, number]} */ ([f.geometry.coordinates[0], f.geometry.coordinates[1]]),
    }));
}

/**
 * 出発・到着の名札。**下端の尖りがその地点**（`anchor: "bottom"`）。
 *
 * @param {string} label 「A2 出口」「ホテル月」
 * @param {string} role 「出発」「到着」（読み上げ用）
 * @param {string} detail 到着の札に添える「徒歩 5 分・400m」（無ければ空）
 * @param {{ background: string, text: string, border: string }} colors 吹き出しと同じ配色
 * @param {string} edge 縁の色（経路の線と同じ）
 */
function endTag(label, role, detail, colors, edge) {
  const tag = document.createElement("div");
  tag.className = "mmj-route-end";
  tag.setAttribute("role", "img");
  tag.setAttribute("aria-label", detail ? `${role}：${label}（${detail}）` : `${role}：${label}`);
  Object.assign(tag.style, {
    background: colors.background,
    color: colors.text,
    border: `2px solid ${edge}`,
    borderRadius: "999px",
    padding: "2px 10px",
    fontSize: "12px",
    fontWeight: "700",
    lineHeight: "1.5",
    boxShadow: "0 1px 3px rgba(0,0,0,.35)",
    position: "relative",
    marginBottom: "8px",
    // **幅を中身に合わせる。**指定しないと、札が地図の端まで伸びて帯になる
    // （2026-11-13・手元で撮って見つけた）
    width: "max-content",
  });
  // **長い名前は文字だけを切る。**札そのものに overflow を付けると、下の尖りまで切れる
  const text = document.createElement("span");
  Object.assign(text.style, {
    display: "block",
    whiteSpace: "nowrap",
    maxWidth: "14em",
    overflow: "hidden",
    textOverflow: "ellipsis",
  });
  text.textContent = label;
  tag.append(text);
  // 下の尖り。**名札が指している地点を、丸 1 つぶんぼかさない**
  const tail = document.createElement("span");
  Object.assign(tail.style, {
    position: "absolute",
    left: "50%",
    bottom: "-8px",
    transform: "translateX(-50%)",
    borderLeft: "6px solid transparent",
    borderRight: "6px solid transparent",
    borderTop: `7px solid ${edge}`,
  });
  tag.append(tail);
  return tag;
}

/** @param {number} center @param {number} radius */
function circleAt(center, radius) {
  const circle = document.createElementNS(SVG_NS, "circle");
  circle.setAttribute("cx", String(center));
  circle.setAttribute("cy", String(center));
  circle.setAttribute("r", String(radius));
  return circle;
}
