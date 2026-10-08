import { describe, expect, it } from "vitest";

import { DROP_CONTENT, RICH_TAGS, allowedAttributes, isRichField, parseRichFields } from "../src/rich.js";

/**
 * **本文に文中リンクを書けるようにする。**ただし既定は文字だけのまま。
 *
 * 置く側が「この項目は HTML として読んでよい」と**明示したときだけ**開く。
 * 自分でデータを書くサイトでは安全だが、**店舗が CMS で自分の紹介文を書く**使い方や、
 * `card-live` が実行時に取りに行く JSON では、書く人が置く側ではない。
 * **部品はどちらか判定できない**ので、既定を安全側に置いたまま opt-in にする。
 */
describe("parseRichFields", () => {
  it("項目名の並びを読む", () => {
    expect([...parseRichFields("description,menu")]).toEqual(["description", "menu"]);
  });

  it("前後の空白は落とす", () => {
    expect([...parseRichFields(" description , menu ")]).toEqual(["description", "menu"]);
  });

  it("同じ項目を 2 度数えない", () => {
    expect([...parseRichFields("menu,menu")]).toEqual(["menu"]);
  });

  /** **指定が無ければ 1 つも開かない。**既定は文字だけ */
  it("指定が無ければ空", () => {
    expect(parseRichFields(null).size).toBe(0);
    expect(parseRichFields("").size).toBe(0);
    expect(parseRichFields("  ").size).toBe(0);
    expect(parseRichFields(",,").size).toBe(0);
  });
});

describe("isRichField", () => {
  const fields = parseRichFields("description");

  it("指定された項目だけが rich", () => {
    expect(isRichField("description", fields)).toBe(true);
    expect(isRichField("menu", fields)).toBe(false);
  });

  /** 項目名が分からないとき（属性で渡していない）は開かない */
  it("項目名が無ければ開かない", () => {
    expect(isRichField(null, fields)).toBe(false);
    expect(isRichField("", fields)).toBe(false);
  });
});

describe("RICH_TAGS", () => {
  it("文中で要るものだけを許す", () => {
    expect([...RICH_TAGS].sort()).toEqual(["a", "b", "br", "em", "i", "li", "ol", "p", "strong", "ul"]);
  });

  /**
   * **走る経路を 1 つも含めない。**`img` を許すと `onerror` の置き場ができ、
   * 属性を落としていても**将来 1 つ許した瞬間に穴になる**。
   */
  it("走るもの・読み込むものは許さない", () => {
    for (const tag of ["script", "iframe", "img", "style", "object", "embed", "svg", "form", "input", "link", "meta"]) {
      expect(RICH_TAGS.has(tag)).toBe(false);
    }
  });
});

describe("allowedAttributes", () => {
  /** **`a` の `href` だけ。**`target` も `rel` もこちらが決める（外から渡させない） */
  it("a は href だけ", () => {
    expect(allowedAttributes("a")).toEqual(["href"]);
  });

  it("他のタグは 1 つも許さない", () => {
    for (const tag of ["strong", "em", "p", "li", "br", "ul"]) {
      expect(allowedAttributes(tag)).toEqual([]);
    }
  });

  /** **イベント属性は、許す表に無いので自動的に落ちる**（個別に禁止を数えない） */
  it("知らないタグにも何も許さない", () => {
    expect(allowedAttributes("script")).toEqual([]);
    expect(allowedAttributes("div")).toEqual([]);
  });
});

/**
 * **中身ごと捨てるタグ。**
 *
 * 「タグを落として中の文字は残す」は、文章には正しいが `script` には間違い。
 * 実行はされないものの、**`console.error(2)` という文字がカードに出た**（2026-10-05 実測）。
 * 画面に出る文章を持たないタグは、**中身ごと捨てる**。
 */
describe("DROP_CONTENT", () => {
  it("走るもの・読み込むものは中身ごと捨てる", () => {
    for (const tag of ["script", "style", "template", "noscript", "iframe", "object", "embed"]) {
      expect(DROP_CONTENT.has(tag)).toBe(true);
    }
  });

  /** **文章を持つタグは捨てない。**知らないタグでも、中の文字は残す */
  it("文章を持つタグは含まない", () => {
    for (const tag of ["div", "span", "section", "h1", "table", "img"]) {
      expect(DROP_CONTENT.has(tag)).toBe(false);
    }
  });

  /** 許す表と重ならないこと（両方に入っていたら、どちらが効くか読めない） */
  it("許す表と重ならない", () => {
    for (const tag of RICH_TAGS) expect(DROP_CONTENT.has(tag)).toBe(false);
  });
});
