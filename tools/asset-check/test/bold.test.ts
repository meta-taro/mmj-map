import { describe, expect, it } from "vitest";

import { brokenBold } from "../src/bold.js";

/**
 * 期待値は GitHub の CommonMark で実測してある（2026-10-07）。
 *
 *   **ふつうの強調**です            → 太字になる
 *   **句点で終わる。**直後に文字    → ** がそのまま出る
 *   **句点で終わる。** 直後に空白   → 太字になる
 */
describe("brokenBold", () => {
  it("句点の直後で閉じ、すぐ文字が続くものを拾う", () => {
    const found = brokenBold("**句点で終わる。**直後に文字");
    expect(found).toHaveLength(1);
    expect(found[0]?.text).toContain("句点で終わる");
  });

  it("読点・閉じ括弧でも同じ", () => {
    expect(brokenBold("**読点で終わる、**つづき")).toHaveLength(1);
    expect(brokenBold("**かっこで終わる）**つづき")).toHaveLength(1);
  });

  it("句読点が外にあれば咎めない（これが直したあとの形）", () => {
    expect(brokenBold("**句点は外**。つづき")).toEqual([]);
  });

  it("閉じの直後が空白・行末なら咎めない（そのままで太字になる）", () => {
    expect(brokenBold("**句点で終わる。** 直後に空白")).toEqual([]);
    expect(brokenBold("**句点で終わる。**")).toEqual([]);
  });

  it("ふつうの強調は咎めない", () => {
    expect(brokenBold("**ふつうの強調**です")).toEqual([]);
  });

  // 閉じと、次の開きを 1 組と読み違えない。最初の実装がこれで文を壊した
  it("連続する 2 つの太字を、1 つの太字と読み違えない", () => {
    expect(brokenBold("**前半**。あいだの文、**後半**です")).toEqual([]);
  });

  // 書き方の説明そのものを咎めると、この文書が書けなくなる
  it("`code` の中は見ない", () => {
    expect(brokenBold("崩れる例は `**文。**つづき` です")).toEqual([]);
  });

  it("囲みの中も見ない", () => {
    expect(brokenBold(["前の文。", "```md", "**文。**つづき", "```", "後の文。"].join("\n"))).toEqual([]);
  });

  it("** の数が合わないファイルは触らない（組にできないため）", () => {
    expect(brokenBold("**閉じ忘れた。つづき")).toEqual([]);
  });

  it("問題が無ければ空", () => {
    expect(brokenBold("ただの文。太字はありません。")).toEqual([]);
  });
});
