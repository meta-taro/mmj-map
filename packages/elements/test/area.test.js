import { describe, expect, it } from "vitest";

import { distanceToArea } from "../src/area.js";

/**
 * **範囲までの距離。**「現在地から近い順に店の範囲を並べる」ための口。
 * 範囲の中にいれば 0。並べ替えと一覧は利用側で行う。
 *
 * 期待値は、緯度 1 度 ≒ 111,195 m（地球の平均半径から）で手計算した値。
 */
const METERS_PER_DEG_LAT = (6_371_008.8 * Math.PI) / 180;

/** 東京駅のあたり */
const CENTER = /** @type {[number, number]} */ ([139.767, 35.681]);

describe("distanceToArea (circle)", () => {
  it("is 0 inside the circle", () => {
    expect(distanceToArea(CENTER, { center: CENTER, radius: 500 })).toBe(0);
    const near = /** @type {[number, number]} */ ([CENTER[0], CENTER[1] + 400 / METERS_PER_DEG_LAT]);
    expect(distanceToArea(near, { center: CENTER, radius: 500 })).toBe(0);
  });

  it("measures from the edge, not the centre, when outside", () => {
    const north = /** @type {[number, number]} */ ([CENTER[0], CENTER[1] + 1500 / METERS_PER_DEG_LAT]);
    expect(distanceToArea(north, { center: CENTER, radius: 500 })).toBeCloseTo(1000, 0);
  });
});

describe("distanceToArea (polygon)", () => {
  // 1 辺がだいたい 1 km の四角
  const dLat = 1000 / METERS_PER_DEG_LAT;
  const dLng = 1000 / (METERS_PER_DEG_LAT * Math.cos((CENTER[1] * Math.PI) / 180));
  const square = {
    type: "Polygon",
    coordinates: [
      [
        [CENTER[0], CENTER[1]],
        [CENTER[0] + dLng, CENTER[1]],
        [CENTER[0] + dLng, CENTER[1] + dLat],
        [CENTER[0], CENTER[1] + dLat],
        [CENTER[0], CENTER[1]],
      ],
    ],
  };
  const middle = /** @type {[number, number]} */ ([CENTER[0] + dLng / 2, CENTER[1] + dLat / 2]);

  it("is 0 inside the polygon", () => {
    expect(distanceToArea(middle, square)).toBe(0);
  });

  it("measures to the nearest edge when outside", () => {
    const south = /** @type {[number, number]} */ ([CENTER[0] + dLng / 2, CENTER[1] - 300 / METERS_PER_DEG_LAT]);
    expect(distanceToArea(south, square)).toBeCloseTo(300, -1);
    const east = /** @type {[number, number]} */ ([CENTER[0] + dLng * 1.2, CENTER[1] + dLat / 2]);
    expect(distanceToArea(east, square)).toBeCloseTo(200, -1);
  });

  it("measures to a corner when that is nearest", () => {
    const sw = /** @type {[number, number]} */ ([CENTER[0] - dLng * 0.3, CENTER[1] - dLat * 0.4]);
    expect(distanceToArea(sw, square)).toBeCloseTo(500, -1);
  });

  it("accepts a Feature as well as a bare geometry", () => {
    expect(distanceToArea(middle, { type: "Feature", properties: {}, geometry: square })).toBe(0);
  });

  it("treats a point in a hole as outside", () => {
    const hole = [
      [CENTER[0] + dLng * 0.25, CENTER[1] + dLat * 0.25],
      [CENTER[0] + dLng * 0.75, CENTER[1] + dLat * 0.25],
      [CENTER[0] + dLng * 0.75, CENTER[1] + dLat * 0.75],
      [CENTER[0] + dLng * 0.25, CENTER[1] + dLat * 0.75],
      [CENTER[0] + dLng * 0.25, CENTER[1] + dLat * 0.25],
    ];
    const holed = { type: "Polygon", coordinates: [square.coordinates[0], hole] };
    expect(distanceToArea(middle, holed)).toBeCloseTo(250, -1);
  });

  it("uses the nearest part of a MultiPolygon", () => {
    const far = (square.coordinates[0] ?? []).map(([x, y]) => [/** @type {number} */ (x) + 1, y]);
    const multi = { type: "MultiPolygon", coordinates: [[far], square.coordinates] };
    expect(distanceToArea(middle, multi)).toBe(0);
  });
});

describe("distanceToArea (bad input)", () => {
  it("returns null for what it cannot read, instead of a made-up distance", () => {
    expect(distanceToArea(CENTER, /** @type {any} */ (null))).toBeNull();
    expect(distanceToArea(CENTER, { center: CENTER, radius: -1 })).toBeNull();
    expect(distanceToArea(CENTER, /** @type {any} */ ({ type: "LineString", coordinates: [] }))).toBeNull();
    expect(distanceToArea(/** @type {any} */ ([Number.NaN, 0]), { center: CENTER, radius: 500 })).toBeNull();
  });
});
