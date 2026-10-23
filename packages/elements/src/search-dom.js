/**
 * 名前で探す窓の DOM 側。**`search.js` が決め、ここが画面に反映する。**
 *
 * ## 2 つの入り方
 *
 * 1. **HTML に `<input>` がある** → 繋ぐだけ。見た目は置く側が決める
 * 2. **入れ物だけある** → 窓を作る（読み込んだ配色を借りる）
 *
 * ## 先に潰しておく落とし穴
 *
 * 1. **一覧の項目を消さない。**`hidden` で隠すだけにする。HTML に書かれた一覧は
 *    検索に出すための文字なので、消すと窓を空にしても戻らない
 * 2. **Enter でフォームを送らない。**窓が `<form>` の中にあると頁が読み込み直され、
 *    地図が作り直される
 * 3. **住所検索の遅い返事で上書きしない。**打ち直した後に前の答えが返ると、
 *    いま打った語と関係のない場所へ地図が飛ぶ
 * 4. **一覧を読み終える前から繋ぐ。**読み終えてから繋ぐと、それまでに打った字にも
 *    Enter にも何も起きない（窓が死んで見える）。読み込み中はそう言い、
 *    読み終えたら打ってあった字で絞り、押してあった Enter をそこで効かせる
 */
import { matchIds, planSearch, readLngLat, searchCountLabel } from "./search.js";
import { themeClassName } from "./palette.js";

/** 一覧の項目の印。**`list-dom.js` と同じ名前**（属性名を 2 つにしない） */
const ITEM_ATTR = "data-shop";

/** 変換中のキーに付く `keyCode` */
const COMPOSING_KEY = 229;

/**
 * 作った窓の見た目。**色は読み込んだスタイルから借りる**（一覧と同じ 3 色）。
 *
 * @param {{ background: string, text: string, border: string }} colors
 * @param {string} className
 */
export function buildSearchStyle(colors, className) {
  return (
    `.${className}{display:flex;flex-direction:column;gap:4px;` +
    "font:13px/1.6 system-ui,-apple-system,'Segoe UI','Hiragino Sans','Noto Sans JP',sans-serif;}" +
    // 指の的は 36px を割らない。**16px 未満だと iOS が入力時に頁を拡大する**
    `.${className} input{box-sizing:border-box;width:100%;min-height:36px;padding:6px 10px;font-size:16px;` +
    `color:${colors.text};background:${colors.background};border:1px solid ${colors.border};border-radius:6px;}` +
    `.${className} input:focus-visible{outline:2px solid ${colors.text};outline-offset:1px;}` +
    `.${className} [role="status"]{color:${colors.text};opacity:.8;min-height:1.6em;}`
  );
}

/**
 * その配色の CSS を `<head>` へ 1 枚だけ入れ、使うクラス名を返す。
 *
 * @param {{ background: string, text: string, border: string }} colors
 * @returns {string}
 */
export function ensureSearchContrast(colors) {
  const className = themeClassName(colors, "mmj-search");
  if (!document.getElementById(className)) {
    const style = document.createElement("style");
    style.id = className;
    style.textContent = buildSearchStyle(colors, className);
    document.head.append(style);
  }
  return className;
}

/**
 * 窓を地図へ繋ぐ。
 *
 * @param {{
 *   target: HTMLElement,
 *   index: readonly import("./search.js").SearchEntry[] | null,
 *   list: HTMLElement | null,
 *   className: string,
 *   geocoder: () => ((query: string) => unknown) | null,
 *   onOpen: (id: string) => void,
 *   onPlace: (lngLat: [number, number]) => void,
 *   onSearch: (detail: { query: string, via: "name" | "geocode" | "none", id?: string, lngLat?: [number, number] }) => void,
 * }} input `index` は一覧を読み終える前なら `null`（読み終えたら `setIndex` で渡す）
 * @returns {{ destroy: () => void, setIndex: (index: readonly import("./search.js").SearchEntry[]) => void }}
 */
