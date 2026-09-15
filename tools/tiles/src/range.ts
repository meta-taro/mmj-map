/**
 * 配信経路が HTTP Range に正しく応えるかを判定する。
 *
 * **PMTiles を 1 枚置くだけでは足りない**（PRD §4）。
 * `Range:` に 206 ではなく 200（全量）を返す配信があり、そうなると
 * 1 タイル見るたびに 100GB 級のファイルが落ちてくる。
 * 「地図は出るが、出るまでに莫大な転送が起きる」という、見ただけでは分からない壊れ方をする。
 */
export interface RangeHeaders {
  get(name: string): string | null;
}

export interface RangeVerdict {
  readonly ok: boolean;
  readonly status: number;
  readonly contentRange: string | null;
  readonly acceptRanges: string | null;
  readonly reason: string;
}

export function interpretRangeResponse(status: number, headers: RangeHeaders): RangeVerdict {
  const contentRange = headers.get("content-range");
  const acceptRanges = headers.get("accept-ranges");
  const base = { status, contentRange, acceptRanges };

  if (status === 206) {
    if (contentRange === null || !contentRange.toLowerCase().startsWith("bytes ")) {
      return {
        ...base,
        ok: false,
        reason: "206 を返していますが Content-Range が bytes で始まっていません。範囲の解釈が食い違います。",
      };
    }
    return { ...base, ok: true, reason: "Range に 206 で応えています。" };
  }

  if (status === 200) {
    return {
      ...base,
      ok: false,
      reason:
        "Range を無視して 200（全量）を返しています。このまま配信すると、1 タイルごとに PMTiles 全体が落ちてきます。",
    };
  }

  if (status === 416) {
    return { ...base, ok: false, reason: "416。要求した範囲がファイルの外です（ファイルが空か、途中で切れています）。" };
  }

  return { ...base, ok: false, reason: `想定外の応答です（HTTP ${status}）。` };
}

/** 先頭 16 バイトだけ要求する。PMTiles のヘッダより手前で、どの配信でも必ず存在する。 */
export const PROBE_RANGE_HEADER = "bytes=0-15";
