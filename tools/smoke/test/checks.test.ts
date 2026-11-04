import { describe, expect, it } from "vitest";

import { LP_MAP_RATIO, MAP_TOP_RATIO, TAP_MIN, type PageReport, report, runChecks } from "../src/checks.js";

/** 揃っている吹き出し（直したあとの実測: 横 0px・隙間 3.5px） */
const alignedPin = { label: "大阪城", anchor: "bottom", offsetX: 0, gap: 3.5, overflow: 0 };

/** 合格する頁。**各試験はここから 1 つだけ壊す**（何が効いたのか分かるように） */
const ok: PageReport = {
  url: "shops.html",
  width: 1440,
  height: 900,
  scrollWidth: 1440,
  clientWidth: 1440,
  stage: { kind: "map-area", top: 153, height: 747 },
  taps: [{ label: "はじめに", width: 68, height: 36 }],
  skipLink: true,
  skipTarget: true,
  headings: [1, 2, 2, 3],
  consoleErrors: [],
  pins: [alignedPin],
  focusInPopup: false,
};

const rules = (page: PageReport) => runChecks(page).map((finding) => finding.rule);

describe("吹き出しとピン", () => {
  /** **実際に起きたものを、そのまま試験にしている**（2026-11-04、拡張の見本で人が見つけた） */
  it("吹き出しの先がピンから 5px ずれていたら止める", () => {
    expect(rules({ ...ok, pins: [{ ...alignedPin, offsetX: 5 }] })).toContain("pin");
  });

  it("吹き出しの先がピンの頭に 10px めり込んでいたら止める", () => {
    expect(rules({ ...ok, pins: [{ ...alignedPin, gap: -10 }] })).toContain("pin");
  });

  it("吹き出しが地図の外へはみ出していたら止める", () => {
    expect(rules({ ...ok, pins: [{ ...alignedPin, overflow: 120 }] })).toContain("pin");
  });

  /** **地図の端では、MapLibre が吹き出しを角へ付け替える。**先が斜め上に来るのが正しい姿 */
  it("角に付いた吹き出しは、ずれとして数えない（はみ出しは見る）", () => {
    const corner = { ...alignedPin, anchor: "bottom-right", offsetX: -19, gap: -20.5 };
    expect(rules({ ...ok, pins: [corner] })).not.toContain("pin");
    expect(rules({ ...ok, pins: [{ ...corner, overflow: 30 }] })).toContain("pin");
  });

  /** 実際に起きたもの: 入力欄で「ABC商店」と打つと「A商店」になった（2026-11-04） */
  it("頁を開いただけで焦点が吹き出しへ移っていたら止める", () => {
    expect(rules({ ...ok, focusInPopup: true })).toContain("focus");
  });

  it("小数の丸め（1px まで）は止めない", () => {
    expect(rules({ ...ok, pins: [{ ...alignedPin, offsetX: -0.5, overflow: 0.8 }] })).not.toContain("pin");
  });

  it("何が起きたかを、数字で言う", () => {
    const [finding] = runChecks({ ...ok, pins: [{ ...alignedPin, offsetX: 5 }] });
    expect(finding?.detail).toContain("大阪城");
    expect(finding?.detail).toContain("5.0px");
  });
});

