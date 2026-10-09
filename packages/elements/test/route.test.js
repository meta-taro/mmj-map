import { describe, expect, it } from "vitest";

import { ROUTE_DEFAULTS, buildRouteSpec, extractSteps, routeBounds, stepPinSpec } from "../src/route.js";

/**
 * ピンの中身を決める。**判断はここ（純粋関数）で、SVG の組み立ては要素側。**
 *
 * **写真があることは、押す前に分からないといけない。**
 * 2026-10-09 に「ピンに画像があるとわからないですよ」と指摘を受けた。
 * 吹き出しを開くまで分からないなら、**写真は無いのと同じ**になる。
 *
 * 合図のために別の印（輪・角マーク・点）は足さない。
 * **丸の中が写真になっていれば、小さくて何が写っているか分からなくても伝わる**
 * （「ちいさくてみえなくてもよくて、そうするとなんかがぞうあるなってわかる感じ」）。
 */
describe("stepPinSpec", () => {
  it("**写真があれば、丸の中に入れる**", () => {
    const spec = stepPinSpec({ image: "./photos/a.jpg" }, "#3FB1CE");
    expect(spec.kind).toBe("photo");
    expect(spec.href).toBe("./photos/a.jpg");
    expect(spec.color).toBe("#3FB1CE");
  });

  it("写真が無ければ、いままでどおりの点", () => {
    expect(stepPinSpec({ image: null }, "#3FB1CE").kind).toBe("dot");
    expect(stepPinSpec({ image: "" }, "#3FB1CE").kind).toBe("dot");
    expect(stepPinSpec({}, "#3FB1CE").kind).toBe("dot");
  });

  /**
   * **`href` に入れる前に弾く。**SVG の `<image href>` は、
   * 吹き出しの `<img src>` と同じ経路で危ない URL を踏む。
   * 判定は `popup.js` と**同じもの**を使う（片方だけ直す事故を避ける）。
   */
  it("**安全でない URL は、写真として扱わない**", () => {
    expect(stepPinSpec({ image: "javascript:alert(1)" }, "#000").kind).toBe("dot");
    expect(stepPinSpec({ image: "java\tscript:alert(1)" }, "#000").kind, "分断も").toBe("dot");
    expect(stepPinSpec({ image: "data:image/svg+xml,<svg onload=alert(1)>" }, "#000").kind).toBe("dot");
  });

  it("**写真の丸は、いまの点より大きい**（小さいと汚れに見える）", () => {
    const photo = stepPinSpec({ image: "./a.jpg" }, "#000");
    const dot = stepPinSpec({ image: null }, "#000");
    expect(photo.radius).toBeGreaterThan(dot.radius);
  });

  /**
   * **丸だけだと、どこを指しているのか分からない。**
   * 地図の目印は「先端がその地点」という読み方が共通していて、
   * 丸を中央に置くと**半径のぶん、指す場所がぼやける**。
   *
   * 下に尖りを付けて、**尖りの先が座標**になるようにする（2026-10-09 の依頼）。
   */
  /**
   * **線と同じ色だけで描くと、線の上で溶ける。**
   * 2026-10-09 に「**みちあんないの線といろがどうかしています。
   * ボーダーでほそいせんでかこめるといいかも**」と指摘を受けた。
   *
   * 経路の線は「色＋縁取り（casing）」で地図から浮かせている。
   * **ピンも同じ作りにする**——新しい色は作らず、線の縁取りと同じ値で囲う。
   */
  it("**細い縁で囲む**（経路の線の上でも溶けない）", () => {
    const photo = stepPinSpec({ image: "./a.jpg" }, "#3FB1CE");
    expect(photo.casing).toBeTruthy();
    expect(photo.casing).not.toBe(photo.color);
  });

  it("縁のぶん、箱を広く取る（**囲いが切れない**）", () => {
    const photo = stepPinSpec({ image: "./a.jpg" }, "#000");
    expect(photo.width).toBeGreaterThan(photo.radius * 2 + 4);
  });

  it("**丸の下に尖りを付ける**（先端がその地点になる）", () => {
    const photo = stepPinSpec({ image: "./a.jpg" }, "#000");
    expect(photo.tail).toBeGreaterThan(0);
    // 箱の高さは、丸の直径（縁を含む）＋ 尖りのぶん
    expect(photo.height).toBe(photo.width + photo.tail);
  });

  /**
   * **小さい尖りは、ピンに見えない。**
   * 2026-10-09 に「**ピンにしては、下の▼がちょっと小さいです。
   * ボーダーもあいまって、さんかくがちいさくて視認できません**」と指摘を受けた。
   *
   * 囲い（1.5px）は尖りの外側にも付くので、**細い三角だと囲いで潰れる**。
   * 丸の半径と釣り合う高さにして、**形が残るようにする**。
   */
  it("**尖りは、丸の半径より高い**（小さいとピンに見えない）", () => {
    const photo = stepPinSpec({ image: "./a.jpg" }, "#000");
    expect(photo.tail).toBeGreaterThanOrEqual(photo.radius);
  });
});

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
