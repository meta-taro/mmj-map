import { describe, expect, it } from "vitest";

import { hasIconFilter, iconImageExpression, parseIcons } from "../src/icons.js";
import { isSafeLink } from "../src/popup.js";

/**
 * **点が全部同じ丸だと、地図を見ても何屋か分からない。**
 * うどん・ラーメン・ケーキ・コーヒーが一目で分かれば、**開く前に選べる**。
 *
 * **MMJ は絵を持たない**（D-001）。業種の分け方も絵の趣味も置く側のもの。
 */
describe("parseIcons", () => {
  it("「名前:URL」の組を読む", () => {
    expect(parseIcons("ramen:./icons/ramen.svg,cafe:./icons/cafe.svg", isSafeLink)).toEqual([
      { name: "ramen", url: "./icons/ramen.svg" },
      { name: "cafe", url: "./icons/cafe.svg" },
    ]);
  });

  /** **URL は `:` を含む。**最初の `:` で割らないと `https` が名前になる */
  it("`https://` の URL も読める", () => {
    expect(parseIcons("cake:https://example.com/cake.svg", isSafeLink)).toEqual([
      { name: "cake", url: "https://example.com/cake.svg" },
    ]);
  });

  it("前後の空白は落とす", () => {
    expect(parseIcons(" udon : ./a.svg , soba : ./b.svg ", isSafeLink)).toEqual([
      { name: "udon", url: "./a.svg" },
      { name: "soba", url: "./b.svg" },
    ]);
  });

  /** **後勝ちにしない。**どちらが効いているか、読む人に分からなくなる */
  it("同じ名前が 2 度出たら、先に書いたほうを採る", () => {
    expect(parseIcons("ramen:./a.svg,ramen:./b.svg", isSafeLink)).toEqual([{ name: "ramen", url: "./a.svg" }]);
  });

  /** **押した瞬間に走る URL を通さない**（吹き出しのリンクと同じ扱い） */
  it("危ない URL は落とす", () => {
    expect(parseIcons("x:javascript:alert(1),ok:./a.svg", isSafeLink)).toEqual([{ name: "ok", url: "./a.svg" }]);
  });

  it("名前だけ・URL だけの欠けた指定は落とす", () => {
    expect(parseIcons("ramen,:./a.svg,cafe:", isSafeLink)).toEqual([]);
  });

  it("指定が無ければ空（**絵は任意**）", () => {
    expect(parseIcons(null, isSafeLink)).toEqual([]);
    expect(parseIcons("", isSafeLink)).toEqual([]);
    expect(parseIcons("   ", isSafeLink)).toEqual([]);
  });
});

/** 地図に入れた名前。**1 枚の頁に地図が何枚も載るので、素の名前は衝突する** */
const id = (/** @type {string} */ name) => `mmj-poi-1-${name}`;

describe("iconImageExpression", () => {
  const icons = [
    { name: "ramen", url: "./r.svg" },
    { name: "cafe", url: "./c.svg" },
  ];

  /**
   * **地図に入れた名前へ読み替える。**1 枚の頁に地図が何枚も載るので、
   * `ramen` のような素の名前をそのまま使うと、**別の地図の絵で上書きされる**。
   */
  it("属性の値を、地図に入れた名前へ読み替える", () => {
    expect(iconImageExpression("category", icons, id)).toEqual([
      "match",
      ["get", "category"],
      "ramen",
      "mmj-poi-1-ramen",
      "cafe",
      "mmj-poi-1-cafe",
      "",
    ]);
  });

  /** **知らない名前は描かない。**綴り違いで地図が壊れるより、静かに丸のままがいい */
  it("既定は空文字（＝描かない）", () => {
    expect(iconImageExpression("category", icons, id).at(-1)).toBe("");
  });

  it("絵が 1 枚も無ければ、既定だけ", () => {
    expect(iconImageExpression("category", [], id)).toEqual(["match", ["get", "category"], ""]);
  });
});

describe("hasIconFilter", () => {
  /** **絵と丸を重ねない。**絵の下から丸がはみ出して汚れる */
  it("絵を持つ名前だけに当たる", () => {
    expect(hasIconFilter("category", [{ name: "ramen", url: "./r.svg" }])).toEqual([
      "in",
      ["get", "category"],
      ["literal", ["ramen"]],
    ]);
  });

  it("絵が 1 枚も無ければ、誰にも当たらない（＝全部が丸のまま）", () => {
    expect(hasIconFilter("category", [])).toEqual(["in", ["get", "category"], ["literal", []]]);
  });
});
