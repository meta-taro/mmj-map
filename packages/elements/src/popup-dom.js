/**
 * 吹き出しの DOM 側。**`popup.js` が中身を決め、ここが組み立てる。**
 *
 * 目印（`mmj-marker`）と経路の案内（`mmj-route`）の両方が使うので、
 * 片方の中に置かずここへ出した。**2 か所に同じものを書くと、片方だけ直る。**
 *
 * **`innerHTML` / `setHTML` を使わない。**`createElement` と `textContent` だけで組むので、
 * 媒体が登録した文字列が HTML として解釈される経路が存在しない（baseline §21）。
 */
import { buildPopupStyle, POPUP_COLORS } from "./attrs.js";
import { buildCardStyle } from "./card-dom.js";
import { splitForTabs, stepIndex } from "./card.js";
import { formatRating } from "./popup.js";
import { surfaceFor, themeClassName } from "./palette.js";
import { groupParts, isSafeLink } from "./popup.js";
import { DROP_CONTENT, RICH_TAGS, allowedAttributes } from "./rich.js";

/**
 * 許可表に沿って、読んだ木を**作り直しながら**写す。
 *
 * 落ちるもの: 許可表に無いタグ、すべてのイベント属性、`style`、安全でない `href`。
 * **タグが落ちても中の文字は残す**（文章が消えるほうが困る）。
 * ただし画面に出す文章を持たないタグ（`script` など）は**中身ごと捨てる**。
 *
 * @param {Node} source
 * @param {Element} target
 */
function copyRich(source, target) {
  for (const node of source.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      target.append(node.textContent ?? "");
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const element = /** @type {Element} */ (node);
    const tag = element.tagName.toLowerCase();
    // **中身ごと捨てる**（`script` の中身が文字としてカードに出た・2026-10-05 実測）
    if (DROP_CONTENT.has(tag)) continue;
    if (!RICH_TAGS.has(tag)) {
      // **中の文字は残す。**知らないタグで文章ごと消さない
      copyRich(element, target);
      continue;
    }
    const made = document.createElement(tag);
    for (const name of allowedAttributes(tag)) {
      const value = element.getAttribute(name);
      if (name === "href" && (value === null || !isSafeLink(value))) continue;
      if (value !== null) made.setAttribute(name, value);
    }
    if (tag === "a") {
      if (!made.hasAttribute("href")) {
        // 飛び先が無い `a` は、ただの文字として出す（押せそうで押せないものを作らない）
        copyRich(element, target);
        continue;
      }
      // **こちらが決める。**外から `target` や `rel` を渡させない
      made.setAttribute("target", "_blank");
      made.setAttribute("rel", "noopener noreferrer");
    }
    copyRich(element, made);
    target.append(made);
  }
}

/**
 * 限られたタグだけを許して、本文を組み立てる。
 *
 * **解析した DOM をそのまま挿さない。**`DOMParser` が作る文書は実行されない
 * （browsing context を持たないので `onerror` も走らず、画像も取りに行かない）が、
 * それを信用して `append` すると、**許可表を通らないものまで入る**。
 * ここでは**読み取って、`createElement` で作り直す**。入るのは許可表にあるものだけ。
 *
 * @param {Element} parent
 * @param {string} html
 */
function appendRich(parent, html) {
  const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  copyRich(parsed.body, parent);
}

/**
 * 組み立ての指示から DOM を作る。
 * @param {{ kind: string, src?: string, alt?: string, text?: string, href?: string, label?: string }[]} parts
 * @returns {HTMLElement}
 */
