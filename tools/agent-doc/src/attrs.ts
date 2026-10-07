/**
 * **公開している属性の正本は、ソースコード。**文書ではない。
 *
 * ここは読むだけの純粋関数。ファイルも通信も触らない（触るのは `cli.ts`）。
 *
 * ## なぜ要るのか
 *
 * MMJ を使って HTML を書くのは、**たいていエージェント**になる。
 * その相手が読むのは `llms.txt` と `docs/elements/README.md` で、
 * **属性を足した commit で文書を忘れても、テストも lint も通る。**
 * 気づくのは、使った人の地図が黙って動かなかったとき。
 *
 * **だから機械に数えさせる。**文書が古びたら落ちるようにしておく。
 */

/** `getAttribute("x")` / `hasAttribute("x")`。**読んでいるものだけ**＝公開 API */
const READ = /\b(?:get|has)Attribute\("([a-z0-9][a-z0-9-]*)"\)/g;

/** `static observedAttributes = ["3d", "pitch"]` の並び */
const OBSERVED = /static\s+observedAttributes\s*=\s*\[([^\]]*)\]/g;

/** 並びの中の文字列 */
const QUOTED = /"([a-z0-9][a-z0-9-]*)"/g;

/** 文書の `code` span。属性名に使える字だけを見る */
const CODE_SPAN = /`([a-z0-9][a-z0-9-]*)`/g;

/** HTML の開始タグの属性（`zoom="14"` と、値の無い `3d` の両方） */
const HTML_TAG = /<[a-z][a-z0-9-]*\s([^>]*)>/gi;
// **`3d` は数字で始まる。**HTML の属性名は数字始まりでもよいので、
// `[a-z]` 始まりに縛ると**見本の `3d` を見落とす**（実際に落とした）
const HTML_ATTR = /(?:^|\s)([a-z0-9][a-z0-9-]*)(?==|\s|$)/g;

const sorted = (names: Iterable<string>): string[] => [...new Set(names)].sort();

/**
 * ソースが**読んでいる**属性。
 *
 * `setAttribute` / `removeAttribute` は拾わない。**書き込みは公開 API ではない**
 * （内部で付け替えているだけのものを、文書に書かせても誰の役にも立たない）。
 */
export function attributesInSource(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(READ)) found.push(match[1]!);
  for (const block of text.matchAll(OBSERVED)) {
    for (const quoted of block[1]!.matchAll(QUOTED)) found.push(quoted[1]!);
  }
  return sorted(found);
}

/** 文書のどこかに `code` として出ている語。**体裁は縛らない**（見出しでも表でも本文でも） */
export function attributesInDoc(markdown: string): Set<string> {
  return new Set([...markdown.matchAll(CODE_SPAN)].map((match) => match[1]!));
}

/**
 * Markdown の中の ```html の囲みだけを取り出す。
 *
 * **写される場所だけを見るため。**地の文には「書いてはいけない例」が出てくる
 * （`<img onerror=...>` は危険の説明であって、使い方の見本ではない）。
 * 地の文まで属性として数えると、**正しい文書が落ちる**——2026-10-07 に実際に落ちた。
 *
 * `bash` や `json` の囲みも返さない。`--base=/mmj-map` を属性と読まないため。
 */
export function htmlBlocksInMarkdown(markdown: string): string[] {
  return [...markdown.matchAll(/^```html\r?\n([\s\S]*?)^```/gm)].map((match) => match[1]!);
}

/**
 * 引用符の中（＝値）を空にする。**名前だけを数えるため。**
 *
 * `label="徒歩 10 分"` から `10` を属性として拾っていた（2026-10-07 実測）。
 * **2 語では再現しない**——前後が引用符に接していて、たまたま当たらないだけで、
 * 3 語以上だと真ん中の語が残る（`popup="osaka umeda station"` → `umeda`）。
 */
const withoutValues = (attrs: string): string => attrs.replaceAll(/=\s*"[^"]*"/g, "=").replaceAll(/=\s*'[^']*'/g, "=");

/** 見本の HTML が使っている属性 */
export function attributesInHtml(html: string): string[] {
  const found: string[] = [];
  for (const tag of html.matchAll(HTML_TAG)) {
    for (const attr of withoutValues(tag[1]!).matchAll(HTML_ATTR)) found.push(attr[1]!);
  }
  return sorted(found);
}

/**
 * 文書に出ていない属性。
 *
 * @param allowed 明示して許すもの。**数を合わせるための除外を増やさない**ため、
 *   呼ぶ側（`cli.ts`）が名前と理由を 1 か所に持つ
 */
export function undocumented(attributes: readonly string[], documented: Set<string>, allowed: readonly string[]): string[] {
  const allow = new Set(allowed);
  return attributes.filter((name) => !documented.has(name) && !allow.has(name));
}

/**
 * **逆向きの検査。**文書や見本に、ソースに無い属性が残っていないか。
 *
 * エージェントは**最初に見た例をそのまま写す**。綴りが違っていても HTML は
 * エラーにならず、**黙って効かない**ので、書いた側も読んだ側も気づけない。
 */
export function unknownInText(
  texts: readonly string[],
  attributes: readonly string[],
  extract: (text: string) => string[],
): string[] {
  const known = new Set(attributes);
  return sorted(texts.flatMap(extract).filter((name) => !known.has(name)));
}
