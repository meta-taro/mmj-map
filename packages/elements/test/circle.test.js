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

/**
 * **だいたいの場所（名前の付いた範囲）。**点で出すと、実際より正確そうに見えて誤読を生む。
 * 縁をぼかし、名札を付ける。ぼかしは**地表の m** で決める（画面のピクセルでぼかすと、
 * 倍率で指す範囲が変わる）。
 */
/** ぼかした円の輪（名札の点を除く） @param {any} spec */
const rings = (spec) => spec.source.data.features.filter((/** @type {any} */ f) => f.geometry.type === "Polygon");

describe("buildCircleSpec — blur and label", () => {
  const center = /** @type {[number, number]} */ ([139.7006, 35.6896]);
  const base = { id: "area", center, radius: 600 };

  /** @param {any} feature */
  const radiusOf = (feature) => haversine(center, feature.geometry.coordinates[0][0]);

  it("spreads the edge over the blur width, in ground metres around the radius", () => {
    const spec = buildCircleSpec({ ...base, blur: 400 });
    const radii = rings(spec).map(radiusOf);
    expect(radii.length).toBe(CIRCLE_DEFAULTS.blurRings);
    expect(Math.min(...radii)).toBeCloseTo(400, -1);
    expect(Math.max(...radii)).toBeCloseTo(800, -1);
  });

  it("stacks to the asked opacity at the centre, fading outward", () => {
    const spec = buildCircleSpec({ ...base, blur: 400, fillOpacity: 0.3 });
    const alphas = rings(spec).map((/** @type {any} */ f) => f.properties.alpha);
    const stacked = 1 - alphas.reduce((/** @type {number} */ left, /** @type {number} */ a) => left * (1 - a), 1);
    expect(stacked).toBeCloseTo(0.3, 5);
    expect(spec.layers.at(0)?.paint["fill-opacity"]).toEqual(["get", "alpha"]);
  });

  it("draws no hard edge line when blurred (a sharp line would say 'exactly here')", () => {
    const spec = buildCircleSpec({ ...base, blur: 400 });
    expect(spec.layers.map((layer) => layer.type)).not.toContain("line");
  });

  it("keeps the inner ring above zero even when the blur is wider than the circle", () => {
    const radii = rings(buildCircleSpec({ ...base, blur: 5000 })).map(radiusOf);
    expect(Math.min(...radii)).toBeGreaterThan(0);
  });

  it("ignores a blur it cannot read, and draws the plain circle", () => {
    for (const blur of [0, -10, Number.NaN]) {
      expect(buildCircleSpec({ ...base, blur }).layers.map((layer) => layer.type)).toEqual(["fill", "line"]);
    }
  });

  it("puts the name at the centre as a label", () => {
    const spec = buildCircleSpec({ ...base, blur: 400, label: "新宿駅のあたり" });
    const point = spec.source.data.features.find((/** @type {any} */ f) => f.geometry.type === "Point");
    expect(point?.geometry.coordinates).toEqual(center);
    expect(point?.properties.label).toBe("新宿駅のあたり");
    const symbol = spec.layers.find((layer) => layer.type === "symbol");
    expect(symbol?.layout["text-field"]).toEqual(["get", "label"]);
    expect(symbol?.filter).toEqual(["==", ["geometry-type"], "Point"]);
  });

  it("keeps the fill off the label point, so the point is not painted as a shape", () => {
    const spec = buildCircleSpec({ ...base, label: "東口" });
    for (const layer of spec.layers.filter((l) => l.type !== "symbol")) {
      expect(layer.filter).toEqual(["==", ["geometry-type"], "Polygon"]);
    }
  });

  it("lets overlapping areas move their labels instead of stacking them", () => {
    const symbol = buildCircleSpec({ ...base, label: "東口" }).layers.find((layer) => layer.type === "symbol");
    expect(symbol?.layout["text-allow-overlap"]).toBe(false);
    expect(symbol?.layout["text-variable-anchor"]?.length).toBeGreaterThan(1);
  });

  it("adds no label layer for an empty name", () => {
    expect(buildCircleSpec({ ...base, label: "  " }).layers.map((layer) => layer.type)).toEqual(["fill", "line"]);
  });
});

describe("buildCircleSpec — blurred default strength", () => {
  // **ぼかした円は縁の線が無い。**素の円と同じ薄さ（0.12）だと、暗い地図の上で範囲が見えない
  //（2026-11-18、梅田の範囲が地図に溶けて読めなかった）。0.35 で「だいたいここ」と読めた
  it("is stronger than the plain circle, since there is no edge line to find it by", () => {
    const spec = buildCircleSpec({ id: "x", center: [135.5, 34.7], radius: 500, blur: 300 });
    const alphas = spec.source.data.features.map((/** @type {any} */ f) => f.properties.alpha);
    const stacked = 1 - alphas.reduce((/** @type {number} */ left, /** @type {number} */ a) => left * (1 - a), 1);
    expect(stacked).toBeCloseTo(CIRCLE_DEFAULTS.blurOpacity, 5);
    expect(CIRCLE_DEFAULTS.blurOpacity).toBeGreaterThan(CIRCLE_DEFAULTS.fillOpacity);
  });
});
