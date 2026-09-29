/**
 * 画面が壊れていないかの判定。**ここは純粋関数**（ブラウザも DOM も触らない）。
 *
 * ## なぜ要るのか
 *
 * **単体試験は「壊れていないこと」を示すが、「正しく見えること」は示さない。**
 * 2026-09-29 の 1 日で、415 個の試験が 1 つも落ちていないまま、
 * **人が見て初めて分かった不具合が 7 件**出た。
 *
 * | 何が起きたか | ここで止まるか |
 * |---|---|
 * | 頁の上を文字とリンクが 312px（画面の 35%）占めていた | 止まる（`map-top`） |
 * | 横へ流すメニューが格子の列を広げ、頁が 1343px になった | 止まる（`overflow`） |
 * | ナビの的が 31px しか無かった | 止まる（`tap`） |
 * | 地図へ飛ぶ手段がキーボードに無かった | 止まる（`skip`） |
 * | LP の地図が折り目の下に沈んでいた | 止まる（`map-fold`） |
 *
 * **絵の良し悪しは見ない。**「人が見なくても分かること」だけを機械にやらせる。
 * 配色や余白の可否は人の領域（`DESIGN.md`）。
 */

/** 指で押す的の下限（px）。目安は Apple 44pt / Material 48dp だが、**まず 36 を割らない** */
export const TAP_MIN = 36;

/**
 * 地図が主役の頁で、**地図より前に使ってよい高さ**（画面に対する割合）。
 *
 * 実測（2026-09-29・1440x900 の `shops.html`）: 畳む前は 312px = 35% で、
 * 人から「文字が上に幅を利かせて、体験お邪魔」と言われた。畳んだ後は 153px = 17%。
 */
export const MAP_TOP_RATIO = 0.25;

/**
 * 読み物の頁（LP）で、**最初の画面に見えていてほしい地図の高さ**（画面に対する割合）。
 *
 * LP は題と導入文が先に来てよい（読み物なので）。ただし
 * **地図が折り目の下に丸ごと沈むのは別**。実測では PC 50% / 携帯 67% ある。
 */
export const LP_MAP_RATIO = 0.33;

/** 地図の入れ物の種類。**読み物と道具で、上に使ってよい高さが違う** */
export type StageKind = "map-area" | "lp-stage";

export interface Stage {
  readonly kind: StageKind;
  readonly top: number;
  readonly height: number;
}

export interface TapTarget {
  readonly label: string;
  readonly width: number;
  readonly height: number;
}

export interface PageReport {
  readonly url: string;
  readonly width: number;
  readonly height: number;
  /** 頁の中身の幅と、見えている幅。**食い違えば横へはみ出している** */
  readonly scrollWidth: number;
  readonly clientWidth: number;
  readonly stage: Stage | null;
  readonly taps: readonly TapTarget[];
  readonly skipLink: boolean;
  readonly skipTarget: boolean;
  /** 見出しの深さを、出てきた順に（`h1` なら 1） */
  readonly headings: readonly number[];
  readonly consoleErrors: readonly string[];
}

export interface Finding {
  readonly rule: string;
  readonly detail: string;
}

/**
 * 1 枚の頁を見て、見つけたものを返す。**空なら合格。**
 *
 * **1 つ見つけて打ち切らない。**まとめて直したいので、全部返す。
 */
export function runChecks(page: PageReport): Finding[] {
  const found: Finding[] = [];
  const at = `${page.url} @${page.width}`;

  // **コンソールの error は、それ自体が不具合。**握り潰さない（§8）
  for (const message of page.consoleErrors) {
    found.push({ rule: "console", detail: `${at}: ${message}` });
  }

  // 横へはみ出すと、指で払うたびに頁が動く。1px は小数の丸めのぶん
  if (page.scrollWidth > page.clientWidth + 1) {
    found.push({
      rule: "overflow",
      detail: `${at}: 横へ ${page.scrollWidth - page.clientWidth}px はみ出している（中身 ${page.scrollWidth} / 画面 ${page.clientWidth}）`,
    });
  }

  found.push(...checkStage(page, at));

  for (const tap of page.taps) {
    if (tap.height < TAP_MIN || tap.width < TAP_MIN) {
      found.push({
        rule: "tap",
        detail: `${at}: 「${tap.label}」が ${Math.round(tap.width)}x${Math.round(tap.height)}（${TAP_MIN}px 未満）`,
      });
    }
  }

  // **キーボードで来た人が、最初に地図へ行けること**
  if (!page.skipLink) found.push({ rule: "skip", detail: `${at}: 地図へ飛ぶリンクが無い` });
  else if (!page.skipTarget) found.push({ rule: "skip", detail: `${at}: 飛ぶ先の要素が無い` });

  found.push(...checkHeadings(page.headings, at));

  return found;
}

/**
 * 地図が最初の画面に出ているか。
 *
 * **入れ物が無い頁は見ない**（地図を持たない頁もあってよい）。
 */
function checkStage(page: PageReport, at: string): Finding[] {
  const stage = page.stage;
  if (stage === null) return [];

  // 折り目の下に丸ごと沈んでいる
  if (stage.top >= page.height) {
    return [
      {
        rule: "map-fold",
        detail: `${at}: 地図が最初の画面に無い（上端 ${Math.round(stage.top)}px / 画面 ${page.height}px）`,
      },
    ];
  }

  if (stage.kind === "map-area") {
    const ratio = stage.top / page.height;
    if (ratio > MAP_TOP_RATIO) {
      return [
        {
          rule: "map-top",
          detail: `${at}: 地図より前に ${Math.round(stage.top)}px（画面の ${Math.round(ratio * 100)}%）使っている。上限は ${Math.round(MAP_TOP_RATIO * 100)}%`,
        },
      ];
    }
    return [];
  }

  // 読み物の頁は、題と導入文が先でよい。**見えている高さで見る**
  const visible = Math.max(0, Math.min(page.height, stage.top + stage.height) - Math.max(0, stage.top));
  const ratio = visible / page.height;
  if (ratio < LP_MAP_RATIO) {
    return [
      {
        rule: "map-fold",
        detail: `${at}: 最初の画面に見えている地図が ${Math.round(ratio * 100)}% しかない。下限は ${Math.round(LP_MAP_RATIO * 100)}%`,
      },
    ];
  }
  return [];
}

/**
 * 見出しの並び。**`h1` は 1 つ、深さは飛ばさない。**
 *
 * 読み上げで頁の骨格をたどる人にとって、**飛んだ見出しは階層が壊れて見える**。
 */
function checkHeadings(headings: readonly number[], at: string): Finding[] {
  const found: Finding[] = [];
  const tops = headings.filter((level) => level === 1).length;
  if (tops !== 1) found.push({ rule: "heading", detail: `${at}: h1 が ${tops} 個（1 個にする）` });

  let previous = 0;
  for (const level of headings) {
    if (previous !== 0 && level > previous + 1) {
      found.push({ rule: "heading", detail: `${at}: h${previous} の次が h${level}（深さを飛ばしている）` });
    }
    previous = level;
  }
  return found;
}

/** 人が読む報告。**何枚見て、何が見つかったか**を出す */
export function report(pages: number, found: readonly Finding[]): string {
  if (found.length === 0) return `OK ${pages} 枚を見て、指摘はありません`;
  const lines = found.map((finding) => `  [${finding.rule}] ${finding.detail}`);
  return `NG ${pages} 枚を見て、${found.length} 件\n${lines.join("\n")}`;
}
