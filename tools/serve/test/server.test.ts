import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveUnderMount } from "../src/server.js";

describe("resolveUnderMount", () => {
  // **mount の dir を文字列で直書きしない。** "C:/repo/..." は Linux では絶対パスに
  // ならず、resolve() が cwd を前置するため CI だけが落ちる（実際に落ちた）。
  // 期待値も同じ resolve() で組み立て、OS に依存しない形にする。
  const demoDir = resolve("apps/demo");
  const tilesDir = resolve("dist/tiles");
  const stylesDir = resolve("styles");
  const mounts = [
    { prefix: "/", dir: demoDir },
    { prefix: "/tiles", dir: tilesDir },
    { prefix: "/styles", dir: stylesDir },
  ];

  it("長い prefix を先に照合する", () => {
    expect(resolveUnderMount("/tiles/kansai.pmtiles", mounts)).toBe(resolve(tilesDir, "kansai.pmtiles"));
    expect(resolveUnderMount("/styles/modern-dark.json", mounts)).toBe(resolve(stylesDir, "modern-dark.json"));
  });

  it("ルートは index.html に解く", () => {
    expect(resolveUnderMount("/", mounts)).toBe(resolve(demoDir, "index.html"));
  });

  it("mount の外へ出る要求を弾く（§21）", () => {
    expect(resolveUnderMount("/tiles/../../../etc/passwd", mounts)).toBe(null);
    expect(resolveUnderMount("/tiles/%2e%2e%2f%2e%2e%2fsecret", mounts)).toBe(null);
  });

  it("壊れた符号化と NUL を弾く", () => {
    expect(resolveUnderMount("/%E0%A4%A", mounts)).toBe(null);
    expect(resolveUnderMount("/a%00b", mounts)).toBe(null);
  });
});
