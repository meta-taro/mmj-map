/**
 * ラベルをどの言語で出すかを決める。**ここは純粋関数。**
 *
 * **地域ごとにスタイルを増やさない。**スタイルは 6 枚のままで、
 * 読み込んだあとに `text-field` を差し替える（`palette.js` が色に対してやっているのと同じ）。
 * 地域 × 配色でスタイルを持つと、**6 枚が 24 枚 48 枚と増えて破綻する**。
 *
 * ```html
 * <mmj-map tiles="..." style-url="/styles/modern-dark.json" lang="zh-Hant"></mmj-map>
 * ```
 *
 * **上流が持っているキーは実測すること。**大阪のタイルで数えた結果（2026-09-21）:
 *
 *   name:en 508 / name:zh-Hant 20 / name:zh-Hans 20 / name:ko 9 / name:vi 2
 *
 * **`name:zh` は無い。**`zh-Hans` / `zh-Hant` に分かれている。推測で書くと当たらない。
 * 手元のタイルで数えるには `pnpm tile:inspect -- <archive> <z> <x> <y> --layer=places --list`。
 */

/**
 * 言語タグとして通してよい形か。**`text-field` に入る値なので、何でも通さない。**
 * BCP 47 の素朴な形（`en` / `zh-Hant` / `pt-BR`）だけを認める。
 */
const LANGUAGE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

/**
 * 属性から言語を読む。読めなければ `null`（**勝手に既定を決めない**）。
 * @param {string | null | undefined} value
 * @returns {string | null}
 */
export function readLanguage(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return LANGUAGE.test(trimmed) ? trimmed : null;
}

/**
 * `["get", "name:xx"]` を、指定した言語のものへ差し替える。
 * **`["get", "name"]` はそのまま残す。**その言語の名前が無い地物が消えてしまうため。
 *
 * @param {unknown} node `text-field` の中身（入れ子を再帰で降りる）
 * @param {string} lang
 * @param {{ count: number }} tally 差し替えた数
 * @returns {unknown} 新しい値。**元は書き換えない**
 */
function rewrite(node, lang, tally) {
  if (!Array.isArray(node)) return node;

  // `["get", "name:ja"]` の形。**`["get", "name"]` は触らない**
  if (node.length === 2 && node[0] === "get" && typeof node[1] === "string") {
    if (!node[1].startsWith("name:")) return node;
    tally.count += 1;
    return ["get", `name:${lang}`];
  }
  return node.map((child) => rewrite(child, lang, tally));
}

/**
 * スタイルのラベルを、指定した言語で出すようにする。
 *
 * @param {any} style 読み込んだスタイル
 * @param {string | null} lang 言語タグ。`null` なら何もしない
 * @returns {{ style: any, applied: number }} `applied` は差し替えたラベル層の数
 */
export function applyLanguage(style, lang) {
  if (lang === null || lang === undefined) return { style, applied: 0 };

  let applied = 0;
  /** @type {any[]} */
  const layers = [];
  for (const layer of style?.layers ?? []) {
    const field = layer?.layout?.["text-field"];
    if (field === undefined) {
      layers.push(layer);
      continue;
    }
    const tally = { count: 0 };
    const next = rewrite(field, lang, tally);
    if (tally.count === 0) {
      layers.push(layer);
      continue;
    }
    applied += 1;
    layers.push({ ...layer, layout: { ...layer.layout, "text-field": next } });
  }

  return { style: { ...style, layers }, applied };
}
