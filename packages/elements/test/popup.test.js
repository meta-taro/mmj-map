import { describe, expect, it } from "vitest";

import { buildCardContent, buildPopupContent, formatRating, isSafeLink } from "../src/popup.js";

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

/**
 * **カードの中身。**段階 2 以降で写真・星・リンク・長文・タブを置くための型。
 *
 * **`setHTML` は使わない**（`popup.js` の頭）。媒体が登録した文字列を
 * そのまま HTML として実行すると、`<img onerror=...>` の 1 行でページが乗っ取られる。
 * **ここで返すのは組み立ての指示だけ**で、DOM は要素側が `createElement` で組む。
 */
describe("isSafeLink", () => {
  it("http / https / 相対は通す", () => {
    expect(isSafeLink("https://example.com/shop")).toBe(true);
    expect(isSafeLink("http://example.com/shop")).toBe(true);
    expect(isSafeLink("/shops/akari")).toBe(true);
    expect(isSafeLink("./shops/akari")).toBe(true);
  });

  it("**電話とメールは通す**（店の情報として普通に要る）", () => {
    expect(isSafeLink("tel:+81-6-1234-5678")).toBe(true);
    expect(isSafeLink("mailto:shop@example.com")).toBe(true);
  });

  /**
   * **`javascript:` は押した瞬間に走る。**媒体が登録した文字列が
   * `href` に入る作りなので、ここを通すとその地図を置いたページが乗っ取られる。
   */
  it("**`javascript:` は通さない**", () => {
    expect(isSafeLink("javascript:alert(1)")).toBe(false);
    expect(isSafeLink("JavaScript:alert(1)"), "大文字でも").toBe(false);
    expect(isSafeLink(" javascript:alert(1)"), "前に空白があっても").toBe(false);
  });

  it("`data:` も通さない（画像と同じ理由）", () => {
    expect(isSafeLink("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  it("空は通さない", () => {
    expect(isSafeLink("")).toBe(false);
    expect(isSafeLink(null)).toBe(false);
  });
});

describe("formatRating", () => {
  /**
   * **星だけにしない。**読み上げには「★★★★☆」が伝わらないし、
   * **件数が無い評価は根拠が無い**。
   */
  it("値と件数を、読める形にする", () => {
    expect(formatRating(4.3, 128)).toBe("4.3 / 5（128 件）");
  });

  it("件数が無ければ値だけ", () => {
    expect(formatRating(4.3, null)).toBe("4.3 / 5");
  });

  it("**読めない値は出さない**（0 件の星を出すと、評価が無いのに有るように見える）", () => {
    expect(formatRating(null, 10)).toBeNull();
    expect(formatRating(Number.NaN, 10)).toBeNull();
    expect(formatRating("よい", 10)).toBeNull();
  });

  it("範囲の外は丸める（**6 点の星を出さない**）", () => {
    expect(formatRating(9, null)).toBe("5 / 5");
    expect(formatRating(-2, null)).toBe("0 / 5");
  });
});

describe("buildCardContent", () => {
  it("**写真を何枚でも受ける**（1 枚しか出せないと、店の紹介にならない）", () => {
    const parts = buildCardContent({ images: ["./1.jpg", "./2.jpg"], title: "灯" });
    expect(parts.filter((p) => p.kind === "image")).toHaveLength(2);
  });

  it("**危ない写真は落として、残りは出す**（1 枚のせいで全部消さない）", () => {
    const parts = buildCardContent({ images: ["javascript:x", "./ok.jpg"], title: "灯" });
    expect(parts.filter((p) => p.kind === "image")).toHaveLength(1);
  });

  it("題・長文・星・リンクを並べる", () => {
    const parts = buildCardContent({
      title: "町家カフェ 灯",
      body: "築 90 年の町家を…",
      rating: 4.3,
      ratingCount: 128,
      href: "/shops/akari",
      hrefLabel: "お店のページ",
    });
    expect(parts.map((p) => p.kind)).toEqual(["text", "rating", "body", "link"]);
  });

  it("**危ないリンクは落とす**", () => {
    const parts = buildCardContent({ title: "灯", href: "javascript:alert(1)" });
    expect(parts.some((p) => p.kind === "link")).toBe(false);
  });

  it("**リンクに文字が無ければ既定を入れる**（`undefined` と書かれたリンクを出さない）", () => {
    const link = buildCardContent({ title: "灯", href: "/x" }).find((p) => p.kind === "link");
    expect(link?.label.length).toBeGreaterThan(0);
  });

  it("**中身が無ければ空**（空の箱を開かない）", () => {
    expect(buildCardContent({})).toEqual([]);
    expect(buildCardContent({ title: "  " })).toEqual([]);
  });
});
