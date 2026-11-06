import { describe, expect, it } from "vitest";

import {
  MACHIBARI,
  RING,
  ballOffset,
  drawNeedle,
  drawRing,
  needleGeometry,
  needleImageExpression,
  needleImageParts,
  needleOffset,
  ringArcs,
  ringClusterProperties,
  ringImageExpression,
  ringImageParts,
  ringRadius,
  ringSize,
} from "../src/machibari.js";

/** 呼ばれた順に記録するだけの context。**何を、どの順で描いたか**を見る */
function recorder() {
  /** @type {any[]} */
  const calls = [];
  const state = {};
  const context = new Proxy(state, {
    get(target, key) {
      if (key === "calls") return calls;
      if (key in target) return /** @type {any} */ (target)[key];
      return (/** @type {any[]} */ ...args) => calls.push([key, ...args]);
    },
    set(target, key, value) {
      /** @type {any} */ (target)[key] = value;
      calls.push([`=${String(key)}`, value]);
      return true;
    },
  });
  return /** @type {any} */ (context);
}

/** 針先の白い点を塗った回数 @param {any} context */
function tipOf(context) {
  return context.calls.filter((/** @type {any[]} */ k) => k[0] === "=fillStyle" && k[1] === MACHIBARI.tip.color);
}

/** @param {readonly { color: string, start: number, end: number }[]} arcs @param {number} i */
function arcAt(arcs, i) {
  const arc = arcs[i];
  if (arc === undefined) throw new Error(`${i} 番目の弧がありません`);
  return arc;
}

describe("needleGeometry", () => {
  it("寝ている針は、真上から右へ 30°（玉は針先の右上）", () => {
    const { tip, head } = needleGeometry(false);
    const dx = head.x - tip.x;
    const dy = head.y - tip.y;
    expect(Math.hypot(dx, dy)).toBeCloseTo(MACHIBARI.rest.length, 6);
    // 真上からの傾き
    expect((Math.atan2(dx, -dy) * 180) / Math.PI).toBeCloseTo(30, 6);
  });

  it("選んだ針は真上に立ち、長く、玉が大きい", () => {
    const rest = needleGeometry(false);
    const picked = needleGeometry(true);
    expect(picked.head.x).toBeCloseTo(picked.tip.x, 6);
    expect(picked.tip.y - picked.head.y).toBeCloseTo(MACHIBARI.picked.length, 6);
    expect(picked.radius).toBeGreaterThan(rest.radius);
  });

  it("玉も影も箱からはみ出さない（**はみ出すと縁が欠ける**）", () => {
    for (const picked of [false, true]) {
      const g = needleGeometry(picked);
      const reach = g.radius + MACHIBARI.ballStroke / 2;
      expect(g.head.x - reach).toBeGreaterThanOrEqual(0);
      expect(g.head.y - reach).toBeGreaterThanOrEqual(0);
      expect(g.head.x + reach).toBeLessThanOrEqual(g.width);
      expect(g.tip.x - MACHIBARI.shadow.rx + MACHIBARI.shadow.dx).toBeGreaterThanOrEqual(0);
      expect(g.tip.y + MACHIBARI.shadow.dy + MACHIBARI.shadow.ry).toBeLessThanOrEqual(g.height);
    }
  });

  it("玉の位置は針先から右上（押す目標をここへずらす）", () => {
    const [x, y] = ballOffset(false);
    expect(x).toBeCloseTo(10, 6);
    expect(y).toBeCloseTo(-20 * Math.cos(Math.PI / 6), 6);
  });

  it("icon-offset は針先を座標へ戻す（**ずれると別の店を指す**）", () => {
    for (const picked of [false, true]) {
      const { tip } = needleGeometry(picked);
      expect(needleOffset(picked)).toEqual([-tip.x, -tip.y]);
    }
  });
});

describe("drawNeedle", () => {
  it("影 → 針 → 玉 → 光の順に描く（**後に描いたものが上**）", () => {
    const context = recorder();
    drawNeedle(context, { color: "#a66bff", casing: "#111418", picked: false });
    const order = context.calls.map((/** @type {any[]} */ c) => c[0]).filter((/** @type {string} */ k) => ["ellipse", "lineTo", "arc"].includes(k));
    expect(order).toEqual(["ellipse", "lineTo", "arc", "arc"]);
  });

  it("針は細い灰色、玉は渡された色", () => {
    const context = recorder();
    drawNeedle(context, { color: "#ff8a3d", casing: "#111418", picked: false });
    const sets = context.calls.filter((/** @type {any[]} */ c) => String(c[0]).startsWith("="));
    expect(sets).toContainEqual(["=strokeStyle", MACHIBARI.needleColor]);
    expect(sets).toContainEqual(["=lineWidth", 0.6]);
    expect(sets).toContainEqual(["=fillStyle", "#ff8a3d"]);
  });

  it("選んだときだけ、針先に白い点", () => {
    const rest = recorder();
    drawNeedle(rest, { color: "#a66bff", casing: "#111418", picked: false });
    const picked = recorder();
    drawNeedle(picked, { color: "#a66bff", casing: "#111418", picked: true });
    expect(tipOf(rest)).toHaveLength(0);
    expect(tipOf(picked)).toHaveLength(1);
  });
});

