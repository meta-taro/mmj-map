/**
 * **本物のサーバーを起こして、本物の HTTP を投げる。**
 *
 * `server.test.ts` は `resolveUnderMount` と `contentTypeFor` しか通しておらず、
 * **応答を組み立てる部分が 1 行も測られていなかった**（カバレッジ 34%・2026-09-21）。
 *
 * ここで見るのは「PMTiles が読める配信かどうか」そのもの。
 * **Range に 206 で応えられなければ、地図は 1 枚も出ない。**
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createStaticServer, type Mount } from "../src/server.js";

const root = mkdtempSync(join(tmpdir(), "mmj-serve-"));
/** 16 バイト。Range の端を数えやすい長さにしてある */
const BODY = "0123456789abcdef";

let base = "";
let server: ReturnType<typeof createStaticServer>;

beforeAll(async () => {
  writeFileSync(join(root, "index.html"), "<!doctype html><title>root</title>");
  writeFileSync(join(root, "demo.pmtiles"), BODY);
  writeFileSync(join(root, "style.json"), '{"version":8}');

  const mounts: Mount[] = [{ prefix: "/", dir: root }];
  server = createStaticServer(mounts, {
    "/config.js": { type: "text/javascript; charset=utf-8", body: "window.X=1;\n" },
  });

  await new Promise<void>((done) => server.listen(0, () => done()));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("port が取れません");
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
});

describe("そのまま取りに行く", () => {
  it("ルートは index.html を返す", async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<title>root</title>");
  });

  it("**Accept-Ranges を必ず付ける。**これが無いと相手は部分取得を諦める", async () => {
    const res = await fetch(`${base}/demo.pmtiles`);
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("content-length")).toBe(String(BODY.length));
  });

  it("拡張子ごとの型を返す（**octet-stream で返すと、掴んだ側が中身を見に行かない**）", async () => {
    expect((await fetch(`${base}/style.json`)).headers.get("content-type")).toContain(
      "application/json",
    );
    expect((await fetch(`${base}/demo.pmtiles`)).headers.get("content-type")).toBe(
      "application/octet-stream",
    );
  });

  it("**古いものを掴ませない**（no-store）。直っていないと誤診する原因になる", async () => {
    expect((await fetch(`${base}/`)).headers.get("cache-control")).toBe("no-store");
  });

  it("無いものは 404。ディレクトリも 404（中身を晒さない）", async () => {
    expect((await fetch(`${base}/nope.html`)).status).toBe(404);
    expect((await fetch(`${base}/../secret`)).status).toBe(404);
  });
});

describe("Range で取りに行く（PMTiles はこれで読む）", () => {
  it("**206 と content-range を返す**", async () => {
    const res = await fetch(`${base}/demo.pmtiles`, { headers: { range: "bytes=0-3" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe(`bytes 0-3/${BODY.length}`);
    expect(res.headers.get("content-length")).toBe("4");
    expect(await res.text()).toBe("0123");
  });

  it("末尾を開いた指定（`bytes=12-`）も返す", async () => {
    const res = await fetch(`${base}/demo.pmtiles`, { headers: { range: "bytes=12-" } });
    expect(res.status).toBe(206);
    expect(await res.text()).toBe("cdef");
  });

  it("**範囲の外は 416**。黙って全部返さない", async () => {
    const res = await fetch(`${base}/demo.pmtiles`, { headers: { range: "bytes=999-1000" } });
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe(`bytes */${BODY.length}`);
  });

  it("読めない Range は 200 で全部返す（相手に任せる）", async () => {
    // HTTP ヘッダに非 ASCII は入らないので、壊れた指定は ASCII で作る
    for (const range of ["pages=1-2", "bytes=abc", "bytes=", ""]) {
      const res = await fetch(`${base}/demo.pmtiles`, { headers: { range } });
      expect(res.status, range).toBe(200);
      expect(await res.text()).toBe(BODY);
    }
  });
});

describe("差し込んだ内容（開発用の config.js）", () => {
  it("実ファイルが無くても返る", async () => {
    const res = await fetch(`${base}/config.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/javascript");
    expect(await res.text()).toBe("window.X=1;\n");
  });
});

describe("HEAD", () => {
  it("本文を返さずに大きさだけ返す", async () => {
    const res = await fetch(`${base}/demo.pmtiles`, { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe(String(BODY.length));
    expect(await res.text()).toBe("");
  });

  it("Range つきの HEAD も 206 を返す", async () => {
    const res = await fetch(`${base}/demo.pmtiles`, {
      method: "HEAD",
      headers: { range: "bytes=0-3" },
    });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe(`bytes 0-3/${BODY.length}`);
    expect(await res.text()).toBe("");
  });
});
