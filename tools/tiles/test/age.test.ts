import { describe, expect, it } from "vitest";

import { STALE_FLAG, ageReport } from "../src/age.js";

/**
 * 配信中の `demo.pmtiles` から読んだ実値（2026-09-30）。
 */
const real = {
  "planetiler:osm:osmosisreplicationtime": "2026-09-15T04:00:00Z",
  "planetiler:buildtime": "2026-03-28T14:41:39.524Z",
};

const now = new Date("2026-09-30T00:00:00Z");

describe("ageReport", () => {
  it("時点と、何日前かを出す", () => {
    const got = ageReport({ metadata: real, now, days: 90 });
    expect(got.lines[0]).toBe("地図データの時点: 2026-09-15T04:00:00Z（14 日前）");
  });

  it("しきい値の内なら、そう言う", () => {
    const got = ageReport({ metadata: real, now, days: 90 });
    expect(got.stale).toBe(false);
    expect(got.lines[1]).toBe("しきい値 90 日以内です");
  });

  it("越えていたら、切り直しは人の判断だと書く", () => {
    const got = ageReport({ metadata: real, now, days: 10 });
    expect(got.stale).toBe(true);
    expect(got.lines[1]).toContain("しきい値 10 日を越えています");
    expect(got.lines[1]).toContain("人の判断");
  });

  /**
   * **deploy.yml がこの行を grep している。**日本語の文面を読ませると、
   * 言い回しを直した日に**黙って要約が出なくなる**（落ちないので誰も気づけない）。
   * 機械が読む印は、人が読む文と分けて、ここで固定する。
   */
  it("最後の行は、機械が読む印", () => {
    expect(STALE_FLAG).toBe("mmj:stale=");
    expect(ageReport({ metadata: real, now, days: 10 }).lines.at(-1)).toBe("mmj:stale=true");
    expect(ageReport({ metadata: real, now, days: 90 }).lines.at(-1)).toBe("mmj:stale=false");
    expect(ageReport({ metadata: {}, now, days: 90 }).lines.at(-1)).toBe("mmj:stale=unknown");
  });

  /** **決めつけない。**自分で切ったタイルには時点が入っていないことがある */
  it("時点が読めなければ、判断しないと言う", () => {
    const got = ageReport({ metadata: { name: "自作" }, now, days: 90 });
    expect(got.stale).toBe(false);
    expect(got.lines[0]).toContain("判断しません");
  });

  /** 1 日未満を「0 日前」と出す（`-0 日前` や `NaN` を出さない） */
  it("切った直後でも壊れない", () => {
    const fresh = { "planetiler:osm:osmosisreplicationtime": "2026-09-30T00:00:00Z" };
    expect(ageReport({ metadata: fresh, now, days: 90 }).lines[0]).toBe(
      "地図データの時点: 2026-09-30T00:00:00Z（0 日前）",
    );
  });
});
