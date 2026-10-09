import { describe, expect, it } from "vitest";

import {
  PIN_PHOTO,
  firstImageUrl,
  parsePinColors,
  pinImageExpression,
  pinImageId,
  pinImageParts,
  pinPath,
} from "../src/pin.js";

/**
 * ピンの形と、地物ごとの画像の id。**ここは純粋関数**で、
 * 描くのは要素側（道のり案内は SVG、お店の点は canvas）。
 *
 * **形を 2 か所に書かない。**同じ雫形を SVG と canvas の両方で使うので、
 * 道のり案内だけ直してお店側が古いまま、という壊れ方を防ぐ
 * （`Path2D` が SVG の `d` をそのまま受けるので、文字列 1 本で足りる）。
 */
describe("pinPath", () => {
  it("雫形の `d` を返す（`M` で始まり `Z` で閉じる）", () => {
    const d = pinPath(PIN_PHOTO);
    expect(d.startsWith("M ")).toBe(true);
    expect(d.trim().endsWith("Z")).toBe(true);
  });

  it("**先は丸の下端より下にある**（上にあるとピンに見えない）", () => {
    const { width, height } = PIN_PHOTO;
    expect(height).toBeGreaterThan(width);
  });

  it("**本体は写真より大きい**（差がそのまま輪になる）", () => {
    expect(PIN_PHOTO.body).toBeGreaterThan(PIN_PHOTO.radius);
  });
});

/**
 * 地物ごとに別の画像を出すので、**画像の id は URL から作る**。
 * MapLibre は描こうとしたときだけ `styleimagemissing` で聞いてくるので、
 * **id から URL へ戻せる**必要がある（そうしないと何を読めばいいか分からない）。
 */
describe("pinImageId / pinImageParts", () => {
  /**
   * **色も id に入れる。**入れないと、**同じ写真を使う 2 店が、
   * 先に描かれたほうの色で両方描かれる**（MapLibre は id で画像を使い回す）。
   */
  it("id から 色と URL へ戻せる", () => {
    const id = pinImageId("shops", "#C9A227", "./data/photos/akari-1.jpg");
    expect(pinImageParts("shops", id)).toEqual({
      color: "#C9A227",
      url: "./data/photos/akari-1.jpg",
    });
  });

  it("色が違えば、別の id になる（**使い回されない**）", () => {
    expect(pinImageId("shops", "#111111", "./a.jpg")).not.toBe(
      pinImageId("shops", "#222222", "./a.jpg"),
    );
  });

  it("別の source の id は読まない（**他人の画像を横取りしない**）", () => {
    const id = pinImageId("shops", "#000", "./a.jpg");
    expect(pinImageParts("places", id)).toBeNull();
  });

  it("ピン以外の id は読まない", () => {
    expect(pinImageParts("shops", "shops--cafe")).toBeNull();
    expect(pinImageParts("shops", "")).toBeNull();
  });
});

/**
 * 色は**導入側が指定する**（`DESIGN.md` の領域・baseline §11）。
 * `icons` と同じ「**値 → 何か**」の対応で受け取るので、覚えることが増えない。
 */
describe("parsePinColors", () => {
  it("`名前:色` を読む", () => {
    expect(parsePinColors("ramen:#E4572E,cafe:#C9A227")).toEqual([
      { name: "ramen", color: "#E4572E" },
      { name: "cafe", color: "#C9A227" },
    ]);
  });

  it("**色として読めないものは捨てる**（canvas が黙って透明にするので、気づけない）", () => {
    expect(parsePinColors("ramen:red,cafe:#C9A227")).toEqual([{ name: "cafe", color: "#C9A227" }]);
    expect(parsePinColors("x:#12,y:#1234567")).toEqual([]);
  });

  it("空は空", () => {
    expect(parsePinColors("")).toEqual([]);
    expect(parsePinColors(null)).toEqual([]);
  });
});

