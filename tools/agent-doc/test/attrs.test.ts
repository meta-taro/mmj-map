import { describe, expect, it } from "vitest";

import { attributesInDoc, attributesInHtml, attributesInSource, unknownInText, undocumented } from "../src/attrs.js";

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
