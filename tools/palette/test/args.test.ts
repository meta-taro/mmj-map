/**
 * CLI の引数。**ここは純粋関数**（読み書きは cli.ts）。
 */
import { describe, expect, it } from "vitest";

import { parseArgs } from "../src/args.js";

const REQUIRED = ["--land=#f7f9fb", "--water=#bfd7e8", "--ink=#16202b", "--accent=#0a5fff"];

describe("parseArgs", () => {
  it("指し値を読む", () => {
    expect(parseArgs(REQUIRED).anchors).toEqual({
      land: "#f7f9fb",
      water: "#bfd7e8",
      ink: "#16202b",
      accent: "#0a5fff",
    });
  });

  it("緑は省ける", () => {
    expect(parseArgs(REQUIRED).anchors.green).toBeUndefined();
    expect(parseArgs([...REQUIRED, "--green=#c9f2c7"]).anchors.green).toBe("#c9f2c7");
  });

  it("**足りない指し値を名指しで言う**（勝手に作らない）", () => {
    expect(() => parseArgs(["--land=#fff"])).toThrow(/water/);
    expect(() => parseArgs([])).toThrow(/land/);
  });

  it("既定は配色だけ。`--style` でスタイルごと作る", () => {
    expect(parseArgs(REQUIRED).mode).toBe("palette");
    expect(parseArgs([...REQUIRED, "--style"]).mode).toBe("style");
  });

  it("`--style` には土台と名前が要る", () => {
    expect(parseArgs([...REQUIRED, "--style"]).base).toBe("modern-light");
    expect(parseArgs([...REQUIRED, "--style", "--base=modern-dark"]).base).toBe("modern-dark");
    expect(parseArgs([...REQUIRED, "--style", "--name=Acme"]).name).toBe("Acme");
  });

  it("`--out` が無ければ標準出力（`null`）", () => {
    expect(parseArgs(REQUIRED).out).toBeNull();
    expect(parseArgs([...REQUIRED, "--out=brand.json"]).out).toBe("brand.json");
  });

  it("役割の上書きを読む（`--set=water=#001122`）", () => {
    const parsed = parseArgs([...REQUIRED, "--set=water=#001122", "--set=road-minor=#ffffff"]);
    expect(parsed.overrides).toEqual({ water: "#001122", "road-minor": "#ffffff" });
  });

  it("**知らない引数は投げる。**黙って無視すると「指定したのに効かない」になる", () => {
    expect(() => parseArgs([...REQUIRED, "--colour=#fff"])).toThrow(/--colour/);
  });

  it("**素の `--` は読み飛ばす。**pnpm がそのまま渡してくる", () => {
    expect(parseArgs(["--", ...REQUIRED]).anchors.land).toBe("#f7f9fb");
  });

  it("`--set` の形が違えば投げる", () => {
    expect(() => parseArgs([...REQUIRED, "--set=water"])).toThrow();
  });
});
