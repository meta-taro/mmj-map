import { describe, expect, it } from "vitest";

import {
  WALK_DEFAULTS,
  formatWalk,
  pickLandmark,
  routeEnds,
  routeLength,
  turnSteps,
  walkSummary,
} from "../src/walk.js";

/**
 * 経路の線から「歩く人に要るもの」を組む。**経路は計算しない**（線は外から来る）。
 *
 * 2026-11-13、MMJ を使ったホテル検索サイトから、駅からの徒歩経路を出そうとして
 * **曲がり角の案内・所要分数・目印・両端の印を全部自前で作ることになった**と分かった。
 * 線さえ渡せば、ここまで出るようにする。
 */

/** 緯度 35 度付近で、東へ / 北へ `m` メートル進んだ経度差・緯度差 */
const M_PER_DEG_LAT = 111_195;
const lat0 = 35;
const dLng = (/** @type {number} */ m) => m / (M_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180));
const dLat = (/** @type {number} */ m) => m / M_PER_DEG_LAT;
const lng0 = 135.5;

/** 東へ `east` m、北へ `north` m の点 */
const at = (/** @type {number} */ east, /** @type {number} */ north) =>
  /** @type {[number, number]} */ ([lng0 + dLng(east), lat0 + dLat(north)]);

/** @param {number[][]} coordinates @param {Record<string, unknown>} [properties] */
const lineOf = (coordinates, properties = {}) => ({
  type: "FeatureCollection",
  /** @type {any[]} */
  features: [{ type: "Feature", properties, geometry: { type: "LineString", coordinates } }],
});

describe("routeLength", () => {
  it("線の長さをメートルで返す（東へ 400m）", () => {
    expect(routeLength(lineOf([at(0, 0), at(400, 0)]))).toBeCloseTo(400, 0);
  });

  it("折れ線は区間の和（東へ 300m、北へ 100m）", () => {
    expect(routeLength(lineOf([at(0, 0), at(300, 0), at(300, 100)]))).toBeCloseTo(400, 0);
  });

  it("線が無ければ 0（壊れたデータで落ちない）", () => {
    expect(routeLength({ type: "FeatureCollection", features: [] })).toBe(0);
    expect(routeLength(null)).toBe(0);
  });
});

/**
 * 2026-11-13 のレビューで見つかった穴。**経路の出力でよく起きる形**から落ちないようにする。
 */
describe("壊れやすい形", () => {
  /** 線が読めないのに「徒歩 1 分・10m」と出すと、画面が嘘をつく */
  it("**線が無ければ距離も分数も 0**（作った数を出さない）", () => {
    expect(walkSummary(null)).toEqual({ meters: 0, minutes: 0 });
    expect(walkSummary(lineOf([at(0, 0)]))).toEqual({ meters: 0, minutes: 0 });
  });

  /** 経路の出力は、始まりと終わりの点が二重になっていることが多い */
  it("**始まりや終わりの点が二重でも、ありもしない角を作らない**", () => {
    expect(turnSteps(lineOf([at(0, 0), at(0, 0), at(300, 0)]))).toEqual([]);
    expect(turnSteps(lineOf([at(0, 0), at(300, 0), at(300, 0)]))).toEqual([]);
    expect(turnSteps(lineOf([at(0, 0), at(300, 0), at(300, 0), at(300, 100)])).map((s) => s.turn)).toEqual(["左へ"]);
  });

  /** 左へ曲がってすぐ右へ戻る（道の段差）は、向きが変わっていない。「左へ」だけ言うと迷わせる */
  it("**すぐ戻る段差は案内しない**（右へ・左へが打ち消し合う）", () => {
    expect(turnSteps(lineOf([at(0, 0), at(300, 0), at(300, 10), at(600, 10)]))).toEqual([]);
  });

  /** 角が 20m より細かく続いても、まとまりが際限なく伸びて先の角を飲み込まない */
  it("離れた 2 つの角を、間の細かい点でつなげて 1 つにしない", () => {
    const wiggle = [];
    for (let east = 0; east <= 300; east += 10) wiggle.push(at(east, east % 20 === 0 ? 0 : 0.5));
    const steps = turnSteps(lineOf([...wiggle, at(300, 100), at(500, 100)]));
    expect(steps.map((s) => s.turn)).toEqual(["左へ", "右へ"]);
  });

  /** 名札の名前と位置は、同じ線から取る */
  it("最初の線が壊れていたら、名札もその次の線から取る", () => {
    const data = lineOf([at(0, 0)], { from: "壊れた線" });
    data.features.push({
      type: "Feature",
      properties: { from: "A2 出口", to: "ホテル月" },
      geometry: { type: "LineString", coordinates: [at(0, 0), at(300, 0)] },
    });
    expect(routeEnds(data)?.start.label).toBe("A2 出口");
  });

  /** 文の無い点は吹き出しにならない。それが自動の案内だけを消すと、角に何も出なくなる */
  it("案内文が空の点は、自動の案内を消さない", () => {
    const data = lineOf([at(0, 0), at(300, 0), at(300, 100)]);
    data.features.push({
      type: "Feature",
      properties: { instruction: "" },
      geometry: { type: "Point", coordinates: at(300, 0) },
    });
    expect(turnSteps(data).map((s) => s.turn)).toEqual(["左へ"]);
  });
});

