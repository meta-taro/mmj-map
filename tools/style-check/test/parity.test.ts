/**
 * **スタイル同士で違っていいのは色だけ。**
 *
 * 配色違いを 4 枚持つと、レイヤ構成やフィルタが少しずつずれていく。
 * ずれると「dark では出るのに light では出ない地物」が生まれ、
 * **どちらが正しいのか誰にも分からなくなる**（D-002 は色を人が選ぶ話で、
 * 構造まで枝分かれさせる話ではない）。
 *
 * ここで見るのは構造だけ。色（paint の中の色）は見ない。
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { pickStyleFiles } from "../src/targets.js";
import type { MapStyle, StyleLayer } from "../src/style.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function load(file: string): MapStyle {
  return JSON.parse(readFileSync(resolve(repoRoot, file), "utf8")) as MapStyle;
}

/** 構造だけを取り出す。**色は含めない** */
function shapeOf(layer: StyleLayer): unknown {
  const record = layer as unknown as Record<string, unknown>;
  return {
    id: record["id"],
    type: record["type"],
    source: record["source"],
    sourceLayer: record["source-layer"],
    filter: record["filter"],
    minzoom: record["minzoom"],
    maxzoom: record["maxzoom"],
    layout: record["layout"],
  };
}

/** 色だけを取り出す。**構造は含めない**（構造の一致は別のテストが見ている） */
function colorsOf(style: MapStyle): string {
  return JSON.stringify(style.layers.map((l) => (l as unknown as Record<string, unknown>)["paint"]));
}

const files = pickStyleFiles(readdirSync(resolve(repoRoot, "styles")));
const base = "styles/modern-dark.json";
const others = files.filter((f) => f !== base);

describe("スタイルの構造は 1 つ（違うのは色だけ）", () => {
  it("正本のほかに、少なくとも 1 枚の配色違いがある", () => {
    expect(others.length).toBeGreaterThan(0);
  });

  it.each(others)("%s は modern-dark と同じレイヤ構成", (file) => {
    expect(load(file).layers.map(shapeOf)).toEqual(load(base).layers.map(shapeOf));
  });

  it.each(files)("%s は __TILES_URL__ を持つ（焼き込まない）", (file) => {
    expect(readFileSync(resolve(repoRoot, file), "utf8")).toContain("__TILES_URL__");
  });

  it.each(files)("%s は帰属表示を持つ（ODbL。消した状態で配らない）", (file) => {
    const source = load(file).sources?.["basemap"] as { attribution?: string } | undefined;
    expect(source?.attribution).toBe("© OpenStreetMap contributors");
  });

  it.each(others)("%s は modern-dark と違う色を持つ（同じなら足した意味がない）", (file) => {
    expect(colorsOf(load(file))).not.toBe(colorsOf(load(base)));
  });
});
