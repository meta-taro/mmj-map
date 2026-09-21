import { describe, expect, it } from "vitest";

import { buildPopupContent } from "../src/popup.js";

/**
 * 吹き出しの中身。**ここは純粋関数**で、DOM は要素側が作る。
 *
 * **`setHTML` を使わない。**媒体が入れた文字列をそのまま HTML として実行すると、
 * `<img onerror=...>` の 1 行で、その地図を置いたページ全体が乗っ取られる。
 * 「自前の POI を媒体に登録してもらう」という使い方を想定している以上、
 * **入ってくる文字列を信用しない**（baseline §21）。
 */
describe("buildPopupContent", () => {
  it("文字だけなら、文字の部品を 1 つ返す", () => {
    expect(buildPopupContent({ text: "北浜" })).toEqual([{ kind: "text", text: "北浜" }]);
  });

  it("**写真が先、文字が後**（見る順に並べる）", () => {
    expect(buildPopupContent({ text: "北浜", image: "https://x.example/a.jpg" })).toEqual([
      { kind: "image", src: "https://x.example/a.jpg", alt: "北浜" },
      { kind: "text", text: "北浜" },
    ]);
  });

  it("**代替テキストは文字から取る。**取れないときだけ空にする", () => {
    expect(buildPopupContent({ image: "a.jpg" })[0]).toEqual({
      kind: "image",
      src: "a.jpg",
      alt: "",
    });
    expect(buildPopupContent({ image: "a.jpg", imageAlt: "店の外観" })[0]).toEqual({
      kind: "image",
      src: "a.jpg",
      alt: "店の外観",
    });
  });

  it("写真だけでも出せる", () => {
    expect(buildPopupContent({ image: "a.jpg" })).toHaveLength(1);
  });

  it("中身が無ければ空を返す（**空の箱を開かない**）", () => {
    expect(buildPopupContent({})).toEqual([]);
    expect(buildPopupContent({ text: "" })).toEqual([]);
  });

  it("**`javascript:` の画像を弾く。**`src` に入れられると押した瞬間に走る", () => {
    expect(buildPopupContent({ image: "javascript:alert(1)" })).toEqual([]);
    expect(buildPopupContent({ image: " JavaScript:alert(1) " })).toEqual([]);
  });

  it("`data:` の画像も弾く（**画像に見せかけた SVG からスクリプトが走る**）", () => {
    expect(buildPopupContent({ image: "data:image/svg+xml,<svg onload=alert(1)>" })).toEqual([]);
  });

  it("http / https / 相対パスは通す", () => {
    for (const src of ["https://x.example/a.jpg", "http://x.example/a.jpg", "./a.jpg", "/a.jpg"]) {
      const part = /** @type {any} */ (buildPopupContent({ image: src })[0]);
      expect(part?.src, src).toBe(src);
    }
  });

  it("**文字は文字のまま返す。**ここで HTML へ変えない", () => {
    const content = buildPopupContent({ text: "<script>alert(1)</script>" });
    expect(content[0]).toEqual({ kind: "text", text: "<script>alert(1)</script>" });
  });
});
