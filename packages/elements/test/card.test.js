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
  readShopParam,
  stepIndex,
  indexOfShop,
  writeShopParam,
  panDelta,
  nearestByPoint,
  parseTabs,
  buildTabs,
  splitForTabs,
  parseLinks,
  buildLinks,
  parseLive,
  liveUrl,
  readLiveText,
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
   *
   * **だからといって全面にはしない。**地図が消えると、
   * 「押した点」と「出てきた面」のつながりが切れる
   * （2026-09-29・人からの指摘「なんおこっちゃとなりました」）。
   */
  it("狭い画面では、中身があるものは下から出る面で始める", () => {
    expect(initialCardState({ width: 390, rich: true })).toBe("sheet");
  });

  it("広い画面では吹き出しから", () => {
    expect(initialCardState({ width: 1280, rich: true })).toBe("popup");
  });

  it("**短い吹き出しは、狭い画面でも広げない**（広げても中身が無い）", () => {
    expect(initialCardState({ width: 390, rich: false })).toBe("popup");
  });

  it("境目は含まない（**ちょうど NARROW_WIDTH は広い側**）", () => {
    expect(initialCardState({ width: NARROW_WIDTH, rich: true })).toBe("popup");
    expect(initialCardState({ width: NARROW_WIDTH - 1, rich: true })).toBe("sheet");
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
describe("readShopParam", () => {
  it("`?shop=` を読む", () => {
    expect(readShopParam("?shop=akari")).toBe("akari");
  });

  it("他の値と混ざっていても読む（`?utm_source=mail` と共存する）", () => {
    expect(readShopParam("?utm_source=mail&shop=akari")).toBe("akari");
  });

  it("**符号化された名前を戻す**（日本語の id が来る）", () => {
    expect(readShopParam(`?shop=${encodeURIComponent("灯")}`)).toBe("灯");
  });

  it("無ければ null", () => {
    expect(readShopParam("?utm_source=mail")).toBeNull();
    expect(readShopParam("")).toBeNull();
    expect(readShopParam(/** @type {any} */ (null))).toBeNull();
  });

  /** **`#` に置かない。**`<mmj-map hash>` の MapLibre が自分の形以外を捨てる */
  it("hash に書かれていても読まない（地図が消すため置き場所にしない）", () => {
    expect(readShopParam("#12/34.7/135.5&shop=akari")).toBeNull();
  });

  it("**壊れた URL で落とさない**（地図は出す）", () => {
    expect(readShopParam("?shop=%E0%A4%A")).toBeNull();
  });
});

/**
 * **段階 3 — 地図から離れずに、隣の店へ送る。**
 *
 * 1 店見るたびに吹き出しを閉じて次のピンを探すのでは、**結局「一覧へ戻る」をやっている**。
 * カードを開いたまま送れて、いま見ている店が URL に残ることまでが 1 組。
 */
describe("stepIndex", () => {
  it("次へ・前へ", () => {
    expect(stepIndex(0, 1, 3)).toBe(1);
    expect(stepIndex(1, -1, 3)).toBe(0);
  });

  /**
   * **端で止めない（巡回する）。**
   * 端だけボタンを消すと**バーの並びがずれて**、押す場所が動く。
   * 端で無反応にすると、**壊れているのか端なのか区別がつかない**（`controlsFor` と同じ理由）。
   */
  it("端まで行ったら反対側へ回る", () => {
    expect(stepIndex(2, 1, 3)).toBe(0);
    expect(stepIndex(0, -1, 3)).toBe(2);
  });

  it("1 件しかなければ動かない", () => {
    expect(stepIndex(0, 1, 1)).toBe(0);
    expect(stepIndex(0, -1, 1)).toBe(0);
  });

  it("**壊れた値で落とさない**（地図は出す）", () => {
    expect(stepIndex(0, 1, 0)).toBe(0);
    expect(stepIndex(/** @type {any} */ ("x"), 1, 3)).toBe(1);
    expect(stepIndex(0, 1, /** @type {any} */ (null))).toBe(0);
  });
});

describe("controlsFor（隣がいるとき）", () => {
  it("隣がいれば「前へ」「次へ」を出す", () => {
    expect(controlsFor("popup", 3)).toEqual(["prev", "next", "maximize", "close"]);
    expect(controlsFor("maximized", 3)).toEqual(["prev", "next", "restore", "close"]);
  });

  /** **押しても何も起きないボタンを置かない**（1 件だけの地図で送り先は無い） */
  it("1 件しかなければ出さない", () => {
    expect(controlsFor("popup", 1)).toEqual(["maximize", "close"]);
    expect(controlsFor("popup", 0)).toEqual(["maximize", "close"]);
  });

  it("閉じているときは何も出さない", () => {
    expect(controlsFor("closed", 3)).toEqual([]);
  });

  it("**記号だけにしない**", () => {
    for (const name of /** @type {const} */ (["prev", "next"])) {
      expect(CONTROL_LABELS[name].length).toBeGreaterThan(1);
    }
  });
});

describe("indexOfShop", () => {
  const features = [
    { properties: { shop_id: "akari", name: "灯" } },
    { properties: { shop_id: "hibi", name: "日々" } },
  ];

  it("id で引く", () => {
    expect(indexOfShop(features, "shop_id", "hibi")).toBe(1);
  });

  /** **数で書き出す媒体がある。**`1` と `"1"` を別物にしない */
  it("数で入っていても引ける", () => {
    expect(indexOfShop([{ properties: { id: 7 } }], "id", "7")).toBe(0);
  });

  it("無ければ -1", () => {
    expect(indexOfShop(features, "shop_id", "kumo")).toBe(-1);
    expect(indexOfShop(features, "shop_id", null)).toBe(-1);
    expect(indexOfShop(features, null, "akari")).toBe(-1);
    expect(indexOfShop(/** @type {any} */ (null), "shop_id", "akari")).toBe(-1);
  });
});

/**
 * **「この店いいよ」と送れること。**
 * 復元できないと、結局その店のページへ飛ばすことになり、地図で完結させた意味が消える。
 */
describe("writeShopParam", () => {
  it("何も無いところへ足す", () => {
    expect(writeShopParam("", "akari")).toBe("?shop=akari");
  });

  /** **媒体が付けた値を消さない**（どこから来た頁かが分からなくなる） */
  it("ほかの値を残したまま足す", () => {
    expect(writeShopParam("?utm_source=mail", "akari")).toBe("?utm_source=mail&shop=akari");
  });

  it("すでにあれば差し替える（増やさない）", () => {
    expect(writeShopParam("?utm_source=mail&shop=akari", "hibi")).toBe("?utm_source=mail&shop=hibi");
  });

  it("閉じたら外す", () => {
    expect(writeShopParam("?utm_source=mail&shop=akari", null)).toBe("?utm_source=mail");
    expect(writeShopParam("?shop=akari", null)).toBe("");
  });

  it("知らない値には触らない", () => {
    expect(writeShopParam("?a=1&shop=x&b=2", "y")).toBe("?a=1&b=2&shop=y");
  });

  /** **記号と日本語を通す。**`readShopParam` と往復できること */
  it("読み書きが往復する", () => {
    for (const id of ["灯", "a&b", "a b", "100%"]) {
      expect(readShopParam(writeShopParam("?utm_source=mail", id))).toBe(id);
    }
  });
});

/**
 * **カードは地図からはみ出す。**吹き出しは地図の座標に貼り付いているので、
 * 端の点を押すと、そのぶん外へ出る。
 *
 * **外に出たカードは、押せないだけでは済まない。**実測（2026-09-28）では
 * 地図の上端 y=265 に対して吹き出しの上端が y=168 になり、**頁のヘッダの下に潜って、
 * カードのボタンを押したつもりがメニューのリンクを押していた**
 * （別の頁へ飛ぶので、見ていた店も地図も消える）。
 */
describe("panDelta", () => {
  const map = { top: 100, bottom: 600, left: 0, right: 800 };

  it("収まっていれば動かさない", () => {
    expect(panDelta({ top: 200, bottom: 500, left: 100, right: 300 }, map)).toEqual([0, 0]);
  });

  /** `panBy` に渡す値。**地図を送る向きと、画面で動く向きは逆** */
  it("上へはみ出していたら、下へ出るように送る", () => {
    expect(panDelta({ top: 50, bottom: 400, left: 100, right: 300 }, map, 8)).toEqual([0, -58]);
  });

  it("下へはみ出していたら、上へ出るように送る", () => {
    expect(panDelta({ top: 300, bottom: 650, left: 100, right: 300 }, map, 8)).toEqual([0, 58]);
  });

  it("横も同じ", () => {
    expect(panDelta({ top: 200, bottom: 500, left: -20, right: 200 }, map, 8)).toEqual([-28, 0]);
    expect(panDelta({ top: 200, bottom: 500, left: 700, right: 820 }, map, 8)).toEqual([28, 0]);
  });

  /**
   * **入りきらないときは上を優先する。**見出しバーと題が上にあるので、
   * 下が切れるより、**バーが画面の外にあるほうが困る**（閉じられない）。
   */
  it("地図より大きいときは、上を合わせる", () => {
    expect(panDelta({ top: 50, bottom: 900, left: 100, right: 300 }, map, 8)).toEqual([0, -58]);
  });

  it("**壊れた値で落とさない**（地図は出す）", () => {
    expect(panDelta(/** @type {any} */ (null), map)).toEqual([0, 0]);
    expect(panDelta({ top: 200, bottom: 500, left: 100, right: 300 }, /** @type {any} */ (null))).toEqual([0, 0]);
  });
});

/**
 * **段階 4 — タブ。**
 *
 * クーポン・品書き・シフトのような「時間で変わる中身」を長文の下に足していくと、
 * **開いた人は下まで読まない**。1 枚のカードに並べて、切り替えられるようにする。
 *
 * **渡すのは「見出し:属性名」で、値ではない**（`card-*` と同じ発想）。
 */
describe("parseTabs", () => {
  it("見出しと属性名の組を読む", () => {
    expect(parseTabs("品書き:menu,クーポン:coupon")).toEqual([
      { label: "品書き", key: "menu" },
      { label: "クーポン", key: "coupon" },
    ]);
  });

  it("前後の空白を落とす", () => {
    expect(parseTabs(" 品書き : menu , クーポン:coupon ")).toEqual([
      { label: "品書き", key: "menu" },
      { label: "クーポン", key: "coupon" },
    ]);
  });

  /** **壊れた指定で全部を捨てない。**書ける組だけ出す */
  it("組になっていないものは飛ばす", () => {
    expect(parseTabs("品書き:menu,こわれ,:key,label:")).toEqual([{ label: "品書き", key: "menu" }]);
  });

  it("同じ属性を二度出さない", () => {
    expect(parseTabs("品書き:menu,お品書き:menu")).toEqual([{ label: "品書き", key: "menu" }]);
  });

  it("無ければ空", () => {
    expect(parseTabs("")).toEqual([]);
    expect(parseTabs(null)).toEqual([]);
    expect(parseTabs(/** @type {any} */ (undefined))).toEqual([]);
  });
});

describe("buildTabs", () => {
  const spec = [
    { label: "品書き", key: "menu" },
    { label: "クーポン", key: "coupon" },
  ];

  it("中身のあるタブだけ出す（**空のタブを押させない**）", () => {
    expect(buildTabs({ menu: "珈琲 500 円", coupon: "   " }, spec)).toEqual([
      { label: "品書き", text: "珈琲 500 円" },
    ]);
  });

  it("数で入っていても出す", () => {
    expect(buildTabs({ menu: 500 }, [{ label: "品書き", key: "menu" }])).toEqual([
      { label: "品書き", text: "500" },
    ]);
  });

  it("中身が無ければ空", () => {
    expect(buildTabs({}, spec)).toEqual([]);
    expect(buildTabs(/** @type {any} */ (null), spec)).toEqual([]);
  });
});

/**
 * **写真と題は、タブを切り替えても出したまま。**
 * どの店を見ているかが消えると、**切り替えた先が何の店か分からなくなる**。
 */
describe("splitForTabs", () => {
  const parts = [
    { kind: "text", text: "町家カフェ 灯" },
    { kind: "image", src: "./1.jpg" },
    { kind: "image", src: "./2.jpg" },
    { kind: "rating", text: "4.3 / 5" },
    { kind: "body", text: "築 90 年" },
    { kind: "link", href: "./a" },
  ];

  it("題と写真は上に残し、残りをタブの中へ入れる", () => {
    const got = splitForTabs(parts);
    expect(got.head.map((p) => p.kind)).toEqual(["text", "image", "image"]);
    expect(got.rest.map((p) => p.kind)).toEqual(["rating", "body", "link"]);
  });

  it("写真が無くても題は残す", () => {
    const got = splitForTabs([{ kind: "text", text: "灯" }, { kind: "body", text: "…" }]);
    expect(got.head.map((p) => p.kind)).toEqual(["text"]);
    expect(got.rest.map((p) => p.kind)).toEqual(["body"]);
  });

  it("空でも落ちない", () => {
    expect(splitForTabs([])).toEqual({ head: [], rest: [] });
    expect(splitForTabs(/** @type {any} */ (null))).toEqual({ head: [], rest: [] });
  });
});

/**
 * **狭い画面では、全面にしない。**
 *
 * 幅 480px 未満でいきなり地図いっぱいに広げていたが、**地図が消えると
 * 「押した点」と「出てきた面」のつながりが切れる**。人からの言葉は
 * 「マップ全体にひろがって見にくかったというか、なんおこっちゃとなりました」
 * （2026-09-29）。
 *
 * Google マップも Apple マップも、スマホでは**下から出る面**で、
 * 地図は上に残る。**帰る先が「吹き出し」か「下の面」か**を、状態の側に持たせる。
 */
describe("nextCardState（帰る先）", () => {
  it("開くと、渡された帰る先になる", () => {
    expect(nextCardState("closed", "open", "sheet")).toBe("sheet");
    expect(nextCardState("closed", "open", "popup")).toBe("popup");
  });

  it("**既定は今までどおり吹き出し**（広い画面の見た目を変えない）", () => {
    expect(nextCardState("closed", "open")).toBe("popup");
  });

  it("最大化から戻ると、帰る先へ戻る", () => {
    expect(nextCardState("maximized", "restore", "sheet")).toBe("sheet");
    expect(nextCardState("maximized", "restore", "popup")).toBe("popup");
  });

  it("下の面からでも広げられる・閉じられる", () => {
    expect(nextCardState("sheet", "maximize", "sheet")).toBe("maximized");
    expect(nextCardState("sheet", "close", "sheet")).toBe("closed");
  });

  it("**開いているものを開き直さない**（下の面でも同じ）", () => {
    expect(nextCardState("sheet", "open", "sheet")).toBe("sheet");
  });
});

describe("controlsFor / keyAction（下の面）", () => {
  it("下の面のボタンは、吹き出しと同じ", () => {
    expect(controlsFor("sheet")).toEqual(["maximize", "close"]);
    expect(controlsFor("sheet", 3)).toEqual(["prev", "next", "maximize", "close"]);
  });

  it("Escape は下の面から閉じる（1 段だけ戻るのは変わらない）", () => {
    expect(keyAction("Escape", "sheet")).toBe("close");
    expect(keyAction("Escape", "maximized")).toBe("restore");
  });
});

/**
 * **指は点より太い。**いまの点は半径 5px（直径 10px、縁を入れて 13px）で、
 * 触る目標の目安（Apple 44pt / Material 48dp）の 1/4 しかない。
 * 人からの言葉は「店舗のぽっちがちいさくてたぷしにくい」（2026-09-29）。
 *
 * 当たり判定を広げると**隣と重なる**ので、**指にいちばん近い点**を選ぶ。
 * 重なった候補の先頭を取ると、**目で見て選んだ点と違うものが開く**。
 */
/** 座標をそのまま画面の位置として扱う（試験用） @param {any} c */
const project = (c) => ({ x: c[0], y: c[1] });
/** @param {number} x @param {number} y */
const at = (x, y) => ({ geometry: { coordinates: [x, y] } });

describe("nearestByPoint", () => {

  it("指にいちばん近い点を返す", () => {
    const got = nearestByPoint([at(100, 100), at(10, 10), at(40, 40)], { x: 0, y: 0 }, project);
    expect(got).toEqual(at(10, 10));
  });

  it("1 つしか無ければそれ", () => {
    expect(nearestByPoint([at(99, 99)], { x: 0, y: 0 }, project)).toEqual(at(99, 99));
  });

  it("**壊れた値で落とさない**（地図は出す）", () => {
    expect(nearestByPoint([], { x: 0, y: 0 }, project)).toBeNull();
    expect(nearestByPoint(/** @type {any} */ (null), { x: 0, y: 0 }, project)).toBeNull();
    expect(nearestByPoint([at(1, 1)], /** @type {any} */ (null), project)).toEqual(at(1, 1));
  });

  it("点でないもの（線・面）は飛ばす", () => {
    const line = { geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] } };
    expect(nearestByPoint([line, at(50, 50)], { x: 0, y: 0 }, project)).toEqual(at(50, 50));
  });
});

