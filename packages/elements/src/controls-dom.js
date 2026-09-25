/**
 * 地図の部品（帰属表示・縮尺）を、読み込んだ配色に合わせる DOM 側。
 *
 * **`attrs.js` が CSS を組み、ここが `<head>` へ入れる。**吹き出しの `popup-dom.js` と
 * 同じ分け方で、判断（純粋関数）と DOM を混ぜない。
 *
 * **なぜ要るか。**MapLibre の帰属表示と縮尺は白地で来る。暗い地図の隅に置くと
 * **紙が 2 枚浮いて見える**。吹き出しは D-019 で直したが、この 2 つは残っていた
 * （2026-09-25・人が指摘。公開デモ 10 枚すべてで出ていた）。
 *
 * **帰属表示は消さない・薄くしない。**ODbL の条件であって体裁ではない（`LICENSES.md`）。
 */
import { buildControlStyle } from "./attrs.js";
import { themeClassName } from "./palette.js";

/**
 * その配色の CSS を `<head>` に 1 枚だけ入れ、使うクラス名を返す。
 *
 * **配色ごとに分ける。**1 枚を共有すると、配色違いの地図を並べたとき
 * 最初の 1 枚の色が全部へ効く（`themes.html` は 6 枚並ぶ）。
 *
 * 接頭辞を `mmj-ctrl` にするのは、**吹き出しと同じ色でも CSS が別**だから。
 * 名前が同じだと片方の `<style>` しか入らない。
 *
 * @param {{ background: string, text: string, border: string }} colors
 * @returns {string} 地図の入れ物に付けるクラス名
 */
export function ensureControlContrast(colors) {
  const className = themeClassName(colors, "mmj-ctrl");
  if (!document.getElementById(className)) {
    const style = document.createElement("style");
    style.id = className;
    style.textContent = buildControlStyle(colors, className);
    document.head.append(style);
  }
  return className;
}
