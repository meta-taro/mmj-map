/**
 * Range 要求を、返すべき応答の形へ落とす。**ここは純粋関数。**
 *
 * 手元の配信（`tools/serve`）と本番の配信（Cloudflare Worker）で解釈が食い違うと、
 * **手元では通ったのに本番で 200 を返す**という、いちばん見つけにくい壊れ方をする。
 * 解釈も応答の組み立ても 1 か所に置く。
 */
import { parseRangeHeader } from "./range.js";

export interface RangePlan {
  readonly status: 200 | 206 | 416;
  readonly headers: Readonly<Record<string, string>>;
  /** 読むべき範囲。416 のときは null */
  readonly body: { readonly offset: number; readonly length: number } | null;
}

export function planRangeResponse(header: string | undefined, size: number): RangePlan {
  const wanted = parseRangeHeader(header, size);

  if (wanted.kind === "unsatisfiable") {
    // 大きさを教えないと、クライアントは要求し直せない（RFC 9110 §15.5.17）
    return { status: 416, headers: { "accept-ranges": "bytes", "content-range": `bytes */${size}` }, body: null };
  }

  if (wanted.kind === "full") {
    return {
      status: 200,
      headers: { "accept-ranges": "bytes", "content-length": String(size) },
      body: { offset: 0, length: size },
    };
  }

  const length = wanted.end - wanted.start + 1;
  return {
    status: 206,
    headers: {
      "accept-ranges": "bytes",
      "content-length": String(length),
      "content-range": `bytes ${wanted.start}-${wanted.end}/${size}`,
    },
    body: { offset: wanted.start, length },
  };
}