/**
 * **段階 5 — SNS などへのリンク。**
 *
 * **MMJ はブランドのアイコンを配りません。**商標なので、こちらが持つと
 * 使う側が意図しない形で配ることになります。**置く側が自分のものを渡す**形にします。
 *
 *     card-links="Instagram:ig_url:./icons/ig.svg,X:x_url"
 *
 * アイコンは省けます（省くと文字だけのリンクになります）。
 */
describe("parseLinks", () => {
  it("見出しと属性名の組を読む", () => {
    expect(parseLinks("Instagram:ig_url,X:x_url")).toEqual([
      { label: "Instagram", key: "ig_url", icon: null },
      { label: "X", key: "x_url", icon: null },
    ]);
  });

  it("**アイコンは置く側が渡す**（MMJ は商標の絵を持たない）", () => {
    expect(parseLinks("Instagram:ig_url:./icons/ig.svg")).toEqual([
      { label: "Instagram", key: "ig_url", icon: "./icons/ig.svg" },
    ]);
  });

  it("組になっていないものは飛ばす", () => {
    expect(parseLinks("Instagram:ig_url,こわれ,:key")).toEqual([
      { label: "Instagram", key: "ig_url", icon: null },
    ]);
  });

  it("無ければ空", () => {
    expect(parseLinks("")).toEqual([]);
    expect(parseLinks(null)).toEqual([]);
  });
});

