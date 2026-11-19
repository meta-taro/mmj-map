import { describe, expect, it } from "vitest";

import { distanceToArea } from "../src/area.js";
import { buildFillSpec } from "../src/fill.js";
import { BLUR_RASTER, blurRaster, FILL_BLUR, labelPoints, prepareAreas, SHAPES } from "../src/fill-blur.js";

/**
 * **名前の付いた範囲を、形で渡すとき**（「守谷市」「つくば駅周辺」の多角形）。
 *
 * 形そのものが「確かにここ」の芯で、**縁から外へ `blur` m かけて薄くなる。**
 * ぼかしは地表の m（画面のピクセルでぼかすと、倍率で指す範囲が変わる）。
 *
 * 2026-11-19、最初は縁に沿った線を外へずらして重ねたが、**へこんだ角と穴の角で線が
 * 自分と重なり、扇形の筋が出た**（ズーム 15 で画面で確かめた）。実際の市町村界は
 * 細かい角だらけなので、地表の m で測った距離から濃さを決める形に替えた。
 */

const square = [
  [140.0, 36.0],
  [140.0, 36.02],
  [140.02, 36.02],
  [140.02, 36.0],
  [140.0, 36.0],
];
const hole = [
  [140.006, 36.006],
  [140.014, 36.006],
  [140.014, 36.014],
  [140.006, 36.014],
  [140.006, 36.006],
];
const withHole = { type: "Feature", properties: { name: "穴あき" }, geometry: { type: "Polygon", coordinates: [square, hole] } };

/** コの字（重心が形の外に落ちる。へこみもある） */
const uShape = {
  type: "Feature",
  properties: { name: "コの字の町" },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [140.0, 36.0],
        [140.03, 36.0],
        [140.03, 36.03],
        [140.02, 36.03],
        [140.02, 36.01],
        [140.01, 36.01],
        [140.01, 36.03],
        [140.0, 36.03],
        [140.0, 36.0],
      ],
    ],
  },
};

/** @param {number} lat */
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

/** 画素の中心の経度・緯度（メルカトルで等間隔に並ぶ） @param {any} raster @param {number} x @param {number} y */
function lngLatOf(raster, x, y) {
  const [[west, north], [east]] = raster.coordinates;
  const south = raster.coordinates[2][1];
  const top = mercY(north);
  const bottom = mercY(south);
  const lng = west + ((x + 0.5) / raster.width) * (east - west);
  const m = top + ((y + 0.5) / raster.height) * (bottom - top);
  return [lng, (Math.atan(Math.sinh(m)) * 180) / Math.PI];
}

describe("blurRaster", () => {
  const blur = 200;

  it("is opaque inside, fades linearly out to blur metres, and is empty beyond (measured independently)", () => {
    const raster = blurRaster(prepareAreas(uShape)?.data, blur);
    let checked = 0;
    for (let y = 0; y < raster.height; y += 7) {
      for (let x = 0; x < raster.width; x += 7) {
        const meters = /** @type {number} */ (distanceToArea(/** @type {any} */ (lngLatOf(raster, x, y)), uShape));
        const expected = 255 * Math.max(0, 1 - meters / blur);
        // 1 画素ぶんの誤差は許す（縁の画素は内か外かが半分ずつ）
        const tolerance = (255 * raster.metersPerPixel * 1.5) / blur;
        expect(Math.abs(/** @type {number} */ (raster.alpha[y * raster.width + x]) - expected)).toBeLessThanOrEqual(tolerance + 1);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("treats a hole as outside, fading into it from its edge", () => {
    const raster = blurRaster(prepareAreas(withHole)?.data, 100);
    const [x, y] = pixelAt(raster, [140.01, 36.01]);
    expect(raster.alpha[y * raster.width + x]).toBe(0);
  });

  it("covers the shape plus blur on every side", () => {
    const raster = blurRaster(prepareAreas(uShape)?.data, blur);
    const [[west, north], , [east, south]] = raster.coordinates;
    expect(distanceToArea([west, 36.015], uShape)).toBeGreaterThanOrEqual(blur);
    expect(distanceToArea([east, 36.015], uShape)).toBeGreaterThanOrEqual(blur);
    expect(distanceToArea([140.015, north], uShape)).toBeGreaterThanOrEqual(blur);
    expect(distanceToArea([140.015, south], uShape)).toBeGreaterThanOrEqual(blur);
  });

  it("keeps the image small enough to build on a phone, however large the area", () => {
    const huge = { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[139, 35], [141, 35], [141, 37], [139, 37], [139, 35]]] } };
    const raster = blurRaster(prepareAreas(huge)?.data, 300);
    expect(Math.max(raster.width, raster.height)).toBeLessThanOrEqual(BLUR_RASTER.maxSide);
  });

  it("resolves the fade finely when it can (several pixels across the blur)", () => {
    const raster = blurRaster(prepareAreas(uShape)?.data, blur);
    expect(blur / raster.metersPerPixel).toBeGreaterThanOrEqual(BLUR_RASTER.pixelsPerBlur - 0.01);
  });
});

/** @param {any} raster @param {[number, number]} lngLat @returns {[number, number]} */
function pixelAt(raster, lngLat) {
  /** @type {[number, number]} */
  let best = [0, 0];
  let nearest = Number.POSITIVE_INFINITY;
  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      const [lng, lat] = lngLatOf(raster, x, y);
      const d = Math.hypot(/** @type {number} */ (lng) - lngLat[0], /** @type {number} */ (lat) - lngLat[1]);
      if (d < nearest) {
        nearest = d;
        best = [x, y];
      }
    }
  }
  return best;
}

