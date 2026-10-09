import { describe, expect, it } from "vitest";

import { writeShopParam } from "../src/card.js";
import { indexOfEntry, listEntries, needsScroll, parseRankOrder, sortByRank } from "../src/list.js";

/** `card-id="shop_id"` / `card-title="shop_name"` を指定した想定 */
const keys = { idKey: "shop_id", titleKey: "shop_name" };

const features = [
  { properties: { shop_id: "akari", shop_name: "町家カフェ 灯" } },
  { properties: { shop_id: "migiwa", shop_name: "らーめん 汀" } },
];

describe("listEntries", () => {
  it("id と名前と行き先を出す", () => {
    expect(listEntries(features, keys, writeShopParam)).toEqual([
      { id: "akari", title: "町家カフェ 灯", href: "?shop=akari" },
      { id: "migiwa", title: "らーめん 汀", href: "?shop=migiwa" },
    ]);
  });

  /**
   * **本物のリンクにする。**JS を切っても、新しいタブで開いても、その店の頁になる。
   * 押したときだけ動く `<div>` にすると、**キーボードでも検索でも届かない**。
   */
  it("いまの query を残したまま shop を足す", () => {
    const entries = listEntries(features, { ...keys, search: "?utm_source=note" }, writeShopParam);
    expect(entries[0]?.href).toBe("?utm_source=note&shop=akari");
  });

  /** **押しても開かない項目を出さない** */
  it("id が無いものは出さない", () => {
    const broken = [{ properties: { shop_name: "名前だけ" } }, ...features];
    expect(listEntries(broken, keys, writeShopParam)).toHaveLength(2);
  });

  /** **名前の無い項目を出さない**（空の行が並ぶだけ） */
  it("名前が無いものは出さない", () => {
    const broken = [{ properties: { shop_id: "onlyid" } }, ...features];
    expect(listEntries(broken, keys, writeShopParam)).toHaveLength(2);
  });

  /** **数で書き出す媒体がある**（`"shop_id": 7`）。文字に揃えないと URL と一致しない */
  it("数の id も文字に揃える", () => {
    const numeric = [{ properties: { shop_id: 7, shop_name: "七番" } }];
    expect(listEntries(numeric, keys, writeShopParam)[0]).toEqual({
      id: "7",
      title: "七番",
      href: "?shop=7",
    });
  });

  it("キーが無ければ、何も出さない（**推測で属性名を当てない**）", () => {
    expect(listEntries(features, { idKey: null, titleKey: "shop_name" }, writeShopParam)).toEqual([]);
    expect(listEntries(features, { idKey: "shop_id", titleKey: null }, writeShopParam)).toEqual([]);
  });

  it("**壊れた値で落とさない**（地図は出す）", () => {
    expect(listEntries(null, keys, writeShopParam)).toEqual([]);
    expect(listEntries([null, undefined], keys, writeShopParam)).toEqual([]);
  });
});

describe("indexOfEntry", () => {
  const entries = listEntries(features, keys, writeShopParam);

  it("一覧の何番目かを返す", () => {
    expect(indexOfEntry(entries, "migiwa")).toBe(1);
  });

  it("無ければ -1", () => {
    expect(indexOfEntry(entries, "nowhere")).toBe(-1);
    expect(indexOfEntry(entries, null)).toBe(-1);
    expect(indexOfEntry(null, "akari")).toBe(-1);
  });

  it("数で渡されても引ける", () => {
    const numeric = listEntries([{ properties: { shop_id: 7, shop_name: "七番" } }], keys, writeShopParam);
    expect(indexOfEntry(numeric, 7)).toBe(0);
  });
});

describe("needsScroll", () => {
  const box = { top: 100, bottom: 500 };

  /** **見えているものは動かさない。**押すたびに一覧が跳ねると、見ていた場所が消える */
  it("見えていれば送らない", () => {
    expect(needsScroll({ top: 200, bottom: 260 }, box)).toBe(false);
  });

  it("上に隠れていれば送る", () => {
    expect(needsScroll({ top: 40, bottom: 90 }, box)).toBe(true);
  });

  it("下に隠れていれば送る", () => {
    expect(needsScroll({ top: 480, bottom: 540 }, box)).toBe(true);
  });

  it("**壊れた値で落とさない**", () => {
    expect(needsScroll(null, box)).toBe(false);
    expect(needsScroll({ top: 0, bottom: 1 }, null)).toBe(false);
  });
});

/**
 * 媒体のプランで並べ替える。**MMJ は「ゴールド」の意味を知らない**——
 * 「どの属性を見るか」と「どの順に並べるか」だけを受け取る（D-001・データを持たない）。
 *
 * **お金を払った順に並ぶ一覧は広告。**並び順そのものは媒体の判断で、
 * ここは渡された順に並べるだけ。
 */
describe("parseRankOrder", () => {
  it("読点で割って、前後の空白を落とす", () => {
    expect(parseRankOrder(" platinum , gold ,silver ")).toEqual(["platinum", "gold", "silver"]);
  });

  it("空と重複は落とす", () => {
    expect(parseRankOrder("gold,,gold,silver")).toEqual(["gold", "silver"]);
    expect(parseRankOrder("")).toEqual([]);
    expect(parseRankOrder(null)).toEqual([]);
  });
});

/** 並べ替えの試験で使う点。**プランを持たない点も作れる** */
const feature = (/** @type {string} */ name, /** @type {string} */ plan = "") => ({
  properties: plan === "" ? { name } : { name, plan },
});
const names = (/** @type {any[]} */ list) => list.map((f) => f.properties.name);

describe("sortByRank", () => {

  it("渡された順に並べる", () => {
    const out = sortByRank([feature("a", "silver"), feature("b", "gold")], {
      key: "plan",
      order: ["gold", "silver"],
    });
    expect(names(out)).toEqual(["b", "a"]);
  });

  /**
   * **安定でないと、同じプランの店が読み込むたびに入れ替わる。**
   * 媒体の「掲載順」がぶれるのは、お金の話なので重い。
   */
  it("**同じ順位の中では、元の順をそのまま保つ**", () => {
    const out = sortByRank(
      [feature("a", "gold"), feature("b", "gold"), feature("c", "gold")],
      { key: "plan", order: ["gold"] },
    );
    expect(names(out)).toEqual(["a", "b", "c"]);
  });

  /** **知らない値で店を消さない。**綴り違いも新しいプランも、末尾に出す */
  it("**並びに無い値と、値を持たない点は末尾**（元の順のまま）", () => {
    const out = sortByRank(
      [feature("a", "zzz"), feature("b", "gold"), feature("c", ""), feature("d", "gold")],
      { key: "plan", order: ["gold"] },
    );
    expect(names(out)).toEqual(["b", "d", "a", "c"]);
  });

  it("**元の配列を変えない**（ECC coding-style）", () => {
    const input = [feature("a", "silver"), feature("b", "gold")];
    sortByRank(input, { key: "plan", order: ["gold", "silver"] });
    expect(names(input)).toEqual(["a", "b"]);
  });

  it("属性名や並びが無ければ、そのまま", () => {
    const input = [feature("a", "silver"), feature("b", "gold")];
    expect(names(sortByRank(input, { key: null, order: ["gold"] }))).toEqual(["a", "b"]);
    expect(names(sortByRank(input, { key: "plan", order: [] }))).toEqual(["a", "b"]);
  });

  it("壊れたデータでも落ちない", () => {
    expect(sortByRank(null, { key: "plan", order: ["gold"] })).toEqual([]);
    expect(sortByRank([null, feature("a", "gold")], { key: "plan", order: ["gold"] })).toHaveLength(2);
  });
});