describe("buildLinks", () => {
  const spec = [
    { label: "Instagram", key: "ig_url", icon: "./ig.svg" },
    { label: "X", key: "x_url", icon: null },
  ];

  it("中身のあるものだけ出す", () => {
    expect(buildLinks({ ig_url: "https://example.com/a" }, spec)).toEqual([
      { label: "Instagram", href: "https://example.com/a", icon: "./ig.svg" },
    ]);
  });

  /** **押した瞬間に走る URL を通さない**（`popup.js` の `isSafeLink` と同じ約束） */
  it("危ない URL は落とす", () => {
    expect(buildLinks({ x_url: "javascript:alert(1)" }, spec)).toEqual([]);
    expect(buildLinks({ x_url: "data:text/html,<script>" }, spec)).toEqual([]);
  });

  it("**アイコンの URL も確かめる**（危ない src を img に入れない）", () => {
    const bad = [{ label: "X", key: "x_url", icon: "javascript:alert(1)" }];
    expect(buildLinks({ x_url: "https://example.com/x" }, bad)).toEqual([
      { label: "X", href: "https://example.com/x", icon: null },
    ]);
  });

  it("中身が無ければ空", () => {
    expect(buildLinks({}, spec)).toEqual([]);
    expect(buildLinks(/** @type {any} */ (null), spec)).toEqual([]);
  });
});

