import { describe, expect, it } from "vitest";

import { needleGeometry, needleOffset } from "../src/machibari.js";
import { needleImage, needleLayout, paintImage } from "../src/machibari-image.js";

/** 描いた命令と、作った canvas の寸法を記録する偽物 */
function fakeCanvasFactory() {
  /** @type {{ width: number, height: number, calls: any[][] }[]} */
  const made = [];
  /** @param {number} width @param {number} height */
  const create = (width, height) => {
    /** @type {any[][]} */
    const calls = [];
    const record = { width, height, calls };
    made.push(record);
    const context = new Proxy(
      {},
      {
        get: (_target, key) => (/** @type {any[]} */ ...args) => {
          calls.push([key, ...args]);
          return key === "getImageData" ? { kind: "image-data", width: args[2], height: args[3] } : undefined;
        },
        set: (_target, key, value) => {
          calls.push([`=${String(key)}`, value]);
          return true;
        },
      },
    );
    return { width, height, getContext: () => context };
  };
  /** 最初に作った canvas。**作られていなければ試験を落とす** */
  const first = () => {
    const record = made[0];
    if (record === undefined) throw new Error("canvas が作られていません");
    return record;
  };
  return { create, made, first };
}

/** 描いた円の数 @param {any[][]} calls */
const arcs = (calls) => calls.filter((c) => c[0] === "arc").length;

describe("needleLayout", () => {
  it("places the needle tip on the coordinate, not the centre of the picture", () => {
    expect(needleLayout(false)).toEqual({
      "icon-anchor": "top-left",
      "icon-offset": needleOffset(false),
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    });
  });

  it("uses the upright offset for a picked pin", () => {
    expect(needleLayout(true)["icon-offset"]).toEqual(needleOffset(true));
    expect(needleLayout(true)["icon-offset"]).not.toEqual(needleOffset(false));
  });

  it("defaults to the resting pin", () => {
    expect(needleLayout()).toEqual(needleLayout(false));
  });

  it("returns a new object each time, so callers can spread and change it safely", () => {
    const a = needleLayout();
    a["icon-offset"][0] = 999;
    expect(needleLayout()["icon-offset"][0]).not.toBe(999);
  });
});

describe("paintImage", () => {
  it("multiplies the canvas by the screen ratio and scales the drawing back", () => {
    const fake = fakeCanvasFactory();
    const image = paintImage(10, 20, 2, () => {}, fake.create);
    expect(fake.first()).toMatchObject({ width: 20, height: 40 });
    expect(fake.first().calls[0]).toEqual(["scale", 2, 2]);
    expect(image).toEqual({ kind: "image-data", width: 20, height: 40 });
  });

  it("returns null when no canvas can be made (Node without a canvas)", () => {
    expect(paintImage(10, 10, 1, () => {}, () => null)).toBeNull();
  });
});

describe("needleImage", () => {
  it("draws one needle in the given colour at the needle's own size", () => {
    const fake = fakeCanvasFactory();
    const result = needleImage({ color: "#e4572e", pixelRatio: 1, createCanvas: fake.create });
    const { width, height } = needleGeometry(false);
    expect(fake.first()).toMatchObject({ width, height });
    expect(fake.first().calls).toContainEqual(["=fillStyle", "#e4572e"]);
    expect(result?.pixelRatio).toBe(1);
  });

  it("draws the white tip dot only when picked", () => {
    const rest = fakeCanvasFactory();
    needleImage({ color: "#000", pixelRatio: 1, createCanvas: rest.create });
    const picked = fakeCanvasFactory();
    needleImage({ color: "#000", picked: true, pixelRatio: 1, createCanvas: picked.create });
    expect(arcs(picked.first().calls)).toBe(arcs(rest.first().calls) + 1);
  });

  it("uses a white casing unless one is given", () => {
    const fake = fakeCanvasFactory();
    needleImage({ color: "#000", pixelRatio: 1, createCanvas: fake.create });
    expect(fake.first().calls).toContainEqual(["=strokeStyle", "#ffffff"]);
    const dark = fakeCanvasFactory();
    needleImage({ color: "#000", casing: "#111418", pixelRatio: 1, createCanvas: dark.create });
    expect(dark.first().calls).toContainEqual(["=strokeStyle", "#111418"]);
  });

  it("ignores a broken pixel ratio instead of making an empty picture", () => {
    for (const bad of [0, -1, Number.NaN]) {
      const fake = fakeCanvasFactory();
      const result = needleImage({ color: "#000", pixelRatio: bad, createCanvas: fake.create });
      expect(result?.pixelRatio).toBeGreaterThan(0);
      expect(fake.first().width).toBeGreaterThan(0);
    }
  });

  it("returns null when it cannot draw, so the caller can fall back", () => {
    expect(needleImage({ color: "#000", createCanvas: () => null })).toBeNull();
  });
});
