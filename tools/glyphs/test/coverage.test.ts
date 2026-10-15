import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DEFAULT_STARTS, isLocallyRendered, uncoveredCodepoints } from "../src/plan.js";

/**
 * **配っていない字を、データが使っていないか。**
 *
 * 1 範囲欠けると、その字を含むラベル「だけ」が消える。地図そのものは出るので、
 * **画面を見ても気づけない**。見つかるのは通信の 404 を数えたときだけ。
 *
 * 2026-10-15 の定期点検で実際に踏んだ: 経路の見本が `御堂筋 → 曽根崎通` で、
 * **`→`（U+2192）が本番で 404**。矢印が黙って消えていた。
 * 地域を増やして確かめる方式では、**地名に出ない記号**は永久に踏めない。
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const dataDir = resolve(repoRoot, "apps/demo/data");

/** 地図のラベルになりうる文字列を、まとめて 1 本にする */
function labelText(): string {
  const files = readdirSync(dataDir).filter((name) => name.endsWith(".geojson"));
  if (files.length === 0) throw new Error(`見本のデータがありません: ${dataDir}`);
  return files.map((name) => readFileSync(resolve(dataDir, name), "utf8")).join("\n");
}

describe("isLocallyRendered", () => {
  it("漢字・かな・ハングルは閲覧側が描く（配らない）", () => {
    for (const c of ["漢", "あ", "ア", "한"]) expect(isLocallyRendered(c.codePointAt(0) ?? 0)).toBe(true);
  });

  it("ラテンと記号は配る側", () => {
    for (const c of ["A", "é", "→", "—"]) expect(isLocallyRendered(c.codePointAt(0) ?? 0)).toBe(false);
  });
});

describe("uncoveredCodepoints", () => {
  it("配っている範囲の字は、何も返さない", () => {
    expect(uncoveredCodepoints("Osaka 大阪 — ’…", DEFAULT_STARTS)).toEqual([]);
  });

  /** **この試験が本体。**8448 を外すと矢印が拾われる */
  it("配っていない範囲の字を拾う", () => {
    const withoutArrows = DEFAULT_STARTS.filter((s) => s !== 8448);
    expect(uncoveredCodepoints("御堂筋 → 曽根崎通", withoutArrows)).toEqual([0x21_92]);
  });
});

describe("見本のデータ", () => {
  const text = labelText();

  /** **0 件は「見ていない」とも読める。**測った分母を先に縛る */
  it("読み込めている（分母がある）", () => {
    expect(text.length).toBeGreaterThan(1000);
  });

  it("配っていない字を使っていない", () => {
    const missing = uncoveredCodepoints(text, DEFAULT_STARTS);
    const readable = missing.map((c) => `U+${c.toString(16).toUpperCase()} ${String.fromCodePoint(c)}`);
    expect(readable).toEqual([]);
  });
});