/**
 * **時間で変わる中身**（クーポン・シフト・今日の品切れ）。
 *
 * GeoJSON に書くと、**地図と一緒に持ち歩かれて古くなる**。
 * オフラインで開いた人に、**先月のクーポンが今日の顔で出る**。
 * だから**開いたときに取りに行く**形を用意する。
 *
 *     card-live="いまの情報:./live/{id}.json"
 *
 * **これを使うと「どの店を開いたか」が配信元に伝わる。**
 * MMJ の部品はどこへも送らないが、**取りに行く先は使う側のサーバー**なので、
 * そこには残る。使うかどうかは置く側が決める。
 */
describe("parseLive", () => {
  it("見出しと URL の型を読む", () => {
    expect(parseLive("いまの情報:./live/{id}.json")).toEqual({
      label: "いまの情報",
      template: "./live/{id}.json",
    });
  });

  it("URL に `:` が入っていても読む（`https://`）", () => {
    expect(parseLive("今日:https://example.com/live/{id}.json")).toEqual({
      label: "今日",
      template: "https://example.com/live/{id}.json",
    });
  });

  it("組になっていなければ null", () => {
    expect(parseLive("こわれ")).toBeNull();
    expect(parseLive(":./live/{id}.json")).toBeNull();
    expect(parseLive("今日:")).toBeNull();
    expect(parseLive(null)).toBeNull();
  });
});

