/**
 * `.github/scripts/oss-privacy-check.sh` を実物のまま走らせるための足場。
 *
 * **スクリプトを写した別実装をテストしない。** CI が動かすのと同じファイルを、
 * 使い捨ての git リポジトリの上で動かす。写した実装を試すと、
 * 「テストは通るのに CI は落ちる」が起きる。
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const SCRIPT = join(repoRoot, ".github/scripts/oss-privacy-check.sh");

export interface Fixture {
  readonly dir: string;
  /** ファイルを置いて commit する。戻り値は commit の SHA */
  commit(message: string, files: Readonly<Record<string, string>>, author?: string): string;
  /** commit せずに作業ツリーへ置く */
  write(path: string, body: string): void;
  cleanup(): void;
}

function git(dir: string, args: readonly string[], env?: Record<string, string>): string {
  return execFileSync("git", args, {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, ...env },
  }).trim();
}

export function makeRepo(): Fixture {
  const dir = mkdtempSync(join(tmpdir(), "mmj-privacy-"));
  git(dir, ["init", "-q", "-b", "develop"]);
  git(dir, ["config", "user.name", "tester"]);
  git(dir, ["config", "user.email", "1+tester@users.noreply.github.com"]);
  // 署名や hook を持ち込まない。手元の設定でテストの結果が変わらないようにする
  git(dir, ["config", "commit.gpgsign", "false"]);

  const write = (path: string, body: string): void => {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body, "utf8");
  };

  return {
    dir,
    write,
    commit(message, files, author) {
      for (const [path, body] of Object.entries(files)) write(path, body);
      git(dir, ["add", "-A"]);
      const env = author === undefined ? undefined : { GIT_AUTHOR_EMAIL: author, GIT_COMMITTER_EMAIL: author };
      git(dir, ["commit", "-q", "-m", message], env);
      return git(dir, ["rev-parse", "HEAD"]);
    },
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export interface RunResult {
  readonly status: number;
  readonly output: string;
  readonly ms: number;
}

/** 実物のスクリプトを走らせる。stderr へ出る設計なので両方まとめて見る */
export function runCheck(
  fixture: Fixture,
  args: readonly string[] = [],
  env: Readonly<Record<string, string>> = {},
): RunResult {
  const started = Date.now();
  const r = spawnSync("bash", [SCRIPT, ...args], {
    cwd: fixture.dir,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return {
    status: r.status ?? -1,
    output: `${r.stdout ?? ""}${r.stderr ?? ""}`,
    ms: Date.now() - started,
  };
}
