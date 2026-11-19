import { describe, expect, it } from "vitest";

import { distanceToArea } from "../src/area.js";
import { arrowStep, clampWithin, distanceMeters, KEY_STEP, moveDetail, parseRadius } from "../src/drag.js";

/** @type {[number, number]} */
const umeda = [135.4959, 34.7024];

/** 元の点からの距離を、別の計算（`area.js`）で測り直す @param {[number, number]} p */
const measured = (p) => /** @type {number} */ (distanceToArea(p, { center: umeda, radius: 0.001 }));

describe("distanceMeters", () => {
  it("agrees with the independent area measure", () => {
    /** @type {[number, number]} */
    const p = [135.5, 34.705];
    expect(Math.abs(distanceMeters(umeda, p) - measured(p))).toBeLessThan(0.5);
  });
});

describe("clampWithin", () => {
  it("leaves a point inside the range where it was put", () => {
    /** @type {[number, number]} */
    const near = [135.4961, 34.7025];
    expect(clampWithin(umeda, near, 50)).toEqual(near);
  });

  it("pulls a point outside back onto the edge, in the same direction", () => {
    /** @type {[number, number]} */
    const far = [135.51, 34.71]; // 約 1.6 km 先
    const clamped = clampWithin(umeda, far, 50);
    expect(measured(clamped)).toBeGreaterThan(49);
    expect(measured(clamped)).toBeLessThanOrEqual(50.5);
    // 向きは変えない（北東へ動かしたなら、北東の縁で止まる）
    const before = Math.atan2(far[1] - umeda[1], far[0] - umeda[0]);
    const after = Math.atan2(clamped[1] - umeda[1], clamped[0] - umeda[0]);
    expect(after).toBeCloseTo(before, 6);
  });

  it("stays accurate for a range of a kilometre (under a metre off)", () => {
    const clamped = clampWithin(umeda, [135.6, 34.8], 1000);
    expect(Math.abs(measured(clamped) - 1000)).toBeLessThan(1);
  });

  it("does not limit when there is no range", () => {
    /** @type {[number, number]} */
    const far = [139.7, 35.7];
    expect(clampWithin(umeda, far, null)).toEqual(far);
    expect(clampWithin(umeda, far, 0)).toEqual(far);
  });
});

describe("parseRadius", () => {
  it("reads a positive number of metres", () => {
    expect(parseRadius("30")).toBe(30);
    expect(parseRadius(" 12.5 ")).toBe(12.5);
  });

  it("does not limit on a value it cannot read (never a pin that cannot move)", () => {
    for (const value of ["", "0", "-5", "30m", null, undefined]) expect(parseRadius(value)).toBeNull();
  });
});

describe("arrowStep", () => {
  it("moves finely by default and coarsely with Shift", () => {
    expect(arrowStep("ArrowLeft", false)).toEqual([-KEY_STEP.fine, 0]);
    expect(arrowStep("ArrowDown", true)).toEqual([0, KEY_STEP.coarse]);
    expect(KEY_STEP.fine).toBeLessThan(KEY_STEP.coarse);
  });

  it("ignores keys that are not arrows (Tab and Enter keep their usual job)", () => {
    expect(arrowStep("Tab", false)).toBeNull();
    expect(arrowStep("Enter", false)).toBeNull();
  });
});

describe("moveDetail", () => {
  it("rounds to about a centimetre, and says how far it moved", () => {
    const detail = moveDetail(umeda, [135.49590000000001, 34.70285]);
    expect(detail.lng).toBe(135.4959);
    expect(detail.lngLat).toEqual([135.4959, 34.70285]);
    expect(detail.moved).toBeCloseTo(50, 0);
  });
});