/**
 * `card-images` と同じ属性をそのまま渡せるようにする。
 * **複数枚あっても先頭 1 枚だけ**（`card-image-credit` で
 * 「推測で割り振らない」と決めたのと同じ考え方）。
 */
describe("firstImageUrl", () => {
  it("`,` と改行で割って、先頭を返す", () => {
    expect(firstImageUrl("./a.jpg,./b.jpg")).toBe("./a.jpg");
    expect(firstImageUrl(" ./a.jpg \n ./b.jpg ")).toBe("./a.jpg");
    expect(firstImageUrl(["./a.jpg", "./b.jpg"])).toBe("./a.jpg");
  });

  it("**安全でない URL は返さない**（canvas へ読み込む前に弾く）", () => {
    expect(firstImageUrl("javascript:alert(1)")).toBeNull();
    expect(firstImageUrl("java\tscript:alert(1)")).toBeNull();
    expect(firstImageUrl("data:image/svg+xml,<svg onload=alert(1)>")).toBeNull();
  });

  /**
   * **危ないものが混ざっていたら、その値ごと使わない。**
   *
   * `data:` は中に `,` を含む（`data:image/svg+xml,<svg …>`）。
   * **割ってから 1 つずつ見ると、後半が「相対パス」に見えて通ってしまう**
   * （実際、最初の実装はこれで試験に落ちた）。
   * 混ざった値から拾い直す利点より、**取りこぼす危険のほうが重い**。
   */
  it("**危ないものが混ざっていたら、その値ごと捨てる**", () => {
    expect(firstImageUrl("javascript:x,./ok.jpg")).toBeNull();
    expect(firstImageUrl("data:image/svg+xml,<svg onload=alert(1)>,./ok.jpg")).toBeNull();
  });

  it("中身が無ければ null", () => {
    expect(firstImageUrl("")).toBeNull();
    expect(firstImageUrl(null)).toBeNull();
    expect(firstImageUrl([])).toBeNull();
  });
});

/**
 * **写真と分類の絵を、1 本の仕組みに統合する。**
 *
 * 2026-10-09、「ピンが全部水色」「絵も同じピンに」という 2 つの指摘を受けた。
 * 色を地物ごとに変えるには**色も画像の id に入れる**必要があり、
 * 絵にもそれが要る。層を 2 本持つと id の作り方が 2 通りになるので、1 本にする。
 *
 * 絵は**分類 → URL**、写真は**その地物の属性**。**写真が優先**
 * （写真があるのに分類の絵を出す理由が無い）。
 */
describe("pinImageExpression", () => {
  const icons = [{ name: "ramen", url: "./icons/ramen.svg" }];

  it("写真の属性・分類の絵・色・前置きを含む式を返す", () => {
    const expression = pinImageExpression({
      sourceId: "shops",
      photoKey: "photos",
      iconKey: "category",
      icons,
      colorKey: "category",
      colors: [{ name: "ramen", color: "#E4572E" }],
      fallbackColor: "#3FB1CE",
    });
    const json = JSON.stringify(expression);
    expect(Array.isArray(expression)).toBe(true);
    expect(json).toContain("photos");
    expect(json).toContain("category");
    expect(json).toContain("./icons/ramen.svg");
    expect(json).toContain("#E4572E");
    expect(json).toContain("#3FB1CE");
    expect(json).toContain("shops");
  });

  it("**写真も絵も無い地物は、空の id**（描こうとしない＝丸のまま）", () => {
    const json = JSON.stringify(
      pinImageExpression({ sourceId: "shops", photoKey: "photos", fallbackColor: "#000" }),
    );
    expect(json).toContain("has");
  });

  it("色の対応が無ければ、既定の色だけを使う", () => {
    const json = JSON.stringify(
      pinImageExpression({ sourceId: "shops", photoKey: "photos", fallbackColor: "#3FB1CE" }),
    );
    expect(json).toContain("#3FB1CE");
  });
});
