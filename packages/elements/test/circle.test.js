import { describe, expect, it } from "vitest";

import { buildCircleSpec, CIRCLE_DEFAULTS, circleFeature, formatRadius } from "../src/circle.js";

/**
 * **「ここから半径◯ m」は、外部サービスもデータも要らない。**幾何だけで出る。
 * 経路探索ではないので `PRD.md` §2 にも触れない。
 *
 * **画面上の円（`circle-radius`）は使えない。**あれは画面のピクセルなので、
 * 倍率を変えても大きさが変わらない——「半径 800 m」と書いてあるのに
 * **800 m を指していない図**になる。地表の点を並べた多角形にする。
 */

/** @param {number} d */
const rad = (d) => (d * Math.PI) / 180;

/**
 * **検証用に、独立して距離を測り直す。**
 *
 * 実装と同じ式で確かめると、**式が間違っていても一致してしまう**。
 * こちらは Haversine で測る（実装は球面上の方位から点を出している）。
 * @param {readonly number[]} a
 * @param {readonly number[]} b
 */
function haversine(a, b) {
  const R = 6_371_008.8;
  const dLat = rad(/** @type {number} */ (b[1]) - /** @type {number} */ (a[1]));
  const dLng = rad(/** @type {number} */ (b[0]) - /** @type {number} */ (a[0]));
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(/** @type {number} */ (a[1]))) *
      Math.cos(rad(/** @type {number} */ (b[1]))) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

describe("circleFeature", () => {
  const osaka = /** @type {[number, number]} */ ([135.5023, 34.6937]);

  it("閉じた多角形を返す（最初と最後が同じ点）", () => {
    const ring = circleFeature(osaka, 800).geometry.coordinates[0];
    expect(ring.length).toBe(CIRCLE_DEFAULTS.steps + 1);
    expect(ring.at(0)).toEqual(ring.at(-1));
  });

  it("**すべての点が、指定した半径にある**（独立に測り直して確認）", () => {
    const ring = circleFeature(osaka, 800).geometry.coordinates[0];
    for (const point of ring) {
      // 球面の近似なので 1 m の誤差は許す。**100 m ずれていたら式が違う**
      expect(Math.abs(haversine(osaka, point) - 800)).toBeLessThan(1);
    }
  });

  it("**緯度が高くても、地表の距離は変わらない**（画面上は縦長に見えるのが正しい）", () => {
    const sapporo = /** @type {[number, number]} */ ([141.3544, 43.0618]);
    const ring = circleFeature(sapporo, 2000).geometry.coordinates[0];
    for (const point of ring) {
      expect(Math.abs(haversine(sapporo, point) - 2000)).toBeLessThan(2);
    }
  });

  it("**経度は -180〜180 に畳む。**日付変更線で地図が横に飛ばないように", () => {
    const nearDateLine = /** @type {[number, number]} */ ([179.98, 0]);
    const ring = circleFeature(nearDateLine, 5000).geometry.coordinates[0];
    for (const point of ring) {
      expect(point[0]).toBeGreaterThanOrEqual(-180);
      expect(point[0]).toBeLessThanOrEqual(180);
    }
  });

  it("**0 や負の半径で、見えない図形を黙って置かない**", () => {
    expect(() => circleFeature(osaka, 0)).toThrow(/半径/);
    expect(() => circleFeature(osaka, -100)).toThrow(/半径/);
    expect(() => circleFeature(osaka, Number.NaN)).toThrow(/半径/);
  });

  it("中心が読めなければ落とす（**海の上に置かない**）", () => {
    expect(() => circleFeature(/** @type {any} */ (["a", "b"]), 800)).toThrow(/中心/);
    expect(() => circleFeature(/** @type {any} */ (null), 800)).toThrow(/中心/);
  });
});

describe("formatRadius", () => {
  it("**歩く距離は m のまま**（0.8 km より 800 m のほうが読める）", () => {
    expect(formatRadius(800)).toBe("800 m");
    expect(formatRadius(999)).toBe("999 m");
  });

  it("1000 m 以上は km", () => {
    expect(formatRadius(1000)).toBe("1 km");
    expect(formatRadius(2500)).toBe("2.5 km");
  });
});

describe("buildCircleSpec", () => {
  const base = { id: "walk", center: /** @type {[number, number]} */ ([135.5, 34.7]), radius: 800 };

  /**
   * **縁だけにしない。**面が無いと内側か外側かが一目で読めない。
   * **面だけにもしない。**薄い面は縮小すると境界が消える。
   */
  it("面と縁の 2 枚を組む", () => {
    const spec = buildCircleSpec(base);
    expect(spec.layers.map((layer) => layer.type)).toEqual(["fill", "line"]);
  });

  it("既定の面は薄い（**下の地図が読めないと、どこの話か分からない**）", () => {
    expect(buildCircleSpec(base).layers.at(0)?.paint["fill-opacity"]).toBe(CIRCLE_DEFAULTS.fillOpacity);
    expect(CIRCLE_DEFAULTS.fillOpacity).toBeLessThan(0.5);
  });

  it("色は面と縁で揃える（**別の色にすると 2 つの図形に見える**）", () => {
    const spec = buildCircleSpec({ ...base, color: "#ff8800" });
    expect(spec.layers.at(0)?.paint["fill-color"]).toBe("#ff8800");
    expect(spec.layers.at(1)?.paint["line-color"]).toBe("#ff8800");
  });

  it("id が無ければ落とす（**衝突すると後勝ちで消える**）", () => {
    expect(() => buildCircleSpec({ ...base, id: "" })).toThrow(/id/);
  });
});
