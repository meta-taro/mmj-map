import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { covers, parseMultiPolygon, type Point } from "../src/coverage.js";

const regionPath = fileURLToPath(new URL("../regions/japan.geojson", import.meta.url));

describe("covers", () => {
  const square = parseMultiPolygon(
    JSON.stringify({
      type: "MultiPolygon",
      coordinates: [[[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]],
    }),
  );

  it("中の点は入っている", () => {
    expect(covers(square, [5, 5])).toBe(true);
  });

  it("外の点は入っていない", () => {
    expect(covers(square, [15, 5])).toBe(false);
    expect(covers(square, [5, -1])).toBe(false);
  });

  it("**辺の上は入っている扱いにする。**島が境界線に乗っているときに落とさないため", () => {
    expect(covers(square, [0, 5])).toBe(true);
    expect(covers(square, [5, 10])).toBe(true);
  });

  it("多角形が複数あれば、どれかに入っていればよい", () => {
    const two = parseMultiPolygon(
      JSON.stringify({
        type: "MultiPolygon",
        coordinates: [
          [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
          [[[100, 40], [101, 40], [101, 41], [100, 41], [100, 40]]],
        ],
      }),
    );
    expect(covers(two, [100.5, 40.5])).toBe(true);
    expect(covers(two, [50, 20])).toBe(false);
  });

  it("MultiPolygon でなければ読まない（**Polygon を黙って受けない**）", () => {
    expect(() => parseMultiPolygon(JSON.stringify({ type: "Point", coordinates: [0, 0] }))).toThrow();
  });
});

/**
 * **切り出す領域から、日本の一部が落ちていないことを機械で止める。**
 *
 * 領域を四角の集合で書くと、**書いた人が気づかないうちに島が抜ける**。
 * 実際に最初の版で屋久島・種子島・トカラ列島が抜けた（29.1〜30.9N が空白だった）。
 * 容量を減らす工夫は、**ここが通っている限りにおいて**やってよい。
 */
describe("japan.geojson が日本を覆っているか", () => {
  const japan = parseMultiPolygon(readFileSync(regionPath, "utf8"));

  /** 四隅（manifest の note と同じ 4 点） */
  const extremes: readonly (readonly [string, Point])[] = [
    ["西端 与那国島 西崎", [122.93, 24.45]],
    ["南端 沖ノ鳥島", [136.08, 20.42]],
    ["東端 南鳥島", [153.98, 24.29]],
    ["北端 択捉島", [148.75, 45.55]],
  ];

  /** 県庁所在地と、落としやすい離島 */
  const places: readonly (readonly [string, Point])[] = [
    ["稚内", [141.68, 45.41]],
    ["利尻島", [141.24, 45.18]],
    ["礼文島", [141.04, 45.36]],
    ["札幌", [141.35, 43.06]],
    ["青森", [140.74, 40.82]],
    ["佐渡島", [138.4, 38.05]],
    ["東京", [139.69, 35.69]],
    ["伊豆大島", [139.36, 34.75]],
    ["八丈島", [139.79, 33.11]],
    ["青ヶ島", [139.76, 32.46]],
    ["父島（小笠原）", [142.19, 27.09]],
    ["硫黄島", [141.29, 24.78]],
    ["名古屋", [136.91, 35.18]],
    ["大阪", [135.5, 34.69]],
    ["淡路島", [134.83, 34.35]],
    ["小豆島", [134.25, 34.49]],
    ["隠岐島", [133.3, 36.2]],
    ["広島", [132.46, 34.4]],
    ["高知", [133.53, 33.56]],
    ["福岡", [130.4, 33.59]],
    ["対馬", [129.3, 34.4]],
    ["五島列島", [128.68, 32.7]],
    ["鹿児島", [130.56, 31.6]],
    ["種子島", [130.95, 30.6]],
    ["屋久島", [130.5, 30.34]],
    ["トカラ列島 中之島", [129.85, 29.84]],
    ["奄美大島", [129.5, 28.35]],
    ["那覇", [127.68, 26.21]],
    ["南大東島", [131.25, 25.85]],
    ["宮古島", [125.3, 24.8]],
    ["石垣島", [124.15, 24.4]],
  ];

  for (const [name, point] of [...extremes, ...places]) {
    it(`${name} が入っている`, () => {
      expect(covers(japan, point)).toBe(true);
    });
  }

  it("**日本でない場所まで広げていない**（無駄な容量になる）", () => {
    expect(covers(japan, [121.0, 25.0])).toBe(false); // 台湾
    expect(covers(japan, [126.98, 37.57])).toBe(false); // ソウル
    expect(covers(japan, [145.0, 35.0])).toBe(false); // 房総沖の外洋
    expect(covers(japan, [150.0, 30.0])).toBe(false); // 太平洋の真ん中
  });
});
