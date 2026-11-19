import { describe, expect, it } from "vitest";

import { findPoint, focusZoom, sameIds, visibleIds } from "../src/sync.js";

/** @param {unknown} id @param {number} lng @param {number} lat */
const point = (id, lng, lat) => ({ type: "Feature", properties: { id }, geometry: { type: "Point", coordinates: [lng, lat] } });

const tokyo = { west: 139.6, south: 35.6, east: 139.9, north: 35.8 };

describe("visibleIds", () => {
  it("returns the ids of the points inside the visible area, in the given order", () => {
    const features = [point("b", 139.7, 35.7), point("x", 135.5, 34.7), point("a", 139.8, 35.65)];
    expect(visibleIds(features, tokyo, "id")).toEqual(["b", "a"]);
  });

  it("counts points the map has folded into a cluster (it reads the data, not what is drawn)", () => {
    // 同じ所に重なった 3 点。画面では 1 つの丸だが、一覧には 3 行要る
    const features = [point(1, 139.7, 35.7), point(2, 139.7, 35.7), point(3, 139.7, 35.7)];
    expect(visibleIds(features, tokyo, "id")).toEqual(["1", "2", "3"]);
  });

  it("treats 7 and \"7\" as the same shop, and lists it once", () => {
    expect(visibleIds([point(7, 139.7, 35.7), point("7", 139.71, 35.7)], tokyo, "id")).toEqual(["7"]);
  });

  it("includes points on the edge", () => {
    expect(visibleIds([point("edge", 139.6, 35.8)], tokyo, "id")).toEqual(["edge"]);
  });

  it("skips points without an id, lines and shapes, and broken coordinates", () => {
    const features = [
      point(null, 139.7, 35.7),
      point("", 139.7, 35.7),
      { type: "Feature", properties: { id: "line" }, geometry: { type: "LineString", coordinates: [[139.7, 35.7], [139.8, 35.7]] } },
      point("nan", Number.NaN, 35.7),
      { type: "Feature", properties: { id: "nogeom" }, geometry: null },
    ];
    expect(visibleIds(features, tokyo, "id")).toEqual([]);
  });

  it("follows the map when it has been spun round the world (west below -180)", () => {
    // 経度 -220.4〜-220.1 は、地球を 1 周回した 139.6〜139.9 と同じ所
    const spun = { west: -220.4, south: 35.6, east: -220.1, north: 35.8 };
    expect(visibleIds([point("tokyo", 139.7, 35.7)], spun, "id")).toEqual(["tokyo"]);
  });

  it("handles a view that crosses the date line", () => {
    const pacific = { west: 170, south: -20, east: 190, north: 0 };
    const features = [point("fiji", 178, -18), point("samoa", -172, -13.8), point("png", 147, -9)];
    expect(visibleIds(features, pacific, "id")).toEqual(["fiji", "samoa"]);
  });

  it("keeps every longitude when the view is wider than the world, but still checks latitude", () => {
    const wide = { west: -300, south: -10, east: 300, north: 60 };
    expect(visibleIds([point("tokyo", 139.7, 35.7), point("south", 0, -40)], wide, "id")).toEqual(["tokyo"]);
  });

  it("returns nothing it cannot read (no id key, no area, no list)", () => {
    expect(visibleIds([point("a", 139.7, 35.7)], tokyo, "")).toEqual([]);
    expect(visibleIds([point("a", 139.7, 35.7)], null, "id")).toEqual([]);
    expect(visibleIds([point("a", 139.7, 35.7)], { ...tokyo, south: 36, north: 35 }, "id")).toEqual([]);
    expect(visibleIds(null, tokyo, "id")).toEqual([]);
  });
});

describe("sameIds", () => {
  it("is true only for the same ids in the same order", () => {
    expect(sameIds(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameIds(["a", "b"], ["b", "a"])).toBe(false);
    expect(sameIds(["a"], ["a", "b"])).toBe(false);
  });

  it("is false before anything has been sent (the first one always goes out)", () => {
    expect(sameIds(null, [])).toBe(false);
  });
});

describe("focusZoom", () => {
  it("zooms in until the point stands on its own", () => {
    expect(focusZoom(10, 15)).toBe(15);
  });

  it("never zooms out (someone who was closer stays closer)", () => {
    expect(focusZoom(17, 15)).toBe(17);
  });

  it("uses the floor when the current zoom cannot be read", () => {
    expect(focusZoom(Number.NaN, 15)).toBe(15);
  });
});

describe("findPoint", () => {
  it("finds the point by id, matching numbers and strings", () => {
    const features = [point("a", 139.7, 35.7), point(7, 139.8, 35.7)];
    expect(findPoint(features, "id", "7")).toBe(features[1]);
    expect(findPoint(features, "id", 7)).toBe(features[1]);
  });

  it("returns null when there is no such point, or no way to tell", () => {
    expect(findPoint([point("a", 139.7, 35.7)], "id", "b")).toBeNull();
    expect(findPoint([point("a", 139.7, 35.7)], "", "a")).toBeNull();
    expect(findPoint([point("a", 139.7, 35.7)], "id", "")).toBeNull();
    expect(findPoint(null, "id", "a")).toBeNull();
  });

  it("does not pick a shape that happens to share the id (it cannot be flown to as one point)", () => {
    const shape = { type: "Feature", properties: { id: "a" }, geometry: { type: "Polygon", coordinates: [] } };
    expect(findPoint([shape], "id", "a")).toBeNull();
  });
});
