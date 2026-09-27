import { describe, expect, it } from "vitest";

import {
  EDGE_ALPHA,
  planTiles,
  SAMPLE_ALPHA,
  SAMPLE_BANDS,
  sampleReport,
  tileAt,
  TILE_SIZE,
} from "../src/plan.js";

/**
 * **実在のハザードや雨雲を置けないので、見本を自前で作る。**
 *
 * OSM の公式タイルは商用と大量アクセスを認めておらず、国土地理院のものは
 * 測量成果の利用にあたるかの判断が要る（`PRD.md` §2）。そして
 * **実在のデータに見えるものを作り置くと、いつか誰かがそれを本物として使う**。
 *
 * だから**見るからに人工的な格子**にする。
 */

describe("tileAt", () => {
  /**
   * **既知の値で検算する。**実装と同じ式で確かめると、
   * **式が間違っていても一致してしまう**。ここは外から検証できる値を使う。
   */
  it("z0 では世界が 1 枚（どこを指しても 0,0）", () => {
    expect(tileAt(135.5, 34.7, 0)).toEqual({ x: 0, y: 0 });
    expect(tileAt(-73.9, 40.7, 0)).toEqual({ x: 0, y: 0 });
  });

  it("z1 は 4 分割。**本初子午線と赤道で分かれる**", () => {
    expect(tileAt(-1, 1, 1), "北西").toEqual({ x: 0, y: 0 });
    expect(tileAt(1, 1, 1), "北東").toEqual({ x: 1, y: 0 });
    expect(tileAt(-1, -1, 1), "南西").toEqual({ x: 0, y: 1 });
    expect(tileAt(1, -1, 1), "南東").toEqual({ x: 1, y: 1 });
  });

  it("大阪 z12 は、切り出し済みタイルと同じ座標を指す", () => {
    // `pnpm tile:inspect -- dist/tiles/demo.pmtiles 12 3589 1626` で実在を確認済み
    expect(tileAt(135.5023, 34.6937, 12)).toEqual({ x: 3589, y: 1626 });
  });

  it("**切り捨てる。**四捨五入すると、境目が隣のタイルを指す", () => {
    // z1 の境目ちょうど（経度 0）は、東側（x=1）のタイルに属する
    expect(tileAt(0, 0, 1).x).toBe(1);
  });

  it("読めない倍率は落とす", () => {
    expect(() => tileAt(135, 34, -1)).toThrow(/倍率/);
    expect(() => tileAt(135, 34, 1.5)).toThrow(/倍率/);
  });
});

describe("planTiles", () => {
  const osaka = [135.5023, 34.6937] as const;

  it("radius 1 なら 3×3", () => {
    expect(planTiles(osaka, 12, 1)).toHaveLength(9);
  });

  it("radius 0 なら 1 枚だけ", () => {
    const tiles = planTiles(osaka, 12, 0);
    expect(tiles).toHaveLength(1);
    expect(tiles.at(0)).toMatchObject({ z: 12, x: 3589, y: 1626 });
  });

  it("**中心から離れるほど段階が下がる**（意味は無い。段階があることだけ示す）", () => {
    const tiles = planTiles(osaka, 12, 2);
    const center = tiles.find((tile) => tile.x === 3589 && tile.y === 1626);
    const far = tiles.find((tile) => tile.x === 3591 && tile.y === 1626);
    expect(center?.rgb).toEqual(SAMPLE_BANDS[0]);
    expect(far?.rgb).toEqual(SAMPLE_BANDS[2]);
  });

  it("**段階の数を越えても落ちない**（いちばん端の色で留まる）", () => {
    const tiles = planTiles(osaka, 12, 6);
    expect(tiles.every((tile) => SAMPLE_BANDS.some((band) => band === tile.rgb))).toBe(true);
  });

  it("重なりを出さない（**同じタイルを 2 回書かない**）", () => {
    const tiles = planTiles(osaka, 12, 2);
    const keys = new Set(tiles.map((tile) => `${tile.z}/${tile.x}/${tile.y}`));
    expect(keys.size).toBe(tiles.length);
  });

  it("読めない広さは落とす", () => {
    expect(() => planTiles(osaka, 12, -1)).toThrow(/広さ/);
    expect(() => planTiles(osaka, 12, 1.5)).toThrow(/広さ/);
  });
});

describe("見本であることを見せる値", () => {
  it("**下の地図が読める濃さ**（不透明にしない）", () => {
    expect(SAMPLE_ALPHA).toBeLessThan(255 / 2);
  });

  it("縁は濃い（**格子だと分かる形にする**）", () => {
    expect(EDGE_ALPHA).toBeGreaterThan(SAMPLE_ALPHA);
  });

  it("タイルは 256 画素（MapLibre の既定）", () => {
    expect(TILE_SIZE).toBe(256);
  });
});

describe("sampleReport", () => {
  it("**「見本」と言い切る。**枚数だけ出すと本物だと思われる", () => {
    const report = sampleReport(25, 21_000);
    expect(report).toContain("25 枚");
    expect(report).toContain("見本");
    expect(report).toContain("実在の");
  });
});
