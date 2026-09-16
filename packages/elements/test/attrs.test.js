import { describe, expect, it } from "vitest";

import { applyTilesUrl, buildMapOptions, parseLngLat, parseZoom } from "../src/attrs.js";

describe("parseLngLat", () => {
  it("経度,緯度 の順で読む（GeoJSON と同じ並び）", () => {
    expect(parseLngLat("135.5023,34.6937")).toEqual([135.5023, 34.6937]);
  });

  it("空白は許す", () => {
    expect(parseLngLat(" 135.5 , 34.7 ")).toEqual([135.5, 34.7]);
  });

  it("読めなければ null（**勝手に 0,0 へ置かない**。海の真ん中に置かれても気づけない）", () => {
    expect(parseLngLat("")).toBeNull();
    expect(parseLngLat("135.5")).toBeNull();
    expect(parseLngLat("東京,大阪")).toBeNull();
    expect(parseLngLat(null)).toBeNull();
  });

  it("地球の外は受けない", () => {
    expect(parseLngLat("200,34")).toBeNull();
    expect(parseLngLat("135,91")).toBeNull();
  });
});

describe("parseZoom", () => {
  it("数として読む", () => {
    expect(parseZoom("12", 5)).toBe(12);
    expect(parseZoom("12.5", 5)).toBe(12.5);
  });

  it("読めなければ既定値", () => {
    expect(parseZoom(null, 5)).toBe(5);
    expect(parseZoom("ちかく", 5)).toBe(5);
  });

  it("MapLibre の範囲へ収める", () => {
    expect(parseZoom("-3", 5)).toBe(0);
    expect(parseZoom("40", 5)).toBe(24);
  });
});

describe("applyTilesUrl", () => {
  it("__TILES_URL__ を差し替える。**色は組み立てない**（手書き JSON が正本・D-002）", () => {
    const style = '{"sources":{"basemap":{"url":"pmtiles://__TILES_URL__"}}}';
    const result = applyTilesUrl(style, "https://t.example.com/japan.pmtiles");
    expect(result.text).toContain("pmtiles://https://t.example.com/japan.pmtiles");
    expect(result.replaced).toBe(1);
  });

  it("差し替え先が無いことを黙って通さない（配信先を指していない地図は白くなる）", () => {
    expect(applyTilesUrl('{"layers":[]}', "https://t.example.com/a.pmtiles").replaced).toBe(0);
  });

  it("複数箇所あっても全部差し替える", () => {
    expect(applyTilesUrl("__TILES_URL__ __TILES_URL__", "x").replaced).toBe(2);
  });
});

describe("buildMapOptions", () => {
  const base = { container: "c", style: { version: 8 }, center: /** @type {[number, number]} */ ([135.5, 34.7]), zoom: 12, hash: false };

  it("帰属表示を消せない形で渡す（LICENSES.md）", () => {
    expect(buildMapOptions(base).attributionControl).toEqual({ compact: false });
  });

  it("漢字かなは閲覧側のフォントで描く（グリフに CJK が無いため）", () => {
    expect(buildMapOptions(base).localIdeographFontFamily).toContain("Noto Sans JP");
  });

  it("渡した中心と zoom をそのまま使う", () => {
    const options = buildMapOptions({ ...base, zoom: 9 });
    expect(options.center).toEqual([135.5, 34.7]);
    expect(options.zoom).toBe(9);
  });

  it("hash は指定どおり", () => {
    expect(buildMapOptions({ ...base, hash: true }).hash).toBe(true);
  });
});
