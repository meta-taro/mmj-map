/**
 * HTML の属性を、MapLibre へ渡す値へ直す。**ここは純粋関数。**
 *
 * DOM もブラウザも触らないので、テストに jsdom のような依存が要らない。
 * 実際に描けることは、ブラウザで撮って確かめる（`pnpm shot`）。
 */
import { isDarkColor } from "./palette.js";

const NONE = null;

/**
 * "経度,緯度" を読む。**GeoJSON と同じ並び**（lng, lat）。
 * 読めなければ null を返す。**勝手に [0,0] へ置かない**
 * （アフリカ沖の海に置かれた地図は、間違いだと気づきにくい）。
 * @param {string | null | undefined} value
 * @returns {[number, number] | null}
 */
export function parseLngLat(value) {
  if (typeof value !== "string") return NONE;
  const parts = value.split(",");
  if (parts.length !== 2) return NONE;

  const lng = toNumber(parts[0]);
  const lat = toNumber(parts[1]);
  if (lng === null || lat === null) return NONE;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return NONE;
  return [lng, lat];
}

/**
 * zoom を読む。読めなければ既定値。MapLibre の範囲（0〜24）へ収める。
 * @param {string | null | undefined} value
 * @param {number} fallback
 * @returns {number}
 */
export function parseZoom(value, fallback) {
  const parsed = typeof value === "string" ? toNumber(value) : null;
  if (parsed === null) return fallback;
  return Math.min(24, Math.max(0, parsed));
}

/**
 * 手書きスタイルの `__TILES_URL__` を配信先へ差し替える（D-002 / D-003）。
 * **組み立てているのは URL だけで、色ではない。**
 * @param {string} styleText
 * @param {string} tilesUrl
 * @returns {{ text: string, replaced: number }}
 */
export function applyTilesUrl(styleText, tilesUrl) {
  const replaced = styleText.split("__TILES_URL__").length - 1;
  return { text: styleText.replaceAll("__TILES_URL__", tilesUrl), replaced };
}

/**
 * 傾き（pitch）を読む。読めなければ既定値。MapLibre の範囲（0〜85）へ収める。
 *
 * **3D にしたのに真上から見た絵が出る**、という壊れ方を避けるために要る。
 * 押し出しは傾けて初めて見えるので、`3d` を付けたときは 0 のままにしない。
 * @param {string | null | undefined} value
 * @param {number} fallback
 * @returns {number}
 */
export function parsePitch(value, fallback) {
  const parsed = typeof value === "string" ? toNumber(value) : null;
  if (parsed === null) return fallback;
  return Math.min(85, Math.max(0, parsed));
}

/**
 * MapLibre の Map へ渡す設定。
 * **帰属表示と CJK の扱いを、呼ぶ側が忘れられない場所に置く**のがこの関数の役目。
 * @param {{ container: unknown, style: unknown, center: [number, number], zoom: number, hash: boolean, pitch?: number, cooperative?: boolean, ideographFonts?: string }} input
 */
export function buildMapOptions(input) {
  return {
    container: input.container,
    style: input.style,
    center: input.center,
    zoom: input.zoom,
    hash: input.hash,
    pitch: input.pitch ?? 0,
    // グリフに CJK が無いため、漢字かなは閲覧側のフォントで描く（decisions.md 未決）。
    // **既定は日本語向け。**中国語や韓国語の地図では字形が合わないので、
    // 置く側が `ideograph-fonts` で差し替えられる（同じ符号でも国ごとに字体が違う）。
    // **空文字では上書きしない。**空のフォント指定は字を消す
    localIdeographFontFamily:
      input.ideographFonts !== undefined && input.ideographFonts !== ""
        ? input.ideographFonts
        : "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', sans-serif",
    // 帰属表示は必須。**消せる形で渡さない**（LICENSES.md・ODbL）
    attributionControl: { compact: false },
    // 1 本指をページへ返し、2 本指だけを地図が取る。
    // **地図を縦に並べたページで、指でページを送れなくなるのを防ぐ。**
    // 既定は false。1 枚だけのページで 2 本指を要求すると、そちらが使いにくくなる。
    cooperativeGestures: input.cooperative === true,
  };
}

/**
 * 10 進数として読む。空文字や "12px" を数にしない。
 * @param {string | undefined} text
 * @returns {number | null}
 */
function toNumber(text) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/**
 * 目印のポップアップに渡す設定。
 *
 * **閉じるボタンを出さない。** MapLibre の既定は `closeButton: true` で、
 * `position: absolute; right: 0; top: 0` の × が箱の右上に乗る。
 * 「大阪城」のような短い文字だと箱が狭く、**× が文字に重なって潰れて見える**
 * （実測: docs/screenshots/2026-09-16-elements-popup.jpg の「謎の四角」がこれ）。
 *
 * **閉じる手段は奪っていない。**地図を押せば閉じる（`closeOnClick`）。
 * 目印をもう一度押しても閉じる。
 */
