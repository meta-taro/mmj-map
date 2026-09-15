import { describe, expect, it } from "vitest";

import { parseBBox, parseBBoxString, formatBBox } from "../src/bbox.js";

describe("parseBBox", () => {
  it("[west, south, east, north] をそのまま返す", () => {
    expect(parseBBox([122.93, 20.42, 153.99, 45.56])).toEqual([122.93, 20.42, 153.99, 45.56]);
  });

  it("要素数が 4 でなければ落ちる", () => {
    expect(() => parseBBox([1, 2, 3])).toThrow(/4 要素/);
  });

  it("数値でない要素があれば、何番目かを言って落ちる", () => {
    expect(() => parseBBox([1, "2", 3, 4])).toThrow(/bbox\[1\]/);
  });

  it("west と east が入れ替わっていたら落ちる（黙って並べ替えない）", () => {
    expect(() => parseBBox([153.99, 20.42, 122.93, 45.56])).toThrow(/west < east/);
  });

  it("south と north が入れ替わっていたら落ちる", () => {
    expect(() => parseBBox([122.93, 45.56, 153.99, 20.42])).toThrow(/south < north/);
  });

  it("経度が範囲外なら落ちる", () => {
    expect(() => parseBBox([-200, 20, 10, 45])).toThrow(/経度/);
  });

  it("緯度が範囲外なら落ちる", () => {
    expect(() => parseBBox([120, -95, 130, 45])).toThrow(/緯度/);
  });
});

describe("formatBBox", () => {
  it("空白を入れずカンマで繋ぐ", () => {
    expect(formatBBox([122.93, 20.42, 153.99, 45.56])).toBe("122.93,20.42,153.99,45.56");
  });
});

describe("parseBBoxString", () => {
  it("前後の空白を許す", () => {
    expect(parseBBoxString(" 134.2, 33.4 ,136.6,35.9 ")).toEqual([134.2, 33.4, 136.6, 35.9]);
  });

  it("空の要素を 0 と読まない", () => {
    expect(() => parseBBoxString("134.2,,136.6,35.9")).toThrow();
  });

  it("数値でない文字列は落とす", () => {
    expect(() => parseBBoxString("a,b,c,d")).toThrow();
  });
});