/**
 * **分数は切り上げる。**不動産の表示の決まり（徒歩 1 分＝80m・端数は切り上げ）と同じにしておくと、
 * 同じ頁の「駅から徒歩◯分」と食い違わない。
 */
describe("walkSummary", () => {
  it("80m で 1 分、端数は切り上げ", () => {
    expect(walkSummary(lineOf([at(0, 0), at(400, 0)])).minutes).toBe(5);
    expect(walkSummary(lineOf([at(0, 0), at(410, 0)])).minutes).toBe(6);
  });

  it("歩く速さを差し替えられる", () => {
    expect(walkSummary(lineOf([at(0, 0), at(400, 0)]), 100).minutes).toBe(4);
  });

  it("**どんなに短くても 0 分にしない**", () => {
    expect(walkSummary(lineOf([at(0, 0), at(5, 0)])).minutes).toBe(1);
  });

  it("速さが読めなければ既定（80m/分）", () => {
    expect(walkSummary(lineOf([at(0, 0), at(400, 0)]), Number.NaN).minutes).toBe(5);
    expect(walkSummary(lineOf([at(0, 0), at(400, 0)]), -1).minutes).toBe(5);
    expect(WALK_DEFAULTS.speed).toBe(80);
  });

  it("距離は 10m 単位に丸める", () => {
    expect(walkSummary(lineOf([at(0, 0), at(404, 0)])).meters).toBe(400);
  });
});

describe("formatWalk", () => {
  it("「徒歩 5 分・400m」", () => {
    expect(formatWalk({ meters: 400, minutes: 5 })).toBe("徒歩 5 分・400m");
  });

  it("1km 以上は km で（1 桁）", () => {
    expect(formatWalk({ meters: 1250, minutes: 16 })).toBe("徒歩 16 分・1.3km");
  });
});

describe("turnSteps", () => {
  it("東へ進んで北へ折れたら「左へ」", () => {
    const steps = turnSteps(lineOf([at(0, 0), at(300, 0), at(300, 100)]));
    expect(steps).toHaveLength(1);
    expect(steps[0]?.turn).toBe("左へ");
    expect(steps[0]?.lngLat[0]).toBeCloseTo(at(300, 0)[0], 6);
  });

  it("東へ進んで南へ折れたら「右へ」", () => {
    const steps = turnSteps(lineOf([at(0, 0), at(300, 0), at(300, -100)]));
    expect(steps.map((s) => s.turn)).toEqual(["右へ"]);
  });

  it("浅い折れ（45 度）は「斜め」", () => {
    const steps = turnSteps(lineOf([at(0, 0), at(300, 0), at(400, -100)]));
    expect(steps.map((s) => s.turn)).toEqual(["斜め右へ"]);
  });

  it("**ゆるい曲がり（20 度）は案内しない**（道なりに歩けば済む）", () => {
    const steps = turnSteps(lineOf([at(0, 0), at(300, 0), at(400, 36)]));
    expect(steps).toEqual([]);
  });

  it("次の角（または到着）までの距離を持つ", () => {
    const steps = turnSteps(lineOf([at(0, 0), at(300, 0), at(300, 100), at(500, 100)]));
    expect(steps.map((s) => s.turn)).toEqual(["左へ", "右へ"]);
    expect(steps.map((s) => s.next)).toEqual([100, 200]);
  });

  it("案内文は「左へ（その先 100m）」", () => {
    const steps = turnSteps(lineOf([at(0, 0), at(300, 0), at(300, 100)]));
    expect(steps[0]?.text).toBe("左へ（その先 100m）");
  });

  /**
   * OSM の道は、角が細かい点の連なりになっていることが多い。
   * 1 つの角を 3 つの「左へ」にしない。
   */
  it("**細かく刻まれた角を、1 つの角として数える**", () => {
    const steps = turnSteps(
      lineOf([at(0, 0), at(300, 0), at(303, 1), at(305, 3), at(306, 6), at(306, 100)]),
    );
    expect(steps.map((s) => s.turn)).toEqual(["左へ"]);
  });

  it("**書いてある案内の近くには、自動の案内を重ねない**", () => {
    const data = lineOf([at(0, 0), at(300, 0), at(300, 100)]);
    data.features.push({
      type: "Feature",
      properties: { instruction: "コンビニの角を左" },
      geometry: { type: "Point", coordinates: at(302, 1) },
    });
    expect(turnSteps(data)).toEqual([]);
  });

  it("線が無ければ空（壊れたデータで落ちない）", () => {
    expect(turnSteps(null)).toEqual([]);
    expect(turnSteps(lineOf([at(0, 0)]))).toEqual([]);
  });
});

