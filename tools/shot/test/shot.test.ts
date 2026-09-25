import { describe, expect, it } from "vitest";

import { isCountableRequest, isNoticeShown, nextWaitState, parseShotArgs, pickBrowser } from "../src/shot.js";

describe("parseShotArgs", () => {
  it("既定は手元の配信のトップ", () => {
    expect(parseShotArgs([])).toEqual({
      url: "http://localhost:8787/",
      out: "shot.png",
      waitMs: 25000,
      width: 1280,
      height: 860,
    });
  });

  it("URL・出力先・待ち時間を受け取る", () => {
    expect(parseShotArgs(["http://localhost:9000/#14/34.7/135.5", "a/b.png", "5000"])).toEqual({
      url: "http://localhost:9000/#14/34.7/135.5",
      out: "a/b.png",
      waitMs: 5000,
      width: 1280,
      height: 860,
    });
  });

  it("pnpm が渡してくる `--` を実引数と数えない", () => {
    expect(parseShotArgs(["--", "http://example.invalid/"]).url).toBe("http://example.invalid/");
  });

  it("待ち時間が数でなければ落とす（黙って既定へ戻すと、待っていないことに気づけない）", () => {
    expect(() => parseShotArgs(["http://x/", "a.png", "すぐ"])).toThrow(/待ち時間/);
  });

  /**
   * **寸法を指定できないと、SNS カードの 1200×630 が撮れない。**
   * 窓の外から大きさを変える手は使えなかった（拡張から resize しても
   * `innerWidth` が 1359 のまま変わらないのを実測・2026-09-25）。撮る側が寸法を持つのが確実。
   */
  it("`--size=` で撮る大きさを決める", () => {
    expect(parseShotArgs(["http://x/", "og.png", "--size=1200x630"])).toEqual({
      url: "http://x/",
      out: "og.png",
      waitMs: 25000,
      width: 1200,
      height: 630,
    });
  });

  it("`--size=` を位置引数と数えない（待ち時間として読むと落ちる）", () => {
    expect(parseShotArgs(["--size=800x600", "http://x/", "a.png", "9000"])).toEqual({
      url: "http://x/",
      out: "a.png",
      waitMs: 9000,
      width: 800,
      height: 600,
    });
  });

  it("読めない寸法は落とす（**黙って既定で撮ると、違う大きさの絵が出回る**）", () => {
    expect(() => parseShotArgs(["--size=1200"])).toThrow(/寸法/);
    expect(() => parseShotArgs(["--size=0x630"])).toThrow(/寸法/);
  });
});

describe("nextWaitState", () => {
  const quietMs = 2500;

  it("通信が残っているあいだは静かになった時刻を持たない", () => {
    expect(nextWaitState({ quietSince: 1000 }, 3, 5000, quietMs)).toEqual({ state: { quietSince: null }, done: false });
  });

  it("通信が途切れた時刻を覚える", () => {
    expect(nextWaitState({ quietSince: null }, 0, 5000, quietMs)).toEqual({ state: { quietSince: 5000 }, done: false });
  });

  it("静かなまま十分たったら終わる", () => {
    expect(nextWaitState({ quietSince: 5000 }, 0, 7501, quietMs).done).toBe(true);
  });

  it("途中で通信が再開したら数え直す", () => {
    const a = nextWaitState({ quietSince: 5000 }, 2, 6000, quietMs);
    expect(a.state.quietSince).toBeNull();
    expect(nextWaitState(a.state, 0, 6100, quietMs).state.quietSince).toBe(6100);
  });
});

describe("pickBrowser", () => {
  const candidates = ["C:/chrome.exe", "C:/edge.exe"];

  it("先に見つかったものを使う", () => {
    expect(pickBrowser(candidates, (p) => p === "C:/edge.exe")).toBe("C:/edge.exe");
  });

  it("1 つも無ければ、何を探したかを言って落ちる", () => {
    expect(() => pickBrowser(candidates, () => false)).toThrow(/C:\/chrome\.exe/);
  });
});

describe("isCountableRequest", () => {
  it("配信への要求は数える", () => {
    expect(isCountableRequest("http://localhost:8787/tiles/kansai.pmtiles")).toBe(true);
    expect(isCountableRequest("https://protomaps.github.io/basemaps-assets/fonts/A/0-255.pbf")).toBe(true);
  });

  it("blob: は数えない", () => {
    // MapLibre の worker は blob: で読み込まれ、**ページが生きている間ずっと開いたまま**。
    // これを数えると「読み込みが止まった」が永久に来ず、毎回待ち切って撮ることになる（実測）。
    expect(isCountableRequest("blob:http://localhost:8787/e007075b-d740-4705-93e4-0d9a977af1ae")).toBe(false);
  });

  it("data: も数えない", () => {
    expect(isCountableRequest("data:image/png;base64,iVBOR")).toBe(false);
  });
});

const probe = (notice: unknown) => JSON.stringify({ notice, webgl2: true, config: null });

describe("isNoticeShown", () => {
  it("案内画面が出たまま撮れたなら、成功にしない", () => {
    expect(isNoticeShown(probe(true))).toBe(true);
  });

  it("案内画面が隠れているなら、地図が出ている", () => {
    expect(isNoticeShown(probe(false))).toBe(false);
  });

  it("**案内画面を持たないページは、案内画面ではない。**", () => {
    // `!el?.hidden` と書くと、要素が無いページで !undefined === true になり、
    // 地図が撮れているのに失敗扱いになる（実測: デモ以外のページが毎回 exit 1）。
    expect(isNoticeShown(probe(null))).toBe(false);
  });

  it("読めない値なら、黙って通さずに落とす", () => {
    expect(() => isNoticeShown("<html>")).toThrow(/画面の状態/);
  });
});
