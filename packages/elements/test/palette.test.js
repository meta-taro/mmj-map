import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  ACCENT_ROLES,
  ROLE_LAYERS,
  applyPalette,
  readDeclaredAccent,
  readTheme,
  themeClassName,
} from "../src/palette.js";

/**
 * 実物の手書きスタイル。**作り物で試すと、役割名のずれに気づけない**
 * @param {string} name
 * @returns {any}
 */
function loadStyle(name) {
  return JSON.parse(readFileSync(new URL(`../../../styles/${name}.json`, import.meta.url), "utf8"));
}

describe("ROLE_LAYERS", () => {
  it("役割はすべて、実物のスタイルのレイヤを指している", () => {
    const style = loadStyle("modern-dark");
    const ids = new Set(style.layers.map((/** @type {any} */ l) => l.id));
    for (const [role, targets] of Object.entries(ROLE_LAYERS)) {
      for (const target of targets) {
        expect(ids.has(target.layer), `${role} -> ${target.layer}`).toBe(true);
      }
    }
  });

  it("指している paint プロパティが、実物に存在する", () => {
    const style = loadStyle("modern-dark");
    for (const [role, targets] of Object.entries(ROLE_LAYERS)) {
      for (const target of targets) {
        const layer = style.layers.find((/** @type {any} */ l) => l.id === target.layer);
        expect(layer.paint?.[target.prop], `${role} -> ${target.layer}.${target.prop}`).toBeTypeOf("string");
      }
    }
  });

  it("accent が当たる役割は ROLE_LAYERS に含まれる", () => {
    for (const role of ACCENT_ROLES) expect(ROLE_LAYERS).toHaveProperty(role);
  });
});

describe("applyPalette", () => {
  it("渡した色だけを当て、当てた数を返す", () => {
    const style = loadStyle("modern-dark");
    const result = applyPalette(style, { water: "#123456" });
    expect(result.applied).toBe(1);
    expect(result.style.layers.find((/** @type {any} */ l) => l.id === "water").paint["fill-color"]).toBe("#123456");
  });

  it("**元のスタイルを書き換えない**（不変・ECC coding-style）", () => {
    const style = loadStyle("modern-dark");
    const waterColor = () =>
      style.layers.find((/** @type {any} */ l) => l.id === "water").paint["fill-color"];
    const before = waterColor();
    applyPalette(style, { water: "#123456" });
    expect(waterColor()).toBe(before);
  });

  it("1 つの役割が複数のレイヤに当たる（halo は 4 つのラベル全部）", () => {
    const style = loadStyle("modern-dark");
    const result = applyPalette(style, { halo: "#000000" });
    expect(result.applied).toBe(ROLE_LAYERS.halo.length);
    expect(ROLE_LAYERS.halo.length).toBeGreaterThan(1);
  });

  it("知らない役割は無視して、当てた数に数えない", () => {
    const style = loadStyle("modern-dark");
    expect(applyPalette(style, { "no-such-role": "#fff" }).applied).toBe(0);
  });

  it("レイヤが無いスタイルには当たらない（applied 0 で呼び手が気づける）", () => {
    expect(applyPalette({ layers: [] }, { water: "#123456" }).applied).toBe(0);
  });

  it("6 枚すべてに同じ役割が当たる（構造が同じなので数も同じ）", () => {
    const names = ["modern-dark", "modern-light", "modern-ink", "modern-sand", "modern-neon", "modern-candy"];
    const counts = names.map((n) => applyPalette(loadStyle(n), { highway: "#123456", station: "#123456" }).applied);
    expect(new Set(counts).size).toBe(1);
    expect(counts[0]).toBeGreaterThan(0);
  });
});

describe("readTheme", () => {
  it("スタイルから枠の色を読む。**部品が色を持たないため**", () => {
    const theme = readTheme(loadStyle("modern-dark"));
    expect(theme.background).toBe("#1B1F24");
    expect(theme.text).toBe("#D8DCE1");
    expect(theme.border).toBe("#2E343B");
  });

  it("**明るいスタイルでは明るい色が返る**（light の上で暗い箱が浮いていた）", () => {
    const dark = readTheme(loadStyle("modern-dark"));
    const light = readTheme(loadStyle("modern-light"));
    expect(light.background).not.toBe(dark.background);
    expect(light.background).toBe("#EDF0F3");
  });

  it("読めない値は null（**勝手に色を作らない**・baseline §11）", () => {
    const theme = readTheme({ layers: [] });
    expect(theme.background).toBeNull();
    expect(theme.border).toBeNull();
  });

  it("式（配列）で書かれた paint は色として読まない", () => {
    const style = { layers: [{ id: "background", paint: { "background-color": ["interpolate"] } }] };
    expect(readTheme(style).background).toBeNull();
  });
});

describe("themeClassName", () => {
  it("同じ色なら同じ名前（1 ページに同じ配色の地図が何枚あっても style は 1 つ）", () => {
    const colors = { background: "#1B1F24", text: "#D8DCE1", border: "#2E343B" };
    expect(themeClassName(colors)).toBe(themeClassName({ ...colors }));
  });

  it("**違う色なら違う名前。**ここが同じだと、6 枚のうち 1 枚の色が全部に効く", () => {
    expect(themeClassName({ background: "#000000", text: "#fff", border: "#111" })).not.toBe(
      themeClassName({ background: "#FFFFFF", text: "#000", border: "#eee" }),
    );
  });

  it("CSS のクラス名として使える文字だけを返す", () => {
    const name = themeClassName({ background: "#1B1F24", text: "#D8DCE1", border: "#2E343B" });
    expect(name).toMatch(/^mmj-popup-[a-z0-9]+$/);
  });
});

/**
 * 生成したスタイル（`pnpm palette -- --style`）は、**作った元の指し値を持っている**。
 * `accent` 属性を書かなくても、目印やまとまりがそのスタイルの色に揃うようにする。
 */
describe("readDeclaredAccent", () => {
  it("生成スタイルが持っている accent を読む", () => {
    const style = { metadata: { "mmj:anchors": { accent: "#0a5fff" } }, layers: [] };
    expect(readDeclaredAccent(style)).toBe("#0a5fff");
  });

  it("手書きの 6 枚には無いので null（**勝手に高速道路の色を使わない**）", () => {
    expect(readDeclaredAccent({ metadata: {}, layers: [] })).toBeNull();
    expect(readDeclaredAccent({ layers: [] })).toBeNull();
    expect(readDeclaredAccent(null)).toBeNull();
  });

  it("色でない値は読まない", () => {
    expect(readDeclaredAccent({ metadata: { "mmj:anchors": { accent: 12 } } })).toBeNull();
    expect(readDeclaredAccent({ metadata: { "mmj:anchors": "青" } })).toBeNull();
  });
});
