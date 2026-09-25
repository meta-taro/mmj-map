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
 * ハングルの 4 地域を描いて、**404 は 0 件**、記号も欠けなかった
 * （`Hà Nội` / `Cửa Nam` / `Văn Miếu - Quốc Tử Giám` / `서울특별시` まで出る）。
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
 * | 8192 | 一般句読点 | `—` `’` `…`。地名に混ざる |
 */
const DEFAULT_STARTS = [0, 256, 512, 768, 7680, 8192] as const;

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
