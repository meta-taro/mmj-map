/**
 * **base path の下に mount を移す。**
 *
 * 公開先が `/<repo>/` の下なら、手元も同じ形にしないと
 * 「手元では出るのに公開先だけ出ない」を再現できない。
 */
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveUnderMount } from "../src/server.js";
import { withBasePath } from "../src/options.js";

const demoDir = resolve("apps/demo");
const elementsDir = resolve("packages/elements/src");
const mounts = [
  { prefix: "/", dir: demoDir },
  { prefix: "/elements", dir: elementsDir },
];

describe("withBasePath", () => {
  it("base が空なら、そのまま返す", () => {
    expect(withBasePath(mounts, "")).toEqual(mounts);
  });

  it("すべての prefix の前に base を付ける", () => {
    expect(withBasePath(mounts, "/mmj")).toEqual([
      { prefix: "/mmj/", dir: demoDir },
      { prefix: "/mmj/elements", dir: elementsDir },
    ]);
  });

  it("base の下では公開先と同じように解ける", () => {
    const based = withBasePath(mounts, "/mmj");
    expect(resolveUnderMount("/mmj/elements.html", based)).toBe(resolve(demoDir, "elements.html"));
    expect(resolveUnderMount("/mmj/elements/index.js", based)).toBe(resolve(elementsDir, "index.js"));
    expect(resolveUnderMount("/mmj/", based)).toBe(resolve(demoDir, "index.html"));
  });

  it("**base の外は 404**。ここが今回の壊れ方そのもので、再現できないと気づけない", () => {
    const based = withBasePath(mounts, "/mmj");
    expect(resolveUnderMount("/elements/index.js", based)).toBe(null);
    expect(resolveUnderMount("/elements.html", based)).toBe(null);
  });
});
