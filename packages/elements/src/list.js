/**
 * 地図と並ぶ「一覧」の判断。**ここは純粋関数。**DOM も地図も触らない。
 *
 * ## なぜ一覧が要るのか
 *
 * カードは**送りボタンで 1 件ずつ**しか回れない。3 件なら足りるが、
 * **20 件を「探す」ことはできない**。Google マップの中身が左の一覧なのは、
 * 地図が「どこにあるか」を答え、一覧が「どれにするか」を答えるから。
 *
 * それだけではない。**一覧は 3 つの穴を同時に塞ぐ。**
 *
 * | 塞がる穴 | 一覧が無いときの状態 |
 * |---|---|
 * | 探せない | 送りボタンで 1 件ずつだけ |
 * | 検索に出ない | 店の名前も営業時間も、HTML には 1 文字も無い |
 * | キーボードで届かない | 点は canvas の上の描画で、Tab では 1 件も触れない |
 *
 * ## HTML にある一覧を繋ぐのが本筋
 *
 * **検索と JS 無しに効くのは、最初から HTML にある一覧だけ。**
 * MMJ はデータを持たない（D-001）ので、一覧の中身は**置く側が書く**。
 * ここがやるのは「その一覧と地図を繋ぐ」こと。
 *
 * 一覧が無いときは作るが、**それは JS で作ったものなので検索には効かない**。
 * 探すのとキーボードには効く。
 */

/**
 * 一覧に出す 1 件。**読むものはカードにある**ので、ここは名前と行き先だけ。
 *
 * @typedef {{ id: string, title: string, href: string }} ListEntry
 */

/**
 * 点の一覧から、画面に出す並びを作る。
 *
 * **id と名前の両方があるものだけ。**どちらかが無いものを出すと、
 * 押しても開かない項目や、名前の無い項目が混ざる。
 *
 * `href` は `?shop=<id>`。**本物のリンクにするため**で、
 * JS を切っても・新しいタブで開いても、その店の頁になる。
 *
 * @param {readonly any[] | null | undefined} features 点の GeoJSON の features
 * @param {{ idKey: string | null, titleKey: string | null, search?: string }} keys
 * @param {(search: string, id: string | null) => string} writeParam `card.js` の `writeShopParam`
 * @returns {ListEntry[]}
 */
export function listEntries(features, keys, writeParam) {
  if (!Array.isArray(features)) return [];
  if (!keys?.idKey || !keys?.titleKey) return [];

  const search = typeof keys.search === "string" ? keys.search : "";
  /** @type {ListEntry[]} */
  const entries = [];

  for (const feature of features) {
    const properties = feature?.properties ?? {};
    const id = properties[keys.idKey];
    const title = properties[keys.titleKey];
    // **数で書き出す媒体がある**（`"shop_id": 7`）。文字に揃える
    if (id === null || id === undefined || id === "") continue;
    if (title === null || title === undefined || title === "") continue;
    entries.push({ id: String(id), title: String(title), href: writeParam(search, String(id)) });
  }

  return entries;
}

/**
 * いま開いている店が、一覧の何番目か。**無ければ -1。**
 *
 * @param {readonly { id: string }[] | null | undefined} entries
 * @param {string | number | null | undefined} id
 * @returns {number}
 */
export function indexOfEntry(entries, id) {
  if (!Array.isArray(entries)) return -1;
  if (id === null || id === undefined || id === "") return -1;
  return entries.findIndex((entry) => entry?.id === String(id));
}

/**
 * 一覧の項目を、見えるところまで送るか。
 *
 * **見えているものは動かさない。**押すたびに一覧が跳ねると、
 * どこを見ていたか分からなくなる（地図のほうを見ている最中はなおさら）。
 *
 * @param {{ top: number, bottom: number } | null | undefined} item その項目の位置
 * @param {{ top: number, bottom: number } | null | undefined} box 一覧の見えている範囲
 * @returns {boolean}
 */
export function needsScroll(item, box) {
  if (!item || !box) return false;
  return item.top < box.top || item.bottom > box.bottom;
}
