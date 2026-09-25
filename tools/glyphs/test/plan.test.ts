import { describe, expect, it } from "vitest";

import { assetUrl, FONT, missingRanges, plannedRanges, rangeName, sizeReport } from "../src/plan.js";

/**
 * **スタイルが外を指している限り、通信が無いところでラベルが出ない。**
 * タイルだけ手元にあっても、字が引けなければ地図は読めない。
 *
 * **全部は配らない。**配っているフォントは 256 範囲・5.95 MB あるが、
 * **漢字・かな・ハングルは閲覧側のフォントで描く**ので、そこは要らない。
 * ラテン系だけなら **561.7 KB**——10 分の 1 で足りる（2026-09-25 実測）。
 */

describe("rangeName", () => {
  it("MapLibre が要求する名前にする", () => {
    expect(rangeName(0)).toBe("0-255");
    expect(rangeName(7680)).toBe("7680-7935");
  });

  it("**ずれた開始位置は落とす。**名前がずれると 404 になり、その字だけ出なくなる", () => {
    expect(() => rangeName(100)).toThrow(/256/);
    expect(() => rangeName(-256)).toThrow(/256/);
    expect(() => rangeName(1.5)).toThrow(/256/);
  });
});

describe("plannedRanges", () => {
  it("既定はラテン系だけ（**5.95 MB ではなく 561.7 KB**）", () => {
    const ranges = plannedRanges();
    expect(ranges).toContain("0-255");
    expect(ranges.length).toBeLessThan(10);
  });

  it("**ベトナム語の範囲を落とさない。**ハノイで実際に使う（`Hà Nội` `Cửa Nam`）", () => {
    expect(plannedRanges()).toContain("7680-7935");
  });

  it("**句読点も要る。**地名に `—` や `’` が混ざる", () => {
    expect(plannedRanges()).toContain("8192-8447");
  });

  it("`--all` なら 256 範囲すべて（キリル・タイ・アラビアの地域を切る人向け）", () => {
    const all = plannedRanges(true);
    expect(all).toHaveLength(256);
    expect(all.at(0)).toBe("0-255");
    expect(all.at(-1)).toBe("65280-65535");
  });

  it("**重複を出さない。**同じ範囲を 2 回取りに行かない", () => {
    expect(new Set(plannedRanges()).size).toBe(plannedRanges().length);
    expect(new Set(plannedRanges(true)).size).toBe(256);
  });
});

describe("assetUrl", () => {
  it("上流の置き場所を指す", () => {
    expect(assetUrl("0-255")).toBe(
      "https://raw.githubusercontent.com/protomaps/basemaps-assets/main/fonts/Noto%20Sans%20Regular/0-255.pbf",
    );
  });

  it("**フォント名の空白を URL へ入れられる形にする**（生のままだと取れない）", () => {
    expect(assetUrl("0-255", FONT)).toContain("Noto%20Sans%20Regular");
    expect(assetUrl("0-255", FONT)).not.toContain("Noto Sans Regular");
  });
});

describe("missingRanges", () => {
  it("揃っていれば空", () => {
    expect(missingRanges(["0-255", "256-511"], ["256-511", "0-255"])).toEqual([]);
  });

  /**
   * **途中で落ちた取得を、成功として通さない。**1 範囲欠けただけでも、
   * **その字を含むラベルだけが消える**。地図は出るので、見ても気づきにくい。
   */
  it("欠けているものを名指しで返す", () => {
    expect(missingRanges(["0-255", "7680-7935"], ["0-255"])).toEqual(["7680-7935"]);
  });

  it("余分に置いてあるぶんは問題にしない（**多いぶんには壊れない**）", () => {
    expect(missingRanges(["0-255"], ["0-255", "1024-1279"])).toEqual([]);
  });
});

describe("sizeReport", () => {
  it("大きさと、**入っていないもの**まで言う", () => {
    const report = sizeReport(575201, 6);
    expect(report).toContain("561.7 KB");
    expect(report).toContain("6 範囲");
    expect(report).toContain("閲覧側のフォント");
  });
});
