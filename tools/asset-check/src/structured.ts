/**
 * 頁の構造化データ（JSON-LD）を検める。純粋関数。
 *
 * ## 何を止めるか
 *
 * - **JSON として読めないもの。**検索も AI も黙って捨てるので、壊れても誰も気づかない
 * - **schema.org を指していないもの。**読む側が型を引けない
 * - **画面に出ていない「よくある質問」。**構造化データにだけ書いた答えは
 *   検索の規約に反する。LP の質問を直したとき、片方だけ直すとこれになる
 *
 * 2026-11-09 に LP へ FAQPage を入れたとき、画面との一致は手で 1 回見ただけだった。
 * 次に質問を直した日にずれても、緑のまま出てしまうので、検査にした。
 */

/** 頁の中の JSON-LD の中身（文字列のまま） */
function jsonLdBlocks(html: string): string[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1] ?? "");
}

/** 空白を詰める */
function squash(text: string): string {
  return text.replace(/\s+/g, "");
}

/**
 * 画面に出る文。タグを外し、**空白をすべて詰める**。
 *
 * HTML の改行と字下げは画面では詰まって見え、JSON の側には入らない。
 * 日本語は語の間に空白を置かないので、詰めて比べても取り違えない。
 */
function visibleText(html: string): string {
  return squash(
    html
      .replace(/<script[\s\S]*?<\/script>/g, "")
      .replace(/<style[\s\S]*?<\/style>/g, "")
      .replace(/<[^>]+>/g, "")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&quot;", '"')
      .replaceAll("&amp;", "&"),
  );
}

/**
 * 答えの比べ方。**画面の箇条は文末の句点を落とす**書き方なので、JSON の側も落として比べる。
 * @param text 構造化データの答え
 */
function answerBody(text: string): string {
  return squash(text).replace(/。$/, "");
}

type Question = { name?: unknown; acceptedAnswer?: { text?: unknown } };

/**
 * FAQPage の質問と答えが、画面に出ているかを見る。
 * @param data JSON-LD 1 つ
 * @param shown 画面に出る文（空白を詰めたもの）
 */
function faqProblems(data: { mainEntity?: unknown }, shown: string): string[] {
  const questions = Array.isArray(data.mainEntity) ? (data.mainEntity as Question[]) : [];
  if (questions.length === 0) return ["FAQPage に質問が 1 つもありません（空の箱を出さない）"];

  const problems: string[] = [];
  for (const q of questions) {
    const name = typeof q.name === "string" ? q.name : "";
    const answer = typeof q.acceptedAnswer?.text === "string" ? q.acceptedAnswer.text : "";
    if (!shown.includes(squash(name))) {
      problems.push(`画面に出ていない質問があります: ${name}`);
      continue;
    }
    if (answer === "" || !shown.includes(answerBody(answer))) {
      problems.push(`画面と違う答えがあります: ${name}`);
    }
  }
  return problems;
}

/**
 * 頁の構造化データの問題を並べる。無ければ空の配列。
 * @param html 頁の全文
 */
export function structuredDataProblems(html: string): string[] {
  const shown = visibleText(html);
  const problems: string[] = [];

  for (const raw of jsonLdBlocks(html)) {
    let data: { "@context"?: unknown; "@type"?: unknown; mainEntity?: unknown };
    try {
      data = JSON.parse(raw) as typeof data;
    } catch (error) {
      problems.push(`構造化データが JSON として読めません: ${(error as Error).message}`);
      continue;
    }
    if (typeof data["@context"] !== "string" || !data["@context"].startsWith("https://schema.org")) {
      problems.push(`構造化データが schema.org を指していません（@context: ${String(data["@context"])}）`);
      continue;
    }
    if (data["@type"] === "FAQPage") problems.push(...faqProblems(data, shown));
  }
  return problems;
}
