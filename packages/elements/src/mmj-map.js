/**
 * `<mmj-map>` — HTML だけで地図を 1 枚出す。
 *
 * ```html
 * <mmj-map tiles="https://t.example.com/japan.pmtiles" style-url="/styles/modern-dark.json"
 *          center="135.5023,34.6937" zoom="12" hash>
 *   <mmj-marker lnglat="135.4959,34.7024" popup="梅田"></mmj-marker>
 * </mmj-map>
 * ```
 *
 * サイトのテーマカラーを当てるときは `accent`（1 色）か `palette-url`（役割ごと）。
 *
 * ```html
 * <mmj-map tiles="..." style-url="/styles/modern-light.json" accent="#0A5FFF"></mmj-map>
 * ```
 *
 * **素の MapLibre より薄くならないなら、この部品は要らない**（PRD §3）。
 * ここが引き受けているのは 6 つ。
 *   1. pmtiles プロトコルの登録
 *   2. スタイルの取得と `__TILES_URL__` の差し替え
 *   3. 帰属表示と CJK フォントの既定（忘れると ODbL 違反 / 字が出ない）
 *   4. **失敗したときに白い地図を出さず、理由を画面へ出す**
 *   5. 子要素（marker）への map と配色の受け渡し
 *   6. **導入者の色をスタイルへ当てる**（色はここで作らない・`palette.js`）
 *
 * maplibre-gl と pmtiles は、**読み込む側が `<script>` で入れる**（ゼロ構築の方針）。
 */
import { applyTilesUrl, buildMapOptions, parseLngLat, parsePitch, parseZoom, hashOverridesPitch } from "./attrs.js";
import { addExtrusion } from "./extrude.js";
import { accentPalette, applyPalette, readDeclaredAccent, readTheme } from "./palette.js";

/** pmtiles プロトコルは 1 回だけ登録する（2 度目は MapLibre が投げる） */
let protocolRegistered = false;

export class MmjMap extends HTMLElement {
  /** @type {any} */
  map = null;

  /**
   * 読み込んだスタイルから読んだ色。子要素がここから借りる。
   * **部品が色を持たないようにするため**（baseline §11）。
   * @type {ReturnType<typeof readTheme> | null}
   */
  theme = null;

  /**
   * 導入者が渡したテーマカラー（`accent` 属性、または palette の `highway`）。
   * **渡されていなければ null。**子要素はここが null のとき自分の既定を使う。
   * @type {string | null}
   */
  accent = null;

  connectedCallback() {
    this.#render().catch((error) => this.#fail(error));
  }

  disconnectedCallback() {
    this.map?.remove();
    this.map = null;
  }

  async #render() {
    const maplibregl = /** @type {any} */ (window).maplibregl;
    const pmtiles = /** @type {any} */ (window).pmtiles;
    if (!maplibregl || !pmtiles) {
      throw new Error("maplibre-gl と pmtiles を先に読み込んでください（<script> で入れます）");
    }

    const tilesUrl = this.getAttribute("tiles");
    const styleUrl = this.getAttribute("style-url");
    if (!tilesUrl || !styleUrl) {
      throw new Error("tiles と style-url の両方が要ります（配信先が無い地図は白くなります）");
    }

    if (!protocolRegistered) {
      maplibregl.addProtocol("pmtiles", new pmtiles.Protocol().tile);
      protocolRegistered = true;
    }

    const response = await fetch(styleUrl);
    if (!response.ok) throw new Error(`スタイルを取得できません: ${styleUrl} -> HTTP ${response.status}`);

    const applied = applyTilesUrl(await response.text(), tilesUrl);
    if (applied.replaced === 0) {
      // 黙って進めると、配信先を指していない地図が白く出る
      throw new Error(`スタイルに __TILES_URL__ がありません: ${styleUrl}`);
    }

    const container = document.createElement("div");
    container.style.cssText = "position:absolute;inset:0;";
    if (getComputedStyle(this).position === "static") this.style.position = "relative";
    this.style.display = "block";
    this.replaceChildren(container);

    // `3d` を付けると建物を押し出す。**タイルは同じもの**で、足すデータも取得も無い
    // （実測: 梅田 z16 で 17 リクエスト / 735,015 バイト。2D と 1 バイトも変わらない）。
    // 手書きスタイルは書き換えず、読み込んだ後のオブジェクトへ 1 枚足すだけ。
    const wants3d = this.hasAttribute("3d");
    const style = await this.#recolor(JSON.parse(applied.text));

