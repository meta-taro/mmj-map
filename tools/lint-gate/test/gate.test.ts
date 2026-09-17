import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * **ゲートが止まることを確かめるテスト。**
 *
 * oxlint の既定は severity=warning で、**違反を報告しながら終了コード 0 を返す**。
 * 実測（1.83.0）: 重複キーと debugger を報告して EXIT=0。
 * 設定を取り違えたまま hook と CI へ置くと、赤が出ない lint が延々と回り続け、
 * 「lint は通っている」と読まれる。それを防ぐのがここ。
 *
 * fixture はリポジトリの中に置かない。置くと `pnpm lint` 自身が
 * その fixture を拾って落ちるため、**わざと壊したコードを ignore する**という
 * 逆向きの設定が要る。一時ディレクトリへ書けば、その矛盾が起きない。
 */

const packageRoot = resolve(fileURLToPath(import.meta.url), "../..");
const repoRoot = resolve(packageRoot, "../..");
const configPath = join(repoRoot, ".oxlintrc.json");
const oxlintBin = join(repoRoot, "node_modules", "oxlint", "bin", "oxlint");

let workDir: string;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), "mmj-lint-gate-"));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/** 一時ファイルへ書いて、本物の設定で oxlint を当てる */
function lint(name: string, source: string): { status: number; output: string } {
  const file = join(workDir, name);
  writeFileSync(file, source, "utf8");

  // bin は `import "../dist/cli.js"` だけの Node スクリプトなので、
  // .cmd / .ps1 の差を踏まずに process.execPath から直接呼べる（Windows と Linux の両方で動く）
  const run = spawnSync(
    process.execPath,
    [oxlintBin, "--config", configPath, "--deny-warnings", "--disable-nested-config", file],
    { encoding: "utf8" },
  );

  if (run.error !== undefined) throw run.error;
  return { status: run.status ?? -1, output: `${run.stdout}${run.stderr}` };
}

describe("lint のゲート", () => {
  it("oxlint の実体と設定がある（無ければゲートは存在しない）", () => {
    expect(existsSync(oxlintBin), `${oxlintBin} がありません。pnpm install を先に`).toBe(true);
    expect(existsSync(configPath), `${configPath} がありません`).toBe(true);
  });

  it("**違反があれば非 0 で終わる。**ここが 0 に戻ったらゲートは死んでいる", () => {
    const { status, output } = lint("violates.ts", "export const o = { a: 1, a: 2 };\n");

    expect(status).not.toBe(0);
    expect(output).toContain("no-dupe-keys");
  });

  it("**severity が error になっている**（warning のままだと報告しても素通りする）", () => {
    const { output } = lint("severity.ts", "export const o = { a: 1, a: 2 };\n");

    expect(output).toContain("error");
    expect(output).not.toContain("warning eslint(no-dupe-keys)");
  });

  it("使われていない変数を止める（実際にこれで 2 件見つかった）", () => {
    const { status, output } = lint("unused.ts", "export function f() {\n  const unused = 1;\n  return 2;\n}\n");

    expect(status).not.toBe(0);
    expect(output).toContain("no-unused-vars");
  });

  it("きれいなコードでは 0 で終わる（常時赤のゲートは読まれなくなる）", () => {
    const { status } = lint("clean.ts", "export const add = (a: number, b: number): number => a + b;\n");

    expect(status).toBe(0);
  });

  it("意図して切ったルールが、黙って復活していない（D-015 の理由ごと見直すこと）", () => {
    const awaitInLoop = lint(
      "await-in-loop.ts",
      "export async function f(xs: number[]): Promise<void> {\n" +
        "  for (const x of xs) await Promise.resolve(x);\n" +
        "}\n",
    );
    expect(awaitInLoop.status, awaitInLoop.output).toBe(0);

    const arraySort = lint(
      "array-sort.ts",
      "export const sorted = (xs: number[]): number[] => [...xs].sort((a, b) => a - b);\n",
    );
    expect(arraySort.status, arraySort.output).toBe(0);
  });
});