describe("routeEnds", () => {
  it("線の最初と最後。名前は線の `from` / `to`", () => {
    const ends = routeEnds(lineOf([at(0, 0), at(300, 0)], { from: "A2 出口", to: "ホテル月" }));
    expect(ends?.start.label).toBe("A2 出口");
    expect(ends?.end.label).toBe("ホテル月");
    expect(ends?.start.lngLat[0]).toBeCloseTo(at(0, 0)[0], 9);
    expect(ends?.end.lngLat[0]).toBeCloseTo(at(300, 0)[0], 9);
  });

  it("名前が無ければ「出発」「到着」", () => {
    const ends = routeEnds(lineOf([at(0, 0), at(300, 0)]));
    expect(ends?.start.label).toBe("出発");
    expect(ends?.end.label).toBe("到着");
  });

  it("線が無ければ null", () => {
    expect(routeEnds(null)).toBeNull();
  });
});

/**
 * 目印は**ベース地図にもう入っているお店**から選ぶ（データを持たない）。
 * 置く側が目印のデータを集めなくても「ローソンの角を左へ」が出る。
 */
describe("pickLandmark", () => {
  const corner = /** @type {[number, number]} */ (at(300, 0));
  /** @param {string} name @param {string} kind @param {number} east @param {number} north */
  const poi = (name, kind, east, north) => ({ name, kind, lngLat: /** @type {[number, number]} */ (at(east, north)) });

  it("角のすぐそばの店を選ぶ", () => {
    expect(pickLandmark(corner, [poi("ローソン", "convenience", 310, 5)])?.name).toBe("ローソン");
  });

  it("**遠い店は目印にしない**（角から 30m を超える）", () => {
    expect(pickLandmark(corner, [poi("ローソン", "convenience", 340, 0)])).toBeNull();
  });

  it("目印になりやすい種類を優先する（コンビニ > 学校）", () => {
    const picked = pickLandmark(corner, [poi("第一小", "school", 302, 0), poi("ローソン", "convenience", 315, 0)]);
    expect(picked?.name).toBe("ローソン");
  });

  it("同じ種類なら近いほう", () => {
    const picked = pickLandmark(corner, [poi("遠い店", "convenience", 320, 0), poi("近い店", "convenience", 305, 0)]);
    expect(picked?.name).toBe("近い店");
  });

  it("名前の無いもの・知らない種類は選ばない", () => {
    expect(pickLandmark(corner, [poi("", "convenience", 301, 0)])).toBeNull();
    expect(pickLandmark(corner, [poi("謎", "unknown_kind", 301, 0)])).toBeNull();
  });

  it("目印があれば案内文に入れる", () => {
    const [step] = turnSteps(lineOf([at(0, 0), at(300, 0), at(300, 100)]), {
      landmarks: [poi("ローソン", "convenience", 305, -5)],
    });
    expect(step?.text).toBe("ローソンの角を左へ（その先 100m）");
  });
});
