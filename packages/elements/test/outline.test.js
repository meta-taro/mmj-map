import { describe, expect, it } from "vitest";

import { decodeTile } from "../src/mvt.js";
import {
  clipToTile,
  extractOutline,
  OUTLINE_ATTRIBUTION,
  OUTLINE_LIMITS,
  svgHeight,
  tilesFor,
  toSvgPath,
} from "../src/outline.js";

/*
 * 試験用に MVT を組む。**本物の書庫（数 GB）は CI に無い**ので、形の分かった小さなタイルを作る。
 * 本物の日本全体（z4・z5）と九州（z6・z7）は、SVG に描いて画面で拡大して確かめた（2026-11-19）。
 */

/** @param {number} n */
function varint(n) {
  const out = [];
  let v = n;
  while (v > 0x7f) {
    out.push((v & 0x7f) | 0x80);
    v = Math.floor(v / 128);
  }
  out.push(v);
  return out;
}
const zz = (/** @type {number} */ n) => (n << 1) ^ (n >> 31);
const key = (/** @type {number} */ tag, /** @type {number} */ wire) => varint((tag << 3) | wire);
const lenField = (/** @type {number} */ tag, /** @type {number[]} */ body) => [...key(tag, 2), ...varint(body.length), ...body];
const str = (/** @type {string} */ s) => [...new TextEncoder().encode(s)];

/** 幾何を MVT のコマンドに直す @param {number[][][]} parts @param {boolean} rings */
function geometry(parts, rings) {
  const out = [];
  let x = 0;
  let y = 0;
  for (const part of parts) {
    const [[fx, fy], ...rest] = /** @type {[[number, number], ...[number, number][]]} */ (part);
    out.push(...varint((1 << 3) | 1), ...varint(zz(fx - x)), ...varint(zz(fy - y)));
    [x, y] = [fx, fy];
    out.push(...varint((rest.length << 3) | 2));
    for (const [px, py] of rest) {
      out.push(...varint(zz(px - x)), ...varint(zz(py - y)));
      [x, y] = [px, py];
    }
    if (rings) out.push(...varint((1 << 3) | 7));
  }
  return out;
}

/**
 * @param {string} name
 * @param {{ type: number, kind: string, parts: number[][][] }[]} features
 */
function layer(name, features) {
  const kinds = [...new Set(features.map((f) => f.kind))];
  const body = [...lenField(1, str(name)), ...key(5, 0), ...varint(4096)];
  for (const f of features) {
    const tags = [0, kinds.indexOf(f.kind)];
    const feature = [
      ...lenField(2, tags.flatMap(varint)),
      ...key(3, 0),
      ...varint(f.type),
      ...lenField(4, geometry(f.parts, f.type === 3)),
    ];
    body.push(...lenField(2, feature));
  }
  body.push(...lenField(3, str("kind")));
  for (const k of kinds) body.push(...lenField(4, lenField(1, str(k))));
  return lenField(3, body);
}

/** のりしろ 64 を付けた陸（タイルの左半分）と、県境 1 本、国境 1 本、市区町村境 1 本 */
function tile() {
  return new Uint8Array([
    ...layer("water", [{ type: 3, kind: "ocean", parts: [[[0, 0], [4096, 0], [4096, 4096], [0, 4096]]] }]),
    ...layer("earth", [
      {
        type: 3,
        kind: "earth",
        // 外周（y 下向きで時計回り）: のりしろの外から、海岸 x=2000 まで
        parts: [[[-64, -64], [2000, -64], [2000, 4160], [-64, 4160]]],
      },
    ]),
    ...layer("boundaries", [
      { type: 2, kind: "region", parts: [[[-64, 1000], [1000, 1000], [1000, 4160]]] },
      { type: 2, kind: "country", parts: [[[3000, -64], [3000, 4160]]] },
      { type: 2, kind: "county", parts: [[[500, 500], [600, 600]]] },
    ]),
  ]);
}

describe("decodeTile", () => {
  it("reads only the layers asked for", () => {
    const layers = decodeTile(tile(), ["earth", "boundaries"]);
    expect(layers.map((l) => l.name)).toEqual(["earth", "boundaries"]);
    expect(layers[1]?.features.map((f) => f.properties.kind)).toEqual(["region", "country", "county"]);
  });

  it("reads geometry in tile units, including the margin outside the tile", () => {
    const earth = decodeTile(tile(), ["earth"])[0];
    expect(earth?.extent).toBe(4096);
    expect(earth?.features[0]?.geometry[0]).toEqual([[-64, -64], [2000, -64], [2000, 4160], [-64, 4160]]);
  });

  it("returns nothing for an empty tile, and refuses one still gzipped", () => {
    expect(decodeTile(new Uint8Array())).toEqual([]);
    expect(() => decodeTile(new Uint8Array([0x1f, 0x8b, 8]))).toThrow(/gzip/);
  });
});

describe("clipToTile", () => {
  it("drops the parts that run along the tile edge (they are tile seams, not coast)", () => {
    const ring = [[-64, -64], [2000, -64], [2000, 4160], [-64, 4160]];
    expect(clipToTile(ring, 4096, true)).toEqual([[[2000, 0], [2000, 4096]]]);
  });

  it("drops a ring's sides that lie exactly on the tile edge (a shape cut at the edge, with no margin)", () => {
    const ring = [[0, 0], [2000, 0], [2000, 4096], [0, 4096]];
    expect(clipToTile(ring, 4096, true)).toEqual([[[2000, 0], [2000, 4096]]]);
  });

  it("keeps a line that stays inside as one piece", () => {
    expect(clipToTile([[10, 10], [20, 20], [30, 10]], 4096, false)).toEqual([[[10, 10], [20, 20], [30, 10]]]);
  });

  it("splits a line that leaves the tile and comes back", () => {
    const pieces = clipToTile([[100, 100], [100, -200], [200, -200], [200, 100]], 4096, false);
    expect(pieces).toEqual([
      [[100, 100], [100, 0]],
      [[200, 0], [200, 100]],
    ]);
  });
});