describe("ringArcs", () => {
  const colors = ["#a66bff", "#ff8a3d", "#ff4fa3"];

  it("12 時から時計回りに、割合どおりの弧を並べる", () => {
    const arcs = ringArcs(40, [20, 10, 10], colors, "#3FB1CE");
    expect(arcs.map((a) => a.color)).toEqual(colors);
    expect(arcAt(arcs, 0).start).toBeCloseTo(-Math.PI / 2, 9);
    expect(arcAt(arcs, 0).end - arcAt(arcs, 0).start).toBeCloseTo(Math.PI, 9);
    expect(arcAt(arcs, 2).end).toBeCloseTo(-Math.PI / 2 + Math.PI * 2, 9);
  });

  it("対応に無い種別の点は、最後に既定の色でまとめる", () => {
    const arcs = ringArcs(10, [5, 0, 0], colors, "#3FB1CE");
    expect(arcs.map((a) => a.color)).toEqual(["#a66bff", "#3FB1CE"]);
  });

  it("0 件の種別は弧を作らない（**幅 0 の弧でも端が点になる**）", () => {
    expect(ringArcs(6, [0, 6, 0], colors, "#3FB1CE").map((a) => a.color)).toEqual(["#ff8a3d"]);
  });

  it("種別の対応が無ければ、1 色の輪", () => {
    const arcs = ringArcs(12, [], [], "#3FB1CE");
    expect(arcs).toHaveLength(1);
    expect(arcAt(arcs, 0).end - arcAt(arcs, 0).start).toBeCloseTo(Math.PI * 2, 9);
  });

  it("件数が 0 なら何も描かない", () => {
    expect(ringArcs(0, [0, 0], colors, "#3FB1CE")).toEqual([]);
  });
});

describe("ringRadius / ringSize", () => {
  it("件数で伸び、60 件で止まる（**大きすぎる輪は地図を隠す**）", () => {
    expect(ringRadius(6)).toBeCloseTo(RING.base + 1, 9);
    expect(ringRadius(60)).toBe(ringRadius(500));
    expect(ringRadius(2)).toBeLessThan(ringRadius(30));
  });

  it("箱は輪の外側の縁まで入る", () => {
    for (const n of [2, 30, 1000]) expect(ringSize(n) / 2).toBeGreaterThanOrEqual(ringRadius(n) + RING.width / 2);
  });
});

describe("drawRing", () => {
  it("弧を描いてから、中を地色で塗る（件数の字は地図の文字層が受け持つ）", () => {
    const context = recorder();
    drawRing(context, { total: 4, counts: [2, 2], colors: ["#a66bff", "#ff8a3d"], fallbackColor: "#3FB1CE", fill: "#111418" });
    const strokes = context.calls.filter((/** @type {any[]} */ c) => c[0] === "=strokeStyle").map((/** @type {any[]} */ c) => c[1]);
    expect(strokes).toEqual(["#a66bff", "#ff8a3d"]);
    const fills = context.calls.filter((/** @type {any[]} */ c) => c[0] === "=fillStyle");
    expect(fills).toEqual([["=fillStyle", "#111418"]]);
    expect(context.calls.at(-1)[0]).toBe("fill");
    expect(context.calls.some((/** @type {any[]} */ c) => c[0] === "fillText")).toBe(false);
  });
});

describe("clusterProperties", () => {
  it("種別ごとに 1 を足す式（**数えるのは MapLibre**・D-011）", () => {
    expect(ringClusterProperties("group", [{ name: "梅田" }, { name: "難波" }])).toEqual({
      mmj_k0: ["+", ["case", ["==", ["to-string", ["get", "group"]], "梅田"], 1, 0]],
      mmj_k1: ["+", ["case", ["==", ["to-string", ["get", "group"]], "難波"], 1, 0]],
    });
  });
});

describe("画像 id の往復", () => {
  it("輪: 式の組み立てと、id からの読み戻しが噛み合う", () => {
    expect(ringImageExpression("s", 2)).toEqual([
      "concat",
      "s--ring--",
      ["to-string", ["get", "point_count"]],
      "|",
      ["to-string", ["get", "mmj_k0"]],
      ",",
      ["to-string", ["get", "mmj_k1"]],
    ]);
    expect(ringImageParts("s", "s--ring--42|20,14")).toEqual({ total: 42, counts: [20, 14] });
    expect(ringImageParts("s", "s--ring--7|")).toEqual({ total: 7, counts: [] });
  });

  it("輪: 他の source の id と、壊れた id は引き受けない", () => {
    expect(ringImageParts("s", "t--ring--4|1")).toBeNull();
    expect(ringImageParts("s", "s--ring--x|1")).toBeNull();
    expect(ringImageParts("s", "s--ring--4|1,-2")).toBeNull();
    expect(ringImageParts("s", 3)).toBeNull();
  });

  it("まち針: 色は値ごと、状態は寝ている / 選んだ", () => {
    expect(
      needleImageExpression({
        sourceId: "s",
        picked: false,
        colorKey: "kind",
        colors: [{ name: "bar", color: "#a66bff" }],
        fallbackColor: "#3FB1CE",
      }),
    ).toEqual(["concat", "s--machibari--", ["match", ["to-string", ["get", "kind"]], "bar", "#a66bff", "#3FB1CE"], "|", "rest"]);
    expect(needleImageExpression({ sourceId: "s", picked: true, fallbackColor: "#3FB1CE" })).toEqual([
      "concat",
      "s--machibari--",
      "#3FB1CE",
      "|",
      "picked",
    ]);
    expect(needleImageParts("s", "s--machibari--#a66bff|picked")).toEqual({ color: "#a66bff", picked: true });
    expect(needleImageParts("s", "s--machibari--#a66bff|rest")).toEqual({ color: "#a66bff", picked: false });
  });

  it("まち針: 輪の id や、他の source の id を引き受けない", () => {
    expect(needleImageParts("s", "s--ring--4|1")).toBeNull();
    expect(needleImageParts("s", "t--machibari--#fff|rest")).toBeNull();
    expect(needleImageParts("s", "s--machibari--#fff|up")).toBeNull();
  });
});
