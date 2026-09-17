/**
 * 公開リポの個人情報混入チェックの振る舞いを固定する。
 *
 * このスクリプトには **これまでテストが 1 つも無かった**。
 * 手で赤→緑を見ただけで、規則を変えたときに何が壊れるか分からない状態だった。
 */
import { afterEach, describe, expect, it } from "vitest";
import { makeRepo, runCheck, type Fixture } from "./helpers.js";

let repo: Fixture | null = null;
const fresh = (): Fixture => {
  repo = makeRepo();
  return repo;
};
afterEach(() => {
  repo?.cleanup();
  repo = null;
});

const PERSONAL = ["yamada", "taro", "@", "example-corp", ".co.jp"].join("");

describe("追加行の検査", () => {
  it("個人のメールが入った行を足したら落ちる", () => {
    const f = fresh();
    const base = f.commit("init", { "README.md": "hello\n" });
    const head = f.commit("add contact", { "docs/contact.md": `連絡先: ${PERSONAL}\n` });

    const r = runCheck(f, [base, head]);
    expect(r.status).toBe(1);
    expect(r.output).toContain("[added-email]");
    expect(r.output).toContain("docs/contact.md");
  });

  it("許可ドメインは通す", () => {
    const f = fresh();
    const base = f.commit("init", { "README.md": "hello\n" });
    const head = f.commit("add examples", {
      "docs/a.md": "user@example.com\n1+someone@users.noreply.github.com\n",
    });

    const r = runCheck(f, [base, head]);
    expect(r.status).toBe(0);
  });

  it("生成ツールの no-reply はアドレス完全一致で通す（b7b9965 の回帰）", () => {
    const f = fresh();
    const base = f.commit("init", { "README.md": "hello\n" });
    const head = f.commit("trailer", { "docs/a.md": "Co-Authored-By: Someone <noreply@anthropic.com>\n" });

    expect(runCheck(f, [base, head]).status).toBe(0);
  });

  it("同じ組織の個人アドレスまでは通さない（ドメイン許可にしていないこと）", () => {
    const f = fresh();
    const base = f.commit("init", { "README.md": "hello\n" });
    // このテストデータ自体が検査に引っかかるため、リテラルでは書かない
    const head = f.commit("person", { "docs/a.md": `${["someone.real", "anthropic.com"].join("@")}\n` });

    expect(runCheck(f, [base, head]).status).toBe(1);
  });

  it("バージョン付きパッケージ名をメールと誤検出しない", () => {
    // `maplibre-gl@5.24.0/dist` や `mocker@5.0.0(vite` は CDN の URL と
    // pnpm-lock.yaml に山ほど出る。ここを誤検出すると**検査が信用されなくなり、
    // 本物の混入も無視されるようになる**。
    const f = fresh();
    const base = f.commit("init", { "README.md": "hello\n" });
    const head = f.commit("deps", {
      "docs/a.md": "maplibre-gl@5.24.0/dist/maplibre-gl.js\nmocker@5.0.0(vite)\nfdir@6.5.0(picomatch)\n",
    });

    const r = runCheck(f, [base, head]);
    expect(r.output).not.toContain("[added-email]");
    expect(r.status).toBe(0);
  });

  it("検査スクリプト自身は対象外（正規表現の例で自爆しない）", () => {
    const f = fresh();
    const base = f.commit("init", { "README.md": "hello\n" });
    const head = f.commit("script", {
      ".github/scripts/oss-privacy-check.sh": `# 例: ${PERSONAL}\n`,
    });

    expect(runCheck(f, [base, head]).status).toBe(0);
  });

  it("未 commit の作業ツリーも見る（commit 前に止められる）", () => {
    const f = fresh();
    f.commit("init", { "README.md": "hello\n" });
    f.write("docs/draft.md", `${PERSONAL}\n`);

    expect(runCheck(f).status).toBe(1);
  });
});

