/**
 * 指し値（アンカー）から 24 の役割を作る。**D-021 で人が認めた範囲。**
 *
 * ここで作った配色は**導入者のもの**で、MMJ が配る 6 枚は手書きのまま（D-002）。
 * 出したものは編集される前提なので、**後から手で直せる形**（役割 → 色の JSON）で返す。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { ROLE_ORDER, deriveRoles, type Role } from "../src/derive.js";
import { parseHex } from "../src/oklab.js";

/** 明るい土台の例 */
const LIGHT = { land: "#f7f9fb", water: "#bfd7e8", ink: "#16202b", accent: "#0a5fff" };
/** 暗い土台の例 */
const DARK = { land: "#12161c", water: "#12303f", ink: "#e6ebf1", accent: "#ff7a1a" };

/** 明度の代わり。**正確な明度ではないが、順序を見るには足りる** */
function level(hex: string): number {
  const c = parseHex(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

describe("ROLE_ORDER", () => {
  it("部品が知っている役割と、過不足なく一致する", async () => {
    const { ROLE_LAYERS } = await import("@modern-map-japan/elements/palette");
    expect([...ROLE_ORDER].sort()).toEqual(Object.keys(ROLE_LAYERS).sort());
  });
});

describe("deriveRoles", () => {
  it("24 の役割をすべて返す（**書き漏らした役割は土台のままになる**）", () => {
    const roles = deriveRoles(LIGHT);
    expect(Object.keys(roles).sort()).toEqual([...ROLE_ORDER].sort());
    for (const value of Object.values(roles)) expect(value).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("指し値はそのまま出る（**渡した色を作り変えない**）", () => {
    const roles = deriveRoles(LIGHT);
    expect(roles["background"]).toBe(LIGHT.land);
    expect(roles["earth"]).toBe(LIGHT.land);
    expect(roles["water"]).toBe(LIGHT.water);
    expect(roles["label-city"]).toBe(LIGHT.ink);
    expect(roles["highway"]).toBe(LIGHT.accent);
  });

  it("**道は細いものほど地色に近い。**序列が明度で読める", () => {
    const r = deriveRoles(LIGHT);
    const land = level(LIGHT.land);
    const steps = ["path", "road-minor", "road-medium", "road-major"].map((k) =>
      Math.abs(level(r[k as Role]) - land),
    );
    for (let i = 1; i < steps.length; i += 1) expect(steps[i]!).toBeGreaterThan(steps[i - 1]!);
  });

  it("暗い土台でも同じ序列になる（**式を 2 つ持たない**）", () => {
    const r = deriveRoles(DARK);
    const land = level(DARK.land);
    const steps = ["path", "road-minor", "road-medium", "road-major"].map((k) =>
      Math.abs(level(r[k as Role]) - land),
    );
    for (let i = 1; i < steps.length; i += 1) expect(steps[i]!).toBeGreaterThan(steps[i - 1]!);
  });

  it("ラベルは主要なものほど文字色に近い", () => {
    const r = deriveRoles(LIGHT);
    const ink = level(LIGHT.ink);
    const away = ["label-city", "label-station", "label-neighbourhood"].map((k) =>
      Math.abs(level(r[k as Role]) - ink),
    );
    for (let i = 1; i < away.length; i += 1) expect(away[i]!).toBeGreaterThan(away[i - 1]!);
  });

  it("**縁取りは地色。**文字と同じ側にすると、ラベルが読めなくなる", () => {
    expect(deriveRoles(LIGHT)["halo"]).toBe(LIGHT.land);
    expect(deriveRoles(DARK)["halo"]).toBe(DARK.land);
  });

  it("水は陸の系列から独立している（水だけ色みが違うのが地図の慣習）", () => {
    const r = deriveRoles(LIGHT);
    const water = parseHex(r["water"]!);
    const buildings = parseHex(r["buildings"]!);
    expect(water.b - water.r).toBeGreaterThan(buildings.b - buildings.r);
  });

  it("緑を渡さなければ、陸から導く（**渡せば、渡した色をそのまま使う**）", () => {
    expect(deriveRoles({ ...LIGHT, green: "#c9f2c7" })["green"]).toBe("#c9f2c7");
    const derived = parseHex(deriveRoles(LIGHT)["green"]!);
    expect(derived.g).toBeGreaterThan(derived.r);
    expect(derived.g).toBeGreaterThan(derived.b);
  });

  it("駅の丸は、地色で抜いて accent で縁取る", () => {
    const r = deriveRoles(LIGHT);
    expect(r["station-fill"]).toBe(LIGHT.land);
    expect(r["station"]).toBe(LIGHT.accent);
  });

  it("**同じ指し値なら毎回同じ結果**（乱数を使っていない）", () => {
    expect(deriveRoles(LIGHT)).toEqual(deriveRoles(LIGHT));
  });

  it("読めない色は投げる（**黙って黒い地図を出さない**）", () => {
    expect(() => deriveRoles({ ...LIGHT, land: "みずいろ" })).toThrow();
    expect(() => deriveRoles({ ...LIGHT, accent: "" })).toThrow();
  });

  it("**手で直した色が勝つ。**出したものは編集される前提", () => {
    const roles = deriveRoles(LIGHT, { water: "#001122", "road-minor": "#ffffff" });
    expect(roles["water"]).toBe("#001122");
    expect(roles["road-minor"]).toBe("#ffffff");
    expect(roles["background"]).toBe(LIGHT.land);
  });

  it("知らない役割を上書きに混ぜたら投げる（綴り間違いを黙って捨てない）", () => {
    expect(() => deriveRoles(LIGHT, { "no-such-role": "#fff" })).toThrow();
  });
});

describe("実物のスタイルに当たる", () => {
  it("作った 24 色が、配っている 6 枚すべてに当たる", async () => {
    const { applyPalette } = await import("@modern-map-japan/elements/palette");
    const roles = deriveRoles(LIGHT);
    for (const name of ["modern-dark", "modern-light", "modern-ink", "modern-sand", "modern-neon", "modern-candy"]) {
      const style = JSON.parse(
        readFileSync(new URL(`../../../styles/${name}.json`, import.meta.url), "utf8"),
      );
      expect(applyPalette(style, roles).applied, name).toBe(27);
    }
  });
});
