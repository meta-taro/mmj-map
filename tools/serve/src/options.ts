/**
 * 手元の配信の引数。**ここは純粋関数。**ネットワークもファイルも触らない。
 *
 * `--base` があるのは、**公開先と同じ形で配るため**。
 * GitHub Pages は `https://<user>.github.io/<repo>/` の下に置かれるので、
 * 手元が `/` 直下のままだと `/elements/index.js` のような絶対パス参照が
 * **手元だけ通ってしまう**。実際にこれで 4 枚のデモが公開先でだけ
 * 地図を出せなくなっていた（2026-09-21・人が公開サイトを開いて気づいた）。
 */
import type { Mount } from "./server.js";

const DEFAULT_PORT = 8787;

/** `--port=` を読む。**不正な値は黙って既定へ落とさない**（効いていないことに気づけない） */
export function readPort(argv: readonly string[]): number {
  const flag = argv.find((a) => a.startsWith("--port="));
  if (flag === undefined) return DEFAULT_PORT;
  const value = Number(flag.slice("--port=".length));
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`--port の値が不正です: ${flag}`);
  }
  return value;
}

/**
 * `--base=` を読み、`/x` の形へ揃える。指定が無ければ空文字（base 無し）。
 * `--base=/` も空文字にする（「ルート直下」は base 無しと同じ）。
 */
export function readBase(argv: readonly string[]): string {
  const flag = argv.find((a) => a.startsWith("--base="));
  if (flag === undefined) return "";
  const raw = flag.slice("--base=".length);
  const trimmed = `/${raw}`.replaceAll(/\/+/g, "/").replace(/\/$/, "");
  if (trimmed === "") return "";
  // URL に入らない文字と `..` は弾く。ここを通すと mount の外を指せる（§21）
  if (!/^(?:\/[A-Za-z0-9._~-]+)+$/.test(trimmed) || trimmed.split("/").includes("..")) {
    throw new Error(`--base の値が不正です: ${flag}`);
  }
  return trimmed;
}

/**
 * `--no-tiles` を読む。**タイルを持たずに配るか。**
 *
 * この配信は既定で「タイルはここ」という設定を差し込むので、
 * **タイルが無い機械では地図が 404 を出し続ける**（CI で実際にそうなった・2026-09-30）。
 *
 * 画面の骨格だけを見たいとき（`pnpm smoke`）に要るのは**配信元が無いときの姿**——
 * デモが地図の代わりに案内を出す形で、`apps/demo/config.js` が commit されている
 * 姿そのもの。差し込みを止めれば再現できる。
 *
 * **既定は false。**手元では地図を出したい。
 */
export function readNoTiles(argv: readonly string[]): boolean {
  return argv.includes("--no-tiles");
}

/**
 * すべての mount を base path の下へ移す。**base の外は解けなくなる**
 * （＝公開先と同じ 404 になる）。base が空なら何もしない。
 */
export function withBasePath(mounts: readonly Mount[], base: string): Mount[] {
  if (base === "") return [...mounts];
  return mounts.map((mount) => ({ ...mount, prefix: `${base}${mount.prefix}` }));
}
