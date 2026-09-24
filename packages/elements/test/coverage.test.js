import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  MISSING_COLORS,
  buildMissingLayers,
  coverageNotice,
  isMissingTile,
  missingTilesFeature,
  readArchive,
  readTileKey,
  shouldNotice,
  tileBounds,
} from "../src/coverage.js";

/**
 * **タイルに入っていない範囲を、入っていないと見せる。**
 *
 * 1 つの `.pmtiles` は地球の一部しか持たない（デモは大阪だけの 62.8 MB）。
 * それまでの実装では、その外へ動かすと `background` の色だけが残った。
 * **「読み込み中」とも「壊れた」とも区別がつかない。**
 *
 * **ヘッダの範囲は使わない。**`demo.pmtiles` のヘッダは「日本全体」と名乗るが、
 * 実際は **z0–9 が全国・z10–15 が大阪**という二段構えで、四角 1 つでは表せない
 * （2026-09-24 実測。`pmtiles show` の bounds は 122.93,20.42–153.99,45.56）。
 * **宣言された範囲を信じると、入っていない場所を「入っている」と描いてしまう。**
 *
 * 代わりに**実際に取りに行った結果**を見る。pmtiles のプロトコルは、
 * **無いタイルは長さ 0 のバッファで返る**（2026-09-24 に実測。`null` だけを見ていて
 * 1 件も拾えなかった。`isMissingTile` の docblock に実測値がある）。
 * **返ってこなかったタイルの四角を塗る。**これなら、
 *
 *   - ズームで範囲が変わる書庫でも正しい
 *   - 利用者が自分で切り出した書庫でも、宣言なしで効く
 *   - **嘘をつけない**（描いているのは「取りに行って空だった場所」そのもの）
 */

const THEME = {
  background: "#1B1F24",
  surface: "#14161A",
  text: "#D8DCE1",
  muted: "#AAB2BC",
  border: "#2E343B",
};

describe("tileBounds", () => {
  it("z0 の 1 枚は世界を覆う", () => {
    const [w, s, e, n] = tileBounds(0, 0, 0);
    expect(w).toBeCloseTo(-180);
    expect(e).toBeCloseTo(180);
    expect(n).toBeCloseTo(85.0511, 3);
    expect(s).toBeCloseTo(-85.0511, 3);
  });

  it("大阪の z14 タイルが、大阪の座標を含む", () => {
    // 135.5023,34.6937 -> 14/14358/6506（手元で計算した値）
    const [w, s, e, n] = tileBounds(14, 14358, 6506);
    expect(w).toBeLessThan(135.5023);
    expect(e).toBeGreaterThan(135.5023);
    expect(s).toBeLessThan(34.6937);
    expect(n).toBeGreaterThan(34.6937);
  });

  it("**北が南より大きい。**上下を取り違えると、塗る四角が裏返る", () => {
    const [, s, , n] = tileBounds(10, 813, 450);
    expect(n).toBeGreaterThan(s);
  });

  it("隣り合うタイルは辺を共有する（隙間も重なりも作らない）", () => {
    const left = tileBounds(12, 100, 50);
    const right = tileBounds(12, 101, 50);
    expect(left[2]).toBeCloseTo(right[0], 10);
  });
});

describe("readTileKey", () => {
  it("pmtiles のタイル URL から z/x/y を読む", () => {
    const url = "pmtiles://https://example.test/demo.pmtiles/14/14358/6506";
    expect(readTileKey(url)).toEqual({ z: 14, x: 14358, y: 6506 });
  });

  it("書庫の URL に数字が入っていても取り違えない（**末尾の 3 つを取る**）", () => {
    const url = "pmtiles://https://example.test/2026/09/24/demo.pmtiles/3/1/2";
    expect(readTileKey(url)).toEqual({ z: 3, x: 1, y: 2 });
  });

  it("形が違えば null（**推測で座標を作らない**）", () => {
    for (const bad of ["", "https://example.test/x.png", "pmtiles://a/b/c/d", null, undefined]) {
      expect(readTileKey(bad), String(bad)).toBeNull();
    }
  });
});

describe("isMissingTile", () => {
  it("**長さ 0 のバッファは『無い』。**実測ではこれが返ってくる", () => {
    expect(isMissingTile(new Uint8Array(0))).toBe(true);
  });

  it("null / undefined も『無い』", () => {
    expect(isMissingTile(null)).toBe(true);
    expect(isMissingTile(undefined)).toBe(true);
  });

  it("中身があれば『ある』", () => {
    expect(isMissingTile(new Uint8Array([1, 2, 3]))).toBe(false);
  });

  it("長さを持たないものは『ある』扱い（**判断できないものを欠けと言わない**）", () => {
    expect(isMissingTile({})).toBe(false);
  });
});

