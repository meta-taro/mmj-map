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

/**
 * **座標も読む。**
 *
 * 「何が何件あるか」だけでは、**デモに置く経路を実際の道の上に乗せられない**。
 * 手で折れ線を書くと道を無視した線になり、地図として嘘になる
 * （2026-09-21・人の指摘「道を無視して、線がひかれているのがきになります」）。
 *
 * 描くのは MapLibre の仕事のままで、ここは**中の座標を見る**ための読み出し。
 */
/** MVT のコマンド: MoveTo=1 / LineTo=2 / ClosePath=7。パラメータは zigzag */
const zig = (n: number) => (n << 1) ^ (n >> 31);
const cmd = (id: number, count: number) => (count << 3) | id;
const geom = (...values: number[]) => Buffer.from(values.map((v) => v & 0x7f));

describe("幾何を読む", () => {

  it("線の座標を返す（MoveTo ＋ LineTo）", () => {
    // MoveTo 1 個 (5,7) → LineTo 2 個 (+3,+0) (+0,+4)
    const raw = geom(cmd(1, 1), zig(5), zig(7), cmd(2, 2), zig(3), zig(0), zig(0), zig(4));
    const buf = encodeTile([
      { name: "roads", features: [{ props: { kind: "minor_road" }, type: 2, geometryRaw: raw }] },
    ]);
    expect(decodeTile(buf)[0]?.features[0]?.geometry).toEqual([
      [
        [5, 7],
        [8, 7],
        [8, 11],
      ],
    ]);
  });

  it("負の差分も読む（zigzag）", () => {
    const raw = geom(cmd(1, 1), zig(10), zig(10), cmd(2, 1), zig(-4), zig(-6));
    const buf = encodeTile([
      { name: "roads", features: [{ props: { kind: "x" }, type: 2, geometryRaw: raw }] },
    ]);
    expect(decodeTile(buf)[0]?.features[0]?.geometry).toEqual([
      [
        [10, 10],
        [6, 4],
      ],
    ]);
  });

  it("**MoveTo が来るたびに別の線になる**（1 地物に線が何本も入る）", () => {
    const raw = geom(cmd(1, 1), zig(0), zig(0), cmd(2, 1), zig(1), zig(0), cmd(1, 1), zig(5), zig(5));
    const buf = encodeTile([
      { name: "roads", features: [{ props: { kind: "x" }, type: 2, geometryRaw: raw }] },
    ]);
    expect(decodeTile(buf)[0]?.features[0]?.geometry).toEqual([
      [
        [0, 0],
        [1, 0],
      ],
      [[6, 5]],
    ]);
  });

  it("**読めないコマンドが来たら、そこで止めて読めたぶんを返す**（投げない）", () => {
    // 0x0c は「コマンド 4」で存在しない。既存のテストがこの埋め方をしている
    const raw = Buffer.from([cmd(1, 1), zig(2), zig(3), 0x0c, 0x0c]);
    const buf = encodeTile([
      { name: "roads", features: [{ props: { kind: "x" }, type: 2, geometryRaw: raw }] },
    ]);
    expect(decodeTile(buf)[0]?.features[0]?.geometry).toEqual([[[2, 3]]]);
    expect(decodeTile(buf)[0]?.unreadable).toBe(0);
  });

  it("幾何が無ければ空（**無いことと読めないことを混ぜない**）", () => {
    const buf = encodeTile([{ name: "roads", features: [{ props: { kind: "x" }, type: 2 }] }]);
    expect(decodeTile(buf)[0]?.features[0]?.geometry).toEqual([]);
  });
});
