/**
 * **外からコードを読む書き方**を拾う。MV3 はこれを禁じ、ストアの審査は拡張の中の**文字列**を見て落とす
 * （2026-11-05、Blue Argon。貼る HTML の文面にあった pmtiles の CDN の `<script src>` で拒否された）。
 *
 * 拡張が実行しない文面でも、**中にあれば落ちる**。だから文面と同梱物の両方をこれで見る。
 * 外を指す `//` 始まり（プロトコル相対）も外として扱う。
 */
const REMOTE = String.raw`(?:https?:)?//`;

const PATTERNS = [
  new RegExp(String.raw`<script\b[^>]*\bsrc\s*=\s*["']?${REMOTE}`, "i"),
  new RegExp(String.raw`<link\b[^>]*\bhref\s*=\s*["']?${REMOTE}`, "i"),
  new RegExp(String.raw`\bimport\s+(?:[\w$*{}\s,]+\s+from\s+)?["']${REMOTE}`),
  new RegExp(String.raw`\bimport\s*\(\s*["'\`]${REMOTE}`),
  new RegExp(String.raw`\bimportScripts\s*\(\s*["'\`]${REMOTE}`),
];

/**
 * @param {string} text
 * @returns {string[]} 見つかった箇所（無ければ空）
 */
export function findRemoteCode(text) {
  return PATTERNS.flatMap((pattern) => {
    const hit = pattern.exec(text);
    return hit === null ? [] : [text.slice(hit.index, hit.index + 120)];
  });
}
