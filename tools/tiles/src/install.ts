/**
 * **中と外で振る舞いを変える判断。ここは純粋関数。**
 *
 * この道具は 2 通りの使われ方をする。
 *
 *   1. **このリポジトリの中**（保守する人）— pin した 1 本で切る。再現可能ビルド（D-010）
 *   2. **外**（`npx @mmj-map/tiles` で 1 回だけ使う人）— 自分の街のタイルが欲しいだけ
 *
 * **2 を 1 の規則で動かすと、1 週間で使えなくなる。**
 * 日次ビルドは古いものから消え、**pin してから 9 日で消えた**のを実測している
 * （2026-09-24。索引に 62 版あるが、**連続しているのは直近 7 日ぶんだけ**だった）。
 * 配った CLI が pin だけを見ていたら、配った翌週には 404 で落ちる。
 *
 * だから**外から叩かれたときは上流の最新を実行時に解決**し、
 * **出力名に版を入れる**（`nagoya.20260925.pmtiles`）。
 * D-010 の目的は「**どの版で作ったか後から言えること**」なので、名前に入れば満たせる。
 *
 * **中では何も変えない。**pin を勝手に動かさない。
 */
import path from "node:path";

import type { BBox } from "./bbox.js";
import type { Region } from "./manifest.js";

/** GitHub Pages の上限。**1 ファイルとサイト全体の両方がある** */
const PAGES_FILE_LIMIT = 104_857_600; // 100 MiB
const PAGES_SITE_LIMIT = "1 GB";

/** manifest を書き換える命令。**外から叩かれたら断る** */
const WRITES_MANIFEST = new Set(["--update", "--remember"]);

/**
 * 出したものをどこへ置くか。
 *
 * **中では `dist/tiles`**（いまの手順と `deploy.yml` と `pnpm serve` がそこを見ている）。
 * **外では叩いた場所の `./tiles`**——`node_modules` の中へ書くと、
 * **次の install で消える**うえ、探しても見つからない。
 *
 * @param input `flag` は `--out-dir`。あれば無条件で勝つ
 */
export function resolveOutDir(input: {
  readonly flag?: string;
  readonly repoRoot: string;
  readonly cwd: string;
  readonly insideRepo: boolean;
}): string {
  if (input.flag !== undefined) return path.resolve(input.cwd, input.flag);
  if (input.insideRepo) return path.join(input.repoRoot, "dist", "tiles");
  return path.join(input.cwd, "tiles");
}

/**
 * pin ではなく、上流の最新を実行時に解決するか。
 *
 * **外から、版を指定せずに叩かれたときだけ true。**
 * 版を明示されたら、外でもそれを使う（**言われたものを使う**）。
 * `--build=latest` と書かれたら、中でも取る（**明示は通す**）。
 */
export function shouldResolveLatest(input: {
  readonly insideRepo: boolean;
  readonly buildFlag?: string;
}): boolean {
  if (input.buildFlag === "latest") return true;
  if (input.buildFlag !== undefined) return false;
  return !input.insideRepo;
}

/**
 * 外から叩かれたときに断る命令と、その理由。
 *
 * **断らないものは `null`。**知らない命令で全部を止めない。
 *
 * @returns 断り文（そのまま人へ出す）。断らないなら null
 */
export function refuseOutsideRepo(command: string): string | null {
  if (!WRITES_MANIFEST.has(command)) return null;
  return (
    `${command} はこのリポジトリの中でだけ使えます。` +
    "いまは node_modules の中から動いているので、書き換えても次の install で消えます。\n" +
    "版を選びたいときは `--build=<キー>`、最新でよければ何も付けないでください（既定で最新を取ります）。"
  );
}

/**
 * `--bbox` だけ渡されたときの、その場限りの region。
 *
 * **manifest を編集させない。**外から使う人は `node_modules` の中の JSON を触れないし、
 * 触れたとしても**次の install で消える**。自分の街を 1 回切り出したいだけの人に、
 * **設定ファイルを編集させるのは重すぎる**。
 *
 * ```
 * mmj-tiles extract nagoya --bbox=136.85,35.13,136.95,35.20
 * ```
 *
 * **多角形（`region`）は付けない。**四角を渡されたのだから四角で切る。
 * 海を抱えて重くなるかどうかは、**出したあとの大きさで分かる**（`sizeVerdict`）。
 *
 * @param name 出力名にも使う。`nagoya` なら `nagoya.pmtiles`
 */
export function adhocRegion(name: string, bbox: BBox, maxzoom: number): Region {
  return {
    bbox,
    maxzoom,
    output: `${name}.pmtiles`,
    note: "--bbox で指定された、その場限りの範囲（manifest には書かれていません）",
  };
}

/**
 * 出来たファイルが、よくある配信先に乗るか。
 *
 * **バイト数だけでは判断できない。**「乗るかどうか」まで言う。
 * **1 ファイルの上限だけ見て足りると思わせない**ので、サイト全体の上限にも触れる。
 */
export function sizeVerdict(bytes: number): string {
  const mb = (bytes / 1_048_576).toFixed(1);
  if (bytes >= PAGES_FILE_LIMIT) {
    return (
      `${mb} MB — GitHub Pages には乗りません（1 ファイル 100 MB / サイト全体 ${PAGES_SITE_LIMIT}）。` +
      "範囲か最大倍率を削るか、R2 / S3 のような別の配信先が要ります。"
    );
  }
  return (
    `${mb} MB — GitHub Pages に乗ります（1 ファイル 100 MB / サイト全体 ${PAGES_SITE_LIMIT}）。` +
    "Range に 206 で応えるかは別の話なので、`check-range` で確かめてください。"
  );
}