describe("commit 自体の検査", () => {
  it("commit message に個人メールがあれば落ちる", () => {
    const f = fresh();
    const base = f.commit("init", { "README.md": "hello\n" });
    const head = f.commit(`連絡は ${PERSONAL} へ`, { "docs/a.md": "ok\n" });

    const r = runCheck(f, [base, head]);
    expect(r.status).toBe(1);
    expect(r.output).toContain("[message-email]");
  });

  it("author が noreply でなければ落ちる", () => {
    const f = fresh();
    const base = f.commit("init", { "README.md": "hello\n" });
    const head = f.commit("work", { "docs/a.md": "ok\n" }, PERSONAL);

    const r = runCheck(f, [base, head]);
    expect(r.status).toBe(1);
    expect(r.output).toContain("[author-email]");
  });
});

describe("禁止語", () => {
  it("OSS_DENY_WORDS に一致する追加行で落ちる", () => {
    const f = fresh();
    const base = f.commit("init", { "README.md": "hello\n" });
    const head = f.commit("case", { "docs/a.md": "社内の 甲社案件 について\n" });

    const r = runCheck(f, [base, head], { OSS_DENY_WORDS: "甲社案件" });
    expect(r.status).toBe(1);
    expect(r.output).toContain("[added-denyword]");
  });

  it("未設定なら禁止語検査はスキップされ、その旨が出る", () => {
    const f = fresh();
    const base = f.commit("init", { "README.md": "hello\n" });
    const head = f.commit("case", { "docs/a.md": "ふつうの文\n" });

    const r = runCheck(f, [base, head], { OSS_DENY_WORDS: "" });
    expect(r.status).toBe(0);
    expect(r.output).toContain("OSS_DENY_WORDS");
  });
});

describe("公開ログへ中身を出さない（設計上の約束）", () => {
  it("検出しても、見つけたメールの原文をログに出さない", () => {
    const f = fresh();
    const base = f.commit("init", { "README.md": "hello\n" });
    const head = f.commit("leak", { "docs/a.md": `${PERSONAL}\n` });

    const r = runCheck(f, [base, head]);
    expect(r.status).toBe(1);
    // CI のログは公開される。ここに原文が出ると、検査自体が漏洩経路になる
    expect(r.output).not.toContain(PERSONAL);
    expect(r.output).toContain("***@***.");
  });

  it("awk の警告を出さない（出力が汚れると本物の NG が埋もれる）", () => {
    const f = fresh();
    const base = f.commit("init", { "README.md": "hello\n" });
    const head = f.commit("ok", { "docs/a.md": "ふつうの文\n" });

    const r = runCheck(f, [base, head]);
    // `awk -v` は値のエスケープを展開するため、正規表現をそのまま渡すと
    // `\.` が `.` に潰れ、警告が出たうえ **パターンが緩くなる**
    expect(r.output).not.toContain("awk:");
    expect(r.output).not.toContain("escape sequence");
  });

  it("禁止語も原文を出さず、何番目に一致したかだけ出す", () => {
    const f = fresh();
    const base = f.commit("init", { "README.md": "hello\n" });
    const head = f.commit("case", { "docs/a.md": "社内の 甲社案件 について\n" });

    const r = runCheck(f, [base, head], { OSS_DENY_WORDS: "甲社案件" });
    expect(r.output).not.toContain("甲社案件");
    expect(r.output).toContain("#1");
  });
});

