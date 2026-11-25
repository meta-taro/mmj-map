import { describe, expect, it } from "vitest";

import { ROUTE_DEFAULTS, buildRouteSpec, dodgeTag, extractSteps, fitSides, routeBounds, stepPinSpec } from "../src/route.js";

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
   * **形は 3 回直している。**全部、実物を見ての指摘（2026-10-09）。
   *
   * 1. 尖り 8px → 「さんかくがちいさくて視認できません」
   * 2. 高さ 15px にしたら鋭くなった → 「もうすこし緩和してほしい」
   * 3. 底辺を広げて比を 0.85 にしても変わらなかった →
   *    「**ちょと鋭利すぎてこわいのでかわいらしいピンがいいのです**」
   *
   * **3 で、三角形の比を直す路線そのものが誤りだと分かった。**
   * 丸と三角を**別々に置いている**ことが原因で、継ぎ目ができるので
   * 「丸に針が刺さっている」ように見える。比をどう変えても消えない。
   *
   * **一体の雫形にする。**本体の丸がそのまま下へ流れて先になる形。
   * 先は短く、丸の半径より下へ出さない。
   */
  it("**丸の下の出っ張りは短い**（長いと針に見える）", () => {
    const photo = stepPinSpec({ image: "./a.jpg" }, "#000");
    expect(photo.tail).toBeLessThan(photo.radius);
  });

  /**
   * **本体は、写真より一回り大きい丸。**本体の縁がそのまま輪になり、
   * 下へ流れて先になる。**丸と三角を別々に置かない**のは、
   * 継ぎ目ができると「丸に針が刺さっている」ように見えるため。
   */
  it("本体の丸は、写真の丸より大きい", () => {
    const photo = stepPinSpec({ image: "./a.jpg" }, "#000");
    expect(photo.body).toBeGreaterThan(photo.radius);
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

describe("fitSides", () => {
  const base = 48;
  const edge = 8;
  /** 名札の左右の端が、縁から edge 以上離れて地図の中に収まっているか（寄せたあとの位置で測る） */
  const inside = (/** @type {any} */ input) => {
    const { left, right } = fitSides(input);
    const inner = input.width - left - right;
    return input.tags.every((/** @type {any} */ tag) => {
      const x = left + ((tag.lng - input.west) / (input.east - input.west)) * inner;
      return x - tag.half >= edge - 0.5 && x + tag.half <= input.width - edge + 0.5;
    });
  };
  const longWest = { width: 390, base, edge, west: 135.49, east: 135.5, tags: [{ lng: 135.49, half: 110 }, { lng: 135.5, half: 40 }] };

  it("gives a tag at the end of the line only the edge gap plus its half width", () => {
    // 0.14.0 は両側に 48 + 110 = 158 を空けていた
    expect(fitSides(longWest)).toEqual({ left: 118, right: 48 });
    expect(inside(longWest)).toBe(true);
  });

  it("adds nothing for a tag that sits well inside the line", () => {
    const sides = fitSides({ width: 390, base, edge, west: 135.49, east: 135.51, tags: [{ lng: 135.5, half: 90 }, { lng: 135.5, half: 90 }] });
    expect(sides).toEqual({ left: 48, right: 48 });
  });

  it("leaves more of the map for the line than the 0.14.0 padding did", () => {
    const sides = fitSides(longWest);
    expect(390 - sides.left - sides.right).toBeGreaterThan(390 - 2 * (48 + 110));
  });

  it("keeps tags near (not at) the edge inside after the line shrinks", () => {
    const input = { width: 390, base, edge, west: 135.49, east: 135.5, tags: [{ lng: 135.4905, half: 120 }, { lng: 135.4995, half: 120 }] };
    expect(inside(input)).toBe(true);
  });

  it("falls back to the widest tag on both sides when the map is narrower than the tags", () => {
    expect(fitSides({ width: 100, base, edge, west: 0, east: 1, tags: [{ lng: 0, half: 80 }] })).toEqual({ left: 88, right: 88 });
  });

  it("treats a north-south line (no width) as centred", () => {
    expect(fitSides({ width: 390, base, edge, west: 135.5, east: 135.5, tags: [{ lng: 135.5, half: 60 }] })).toEqual({ left: 48, right: 48 });
  });
});

const box = (/** @type {number} */ left, /** @type {number} */ top, /** @type {number} */ right, /** @type {number} */ bottom) => ({ left, top, right, bottom });

// 地点の下へ返したときの箱（尖りの高さ 8 を上下に挟む）
const flipped = (/** @type {any} */ t) => ({ left: t.left, right: t.right, top: t.bottom + 16, bottom: t.bottom + 16 + (t.bottom - t.top) });

describe("dodgeTag", () => {
  // 390px の地図。名札は幅 160・高さ 24、尖りの先（地点）は x=200
  const tag = box(120, 300, 280, 324);
  const base = { tag, width: 390, height: 600, edge: 8, gap: 4, tailInset: 16, tail: 8 };
  const hits = (/** @type {any} */ shift, /** @type {any[]} */ pins) =>
    pins.some((pin) => {
      // 下へ返したときは、尖り 2 つぶんと名札の高さだけ下がる
      const dy = shift.below ? 16 + (tag.bottom - tag.top) + shift.stem : -shift.stem;
      return tag.left + shift.dx < pin.right && pin.left < tag.right + shift.dx && tag.top + dy < pin.bottom && pin.top < tag.bottom + dy;
    });

  it("leaves a tag alone when no pin covers it", () => {
    expect(dodgeTag({ ...base, pins: [box(300, 290, 327, 331)] })).toEqual({ dx: 0, stem: 0, below: false });
  });

  it("slides the tag sideways off a pin, the shortest way, keeping the tail on the spot", () => {
    // ピンは地点の右、名札の右端に掛かる → 左へずらすのが近い
    const pins = [box(250, 290, 277, 331)];
    const shift = dodgeTag({ ...base, pins });
    expect(shift).toEqual({ dx: -34, stem: 0, below: false });
    expect(hits(shift, pins)).toBe(false);
    expect(Math.abs(shift.dx)).toBeLessThanOrEqual(80 - 16); // 尖りは名札の中に残る
  });

  it("turns the tag below the spot when it cannot slide (the pin stands above the spot, so below is free)", () => {
    // 名札が地図いっぱいに近く、横へ逃げる場所が無い
    const wide = { ...base, tag: box(12, 300, 372, 324) };
    const shift = dodgeTag({ ...wide, pins: [box(170, 291, 197, 332)] });
    expect(shift).toEqual({ dx: 0, stem: 0, below: true });
  });

  it("sinks a little further below when the pin's foot reaches just past the spot (the 1100px case)", () => {
    const wide = { ...base, tag: box(12, 300, 372, 324) };
    // ピンの絵は尖りの先より数 px 下まである（影）。隙間 4 を足すと、下へ返した札の上端に 1px 掛かる
    const pins = [box(170, 291, 197, 337)];
    const shift = dodgeTag({ ...wide, pins });
    expect(shift.below).toBe(true);
    expect(shift.stem).toBe(337 + 4 - (324 + 16));
    expect(hits(shift, pins)).toBe(false);
  });

  it("lifts the tag above the pin when below is taken too (the 390px report: a photo pin under the spot)", () => {
    const wide = { ...base, tag: box(12, 300, 372, 324) };
    const pins = [box(170, 284, 197, 325), box(250, 345, 290, 390)];
    const shift = dodgeTag({ ...wide, pins });
    expect(shift).toEqual({ dx: 0, stem: 324 - 284 + 4, below: false });
  });

  it("does not turn the tag below the bottom edge of the map", () => {
    const low = { ...base, height: 360, tag: box(12, 300, 372, 324) };
    const shift = dodgeTag({ ...low, pins: [box(170, 291, 197, 332)] });
    expect(shift.below).toBe(false);
    expect(shift.stem).toBeGreaterThan(0);
    expect(flipped(low.tag).bottom).toBeGreaterThan(360 - 8); // 下へ返すと縁を越える
  });

  it("lifts above every pin it would land on, not just the first", () => {
    const wide = { ...base, tag: box(12, 300, 372, 324) };
    const pins = [box(170, 290, 197, 331), box(200, 250, 227, 291), box(100, 335, 140, 380)];
    const shift = dodgeTag({ ...wide, pins });
    expect(shift.stem).toBe(324 - 250 + 4);
  });

  it("does not slide into a second pin", () => {
    const pins = [box(250, 290, 277, 331), box(60, 290, 110, 331)];
    const shift = dodgeTag({ ...base, pins });
    expect(hits(shift, pins)).toBe(false);
  });
});
