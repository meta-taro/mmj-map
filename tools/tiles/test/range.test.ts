import { describe, expect, it } from "vitest";

import { interpretRangeResponse } from "../src/range.js";

function headers(values: Record<string, string>) {
  return new Headers(values);
}

describe("interpretRangeResponse", () => {
  it("206 ＋ Content-Range: bytes なら通す", () => {
    const verdict = interpretRangeResponse(
      206,
      headers({ "content-range": "bytes 0-15/138031484053", "accept-ranges": "bytes" }),
    );
    expect(verdict.ok).toBe(true);
  });

  it("200 は落とす。地図は出るが、1 タイルごとに全量が落ちてくる", () => {
    const verdict = interpretRangeResponse(200, headers({ "content-length": "138031484053" }));
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/全量/);
  });

  it("206 でも Content-Range が無ければ落とす", () => {
    const verdict = interpretRangeResponse(206, headers({}));
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/Content-Range/);
  });

  it("206 でも Content-Range の単位が bytes でなければ落とす", () => {
    const verdict = interpretRangeResponse(206, headers({ "content-range": "items 0-15/100" }));
    expect(verdict.ok).toBe(false);
  });

  it("416 は、ファイルが空か途中で切れている合図として扱う", () => {
    const verdict = interpretRangeResponse(416, headers({}));
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/416/);
  });

  it("想定外の応答は、状態コードごと出す", () => {
    const verdict = interpretRangeResponse(403, headers({}));
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/403/);
  });
});
