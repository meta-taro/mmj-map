/**
 * **検査の既定は「styles/ の全部」。**
 *
 * 既定を 1 枚に固定していると、**スタイルを足した人が検査対象に入れ忘れる**。
 * 入れ忘れても CI は緑のままなので、誰も気づけない。
 */
import { describe, expect, it } from "vitest";

import { pickStyleFiles } from "../src/targets.js";

describe("pickStyleFiles", () => {
  it("styles/ の .json を、並びを固定して返す", () => {
    expect(pickStyleFiles(["modern-light.json", "modern-dark.json", "modern-ink.json"])).toEqual([
      "styles/modern-dark.json",
      "styles/modern-ink.json",
      "styles/modern-light.json",
    ]);
  });

  it(".json 以外は拾わない", () => {
    expect(pickStyleFiles(["README.md", "modern-dark.json", "palette.txt"])).toEqual([
      "styles/modern-dark.json",
    ]);
  });

  it("**1 枚も無ければ投げる**（0 件で黙って通すと、検査が消えたことに気づけない）", () => {
    expect(() => pickStyleFiles([])).toThrow();
    expect(() => pickStyleFiles(["README.md"])).toThrow();
  });
});
