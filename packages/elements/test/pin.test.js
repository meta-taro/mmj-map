import { describe, expect, it } from "vitest";

import { PIN_PHOTO, firstImageUrl, pinImageExpression, pinImageId, pinImageUrl, pinPath } from "../src/pin.js";

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
describe("pinImageId / pinImageUrl", () => {
  it("id から URL へ戻せる", () => {
    const id = pinImageId("shops", "./data/photos/akari-1.jpg");
    expect(pinImageUrl("shops", id)).toBe("./data/photos/akari-1.jpg");
  });

  it("別の source の id は読まない（**他人の画像を横取りしない**）", () => {
    const id = pinImageId("shops", "./a.jpg");
    expect(pinImageUrl("places", id)).toBeNull();
  });

  it("ピン以外の id は読まない", () => {
    expect(pinImageUrl("shops", "shops--cafe")).toBeNull();
    expect(pinImageUrl("shops", "")).toBeNull();
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

describe("pinImageExpression", () => {
  it("属性名と前置きを含む式を返す", () => {
    const expression = pinImageExpression("photos", "shops");
    expect(Array.isArray(expression)).toBe(true);
    const json = JSON.stringify(expression);
    expect(json).toContain("photos");
    expect(json).toContain("shops");
  });

  it("**値が無い地物は、空の id になる**（描こうとしない）", () => {
    const json = JSON.stringify(pinImageExpression("photos", "shops"));
    expect(json).toContain("has");
  });
});
