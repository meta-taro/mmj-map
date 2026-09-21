/**
 * 色の混ぜ方。**sRGB でそのまま混ぜない。**
 *
 * `#FFFFFF` と `#000000` を sRGB で半分ずつ混ぜると `#808080` になるが、
 * 目には「灰色の真ん中」より暗く見える。道の 6 段のような**等間隔の階調**を作ると、
 * 暗い側が潰れて 2 段ぶんが同じに見える。Oklab は目の感じ方に近い並びを返す。
 */
import { describe, expect, it } from "vitest";

import { mix, parseHex, toHex } from "../src/oklab.js";

describe("parseHex", () => {
  it("6 桁を読む", () => {
    expect(parseHex("#FF0000")).toEqual({ r: 1, g: 0, b: 0 });
  });

  it("3 桁を読む（`#fff` は `#ffffff`）", () => {
    expect(parseHex("#fff")).toEqual(parseHex("#ffffff"));
  });

  it("`#` は無くてもよい", () => {
    expect(parseHex("ff0000")).toEqual(parseHex("#FF0000"));
  });

  it("**読めなければ投げる。**黒へ落とすと、間違いが黒い地図として出る", () => {
    expect(() => parseHex("")).toThrow();
    expect(() => parseHex("#12345")).toThrow();
    expect(() => parseHex("赤")).toThrow();
    expect(() => parseHex("#GGGGGG")).toThrow();
  });
});

describe("toHex", () => {
  it("読んだ値を戻すと元に戻る", () => {
    for (const hex of ["#000000", "#ffffff", "#1b1f24", "#0a5fff"]) {
      expect(toHex(parseHex(hex))).toBe(hex);
    }
  });

  it("範囲の外は端で止める（**回り込ませない**）", () => {
    expect(toHex({ r: 2, g: -1, b: 0.5 })).toBe("#ff0080");
  });
});

describe("mix", () => {
  it("0 と 1 は端の色そのもの", () => {
    expect(mix("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mix("#000000", "#ffffff", 1)).toBe("#ffffff");
  });

  it("**素朴な平均ではない**（sRGB のまま足して 2 で割っていない）", () => {
    // sRGB の平均は #808080。Oklab の中点は **#636363 付近**（明度の目盛りが違う）
    const half = mix("#000000", "#ffffff", 0.5);
    expect(half).not.toBe("#808080");
    const c = parseHex(half);
    expect(c.r).toBeCloseTo(c.g, 5);
    expect(c.r).toBeCloseTo(c.b, 5);
  });

  it("**混ぜてもくすまない。**sRGB の平均より彩度が残る", () => {
    // 赤と緑を sRGB で平均すると #808000（濁った黄土色）になる
    const half = parseHex(mix("#ff0000", "#00ff00", 0.5));
    const spread = Math.max(half.r, half.g, half.b) - Math.min(half.r, half.g, half.b);
    const naive = 0.5; // #808000 の広がり（0.5 - 0）
    expect(spread).toBeGreaterThan(naive);
  });

  it("単調に進む（途中で戻らない）", () => {
    const values = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => parseHex(mix("#1b1f24", "#d8dce1", t)).r);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]!).toBeGreaterThan(values[i - 1]!);
    }
  });

  it("暗い側へ向けても単調に進む（明暗どちらの土台でも同じ式で使う）", () => {
    const values = [0, 0.25, 0.5, 0.75, 1].map((t) => parseHex(mix("#edf0f3", "#2b3138", t)).r);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]!).toBeLessThan(values[i - 1]!);
    }
  });

  it("色みを保つ（青と青を混ぜたら灰色にならない）", () => {
    const c = parseHex(mix("#0a5fff", "#00206b", 0.5));
    expect(c.b).toBeGreaterThan(c.r);
    expect(c.b).toBeGreaterThan(c.g);
  });
});
