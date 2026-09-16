/**
 * PMTiles を R2 から配る Cloudflare Worker。
 *
 * **これが「地図サーバーを立てない」の実装**（PRD §24 / D-003）。
 * タイルを作って返すのではなく、1 枚の大きなファイルの一部を返すだけ。
 *
 * ここで守らなければならないこと:
 *  1. **Range に 206 で応える。** 200（全量）を返すと 1 タイルごとに数 GB が落ちる
 *  2. **CORS で Content-Range を expose する。** 別オリジンのデモから範囲を読めなくなる
 *  3. **PMTiles 以外を配らない。** バケツの中身を無条件に公開しない
 *
 * Range の解釈は `@modern-map-japan/http-range` にある。**手元の配信と同じものを使う。**
 * 別々に書くと、手元では通って本番で 200 を返す、という壊れ方をする。
 */
import { planRangeResponse } from "@modern-map-japan/http-range";

import { keyFromPath } from "./key.js";
import type { Env } from "./types.js";

const ATTRIBUTION = "© OpenStreetMap contributors (ODbL)";
const ALLOWED_METHODS = "GET, HEAD, OPTIONS";

const corsHeaders = (env: Env): Record<string, string> => ({
  "access-control-allow-origin": env.ALLOW_ORIGIN ?? "*",
  "access-control-allow-methods": ALLOWED_METHODS,
  "access-control-allow-headers": "range, if-match, if-none-match",
  // これが無いと、ブラウザ側が 206 の範囲を読めない（fetch から見えるヘッダが絞られる）
  "access-control-expose-headers": "content-range, content-length, accept-ranges, etag",
  "access-control-max-age": "86400",
});

const text = (status: number, body: string, headers: Record<string, string>): Response =>
  new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", ...headers } });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(env);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "GET" && request.method !== "HEAD") {
      return text(405, "GET / HEAD だけを受けます\n", { ...cors, allow: ALLOWED_METHODS });
    }

    const key = keyFromPath(new URL(request.url).pathname);
    if (key === null) return text(404, "配っているのは PMTiles だけです\n", cors);

    const meta = await env.TILES.head(key);
    if (meta === null) return text(404, `ありません: ${key}\n`, cors);

    const plan = planRangeResponse(request.headers.get("range") ?? undefined, meta.size);
    const headers: Record<string, string> = {
      ...cors,
      ...plan.headers,
      "content-type": "application/octet-stream",
      etag: meta.httpEtag,
      // 同じ名前で中身を差し替えることがある（上流の版を上げたとき）。
      // immutable にはしない。**古いタイルを掴んだまま直らない**のを避ける
      "cache-control": "public, max-age=3600",
      // 帰属表示は画面から外さない（LICENSES.md）。応答からも出どころを辿れるようにする
      "x-attribution": ATTRIBUTION,
    };

    if (plan.body === null) return new Response(null, { status: plan.status, headers });
    if (request.method === "HEAD") return new Response(null, { status: plan.status, headers });

    const object = await env.TILES.get(key, { range: plan.body });
    if (object === null) {
      // head の後に消された。握り潰さず、何が起きたかを返す（§8）
      return text(404, `読んでいる途中で消えました: ${key}\n`, cors);
    }
    return new Response(object.body, { status: plan.status, headers });
  },
};
