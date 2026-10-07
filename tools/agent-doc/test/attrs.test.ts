import { describe, expect, it } from "vitest";

import { attributesInDoc, attributesInHtml, attributesInSource, unknownInText, undocumented, htmlBlocksInMarkdown } from "../src/attrs.js";

/**
 * **エージェントが最初に読むものを、腐らせないための検査。**
 *
 * 属性を足した commit で文書を忘れても、**テストも lint も通る**。
 * 気づくのは、使った人の地図が黙って動かなかったとき。
 * だから「ソースが読んでいる属性が文書に無ければ落ちる」を機械に持たせる。
 */
describe("attributesInSource", () => {
  it("getAttribute で読んでいる属性を拾う", () => {
    expect(attributesInSource('const a = this.getAttribute("style-url");')).toEqual(["style-url"]);
  });

  /** **`fullscreen` のような「あるかないか」だけの属性も公開 API** */
  it("hasAttribute も拾う", () => {
    expect(attributesInSource('if (this.hasAttribute("fullscreen")) {}')).toEqual(["fullscreen"]);
  });

  it("observedAttributes の並びも拾う", () => {
    expect(attributesInSource('static observedAttributes = ["3d", "pitch"];')).toEqual(["3d", "pitch"]);
  });

  it("同じ属性を 2 度数えない／並びは一定", () => {
    const text = 'this.getAttribute("zoom"); this.getAttribute("center"); this.getAttribute("zoom");';
    expect(attributesInSource(text)).toEqual(["center", "zoom"]);
  });

  /** **書き込みは公開 API ではない。**内部で付け替えているだけのものを文書に強いない */
  it("setAttribute / removeAttribute は拾わない", () => {
    expect(attributesInSource('el.setAttribute("aria-current", "true"); el.removeAttribute("hidden");')).toEqual([]);
  });

  it("属性名でないものを拾わない（大文字・空・記号）", () => {
    expect(attributesInSource('x.getAttribute("");x.getAttribute("Zoom");x.getAttribute(name);')).toEqual([]);
  });
});

describe("attributesInDoc", () => {
  /** 文書は人が書く。**体裁は縛らない**（見出しでも表でも本文でも、`code` で出ていればよい） */
  it("`code` で囲まれた属性名を拾う", () => {
    const doc = "### `style-url` — スタイル\n\n表の中でも `zoom` は拾う。";
    expect([...attributesInDoc(doc)].sort()).toEqual(["style-url", "zoom"]);
  });

  it("日本語の地の文は拾わない", () => {
    expect([...attributesInDoc("地図の `zoom` を決めます。倍率は数値です。")]).toEqual(["zoom"]);
  });
});

describe("undocumented", () => {
  it("文書に無い属性を返す", () => {
    expect(undocumented(["zoom", "tiles"], attributesInDoc("`zoom` のこと"), [])).toEqual(["tiles"]);
  });

  /**
   * **除外には理由を書かせる。**数を合わせるための除外を増やさないため、
   * 許す側は「名前と理由」の組で渡す（呼ぶ側が理由を持つ）。
   */
  it("明示して許したものは出さない", () => {
    expect(undocumented(["zoom", "tiles"], attributesInDoc("`zoom` のこと"), ["tiles"])).toEqual([]);
  });

  it("全部書いてあれば空", () => {
    expect(undocumented(["zoom"], attributesInDoc("`zoom`"), [])).toEqual([]);
  });
});

describe("attributesInHtml", () => {
  /** エージェントは**最初の例をそのまま写す**。例の中の属性が実在しないと、黙って効かない */
  it("見本の HTML から属性名を拾う", () => {
    const html = '<mmj-map tiles="./a.pmtiles" style-url="./s.json" zoom="14" 3d></mmj-map>';
    expect(attributesInHtml(html)).toEqual(["3d", "style-url", "tiles", "zoom"]);
  });

  it("タグ名や中身は拾わない", () => {
    expect(attributesInHtml("<mmj-map>梅田</mmj-map>")).toEqual([]);
  });
});

describe("unknownInText", () => {
  /** **逆向きの検査。**文書や見本に、もう無い属性が残っていないか */
  it("ソースに無い属性名を返す", () => {
    expect(unknownInText(['<mmj-map zoom="14" zooom="14">'], ["zoom"], attributesInHtml)).toEqual(["zooom"]);
  });

  it("実在するものだけなら空", () => {
    expect(unknownInText(['<mmj-map zoom="14">'], ["zoom"], attributesInHtml)).toEqual([]);
  });
});

/**
 * **`3d` は数字で始まる。**HTML の属性名は数字始まりでもよく、
 * 最初の実装は `[a-z]` 始まりに縛っていて**見本の `3d` を見落としていた**。
 */
describe("attributesInHtml（数字始まり・値の中身）", () => {
  it("値の中の語を属性と間違えない", () => {
    const html = '<mmj-map card-title="open now" icons="cafe:./c.svg" 3d></mmj-map>';
    expect(attributesInHtml(html)).toEqual(["3d", "card-title", "icons"]);
  });
});

describe("htmlBlocksInMarkdown", () => {
  // **写される場所だけを見る。**地の文には「書いてはいけない例」が出てくる。
  // `<img onerror=...>` は危険の説明であって、使い方の見本ではない。
  // 地の文まで数えると、**正しい文書が落ちる**（2026-10-07 に実際に落ちた）。
  it("```html の中だけを返す", () => {
    const md = [
      "説明の中に `<img onerror=...>` と書くことがある。",
      "",
      "```html",
      '<mmj-circle center="139.8,35.6" radius="800"></mmj-circle>',
      "```",
      "",
      "続きの文。",
    ].join("\n");

    const blocks = htmlBlocksInMarkdown(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain("mmj-circle");
    expect(blocks.join("")).not.toContain("onerror");
  });

  it("html 以外の囲みは返さない（bash の中の `--base=` を属性と読まない）", () => {
    const md = ["```bash", "pnpm serve -- --base=/mmj-map", "```"].join("\n");
    expect(htmlBlocksInMarkdown(md)).toEqual([]);
  });

  it("囲みが無ければ空", () => {
    expect(htmlBlocksInMarkdown("ただの文。")).toEqual([]);
  });
});

describe("attributesInHtml は、値の中の語を属性と読まない", () => {
  // `label="徒歩 10 分"` から **`10`** を属性として拾っていた（2026-10-07 実測）。
  // 引用符の中は値であって、属性名ではない。見本の多い README を見るようにしたので、
  // ここを直さないと**正しい見本が落ちる**。
  // 2 語では再現しない。前後が引用符に接していて、たまたま当たらないだけ。
  // **3 語以上になると、真ん中の語が属性として残る。**
  it("空白を含む値の中身を拾わない（真ん中の語が残っていた）", () => {
    expect(attributesInHtml('<mmj-circle center="135.4,34.7" label="徒歩 10 分"></mmj-circle>'))
      .toEqual(["center", "label"]);
    expect(attributesInHtml('<mmj-map popup="osaka umeda station"></mmj-map>')).toEqual(["popup"]);
  });

  it("単引用符でも同じ", () => {
    expect(attributesInHtml("<mmj-map style-url='/a b/c.json' zoom='12'></mmj-map>"))
      .toEqual(["style-url", "zoom"]);
  });

  it("値の無い属性は今までどおり拾う（3d）", () => {
    expect(attributesInHtml('<mmj-map 3d hash zoom="16"></mmj-map>')).toEqual(["3d", "hash", "zoom"]);
  });
});
