/**
 * **AI が読む素材が揃っているか**を見る。**純粋関数。**
 *
 * ## なぜこれが要るか
 *
 * 2026-10-10 に測ったら（`docs/pdca.md` の AEO / GEO）、MMJ は
 *
 * - **名前で引けば**、AI は README の中身まで正確に要約した
 * - **問題の言い方で引くと**（「タイルサーバー無しの地図」「API キー不要」）候補に入らない
 * - 名前つきの要約でも、**先に出るのは制約だった**（「タイルは同梱しない」「日本語グリフが無い」）
 *
 * 3 つ目の原因は、**制約の節が使いどころより前にあった**こと。
 * 正直に書いた制約が、そのまま要約の主役になっていた。
 *
 * ## ここで見るもの・見ないもの
 *
 * **見ない**: 「AI に見つかるか」そのもの。相手の中身も時期も変わるので、
 * **人が引いて記録して、日を置いて比べる**しかない（`.claude/aeo/<日付>.md`）。
 *
 * **見る**: 素材が揃っているか。**これは落ちる検査にできる。**
 *
 * ## 印は、人が読む文と分ける
 *
 * 節の見出しを `grep` で探すと、**言い回しを直した日に黙って外れる**。
 * だから見出しではなく `<!-- aeo:use-cases -->` という印を探す。
 * 印を動かすと落ちるので、**制約の節より前にある**ことが保たれる。
 */

/** 使いどころの節に置く印。**見出しの文ではなくこれを探す**（言い回しを変えても外れない） */
export const USE_CASE_MARKER = "<!-- aeo:use-cases";

/**
 * npm の `keywords` に必ず入れる、**問題の言い方**。
 *
 * 実装の名前（`maplibre` / `pmtiles`）だけだと、**それを知っている人にしか届かない**。
 * 探している人は「鍵が要らない地図」「自前で持てる地図」と言う。
 *
 * **増やすのは人の判断。**ここを削って通すのは禁止（削るなら、測り直してから）。
 */
export const REQUIRED_KEYWORDS: readonly string[] = [
  "self-hosted",
  "offline-map",
  "no-api-key",
  "vector-tiles",
  "custom-elements",
];

/** `description` の下限。これを割ると、検索結果でもモデルの要約でも何も言えていない */
const DESCRIPTION_MIN = 60;

/** `description` の上限。npm の一覧も検索結果も、この辺りで切る */
const DESCRIPTION_MAX = 200;

/** package.json のうち、ここで見るところだけ */
export type PackageMaterials = {
  readonly description?: unknown;
  readonly keywords?: unknown;
};

/**
 * npm に出る `description` と `keywords` を見る。
 *
 * @param pkg package.json を読んだもの
 * @returns 問題の説明。**空なら合格**
 */
export function checkPackageMaterials(pkg: PackageMaterials): string[] {
  const problems: string[] = [];

  const description = typeof pkg.description === "string" ? pkg.description.trim() : "";
  if (description === "") {
    problems.push("description が空です（npm の一覧と AI の要約がここを拾います）");
  } else if (description.length < DESCRIPTION_MIN) {
    problems.push(
      `description が ${description.length} 字です（${DESCRIPTION_MIN} 字以上。何に使うものかが言えていません）`,
    );
  } else if (description.length > DESCRIPTION_MAX) {
    problems.push(`description が ${description.length} 字です（${DESCRIPTION_MAX} 字まで。この先は切られます）`);
  }

  const keywords = Array.isArray(pkg.keywords) ? pkg.keywords.filter((k) => typeof k === "string") : [];
  const have = new Set(keywords.map((k) => k.toLowerCase()));
  for (const want of REQUIRED_KEYWORDS) {
    if (!have.has(want)) {
      problems.push(`keywords に ${want} がありません（実装の名前だけでは、問題で探している人に届きません）`);
    }
  }

  return problems;
}

/**
 * 使いどころが、**最初の節**として出ているかを見る。
 *
 * 印より前に `##` / `###` があったら落とす——**制約の節が前に出た**ということなので。
 *
 * @param markdown README の全文
 * @returns 問題の説明。**空なら合格**
 */
export function checkUseCaseFirst(markdown: string): string[] {
  const lines = markdown.split("\n");
  const markerAt = lines.findIndex((line) => line.includes(USE_CASE_MARKER));
  if (markerAt < 0) {
    return [`使いどころの印（${USE_CASE_MARKER} ...）がありません`];
  }

  const headingAt = lines.findIndex((line) => /^#{2,3} /.test(line));
  if (headingAt >= 0 && headingAt < markerAt) {
    return [
      `使いどころの印より前に節があります（${headingAt + 1} 行目「${lines[headingAt]?.trim() ?? ""}」）——` +
        "AI の要約は前にあるものを拾うので、使いどころを最初の節にしてください",
    ];
  }

  return [];
}
