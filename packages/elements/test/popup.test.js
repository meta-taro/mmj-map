import { describe, expect, it } from "vitest";

import { buildCardContent, buildPopupContent, formatRating, groupParts, isSafeLink } from "../src/popup.js";

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

  // 写真側も同じ読み方で弾く（理由は `isSafeLink` と同じ。リンクだけ直して
  // 画像を残すと、**同じ穴が片方だけ開いたまま**になる）
  it("**タブで分断した `javascript:` の画像も弾く**", () => {
    expect(buildPopupContent({ image: "java\tscript:alert(1)" })).toEqual([]);
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

  /**
   * **ブラウザは URL の中のタブと改行を、どこにあっても取り除く**
   * （WHATWG URL の "Remove all ASCII tab or newline from input"）。
   * つまり `href` へ入れた瞬間に `java<TAB>script:` は `javascript:` へ戻る。
   *
   * **スキームを文字列の見た目で判定すると、ここで分断されて素通りする。**
   * 2026-10-07 に実機で確認した: `a.href = "java<TAB>script:alert(1)"` のあと
   * `a.protocol` は `javascript:` になり、しかも `/^https?:/` に一致しないので
   * `target="_blank"` も付かない——**同じタブでそのまま走る**。
   *
   * 先頭の制御文字も同じ（URL の解釈前に C0 制御と空白が落ちる）。
   */
  it("**タブ・改行・制御文字で分断した `javascript:` も通さない**", () => {
    expect(isSafeLink("java\tscript:alert(1)"), "タブ").toBe(false);
    expect(isSafeLink("java\nscript:alert(1)"), "改行").toBe(false);
    expect(isSafeLink("java\rscript:alert(1)"), "復帰").toBe(false);
    expect(isSafeLink("\u0001javascript:alert(1)"), "先頭の制御文字").toBe(false);
    expect(isSafeLink("data\t:text/html,<script>alert(1)</script>"), "`data:` も同じ").toBe(false);
  });

  it("分断を弾いても、普通の URL は通ったまま", () => {
    expect(isSafeLink("https://example.com/a?b=1&c=2#d")).toBe(true);
    expect(isSafeLink("../other/shop.html")).toBe(true);
    expect(isSafeLink("#section")).toBe(true);
  });

  /**
   * **ここは穴ではない。**`//other.example/x` は外部の https になるが、
   * `https://other.example/x` と書くのと同じことで、**外部リンクはもともと通す**
   * （店のページ・SNS を出すための口なので）。
   *
   * 塞ぐなら「外部 http(s) を全部やめる」という別の決定が要る。
   * **片方だけ塞ぐと、書き方によって通ったり通らなかったりする**ので、
   * ここで通ることを固定しておく。
   */
  it("プロトコル相対は通す（外部 http(s) はもともと通す決まり）", () => {
    expect(isSafeLink("//other.example/x")).toBe(true);
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

/**
 * **写真が縦に積まると、星も長文もリンクも画面の外へ出る。**
 * 実測（2026-09-28）: 写真 2 枚で吹き出しが 422px になり、
 * 地図からはみ出して見出しバーがヘッダの下に潜った。
 *
 * **2 枚以上は横に流す。**1 枚なら流す必要がない（横スクロールの手がかりが邪魔になる）。
 */
/** @param {string} src */
const img = (src) => ({ kind: "image", src, alt: "" });

describe("groupParts", () => {

  it("**2 枚以上は 1 つのまとまりにする**", () => {
    const got = groupParts([img("a"), img("b"), { kind: "text", text: "灯" }]);
    expect(got.map((p) => p.kind)).toEqual(["gallery", "text"]);
    expect(got[0].images).toHaveLength(2);
  });

  it("**1 枚はそのまま**（横スクロールの手がかりが邪魔になる）", () => {
    expect(groupParts([img("a"), { kind: "text", text: "灯" }]).map((p) => p.kind)).toEqual([
      "image",
      "text",
    ]);
  });

  it("**並び順を変えない**（題が先、写真が後、の並びを壊さない）", () => {
    const got = groupParts([{ kind: "text", text: "灯" }, img("a"), img("b"), { kind: "link" }]);
    expect(got.map((p) => p.kind)).toEqual(["text", "gallery", "link"]);
  });

  it("**離れた写真はまとめない**（間に文字があるのは別の意図）", () => {
    const got = groupParts([img("a"), { kind: "text", text: "x" }, img("b")]);
    expect(got.map((p) => p.kind)).toEqual(["image", "text", "image"]);
  });

  it("写真が無ければ何もしない", () => {
    const parts = [{ kind: "text", text: "灯" }];
    expect(groupParts(parts)).toEqual(parts);
  });

  it("空でも落ちない", () => {
    expect(groupParts([])).toEqual([]);
  });
});
