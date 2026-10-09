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

/**
 * 並び順の指定を読む。`platinum,gold,silver,bronze` のような**値の並び**。
 *
 * **MMJ は「ゴールド」の意味を知らない。**段の数も名前も媒体ごとに違うので、
 * 受け取るのは「どの順に並べるか」だけ（D-001・データを持たない）。
 *
 * @param {string | null | undefined} attribute
 * @returns {string[]} 左が上。空と重複は落とす
 */
export function parseRankOrder(attribute) {
  if (typeof attribute !== "string") return [];
  /** @type {string[]} */
  const order = [];
  for (const raw of attribute.split(",")) {
    const name = raw.trim();
    if (name !== "" && !order.includes(name)) order.push(name);
  }
  return order;
}

/**
 * 点を、媒体のプラン順に並べ替える。**元の配列は変えない**（ECC coding-style）。
 *
 * ## 安定であること
 *
 * **同じ順位の中では、元の順をそのまま保つ。**安定でないと、
 * **同じプランの店が読み込むたびに入れ替わる**。媒体の「掲載順」がぶれるのは、
 * お金の話なので重い。
 *
 * ## 知らない値を捨てない
 *
 * **並びに無い値と、値を持たない点は末尾**（そこでも元の順のまま）。
 * 綴り違いや新しいプランが来たときに、**店が一覧から消えるより末尾に出るほうがよい**
 * （`icons` の「知らない名前は描かない＝丸のまま」と同じ考え方）。
 *
 * ## これは広告である
 *
 * **お金を払った順に並ぶ一覧は広告。**並べるかどうかも、
 * 広告だと分かる表示を出すかどうかも**媒体の判断**で、ここは渡された順に並べるだけ。
 *
 * @param {readonly any[] | null | undefined} features
 * @param {{ key: string | null, order: readonly string[] }} input
 * @returns {any[]}
 */
export function sortByRank(features, input) {
  const list = Array.isArray(features) ? [...features] : [];
  const { key, order } = input;
  if (typeof key !== "string" || key === "" || !Array.isArray(order) || order.length === 0) {
    return list;
  }

  const rankOf = (/** @type {any} */ feature) => {
    const value = feature?.properties?.[key];
    const at = typeof value === "string" ? order.indexOf(value) : -1;
    // **知らない値は末尾。**`Infinity` は使わない——同点どうしの引き算が
    // `NaN` になり、比較関数として壊れる（並びが環境任せになる）
    return at < 0 ? order.length : at;
  };

  // **`Array.prototype.sort` は安定**（ES2019 以降）。
  // 位置を添えて比べ直す必要は無いが、**同点のとき 0 を返すこと**が要る
  return list.sort((a, b) => rankOf(a) - rankOf(b));
}
