import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRangeHeader } from "../src/range.js";
import { resolveUnderMount } from "../src/server.js";

const SIZE = 1000;

describe("parseRangeHeader", () => {
  it("Range ヘッダが無ければ全量を返す", () => {
    expect(parseRangeHeader(undefined, SIZE)).toEqual({ kind: "full" });
    expect(parseRangeHeader("", SIZE)).toEqual({ kind: "full" });
  });

  it("bytes=0-15 を包含両端として解く（PMTiles のヘッダ読みがこの形）", () => {
    expect(parseRangeHeader("bytes=0-15", SIZE)).toEqual({ kind: "partial", start: 0, end: 15 });
  });

  it("終端を省いた要求は、ファイル末尾までとして解く", () => {
    expect(parseRangeHeader("bytes=900-", SIZE)).toEqual({ kind: "partial", start: 900, end: 999 });
  });

  it("負の要求は末尾からのバイト数として解く", () => {
    expect(parseRangeHeader("bytes=-100", SIZE)).toEqual({ kind: "partial", start: 900, end: 999 });
  });

  it("末尾の要求がファイルより大きければ、先頭までで止める", () => {
    expect(parseRangeHeader("bytes=-5000", SIZE)).toEqual({ kind: "partial", start: 0, end: 999 });
  });

  it("終端がファイルを越える要求は、末尾で切り詰める", () => {
    expect(parseRangeHeader("bytes=990-5000", SIZE)).toEqual({ kind: "partial", start: 990, end: 999 });
  });

  it("開始がファイルの外なら 416 を出せるように unsatisfiable を返す", () => {
    expect(parseRangeHeader("bytes=1000-", SIZE)).toEqual({ kind: "unsatisfiable" });
    expect(parseRangeHeader("bytes=2000-3000", SIZE)).toEqual({ kind: "unsatisfiable" });
  });

  it("開始が終端より後ろなら unsatisfiable", () => {
    expect(parseRangeHeader("bytes=500-100", SIZE)).toEqual({ kind: "unsatisfiable" });
  });

  it("空ファイルにはどの範囲も返せない", () => {
    expect(parseRangeHeader("bytes=0-0", 0)).toEqual({ kind: "unsatisfiable" });
  });

  it("bytes 以外の単位は解釈せず全量を返す（RFC 9110: 解せない Range は無視する）", () => {
    expect(parseRangeHeader("items=0-15", SIZE)).toEqual({ kind: "full" });
    expect(parseRangeHeader("bytes=abc", SIZE)).toEqual({ kind: "full" });
    expect(parseRangeHeader("bytes=", SIZE)).toEqual({ kind: "full" });
  });

  it("複数範囲は受けない。**半端に 1 つだけ返すと転送量の話が合わなくなる**ので全量にする", () => {
    expect(parseRangeHeader("bytes=0-15,100-200", SIZE)).toEqual({ kind: "full" });
  });

  it("空白を含む書き方を受ける", () => {
    expect(parseRangeHeader(" bytes = 0 - 15 ", SIZE)).toEqual({ kind: "partial", start: 0, end: 15 });
  });
});

describe("resolveUnderMount", () => {
  // **mount の dir を文字列で直書きしない。** "C:/repo/..." は Linux では絶対パスに
  // ならず、resolve() が cwd を前置するため CI だけが落ちる（実際に落ちた）。
  // 期待値も同じ resolve() で組み立て、OS に依存しない形にする。
  const demoDir = resolve("apps/demo");
  const tilesDir = resolve("dist/tiles");
  const stylesDir = resolve("styles");
  const mounts = [
    { prefix: "/", dir: demoDir },
    { prefix: "/tiles", dir: tilesDir },
    { prefix: "/styles", dir: stylesDir },
  ];

  it("長い prefix を先に照合する", () => {
    expect(resolveUnderMount("/tiles/kansai.pmtiles", mounts)).toBe(resolve(tilesDir, "kansai.pmtiles"));
    expect(resolveUnderMount("/styles/modern-dark.json", mounts)).toBe(resolve(stylesDir, "modern-dark.json"));
  });

  it("ルートは index.html に解く", () => {
    expect(resolveUnderMount("/", mounts)).toBe(resolve(demoDir, "index.html"));
  });

  it("mount の外へ出る要求を弾く（§21）", () => {
    expect(resolveUnderMount("/tiles/../../../etc/passwd", mounts)).toBe(null);
    expect(resolveUnderMount("/tiles/%2e%2e%2f%2e%2e%2fsecret", mounts)).toBe(null);
  });

  it("壊れた符号化と NUL を弾く", () => {
    expect(resolveUnderMount("/%E0%A4%A", mounts)).toBe(null);
    expect(resolveUnderMount("/a%00b", mounts)).toBe(null);
  });
});
