import { describe, expect, it } from "vitest";

import { DEFAULTS, buildClusterSpec, parseCount, parsePinStyle, pickFilters } from "../src/cluster.js";
import { ballOffset, needleOffset } from "../src/machibari.js";

/**
 * 古い書式の filter と読まれる形か。MapLibre は `["==", 値, 値]` のように両辺が式でない比較を
 * 古い書式として読む。実物で `["==", 1, 0]` がそう読まれ、選んだ層が地図に入らなかった（2026-11-06）
 * @param {unknown} f
 * @returns {boolean}
 */
function legacyLike(f) {
  return (
    Array.isArray(f) &&
    ((["==", "!="].includes(f[0]) && f.length === 3 && !Array.isArray(f[1]) && !Array.isArray(f[2])) ||
      f.slice(1).some(legacyLike))
  );
}

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

  it("既定は丸のまま（**指定しない頁の見た目を変えない**）", () => {
    expect(spec.pin).toBe("circle");
    expect(spec.layers[2].type).toBe("circle");
    expect(spec.source.clusterProperties).toBeUndefined();
  });
});

describe("parsePinStyle", () => {
  it("machibari だけを受け、ほかは丸", () => {
    expect(parsePinStyle("machibari")).toBe("machibari");
    expect(parsePinStyle(" machibari ")).toBe("machibari");
    expect(parsePinStyle("pin")).toBe("circle");
    expect(parsePinStyle(null)).toBe("circle");
  });
});

describe("buildClusterSpec（まち針）", () => {
  const colors = [
    { name: "bar", color: "#a66bff" },
    { name: "cafe", color: "#ff4fa3" },
  ];
  const spec = buildClusterSpec({
    id: "m",
    src: "/p.geojson",
    pin: "machibari",
    colorKey: "kind",
    colors,
    idKey: "id",
  });

  it("層は 4 枚。輪と件数・押せる範囲・まち針・選んだまち針", () => {
    expect(spec.layers.map((l) => l.id)).toEqual(["m-clusters", "m-hit", "m-points", "m-picked"]);
    expect(spec.ids).toEqual({ clusters: "m-clusters", hit: "m-hit", points: "m-points", picked: "m-picked" });
    expect(spec.layers.map((l) => l.type)).toEqual(["symbol", "circle", "symbol", "symbol"]);
  });

  it("押せる範囲は玉の位置に、直径 36px で、見えない（**玉は 10px しかなく指で狙えない**）", () => {
    const hit = spec.layers[1];
    expect(hit.filter).toEqual(["!", ["has", "point_count"]]);
    expect(hit.paint["circle-radius"] * 2).toBeGreaterThanOrEqual(36);
    expect(hit.paint["circle-opacity"]).toBe(0);
    expect(hit.paint["circle-translate"]).toEqual(ballOffset(false));
  });

  it("種別ごとの件数は source が数える（D-011）", () => {
    expect(Object.keys(spec.source.clusterProperties)).toEqual(["mmj_k0", "mmj_k1"]);
  });

  it("輪の層に件数の字も載せ、どちらも衝突で消さない", () => {
    const layout = spec.layers[0].layout;
    expect(layout["text-field"]).toEqual(["get", "point_count_abbreviated"]);
    expect(layout["text-font"]).toEqual([DEFAULTS.font]);
    expect(layout["icon-allow-overlap"]).toBe(true);
    expect(layout["text-allow-overlap"]).toBe(true);
  });

  it("まち針は針先が座標に乗る置き方（左上基準＋針先ぶん戻す）", () => {
    for (const [layer, picked] of [
      [spec.layers[2], false],
      [spec.layers[3], true],
    ]) {
      expect(layer.layout["icon-anchor"]).toBe("top-left");
      expect(layer.layout["icon-offset"]).toEqual(needleOffset(/** @type {boolean} */ (picked)));
      expect(layer.layout["icon-allow-overlap"]).toBe(true);
    }
  });

  it("最初は誰も選ばれていない（選んだ層は何も描かない）", () => {
    expect(spec.layers[2].filter).toEqual(["!", ["has", "point_count"]]);
    expect(spec.layers[3].filter).toEqual(["boolean", false]);
  });

  it("filter に古い書式と読まれる形を使わない（**読まれると検証で落ち、層ごと足されない**）", () => {
    const { points, picked } = pickFilters("id", "42");
    for (const filter of [...spec.layers.map((l) => l.filter), points, picked]) expect(legacyLike(filter)).toBe(false);
    expect(legacyLike(["==", 1, 0])).toBe(true);
  });

  it("id-key が無ければ、選んだ層を作らない", () => {
    const plain = buildClusterSpec({ id: "m", src: "/p.geojson", pin: "machibari" });
    expect(plain.layers.map((l) => l.id)).toEqual(["m-clusters", "m-hit", "m-points"]);
    expect(plain.ids.picked).toBeNull();
    // 種別の対応が無ければ数えない
    expect(plain.source.clusterProperties).toBeUndefined();
  });
});

describe("pickFilters", () => {
  it("選んだ点は、まち針の層から外して選んだ層へ移す（**2 本描かない**）", () => {
    const { points, picked } = pickFilters("id", "42");
    const same = ["==", ["to-string", ["get", "id"]], "42"];
    expect(points).toEqual(["all", ["!", ["has", "point_count"]], ["!", same]]);
    expect(picked).toEqual(["all", ["!", ["has", "point_count"]], same]);
  });
});
