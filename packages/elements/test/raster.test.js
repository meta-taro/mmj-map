import { describe, expect, it } from "vitest";

import { buildRasterSpec, firstSymbolLayerId, isTileTemplate, RASTER_DEFAULTS, buildFrameSpecs, frameSrc, parseFrames } from "../src/raster.js";

/**
 * **1 つで広く効く部品。**雨雲レーダー・ハザードマップ・地盤・震度・空中写真は、
 * どれもラスタタイルで配られている。面を塗る部品より先にこれが要る。
 *
 * **データは MMJ が持たない。**導入者が出どころを指し、出典を名乗る（`<mmj-poi>` と同じ線）。
 */

describe("isTileTemplate", () => {
  it("{z}/{x}/{y} が揃っていれば通す", () => {
    expect(isTileTemplate("https://example.com/{z}/{x}/{y}.png")).toBe(true);
    expect(isTileTemplate("./tiles/{z}/{x}/{y}.png")).toBe(true);
  });

  /**
   * **揃っていないと MapLibre は同じ 1 枚を延々と貼り続ける。**
   * 地図は出るので、**見ても間違いだと分からない**——だから弾く。
   */
  it("**1 つでも欠けたら通さない**", () => {
    expect(isTileTemplate("https://example.com/{z}/{x}.png"), "y が無い").toBe(false);
    expect(isTileTemplate("https://example.com/tile.png"), "全部無い").toBe(false);
  });

  it("**`javascript:` と `data:` は通さない**（画像と同じ理由）", () => {
    expect(isTileTemplate("javascript:alert(1)//{z}{x}{y}")).toBe(false);
    expect(isTileTemplate("data:image/png;base64,AA{z}{x}{y}")).toBe(false);
  });

  it("空は通さない", () => {
    expect(isTileTemplate("")).toBe(false);
    expect(isTileTemplate("   ")).toBe(false);
  });
});

describe("firstSymbolLayerId", () => {
  const style = {
    layers: [
      { id: "earth", type: "background" },
      { id: "roads", type: "line" },
      { id: "label-place-city", type: "symbol" },
      { id: "label-water", type: "symbol" },
    ],
  };

  /**
   * **重ねたものをラベルの下へ入れるために要る。**
   * 上へ置くと、地名も駅名も読めなくなる。
   */
  it("いちばん手前のラベルを返す", () => {
    expect(firstSymbolLayerId(style)).toBe("label-place-city");
  });

  it("ラベルが無ければ null（**いちばん上へ置く**しかない）", () => {
    expect(firstSymbolLayerId({ layers: [{ id: "a", type: "line" }] })).toBeNull();
  });

  it("読めない形でも落ちない", () => {
    expect(firstSymbolLayerId(null)).toBeNull();
    expect(firstSymbolLayerId({})).toBeNull();
  });
});

