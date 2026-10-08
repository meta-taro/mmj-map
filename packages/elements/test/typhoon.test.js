import { describe, expect, it } from "vitest";

import {
  areaFeatures,
  buildTyphoonSpec,
  centerFeatures,
  parseTrack,
  trackFeatures,
  TYPHOON_COLORS,
} from "../src/typhoon.js";

/**
 * 報道で見る形に合わせてある。並びと色には意味があるので、テストで縛る。
 */

/** @type {import("../src/typhoon.js").TyphoonFrame[]} */
const track = [
  { label: "09:00", center: [131, 30], pressure: 975, stormKm: 70, galeKm: 240, forecast: false },
  { label: "12:00", center: [133, 32], pressure: 960, stormKm: 110, galeKm: 320, forecast: false },
  { label: "15:00", center: [135, 34], pressure: 955, stormKm: 120, galeKm: 340, forecastKm: 90, forecast: true },
  { label: "18:00", center: [137, 36], pressure: 970, stormKm: 90, galeKm: 300, forecastKm: 140, forecast: true },
];

describe("parseTrack", () => {
  it("frames を包んでいても、素の配列でも読む", () => {
    expect(parseTrack({ frames: track })).toHaveLength(4);
    expect(parseTrack(track)).toHaveLength(4);
  });

  // 途中が欠けていても地図は殺さない。残りは描ける
  it("中心を読めない時刻は落とす", () => {
    const broken = /** @type {any} */ ([...track, { label: "21:00", center: ["x", null] }, { label: "22:00" }]);
    expect(parseTrack(broken)).toHaveLength(4);
  });

  it("読めない入力は空", () => {
    expect(parseTrack(null)).toEqual([]);
    expect(parseTrack({})).toEqual([]);
  });
});

/** 円の経度の幅（地表の円かどうかを見るため） @param {any} feature */
const lngWidth = (feature) => {
  const xs = feature.geometry.coordinates[0].map((/** @type {number[]} */ pair) => pair[0]);
  return Math.max(...xs) - Math.min(...xs);
};

describe("areaFeatures", () => {
  it("強風域 → 暴風域 の順に入れる（あとが上に乗るので、逆だと暴風域が隠れる）", () => {
    const kinds = areaFeatures(track, 1).features.map((f) => f.properties.kind);
    expect(kinds).toEqual(["gale", "storm"]);
  });

  it("予報円がある時刻では 3 つ出る", () => {
    const kinds = areaFeatures(track, 2).features.map((f) => f.properties.kind);
    expect(kinds).toEqual(["gale", "storm", "forecast"]);
  });

  it("半径が無い・0 の輪は描かない（見えない図形を黙って置かない）", () => {
    const thin = /** @type {any} */ ([{ label: "x", center: [135, 34], stormKm: 0, galeKm: 200 }]);
    expect(areaFeatures(thin, 0).features.map((f) => f.properties.kind)).toEqual(["gale"]);
  });

  it("範囲の外を指しても落ちない", () => {
    expect(areaFeatures(track, 99).features).toEqual([]);
  });

  // 地表の円であること。画面の円だと、倍率を変えたときに囲む場所が変わる
  it("緯度の高いほうが、経度の幅が広くなる（地表の円である証拠）", () => {
    const south = areaFeatures(/** @type {any} */ ([{ label: "s", center: [135, 10], galeKm: 300 }]), 0).features[0];
    const north = areaFeatures(/** @type {any} */ ([{ label: "n", center: [135, 60], galeKm: 300 }]), 0).features[0];
    expect(lngWidth(north)).toBeGreaterThan(lngWidth(south));
  });
});

describe("trackFeatures", () => {
  it("実績と予報を 2 本に分ける", () => {
    const kinds = trackFeatures(track, 3).features.map((f) => f.properties.kind);
    expect(kinds).toEqual(["past", "future"]);
  });

  // `forecast: true` から先は、いま何番目を見ていても予報のまま
  it("予報の始まりより先へ進んでも、実績が伸びない", () => {
    const at2 = trackFeatures(track, 2).features.find((f) => f.properties.kind === "past");
    const at3 = trackFeatures(track, 3).features.find((f) => f.properties.kind === "past");
    expect(at3?.geometry.coordinates).toEqual(at2?.geometry.coordinates);
    expect(at3?.geometry.coordinates).toHaveLength(3);
  });

  it("1 点しか無ければ線を引かない", () => {
    expect(trackFeatures(/** @type {any} */ ([track[0]]), 0).features).toEqual([]);
  });

  it("空でも落ちない", () => {
    expect(trackFeatures([], 0).features).toEqual([]);
  });
});

describe("centerFeatures", () => {
  it("時刻と気圧を見出しにする", () => {
    expect(centerFeatures(track, 1).features[0]?.properties.label).toBe("12:00 · 960 hPa");
  });

  it("気圧が無ければ時刻だけ", () => {
    expect(centerFeatures(/** @type {any} */ ([{ label: "09:00", center: [131, 30] }]), 0).features[0]?.properties.label).toBe("09:00");
  });
});

describe("buildTyphoonSpec", () => {
  it("source は 3 本（面・進路・中心）", () => {
    expect(buildTyphoonSpec({ id: "t" }).sources.map((s) => s.id)).toEqual(["t-area", "t-track", "t-center"]);
  });

  it("色は報道の配色を写す（独自色にしない）", () => {
    const layers = buildTyphoonSpec({ id: "t" }).layers;
    expect(layers.find((l) => l.id === "t-gale")?.paint["fill-color"]).toBe(TYPHOON_COLORS.gale);
    expect(layers.find((l) => l.id === "t-storm")?.paint["fill-color"]).toBe(TYPHOON_COLORS.storm);
  });

  // 予報円は「中心の位置の不確かさ」で、暴風域ではない。塗ると誤読される
  it("予報円は塗らない（線だけ・破線）", () => {
    const forecast = buildTyphoonSpec({ id: "t" }).layers.find((l) => l.id === "t-forecast");
    expect(forecast?.type).toBe("line");
    expect(forecast?.paint["line-dasharray"]).toBeDefined();
  });

  it("これから通る道は破線、通ってきた道は実線", () => {
    const layers = buildTyphoonSpec({ id: "t" }).layers;
    expect(layers.find((l) => l.id === "t-track-past")?.paint["line-dasharray"]).toBeUndefined();
    expect(layers.find((l) => l.id === "t-track-future")?.paint["line-dasharray"]).toBeDefined();
  });

  it("id が無ければ落とす（衝突すると後勝ちで消える）", () => {
    expect(() => buildTyphoonSpec({ id: "" })).toThrow(/id/);
  });
});
