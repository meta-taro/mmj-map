import { describe, expect, it } from "vitest";

import { SNIPPET, buildIndex, type IndexInput } from "../src/content.js";

const input: IndexInput = {
  site: "https://example.github.io/mmj-map/",
  links: [
    { section: "はじめに", title: "入れ方", path: "install/ja.html", note: "3 分で地図が出るまで" },
    { section: "見本", title: "店舗地図", path: "shops.html", note: "決済タブ・独自アイコン" },
  ],
  attributes: ["3d", "center", "style-url", "tiles", "zoom"],
};

describe("buildIndex", () => {
  /** llmstxt.org の体裁: H1 → 引用の一文 → `## 節` の下にリンクの箇条書き */
  it("H1 と、一文の要約から始まる", () => {
    const lines = buildIndex(input).split("\n");
    expect(lines[0]).toBe("# MMJ (mmj-map)");
    expect(lines[2]?.startsWith("> ")).toBe(true);
  });

  it("節ごとに、絶対 URL のリンクを並べる", () => {
    const got = buildIndex(input);
    expect(got).toContain("## はじめに");
    expect(got).toContain("- [入れ方](https://example.github.io/mmj-map/install/ja.html): 3 分で地図が出るまで");
  });

  /** **相対リンクにしない。**エージェントは全文を別の場所へ写して読む */
  it("相対リンクを残さない", () => {
    expect(buildIndex(input)).not.toContain("](install/");
  });

  /**
   * **ここが本題。**エージェントは最初に見た例をそのまま写すので、
   * **写して動くもの**を 1 つ置く（属性の一覧だけでは、組み立て方が伝わらない）。
   */
  it("写して動く見本を含める", () => {
    const got = buildIndex(input);
    expect(got).toContain("<mmj-map");
    expect(got).toContain(SNIPPET.trim().split("\n")[0]);
  });

  /** 属性の全文は別ファイル（1 回の取得で足りるように、場所を明示する） */
  it("属性の全文の在り処を書く", () => {
    expect(buildIndex(input)).toContain("llms-full.txt");
  });

  it("属性の数を書く（**何件あるかで、読む前に見積もれる**）", () => {
    expect(buildIndex(input)).toContain("5 件");
  });

  /** **末尾に改行。**連結されたときに行が溶けない */
  it("改行で終わる", () => {
    expect(buildIndex(input).endsWith("\n")).toBe(true);
  });

  /** 同じ入力なら同じ出力（生成物を commit して差分を見るため） */
  it("同じ入力から同じ結果を作る", () => {
    expect(buildIndex(input)).toBe(buildIndex(input));
  });
});
