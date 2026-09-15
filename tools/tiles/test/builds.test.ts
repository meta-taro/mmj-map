import { describe, expect, it } from "vitest";

import { parseBuildsIndex, findBuild, latestBuild } from "../src/builds.js";

const wellFormed = {
  key: "20260915.pmtiles",
  size: 138031484053,
  md5sum: "gKc5TWbhCwYIeUrIcDReAQ==",
  b3sum: "ba618b3b5f301cc8b4142736932c798b0444860bb2caa67cc79a7b4bc5e35357",
  uploaded: "2026-09-15T09:02:55.277Z",
  version: "4.15.2",
};

describe("parseBuildsIndex", () => {
  it("配列でなければ落ちる", () => {
    expect(() => parseBuildsIndex({ builds: [] })).toThrow(/配列/);
  });

  it("checksum の無い古いエントリも読む（上流の古いビルドには md5sum が無い）", () => {
    const { entries, skipped } = parseBuildsIndex([
      { key: "20230918.pmtiles", size: 114683195425, uploaded: "2023-09-18T11:02:48.409Z", version: "0.0.0" },
    ]);
    expect(skipped).toEqual([]);
    expect(entries[0]?.md5sum).toBeUndefined();
    expect(entries[0]?.version).toBe("0.0.0");
  });

  it("将来フィールドが増えても落ちない", () => {
    const { entries, skipped } = parseBuildsIndex([{ ...wellFormed, somethingNew: true }]);
    expect(skipped).toEqual([]);
    expect(entries).toHaveLength(1);
  });

  it("必須が欠けた行は落とすが、落とした理由を返す（黙って捨てない）", () => {
    const { entries, skipped } = parseBuildsIndex([
      wellFormed,
      { size: 1, uploaded: "2026-01-01T00:00:00Z", version: "4.0.0" },
      { key: "broken.pmtiles", size: "big", uploaded: "2026-01-01T00:00:00Z", version: "4.0.0" },
      { key: "nodate.pmtiles", size: 1, uploaded: "いつか", version: "4.0.0" },
      null,
    ]);
    expect(entries).toHaveLength(1);
    expect(skipped).toHaveLength(4);
    expect(skipped.join("\n")).toMatch(/broken\.pmtiles/);
  });
});

describe("findBuild", () => {
  it("key で引く", () => {
    const { entries } = parseBuildsIndex([wellFormed]);
    expect(findBuild(entries, "20260915.pmtiles")?.version).toBe("4.15.2");
    expect(findBuild(entries, "無い.pmtiles")).toBeUndefined();
  });
});

describe("latestBuild", () => {
  it("並び順ではなく uploaded で決める", () => {
    const { entries } = parseBuildsIndex([
      { ...wellFormed, key: "b.pmtiles", uploaded: "2026-09-15T09:02:55.277Z" },
      { ...wellFormed, key: "c.pmtiles", uploaded: "2026-09-10T09:02:55.277Z" },
      { ...wellFormed, key: "a.pmtiles", uploaded: "2026-09-12T09:02:55.277Z" },
    ]);
    expect(latestBuild(entries)?.key).toBe("b.pmtiles");
  });

  it("空なら undefined", () => {
    expect(latestBuild([])).toBeUndefined();
  });
});
