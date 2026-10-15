/**
 * どのグリフを自前で配るかの判断。**ここは純粋関数。**ネットワークもファイルも触らない。
 *
 * **なぜ自前で配るのか。**スタイルが `protomaps.github.io` を指している限り、
 * **通信が無いところでラベルが出ない**。タイルだけ手元にあっても、字が引けない。
 *
 * **なぜ全部は配らないのか。**配っているフォント（`Noto Sans Regular`）は
 * 256 範囲・**5.95 MB** ある。一方、**漢字・かな・ハングルは閲覧側のフォントで描く**
 * （MapLibre の `localIdeographFontFamily`。グリフに CJK が入っていないため）。
 * 残るラテン系だけなら **561.7 KB**——**10 分の 1** で足りる。
 *
 * **足りることは実測で確かめた**（2026-09-25）。日本語・ベトナム語・繁體中文・
 * ハングルの 4 地域を描いて、記号も欠けなかった
 * （`Hà Nội` / `Cửa Nam` / `Văn Miếu - Quốc Tử Giám` / `서울특별시` まで出る）。
 *
 * **ただし 4 地域では足りていなかった。**2026-10-15 の定期点検で、
 * 経路の見本（`御堂筋 → 曽根崎通`）が **8448-8703 を 404 にしている**ことが
 * 本番で見つかった。**地図は出るので、見ても気づけない**壊れ方だった。
 * 地域を変えるだけでは、地名に出ない記号は踏めない。
 *
 * **ただしラテンとかなだけ。**キリル・ギリシャ・タイ・アラビアの地域を切り出す人には
 * `--all` が要る。**黙って足りないことにしない**ので、`missingRanges` で数える。
 */

/** 配っている側のフォント名。**スタイル 6 枚とも `text-font` はこれ 1 つ**（実測） */
export const FONT = "Noto Sans Regular";

/** 1 ファイルが受け持つ符号位置の幅。MapLibre が決めている値 */
const RANGE_SIZE = 256;

/** 符号位置の上限（Unicode の範囲）。256 範囲でここまで覆う */
const MAX_CODEPOINT = 65535;

/**
 * 既定で配る範囲の開始位置。
 *
 * **どれも実測で要ることが分かっているものだけ**を入れている。
 *
 * | 開始 | 中身 | 要る理由 |
 * | --- | --- | --- |
 * | 0 | 基本ラテン・記号・数字 | すべての地図。帰属表示も |
 * | 256 | ラテン拡張 A | ヨーロッパ言語 |
 * | 512 | ラテン拡張 B | 同上 |
 * | 768 | 結合記号 | 分解表記の濁点類 |
 * | 7680 | ラテン拡張追加 | **ベトナム語**（`ế` `ộ` `ữ`）。ハノイで実際に使う |
 * | 8192 | 一般句読点 | `—` `’` `…`。地名に混ざる
 * | 8448 | 文字様記号・矢印 | **`→`**。経路の案内と、注記に混ざる（2026-10-15 に本番で 404 を実測） |
 */
export const DEFAULT_STARTS = [0, 256, 512, 768, 7680, 8192, 8448] as const;

/** `0-255` のような、MapLibre が要求するファイル名（拡張子なし） */
export function rangeName(start: number): string {
  if (!Number.isInteger(start) || start < 0 || start % RANGE_SIZE !== 0) {
    // 黙って丸めない。**ずれた範囲名は 404 になり、その字だけ出なくなる**
    throw new Error(`範囲の開始は ${RANGE_SIZE} の倍数で指定してください: ${start}`);
  }
  return `${start}-${start + RANGE_SIZE - 1}`;
}

/**
 * 配る範囲の一覧。
 *
 * @param all `true` なら 256 範囲すべて（**5.95 MB**）。
 *   キリル・タイ・アラビアなどを含む地域を切り出す人に要る
 */
export function plannedRanges(all = false): string[] {
  if (!all) return DEFAULT_STARTS.map(rangeName);

  const starts: number[] = [];
  for (let start = 0; start <= MAX_CODEPOINT; start += RANGE_SIZE) starts.push(start);
  return starts.map(rangeName);
}

/** 上流でその範囲が置いてある場所 */
export function assetUrl(range: string, font = FONT): string {
  const base = "https://raw.githubusercontent.com/protomaps/basemaps-assets/main/fonts";
  return `${base}/${encodeURIComponent(font)}/${range}.pbf`;
}

/**
 * 置けたものと、置くはずだったものを突き合わせる。
 *
 * **途中で落ちた取得を、成功として通さない。**1 範囲欠けただけでも、
 * **その字が含まれるラベルだけが消える**——地図は出るので、見ても気づきにくい。
 *
 * @returns 欠けている範囲名。空なら揃っている
 */
export function missingRanges(planned: readonly string[], present: readonly string[]): string[] {
  const have = new Set(present);
  return planned.filter((range) => !have.has(range));
}

/**
 * 置いたものの大きさを、人が判断できる形にする。
 *
 * **バイト数だけでは判断できない。**何が入っていて何が入っていないかまで書く。
 */
export function sizeReport(bytes: number, count: number): string {
  const kb = (bytes / 1024).toFixed(1);
  return (
    `${count} 範囲 / ${kb} KB — 通信が無くてもラベルが出ます。` +
    "漢字・かな・ハングルは閲覧側のフォントで描くので、ここには入っていません。"
  );
}

/**
 * 閲覧側のフォントで描かれる符号位置か。**配る必要がない字。**
 *
 * MapLibre の `localIdeographFontFamily` が受け持つ帯。グリフに CJK を入れていないのは、
 * ここが閲覧側で描かれるから（この判断は {@link FONT} の節に書いた）。
 *
 * @param codepoint 符号位置
 */
export function isLocallyRendered(codepoint: number): boolean {
  return (
    (codepoint >= 0x30_00 && codepoint <= 0x30_3f) || // CJK の約物
    (codepoint >= 0x30_40 && codepoint <= 0x30_ff) || // かな
    (codepoint >= 0x4e_00 && codepoint <= 0x9f_ff) || // 漢字
    (codepoint >= 0xac_00 && codepoint <= 0xd7_af) || // ハングル
    (codepoint >= 0xff_00 && codepoint <= 0xff_ef) // 全角・半角
  );
}

/**
 * 配っている範囲で描けない符号位置を返す。**空なら足りている。**
 *
 * **0 件を「見ていない」と区別するため、呼ぶ側は入力の文字数も数えること。**
 *
 * @param text 地図のラベルになる文字列
 * @param starts 配る範囲の開始位置（{@link plannedRanges} に渡すもの）
 */
export function uncoveredCodepoints(text: string, starts: readonly number[]): number[] {
  const covered = new Set(starts);
  const found = new Set<number>();
  for (const character of text) {
    const codepoint = character.codePointAt(0);
    if (codepoint === undefined) continue;
    if (codepoint <= 0x1f || isLocallyRendered(codepoint)) continue;
    if (codepoint > MAX_CODEPOINT) continue; // 面外は別の話（絵文字など）
    const start = Math.floor(codepoint / RANGE_SIZE) * RANGE_SIZE;
    if (!covered.has(start)) found.add(codepoint);
  }
  return [...found].sort((a, b) => a - b);
}
