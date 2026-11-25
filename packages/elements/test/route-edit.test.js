import { describe, expect, it } from "vitest";

import { extractSteps } from "../src/route.js";
import {
  addStep,
  addVertex,
  editIssues,
  emptyRoute,
  fromGeoJSON,
  moveStep,
  moveVertex,
  removeStep,
  removeVertex,
  toGeoJSON,
  updateStep,
} from "../src/route-edit.js";
import { walkSummary } from "../src/walk.js";

/** @type {[number, number]} */
const exit = [135.4985, 34.7018];
/** @type {[number, number]} */
const corner = [135.5006, 34.6983];
/** @type {[number, number]} */
const shop = [135.5055, 34.698];

const drawn = () => addVertex(addVertex(addVertex(emptyRoute({ from: "A2 出口", to: "店" }), exit), corner), shop);

describe("drawing the line", () => {
  it("adds points in the order they are clicked, without changing the earlier route", () => {
    const before = addVertex(emptyRoute(), exit);
    const after = addVertex(before, corner);
    expect(before.line).toEqual([exit]);
    expect(after.line).toEqual([exit, corner]);
  });

  it("moves and removes one point by its number, and ignores numbers that do not exist", () => {
    const route = drawn();
    expect(moveVertex(route, 1, [135.5, 34.7]).line[1]).toEqual([135.5, 34.7]);
    expect(removeVertex(route, 0).line).toEqual([corner, shop]);
    expect(removeVertex(route, 9)).toBe(route);
    expect(moveVertex(route, -1, exit)).toBe(route);
  });

  it("refuses coordinates it cannot read, instead of putting a point in the sea at 0,0", () => {
    const route = drawn();
    expect(addVertex(route, /** @type {any} */ ([Number.NaN, 34]))).toBe(route);
    expect(addVertex(route, /** @type {any} */ ([200, 34]))).toBe(route);
    expect(addVertex(route, /** @type {any} */ ([135, 95]))).toBe(route);
  });
});

describe("the guide points", () => {
  it("adds a point with empty text, then fills the words and the photo", () => {
    const route = updateStep(addStep(drawn(), corner), 0, { instruction: "コンビニを左", image: "./corner.jpg" });
    expect(route.steps).toEqual([{ lngLat: corner, instruction: "コンビニを左", image: "./corner.jpg" }]);
  });

  it("moves and removes a guide point by its number", () => {
    const route = addStep(addStep(drawn(), corner), shop);
    expect(moveStep(route, 1, exit).steps[1]?.lngLat).toEqual(exit);
    expect(removeStep(route, 0).steps.map((s) => s.lngLat)).toEqual([shop]);
    expect(updateStep(route, 5, { instruction: "x" })).toBe(route);
  });
});

describe("toGeoJSON", () => {
  it("gives what <mmj-route> reads: one line with from / to, and the guide points", () => {
    const route = updateStep(addStep(drawn(), corner), 0, { instruction: "コンビニを左", image: "./corner.jpg" });
    const data = toGeoJSON(route);
    expect(data.features[0]).toEqual({
      type: "Feature",
      properties: { from: "A2 出口", to: "店" },
      geometry: { type: "LineString", coordinates: [exit, corner, shop] },
    });
    // 描く側（`route.js`）がそのまま読めること。読めなければ、作っても地図に出ない
    expect(extractSteps(data)).toEqual([{ lngLat: corner, text: "コンビニを左", image: "./corner.jpg" }]);
    expect(walkSummary(data).meters).toBeGreaterThan(0);
  });

  it("leaves the line out until it has two points (one point is not a route)", () => {
    expect(toGeoJSON(addVertex(emptyRoute(), exit)).features).toEqual([]);
  });

  it("rounds to 7 decimals (about 1 cm), and leaves out empty names and photos", () => {
    const route = addStep(addVertex(addVertex(emptyRoute(), [135.123456789, 34.1]), corner), [135.1, 34.987654321]);
    const data = toGeoJSON(route);
    expect(data.features[0]?.geometry.coordinates[0]).toEqual([135.1234568, 34.1]);
    expect(data.features[0]?.properties).toEqual({});
    expect(data.features[1]?.properties).toEqual({ instruction: "" });
    expect(data.features[1]?.geometry.coordinates).toEqual([135.1, 34.9876543]);
  });

  it("writes the words under the name the site reads (step-key)", () => {
    const route = updateStep(addStep(drawn(), corner), 0, { instruction: "左" });
    expect(toGeoJSON(route, "note").features[1]?.properties).toEqual({ note: "左" });
  });
});

describe("fromGeoJSON", () => {
  it("reads back what toGeoJSON wrote", () => {
    const route = updateStep(addStep(drawn(), corner), 0, { instruction: "左", image: "https://example.com/a.jpg" });
    expect(fromGeoJSON(toGeoJSON(route))).toEqual(route);
  });

  it("reads a route someone pasted by hand: the first line only, and points even without words", () => {
    const pasted = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { to: "店" }, geometry: { type: "LineString", coordinates: [exit, shop] } },
        { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [shop, exit] } },
        { type: "Feature", properties: { image: "./door.jpg" }, geometry: { type: "Point", coordinates: [...corner, 12] } },
        { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [] } },
      ],
    };
    expect(fromGeoJSON(pasted)).toEqual({
      line: [exit, shop],
      steps: [{ lngLat: corner, instruction: "", image: "./door.jpg" }],
      from: "",
      to: "店",
    });
  });

  it("starts empty from something that is not GeoJSON, instead of throwing", () => {
    expect(fromGeoJSON(null)).toEqual(emptyRoute());
    expect(fromGeoJSON("{")).toEqual(emptyRoute());
    expect(fromGeoJSON({ features: [{ geometry: { type: "LineString", coordinates: [[1], ["a", 2]] } }] })).toEqual(
      emptyRoute(),
    );
  });

  it("accepts the GeoJSON as text (an attribute or a form field)", () => {
    expect(fromGeoJSON(JSON.stringify(toGeoJSON(drawn()))).line).toEqual([exit, corner, shop]);
  });
});

describe("editIssues", () => {
  it("says nothing for a finished route", () => {
    expect(editIssues(updateStep(addStep(drawn(), corner), 0, { instruction: "左" }))).toEqual([]);
  });

  it("names what will not show on the map, so the page can tell the person before saving", () => {
    const route = updateStep(addStep(addStep(addVertex(emptyRoute(), exit), corner), shop), 1, {
      instruction: "入口",
      image: "javascript:alert(1)",
    });
    expect(editIssues(route)).toEqual([
      { kind: "line", message: "線の点が 2 つ未満です（駅の出口から店まで、2 つ以上置いてください）" },
      { kind: "words", message: "ひとことが空の案内が 1 件あります（地図に出ません）", count: 1 },
      { kind: "image", message: "使えない写真の URL が 1 件あります（http / https / 相対パスだけ）", count: 1 },
    ]);
  });
});
