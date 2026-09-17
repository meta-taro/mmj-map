import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { decodeTile } from "../src/mvt.js";
import { tally, visibleAt, type HasProps } from "../src/tally.js";
import { encodeTile } from "./encode.js";

describe("decodeTile", () => {
  it("レイヤ名と件数を読む", () => {
    const buf = encodeTile([
      { name: "pois", features: [{ props: { name: "あ" } }, { props: { name: "い" } }] },
      { name: "water", features: [{ props: { name: "川" } }] },
    ]);
    const layers = decodeTile(buf);
    expect(layers.map((l) => [l.name, l.features.length])).toEqual([
      ["pois", 2],
      ["water", 1],
    ]);
  });

  it("属性を読む（文字列と整数）", () => {
    const buf = encodeTile([
      { name: "pois", features: [{ props: { name: "京セラドーム大阪", kind: "stadium", min_zoom: 15 } }] },
    ]);
    expect(decodeTile(buf)[0]?.features[0]?.props).toEqual({
      name: "京セラドーム大阪",
      kind: "stadium",
      min_zoom: 15,
    });
  });

  it("**gzip されていても読む。**PMTiles のタイルは圧縮されている", () => {
    const buf = encodeTile([{ name: "pois", features: [{ props: { kind: "station" } }] }]);
    expect(decodeTile(gzipSync(buf))[0]?.features[0]?.props["kind"]).toBe("station");
  });

  it("extent を読む（既定の 4096 を決め打ちしない）", () => {
    const buf = encodeTile([{ name: "pois", features: [], extent: 8192 }]);
    expect(decodeTile(buf)[0]?.extent).toBe(8192);
  });

  it("空のタイルは空の配列（**例外にしない**。空は起こりうる状態）", () => {
    expect(decodeTile(Buffer.alloc(0))).toEqual([]);
  });

  it("**幾何が付いていても読める**（本物のタイルには必ず付いていて、しかも最後に来る）", () => {
    const buf = encodeTile([
      {
        name: "buildings",
        features: [
          { props: { kind: "building" }, geometryBytes: 104 },
          { props: { kind: "building" }, geometryBytes: 7 },
        ],
      },
    ]);
    const layer = decodeTile(buf)[0];
    expect(layer?.features).toHaveLength(2);
    expect(layer?.unreadable).toBe(0);
  });

  it("知らないフィールドが混ざっても、その先を読み続ける（上流が足しても壊れない）", () => {
    const buf = encodeTile([
      {
        name: "pois",
        features: [{ props: { kind: "stadium" }, unknownField: { tag: 9, value: 123 }, geometryBytes: 12 }],
      },
    ]);
    const layer = decodeTile(buf)[0];
    expect(layer?.features[0]?.props["kind"]).toBe("stadium");
    expect(layer?.unreadable).toBe(0);
  });

  it("読めなかった地物は、件数として必ず報告する（**黙って少ない数を出さない**）", () => {
    const buf = encodeTile([{ name: "pois", features: [{ props: { kind: "x" }, geometryBytes: 4 }] }]);
    expect(decodeTile(buf)[0]?.unreadable).toBe(0);
  });

  it("属性を持たない地物も落とさない", () => {
    const buf = encodeTile([{ name: "roads", features: [{ props: {} }] }]);
    expect(decodeTile(buf)[0]?.features).toHaveLength(1);
  });
});

describe("tally", () => {
  const features: HasProps[] = [
    { props: { kind: "station", min_zoom: 13 } },
    { props: { kind: "stadium", min_zoom: 15 } },
    { props: { kind: "station", min_zoom: 14 } },
    { props: { kind: "tree" } },
  ];

  it("指定した属性で数える。多い順", () => {
    expect(tally(features, "kind")).toEqual([
      { value: "station", count: 2 },
      { value: "stadium", count: 1 },
      { value: "tree", count: 1 },
    ]);
  });

  it("属性を持たないものは `(なし)` にまとめる。**黙って落とさない**", () => {
    expect(tally(features, "min_zoom")).toContainEqual({ value: "(なし)", count: 1 });
  });
});

describe("visibleAt", () => {
  const features: HasProps[] = [
    { props: { kind: "station", min_zoom: 13 } },
    { props: { kind: "stadium", min_zoom: 15 } },
    { props: { kind: "tree", min_zoom: 17 } },
  ];

  it("その倍率で出る資格があるものだけを返す（上流の min_zoom を捨てない）", () => {
    expect(visibleAt(features, 15).map((f) => f.props["kind"])).toEqual(["station", "stadium"]);
  });

  it("min_zoom を持たないものは**出る側**に入れる（上流が黙っている＝制限なし）", () => {
    const noMinZoom: HasProps[] = [{ props: { kind: "x" } }];
    expect(visibleAt(noMinZoom, 5)).toHaveLength(1);
  });
});