    // 子要素（目印・まとまり・自前 POI・ポップアップ）が借りる色。
    // **部品が色を持たないようにするため**、読み込んだスタイルから読む。
    // `map` を入れる前に用意する（子は `map` が入った瞬間に付きに来る）。
    this.theme = readTheme(style);
    // 生成されたスタイルは自分の指し値を持っている。**属性が無いときはそこから拾う**
    // （手書きの 6 枚には無いので null のまま＝子要素は自分の既定を使う）
    this.accent ??= readDeclaredAccent(style);

    this.map = new maplibregl.Map(
      buildMapOptions({
        container,
        style: wants3d ? addExtrusion(style) : style,
        center: parseLngLat(this.getAttribute("center")) ?? [135.5023, 34.6937],
        zoom: parseZoom(this.getAttribute("zoom"), 12),
        hash: this.hasAttribute("hash"),
        // 押し出しは傾けて初めて見える。`3d` なのに真上から見た絵にならないよう、
        // pitch の指定が無いときだけ既定で倒す。**角度は仮置き**（DESIGN.md に規定が無い）
        pitch: parsePitch(this.getAttribute("pitch"), wants3d ? 45 : 0),
        // 1 ページに何枚も置くときに付ける。**指でページを送れなくなるのを防ぐ**
        cooperative: this.hasAttribute("cooperative"),
      }),
    );

    // **`hash` は pitch を奪う。**MapLibre の hash は `#zoom/lat/lng/bearing/pitch` で、
    // 3 要素しか書かれていない URL を開くと bearing と pitch が 0 に戻る。
    // その結果、**3D のページを URL で渡すと渡された側では建物が平らになる**
    // （実測・2026-09-20）。hash が pitch を持っていないときだけ当て直す。
    // **持っているときは触らない。**利用者が URL で指定した角度を奪わないため。
    const pitch = parsePitch(this.getAttribute("pitch"), wants3d ? 45 : 0);
    if (pitch > 0 && this.hasAttribute("hash") && !hashOverridesPitch(location.hash)) {
      this.map.setPitch(pitch);
    }

    this.map.addControl(new maplibregl.NavigationControl(), "top-right");
    this.map.addControl(new maplibregl.ScaleControl({ unit: "metric" }));
    // 握り潰さない（§8）。グリフが 1 範囲でも 404 になると地図全体が白くなる
    this.map.on("error", (/** @type {any} */ event) => console.error("[mmj-map]", event?.error ?? event));

    this.dispatchEvent(new CustomEvent("mmj-ready", { detail: { map: this.map } }));
  }

  /**
   * サイトのテーマカラーをスタイルへ当てる。**色はここで作らない。**
   *
   *   <mmj-map accent="#0A5FFF">             1 色だけ渡す（高速道路・駅・点に当たる）
   *   <mmj-map palette-url="./brand.json">   役割ごとに全部指定する
   *
   * 両方あるときは `palette-url` が勝つ（細かく書いたほうを優先する）。
   * **1 つも当たらなかったら投げる。**渡した色が効いていない地図を黙って出すと、
   * 「指定したのに変わらない」という気づきにくい壊れ方になる。
   *
   * @param {any} style
   * @returns {Promise<any>} 当てたあとのスタイル（**元は書き換えない**）
   */
  async #recolor(style) {
    const attribute = this.getAttribute("accent");
    const paletteUrl = this.getAttribute("palette-url");
    if (!attribute && !paletteUrl) return style;

    let colors = attribute ? accentPalette(attribute) : {};
    if (paletteUrl) {
      const response = await fetch(paletteUrl);
      if (!response.ok) {
        throw new Error(`配色を取得できません: ${paletteUrl} -> HTTP ${response.status}`);
      }
      colors = { ...colors, ...(await response.json()) };
    }

    // **渡された色だけを覚える。**スタイルが元から持っている高速道路の色を
    // ここへ入れると、**テーマカラーを渡していない地図の目印まで灰色になる**
    // （modern-dark の highway は `#4E5863`。実際に梅田の目印が灰色になった）。
    this.accent = attribute ?? colors["highway"] ?? null;

    const result = applyPalette(style, colors);
    if (result.applied === 0) {
      throw new Error(
        `渡した色がどのレイヤにも当たりませんでした（役割: ${Object.keys(colors).join(", ")}）。` +
          "スタイルのレイヤ id が MMJ の 6 枚と違う可能性があります",
      );
    }
    return result.style;
  }

  /** @param {unknown} error */
  #fail(error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[mmj-map]", error);
    // **白い地図を出さない。**無いものを、あるように見せない
    const box = document.createElement("div");
    box.setAttribute("role", "alert");
    box.style.cssText = "padding:1rem;background:#2a1d1d;color:#f3d6d6;font:14px/1.7 system-ui;";
    box.textContent = `地図を出せません: ${message}`;
    this.replaceChildren(box);
    this.dispatchEvent(new CustomEvent("mmj-error", { detail: { message } }));
  }
}