export function buildPopupOptions(className = DEFAULT_POPUP_CLASS) {
  return {
    offset: 24,
    className,
    closeButton: false,
    closeOnClick: true,
  };
}

/** 配色を渡さないときのクラス名。**既定の見た目を変えないため** */
const DEFAULT_POPUP_CLASS = "mmj-popup";

/**
 * ポップアップに使う色。**すべて `styles/modern-dark.json` に既にある値。**
 *
 * **新しい色を作っていない**（baseline §11）。見た目の方向性は人が決める領域で、
 * ここで足した色はそのまま既成事実になるため、スタイルの正本（D-002）から借りるだけにする。
 * **借りていることはテストで縛ってある**（スタイルに無い値を書いたら落ちる）。
 */
export const POPUP_COLORS = {
  /** 地図のパネル面と同じ（`background` / `station-dot` の circle-color） */
  background: "#1B1F24",
  /** 地名ラベルと同じ（`label-place-city` の text-color） */
  text: "#D8DCE1",
  /** 道路の線と同じ（`roads-minor` の line-color） */
  border: "#2E343B",
};

/** 配色を渡さないときのクラス名。**既定の見た目を変えないため** */
const DEFAULT_CONTROL_CLASS = "mmj-ctrl";

/**
 * 地図の部品（帰属表示・縮尺）を、読み込んだ配色に合わせる CSS。**ここは純粋関数**。
 *
 * MapLibre の既定は**白い箱**で、暗い地図の隅に紙が 2 枚浮いて見える。
 * 吹き出しは D-019 で直したが、**この 2 つは残っていた**
 * （2026-09-25・人が指摘。公開デモ 10 枚すべてで出ていた）。
 *
 * **帰属表示は消さない・薄くしない。**`© OpenStreetMap contributors` は ODbL の条件で
 * あって体裁ではない（`LICENSES.md`）。ここでやるのは
 * **「読める形で地図に馴染ませる」ところまで**で、`display:none` も `opacity` も書かない。
 * **テストで縛ってある**（書いたら落ちる）。
 *
 * 色は吹き出しと同じ 3 つを借りる。`background` には地色ではなく `surface`
 * （ラベルの縁取り色＝**地図に対して読めるために選ばれている色**）が渡ってくる。
 *
 * `className` を分けるのは吹き出しと同じ理由で、**1 ページに配色違いを並べたときに
 * 最初の 1 枚の色が全部へ効く**のを防ぐため（`themes.html` は 6 枚並ぶ）。
 *
 * @param {{ background: string, text: string, border: string }} [colors]
 * @param {string} [className]
 */
export function buildControlStyle(colors = POPUP_COLORS, className = DEFAULT_CONTROL_CLASS) {
  const plate =
    `background:${colors.background};` +
    `color:${colors.text};` +
    // 地色に近い面を置くので、**縁が無いと地図との境目が消える**
    `border:1px solid ${colors.border};` +
    "border-radius:3px;";

  // **黒い絵記号（＋ − 方位）は、暗い面の上では消える。**反転させる。
  // 明るい面で反転すると今度はそちらで消えるので、**面の明暗で決める**。
  const icons = isDarkColor(colors.background)
    ? `.${className} .maplibregl-ctrl-group button .maplibregl-ctrl-icon{filter:invert(1);}`
    : "";

  return (
    `.${className} .maplibregl-ctrl-attrib{${plate}}` +
    // **リンクの色も変える。**既定の青のままだと、暗い面で沈んで読めない。
    // 下線は消さない（リンクだと分かる手がかりを、色だけに頼らせないため）
    `.${className} .maplibregl-ctrl-attrib a{color:${colors.text};}` +
    `.${className} .maplibregl-ctrl-scale{${plate}}` +
    // 開閉ボタンの丸も白地で来る。**箱だけ直すと、ボタンだけ白く残る**
    `.${className} .maplibregl-ctrl-attrib-button{background-color:${colors.background};}` +
    // **箱は 3 つある。**帰属表示・縮尺・操作ボタン。2 つだけ直すと、
    // 残った 1 つが前より目立つ（実測: `themes.html` の Modern Dark と Neon で
    // 右上に白い列が残った・2026-09-25）。
    `.${className} .maplibregl-ctrl-group{${plate}}` +
    `.${className} .maplibregl-ctrl-group button{background:transparent;}` +
    // ボタン同士の仕切りも既定は薄い黒。暗い面では見えないので縁と同じ色にする
    `.${className} .maplibregl-ctrl-group button+button{border-top-color:${colors.border};}` +
    // 既定の hover は `rgba(0,0,0,.05)` で、**暗い面では押せることが分からない**
    `.${className} .maplibregl-ctrl-group button:hover{background:${colors.border};}` +
    icons
  );
}

