/**
 * 点を「自前のアイコン」で出すための判断。**ここは純粋関数。**DOM も地図も触らない。
 *
 * ## なぜ要るのか
 *
 * 点が全部同じ丸だと、**地図を見ても何屋かが分からない**。
 * うどん・ラーメン・ケーキ・コーヒーが一目で分かれば、
 * **開く前に選べる**（カードを 1 枚ずつ開いて確かめる必要がなくなる）。
 *
 * ## 絵は持たない
 *
 * **MMJ はアイコンを同梱しない**（D-001・データを持たない）。
 * 業種の分け方も絵の趣味も置く側のもので、こちらが決めると必ず合わない。
 * 受け取るのは**名前と URL の対応**だけ。
 *
 *     <mmj-poi icon-key="category"
 *              icons="ramen:./icons/ramen.svg,cafe:./icons/cafe.svg"></mmj-poi>
 *
 * ## 欠けても地図は出る
 *
 * **アイコンが無い点は、いままでの丸のまま。**読み込みに失敗した 1 枚のために
 * 地図が空になるのが、いちばん困る壊れ方。
 */

/**
 * 名前と絵の対応。
 * @typedef {{ name: string, url: string }} IconSource
 */

/**
 * `icons` の指定を読む。**「名前:URL」の組を `,` で並べる。**
 *
 *     icons="ramen:./icons/ramen.svg,cafe:./icons/cafe.svg"
 *
 * `card-tabs` / `card-links` と同じ書き方に揃えてある。
 * **同じ名前が 2 度出たら、先に書いたほうを採る**（後勝ちだと、
 * どちらが効いているか読む人に分からない）。
 *
 * **URL は `:` を含む**（`https://`）。名前と URL は**最初の `:` で割る**。
 *
 * @param {string | null | undefined} attribute
 * @param {(url: string) => boolean} isSafe URL の確かめ方（`popup.js` の `isSafeLink`）
 * @returns {IconSource[]}
 */
export function parseIcons(attribute, isSafe) {
  if (typeof attribute !== "string" || attribute.trim() === "") return [];

  /** @type {IconSource[]} */
  const icons = [];
  const seen = new Set();
  for (const chunk of attribute.split(",")) {
    const at = chunk.indexOf(":");
    if (at < 0) continue;
    const name = chunk.slice(0, at).trim();
    const url = chunk.slice(at + 1).trim();
    if (name === "" || url === "" || seen.has(name)) continue;
    // **押した瞬間に走る URL を通さない**（`javascript:` は吹き出しと同じ扱い）
    if (typeof isSafe === "function" && !isSafe(url)) continue;
    seen.add(name);
    icons.push({ name, url });
  }
  return icons;
}

/**
 * 点に出す絵の名前を、地図の式で表す。
 *
 * **地図に入れた名前（`imageId`）へ読み替える。**1 枚の頁に地図が何枚も載るので、
 * `ramen` のような素の名前をそのまま使うと、**別の地図の絵で上書きされる**。
 *
 * **知らない名前は空文字**。MapLibre は空の `icon-image` を「描かない」と読むので、
 * 分類の無い点や、綴りの違う点は**静かに丸のまま**になる。
 *
 * @param {string} key アイコン名が入っている属性
 * @param {readonly IconSource[]} icons
 * @param {(name: string) => string} imageId 名前 → 地図に入れた名前
 * @returns {unknown[]} MapLibre の式
 */
export function iconImageExpression(key, icons, imageId) {
  /** @type {unknown[]} */
  const match = ["match", ["get", key]];
  for (const icon of icons) match.push(icon.name, imageId(icon.name));
  // 既定（知らない名前）は空文字＝描かない
  match.push("");
  return match;
}

/**
 * その点が絵を持つか。**丸を出すかどうかの裏返し。**
 *
 * 絵と丸を重ねると、**絵の下から丸がはみ出して汚れる**。
 * 絵がある点では丸を消し、無い点にだけ丸を出す。
 *
 * @param {string} key
 * @param {readonly IconSource[]} icons
 * @returns {unknown[]} MapLibre のフィルタ式
 */
export function hasIconFilter(key, icons) {
  return ["in", ["get", key], ["literal", icons.map((icon) => icon.name)]];
}