describe("大きな差分でも終わる", () => {
  // **これが本題。** 1 行ごとに grep を起動する作りだったため、
  // 4242 行の差分に 2 時間以上かかり、commit 前のゲートとして使えなかった。
  // 実測の budget ではなく「明らかに桁が違う」線として 30 秒を置く。
  it("4000 行の追加を 30 秒以内に検査し終える", { timeout: 180_000 }, () => {
    const f = fresh();
    const base = f.commit("init", { "README.md": "hello\n" });
    const big = Array.from({ length: 4000 }, (_, i) => `行 ${i}: ふつうの説明文がここに入る`).join("\n");
    const head = f.commit("big", { "docs/big.md": `${big}\n` });

    const r = runCheck(f, [base, head]);
    expect(r.status).toBe(0);
    expect(r.ms).toBeLessThan(30_000);
  });

  it("大きな差分でも、混入は見落とさない", { timeout: 180_000 }, () => {
    const f = fresh();
    const base = f.commit("init", { "README.md": "hello\n" });
    const lines = Array.from({ length: 4000 }, (_, i) => `行 ${i}: ふつうの説明文`);
    lines[3777] = `担当 ${PERSONAL}`;
    const head = f.commit("big", { "docs/big.md": `${lines.join("\n")}\n` });

    const r = runCheck(f, [base, head]);
    expect(r.status).toBe(1);
    expect(r.output).toContain("[added-email]");
    // 行番号まで出る（どこを直せばよいか分かる）
    expect(r.output).toMatch(/docs\/big\.md:\d+/);
  });
});

// **この行に、検出されるべき文字列をそのまま書かない。**
// 書くと、このテストファイル自身が検査に引っかかって CI が落ちる（追加行を見る検査のため）。
const SEP = String.fromCharCode(92); // Windows の区切り
const WIN_HOME = ["C:", SEP, "Users", SEP, "hanako"].join("");
const MAC_HOME = ["/", "Users", "/", "hanako"].join("");
const LINUX_HOME = ["/", "home", "/", "hanako"].join("");
const CI_HOME = ["/", "home", "/", "runner"].join("");

describe("個人のホームディレクトリのパス", () => {
  it("Windows の個人パスを足したら落ちる（**利用者アカウント名が公開される**）", () => {
    const f = fresh();
    const base = f.commit("init", { "README.md": "hello\n" });
    const head = f.commit("add note", { "docs/env.md": `Node: ${WIN_HOME}${SEP}.local${SEP}node\n` });

    const r = runCheck(f, [base, head]);
    expect(r.status).toBe(1);
    expect(r.output).toContain("[added-homepath]");
    expect(r.output).toContain("docs/env.md");
  });

  it("macOS / Linux の個人パスも落とす", () => {
    const f = fresh();
    const base = f.commit("init", { "README.md": "hello\n" });
    const head = f.commit("add note", { "docs/env.md": `${MAC_HOME}/src\n${LINUX_HOME}/src\n` });

    expect(runCheck(f, [base, head]).status).toBe(1);
  });

  it("**見つけた中身をそのままログへ出さない**（検査自体が漏洩経路にならない）", () => {
    const f = fresh();
    const base = f.commit("init", { "README.md": "hello\n" });
    const head = f.commit("add note", { "docs/env.md": `${WIN_HOME}${SEP}x\n` });

    const r = runCheck(f, [base, head]);
    expect(r.output).not.toContain("hanako");
  });

  it("CI の実行者（runner）は通す。**誰の名前でもない**", () => {
    const f = fresh();
    const base = f.commit("init", { "README.md": "hello\n" });
    const head = f.commit("add ci note", { "docs/ci.md": `${CI_HOME}/work/repo\n` });

    expect(runCheck(f, [base, head]).status).toBe(0);
  });

  it("個人を指さないパスは通す", () => {
    const f = fresh();
    const base = f.commit("init", { "README.md": "hello\n" });
    const head = f.commit("add note", {
      "docs/env.md": [
        `C:${SEP}Program Files${SEP}nodejs`,
        "~/.local/bin/pmtiles",
        `%USERPROFILE%${SEP}.local`,
        "",
      ].join("\n"),
    });

    expect(runCheck(f, [base, head]).status).toBe(0);
  });

  it("許可する名前は環境変数で足せる", () => {
    const f = fresh();
    const base = f.commit("init", { "README.md": "hello\n" });
    const head = f.commit("add note", { "docs/env.md": `${LINUX_HOME}/src\n` });

    expect(runCheck(f, [base, head], { OSS_ALLOWED_HOME_NAMES: "hanako" }).status).toBe(0);
  });
});
