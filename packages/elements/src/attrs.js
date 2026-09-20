/**
 * HTML の属性を、MapLibre へ渡す値へ直す。**ここは純粋関数。**
 *
 * DOM もブラウザも触らないので、テストに jsdom のような依存が要らない。
 * 実際に描けることは、ブラウザで撮って確かめる（`pnpm shot`）。
 */

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
 * @param {{ container: unknown, style: unknown, center: [number, number], zoom: number, hash: boolean, pitch?: number }} input
 */
export function buildMapOptions(input) {
  return {
    container: input.container,
    style: input.style,
    center: input.center,
    zoom: input.zoom,
    hash: input.hash,
    pitch: input.pitch ?? 0,
    // グリフに CJK が無いため、漢字かなは閲覧側のフォントで描く（decisions.md 未決）
    localIdeographFontFamily: "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', sans-serif",
    // 帰属表示は必須。**消せる形で渡さない**（LICENSES.md・ODbL）
    attributionControl: { compact: false },
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
export function buildPopupOptions() {
  return {
    offset: 24,
    className: "mmj-popup",
    closeButton: false,
    closeOnClick: true,
  };
}

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
 */
export function buildPopupStyle() {
  const tip = Object.entries(TIP_SIDES)
    .map(
      ([anchor, side]) =>
        `.mmj-popup.maplibregl-popup-anchor-${anchor} .maplibregl-popup-tip{border-${side}-color:${POPUP_COLORS.background};}`,
    )
    .join("");

  return (
    ".mmj-popup .maplibregl-popup-content{" +
    `background:${POPUP_COLORS.background};` +
    `color:${POPUP_COLORS.text};` +
    `border:1px solid ${POPUP_COLORS.border};` +
    "border-radius:4px;" +
    "padding:6px 10px;" +
    "box-shadow:0 2px 8px rgba(0,0,0,.45);" +
    "font:13px/1.5 system-ui,-apple-system,'Segoe UI','Hiragino Sans','Noto Sans JP',sans-serif;" +
    // 「大阪梅田」の 4 文字が 2 行に割れると、箱が縦長になって読みにくい
    "white-space:nowrap;" +
    "}" +
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
