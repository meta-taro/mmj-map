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
 * MapLibre の Map へ渡す設定。
 * **帰属表示と CJK の扱いを、呼ぶ側が忘れられない場所に置く**のがこの関数の役目。
 * @param {{ container: unknown, style: unknown, center: [number, number], zoom: number, hash: boolean }} input
 */
export function buildMapOptions(input) {
  return {
    container: input.container,
    style: input.style,
    center: input.center,
    zoom: input.zoom,
    hash: input.hash,
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
