import { describe, expect, it } from "vitest";

import { addExtrusion, buildExtrusionLayer } from "../src/extrude.js";

const buildings = {
  id: "buildings",
  type: "fill",
  source: "basemap",
  "source-layer": "buildings",
  minzoom: 13,
  paint: { "fill-color": "#262C33", "fill-opacity": 1 },
};

/** @param {any[]} layers */
const style = (layers) => ({ version: 8, sources: {}, layers });

describe("buildExtrusionLayer", () => {
  it("**色を発明しない。**2D の建物レイヤの fill-color をそのまま使う", () => {
    const layer = buildExtrusionLayer(buildings);

    expect(layer.paint["fill-extrusion-color"]).toBe("#262C33");
  });

  it("source と source-layer も元のレイヤから取る（別のものを押し出さない）", () => {
    const layer = buildExtrusionLayer({ ...buildings, source: "other", "source-layer": "bldg" });

    expect(layer.source).toBe("other");
    expect(layer["source-layer"]).toBe("bldg");
  });

  it("高さを持つものだけ押し出す（無いものに既定値を入れない）", () => {
    const layer = buildExtrusionLayer(buildings);

    expect(layer.filter).toContainEqual(["has", "height"]);
    expect(JSON.stringify(layer.paint["fill-extrusion-height"])).toBe(JSON.stringify(["get", "height"]));
  });

  it("min_height を土台に使う（高架下や中空の建物が地面から生えない）", () => {
    const layer = buildExtrusionLayer(buildings);

    expect(JSON.stringify(layer.paint["fill-extrusion-base"])).toBe(
      JSON.stringify(["coalesce", ["get", "min_height"], 0]),
    );
  });
});

describe("addExtrusion", () => {
  it("2D の建物レイヤの直後へ足す（高さの無い建物は平らなまま残る）", () => {
    const result = addExtrusion(style([{ id: "earth" }, buildings, { id: "labels" }]));

    expect(result.layers.map((/** @type {any} */ l) => l.id)).toEqual(["earth", "buildings", "buildings-3d", "labels"]);
  });

  it("元のスタイルを書き換えない（手書きの正本を壊さない）", () => {
    const original = style([buildings]);
    addExtrusion(original);

    expect(original.layers).toHaveLength(1);
  });

  it("**建物レイヤが無ければ落とす。**黙って平らな地図を出さない", () => {
    expect(() => addExtrusion(style([{ id: "earth" }]))).toThrow(/buildings/);
  });

  it("二重に足さない（属性を付け外ししても増えない）", () => {
    const once = addExtrusion(style([buildings]));
    const twice = addExtrusion(once);

    expect(twice.layers.filter((/** @type {any} */ l) => l.id === "buildings-3d")).toHaveLength(1);
  });
});
