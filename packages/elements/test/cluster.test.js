import { describe, expect, it } from "vitest";

import { DEFAULTS, buildClusterSpec, parseCount } from "../src/cluster.js";

describe("parseCount", () => {
  it("正の数として読む", () => {
    expect(parseCount("50", 1)).toBe(50);
    expect(parseCount(" 80 ", 1)).toBe(80);
  });

  it("読めなければ既定値（**0 や NaN を MapLibre へ渡さない**）", () => {
    expect(parseCount("", 50)).toBe(50);
    expect(parseCount("50px", 50)).toBe(50);
    expect(parseCount(null, 50)).toBe(50);
    expect(parseCount(undefined, 50)).toBe(50);
  });

  it("負の値は既定値へ戻す（半径が負のクラスタは作れない）", () => {
    expect(parseCount("-10", 50)).toBe(50);
  });

  it("0 は受ける（「まとめない」は意味のある指定）", () => {
    expect(parseCount("0", 50)).toBe(0);
  });
});

describe("buildClusterSpec", () => {
  const spec = buildClusterSpec({ id: "mmj-cluster-1", src: "/data/points.geojson" });

  it("source は GeoJSON で、クラスタリングを有効にする", () => {
    expect(spec.sourceId).toBe("mmj-cluster-1");
    expect(spec.source.type).toBe("geojson");
    expect(spec.source.data).toBe("/data/points.geojson");
    expect(spec.source.cluster).toBe(true);
  });

  it("レイヤは 3 枚。まとまり・件数・ばらの点", () => {
    expect(spec.layers.map((layer) => layer.id)).toEqual([
      "mmj-cluster-1-clusters",
      "mmj-cluster-1-count",
      "mmj-cluster-1-points",
    ]);
    for (const layer of spec.layers) expect(layer.source).toBe("mmj-cluster-1");
  });

  it("まとまりと、ばらの点は、排他の filter で描き分ける（**両方描くと二重に出る**）", () => {
    const [clusters, count, points] = spec.layers;
    expect(clusters.filter).toEqual(["has", "point_count"]);
    expect(count.filter).toEqual(["has", "point_count"]);
    expect(points.filter).toEqual(["!", ["has", "point_count"]]);
  });

  it("件数は point_count_abbreviated を出し、必ず表示する（数を隠さない）", () => {
    const count = spec.layers[1];
    expect(count.layout["text-field"]).toEqual(["get", "point_count_abbreviated"]);
    expect(count.layout["text-allow-overlap"]).toBe(true);
  });

  it("フォントはスタイルと同じものだけを使う（**別のフォントを足すとグリフが 404 になる**）", () => {
    expect(spec.layers[1].layout["text-font"]).toEqual([DEFAULTS.font]);
  });

  it("件数は色ではなく大きさで表す（**色は人が決める領域**・baseline §11）", () => {
    const clusters = spec.layers[0];
    expect(clusters.paint["circle-color"]).toBe(DEFAULTS.color);
    expect(clusters.paint["circle-radius"]).toEqual([
      "step",
      ["get", "point_count"],
      14,
      50,
      18,
      200,
      24,
    ]);
  });

  it("色は属性で差し替えられる（既定は承認された色ではない）", () => {
    const custom = buildClusterSpec({
      id: "c",
      src: "/p.geojson",
      color: "#7fb2ff",
      textColor: "#111418",
      pointColor: "#8fd3a6",
    });
    expect(custom.layers[0].paint["circle-color"]).toBe("#7fb2ff");
    expect(custom.layers[1].paint["text-color"]).toBe("#111418");
    expect(custom.layers[2].paint["circle-color"]).toBe("#8fd3a6");
  });

  it("radius / maxZoom は source へ渡る", () => {
    const custom = buildClusterSpec({ id: "c", src: "/p.geojson", radius: 80, maxZoom: 13 });
    expect(custom.source.clusterRadius).toBe(80);
    expect(custom.source.clusterMaxZoom).toBe(13);
  });

  it("src が無ければ作らない（**空の source を足すと地図が黙って壊れる**）", () => {
    expect(() => buildClusterSpec({ id: "c", src: "" })).toThrow(/src/);
  });

  it("id が無ければ作らない（source 名が衝突すると後勝ちで消える）", () => {
    expect(() => buildClusterSpec({ id: "", src: "/p.geojson" })).toThrow(/id/);
  });
});
