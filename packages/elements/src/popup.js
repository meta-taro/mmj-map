/**
 * 吹き出しの中身を組む。**ここは純粋関数**で、DOM は要素側が作る。
 *
 * **`setHTML` を使わない。**媒体が登録した文字列をそのまま HTML として実行すると、
 * `<img onerror=...>` の 1 行で、その地図を置いたページ全体が乗っ取られる。
 * この製品は「媒体側が POI を登録する」使い方を想定しているので、
 * **入ってくる文字列を信用しない**（baseline §21）。
 *
 * ここが返すのは**組み立ての指示**だけ。要素側が `createElement` と
 * `textContent` で組むので、文字が HTML として解釈される経路が存在しない。
 */

/**
 * 画像の URL として通してよいか。
 *
 * **通すのは http / https と相対パスだけ。**
 * `javascript:` は `src` に入れられると押した瞬間に走る。
 * `data:` は「画像に見せかけた SVG」からスクリプトが走る経路がある。
 * **迷ったら通さない**（通した結果は、置いた人のページで起きる）。
 * @param {string} value
 */
function isSafeImage(value) {
  const trimmed = value.trim();
  if (trimmed === "") return false;
  // スキーム付きなら http/https だけ。無ければ相対パスなので通す
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed);
  if (scheme === null) return true;
  const name = scheme[1]?.toLowerCase();
  return name === "http" || name === "https";
}

/**
 * @typedef {{ kind: "image", src: string, alt: string } | { kind: "text", text: string }} PopupPart
 */

/**
 * @param {{ text?: string | null, image?: string | null, imageAlt?: string | null }} input
 * @returns {PopupPart[]} **中身が無ければ空**（空の箱を開かないため）
 */
export function buildPopupContent(input) {
  /** @type {PopupPart[]} */
  const parts = [];

  const image = typeof input.image === "string" ? input.image.trim() : "";
  const text = typeof input.text === "string" ? input.text : "";

  // 写真が先、文字が後。**見る順に並べる**
  if (image !== "" && isSafeImage(image)) {
    // 代替テキストは文字から取る。**写真だけの吹き出しを、読み上げで無にしない**
    const alt = typeof input.imageAlt === "string" && input.imageAlt !== "" ? input.imageAlt : text;
    parts.push({ kind: "image", src: image, alt });
  }

  if (text !== "") parts.push({ kind: "text", text });

  return parts;
}