describe("tilesFor", () => {
  it("covers the area with the tiles at that zoom", () => {
    expect(tilesFor([128, 30, 146, 46], 5)).toHaveLength(6);
  });

  it("does not add the next tile when the east edge falls exactly on a tile edge", () => {
    // z1 の境目は経度 0。西半球だけなら 1 列
    expect(tilesFor([-170, 10, 0, 20], 1).map((t) => t.x)).toEqual([0]);
  });
});

/** タイル 1 枚だけを持つ書庫 */
const oneTileSource = (/** @type {number} */ z, /** @type {number} */ x, /** @type {number} */ y) => ({
  getZxy: async (/** @type {number} */ tz, /** @type {number} */ tx, /** @type {number} */ ty) =>
    tz === z && tx === x && ty === y ? { data: tile().buffer } : undefined,
});

describe("extractOutline", () => {
  /** @type {[number, number, number, number]} */
  const small = [139.3, 35.1, 139.4, 35.2];
  const only = /** @type {{ z: number, x: number, y: number }} */ (tilesFor(small, 8)[0]);

  it("returns land, coastline and the default boundaries, with the attribution", async () => {
    const result = await extractOutline({ source: oneTileSource(8, only.x, only.y), bbox: small, zoom: 8 });
    expect(result.attribution).toBe(OUTLINE_ATTRIBUTION);
    expect(result.features.map((f) => f.properties.kind).sort()).toEqual(["coastline", "country", "land", "region"]);
  });

  it("puts the coast where the tile says, in longitude", async () => {
    const result = await extractOutline({ source: oneTileSource(8, only.x, only.y), bbox: small, zoom: 8 });
    const coast = result.features.find((f) => f.properties.kind === "coastline");
    const [[lng]] = coast.geometry.coordinates[0];
    // 海岸は x=2000/4096 の所
    expect(lng).toBeCloseTo(((only.x + 2000 / 4096) / 256) * 360 - 180, 9);
  });

  it("adds county lines only when asked", async () => {
    const result = await extractOutline({ source: oneTileSource(8, only.x, only.y), bbox: small, zoom: 8, boundaries: ["county"] });
    expect(result.features.map((f) => f.properties.kind).sort()).toEqual(["coastline", "county", "land"]);
  });

  it("counts the tiles the archive does not have, instead of hiding it", async () => {
    const result = await extractOutline({ source: { getZxy: async () => undefined }, bbox: [139, 35, 141, 37], zoom: 8 });
    expect(result.tiles).toBeGreaterThan(1);
    expect(result.missing).toBe(result.tiles);
    expect(result.features).toEqual([]);
  });

  it("refuses an area that needs too many tiles (zoom out instead of freezing the page)", async () => {
    await expect(extractOutline({ source: oneTileSource(0, 0, 0), bbox: [128, 30, 146, 46], zoom: 9 })).rejects.toThrow(
      new RegExp(`上限 ${OUTLINE_LIMITS.maxTiles}`),
    );
  });

  it("refuses inputs it cannot read", async () => {
    const source = oneTileSource(0, 0, 0);
    await expect(extractOutline({ source, bbox: /** @type {any} */ ([146, 30, 128, 46]), zoom: 5 })).rejects.toThrow(/範囲/);
    await expect(extractOutline({ source, bbox: [128, 30, 146, 46], zoom: 4.5 })).rejects.toThrow(/ズーム/);
    await expect(extractOutline({ source: /** @type {any} */ ({}), bbox: [128, 30, 146, 46], zoom: 5 })).rejects.toThrow(/getZxy/);
  });
});

/** `M x y L …` の最初の y @param {string} d */
const yOf = (d) => Number(d.slice(1).split("L")[0]?.split(" ")[1]);

describe("toSvgPath", () => {
  /** @type {[number, number, number, number]} */
  const bbox = [130, 30, 140, 40];
  const line = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[130, 40], [140, 30]] } };

  it("maps the north-west corner to (0, 0) and the south-east corner to (width, height)", () => {
    expect(toSvgPath([line], { bbox, width: 100, height: 120 })).toBe("M0 0L100 120");
    expect(toSvgPath([line], { bbox, width: 100, height: 120, projection: "equirectangular" })).toBe("M0 0L100 120");
  });

  it("places the middle latitude lower on Mercator than on a plain grid", () => {
    const mid = { ...line, geometry: { type: "LineString", coordinates: [[130, 35], [140, 35]] } };
    expect(yOf(toSvgPath([mid], { bbox, width: 100, height: 100, projection: "equirectangular" }))).toBe(50);
    expect(yOf(toSvgPath([mid], { bbox, width: 100, height: 100 }))).toBeGreaterThan(50);
  });

  it("closes rings, and drops points that round to the same place", () => {
    const shape = {
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [[[130, 40], [130.0001, 40], [140, 40], [140, 30], [130, 40]]] },
    };
    expect(toSvgPath({ features: [shape] }, { bbox, width: 10, height: 10, projection: "equirectangular" })).toBe(
      "M0 0L10 0 10 10 0 0Z",
    );
  });
});

describe("svgHeight", () => {
  it("keeps the true shape: a plain grid is as tall as the degrees, Mercator is taller", () => {
    expect(svgHeight([130, 30, 140, 40], 100, "equirectangular")).toBe(100);
    expect(svgHeight([130, 30, 140, 40], 100)).toBeGreaterThan(100);
  });
});
