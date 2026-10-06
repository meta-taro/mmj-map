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
      offline: false,
      format: "png",
      quality: 72,
      click: "",
    });
  });

  it("URL・出力先・待ち時間を受け取る", () => {
    expect(parseShotArgs(["http://localhost:9000/#14/34.7/135.5", "a/b.png", "5000"])).toEqual({
      url: "http://localhost:9000/#14/34.7/135.5",
      out: "a/b.png",
      waitMs: 5000,
      width: 1280,
      height: 860,
      offline: false,
      format: "png",
      quality: 72,
      click: "",
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
      offline: false,
      format: "png",
      quality: 72,
      click: "",
    });
  });

  it("`--size=` を位置引数と数えない（待ち時間として読むと落ちる）", () => {
    expect(parseShotArgs(["--size=800x600", "http://x/", "a.png", "9000"])).toEqual({
      url: "http://x/",
      out: "a.png",
      waitMs: 9000,
      width: 800,
      height: 600,
      offline: false,
      format: "png",
      quality: 72,
      click: "",
    });
  });

  /**
   * **「つながらなくても出る」は、切ってみないと言えない。**
   * オンラインで撮れた絵は、掴んでいるのか通信しているのかを区別しない。
   */
  it("`--offline` で、一度読んだあと通信を切って撮り直す", () => {
    expect(parseShotArgs(["http://x/", "a.png", "--offline"]).offline).toBe(true);
  });

  it("既定は通信ありのまま（**黙って切らない**）", () => {
    expect(parseShotArgs([]).offline).toBe(false);
  });

  it("`--offline` を位置引数と数えない", () => {
    expect(parseShotArgs(["--offline", "http://x/", "a.png", "9000"]).waitMs).toBe(9000);
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

  // 以下は**静けさの数え方**を見るもの。読み終えている前提（第 5 引数 true）で試す
  it("通信が途切れた時刻を覚える", () => {
    expect(nextWaitState({ quietSince: null }, 0, 5000, quietMs, true)).toEqual({
      state: { quietSince: 5000 },
      done: false,
    });
  });

  it("静かなまま十分たったら終わる", () => {
    expect(nextWaitState({ quietSince: 5000 }, 0, 7501, quietMs, true).done).toBe(true);
  });

  it("途中で通信が再開したら数え直す", () => {
    const a = nextWaitState({ quietSince: 5000 }, 2, 6000, quietMs, true);
    expect(a.state.quietSince).toBeNull();
    expect(nextWaitState(a.state, 0, 6100, quietMs, true).state.quietSince).toBe(6100);
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

/**
 * **読み込みが始まる前に「静か」と判断していた。**
 *
 * 2026-10-01 に実際に踏んだ: 本番の頁を撮ったら CSS の当たっていない画面が写り、
 * **道具は「失敗した通信 0 件・console 0 件」と報告した。**
 * 私はそれを見て「本番が壊れている」と誤って書いた（実際は正常）。
 *
 * HTML を受け取ってから CSS を要求するまでの隙間で、通信は一瞬 0 件になる。
 * そこから静けさを数え始めると、**何も読み込んでいない画面で終わる。**
 *
 * **撮ってよいのは「読み終えて、かつ静か」になってから。**
 */
describe("nextWaitState（読み込みの前に撮らない）", () => {
  const quietMs = 2500;

  it("読み終えていなければ、静かでも終わらない", () => {
    const got = nextWaitState({ quietSince: 5000 }, 0, 9000, quietMs, false);
    expect(got.done).toBe(false);
  });

  it("読み終えていなければ、静かになった時刻を数え始めない", () => {
    expect(nextWaitState({ quietSince: null }, 0, 5000, quietMs, false).state.quietSince).toBeNull();
  });

  it("読み終えて、静かなまま十分たったら終わる", () => {
    expect(nextWaitState({ quietSince: 5000 }, 0, 7501, quietMs, true).done).toBe(true);
  });

  /** **既定で安全側に倒す。**渡し忘れたときに、昔の壊れた挙動へ戻らないこと */
  it("読み込みの状態を渡さなければ、終わらない", () => {
    expect(nextWaitState({ quietSince: 5000 }, 0, 9000, quietMs).done).toBe(false);
  });
});

/**
 * **サムネを 15 枚載せるなら PNG では重い。**地図は写真に近いので、
 * 可逆圧縮は効かず 1 枚で数百 KB になる。頁に並べる絵は JPEG で出す。
 */
describe("parseShotArgs（JPEG で出す）", () => {
  it("既定は PNG", () => {
    expect(parseShotArgs([])).toMatchObject({ format: "png" });
  });

  it("--jpeg で JPEG になる", () => {
    expect(parseShotArgs(["--jpeg"])).toMatchObject({ format: "jpeg", quality: 72 });
  });

  it("画質を指定できる", () => {
    expect(parseShotArgs(["--jpeg=60"])).toMatchObject({ format: "jpeg", quality: 60 });
  });

  /** **黙って既定へ戻さない。**指定したのに効いていないことに気づけなくなる */
  it("画質が数でなければ落ちる", () => {
    expect(() => parseShotArgs(["--jpeg=high"])).toThrow();
    expect(() => parseShotArgs(["--jpeg=0"])).toThrow();
    expect(() => parseShotArgs(["--jpeg=101"])).toThrow();
  });

  /** 旗を位置引数と数えない（`--size=` で一度踏んだ穴） */
  it("--jpeg を URL や待ち時間と取り違えない", () => {
    expect(parseShotArgs(["http://x/", "a.jpg", "--jpeg=80"])).toMatchObject({
      url: "http://x/",
      out: "a.jpg",
      format: "jpeg",
      quality: 80,
    });
  });
});

/**
 * 撮る前に押す。
 *
 * タブや開閉の中身は、押さないと画面に出ない。そこを確かめられないと、
 * 「単体テストは通ったが、画面は見ていない」で止まる。
 * 実際に決済タブの中身を確かめられず、確認を人へ回した（2026-10-05）。
 */
describe("parseShotArgs（撮る前に押す）", () => {
  it("既定は押さない", () => {
    expect(parseShotArgs([]).click).toBe("");
  });

  it("--click= で CSS セレクタを受ける", () => {
    expect(parseShotArgs(["--click=.mmj-card-tab"]).click).toBe(".mmj-card-tab");
  });

  it("文字で選ぶ書き方も受ける", () => {
    expect(parseShotArgs(["--click=button:text(決済)"]).click).toBe("button:text(決済)");
  });

  it("--click= を位置引数と数えない", () => {
    expect(parseShotArgs(["--click=.x", "http://y/", "a.png", "9000"])).toMatchObject({
      url: "http://y/",
      out: "a.png",
      waitMs: 9000,
    });
  });

  /** 空の指定は受けない（押したつもりで押していない絵が配られる） */
  it("空のセレクタは落とす", () => {
    expect(() => parseShotArgs(["--click="])).toThrow();
  });
});
