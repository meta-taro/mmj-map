import { describe, expect, it } from "vitest";

import {
  CONTROL_LABELS,
  controlsFor,
  initialCardState,
  keyAction,
  NARROW_WIDTH,
  mapCardFields,
  needsChrome,
  nextCardState,
  readShopHash,
} from "../src/card.js";

/**
 * **目的は「地図から離れずに店を見て回る」こと。**
 *
 * 媒体や地図サービスはピンを押すと店舗ページへ飛ばすので、**戻ると地図が
 * 作り直され、どこまで見たかが消える**。しかも 1 店あたり 1〜3 MB 動く。
 *
 * 写真・タブ・長文を足す前に、**それを収められる容れ物**が要る。
 */

describe("nextCardState", () => {
  it("閉じているものを開くと吹き出しになる", () => {
    expect(nextCardState("closed", "open")).toBe("popup");
  });

  /**
   * **最大化中に目印を押しても縮まない。**
   * 読んでいる最中に勝手に小さくなると、**何が起きたか分からない**。
   */
  it("**開いているものを開き直さない**", () => {
    expect(nextCardState("maximized", "open")).toBe("maximized");
    expect(nextCardState("popup", "open")).toBe("popup");
  });

  it("広げる・戻す", () => {
    expect(nextCardState("popup", "maximize")).toBe("maximized");
    expect(nextCardState("maximized", "restore")).toBe("popup");
  });

  it("**閉じているものは広げない**（中身が無い箱を開かない）", () => {
    expect(nextCardState("closed", "maximize")).toBe("closed");
  });

  it("吹き出しのときに「戻す」を言われても、閉じない", () => {
    expect(nextCardState("popup", "restore")).toBe("popup");
  });

  it("どの状態からでも閉じられる", () => {
    for (const state of /** @type {const} */ (["closed", "popup", "maximized"])) {
      expect(nextCardState(state, "close")).toBe("closed");
    }
  });

  it("**知らない指示では状態を変えない**", () => {
    expect(nextCardState("popup", /** @type {any} */ ("wiggle"))).toBe("popup");
  });
});

describe("controlsFor", () => {
  /**
   * **押しても何も起きないボタンを置かない。**
   * 壊れているのか仕様なのか、押した人には区別がつかない。
   */
  it("最大化中に「最大化」を出さない", () => {
    expect(controlsFor("maximized")).toEqual(["restore", "close"]);
    expect(controlsFor("maximized")).not.toContain("maximize");
  });

  it("吹き出しのときに「戻す」を出さない", () => {
    expect(controlsFor("popup")).toEqual(["maximize", "close"]);
  });

  it("閉じているときは何も出さない", () => {
    expect(controlsFor("closed")).toEqual([]);
  });

  it("**どの状態でも閉じられる**（閉じる手段を奪わない）", () => {
    expect(controlsFor("popup")).toContain("close");
    expect(controlsFor("maximized")).toContain("close");
  });

  it("**記号だけにしない。**読み上げにも押す人にも伝わらない", () => {
    for (const name of /** @type {const} */ (["maximize", "restore", "close"])) {
      expect(CONTROL_LABELS[name].length).toBeGreaterThan(1);
    }
  });
});

describe("needsChrome", () => {
  /**
   * **短い吹き出しには見出しバーを付けない。**
   * 「大阪城」の 3 文字にボタンを並べると、**箱がボタンで埋まる**
   * （閉じるボタンを外したのと同じ理由）。
   */
  it("文字だけなら、今までどおりの吹き出し", () => {
    expect(needsChrome([{ kind: "text", text: "大阪城" }])).toBe(false);
  });

  it("写真が付いたら容れ物にする", () => {
    expect(needsChrome([{ kind: "image" }, { kind: "text" }])).toBe(true);
  });

  it("中身が無ければ付けない", () => {
    expect(needsChrome([])).toBe(false);
    expect(needsChrome(/** @type {any} */ (null))).toBe(false);
  });
});

describe("initialCardState", () => {
  /**
   * **幅 360px の吹き出しに写真とタブは入らない。**
   * 吹き出しは地図の上に浮くので、画面が狭いほど
   * 「地図が見えない・中身も読めない」の両方が起きる。
   */
  it("狭い画面では、中身があるものは最大化から始める", () => {
    expect(initialCardState({ width: 390, rich: true })).toBe("maximized");
  });

  it("広い画面では吹き出しから", () => {
    expect(initialCardState({ width: 1280, rich: true })).toBe("popup");
  });

  it("**短い吹き出しは、狭い画面でも広げない**（広げても中身が無い）", () => {
    expect(initialCardState({ width: 390, rich: false })).toBe("popup");
  });

  it("境目は含まない（**ちょうど NARROW_WIDTH は広い側**）", () => {
    expect(initialCardState({ width: NARROW_WIDTH, rich: true })).toBe("popup");
    expect(initialCardState({ width: NARROW_WIDTH - 1, rich: true })).toBe("maximized");
  });
});

