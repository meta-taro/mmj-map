import { describe, expect, it } from "vitest";

import { extractReferences, resolveReference, type Mount } from "../src/refs.js";

const MOUNTS: Mount[] = [
  { prefix: "/elements", dir: "packages/elements/src" },
  { prefix: "/styles", dir: "styles" },
  { prefix: "/", dir: "apps/demo" },
];

describe("extractReferences", () => {
  it("src / href のローカル参照を拾う", () => {
    const html = [
      '<link rel="stylesheet" href="./style.css">',
      '<script src="/elements/index.js"></script>',
    ].join("\n");
    expect(extractReferences(html).map((r) => r.raw)).toEqual(["./style.css", "/elements/index.js"]);
  });

  it("**外部 CDN は対象外**（向こうの都合で、こちらでは保証できない）", () => {
    const html = [
      '<script src="https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.js"></script>',
      '<link href="//example.com/a.css">',
      '<img src="data:image/png;base64,AAAA">',
      '<a href="#section">中</a>',
      '<a href="mailto:x@example.com">連絡</a>',
    ].join("\n");
    expect(extractReferences(html)).toEqual([]);
  });

  it("動的 import の静的な文字列も拾う（デモが実際に使っている形）", () => {
    expect(extractReferences(`await import('/elements/index.js');`).map((r) => r.raw)).toEqual([
      "/elements/index.js",
    ]);
  });

  it("行番号を付ける（どこを直すか分からない指摘は役に立たない）", () => {
    const html = ["<html>", "<body>", '<script src="./a.js"></script>'].join("\n");
    expect(extractReferences(html)[0]?.line).toBe(3);
  });

  it("1 行に 2 つあっても両方拾う", () => {
    const html = `<script src="./a.js"></script><script src="./b.js"></script>`;
    expect(extractReferences(html).map((r) => r.raw)).toEqual(["./a.js", "./b.js"]);
  });

  it("シングルクォートでも拾う", () => {
    expect(extractReferences(`<script src='./a.js'></script>`).map((r) => r.raw)).toEqual(["./a.js"]);
  });

  it("空の値は拾わない（`src=\"\"` は参照ではない）", () => {
    expect(extractReferences(`<img src="">`)).toEqual([]);
  });
});

describe("resolveReference", () => {
  it("相対参照は、その HTML のある場所から解く", () => {
    expect(resolveReference("./data/own-poi.geojson", "apps/demo", MOUNTS)).toBe(
      "apps/demo/data/own-poi.geojson",
    );
    expect(resolveReference("config.js", "apps/demo", MOUNTS)).toBe("apps/demo/config.js");
  });

  it("**長い prefix を先に照合する**（/elements が / に吸われない）", () => {
    expect(resolveReference("/elements/index.js", "apps/demo", MOUNTS)).toBe(
      "packages/elements/src/index.js",
    );
    expect(resolveReference("/styles/modern-dark.json", "apps/demo", MOUNTS)).toBe(
      "styles/modern-dark.json",
    );
    expect(resolveReference("/cluster.html", "apps/demo", MOUNTS)).toBe("apps/demo/cluster.html");
  });

  it("クエリとフラグメントを落としてから解く", () => {
    expect(resolveReference("./a.js?v=2", "apps/demo", MOUNTS)).toBe("apps/demo/a.js");
    expect(resolveReference("./a.html#15/34.7/135.5", "apps/demo", MOUNTS)).toBe("apps/demo/a.html");
  });

  it("`..` を潰す。**Windows の区切りを混ぜない**", () => {
    expect(resolveReference("../screenshots/a.jpg", "docs/elements", MOUNTS)).toBe(
      "docs/screenshots/a.jpg",
    );
    expect(resolveReference("./a.js", "apps/demo", MOUNTS)).not.toContain("\\");
  });

  it("どの mount にも当たらない絶対パスは null", () => {
    const narrow: Mount[] = [{ prefix: "/elements", dir: "packages/elements/src" }];
    expect(resolveReference("/nowhere/a.js", "apps/demo", narrow)).toBeNull();
  });

  it("フラグメントだけ・空は null", () => {
    expect(resolveReference("#top", "apps/demo", MOUNTS)).toBeNull();
    expect(resolveReference("", "apps/demo", MOUNTS)).toBeNull();
  });
});
