import { describe, expect, it } from "vitest";

import { POI_DEFAULTS, buildPoiSpec } from "../src/poi.js";

/**
 * **地図は単体で持ち歩かれる。**オフラインで端末に入ったあとは、
 * 配布元のページは付いて来ない。**出典を地図の外に書いても、読む人には届かない。**
 *
 * 避難所の指定のように「間違っていると人が危ない」データを重ねるとき、
 * **どこの・いつ時点のものかが、その場で読めること**が要る。
 * MMJ は渡されたデータを描くだけで、正しさはデータの出どころが持つ——
 * だからこそ、**出どころを名乗れる場所**を部品が用意する。
 */

/**
 * 層を id で引く。**位置で数えない。**
 * 当たり判定の層が増えたとき、`layers[0]` が点から当たり判定へずれて
 * 7 件まとめて落ちた（2026-09-29）。
 * @param {any} spec
 * @param {string} suffix
 */
const layerOf = (spec, suffix) =>
  /** @type {any} */ (spec.layers.find((/** @type {any} */ l) => l.id.endsWith(suffix)));

describe("buildPoiSpec の attribution", () => {
  it("渡した出典を source に載せる（**地図の中に出る**）", () => {
    const spec = buildPoiSpec({
      id: "shelters",
      src: "/data/shelters.geojson",
      attribution: "出典：○○市 指定緊急避難場所一覧（2026 年 9 月時点）",
    });
    expect(spec.source.attribution).toBe("出典：○○市 指定緊急避難場所一覧（2026 年 9 月時点）");
  });

  it("渡さなければ付けない（**出どころを騙らない**）", () => {
    expect(buildPoiSpec({ id: "a", src: "/a.geojson" }).source).not.toHaveProperty("attribution");
  });

  it("空文字も付けない（**空の出典欄を地図に出さない**）", () => {
    expect(buildPoiSpec({ id: "a", src: "/a.geojson", attribution: "" }).source).not.toHaveProperty("attribution");
  });
});

describe("buildPoiSpec", () => {
  const spec = buildPoiSpec({ id: "mmj-poi-1", src: "/data/our-poi.geojson" });

  it("source は GeoJSON で、**まとめない**（それは mmj-cluster の仕事）", () => {
    expect(spec.sourceId).toBe("mmj-poi-1");
    expect(spec.source.type).toBe("geojson");
    expect(spec.source.data).toBe("/data/our-poi.geojson");
    expect(spec.source.cluster).toBeUndefined();
  });

  it("レイヤは 3 枚。当たり判定・点・その名前", () => {
    expect(spec.layers.map((layer) => layer.id)).toEqual(["mmj-poi-1-hit", "mmj-poi-1-dot", "mmj-poi-1-label"]);
    for (const layer of spec.layers) expect(layer.source).toBe("mmj-poi-1");
  });

  it("名前は既定で name 属性から取る", () => {
    expect(layerOf(spec, "-label").layout["text-field"]).toEqual(["get", "name"]);
  });

  it("**どの属性を名前にするかは媒体が決める**（title でも shop_name でもよい）", () => {
    const custom = buildPoiSpec({ id: "p", src: "/p.geojson", labelKey: "shop_name" });
    expect(layerOf(custom, "-label").layout["text-field"]).toEqual(["get", "shop_name"]);
  });

  it("フォントはスタイルと同じものだけを使う（**増やすとグリフが 404 になる**）", () => {
    expect(layerOf(spec, "-label").layout["text-font"]).toEqual([POI_DEFAULTS.font]);
  });

  it("出しはじめの倍率は指定できる。**件数を知っているのは媒体だけ**", () => {
    expect(layerOf(spec, "-dot").minzoom).toBe(POI_DEFAULTS.minZoom);
    const custom = buildPoiSpec({ id: "p", src: "/p.geojson", minZoom: 15 });
    for (const layer of custom.layers) expect(layer.minzoom).toBe(15);
  });

  it("色は属性で差し替えられる（既定は承認された色ではない）", () => {
    expect(layerOf(spec, "-dot").paint["circle-color"]).toBe(POI_DEFAULTS.color);
    const custom = buildPoiSpec({
      id: "p",
      src: "/p.geojson",
      color: "#8fd3a6",
      textColor: "#c9d0d8",
    });
    expect(layerOf(custom, "-dot").paint["circle-color"]).toBe("#8fd3a6");
    expect(layerOf(custom, "-label").paint["text-color"]).toBe("#c9d0d8");
  });

  it("名前には縁取りを付ける（**地図の上の字は、縁が無いと読めない**）", () => {
    expect(layerOf(spec, "-label").paint["text-halo-width"]).toBeGreaterThan(0);
  });

  it("名前が衝突したら消す。**重ねて出さない**（読めない字を出しても意味がない）", () => {
    expect(layerOf(spec, "-label").layout["text-allow-overlap"]).toBe(false);
  });

  it("src が無ければ作らない（**空の source を足すと地図が黙って壊れる**）", () => {
    expect(() => buildPoiSpec({ id: "p", src: "" })).toThrow(/src/);
  });

  it("id が無ければ作らない（source 名が衝突すると後勝ちで消える）", () => {
    expect(() => buildPoiSpec({ id: "", src: "/p.geojson" })).toThrow(/id/);
  });
});

/**
 * **指は点より太い。**見える点は半径 5px（縁を入れて 13px）で、
 * 触る目標の目安（Apple 44pt / Material 48dp）の 1/4 しかない。
 * 人からの言葉は「店舗のぽっちがちいさくてたぷしにくい」（2026-09-29）。
 *
 * **見た目は太らせない。**点を大きくすると地図が点で埋まるので、
 * **透明な層をもう 1 枚**重ねて、そちらを押す対象にする。
 */
describe("当たり判定の層", () => {
  const spec = buildPoiSpec({ id: "t", src: "./a.geojson" });

  it("透明な層が増える", () => {
    const hit = layerOf(spec, "-hit");
    expect(hit).toBeDefined();
    expect(hit.paint["circle-opacity"]).toBe(0);
  });

  it("**押せる範囲は、見える点よりずっと大きい**", () => {
    const hit = layerOf(spec, "-hit");
    const dot = layerOf(spec, "-dot");
    expect(hit.paint["circle-radius"]).toBeGreaterThanOrEqual(dot.paint["circle-radius"] * 3);
  });

  it("**見える点は太らせない**（地図が点で埋まる）", () => {
    const dot = layerOf(spec, "-dot");
    expect(dot.paint["circle-radius"]).toBe(5);
  });

  it("見える点と名前より下に置く（**上に置くと縁が濁る**）", () => {
    expect(spec.layers[0].id).toBe(spec.hitId);
  });

  it("出しはじめの zoom は、見える点と同じ", () => {
    const hit = layerOf(spec, "-hit");
    const dot = layerOf(spec, "-dot");
    expect(hit.minzoom).toBe(dot.minzoom);
  });
});
