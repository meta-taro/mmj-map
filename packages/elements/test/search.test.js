import { describe, expect, it } from "vitest";

import {
  buildSearchIndex,
  matchIds,
  normalizeForSearch,
  parseSearchKeys,
  planSearch,
  readLngLat,
  searchCountLabel,
} from "../src/search.js";

const features = [
  { properties: { shop_id: "akari", shop_name: "町家カフェ 灯", shop_kana: "まちやかふぇ あかり" } },
  { properties: { shop_id: "migiwa", shop_name: "らーめん 汀", shop_kana: "らーめん みぎわ" } },
  { properties: { shop_id: "misaki", shop_name: "古本 みさき", shop_kana: "ふるほん みさき" } },
];

describe("normalizeForSearch", () => {
  /**
   * **打ち方の違いで外さない。**全角英数・カタカナ・大文字・空白は、
   * 人が打つたびに揺れる。揃えないと「カフェ」で「かふぇ」が当たらない。
   */
  it("カタカナをひらがなに、全角を半角に、大文字を小文字に揃え、空白を落とす", () => {
    expect(normalizeForSearch("マチヤ　ＣＡＦＥ 1")).toBe("まちやcafe1");
  });

  it("長音と濁点は残す（「らーめん」と「らめん」は別の語）", () => {
    expect(normalizeForSearch("ラーメン")).toBe("らーめん");
  });

  it("文字でないものは空にする", () => {
    expect(normalizeForSearch(null)).toBe("");
    expect(normalizeForSearch(42)).toBe("42");
  });
});

describe("parseSearchKeys", () => {
  it("並びを読み、空と重複を落とす", () => {
    expect(parseSearchKeys("shop_name, shop_kana,,shop_name", "shop_name")).toEqual(["shop_name", "shop_kana"]);
  });

  /** **指定が無ければ名前だけ。**勝手に属性名を推測して、関係のない値で当てない */
  it("指定が無ければ card-title の項目だけ", () => {
    expect(parseSearchKeys(null, "shop_name")).toEqual(["shop_name"]);
    expect(parseSearchKeys("  ", "shop_name")).toEqual(["shop_name"]);
  });

  it("どちらも無ければ空", () => {
    expect(parseSearchKeys(null, null)).toEqual([]);
  });
});

describe("buildSearchIndex", () => {
  it("id ごとに、指定した項目をつないで揃えた文字を持つ", () => {
    const index = buildSearchIndex(features, "shop_id", ["shop_name", "shop_kana"]);
    expect(index[0]).toEqual({ id: "akari", text: "町家かふぇ灯 まちやかふぇあかり" });
  });

  /** **項目の境目で当てない。**「灯」と「まちや」をつないだ「灯まちや」で当たると、誰も打っていない語で出る */
  it("項目の境目をまたいで当てない", () => {
    const index = buildSearchIndex(features, "shop_id", ["shop_name", "shop_kana"]);
    expect(matchIds(index, "灯まちや")).toEqual([]);
  });

  it("id の無い点は入れない（押しても開けない）", () => {
    const index = buildSearchIndex([{ properties: { shop_name: "名無し" } }, ...features], "shop_id", ["shop_name"]);
    expect(index.map((entry) => entry.id)).toEqual(["akari", "migiwa", "misaki"]);
  });

  it("数の id も文字に揃える", () => {
    const index = buildSearchIndex([{ properties: { shop_id: 7, shop_name: "七" } }], "shop_id", ["shop_name"]);
    expect(index).toEqual([{ id: "7", text: "七" }]);
  });

  it("features が配列でなければ空", () => {
    expect(buildSearchIndex(null, "shop_id", ["shop_name"])).toEqual([]);
    expect(buildSearchIndex(features, null, ["shop_name"])).toEqual([]);
  });
});

