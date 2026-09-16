import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { checkStyle, describeFinding, type MapStyle } from "../src/style.js";
import { loadVectorLayers } from "../src/basemap.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const style = JSON.parse(readFileSync(resolve(repoRoot, "styles/modern-dark.json"), "utf8")) as MapStyle;

describe("styles/modern-dark.json", () => {
  it("pin したビルドに対して、指摘が 1 件も無い", () => {
    // 落ちたときに「どのレイヤの何が」まで出す。件数だけでは直せない
    expect(checkStyle(style, loadVectorLayers()).map(describeFinding)).toEqual([]);
  });

  it("参照している source-layer が、スナップショットに全部ある", () => {
    const available = new Set(loadVectorLayers().map((l) => l.id));
    const referenced = [...new Set(style.layers.map((l) => l["source-layer"]).filter((x): x is string => !!x))];
    expect(referenced.filter((id) => !available.has(id))).toEqual([]);
    expect(referenced.length).toBeGreaterThan(0);
  });
});
