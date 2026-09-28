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
import { themeClassName } from "./palette.js";
import { groupParts } from "./popup.js";

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
      box.append(strip);
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
      link.textContent = part.label ?? "";
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
    line.textContent = part.text ?? "";
    box.append(line);
  }
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
    // **地色ではなく surface。**地色を使うと明るい土台で箱が地図に溶ける
    background: theme?.surface ?? theme?.background ?? POPUP_COLORS.background,
    text: theme?.text ?? POPUP_COLORS.text,
    border: theme?.border ?? POPUP_COLORS.border,
  };
}