describe("keyAction", () => {
  /**
   * **Escape は 1 段だけ戻す。**最大化中にいきなり閉じると、
   * **読んでいた店が消える**（ブラウザの全画面と同じ挙動にする）。
   */
  it("最大化中は、まず吹き出しへ戻す", () => {
    expect(keyAction("Escape", "maximized")).toBe("restore");
  });

  it("吹き出しのときは閉じる", () => {
    expect(keyAction("Escape", "popup")).toBe("close");
  });

  it("閉じているときは何もしない", () => {
    expect(keyAction("Escape", "closed")).toBeNull();
  });

  it("**他のキーを奪わない**（地図の操作を邪魔しない）", () => {
    expect(keyAction("ArrowUp", "maximized")).toBeNull();
    expect(keyAction("Enter", "popup")).toBeNull();
  });
});

/**
 * **500 店を手書きしない。**「どの属性に何が入っているか」だけを受け取る
 * （`<mmj-poi label-key="shop_name">` と同じ発想）。
 *
 * **媒体ごとに名前も書き出し方も違う。**推測すると当たらない。
 */
describe("mapCardFields", () => {
  const keys = {
    title: "shop_name", images: "photos", body: "description",
    rating: "rating", ratingCount: "reviews", href: "url", hrefLabel: "お店のページ",
  };

  it("指定された属性から読む", () => {
    const got = mapCardFields(
      { shop_name: "灯", description: "築 90 年", rating: 4.3, reviews: 128, url: "/shops/akari" },
      keys,
    );
    expect(got.title).toBe("灯");
    expect(got.body).toBe("築 90 年");
    expect(got.rating).toBe(4.3);
    expect(got.ratingCount).toBe(128);
    expect(got.href).toBe("/shops/akari");
  });

  it("**写真は配列でも受ける**", () => {
    expect(mapCardFields({ photos: ["./1.jpg", "./2.jpg"] }, keys).images).toEqual(["./1.jpg", "./2.jpg"]);
  });

  /**
   * **GeoJSON の属性に配列を入れられない書き出し方をする媒体がある。**
   * 実際に多いので、区切り文字も受ける。
   */
  it("**写真は区切り文字でも受ける**（`,` と改行）", () => {
    expect(mapCardFields({ photos: "./1.jpg, ./2.jpg" }, keys).images).toEqual(["./1.jpg", "./2.jpg"]);
    expect(mapCardFields({ photos: "./1.jpg\n./2.jpg" }, keys).images).toEqual(["./1.jpg", "./2.jpg"]);
  });

  it("**空白では割らない**（将来ここを題名へ使い回したときに壊れる）", () => {
    expect(mapCardFields({ photos: "./a b.jpg" }, keys).images).toEqual(["./a b.jpg"]);
  });

  it("**数が文字列で来ても読む**（媒体の書き出しは `\"4.3\"` のことがある）", () => {
    const got = mapCardFields({ rating: "4.3", reviews: "128" }, keys);
    expect(got.rating).toBe(4.3);
    expect(got.ratingCount).toBe(128);
  });

  it("**数として読めないものは落とす**（`「よい」` を星にしない）", () => {
    expect(mapCardFields({ rating: "よい" }, keys).rating).toBeUndefined();
  });

  it("属性名が指定されていなければ読まない（**推測しない**）", () => {
    const got = mapCardFields({ name: "灯" }, { title: null, images: null, body: null, rating: null, ratingCount: null, href: null, hrefLabel: null });
    expect(got.title).toBeUndefined();
    expect(got.images).toEqual([]);
  });

  it("中身が無くても落ちない", () => {
    expect(() => mapCardFields(/** @type {any} */ (null), keys)).not.toThrow();
  });
});

/**
 * **「この店いいよ」と送るのは頁の共有。**復元できないと、結局
 * 店舗ページへ飛ばすことになり、**地図で完結させた意味が消える**。
 */
describe("readShopHash", () => {
  it("`#shop=` を読む", () => {
    expect(readShopHash("#shop=akari")).toBe("akari");
  });

  it("他の hash と混ざっていても読む（`#12/34.7/135.5` と共存する）", () => {
    expect(readShopHash("#12/34.7/135.5&shop=akari")).toBe("akari");
  });

  it("**符号化された名前を戻す**（日本語の id が来る）", () => {
    expect(readShopHash(`#shop=${encodeURIComponent("灯")}`)).toBe("灯");
  });

  it("無ければ null", () => {
    expect(readShopHash("#12/34.7/135.5")).toBeNull();
    expect(readShopHash("")).toBeNull();
    expect(readShopHash(/** @type {any} */ (null))).toBeNull();
  });

  it("**壊れた URL で落とさない**（地図は出す）", () => {
    expect(readShopHash("#shop=%E0%A4%A")).toBeNull();
  });
});
