import { describe, expect, it } from "vitest";

import { structuredDataProblems } from "../src/structured.js";

/** 構造化データを 1 つ持つ頁を組む */
function page(jsonLd: string, body: string): string {
  return `<!doctype html><html><head><script type="application/ld+json">${jsonLd}</script></head><body>${body}</body></html>`;
}

const FAQ = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "API キーは要りますか。",
      acceptedAnswer: { "@type": "Answer", text: "要りません。地図サーバーもありません。" },
    },
  ],
});

describe("structuredDataProblems", () => {
  it("画面と同じ質問と答えなら咎めない", () => {
    const html = page(FAQ, "<ul><li><strong>API キーは要りますか。</strong>\n  要りません。地図サーバーもありません</li></ul>");
    expect(structuredDataProblems(html)).toEqual([]);
  });

  it("答えの中のタグと改行は、画面の文として読む", () => {
    const html = page(
      FAQ,
      "<li><strong>API キーは要りますか。</strong>要りません。<a href='#'>地図サーバー</a>も\n        ありません</li>",
    );
    expect(structuredDataProblems(html)).toEqual([]);
  });

  it("JSON として読めない構造化データを拾う", () => {
    const found = structuredDataProblems(page("{ \"@type\": \"FAQPage\", }", ""));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("JSON");
  });

  it("schema.org を指していないものを拾う", () => {
    const html = page(JSON.stringify({ "@context": "https://example.com", "@type": "Thing" }), "");
    expect(structuredDataProblems(html)[0]).toContain("schema.org");
  });

  it("画面に出ていない質問を拾う（構造化データにだけ書いた答えは、検索の規約に反する）", () => {
    const html = page(FAQ, "<li><strong>料金は要りますか。</strong>要りません。地図サーバーもありません</li>");
    const found = structuredDataProblems(html);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("API キーは要りますか。");
  });

  it("画面と食い違う答えを拾う", () => {
    const html = page(FAQ, "<li><strong>API キーは要りますか。</strong>要ります</li>");
    expect(structuredDataProblems(html)[0]).toContain("答え");
  });

  it("質問の無い FAQPage を拾う（空の箱を出さない）", () => {
    const empty = JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [] });
    expect(structuredDataProblems(page(empty, ""))[0]).toContain("質問");
  });

  it("構造化データの無い頁は咎めない", () => {
    expect(structuredDataProblems("<html><body>地図</body></html>")).toEqual([]);
  });
});