export function mountSearch(input) {
  const parts = resolveParts(input.target, input.className);
  let index = input.index;
  /** 打ち直した回数。**遅れて返った住所検索の答えを捨てるため** */
  let asked = 0;
  /** 読み込み中に押された Enter。**打ち直したら取り消す**（古い語で開かない） */
  let pending = false;

  const say = (/** @type {string} */ text) => {
    if (parts.status) parts.status.textContent = text;
  };

  /** @returns {string[] | null} 当たった id。読み込み中で打ってあれば `null` */
  const filter = () => {
    // 読み込み中は一覧に触らない（空の索引で絞ると、全部が隠れる）
    const ids = matchIds(index ?? [], parts.field.value);
    if (index !== null) showOnly(input.list, ids);
    say(searchCountLabel(ids === null ? null : ids.length, index === null ? null : index.length));
    return index === null ? null : (ids ?? []);
  };

  const onInput = () => {
    asked += 1;
    pending = false;
    filter();
  };

  const onKeydown = (/** @type {KeyboardEvent} */ event) => {
    // **変換の確定の Enter で動かない。**Safari は確定の Enter で `isComposing` を
    // false にして送ってくるので、変換中を示す `keyCode` 229 も見る
    if (event.isComposing || event.keyCode === COMPOSING_KEY) return;
    if (event.key === "Escape") {
      // **空のときは素通しする**（カードの「Esc で 1 段戻る」に任せる）。
      // 文字があるときに伝えると、消すつもりの Esc で開いていたカードまで閉じる
      if (parts.field.value === "") return;
      event.stopPropagation();
      parts.field.value = "";
      onInput();
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault(); // **フォームを送らない**（頁が読み込み直され、地図が作り直される）
    run();
  };

  // 握り潰さない（§8）。開く・寄せるの途中で投げても、窓は使えるまま残す
  const run = () => void submit().catch((error) => console.error("[mmj-poi] 検索の途中で失敗しました", error));

  const submit = async () => {
    const query = parts.field.value;
    const ids = filter();
    const geocode = input.geocoder();
    const plan = planSearch(query, ids === null ? null : ids.length, typeof geocode === "function");
    pending = plan === "wait";
    if (plan === "clear" || plan === "wait" || ids === null) return;
    if (plan === "open") {
      const id = /** @type {string} */ (ids[0]);
      input.onOpen(id);
      input.onSearch({ query, via: "name", id });
      return;
    }
    if (plan === "none" || typeof geocode !== "function") {
      input.onSearch({ query, via: "none" });
      return;
    }

    const mine = ++asked;
    say("探しています…");
    const lngLat = await askGeocoder(geocode, query);
    if (mine !== asked) return; // **打ち直した後の古い答えで飛ばない**
    if (lngLat === null) {
      say("見つかりません");
      input.onSearch({ query, via: "none" });
      return;
    }
    say("");
    input.onPlace(lngLat);
    input.onSearch({ query, via: "geocode", lngLat });
  };

  parts.field.addEventListener("input", onInput);
  parts.field.addEventListener("keydown", onKeydown);
  filter(); // **繋ぐ前に打ってあった字も拾う**

  return {
    setIndex: (next) => {
      index = next;
      filter();
      if (pending) run();
    },
    destroy: () => {
      // **外したあとに返った住所検索の答えで、地図を動かさない**
      asked += 1;
      parts.field.removeEventListener("input", onInput);
      parts.field.removeEventListener("keydown", onKeydown);
      showOnly(input.list, null);
      for (const node of parts.created) node.remove();
    },
  };
}

/**
 * 置き手がつないだ住所検索を呼ぶ。**投げても落とさない**（地図は出したまま）。
 *
 * @param {(query: string) => unknown} geocode
 * @param {string} query
 * @returns {Promise<[number, number] | null>}
 */
async function askGeocoder(geocode, query) {
  try {
    const answer = await geocode(query);
    const lngLat = readLngLat(answer);
    if (lngLat === null && answer !== null && answer !== undefined) {
      // 握り潰さない（§8）。**つないだ先の返す形が違う**のが一番気づきにくい
      console.error("[mmj-poi] geocode の返りを [経度, 緯度] として読めませんでした", answer);
    }
    return lngLat;
  } catch (error) {
    console.error("[mmj-poi] geocode が失敗しました", error);
    return null;
  }
}

/**
 * 一覧の項目を、当たったものだけ見せる。**`null` なら全部見せる。**
 * 消さずに `hidden` にする（HTML の文字は検索のために残す）。
 *
 * @param {HTMLElement | null} list
 * @param {readonly string[] | null} ids
 */
function showOnly(list, ids) {
  if (list === null) return;
  const wanted = ids === null ? null : new Set(ids);
  for (const item of list.querySelectorAll(`[${ITEM_ATTR}]`)) {
    if (!(item instanceof HTMLElement)) continue;
    // **一覧の外の `<li>` を隠さない。**一覧ごと別の `<li>` の中に置かれていると、
    // `closest` が外へ抜けて、一覧ごと消える
    const li = item.closest("li");
    const row = li !== null && li !== list && list.contains(li) ? li : item;
    const id = item.getAttribute(ITEM_ATTR) ?? "";
    row.hidden = wanted !== null && !wanted.has(id);
  }
}

/**
 * 窓と件数の置き場を決める。**HTML に `<input>` があれば作らない。**
 *
 * @param {HTMLElement} target
 * @param {string} className
 * @returns {{ field: HTMLInputElement, status: HTMLElement | null, created: HTMLElement[] }}
 */
function resolveParts(target, className) {
  if (target instanceof HTMLInputElement) {
    // 置く側の窓。**件数の行だけ足す**（読み上げにも件数が届くように）
    const status = document.createElement("span");
    status.setAttribute("role", "status");
    status.className = "mmj-search-status";
    target.after(status);
    return { field: target, status, created: [status] };
  }

  const box = document.createElement("div");
  box.className = className;
  const field = document.createElement("input");
  field.type = "search";
  field.placeholder = "名前で探す";
  // **見える見出しが無いので、読み上げ用の名前を付ける**
  field.setAttribute("aria-label", "この地図の中を名前で探す");
  field.autocomplete = "off";
  const status = document.createElement("span");
  status.setAttribute("role", "status");
  box.append(field, status);
  target.append(box);
  return { field, status, created: [box] };
}
