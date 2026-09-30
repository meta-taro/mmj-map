/**
 * **つながらなくても地図が出るようにするための、最後の 1 つ。**
 *
 * タイルも字も描く道具も自前で配るところまで来たが、**取りに行く相手が居ないと
 * 話にならない**。ここが掴んでおけば、2 回目からは通信が無くても出る。
 *
 * **災害時に効く条件は「すでに端末に入っていること」だけ。**災害が起きてから
 * ダウンロードはできない。つまり**普段の利便性は、おまけではなく技術的な前提条件**で、
 * 昨日その頁を開いたからキャッシュがある、という構図になる。
 *
 * ## Range を自分で切る
 *
 * PMTiles は 1 ファイルへ `Range` で取りに行く。Cache Storage は**丸ごと 1 本**しか
 * 持てないので、掴んだ本体から**こちらで切って 206 を組み立てる**。
 *
 * **ブラウザの Cache API が Range に応えてくれる実装もあるが、当てにしない。**
 * 当てにすると、効かない環境で**「頁は出るが地図だけ真っ白」**という、
 * 見ても原因の分からない壊れ方になる。
 *
 * 解釈そのものは `packages/http-range` が正本（手元の配信と Cloudflare Worker が
 * 使っている）。ここは**ブラウザへ配る都合で素の JS** なので、
 * **同じ判断を書き写さず、PMTiles が実際に投げてくる形だけ**を扱う。
 * 読めない形は**掴んだふりをせず、素通しでネットワークへ渡す**。
 */

/**
 * 版。**ここが変わると古い束が捨てられる。**
 *
 * **`__BUILD__` は配るときに commit の番号へ置き換わる**（`.github/workflows/deploy.yml`）。
 * 置き換えが無ければ CI が止まる。
 *
 * **手で上げる方式をやめた理由。**元は `mmj-v1` と書いて
 * 「中身を変えたら必ず上げること」とコメントしていたが、**一度も上がらなかった**。
 * その結果、`venue.html` を一度でも開いた人には**古い部品の JS が配られ続け**、
 * 頁の HTML だけ新しくなって、**直したはずのものが画面に出なかった**
 * （実測・2026-09-28。画面が何も変わらない、という指摘で分かった）。
 * **人が気をつける方式は必ず漏れる**ので、機械が毎回変える形にする。
 */
const CACHE = "mmj-__BUILD__";

/**
 * 先に掴んでおくもの。**1 回目に開いた時点で、2 回目がオフラインでも成り立つように。**
 *
 * **タイルは舞浜のぶんだけ。**ここに全地域（168 MB）を並べると、
 * 地図を 1 枚見たい人の回線と端末を、黙って 168 MB ぶん使うことになる。
 * 他の地域は「開いた頁のぶんだけ」あとから溜まる。
 */
const SHELL = [
  "./venue.html",
  "./demo.css",
  "./config.js",
  "./favicon.svg",
  "./vendor/maplibre-gl/maplibre-gl.js",
  "./vendor/maplibre-gl/maplibre-gl.css",
  "./vendor/pmtiles/pmtiles.js",
  "./elements/index.js",
  "./styles/modern-dark.json",
  "./tiles/maihama.pmtiles",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // **1 つ失敗しても全部を捨てない。**`addAll` は 1 件の 404 で全滅する。
      // 地図が出るのに必要なものは頁ごとに違うので、取れたぶんだけ持っておく
      await Promise.allSettled(SHELL.map((url) => cache.add(url)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 版を上げたら古い束を捨てる。**残すと、直したはずのものが出続ける**
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

/**
 * `bytes=123-456` だけを読む。**PMTiles が投げてくるのはこの形だけ**（実測）。
 *
 * `bytes=-500`（末尾から）や複数範囲は**読めないものとして扱う**。
 * 中途半端に解釈して間違った位置を返すより、**素通しでネットワークへ渡すほうが安全**。
 *
 * @returns `{start, end}` か、読めなければ null
 */
function readSimpleRange(header) {
  const match = /^bytes=(\d+)-(\d+)$/.exec((header ?? "").trim());
  if (match === null) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return null;
  return { start, end };
}

/** 掴んである本体から切り出して、206 を組み立てる */
async function sliceFromCache(cached, range) {
  const body = await cached.arrayBuffer();
  const size = body.byteLength;
  // 掴んだ本体より先を要求されたら、**握り潰さず 416 で返す**（大きさも教える）
  if (range.start >= size) {
    return new Response(null, {
      status: 416,
      headers: { "accept-ranges": "bytes", "content-range": `bytes */${size}` },
    });
  }

  const end = Math.min(range.end, size - 1);
  const slice = body.slice(range.start, end + 1);
  return new Response(slice, {
    status: 206,
    headers: {
      "accept-ranges": "bytes",
      "content-type": cached.headers.get("content-type") ?? "application/octet-stream",
      "content-length": String(slice.byteLength),
      "content-range": `bytes ${range.start}-${end}/${size}`,
    },
  });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // **同一オリジンの GET だけを扱う。**他所のものを掴むと、
  // 掴んだことに誰も気づけないまま古い応答を返し続ける
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const range = readSimpleRange(request.headers.get("range"));

      // Range 付き（＝タイル）。**掴んである本体から切る**
      if (range !== null) {
        const cached = await caches.match(request.url, { cacheName: CACHE });
        if (cached !== undefined) return sliceFromCache(cached.clone(), range);

        // 掴んでいなければ通信へ。**ここで丸ごと取りに行かない**——
        // 1 タイル見るために 1.9 MB 落とすことになる
        return fetch(request);
      }

      // **頁（HTML）は通信を先に見る。**
      //
      // **掴んだものを先に返すと、直しても利用者に届かない。**
      // 版を手で上げる運用にしていたが、**実際に自分で踏んだ**——
      // 版下を直して撮り直したのに、絵が 1 ピクセルも変わらなかった（2026-09-25）。
      // 配信は新しいものを返していて、古い頁を返していたのはここだった。
      // **手で上げる運用は漏れる。**機械が毎回見に行く形にする。
      //
      // 通信が無ければ掴んだものを返す。**オフラインで出ることは変わらない。**
      const isDocument = request.mode === "navigate" || request.destination === "document";
      if (isDocument) {
        try {
          const fresh = await fetch(request);
          if (fresh.ok && fresh.status === 200) {
            const cache = await caches.open(CACHE);
            await cache.put(request, fresh.clone());
          }
          return fresh;
        } catch {
          // **`?` から後ろを見ないで探す。**カードを開くと `?shop=akari` が付くので、
          // そのまま照合すると**同じ頁なのに掴んだものが見つからない**。
          // 共有された URL をオフラインで開くのは、いちばん効いてほしい場面
          const cached = await caches.match(request, { cacheName: CACHE, ignoreSearch: true });
          if (cached !== undefined) return cached;
          throw new Error(`通信も掴んだものもありません: ${request.url}`);
        }
      }

      // 資産（描く道具・字・スタイル・タイル）は掴んだものを先に返す。
      // **開くたびに 1.15 MB 取りに行かない。**中身が変わったら版を上げる
      const cached = await caches.match(request, { cacheName: CACHE });
      if (cached !== undefined) return cached;

      try {
        const response = await fetch(request);
        // 掴むのは中身のある応答だけ。**206 を掴むと、切れ端を全体だと思い込む**
        if (response.ok && response.status === 200) {
          const cache = await caches.open(CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        // **握り潰さない**（§8）。通信も掴んだものも無いので、これ以上は出せない
        console.error("[mmj-sw] 取れませんでした", request.url, error);
        throw error;
      }
    })(),
  );
});
