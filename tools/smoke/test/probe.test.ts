import { describe, expect, it } from "vitest";

import { PROBE, readProbe } from "../src/probe.js";

const measured = {
  scrollWidth: 1440,
  clientWidth: 1440,
  stage: { kind: "map-area", top: 153, height: 747 },
  taps: [{ label: "はじめに", width: 68, height: 36 }],
  skipLink: true,
  skipTarget: true,
  headings: [1, 2],
};

describe("readProbe", () => {
  it("測った値をそのまま読む", () => {
    expect(readProbe(JSON.stringify(measured))).toEqual(measured);
  });

  /**
   * **頁の中で動くものは、想定どおりに返ってくるとは限らない。**
   * 読み込み途中・例外・別の頁。そのまま判定へ渡すと、
   * **数字でないものを比べて「合格」になる**のが一番まずい。
   */
  it("JSON でなければ null", () => {
    expect(readProbe("これは JSON ではない")).toBeNull();
  });

  it("文字列でなければ null", () => {
    expect(readProbe(undefined)).toBeNull();
    expect(readProbe({ scrollWidth: 1440 })).toBeNull();
  });

  it("幅が数字でなければ null（**合格にしない**）", () => {
    expect(readProbe(JSON.stringify({ ...measured, scrollWidth: "1440" }))).toBeNull();
  });

  it("地図の入れ物が壊れていたら、地図だけ見ない（頁は見る）", () => {
    const got = readProbe(JSON.stringify({ ...measured, stage: { kind: "map-area", top: null, height: 747 } }));
    expect(got?.stage).toBeNull();
    expect(got?.scrollWidth).toBe(1440);
  });

  /** **知らない種類は当てはめない。**道具の頁と読み物の頁で基準が違う */
  it("知らない種類の入れ物は見ない", () => {
    expect(readProbe(JSON.stringify({ ...measured, stage: { kind: "何か", top: 1, height: 2 } }))?.stage).toBeNull();
  });

  it("寸法の無い的は数えない", () => {
    const got = readProbe(JSON.stringify({ ...measured, taps: [{ label: "変なもの" }, measured.taps[0]] }));
    expect(got?.taps).toEqual(measured.taps);
  });

  it("名前の無い的も、寸法があれば数える", () => {
    const got = readProbe(JSON.stringify({ ...measured, taps: [{ width: 20, height: 20 }] }));
    expect(got?.taps[0]).toEqual({ label: "(名前なし)", width: 20, height: 20 });
  });

  it("真偽でない値は、立っていないものとして読む", () => {
    expect(readProbe(JSON.stringify({ ...measured, skipLink: "yes" }))?.skipLink).toBe(false);
  });

  it("見出しは数字だけ拾う", () => {
    expect(readProbe(JSON.stringify({ ...measured, headings: [1, "2", 3] }))?.headings).toEqual([1, 3]);
  });
});

describe("PROBE", () => {
  /** **頁の中で動く式は型で守れない。**せめて、測る対象が全部入っているかは見る */
  it("測る対象が全部入っている", () => {
    for (const key of ["scrollWidth", "clientWidth", "stage", "taps", "skipLink", "skipTarget", "headings"]) {
      expect(PROBE).toContain(key);
    }
  });

  it("道具の頁と読み物の頁、両方の入れ物を探している", () => {
    expect(PROBE).toContain(".map-area");
    expect(PROBE).toContain(".lp-stage");
  });

  it("飛ぶ先の実在まで見ている", () => {
    expect(PROBE).toContain("getElementById");
  });
});
