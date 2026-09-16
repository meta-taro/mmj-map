import { describe, expect, it } from "vitest";

import { planRangeResponse } from "../src/plan.js";

const SIZE = 1000;

describe("planRangeResponse", () => {
  it("Range が無ければ 200 で全量", () => {
    expect(planRangeResponse(undefined, SIZE)).toEqual({
      status: 200,
      headers: { "accept-ranges": "bytes", "content-length": "1000" },
      body: { offset: 0, length: 1000 },
    });
  });

  it("部分要求には 206 と Content-Range を返す", () => {
    expect(planRangeResponse("bytes=0-15", SIZE)).toEqual({
      status: 206,
      headers: { "accept-ranges": "bytes", "content-length": "16", "content-range": "bytes 0-15/1000" },
      body: { offset: 0, length: 16 },
    });
  });

  it("末尾からの要求も 206", () => {
    const plan = planRangeResponse("bytes=-100", SIZE);
    expect(plan.status).toBe(206);
    expect(plan.headers["content-range"]).toBe("bytes 900-999/1000");
    expect(plan.body).toEqual({ offset: 900, length: 100 });
  });

  it("範囲の外なら 416。Content-Range で本当の大きさを教える", () => {
    expect(planRangeResponse("bytes=2000-3000", SIZE)).toEqual({
      status: 416,
      headers: { "accept-ranges": "bytes", "content-range": "bytes */1000" },
      body: null,
    });
  });

  it("Accept-Ranges は 200 にも付ける（これが無いと部分取得を試してもらえない）", () => {
    expect(planRangeResponse(undefined, SIZE).headers["accept-ranges"]).toBe("bytes");
  });

  it("空のファイルへの部分要求は 416", () => {
    expect(planRangeResponse("bytes=0-0", 0).status).toBe(416);
  });
});
