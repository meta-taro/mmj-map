import { describe, expect, it } from "vitest";

import { POI_DEFAULTS, buildPoiSpec } from "../src/poi.js";

describe("buildPoiSpec", () => {
  const spec = buildPoiSpec({ id: "mmj-poi-1", src: "/data/our-poi.geojson" });

  it("source は GeoJSON で、**まとめない**（それは mmj-cluster の仕事）", () => {
    expect(spec.sourceId).toBe("mmj-poi-1");
    expect(spec.source.type).toBe("geojson");
    expect(spec.source.data).toBe("/data/our-poi.geojson");
    expect(spec.source.cluster).toBeUndefined();
  });

  it("レイヤは 2 枚。点と、その名前", () => {
    expect(spec.layers.map((layer) => layer.id)).toEqual(["mmj-poi-1-dot", "mmj-poi-1-label"]);
    for (const layer of spec.layers) expect(layer.source).toBe("mmj-poi-1");
  });

  it("名前は既定で name 属性から取る", () => {
    expect(spec.layers[1].layout["text-field"]).toEqual(["get", "name"]);
  });

  it("**どの属性を名前にするかは媒体が決める**（title でも shop_name でもよい）", () => {
    const custom = buildPoiSpec({ id: "p", src: "/p.geojson", labelKey: "shop_name" });
    expect(custom.layers[1].layout["text-field"]).toEqual(["get", "shop_name"]);
  });

  it("フォントはスタイルと同じものだけを使う（**増やすとグリフが 404 になる**）", () => {
    expect(spec.layers[1].layout["text-font"]).toEqual([POI_DEFAULTS.font]);
  });

  it("出しはじめの倍率は指定できる。**件数を知っているのは媒体だけ**", () => {
    expect(spec.layers[0].minzoom).toBe(POI_DEFAULTS.minZoom);
    const custom = buildPoiSpec({ id: "p", src: "/p.geojson", minZoom: 15 });
    for (const layer of custom.layers) expect(layer.minzoom).toBe(15);
  });

  it("色は属性で差し替えられる（既定は承認された色ではない）", () => {
    expect(spec.layers[0].paint["circle-color"]).toBe(POI_DEFAULTS.color);
    const custom = buildPoiSpec({
      id: "p",
      src: "/p.geojson",
      color: "#8fd3a6",
      textColor: "#c9d0d8",
    });
    expect(custom.layers[0].paint["circle-color"]).toBe("#8fd3a6");
    expect(custom.layers[1].paint["text-color"]).toBe("#c9d0d8");
  });

  it("名前には縁取りを付ける（**地図の上の字は、縁が無いと読めない**）", () => {
    expect(spec.layers[1].paint["text-halo-width"]).toBeGreaterThan(0);
  });

  it("名前が衝突したら消す。**重ねて出さない**（読めない字を出しても意味がない）", () => {
    expect(spec.layers[1].layout["text-allow-overlap"]).toBe(false);
  });

  it("src が無ければ作らない（**空の source を足すと地図が黙って壊れる**）", () => {
    expect(() => buildPoiSpec({ id: "p", src: "" })).toThrow(/src/);
  });

  it("id が無ければ作らない（source 名が衝突すると後勝ちで消える）", () => {
    expect(() => buildPoiSpec({ id: "", src: "/p.geojson" })).toThrow(/id/);
  });
});
