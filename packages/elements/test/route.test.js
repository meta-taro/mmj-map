import { describe, expect, it } from "vitest";

import { ROUTE_DEFAULTS, buildRouteSpec, extractSteps, routeBounds } from "../src/route.js";

/**
 * 経路を描く。**経路を計算しない。**
 *
 * 計算には道路グラフとルーティングエンジンが要り、それは D-003（地図サーバーを立てない）の
 * 外側にある。**作るのは誰か（API でも AI でも）で、ここは描くだけ。**
 * 「データを持たない。表現を持つ」の形そのもの。
 */

/** 経路 1 本と、曲がる地点 2 つ。**合成データ** */
const ROUTE = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [
          [135.5, 34.69],
          [135.51, 34.7],
          [135.52, 34.7],
        ],
      },
    },
    {
      type: "Feature",
      properties: { instruction: "コンビニを左折" },
      geometry: { type: "Point", coordinates: [135.51, 34.7] },
    },
    {
      type: "Feature",
      properties: { instruction: "郵便局の先を右折", image: "./corner.jpg" },
      geometry: { type: "Point", coordinates: [135.52, 34.7] },
    },
  ],
};

describe("buildRouteSpec", () => {
  const spec = buildRouteSpec({ id: "r1", data: ROUTE });

  it("source と layer の名前に id が入る（**同じページに 2 本置ける**）", () => {
    expect(spec.sourceId).toBe("r1");
    for (const layer of spec.layers) expect(layer.id.startsWith("r1")).toBe(true);
  });

  it("**縁取りが先、本体が後**（順が逆だと本体が隠れる）", () => {
    expect(spec.layers.map((l) => l.id)).toEqual(["r1-casing", "r1-line"]);
  });

  it("縁取りのほうが太い（**細いと縁にならない**）", () => {
    const [casing, line] = spec.layers;
    expect(casing.paint["line-width"]).toBeGreaterThan(line.paint["line-width"]);
  });

  it("線の端と角を丸める（折れ点が尖ると経路が途切れて見える）", () => {
    for (const layer of spec.layers) {
      expect(layer.layout["line-cap"]).toBe("round");
      expect(layer.layout["line-join"]).toBe("round");
    }
  });

  it("**線だけを描く。**同じ source の点まで線にしない", () => {
    for (const layer of spec.layers) {
      expect(JSON.stringify(layer.filter)).toContain("LineString");
    }
  });

  it("色と太さを差し替えられる", () => {
    const custom = buildRouteSpec({
      id: "r1",
      data: ROUTE,
      color: "#ff0000",
      casingColor: "#000000",
      width: 10,
    });
    const [casing, line] = custom.layers;
    expect(line.paint["line-color"]).toBe("#ff0000");
    expect(casing.paint["line-color"]).toBe("#000000");
    expect(line.paint["line-width"]).toBe(10);
  });

  it("渡さなければ既定（**新しい色を作っていない**・置く側が決める）", () => {
    expect(spec.layers[1].paint["line-color"]).toBe(ROUTE_DEFAULTS.color);
  });

  it("source は渡された GeoJSON をそのまま持つ（**2 回取りに行かない**）", () => {
    expect(spec.source.type).toBe("geojson");
    expect(spec.source.data).toBe(ROUTE);
  });

  it("id が無ければ投げる（名前が衝突すると後勝ちで消える）", () => {
    expect(() => buildRouteSpec({ id: "", data: ROUTE })).toThrow();
  });

  it("**線が 1 本も無ければ投げる。**空の経路を黙って描かない", () => {
    expect(() =>
      buildRouteSpec({ id: "r1", data: { type: "FeatureCollection", features: [] } }),
    ).toThrow();
  });
});

describe("extractSteps", () => {
  it("案内文を持つ点だけを拾う", () => {
    expect(extractSteps(ROUTE)).toEqual([
      { lngLat: [135.51, 34.7], text: "コンビニを左折", image: null },
      { lngLat: [135.52, 34.7], text: "郵便局の先を右折", image: "./corner.jpg" },
    ]);
  });

  it("**写真も拾う**（吹き出しに載る）", () => {
    expect(extractSteps(ROUTE)[1]?.image).toBe("./corner.jpg");
  });

  it("案内文の属性名を変えられる（媒体ごとに名前が違う）", () => {
    const data = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { guide: "左折" },
          geometry: { type: "Point", coordinates: [1, 2] },
        },
      ],
    };
    expect(extractSteps(data, "guide")).toEqual([{ lngLat: [1, 2], text: "左折", image: null }]);
    expect(extractSteps(data)).toEqual([]);
  });

  it("線は拾わない。案内文の無い点も拾わない", () => {
    const data = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [1, 2] } },
        {
          type: "Feature",
          properties: { instruction: "x" },
          geometry: { type: "LineString", coordinates: [[1, 2]] },
        },
      ],
    };
    expect(extractSteps(data)).toEqual([]);
  });

  it("壊れたデータでも落ちない（空を返す）", () => {
    expect(extractSteps(null)).toEqual([]);
    expect(extractSteps({})).toEqual([]);
    expect(extractSteps({ features: [null, {}] })).toEqual([]);
  });
});

describe("routeBounds", () => {
  it("線の端から端までを返す（**画面に収めるため**）", () => {
    expect(routeBounds(ROUTE)).toEqual([
      [135.5, 34.69],
      [135.52, 34.7],
    ]);
  });

  it("点も含める（曲がる地点が画面の外に出ない）", () => {
    const data = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [
              [0, 0],
              [1, 1],
            ],
          },
        },
        { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [5, -5] } },
      ],
    };
    expect(routeBounds(data)).toEqual([
      [0, -5],
      [5, 1],
    ]);
  });

  it("座標が無ければ null（**[0,0] へ寄せない**。アフリカ沖に飛ぶ）", () => {
    expect(routeBounds({ type: "FeatureCollection", features: [] })).toBeNull();
    expect(routeBounds(null)).toBeNull();
  });
});