describe("buildRasterSpec", () => {
  const base = { id: "hazard", src: "https://example.com/{z}/{x}/{y}.png" };

  it("source と layer を組む", () => {
    const spec = buildRasterSpec(base);
    expect(spec.sourceId).toBe("hazard");
    expect(spec.source.type).toBe("raster");
    expect(spec.source.tiles).toEqual(["https://example.com/{z}/{x}/{y}.png"]);
    expect(spec.layer.type).toBe("raster");
    expect(spec.layer.source).toBe("hazard");
  });

  /**
   * **不透明のまま重ねない。**下の地図が見えないと、
   * **その色がどこの話なのか**が読めない。現在地と道が透けて初めて使える。
   */
  it("既定は透ける（**下の地図が見えないと、どこの話か読めない**）", () => {
    expect(buildRasterSpec(base).layer.paint["raster-opacity"]).toBe(RASTER_DEFAULTS.opacity);
    expect(RASTER_DEFAULTS.opacity).toBeLessThan(1);
  });

  it("濃さを渡せる。**範囲外は 0〜1 に収める**", () => {
    expect(buildRasterSpec({ ...base, opacity: 0.3 }).layer.paint["raster-opacity"]).toBe(0.3);
    expect(buildRasterSpec({ ...base, opacity: 5 }).layer.paint["raster-opacity"]).toBe(1);
    expect(buildRasterSpec({ ...base, opacity: -1 }).layer.paint["raster-opacity"]).toBe(0);
  });

  it("**読めない URL は落とす。**黙って 1 枚を貼り続けない", () => {
    expect(() => buildRasterSpec({ ...base, src: "https://example.com/tile.png" })).toThrow(/\{z\}/);
  });

  it("id が無ければ落とす（**衝突すると後勝ちで消える**）", () => {
    expect(() => buildRasterSpec({ ...base, id: "" })).toThrow(/id/);
  });

  it("**出典は渡されたときだけ載せる**（空の出典欄で出どころを騙らない）", () => {
    expect(buildRasterSpec({ ...base, attribution: "出典：気象庁" }).source.attribution).toBe("出典：気象庁");
    expect(buildRasterSpec(base).source).not.toHaveProperty("attribution");
    expect(buildRasterSpec({ ...base, attribution: "  " }).source).not.toHaveProperty("attribution");
  });

  // **持っている段は source に書く。**layer に書くと、無い段のタイルを取りに行き続ける。
  // 実測（2026-10-07）: z8 だけ置いて layer に付けた頁で、z6/z7 への要求が 188 件 404 になった。
  // source に書けば、持っている段を拡大・縮小して見せてくれる。
  it("持っている倍率を source に書く（**渡されなければ書かない**）", () => {
    const spec = buildRasterSpec({ ...base, minZoom: 8, maxZoom: 14 });
    expect(spec.source.minzoom).toBe(8);
    expect(spec.source.maxzoom).toBe(14);
    expect(spec.layer).not.toHaveProperty("minzoom");
    expect(buildRasterSpec(base).source).not.toHaveProperty("minzoom");
  });
});

describe("時刻つきのラスタ（雨雲レーダー）", () => {
  describe("parseFrames", () => {
    it("読点区切りの見出しを並べて返す", () => {
      expect(parseFrames("09:00,10:00,11:00")).toEqual(["09:00", "10:00", "11:00"]);
    });

    it("前後の空白を落とし、空の項目は捨てる", () => {
      expect(parseFrames(" 09:00 , ,10:00 ")).toEqual(["09:00", "10:00"]);
    });

    it("無いときは空（時刻無しのふつうのラスタになる）", () => {
      expect(parseFrames(null)).toEqual([]);
      expect(parseFrames("")).toEqual([]);
    });
  });

  describe("frameSrc", () => {
    it("{t} を番号で差し替える", () => {
      expect(frameSrc("./rain/{t}/{z}/{x}/{y}.png", 3)).toBe("./rain/3/{z}/{x}/{y}.png");
    });

    it("{t} が無ければそのまま（時刻で変わらないものを、変わるふりにしない）", () => {
      expect(frameSrc("./rain/{z}/{x}/{y}.png", 3)).toBe("./rain/{z}/{x}/{y}.png");
    });
  });

  describe("buildFrameSpecs", () => {
    const input = { id: "rain", src: "./rain/{t}/{z}/{x}/{y}.png", frames: ["09:00", "10:00", "11:00"] };

    it("時刻の数だけ source と layer を作る", () => {
      const specs = buildFrameSpecs(input);
      expect(specs).toHaveLength(3);
      expect(specs[0]?.sourceId).toBe("rain-0");
      expect(specs[2]?.source.tiles).toEqual(["./rain/2/{z}/{x}/{y}.png"]);
    });

    // **全部先に置いて、見せ方だけ切り替える。**毎回 source を作り直すと、
    // 切り替えのたびに取りに行って白く抜ける
    it("最初の 1 枚だけが見えていて、残りは隠れている", () => {
      const specs = buildFrameSpecs(input);
      expect(specs[0]?.layer.layout.visibility).toBe("visible");
      expect(specs[1]?.layer.layout.visibility).toBe("none");
      expect(specs[2]?.layer.layout.visibility).toBe("none");
    });

    it("{t} を含まない src は断る（同じ絵を時刻ぶん並べることになる）", () => {
      expect(() => buildFrameSpecs({ ...input, src: "./rain/{z}/{x}/{y}.png" })).toThrow(/\{t\}/);
    });

    it("時刻が 1 つも無ければ断る", () => {
      expect(() => buildFrameSpecs({ ...input, frames: [] })).toThrow();
    });
  });
});
