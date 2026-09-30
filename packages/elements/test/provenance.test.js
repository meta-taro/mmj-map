import { describe, expect, it } from "vitest";

import { asOfLabel, asOfTime, isStale, withAsOf } from "../src/provenance.js";

/**
 * 配信中の `demo.pmtiles` から読んだ実値（2026-09-30）。
 * **取り込みは 2026-09、組み立ては 2026-03 とずれている。**
 */
const real = {
  "planetiler:osm:osmosisreplicationtime": "2026-09-15T04:00:00Z",
  "planetiler:buildtime": "2026-03-28T14:41:39.524Z",
  version: "4.15.2",
};

describe("asOfTime", () => {
  /**
   * **OSM がいつの状態かを優先する。**組み立て時刻を「地図の時点」と名乗ると、
   * 実測のように**半年ずれた日付**を出すことになる。
   */
  it("OSM の取り込み時刻を採る", () => {
    expect(asOfTime(real)).toBe("2026-09-15T04:00:00Z");
  });

  it("取り込み時刻が無ければ、組み立て時刻で代える", () => {
    expect(asOfTime({ "planetiler:buildtime": "2026-03-28T14:41:39.524Z" })).toBe("2026-03-28T14:41:39.524Z");
  });

  /** **日付でないものを「時点」として出さない。**嘘になる */
  it("読めない値は飛ばす", () => {
    expect(
      asOfTime({ "planetiler:osm:osmosisreplicationtime": "いつか", "planetiler:buildtime": "2026-03-28T00:00:00Z" }),
    ).toBe("2026-03-28T00:00:00Z");
    expect(asOfTime({ "planetiler:osm:osmosisreplicationtime": "" })).toBeNull();
  });

  /** **自分で作ったタイルには入っていないことがある。**黙って何も出さない */
  it("どちらも無ければ null", () => {
    expect(asOfTime({ name: "自作" })).toBeNull();
    expect(asOfTime(null)).toBeNull();
    expect(asOfTime(/** @type {any} */ ("文字列"))).toBeNull();
  });
});

describe("asOfLabel", () => {
  /**
   * **月までしか出さない。**日まで出すと「今日の地図」に見えるが、
   * 実際には切った日で凍っている。
   */
  it("月の粒度で出す", () => {
    expect(asOfLabel(real)).toBe("地図データ: 2026-09 時点");
  });

  it("1 桁の月は 0 を詰める", () => {
    expect(asOfLabel({ "planetiler:buildtime": "2026-03-28T14:41:39.524Z" })).toBe("地図データ: 2026-03 時点");
  });

  it("読めなければ null（**何も出さない**）", () => {
    expect(asOfLabel({})).toBeNull();
  });
});

describe("isStale", () => {
  const now = new Date("2026-09-30T00:00:00Z");

  it("しきい値より古ければ true", () => {
    expect(isStale(real, now, 10)).toBe(true);
  });

  it("新しければ false", () => {
    expect(isStale(real, now, 30)).toBe(false);
  });

  /** **決めつけない。**時点が読めないタイルを「古い」と言わない */
  it("時点が読めなければ false", () => {
    expect(isStale({}, now, 1)).toBe(false);
  });

  it("**壊れた値で落とさない**", () => {
    expect(isStale(real, /** @type {any} */ ("きょう"), 1)).toBe(false);
    expect(isStale(real, now, /** @type {any} */ ("10"))).toBe(false);
  });
});

describe("withAsOf", () => {
  const style = {
    sources: {
      basemap: { type: "vector", url: "pmtiles://x.pmtiles", attribution: "© OpenStreetMap contributors" },
      shops: { type: "geojson", data: "./shops.geojson", attribution: "見本" },
    },
    layers: [],
  };

  it("ベース地図の帰属表示へ足す", () => {
    const got = withAsOf(style, "地図データ: 2026-09 時点");
    expect(got.sources.basemap.attribution).toBe("© OpenStreetMap contributors · 地図データ: 2026-09 時点");
  });

  /**
   * **利用者が重ねたものには足さない。**ベース地図の時点を混ぜると、
   * **どちらの時点か分からなくなる**（店の情報は店の都合で新しい）。
   */
  it("重ねた点や面の出典には足さない", () => {
    expect(withAsOf(style, "地図データ: 2026-09 時点").sources.shops.attribution).toBe("見本");
  });

  it("**元のスタイルを書き換えない**", () => {
    withAsOf(style, "地図データ: 2026-09 時点");
    expect(style.sources.basemap.attribution).toBe("© OpenStreetMap contributors");
  });

  it("同じ文を 2 回足さない", () => {
    const once = withAsOf(style, "地図データ: 2026-09 時点");
    expect(withAsOf(once, "地図データ: 2026-09 時点").sources.basemap.attribution).toBe(
      "© OpenStreetMap contributors · 地図データ: 2026-09 時点",
    );
  });

  it("帰属表示が無ければ、それだけを置く", () => {
    const bare = { sources: { basemap: { url: "pmtiles://x.pmtiles" } } };
    expect(withAsOf(bare, "地図データ: 2026-09 時点").sources.basemap.attribution).toBe("地図データ: 2026-09 時点");
  });

  it("時点が読めなければ、何も変えない", () => {
    expect(withAsOf(style, null)).toBe(style);
  });

  it("**壊れた値で落とさない**", () => {
    expect(withAsOf(null, "地図データ: 2026-09 時点")).toBeNull();
    expect(withAsOf({ layers: [] }, "地図データ: 2026-09 時点")).toEqual({ layers: [] });
  });
});