describe("runChecks", () => {
  it("整っている頁では、何も言わない", () => {
    expect(runChecks(ok)).toEqual([]);
  });

  /**
   * **実際に起きた不具合を、そのまま試験にしている。**
   * 2026-09-29 に人から「文字が上に幅を利かせて、体験お邪魔」と言われた状態。
   */
  it("地図より前に 312px（画面の 35%）使っていたら止める", () => {
    expect(rules({ ...ok, stage: { kind: "map-area", top: 312, height: 588 } })).toContain("map-top");
  });

  it("上が 153px（17%）なら通す", () => {
    expect(rules({ ...ok, stage: { kind: "map-area", top: 153, height: 747 } })).not.toContain("map-top");
  });

  /** 実測で起きたもの: 画面は 390 なのに、頁が 1343px になっていた */
  it("横へはみ出していたら止める", () => {
    expect(rules({ ...ok, width: 390, clientWidth: 390, scrollWidth: 1343 })).toContain("overflow");
  });

  it("**1px は許す**（小数の丸めで毎回落ちる）", () => {
    expect(rules({ ...ok, scrollWidth: 1441 })).not.toContain("overflow");
  });

  /** 実測で起きたもの: ナビの的が 31px しか無かった */
  it("押す的が小さければ止める", () => {
    const found = runChecks({ ...ok, taps: [{ label: "はじめに", width: 68, height: TAP_MIN - 1 }] });
    expect(found[0]?.rule).toBe("tap");
    expect(found[0]?.detail).toContain("はじめに");
  });

  it("**幅が足りないものも見る**（縦だけ見ると、細い的を見逃す）", () => {
    expect(rules({ ...ok, taps: [{ label: "色見本", width: 24, height: 40 }] })).toContain("tap");
  });

  it("地図へ飛ぶリンクが無ければ止める", () => {
    expect(rules({ ...ok, skipLink: false })).toContain("skip");
  });

  it("**飛ぶ先が無いのも止める**（リンクはあるのに着かない、が一番たちが悪い）", () => {
    expect(rules({ ...ok, skipTarget: false })).toContain("skip");
  });

  it("h1 が 2 つあれば止める", () => {
    expect(rules({ ...ok, headings: [1, 1, 2] })).toContain("heading");
  });

  it("見出しの深さを飛ばしたら止める", () => {
    expect(rules({ ...ok, headings: [1, 3] })).toContain("heading");
  });

  it("コンソールの error は、そのまま指摘にする", () => {
    const found = runChecks({ ...ok, consoleErrors: ["[mmj-map] スタイルを取得できません"] });
    expect(found[0]).toEqual({
      rule: "console",
      detail: "shops.html @1440: [mmj-map] スタイルを取得できません",
    });
  });

  /** **1 つ見つけて打ち切らない。**まとめて直したい */
  it("複数あれば、全部返す", () => {
    expect(runChecks({ ...ok, skipLink: false, headings: [1, 3] })).toHaveLength(2);
  });

  it("地図を持たない頁は、地図の判定をしない", () => {
    expect(runChecks({ ...ok, stage: null })).toEqual([]);
  });
});

describe("runChecks（読み物の頁）", () => {
  const lp: PageReport = { ...ok, url: "index.html", stage: { kind: "lp-stage", top: 148, height: 450 } };

  it("**題と導入文が先に来てよい**（上の高さでは測らない）", () => {
    expect(runChecks({ ...lp, stage: { kind: "lp-stage", top: 279, height: 599 }, height: 844 })).toEqual([]);
  });

  it("地図が折り目の下に沈んでいたら止める", () => {
    expect(rules({ ...lp, stage: { kind: "lp-stage", top: 960, height: 400 } })).toContain("map-fold");
  });

  /** 実測で起きたもの: 900px の画面に地図が 287px（32%）しか入っていなかった */
  it("最初の画面に少ししか出ていなければ止める", () => {
    expect(rules({ ...lp, stage: { kind: "lp-stage", top: 613, height: 576 } })).toContain("map-fold");
  });

  it("下限ちょうどは通す", () => {
    const top = ok.height * (1 - LP_MAP_RATIO);
    expect(rules({ ...lp, stage: { kind: "lp-stage", top, height: 600 } })).not.toContain("map-fold");
  });
});

describe("report", () => {
  it("指摘が無ければ、見た枚数を出す", () => {
    expect(report(15, [])).toBe("OK 15 枚を見て、指摘はありません");
  });

  it("**何が・どこで**を 1 行ずつ出す", () => {
    const text = report(2, [{ rule: "tap", detail: "shops.html @390: 「はじめに」が 68x31" }]);
    expect(text).toContain("NG 2 枚を見て、1 件");
    expect(text).toContain("[tap] shops.html @390");
  });
});

describe("しきい値", () => {
  /** **数字は実測から来ている。**変えるときは、何を測ったかも書き換えること */
  it("的は 36px、地図の上は 25%、読み物の地図は 33%", () => {
    expect([TAP_MIN, MAP_TOP_RATIO, LP_MAP_RATIO]).toEqual([36, 0.25, 0.33]);
  });
});
