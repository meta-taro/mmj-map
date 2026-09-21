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
import { themeClassName } from "./palette.js";

/**
 * 組み立ての指示から DOM を作る。
 * @param {{ kind: string, src?: string, alt?: string, text?: string }[]} parts
 * @returns {HTMLElement}
 */
export function renderPopup(parts) {
  const box = document.createElement("div");
  box.className = "mmj-popup-body";

  for (const part of parts) {
    if (part.kind === "image") {
      const img = document.createElement("img");
      img.src = part.src ?? "";
      img.alt = part.alt ?? "";
      // 開いた瞬間に取りに行かない。**閉じている吹き出しの写真まで読むと転送量が無駄になる**
      img.loading = "lazy";
      box.append(img);
      continue;
    }
    const line = document.createElement("div");
    line.className = "mmj-popup-text";
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