describe("liveUrl", () => {
  it("`{id}` を差し替える", () => {
    expect(liveUrl("./live/{id}.json", "akari")).toBe("./live/akari.json");
  });

  /** **記号と日本語を通す。**id がそのまま URL の一部になる */
  it("符号化する", () => {
    expect(liveUrl("./live/{id}.json", "灯 A/B")).toBe("./live/%E7%81%AF%20A%2FB.json");
  });

  it("**`{id}` が無い型は使わない**（全店で同じものを取りに行ってしまう）", () => {
    expect(liveUrl("./live/all.json", "akari")).toBeNull();
  });

  it("id が無ければ null", () => {
    expect(liveUrl("./live/{id}.json", null)).toBeNull();
    expect(liveUrl("./live/{id}.json", "")).toBeNull();
  });
});

describe("readLiveText", () => {
  it("文字列をそのまま読む", () => {
    expect(readLiveText("本日 17 時まで")).toBe("本日 17 時まで");
  });

  it("`text` を読む", () => {
    expect(readLiveText({ text: "本日 17 時まで" })).toBe("本日 17 時まで");
  });

  it("**中身が無ければ null**（空のタブを出さない）", () => {
    expect(readLiveText({ text: "   " })).toBeNull();
    expect(readLiveText({})).toBeNull();
    expect(readLiveText(null)).toBeNull();
    expect(readLiveText(42)).toBeNull();
  });
});