export function renderPopup(parts) {
  const box = document.createElement("div");
  box.className = "mmj-popup-body";

  // **写真をまとめるかどうかは `popup.js` が決める。**ここは描くだけ
  for (const part of groupParts(parts)) {
    if (part.kind === "gallery") {
      const strip = document.createElement("div");
      strip.className = "mmj-popup-gallery";
      const images = part.images ?? [];
      // **横に流せることを、覗いている端以外にも出す。**
      // 端が見えるのは目で見ている人だけで、読み上げには何も伝わらない。
      // 帯そのものを読み、枚数を言う（`role="group"` + 名前）
      strip.setAttribute("role", "group");
      strip.setAttribute("aria-label", `写真 ${images.length} 枚`);
      // **スクロールする場所はキーボードでも触れること。**
      // Chrome は overflow だけでは焦点を当てないので、指でしかめくれなくなる
      strip.tabIndex = 0;
      for (const image of images) {
        const img = document.createElement("img");
        img.src = image.src ?? "";
        img.alt = image.alt ?? "";
        img.loading = "lazy";
        strip.append(img);
      }
      // **地図に横の動きを取らせない。**取られると、めくったつもりが地図が動く
      for (const type of ["wheel", "touchmove", "pointerdown"]) {
        strip.addEventListener(type, (event) => event.stopPropagation(), { passive: true });
      }
      // **PC では指で払えない。**横スクロールは手間なので、送りボタンを重ねる
      // （2026-09-29・横スライダーは携帯では良いが PC では使いにくい、という指摘）。
      // **触る画面では出さない**（指で払えるほうが速く、ボタンは写真を隠す）
      const wrap = document.createElement("div");
      wrap.className = "mmj-popup-gallery-wrap";
      wrap.append(strip);
      if (images.length > 1) {
        for (const [name, label, delta] of /** @type {const} */ ([
          ["prev", "前の写真", -1],
          ["next", "次の写真", 1],
        ])) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = `mmj-popup-slide mmj-popup-slide-${name}`;
          button.textContent = delta < 0 ? "‹" : "›";
          // **記号だけにしない**（読み上げにも押す人にも伝わらない）
          button.title = label;
          button.setAttribute("aria-label", label);
          button.addEventListener("click", (event) => {
            event.stopPropagation();
            event.preventDefault();
            // 1 枚ぶん送る。**幅は実寸から取る**（覗かせているぶんを数に書かない）
            const step = strip.querySelector("img")?.getBoundingClientRect().width ?? strip.clientWidth;
            strip.scrollBy({ left: delta * (step + 6), behavior: "smooth" });
          });
          wrap.append(button);
        }
      }
      box.append(wrap);
      continue;
    }
    if (part.kind === "image") {
      const img = document.createElement("img");
      img.src = part.src ?? "";
      img.alt = part.alt ?? "";
      // 開いた瞬間に取りに行かない。**閉じている吹き出しの写真まで読むと転送量が無駄になる**
      img.loading = "lazy";
      box.append(img);
      continue;
    }
    if (part.kind === "link") {
      const link = document.createElement("a");
      // **`href` は検証済みのものだけが来る**（`popup.js` の `isSafeLink`）。
      // `javascript:` は押した瞬間に走るので、ここまで到達させない
      link.href = part.href ?? "";
      link.className = "mmj-popup-link";
      // **アイコンは飾り。**文字が本体なので、読み上げからは外す（alt を空にする）。
      // **URL は確かめ済みのものだけ**が来る（`card.js` の `buildLinks`）
      if (typeof part.icon === "string" && part.icon !== "") {
        const icon = document.createElement("img");
        icon.src = part.icon;
        icon.alt = "";
        icon.className = "mmj-popup-link-icon";
        link.append(icon);
      }
      link.append(document.createTextNode(part.label ?? ""));
      // **別ページへ飛ばすときは、元のページを触らせない**
      if (/^https?:/i.test(link.href)) {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      }
      box.append(link);
      continue;
    }

    const line = document.createElement("div");
    // 星と長文は、短い名前とは**折り返し方が違う**（`mmj-popup-text` は折り返さない）
    line.className =
      part.kind === "rating" ? "mmj-popup-rating" : part.kind === "body" ? "mmj-popup-copy" : "mmj-popup-text";
    // **rich は置く側が名指しした項目だけ**（`card-rich`）。既定は文字のまま
    if (part.rich === true) appendRich(line, part.text ?? "");
    else line.textContent = part.text ?? "";
    box.append(line);
  }
  return box;
}

/**
 * 口コミの並びを組む。**書いた人の言葉のまま出す**（要約しない・baseline §27）。
 *
 * **本文が主役。**星と名前は添えもので、無くても読める形にする。
 *
 * @param {{ text: string, rating?: number, name?: string, date?: string }[]} reviews
 * @returns {HTMLElement}
 */