/** tip（三角）が向きごとに塗る辺。**1 つでも漏らすと、その向きだけ白い三角が残る。** */
const TIP_SIDES = {
  top: "bottom",
  "top-left": "bottom",
  "top-right": "bottom",
  bottom: "top",
  "bottom-left": "top",
  "bottom-right": "top",
  left: "right",
  right: "left",
};

/**
 * ポップアップを暗い地図に合わせる CSS。**ここは純粋関数**（文字列を組むだけ）。
 *
 * MapLibre の既定は白地で、暗い地図の上に置くと紙が 1 枚浮いて見える。
 * **箱だけ暗くしても足りない。**三角（tip）は向きごとに別の辺を `#fff` で塗るので、
 * 8 方向すべてを上書きしないと、開く向きによって白い三角が残る。
 *
 * **色は読み込んだスタイルから借りる**（`palette.js` の `readTheme`）。
 * 以前は暗いスタイルの値を固定で持っていたため、配色が 6 枚になった時点で
 * **明るい地図の上でポップアップだけ暗い箱**になっていた（D-019）。
 *
 * `className` を分けるのは、1 ページに配色違いを並べたときに
 * **最初の 1 枚の色が全部へ効く**のを防ぐため（`themes.html` は 6 枚並ぶ）。
 *
 * @param {{ background: string, text: string, border: string }} [colors]
 * @param {string} [className]
 */
export function buildPopupStyle(colors = POPUP_COLORS, className = DEFAULT_POPUP_CLASS) {
  const tip = Object.entries(TIP_SIDES)
    .map(
      ([anchor, side]) =>
        `.${className}.maplibregl-popup-anchor-${anchor} .maplibregl-popup-tip{border-${side}-color:${colors.background};}`,
    )
    .join("");

  return (
    `.${className} .maplibregl-popup-content{` +
    `background:${colors.background};` +
    `color:${colors.text};` +
    `border:1px solid ${colors.border};` +
    "border-radius:4px;" +
    "padding:6px 10px;" +
    "box-shadow:0 2px 8px rgba(0,0,0,.45);" +
    "font:13px/1.5 system-ui,-apple-system,'Segoe UI','Hiragino Sans','Noto Sans JP',sans-serif;" +
    "}" +
    // 「大阪梅田」の 4 文字が 2 行に割れると、箱が縦長になって読みにくい。
    // **箱ごとではなく文字の行だけに掛ける**（写真の下の説明が 1 行に伸びて溢れるため）
    `.${className} .mmj-popup-text{white-space:nowrap;}` +
    // 写真は原寸で来る。**抑えないと画面が埋まる**
    `.${className} .mmj-popup-body img{` +
    "display:block;max-width:220px;max-height:160px;width:100%;height:auto;" +
    "object-fit:cover;border-radius:3px;margin:0 0 6px;" +
    "}" +
    // 写真があるときは 1 行に縛らない（説明が長いことがある）
    `.${className} .mmj-popup-body:has(img) .mmj-popup-text{white-space:normal;max-width:220px;}` +
    tip
  );
}

/**
 * URL の hash が傾き（pitch）まで持っているかを見る。**ここは純粋関数。**
 *
 * MapLibre の hash は `#zoom/lat/lng/bearing/pitch` の 5 要素。
 * **3 要素しか書かれていない URL を開くと、bearing と pitch が 0 に戻される。**
 * `pitch="60"` と書いてあっても hash が勝つ。
 *
 * その結果、**3D のページを URL で渡すと、渡された側では建物が平らになる**
 * （実測: `3d.html#16/34.7024/135.4959` で立たなかった・2026-09-20）。
 *
 * hash が pitch を持っていないときだけ、属性の pitch を当て直す。
 * **持っているときは触らない。**利用者が URL で指定した角度を奪わないため。
 *
 * @param {string | null | undefined} hash `location.hash`（先頭の `#` は有無どちらでも）
 * @returns {boolean} pitch を持っているなら true
 */
export function hashOverridesPitch(hash) {
  if (typeof hash !== "string") return false;
  const body = hash.startsWith("#") ? hash.slice(1) : hash;
  if (body === "") return false;
  // `#map=16/34.7/135.5` のような名前つきの形は、この判定の対象にしない
  if (body.includes("=")) return false;

  const parts = body.split("/");
  if (parts.length < 5) return false;
  // 5 要素目が数でなければ pitch ではない。**位置だけ見て信じない**
  return toNumber(parts[4]) !== null;
}
