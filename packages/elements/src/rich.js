/**
 * 本文の中に**文中リンクと強調**を書けるようにする。**ここは純粋関数。**DOM も通信も触らない。
 *
 * ## なぜ opt-in なのか
 *
 * 既定は文字だけのままにしてある（D-022）。理由は「HTML が危ないから」ではなく、
 * **誰がその文字列を書くかを部品が知らないから**。
 *
 * - 置く側が自分でデータを書くなら、HTML を許しても**自分のページに自分で書くのと同じ**で安全
 * - ただし**店舗が CMS で紹介文を書く**使い方や、`card-live` が実行時に取りに行く JSON では、
 *   書く人は置く側ではない。1 件が `<img src=x onerror=…>` を書くだけで、
 *   **その地図を置いた全ページ**が乗っ取られる
 *
 * **部品はどちらか判定できない。**だから既定を安全側に置いたまま、
 * 置く側が項目を名指ししたときだけ開く。
 *
 * ## 許す範囲の決め方
 *
 * **禁止を数えない。**`onerror` や `onclick` を 1 つずつ落とす形は、
 * 新しい属性が増えるたびに穴が開く。**許すものだけを並べ、残りは全部落とす。**
 */

/**
 * 本文で許すタグ。**文中で要るものだけ。**
 *
 * `img` を入れていないのは、**属性を落としていても「置き場」ができる**ため。
 * 写真は `card-images` に専用の口があり、そちらは URL の判定を通る。
 */
export const RICH_TAGS = new Set(["a", "b", "br", "em", "i", "li", "ol", "p", "strong", "ul"]);

/**
 * **中身ごと捨てるタグ。**
 *
 * 許す表に無いタグは、**タグだけ落として中の文字を残す**（知らないタグで文章ごと
 * 消さないため）。ところがそれを `script` に当てると、**実行はされないのに
 * `console.error(2)` という文字がカードに出た**（2026-10-05 実測）。
 *
 * **画面に出す文章を持たないタグは、中身ごと捨てる。**
 */
export const DROP_CONTENT = new Set(["script", "style", "template", "noscript", "iframe", "object", "embed"]);

/** `a` だけが属性を持てる。**`target` と `rel` はこちらが決める**（外から渡させない） */
const ATTRIBUTES = new Map([["a", ["href"]]]);

/**
 * `card-rich="description,menu"` を読む。
 *
 * @param {string | null | undefined} attribute
 * @returns {Set<string>} 指定が無ければ空（**既定は 1 つも開かない**）
 */
export function parseRichFields(attribute) {
  if (typeof attribute !== "string") return new Set();
  return new Set(
    attribute
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part !== ""),
  );
}

/**
 * その項目を HTML として読んでよいか。
 *
 * @param {string | null | undefined} field 項目名（GeoJSON の属性名）
 * @param {Set<string>} fields `parseRichFields` の結果
 */
export function isRichField(field, fields) {
  return typeof field === "string" && field !== "" && fields.has(field);
}

/**
 * そのタグで許す属性。**表に無いものは空**なので、知らない属性は自動的に落ちる。
 *
 * @param {string} tag 小文字のタグ名
 * @returns {readonly string[]}
 */
export function allowedAttributes(tag) {
  return ATTRIBUTES.get(tag) ?? [];
}
