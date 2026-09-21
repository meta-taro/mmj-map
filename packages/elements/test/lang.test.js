import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { applyLanguage, readLanguage } from "../src/lang.js";

/**
 * ラベルをどの言語で出すか。**地域ごとにスタイルを増やさない。**
 *
 * スタイルは 6 枚のままで、読み込んだあとに `text-field` を差し替える
 * （`palette.js` が色に対してやっているのと同じ仕組み）。
 * 地域 × 配色でスタイルを持つと、**6 枚が 24 枚 48 枚と増えて破綻する**。
 *
 * **上流が持っているキーは実測した**（`pnpm tile:inspect -- … --layer=places --list`）:
 * `name:en` 508 / `name:zh-Hant` 20 / `name:zh-Hans` 20 / `name:ko` 9 / `name:vi` 2。
 * **`name:zh` は無い。**推測で書くと当たらない。
 */
/** @param {string} name @returns {any} */
function loadStyle(name) {
  return JSON.parse(readFileSync(new URL(`../../../styles/${name}.json`, import.meta.url), "utf8"));
}

/** ラベル層の `text-field` を集める */
/** @param {any} style @returns {string[]} */
function fields(style) {
  return style.layers
    .map((/** @type {any} */ l) => l.layout?.["text-field"])
    .filter((/** @type {any} */ f) => f !== undefined)
    .map((/** @type {any} */ f) => JSON.stringify(f));
}

describe("applyLanguage", () => {
  it("**すべてのラベル層を差し替える**（1 つ残すと、そこだけ言語が違う）", () => {
    const result = applyLanguage(loadStyle("modern-dark"), "zh-Hant");
    expect(result.applied).toBe(4);
    for (const f of fields(result.style)) {
      expect(f).toContain("name:zh-Hant");
      expect(f).not.toContain("name:ja");
    }
  });

  it("**`name` への落とし先を残す。**その言語の名前が無い地物は消えてはいけない", () => {
    const result = applyLanguage(loadStyle("modern-light"), "ko");
    for (const f of fields(result.style)) {
      expect(f).toContain('["get","name"]');
    }
  });

  it("**元のスタイルを書き換えない**（不変・ECC coding-style）", () => {
    const style = loadStyle("modern-dark");
    const before = fields(style);
    applyLanguage(style, "vi");
    expect(fields(style)).toEqual(before);
  });

  it("6 枚すべてに同じだけ当たる（構造が同じなので数も同じ）", () => {
    const counts = [
      "modern-dark",
      "modern-light",
      "modern-ink",
      "modern-sand",
      "modern-neon",
      "modern-candy",
    ].map((/** @type {string} */ n) => applyLanguage(loadStyle(n), "en").applied);
    expect(new Set(counts).size).toBe(1);
    expect(counts[0]).toBe(4);
  });

  it("言語を渡さなければ、そのまま返す（**既定を勝手に変えない**）", () => {
    const style = loadStyle("modern-dark");
    const result = applyLanguage(style, null);
    expect(result.applied).toBe(0);
    expect(fields(result.style)).toEqual(fields(style));
  });

  it("ラベル層が無ければ 0 件（呼ぶ側が気づける）", () => {
    expect(applyLanguage({ layers: [] }, "en").applied).toBe(0);
    expect(applyLanguage(null, "en").applied).toBe(0);
  });

  it("`text-field` が素の文字列でも壊さない（上流が形を変えても落ちない）", () => {
    const style = { layers: [{ id: "x", layout: { "text-field": "固定文字" } }] };
    const result = applyLanguage(style, "en");
    expect(result.applied).toBe(0);
    expect(result.style.layers[0].layout["text-field"]).toBe("固定文字");
  });
});

describe("readLanguage", () => {
  it("使える形だけ通す（BCP 47 の素朴な形）", () => {
    for (const ok of ["en", "ja", "ko", "vi", "zh-Hant", "zh-Hans", "pt-BR"]) {
      expect(readLanguage(ok), ok).toBe(ok);
    }
  });

  it("**怪しい値は通さない。**`text-field` に何でも入れさせない", () => {
    for (const ng of ["", " ", "name:ja", "../x", "en'\"]", "日本語", null, undefined]) {
      expect(readLanguage(ng), String(ng)).toBeNull();
    }
  });

  it("前後の空白は落とす", () => {
    expect(readLanguage("  zh-Hant  ")).toBe("zh-Hant");
  });
});