export function renderReviews(reviews) {
  const box = document.createElement("div");
  box.className = "mmj-popup-reviews";

  for (const review of reviews) {
    const item = document.createElement("div");
    item.className = "mmj-popup-review";

    const stars = formatRating(review.rating, undefined);
    if (stars !== null) {
      const line = document.createElement("div");
      line.className = "mmj-popup-rating";
      line.textContent = stars;
      item.append(line);
    }

    const text = document.createElement("div");
    // **改行を残す。**書いた人が行を分けたなら、その形に意味がある
    text.className = "mmj-popup-copy mmj-popup-panel";
    text.textContent = review.text;
    item.append(text);

    // 名前と日付は、**あるものだけ**。`undefined` と書かれた行を出さない
    const by = [review.name, review.date].filter((v) => typeof v === "string" && v !== "").join(" · ");
    if (by !== "") {
      const line = document.createElement("div");
      line.className = "mmj-popup-by";
      line.textContent = by;
      item.append(line);
    }

    box.append(item);
  }
  return box;
}

/**
 * 曜日ごとの営業時間の表。
 *
 * **「営業中」とは書かない。**いま開いているかは、時差・祝日・臨時休業・
 * ラストオーダーを知らないと言えない。**知らないまま出すのは嘘**で、
 * その嘘は**閉まった店の前に人を立たせる**。
 *
 * 出すのは**書かれている時間**と、**今日がどの行か**まで。
 *
 * @param {{ key: string, label: string, spans: string[], closed: boolean }[]} days
 * @param {string | null} today
 * @returns {HTMLElement}
 */
export function renderHours(days, today) {
  const box = document.createElement("div");
  box.className = "mmj-popup-hours";

  for (const day of days) {
    const row = document.createElement("div");
    row.className = "mmj-popup-hours-row";
    // **今日の行だけ強くする。**これは判断ではなく暦
    if (day.key === today) row.setAttribute("data-today", "");

    const label = document.createElement("span");
    label.className = "mmj-popup-hours-day";
    label.textContent = day.key === today ? `${day.label}（今日）` : day.label;

    const value = document.createElement("span");
    value.className = "mmj-popup-hours-span";
    // **空欄にしない。**休みなのか書き忘れなのか、読む人には区別がつかない
    value.textContent = day.closed ? "休み" : day.spans.join(" / ");

    row.append(label, value);
    box.append(row);
  }
  return box;
}

/** タブの通し番号。**同じ頁に複数の地図が載る**ので、id が衝突しないようにする */
let tabSerial = 0;

/**
 * タブ付きのカードの中身を組む。
 *
 * **題と写真は上に残す**（`splitForTabs`）。タブを切り替えても、
 * どの店を見ているかが消えない。
 *
 * **パネルは消さずに隠す。**作り直すと、**そのタブで読んでいた位置が毎回戻る**。
 *
 * **タブが 1 枚のときは帯を出さない。**押し先が 1 つしかないタブは、
 * 押せると思わせるだけで何も起きない（`controlsFor` と同じ）。
 *
 * @param {{ parts: any[], tabs: { label: string, text?: string, node?: HTMLElement }[] }} input
 * @returns {HTMLElement}
 */
