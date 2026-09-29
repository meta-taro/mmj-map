import { describe, expect, it } from "vitest";

import { addExtrusion, buildExtrusionLayer, extrusionBeforeId, extrusionCamera } from "../src/extrude.js";

const buildings = {
  id: "buildings",
  type: "fill",
  source: "basemap",
  "source-layer": "buildings",
  minzoom: 13,
  paint: { "fill-color": "#262C33", "fill-opacity": 1 },
};

/** @param {any[]} layers */
const style = (layers) => ({ version: 8, sources: {}, layers });

describe("buildExtrusionLayer", () => {
  it("**色を発明しない。**2D の建物レイヤの fill-color をそのまま使う", () => {
    const layer = buildExtrusionLayer(buildings);

    expect(layer.paint["fill-extrusion-color"]).toBe("#262C33");
  });

  it("source と source-layer も元のレイヤから取る（別のものを押し出さない）", () => {
    const layer = buildExtrusionLayer({ ...buildings, source: "other", "source-layer": "bldg" });

    expect(layer.source).toBe("other");
    expect(layer["source-layer"]).toBe("bldg");
  });

  it("高さを持つものだけ押し出す（無いものに既定値を入れない）", () => {
    const layer = buildExtrusionLayer(buildings);

    expect(layer.filter).toContainEqual(["has", "height"]);
    expect(JSON.stringify(layer.paint["fill-extrusion-height"])).toBe(JSON.stringify(["get", "height"]));
  });

  it("min_height を土台に使う（高架下や中空の建物が地面から生えない）", () => {
    const layer = buildExtrusionLayer(buildings);

    expect(JSON.stringify(layer.paint["fill-extrusion-base"])).toBe(
      JSON.stringify(["coalesce", ["get", "min_height"], 0]),
    );
  });
});

describe("addExtrusion", () => {
  it("2D の建物レイヤの直後へ足す（高さの無い建物は平らなまま残る）", () => {
    const result = addExtrusion(style([{ id: "earth" }, buildings, { id: "labels" }]));

    expect(result.layers.map((/** @type {any} */ l) => l.id)).toEqual(["earth", "buildings", "buildings-3d", "labels"]);
  });

  it("元のスタイルを書き換えない（手書きの正本を壊さない）", () => {
    const original = style([buildings]);
    addExtrusion(original);

    expect(original.layers).toHaveLength(1);
  });

  it("**建物レイヤが無ければ落とす。**黙って平らな地図を出さない", () => {
    expect(() => addExtrusion(style([{ id: "earth" }]))).toThrow(/buildings/);
  });

  it("二重に足さない（属性を付け外ししても増えない）", () => {
    const once = addExtrusion(style([buildings]));
    const twice = addExtrusion(once);

    expect(twice.layers.filter((/** @type {any} */ l) => l.id === "buildings-3d")).toHaveLength(1);
  });
});

/**
 * **走っている地図へ、後から建物を立てる。**
 *
 * `3d` は地図を作るときに一度しか読んでいなかったので、
 * **歩きながら立てたり寝かせたりができなかった**。
 * 知らない街を歩くときは「その角のビルの形」が効くが、
 * **ずっと立っていると、上から見て道をたどるのが読みにくい**。
 *
 * どこへ差し込むかだけを、ここで決める（DOM も MapLibre も触らない）。
 */
describe("extrusionBeforeId", () => {
  it("2D の建物の**次**のレイヤの前へ入れる（＝建物のすぐ上）", () => {
    expect(extrusionBeforeId(["earth", "water", "buildings", "roads", "labels"])).toBe("roads");
  });

  /** **経路や目印より下へ入る。**上に描くと、案内の線が建物に隠れる */
  it("後から足された経路の層より下へ入る", () => {
    expect(extrusionBeforeId(["buildings", "mmj-route-1-line"])).toBe("mmj-route-1-line");
  });

  /** `undefined` は MapLibre では「いちばん上へ」の意味 */
  it("建物が最後なら undefined（いちばん上へ）", () => {
    expect(extrusionBeforeId(["earth", "buildings"])).toBeUndefined();
  });

  /** **黙って何もしないと、立てたつもりの平らな地図が出て原因が分からない** */
  it("建物のレイヤが無ければ投げる", () => {
    expect(() => extrusionBeforeId(["earth", "water"])).toThrow(/buildings/);
  });

  it("**壊れた値で落とさない**（地図は出す）", () => {
    expect(extrusionBeforeId(null)).toBeUndefined();
  });
});

/**
 * **立てたのに何も起きないように見えるのを防ぐ。**
 *
 * 押し出しは**寄って（z14）・傾けて（45°）**初めて見える。
 * どちらも足りない状態で `3d` を入れると、**押しても画面が変わらず、
 * 壊れているように見える**（実測・2026-09-29。携帯では経路に合わせて
 * z13 まで引かれていたので、建物が 1 つも立たなかった）。
 *
 * **下げない。**すでに寄っている／傾けている人から、その値を奪わない。
 */
describe("extrusionCamera", () => {
  it("真上から遠くを見ているなら、寄せて傾ける", () => {
    expect(extrusionCamera({ zoom: 13, pitch: 0 })).toEqual({ zoom: 14, pitch: 45 });
  });

  it("**すでに寄っているなら、そのまま**（勝手に引き寄せない）", () => {
    expect(extrusionCamera({ zoom: 17, pitch: 0 })).toEqual({ pitch: 45 });
  });

  it("**すでに傾けているなら、角度は触らない**", () => {
    expect(extrusionCamera({ zoom: 13, pitch: 60 })).toEqual({ zoom: 14 });
  });

  /** 動かす必要が無いなら `null`。**用の無い動きをさせない** */
  it("寄っていて傾いているなら null", () => {
    expect(extrusionCamera({ zoom: 16, pitch: 50 })).toBeNull();
  });

  it("**壊れた値で落とさない**", () => {
    expect(extrusionCamera(null)).toBeNull();
  });
});
