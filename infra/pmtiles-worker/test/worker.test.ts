import { describe, expect, it } from "vitest";

import worker from "../src/worker.js";
import { keyFromPath } from "../src/key.js";
import type { Env, R2BucketLike, R2ObjectBody, R2ObjectMeta } from "../src/types.js";

const CONTENT = new Uint8Array(1000).map((_, i) => i % 251);

function fakeBucket(objects: Readonly<Record<string, Uint8Array<ArrayBuffer>>>): R2BucketLike {
  return {
    async head(key): Promise<R2ObjectMeta | null> {
      const data = objects[key];
      return data === undefined ? null : { size: data.byteLength, httpEtag: `"${key}"` };
    },
    async get(key, options): Promise<R2ObjectBody | null> {
      const data = objects[key];
      if (data === undefined) return null;
      const { offset = 0, length = data.byteLength - offset } = options?.range ?? {};
      const slice = data.subarray(offset, offset + length);
      return { size: data.byteLength, httpEtag: `"${key}"`, body: new Blob([slice]).stream() };
    },
  };
}

const env = (): Env => ({ TILES: fakeBucket({ "kansai.pmtiles": CONTENT }) });
const call = (path: string, init?: RequestInit) =>
  worker.fetch(new Request(`https://tiles.example.com${path}`, init), env());

describe("keyFromPath", () => {
  it("PMTiles だけを受ける", () => {
    expect(keyFromPath("/kansai.pmtiles")).toBe("kansai.pmtiles");
    expect(keyFromPath("/japan.pmtiles")).toBe("japan.pmtiles");
  });

  it("PMTiles 以外は受けない（置いてあるものを何でも配らない・§21）", () => {
    expect(keyFromPath("/secrets.env")).toBeNull();
    expect(keyFromPath("/index.html")).toBeNull();
  });

  it("階層とエスケープを受けない", () => {
    expect(keyFromPath("/../../etc/passwd.pmtiles")).toBeNull();
    expect(keyFromPath("/sub/dir/kansai.pmtiles")).toBeNull();
    expect(keyFromPath("/%2e%2e/kansai.pmtiles")).toBeNull();
  });

  it("トップは受けない", () => {
    expect(keyFromPath("/")).toBeNull();
  });
});

describe("worker", () => {
  it("Range に 206 と Content-Range で応える（これが PMTiles の前提）", async () => {
    const res = await call("/kansai.pmtiles", { headers: { range: "bytes=0-15" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 0-15/1000");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(CONTENT.subarray(0, 16));
  });

  it("Range が無ければ 200 で全量", async () => {
    const res = await call("/kansai.pmtiles");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe("1000");
    expect((await res.arrayBuffer()).byteLength).toBe(1000);
  });

  it("範囲の外は 416 で、本当の大きさを返す", async () => {
    const res = await call("/kansai.pmtiles", { headers: { range: "bytes=5000-6000" } });
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe("bytes */1000");
  });

  it("HEAD は本文を返さない", async () => {
    const res = await call("/kansai.pmtiles", { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe("1000");
    expect((await res.arrayBuffer()).byteLength).toBe(0);
  });

  it("無いものは 404", async () => {
    expect((await call("/kanto.pmtiles")).status).toBe(404);
  });

  it("PMTiles 以外の要求は 404", async () => {
    expect((await call("/wrangler.toml")).status).toBe(404);
  });

  it("書き込みの動詞は 405", async () => {
    const res = await call("/kansai.pmtiles", { method: "PUT" });
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
  });

  it("別オリジンのデモから読めるよう CORS を返す", async () => {
    const res = await call("/kansai.pmtiles", { headers: { range: "bytes=0-15" } });
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    // **Content-Range を expose しないと、ブラウザ側が範囲を読めない**
    expect(res.headers.get("access-control-expose-headers")).toContain("content-range");
  });

  it("preflight に応える（Range は単純ヘッダではない）", async () => {
    const res = await call("/kansai.pmtiles", { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-headers")?.toLowerCase()).toContain("range");
  });

  it("帰属表示の出どころを応答からも辿れるようにする", async () => {
    const res = await call("/kansai.pmtiles", { method: "HEAD" });
    expect(res.headers.get("x-attribution")).toContain("OpenStreetMap");
  });
});
