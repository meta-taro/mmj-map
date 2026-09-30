import { describe, expect, it } from "vitest";

import { writeShopParam } from "../src/card.js";
import { indexOfEntry, listEntries, needsScroll } from "../src/list.js";

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
