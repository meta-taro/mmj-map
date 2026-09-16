/**
 * URL のパスを、R2 のキーへ解く。解けなければ null。
 *
 * **バケツに置いてあるものを何でも配らない**（§21）。配るのは PMTiles だけ。
 * 階層も受けない（`/../` の解釈で事故る余地を残さない）。
 */
const KEY = /^[a-z0-9][a-z0-9._-]*\.pmtiles$/i;

export function keyFromPath(pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null; // 壊れたパーセント符号化
  }

  const key = decoded.replace(/^\//, "");
  if (!KEY.test(key)) return null;
  return key;
}