describe("readArchive", () => {
  it("どの書庫のタイルかを返す（**1 ページに書庫違いが並ぶ**ので、記録を分ける）", () => {
    expect(readArchive("pmtiles://https://example.test/demo.pmtiles/14/1/2")).toBe(
      "https://example.test/demo.pmtiles",
    );
  });

  it("書庫の URL に数字が入っていても切る位置を誤らない", () => {
    expect(readArchive("pmtiles://https://example.test/2026/09/24/a.pmtiles/3/1/2")).toBe(
      "https://example.test/2026/09/24/a.pmtiles",
    );
  });

  it("pmtiles の URL でなければ null", () => {
    for (const bad of ["https://example.test/a.pmtiles/1/2/3", "pmtiles://a", null]) {
      expect(readArchive(bad), String(bad)).toBeNull();
    }
  });
});

describe("missingTilesFeature", () => {
  it("欠けたタイル 1 枚につき四角 1 つ", () => {
    const fc = missingTilesFeature(["14/14358/6506", "14/14359/6506"]);
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0].geometry.type).toBe("Polygon");
  });

  it("同じタイルを 2 度渡しても 1 つ（**重ねて塗ると濃くなる**）", () => {
    const fc = missingTilesFeature(["3/1/2", "3/1/2"]);
    expect(fc.features).toHaveLength(1);
  });

  it("輪は閉じている", () => {
    const ring = missingTilesFeature(["3/1/2"]).features[0].geometry.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(ring).toHaveLength(5);
  });

  it("読めない鍵は黙って捨てる（**1 つの壊れた値で全部を失わない**）", () => {
    const fc = missingTilesFeature(["3/1/2", "こわれた", "", "9/9"]);
    expect(fc.features).toHaveLength(1);
  });

  it("空なら空の FeatureCollection（**null を返さない**。source を作り直さずに済む）", () => {
    expect(missingTilesFeature([]).features).toEqual([]);
  });
});

describe("buildMissingLayers", () => {
  const built = buildMissingLayers(THEME);

  it("塗る面を 1 枚作る", () => {
    expect(built.layers).toHaveLength(1);
    expect(built.layers[0].type).toBe("fill");
  });

  it("**色はスタイルから借りる。**部品が独自の色を持たない", () => {
    expect(JSON.stringify(built.layers[0].paint)).toContain(THEME.surface);
  });

  it("スタイルから読めなくても描く（**縁が見えないほうが悪い**）", () => {
    expect(JSON.stringify(buildMissingLayers({}).layers[0].paint)).toContain(MISSING_COLORS.surface);
  });

  it("id が `mmj-` で始まる（手書きスタイルの層と混ざらない）", () => {
    expect(built.sourceId.startsWith("mmj-")).toBe(true);
    expect(built.layers[0].id.startsWith("mmj-")).toBe(true);
  });

  it("面は自分の source を指す", () => {
    expect(built.layers[0].source).toBe(built.sourceId);
  });
});

describe("MISSING_COLORS", () => {
  // **新しい色を作っていないことを、機械で縛る**（baseline §11・`POPUP_COLORS` と同じ）。
  const style = readFileSync(new URL("../../../styles/modern-dark.json", import.meta.url), "utf8");

  for (const [name, value] of Object.entries(MISSING_COLORS)) {
    it(`${name} (${value}) は styles/modern-dark.json にある色`, () => {
      expect(style.toUpperCase()).toContain(value.toUpperCase());
    });
  }
});

describe("shouldNotice", () => {
  it("**何も描けておらず、取りに行って空だった**ときだけ出す", () => {
    expect(shouldNotice({ rendered: 0, missing: 4 })).toBe(true);
  });

  it("描けているなら出さない（端が欠けているだけ）", () => {
    expect(shouldNotice({ rendered: 1200, missing: 4 })).toBe(false);
  });

  it("**まだ 1 枚も取りに行っていないなら出さない。**読み込み中に警告を出さない", () => {
    expect(shouldNotice({ rendered: 0, missing: 0 })).toBe(false);
  });
});

describe("coverageNotice", () => {
  it("**「壊れた」ではなく「入れていない」と書く**", () => {
    const text = coverageNotice();
    expect(text).toContain("このタイル");
    expect(text).not.toContain("エラー");
  });
});