describe("matchIds", () => {
  const index = buildSearchIndex(features, "shop_id", ["shop_name", "shop_kana"]);

  it("部分一致で、元の順のまま返す（プラン順を崩さない）", () => {
    expect(matchIds(index, "みさき")).toEqual(["misaki"]);
    expect(matchIds(index, "ら")).toEqual(["migiwa"]);
  });

  /** **読みがなで漢字の店に当たる。**「汀」は打てなくても「みぎわ」なら打てる */
  it("読みがなで当たる", () => {
    expect(matchIds(index, "ミギワ")).toEqual(["migiwa"]);
  });

  it("空の問いは null（絞り込まない）", () => {
    expect(matchIds(index, "")).toBeNull();
    expect(matchIds(index, "　 ")).toBeNull();
  });

  it("当たらなければ空の配列", () => {
    expect(matchIds(index, "寿司")).toEqual([]);
  });
});

describe("planSearch", () => {
  it("空なら絞り込みを解く", () => {
    expect(planSearch("", 0, true)).toBe("clear");
  });

  it("名前で当たれば、その店を開く", () => {
    expect(planSearch("みさき", 1, true)).toBe("open");
  });

  /** **名前で当たるものを住所検索へ回さない。**外へ問い合わせる回数を増やさない */
  it("名前で当たらず、住所検索がつながっていれば、そちらへ回す", () => {
    expect(planSearch("大阪市北区", 0, true)).toBe("geocode");
  });

  it("どちらも無ければ、見つからない", () => {
    expect(planSearch("大阪市北区", 0, false)).toBe("none");
  });

  /**
   * **一覧を読み終える前の Enter を、住所検索へ回さない。**まだ 0 件に見えるだけで、
   * 読み終えれば名前で当たるかもしれない。読み終えるまで待たせる
   */
  it("一覧を読み終える前は、住所検索へ回さず待つ", () => {
    expect(planSearch("みさき", null, true)).toBe("wait");
    expect(planSearch("みさき", null, false)).toBe("wait");
  });

  it("読み終える前でも、空なら絞り込みを解く", () => {
    expect(planSearch("", null, true)).toBe("clear");
  });
});

describe("readLngLat", () => {
  it("[経度, 緯度] を受ける", () => {
    expect(readLngLat([135.5, 34.69])).toEqual([135.5, 34.69]);
  });

  it("{ lng, lat } と { lon, lat } も受ける", () => {
    expect(readLngLat({ lng: 135.5, lat: 34.69 })).toEqual([135.5, 34.69]);
    expect(readLngLat({ lon: 135.5, lat: 34.69 })).toEqual([135.5, 34.69]);
  });

  /** **外から来た値を信じない。**範囲の外や NaN で地図を飛ばすと、海の真ん中か真っ白になる */
  it("範囲の外・数でないもの・空は null", () => {
    expect(readLngLat([200, 34])).toBeNull();
    expect(readLngLat([135, 95])).toBeNull();
    expect(readLngLat(["135", "34"])).toBeNull();
    expect(readLngLat([Number.NaN, 34])).toBeNull();
    expect(readLngLat(null)).toBeNull();
    expect(readLngLat({ lat: 34 })).toBeNull();
  });
});

describe("searchCountLabel", () => {
  it("絞り込んでいる間は「n / 全体 件」", () => {
    expect(searchCountLabel(2, 5)).toBe("2 / 5 件");
  });

  it("0 件なら、そう言う", () => {
    expect(searchCountLabel(0, 5)).toBe("見つかりません");
  });

  it("絞り込んでいなければ空（何も出さない）", () => {
    expect(searchCountLabel(null, 5)).toBe("");
  });

  /** **読み込み中に「見つかりません」と言わない。**まだ探していないだけ */
  it("一覧を読み終える前に打たれたら、読み込み中と言う", () => {
    expect(searchCountLabel(0, null)).toBe("読み込み中…");
  });

  it("読み終える前でも、打っていなければ空", () => {
    expect(searchCountLabel(null, null)).toBe("");
  });
});
