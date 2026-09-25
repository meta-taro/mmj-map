import { describe, expect, it } from "vitest";
import path from "node:path";

import {
  adhocRegion,
  refuseOutsideRepo,
  resolveOutDir,
  shouldResolveLatest,
  sizeVerdict,
} from "../src/install.js";

/**
 * **中と外で振る舞いを変える。**
 *
 * この道具は 2 通りの使われ方をする。
 *
 *   1. **このリポジトリの中**（保守する人）— pin した 1 本で切る。再現可能ビルド（D-010）
 *   2. **外**（`npx` で 1 回だけ使う人）— 自分の街のタイルが欲しいだけ
 *
 * **2 を 1 の規則で動かすと、1 週間で使えなくなる。**日次ビルドは消えるためで、
 * **pin してから 9 日で消えた**のを実測している（2026-09-24）。
 * 外から叩かれたときは**上流の最新を実行時に解決**し、**出力名に版を入れる**。
 * D-010 の目的は「**どの版で作ったか後から言えること**」なので、名前に入れば満たせる。
 */

describe("resolveOutDir", () => {
  it("**中では `dist/tiles`。**いまの手順と deploy がそこを見ている", () => {
    expect(
      resolveOutDir({
        repoRoot: "/repo",
        cwd: "/repo/tools/tiles",
        insideRepo: true,
      }),
    ).toBe(path.join("/repo", "dist", "tiles"));
  });

  it("**外では、叩いた場所の `./tiles`。**node_modules の中へ書かない", () => {
    expect(
      resolveOutDir({
        repoRoot: "/x/node_modules/@mmj-map/tiles",
        cwd: "/srv/site",
        insideRepo: false,
      }),
    ).toBe(path.join("/srv/site", "tiles"));
  });

  it("`--out-dir` があれば、それが勝つ（中でも外でも）", () => {
    expect(
      resolveOutDir({
        flag: "/tmp/out",
        repoRoot: "/repo",
        cwd: "/repo",
        insideRepo: true,
      }),
    ).toBe(path.resolve("/repo", "/tmp/out"));
    expect(
      resolveOutDir({
        flag: "./here",
        repoRoot: "/x",
        cwd: "/srv/app",
        insideRepo: false,
      }),
    ).toBe(path.resolve("/srv/app", "./here"));
  });
});

describe("shouldResolveLatest", () => {
  it("**外から、版を指定せずに叩いたら最新を取る**（pin は消えているかもしれない）", () => {
    expect(shouldResolveLatest({ insideRepo: false })).toBe(true);
  });

  it("**中では取らない。**pin を勝手に動かさない（D-010）", () => {
    expect(shouldResolveLatest({ insideRepo: true })).toBe(false);
  });

  it("版を明示したら、外でもそれを使う（**言われたものを使う**）", () => {
    expect(
      shouldResolveLatest({ insideRepo: false, buildFlag: "20260923.pmtiles" }),
    ).toBe(false);
    expect(
      shouldResolveLatest({ insideRepo: false, buildFlag: "previous" }),
    ).toBe(false);
  });

  it("`--build=latest` と書かれたら、中でも取る（**明示は通す**）", () => {
    expect(shouldResolveLatest({ insideRepo: true, buildFlag: "latest" })).toBe(
      true,
    );
  });
});

describe("refuseOutsideRepo", () => {
  it("**pin を書き換える命令は、外では断る。**node_modules へ書いても次の install で消える", () => {
    for (const command of ["--update", "--remember"]) {
      const message = refuseOutsideRepo(command);
      expect(message, command).not.toBeNull();
      expect(message, command).toContain(command);
    }
  });

  it("**理由を書く。**「できません」だけにしない", () => {
    expect(refuseOutsideRepo("--update")).toContain("node_modules");
  });

  it("知らない命令は断らない（**黙って全部を止めない**）", () => {
    expect(refuseOutsideRepo("--bbox")).toBeNull();
  });
});

describe("adhocRegion", () => {
  const bbox = [136.85, 35.13, 136.95, 35.2] as const;

  it("**名前から出力名を作る。**manifest を編集させない", () => {
    expect(adhocRegion("nagoya", bbox, 15).output).toBe("nagoya.pmtiles");
  });

  it("渡された四角と倍率をそのまま使う", () => {
    const region = adhocRegion("nagoya", bbox, 13);
    expect(region.bbox).toEqual(bbox);
    expect(region.maxzoom).toBe(13);
  });

  it("**多角形は付けない。**四角を渡されたのだから四角で切る", () => {
    expect(adhocRegion("nagoya", bbox, 15).region).toBeUndefined();
    expect(adhocRegion("nagoya", bbox, 15).regionMinZoom).toBeUndefined();
  });

  it("**manifest に書かれていないことを、note で言う**", () => {
    expect(adhocRegion("nagoya", bbox, 15).note).toContain("manifest");
  });
});

describe("sizeVerdict", () => {
  it("**乗るかどうかまで言う。**バイト数だけでは判断できない", () => {
    const small = sizeVerdict(62_914_560); // 60 MiB
    expect(small).toContain("60.0 MB");
    expect(small).toContain("GitHub Pages");
    expect(small).not.toContain("乗りません");
  });

  it("**100 MB を越えたら、乗らないと言う**", () => {
    const big = sizeVerdict(373_534_235);
    expect(big).toContain("乗りません");
    expect(big).toContain("100 MB");
  });

  it("ちょうど 100 MB は乗らない（**上限は「未満」**）", () => {
    expect(sizeVerdict(104_857_600)).toContain("乗りません");
    expect(sizeVerdict(104_857_599)).not.toContain("乗りません");
  });

  it("**サイト全体の 1 GB にも触れる。**1 ファイルだけ見て足りると思わせない", () => {
    expect(sizeVerdict(1_000_000)).toContain("1 GB");
  });
});
