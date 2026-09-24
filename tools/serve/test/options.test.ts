/**
 * **手元の配信を、公開先と同じ形にするための引数。**
 *
 * GitHub Pages は `https://<user>.github.io/<repo>/` の下に置かれる。
 * 手元が `/` 直下だと、`/elements/index.js` のような絶対パス参照が**手元だけ通る**。
 * 実際にこれで 4 枚のデモが公開先だけ地図を出せなくなっていた（2026-09-21）。
 */
import { describe, expect, it } from "vitest";

import { readBase, readPort } from "../src/options.js";

describe("readPort", () => {
  it("指定が無ければ 8787", () => {
    expect(readPort([])).toBe(8787);
  });

  it("--port= を読む", () => {
    expect(readPort(["--port=9000"])).toBe(9000);
  });

  it("範囲外と非整数は弾く（**黙って既定へ落とさない**。指定が効いていないことに気づけなくなる）", () => {
    expect(() => readPort(["--port=0"])).toThrow();
    expect(() => readPort(["--port=70000"])).toThrow();
    expect(() => readPort(["--port=abc"])).toThrow();
  });
});

describe("readBase", () => {
  it("指定が無ければ空文字（いまの既定を変えない）", () => {
    expect(readBase([])).toBe("");
  });

  it("--base= を読む", () => {
    expect(readBase(["--base=/mmj-map"])).toBe("/mmj-map");
  });

  it("先頭の / を補い、末尾の / を落とす（`/x/` と `/x` で挙動が変わらないように）", () => {
    expect(readBase(["--base=mmj-map"])).toBe("/mmj-map");
    expect(readBase(["--base=/mmj-map/"])).toBe("/mmj-map");
  });

  it("`--base=/` は「base 無し」と同じ", () => {
    expect(readBase(["--base=/"])).toBe("");
  });

  it("空白や `..` を含むものは弾く", () => {
    expect(() => readBase(["--base=/a b"])).toThrow();
    expect(() => readBase(["--base=/../etc"])).toThrow();
  });
});
