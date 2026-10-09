/**
 * 一覧の DOM 側。**`list.js` が決め、ここが画面に反映する。**
 *
 * ## 2 つの入り方
 *
 * 1. **HTML に一覧がある**（`[data-shop]` を持つ要素が入っている）
 *    → 繋ぐだけ。**中身には触らない。**検索にも JS 無しにも効く
 * 2. **空の入れ物だけある** → 点の一覧から作る。
 *    探すのとキーボードには効くが、**検索には効かない**（JS で作ったものなので）
 *
 * ## 先に潰しておく落とし穴
 *
 * 1. **本物のリンクにする。**`<div>` に click を付けると、
 *    キーボードでも新しいタブでも届かない
 * 2. **押したら頁を読み込み直さない。**地図が作り直され、見ていた場所が消える
 * 3. **修飾キー付きの押下は横取りしない。**Ctrl+click で新しいタブへ、は殺さない
 */
import { needsScroll } from "./list.js";
import { themeClassName } from "./palette.js";

/** 項目に付ける印。**HTML 側もこの名前で書く**（属性名を 2 つにしない） */
const ITEM_ATTR = "data-shop";

/**
 * 一覧の見た目。**色は読み込んだスタイルから借りる**（カードと同じ 3 色）。
 *
 * **作った一覧にだけ当てる。**HTML にある一覧は置く側の持ち物なので、
 * こちらが見た目を決めない（`aria-current` の印だけ付ける）。
 *
 * @param {{ background: string, text: string, border: string }} colors
 * @param {string} className
 */
export function buildListStyle(colors, className) {
  return (
    `.${className}{list-style:none;margin:0;padding:0;` +
    "font:13px/1.6 system-ui,-apple-system,'Segoe UI','Hiragino Sans','Noto Sans JP',sans-serif;}" +
    `.${className} a{display:flex;align-items:center;` +
    // 指の的は 36px を割らない
    "min-height:36px;padding:8px 12px;" +
    `border-bottom:1px solid ${colors.border};color:${colors.text};text-decoration:none;}` +
    `.${className} a:hover{background:${colors.border};}` +
    `.${className} a:focus-visible{outline:2px solid ${colors.text};outline-offset:-2px;}` +
    // **いまどれを見ているかを、塗りで示す。**文字だけだと 20 件の中から見つからない
    `.${className} a[aria-current="true"]{background:${colors.border};font-weight:600;}`
  );
}

/**
 * その配色の CSS を `<head>` へ 1 枚だけ入れ、使うクラス名を返す。
 *
 * **配色ごとに分ける。**1 枚を共有すると、配色違いの地図を並べたとき
 * 最初の 1 枚の色が全部へ効く（吹き出しと操作系と同じ理由）。
 *
 * @param {{ background: string, text: string, border: string }} colors
 * @returns {string} 一覧に付けるクラス名
 */
export function ensureListContrast(colors) {
  const className = themeClassName(colors, "mmj-list");
  if (!document.getElementById(className)) {
    const style = document.createElement("style");
    style.id = className;
    style.textContent = buildListStyle(colors, className);
    document.head.append(style);
  }
  return className;
}

/**
 * HTML にある項目を、渡された順に並べ替える。**要素は作り直さない。**
 *
 * **一覧に無い項目は動かさない。**置く側が意図して置いたもの（「その他」など）を、
 * 黙って末尾へ飛ばさないため。
 *
 * @param {HTMLElement} container
 * @param {readonly { id: string }[]} entries
 */
function reorderList(container, entries) {
  if (!Array.isArray(entries) || entries.length === 0) return;
  for (const entry of entries) {
    const item = container.querySelector(`[${ITEM_ATTR}="${CSS.escape(entry.id)}"]`);
    // **項目そのものではなく、一覧の直下にある行を動かす**（`<li>` の中に `<a>` がある）
    const row = item instanceof HTMLElement ? (item.closest("li") ?? item) : null;
    if (row instanceof HTMLElement && row.parentElement === container) container.append(row);
  }
}

/**
 * 一覧を地図へ繋ぐ。
 *
 * @param {{
 *   container: HTMLElement,
 *   entries: readonly import("./list.js").ListEntry[],
 *   className: string,
 *   onPick: (id: string) => void,
 * }} input
 * @returns {{ mark: (id: string | null) => void, destroy: () => void }}
 */
export function mountList(input) {
  const container = input.container;

  // **HTML にある一覧を作り直さない。**置く側が書いたものが正で、
  // 作り直すと検索に出ていた文字を JS で消すことになる
  if (container.querySelectorAll(`[${ITEM_ATTR}]`).length === 0) {
    build(container, input.entries, input.className);
  }

  // **一覧の順を、送りの順と揃える。**
  //
  // 一覧は HTML に書かれている（検索に出すため）。プランで並べ替えたとき、
  // **ここを揃えないと「一覧の順」と「[‹] [›] の送り順」が食い違う**——
  // どちらを見ているのか分からなくなり、何もしないより悪い。
  //
  // **作り直さない。**置く側が書いた要素を、そのまま並べ替える（文字は消えない）。
  reorderList(container, input.entries);

  /** @param {any} event */
  const onClick = (event) => {
    // **修飾キー付きは横取りしない。**Ctrl+click で新しいタブへ、は殺さない
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const item = event.target?.closest?.(`[${ITEM_ATTR}]`);
    if (!(item instanceof HTMLElement)) return;
    const id = item.getAttribute(ITEM_ATTR);
    if (id === null || id === "") return;

    // **頁を読み込み直さない。**地図が作り直され、見ていた場所が消える
    event.preventDefault();
    input.onPick(id);
  };
  container.addEventListener("click", onClick);

  /** いまの店に印を付け、隠れていたら見えるところまで送る */
  const mark = (/** @type {string | null} */ id) => {
    /** @type {HTMLElement | null} */
    let current = null;
    for (const item of container.querySelectorAll(`[${ITEM_ATTR}]`)) {
      if (!(item instanceof HTMLElement)) continue;
      const link = item.closest("a") ?? item;
      const hit = id !== null && item.getAttribute(ITEM_ATTR) === id;
      if (hit) {
        link.setAttribute("aria-current", "true");
        current = /** @type {HTMLElement} */ (link);
      } else {
        link.removeAttribute("aria-current");
      }
    }
    if (current === null) return;
    // **見えているものは動かさない**（押すたびに一覧が跳ねると、見ていた場所が消える）
    if (needsScroll(current.getBoundingClientRect(), container.getBoundingClientRect())) {
      current.scrollIntoView({ block: "nearest" });
    }
  };

  return {
    mark,
    destroy: () => container.removeEventListener("click", onClick),
  };
}

/**
 * 点の一覧から作る。**検索には効かない**（JS で作ったものなので）。
 *
 * **文字列から DOM を作らない**（`popup.js` の頭に理由）。
 *
 * @param {HTMLElement} container
 * @param {readonly import("./list.js").ListEntry[]} entries
 * @param {string} className
 */
function build(container, entries, className) {
  const list = document.createElement("ul");
  list.className = className;

  for (const entry of entries) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    // **本物のリンク。**JS を切っても・新しいタブで開いても、その店の頁になる
    link.href = entry.href;
    link.textContent = entry.title;
    link.setAttribute(ITEM_ATTR, entry.id);
    item.append(link);
    list.append(item);
  }

  container.append(list);
}
