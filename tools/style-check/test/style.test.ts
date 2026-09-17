import { describe, expect, it } from "vitest";

import {
  checkStyle,
  findMissingMinZoomGuards,
  findSymbolLayersWithoutGlyphs,
  findUnknownSourceLayers,
  findUnreachableZoomWindows,
  type MapStyle,
  type VectorLayer,
} from "../src/style.js";

/** 実測から起こした最小のスナップショット（tools/style-check/src/basemap-layers.json の形） */
const LAYERS: readonly VectorLayer[] = [
  { id: "earth", minzoom: 0, maxzoom: 15, fields: ["kind", "name"] },
  { id: "landcover", minzoom: 0, maxzoom: 7, fields: ["kind"] },
  { id: "buildings", minzoom: 11, maxzoom: 15, fields: ["kind", "height"] },
  { id: "places", minzoom: 1, maxzoom: 15, fields: ["kind", "min_zoom", "name"] },
  { id: "pois", minzoom: 5, maxzoom: 15, fields: ["kind", "min_zoom", "name"] },
];

const style = (layers: MapStyle["layers"], rest: Partial<MapStyle> = {}): MapStyle => ({
  version: 8,
  name: "test",
  glyphs: "https://example.invalid/{fontstack}/{range}.pbf",
  sources: {},
  layers,
  ...rest,
});

describe("findUnknownSourceLayers", () => {
  it("上流に無い source-layer を指していたら報せる", () => {
    const found = findUnknownSourceLayers(
      style([{ id: "a", type: "fill", source: "basemap", "source-layer": "transportation" }]),
      LAYERS,
    );
    expect(found.map((f) => f.layerId)).toEqual(["a"]);
    expect(found[0]?.message).toContain("transportation");
  });

  it("実在する source-layer なら何も言わない", () => {
    expect(
      findUnknownSourceLayers(style([{ id: "a", type: "fill", source: "basemap", "source-layer": "earth" }]), LAYERS),
    ).toEqual([]);
  });

  it("source-layer を持たない background は対象外", () => {
    expect(findUnknownSourceLayers(style([{ id: "bg", type: "background" }]), LAYERS)).toEqual([]);
  });
});

describe("findUnreachableZoomWindows", () => {
  it("データが始まる前に閉じる窓は、一生描かれない", () => {
    // buildings は z11 から。maxzoom 10 だと z10 未満までしか描かないので交わらない
    const found = findUnreachableZoomWindows(
      style([{ id: "b", type: "fill", source: "basemap", "source-layer": "buildings", maxzoom: 10 }]),
      LAYERS,
    );
    expect(found.map((f) => f.layerId)).toEqual(["b"]);
  });

  it("データの maxzoom より上でも、タイルセット最深なら overzoom で描かれる", () => {
    // buildings のデータは z15 まで＝タイルセット最深。z16 以降は最深タイルが引き伸ばされる
    expect(
      findUnreachableZoomWindows(
        style([{ id: "b", type: "fill", source: "basemap", "source-layer": "buildings", minzoom: 16 }]),
        LAYERS,
      ),
    ).toEqual([]);
  });

  it("タイルセット最深より手前で終わるデータは、overzoom されない", () => {
    // landcover は z7 まで（最深 15 ではない）。z8 以降のタイルに landcover は入っていない
    const found = findUnreachableZoomWindows(
      style([{ id: "lc", type: "fill", source: "basemap", "source-layer": "landcover", minzoom: 9 }]),
      LAYERS,
    );
    expect(found.map((f) => f.layerId)).toEqual(["lc"]);
  });

  it("重なっていれば何も言わない", () => {
    expect(
      findUnreachableZoomWindows(
        style([{ id: "lc", type: "fill", source: "basemap", "source-layer": "landcover", maxzoom: 8 }]),
        LAYERS,
      ),
    ).toEqual([]);
  });
});

const labelOn = (sourceLayer: string, filter?: unknown) => ({
  id: "label",
  type: "symbol" as const,
  source: "basemap",
  "source-layer": sourceLayer,
  ...(filter === undefined ? {} : { filter }),
});

describe("findMissingMinZoomGuards", () => {
  it("min_zoom を持つ source-layer のラベルが、それを見ていなければ報せる", () => {
    const found = findMissingMinZoomGuards(style([labelOn("places", ["==", ["get", "kind"], "locality"])]), LAYERS);
    expect(found.map((f) => f.layerId)).toEqual(["label"]);
  });

  it("フィルタが無いラベルも対象", () => {
    expect(findMissingMinZoomGuards(style([labelOn("places")]), LAYERS).map((f) => f.layerId)).toEqual(["label"]);
  });

  it("入れ子の中で min_zoom を見ていれば通す", () => {
    const filter = ["all", ["==", ["get", "kind"], "station"], ["<=", ["get", "min_zoom"], ["zoom"]]];
    expect(findMissingMinZoomGuards(style([labelOn("pois", filter)]), LAYERS)).toEqual([]);
  });

  it("min_zoom を持たない source-layer は対象外", () => {
    expect(findMissingMinZoomGuards(style([labelOn("earth")]), LAYERS)).toEqual([]);
  });

  it("面や線は対象外（対象は symbol と circle だけ）", () => {
    const fill = { id: "f", type: "fill" as const, source: "basemap", "source-layer": "places" };
    expect(findMissingMinZoomGuards(style([fill]), LAYERS)).toEqual([]);
  });
});

describe("findSymbolLayersWithoutGlyphs", () => {
  it("symbol があるのに glyphs が無ければ報せる（地図全体が白くなる）", () => {
    const s = style([{ id: "l", type: "symbol", source: "basemap", "source-layer": "places" }], { glyphs: undefined });
    expect(findSymbolLayersWithoutGlyphs(s).map((f) => f.layerId)).toEqual(["l"]);
  });

  it("symbol が無ければ glyphs は要らない", () => {
    expect(findSymbolLayersWithoutGlyphs(style([{ id: "bg", type: "background" }], { glyphs: undefined }))).toEqual([]);
  });
});

describe("checkStyle", () => {
  it("すべての検査をまとめて返す", () => {
    const s = style([
      { id: "bad-source", type: "fill", source: "basemap", "source-layer": "transportation" },
      { id: "bad-label", type: "symbol", source: "basemap", "source-layer": "places" },
    ]);
    expect(checkStyle(s, LAYERS).map((f) => f.layerId).sort()).toEqual(["bad-label", "bad-source"]);
  });

  it("問題が無ければ空", () => {
    const s = style([
      { id: "earth", type: "fill", source: "basemap", "source-layer": "earth" },
      {
        id: "label",
        type: "symbol",
        source: "basemap",
        "source-layer": "places",
        filter: ["<=", ["get", "min_zoom"], ["zoom"]],
      },
    ]);
    expect(checkStyle(s, LAYERS)).toEqual([]);
  });
});