describe("labelPoints", () => {
  it("puts the name inside the shape even when the centre of mass falls outside it", () => {
    const [point] = labelPoints(prepareAreas(uShape)?.data, "name");
    expect(point?.properties.label).toBe("コの字の町");
    expect(distanceToArea(point?.geometry.coordinates, uShape)).toBe(0);
  });

  it("keeps the name off a hole", () => {
    const [point] = labelPoints(prepareAreas(withHole)?.data, "name");
    expect(distanceToArea(point?.geometry.coordinates, withHole)).toBe(0);
  });

  it("skips shapes without a name (no empty labels)", () => {
    const nameless = { ...uShape, properties: { name: "  " } };
    expect(labelPoints(prepareAreas(nameless)?.data, "name")).toEqual([]);
  });
});

describe("prepareAreas", () => {
  it("keeps only shapes, as a new collection", () => {
    const input = {
      type: "FeatureCollection",
      features: [uShape, { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [140, 36] } }],
    };
    const before = JSON.stringify(input);
    expect(prepareAreas(input)?.data.features.length).toBe(1);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("returns null when there is no shape to draw (draw nothing rather than guess)", () => {
    expect(prepareAreas({ type: "FeatureCollection", features: [] })).toBeNull();
    expect(prepareAreas(null)).toBeNull();
  });
});

describe("buildFillSpec — blurred areas", () => {
  const data = { type: "FeatureCollection", features: [uShape] };
  const base = { id: "areas", src: data, color: "#8fa9b8", blur: 300 };

  it("takes one colour for named areas, instead of value steps", () => {
    expect(buildFillSpec({ ...base, blur: 0, labelKey: "name" }).layers.at(0)?.paint["fill-color"]).toBe("#8fa9b8");
    expect(buildFillSpec(base).raster?.color).toBe("#8fa9b8");
  });

  it("refuses a colour that is not a colour (it goes straight into the style)", () => {
    expect(() => buildFillSpec({ ...base, color: "url(x)" })).toThrow(/color/);
  });

  it("draws the blurred area as one image fixed to the ground, at the asked strength", () => {
    const spec = buildFillSpec({ ...base, opacity: 0.4 });
    expect(spec.layers.map((layer) => layer.type)).toEqual(["raster"]);
    expect(spec.layers.at(0)?.source).toBe(spec.raster?.sourceId);
    expect(spec.layers.at(0)?.paint["raster-opacity"]).toBe(0.4);
  });

  it("defaults to the same strength as the blurred circle (no edge line to find it by)", () => {
    expect(buildFillSpec(base).layers.at(0)?.paint["raster-opacity"]).toBe(FILL_BLUR.opacity);
  });

  it("labels each named area from label-key, at a point inside it", () => {
    const spec = buildFillSpec({ ...base, labelKey: "name" });
    expect(spec.layers.map((layer) => layer.type)).toEqual(["raster", "symbol"]);
    const symbol = spec.layers.at(1);
    expect(symbol?.layout["text-field"]).toEqual(["get", "label"]);
    expect(symbol?.layout["text-allow-overlap"]).toBe(false);
    const point = spec.source.data.features.find((/** @type {any} */ f) => f.geometry.type === "Point");
    expect(distanceToArea(point.geometry.coordinates, uShape)).toBe(0);
  });

  it("keeps the fill off the label points when only labelling", () => {
    const spec = buildFillSpec({ ...base, blur: 0, labelKey: "name" });
    expect(spec.layers.map((layer) => layer.type)).toEqual(["fill", "symbol"]);
    expect(spec.layers.at(0)?.filter).toEqual(SHAPES);
  });

  it("ignores a blur it cannot read and draws the plain fill", () => {
    for (const blur of [0, -5, Number.NaN]) {
      expect(buildFillSpec({ ...base, blur }).layers.map((layer) => layer.type)).toEqual(["fill"]);
    }
  });

  it("needs the shapes in hand to blur them (a URL alone cannot be measured)", () => {
    expect(() => buildFillSpec({ ...base, src: "./areas.geojson" })).toThrow(/blur/);
  });
});
