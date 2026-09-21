/**
 * 検査するスタイルを選ぶ。**ここは純粋関数**（ディレクトリの読み出しは cli.ts）。
 *
 * 既定を 1 枚に固定していると、スタイルを足した人が検査対象へ入れ忘れる。
 * **入れ忘れても CI は緑**なので、誰も気づけない。だから既定は「全部」。
 */

/** スタイルの置き場所。正本はここ 1 か所（D-002） */
export const STYLE_DIR = "styles";

/**
 * ディレクトリの中身から、検査するスタイルのパスを選ぶ。
 * @param entries `styles/` 直下のファイル名
 */
export function pickStyleFiles(entries: readonly string[]): string[] {
  const found = entries
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => `${STYLE_DIR}/${name}`);
  if (found.length === 0) {
    // 黙って 0 件で通さない（検査対象が消えたことに気づけなくなる）
    throw new Error(`検査するスタイルが 1 つもありません: ${STYLE_DIR}/`);
  }
  return found;
}
