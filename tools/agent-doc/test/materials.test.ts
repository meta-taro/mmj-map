import { describe, expect, it } from "vitest";

import { REQUIRED_KEYWORDS, USE_CASE_MARKER, checkPackageMaterials, checkUseCaseFirst } from "../src/materials.js";

/**
 * **AI が読む素材の検査。**
 *
 * 「AI に見つかるか」は機械に落とせない（相手の中身も時期も変わる）。
 * **落とせるのは素材が揃っているかまで**で、ここはそれだけを見る。
 */

/** 合格する最小の package.json */
const ok = {
  description:
    "Self-hosted web map as Web Components: a real map on a page with plain HTML. No API key, no tile server.",
  keywords: [...REQUIRED_KEYWORDS, "map"],
};

describe("checkPackageMaterials", () => {
  it("description と問題の言い方が揃っていれば、何も言わない", () => {
    expect(checkPackageMaterials(ok)).toEqual([]);
  });

  it("description が無ければ落ちる", () => {
    const problems = checkPackageMaterials({ ...ok, description: undefined });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("description が空です");
  });

  /** **短い説明は、無いのと同じ。**検索結果にもモデルの要約にも何も残らない */
  it("description が短すぎると落ちる", () => {
    const problems = checkPackageMaterials({ ...ok, description: "A map." });
    expect(problems[0]).toContain("60 字以上");
  });

  /** 切られる長さまで書くと、**後ろに置いた使いどころが消える** */
  it("description が長すぎると落ちる", () => {
    const problems = checkPackageMaterials({ ...ok, description: "a".repeat(201) });
    expect(problems[0]).toContain("200 字まで");
  });

  /**
   * **これが本題。**実装の名前だけ並べた keywords は、
   * **それを知っている人にしか届かない**（2026-10-10 に実測）。
   */
  it("実装の名前だけの keywords は落ちる", () => {
    const problems = checkPackageMaterials({
      ...ok,
      keywords: ["map", "maplibre", "pmtiles", "web-components", "protomaps", "openstreetmap", "mmj"],
    });
    // 揃っていないものが 1 件ずつ出る（**どれが足りないかを言う**）
    expect(problems).toHaveLength(REQUIRED_KEYWORDS.length);
    expect(problems.join("\n")).toContain("self-hosted");
    expect(problems.join("\n")).toContain("no-api-key");
  });

  it("keywords が無い・配列でないときも落ちる", () => {
    expect(checkPackageMaterials({ ...ok, keywords: undefined })).toHaveLength(REQUIRED_KEYWORDS.length);
    expect(checkPackageMaterials({ ...ok, keywords: "self-hosted" })).toHaveLength(REQUIRED_KEYWORDS.length);
  });

  it("大文字で書かれていても、同じものと見る", () => {
    expect(checkPackageMaterials({ ...ok, keywords: REQUIRED_KEYWORDS.map((k) => k.toUpperCase()) })).toEqual([]);
  });
});

describe("checkUseCaseFirst", () => {
  it("印が最初の節の前にあれば、何も言わない", () => {
    const markdown = ["# @mmj-map/elements", "", "一行の説明。", "", `${USE_CASE_MARKER} -->`, "## 使いどころ", ""].join(
      "\n",
    );
    expect(checkUseCaseFirst(markdown)).toEqual([]);
  });

  it("印が無ければ落ちる", () => {
    const problems = checkUseCaseFirst("# 見出し\n\n## 制約\n");
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("印");
  });

  /**
   * **2026-10-10 に実際にこうなっていた。**npm の README の最初の節が
   * 「You host the data. This package only draws it.」で、
   * **AI の要約もそこから始まっていた。**
   */
  it("制約の節が印より前にあると落ちる", () => {
    const markdown = [
      "# @mmj-map/elements",
      "",
      "## You host the data. This package only draws it.",
      "",
      `${USE_CASE_MARKER} -->`,
      "## When this is the right tool",
    ].join("\n");
    const problems = checkUseCaseFirst(markdown);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("3 行目");
    expect(problems[0]).toContain("You host the data");
  });

  /** `###` でも同じ。**ja の README は `###` から始まっていた** */
  it("### の節でも、印より前にあれば落ちる", () => {
    const markdown = ["# 見出し", "", "### どこに何があるか", "", `${USE_CASE_MARKER} -->`].join("\n");
    expect(checkUseCaseFirst(markdown)[0]).toContain("どこに何があるか");
  });

  /** H1 は節ではない。**題なので、前にあって当たり前** */
  it("H1 は節と見ない", () => {
    expect(checkUseCaseFirst(`# 題\n\n${USE_CASE_MARKER} -->\n## 使いどころ\n`)).toEqual([]);
  });
});