export function renderTabbed(input) {
  const { head, rest } = splitForTabs(input.parts);
  const box = renderPopup(head);

  /** @type {{ label: string, node: HTMLElement }[]} */
  const panels = [];
  // **最初のタブは「概要」。**星・長文・リンクは、いままでどおり最初に見える
  if (rest.length > 0) panels.push({ label: "概要", node: renderPopup(rest) });
  for (const tab of input.tabs ?? []) {
    // **組み上げた要素のタブも受ける**（口コミ・営業時間はただの文字ではない）
    if (tab.node instanceof HTMLElement) {
      panels.push({ label: tab.label, node: tab.node });
      continue;
    }
    const node = document.createElement("div");
    node.className = "mmj-popup-copy mmj-popup-panel";
    // **改行を残す。**品書きもクーポンも、行で分かれているのが中身そのもの
    node.textContent = tab.text ?? "";
    panels.push({ label: tab.label, node });
  }

  if (panels.length === 0) return box;
  const only = panels[0];
  if (panels.length === 1 && only) {
    box.append(only.node);
    return box;
  }

  const group = ++tabSerial;
  const bar = document.createElement("div");
  bar.className = "mmj-popup-tabs";
  bar.setAttribute("role", "tablist");

  /** @type {HTMLButtonElement[]} */
  const buttons = [];

  /** @param {number} at */
  const select = (at) => {
    for (const [index, button] of buttons.entries()) {
      const on = index === at;
      button.setAttribute("aria-selected", String(on));
      // **選んでいるタブだけを Tab で拾う**（ARIA の作法。押せる物が増え続けない）
      button.tabIndex = on ? 0 : -1;
      const panel = panels[index];
      if (panel) panel.node.hidden = !on;
    }
  };

  for (const [index, panel] of panels.entries()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mmj-popup-tab";
    button.textContent = panel.label;
    button.id = `mmj-tab-${group}-${index}`;
    button.setAttribute("role", "tab");
    panel.node.id = `mmj-panel-${group}-${index}`;
    panel.node.setAttribute("role", "tabpanel");
    panel.node.setAttribute("aria-labelledby", button.id);
    button.setAttribute("aria-controls", panel.node.id);
    button.addEventListener("click", (event) => {
      // **地図まで届かせない。**`closeOnClick` で、押した瞬間にカードが閉じる
      event.stopPropagation();
      event.preventDefault();
      select(index);
    });
    button.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.stopPropagation();
      event.preventDefault();
      const next = stepIndex(index, event.key === "ArrowRight" ? 1 : -1, buttons.length);
      select(next);
      buttons[next]?.focus();
    });
    buttons.push(button);
    bar.append(button);
  }

  box.append(bar, ...panels.map((p) => p.node));
  select(0);
  return box;
}

/**
 * その配色の CSS を `<head>` に 1 枚だけ入れ、使うクラス名を返す。
 *
 * **配色ごとに分ける。**1 枚を共有すると、配色違いの地図を並べたとき
 * 最初の 1 枚の色が全部へ効く（`themes.html` は 6 枚並ぶ）。
 *
 * @param {{ background: string, text: string, border: string }} colors
 * @returns {string}
 */
export function ensurePopupContrast(colors) {
  const className = themeClassName(colors);
  if (!document.getElementById(className)) {
    const style = document.createElement("style");
    style.id = className;
    style.textContent = buildPopupStyle(colors, className);
    document.head.append(style);
  }
  return className;
}

/**
 * カードの CSS を `<head>` へ入れる。**吹き出しの CSS とは別の `<style>`。**
 *
 * 分けるのは、**短い吹き出しにはカードの指定が要らない**ため。
 * 同じ配色なら 1 回だけ入る（`id` で見ている）。
 *
 * @param {{ background: string, text: string, border: string }} colors
 * @param {string} className 吹き出しと同じ配色のクラス名
 */
export function ensureCardContrast(colors, className) {
  const id = `${className}-card`;
  if (!document.getElementById(id)) {
    const style = document.createElement("style");
    style.id = id;
    style.textContent = buildCardStyle(colors, className);
    document.head.append(style);
  }
  return className;
}

/**
 * 親の地図が読んだ配色を借りる。読めないところだけ既定へ落とす。
 *
 * **部品が色を持たないようにするため**（baseline §11）。以前は暗いスタイルの値を
 * 焼き込んでいたので、明るいスタイルの上でポップアップだけ暗い箱になっていた。
 *
 * @param {Element | null} parent
 */
export function popupColorsFrom(parent) {
  const theme = /** @type {any} */ (parent)?.theme;
  return {
    // **面は地図より暗くしない**（`surfaceFor` に理由と実測）。
    // 地色をそのまま使うと明るい土台で箱が溶け、縁取り色をそのまま使うと
    // **暗い土台で真っ黒の穴になる**（対比 1.12・2026-09-30 の指摘）
    background:
      surfaceFor(theme?.background, theme?.text, theme?.surface) ??
      theme?.surface ??
      theme?.background ??
      POPUP_COLORS.background,
    text: theme?.text ?? POPUP_COLORS.text,
    border: theme?.border ?? POPUP_COLORS.border,
  };
}
