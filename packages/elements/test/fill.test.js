import { describe, expect, it } from "vitest";

import { FILL_DEFAULTS, buildFillSpec, legendItems, parseSteps } from "../src/fill.js";

/**
 * **面で塗るもの**（浸水深・地盤・震度・土砂災害の区域）。
 *
 * **色はこちらで作りません。**ハザードマップの配色は、国や自治体が決めた
 * 意味のある色です（浸水深の青、土砂の黄と赤）。**独自配色に置き換えると誤読を生みます**
 * ——`CLAUDE.md` の「外界が色を決めているものは、配色ルールの適用外」。
 *
 * だから `steps` は**置く側が渡す**もので、MMJ は**並べ替えて描くだけ**です。
 */
describe("parseSteps", () => {
  it("しきい値と色の組を読む", () => {
    expect(parseSteps("0.5:#cfe8ff,1:#8ec6ff,3:#3b82f6")).toEqual([
      { at: 0.5, color: "#cfe8ff" },
      { at: 1, color: "#8ec6ff" },
      { at: 3, color: "#3b82f6" },
    ]);
  });

  /** **小さい順に並べ直す。**MapLibre の step は昇順でないと落ちる */
  it("順番がばらばらでも、小さい順にする", () => {
    expect(parseSteps("3:#3b82f6,0.5:#cfe8ff").map((s) => s.at)).toEqual([0.5, 3]);
  });

  it("組になっていないものは飛ばす", () => {
    expect(parseSteps("0.5:#cfe8ff,こわれ,:#fff,1:")).toEqual([{ at: 0.5, color: "#cfe8ff" }]);
  });

  /**
   * **色として読めないものを通さない。**スタイルへそのまま渡る値なので、
   * `url(...)` のようなものを入れられる経路を作らない。
   */
  it("色に見えないものは落とす", () => {
    expect(parseSteps("1:url(https://example.com/a.png)")).toEqual([]);
    expect(parseSteps("1:red;background:blue")).toEqual([]);
  });

  it("色の名前と rgba() は通す", () => {
    expect(parseSteps("1:rebeccapurple").map((s) => s.color)).toEqual(["rebeccapurple"]);
    expect(parseSteps("1:rgba(0 40 90 / 60%)").map((s) => s.color)).toEqual(["rgba(0 40 90 / 60%)"]);
  });

  it("無ければ空", () => {
    expect(parseSteps("")).toEqual([]);
    expect(parseSteps(null)).toEqual([]);
  });
});

describe("buildFillSpec", () => {
  const steps = [
    { at: 0.5, color: "#cfe8ff" },
    { at: 3, color: "#3b82f6" },
  ];

  it("source と layer を組む", () => {
    const spec = buildFillSpec({ id: "f", src: "./flood.geojson", valueKey: "depth", steps });
    expect(spec.sourceId).toBe("f");
    expect(spec.source.type).toBe("geojson");
    expect(spec.source.data).toBe("./flood.geojson");
    expect(spec.layers[0].type).toBe("fill");
  });

  /**
   * **しきい値より下は塗らない。**「0.1m の浸水」を薄い青で塗ると、
   * **浸水していない場所と見分けがつかない**まま、色だけが付く。
   */
  it("最初のしきい値より下は透明", () => {
    const spec = buildFillSpec({ id: "f", src: "./a.geojson", valueKey: "depth", steps });
    const color = spec.layers[0].paint["fill-color"];
    expect(color[0]).toBe("step");
    expect(color[2]).toBe("transparent");
    expect(color.slice(3)).toEqual([0.5, "#cfe8ff", 3, "#3b82f6"]);
  });

  /** **文字で入っている値も数として読む**（媒体の書き出しは `"1.5"` のことがある） */
  it("値は数として読む", () => {
    const spec = buildFillSpec({ id: "f", src: "./a.geojson", valueKey: "depth", steps });
    expect(spec.layers[0].paint["fill-color"][1]).toEqual(["to-number", ["get", "depth"], -1]);
  });

  it("透かし具合は変えられる（既定あり）", () => {
    const spec = buildFillSpec({ id: "f", src: "./a.geojson", valueKey: "depth", steps });
    expect(spec.layers[0].paint["fill-opacity"]).toBe(FILL_DEFAULTS.opacity);
    const dense = buildFillSpec({ id: "f", src: "./a.geojson", valueKey: "depth", steps, opacity: 0.9 });
    expect(dense.layers[0].paint["fill-opacity"]).toBe(0.9);
  });

  /**
   * **出典と時点は、地図の中に出す。**持ち出された先では配布元の頁は付いて来ない。
   * 避難に関わる面では、**どこの・いつ時点のものかがその場で読めること**が要る。
   */
  it("出典は渡したときだけ付く", () => {
    const withIt = buildFillSpec({
      id: "f", src: "./a.geojson", valueKey: "depth", steps,
      attribution: "出典：○○市（○年○月時点）",
    });
    expect(withIt.source.attribution).toBe("出典：○○市（○年○月時点）");
    const without = buildFillSpec({ id: "f", src: "./a.geojson", valueKey: "depth", steps });
    expect(without.source.attribution).toBeUndefined();
  });

  it("**足りないものは例外にする**（黙って塗らない地図を出さない）", () => {
    expect(() => buildFillSpec({ id: "", src: "./a.geojson", valueKey: "d", steps })).toThrow();
    expect(() => buildFillSpec({ id: "f", src: "", valueKey: "d", steps })).toThrow();
    expect(() => buildFillSpec({ id: "f", src: "./a.geojson", valueKey: "", steps })).toThrow();
    expect(() => buildFillSpec({ id: "f", src: "./a.geojson", valueKey: "d", steps: [] })).toThrow();
  });
});

/**
 * **凡例が無い塗り分けは読めません。**色だけ出しても、
 * 「濃い青が何メートルか」は誰にも分かりません。
 */
describe("legendItems", () => {
  const steps = [
    { at: 0.5, color: "#cfe8ff" },
    { at: 1, color: "#8ec6ff" },
    { at: 3, color: "#3b82f6" },
  ];

  it("区間で読ませる。**最後は「以上」**", () => {
    expect(legendItems(steps)).toEqual([
      { label: "0.5 〜 1", color: "#cfe8ff" },
      { label: "1 〜 3", color: "#8ec6ff" },
      { label: "3 以上", color: "#3b82f6" },
    ]);
  });

  it("1 段しかなければ「以上」だけ", () => {
    expect(legendItems([{ at: 5, color: "#1e3a8a" }])).toEqual([{ label: "5 以上", color: "#1e3a8a" }]);
  });

  it("空なら空", () => {
    expect(legendItems([])).toEqual([]);
    expect(legendItems(/** @type {any} */ (null))).toEqual([]);
  });
});
