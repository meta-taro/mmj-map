import { describe, expect, it } from "vitest";

import { parseManifest } from "../src/manifest.js";
import { chooseBuild, outputNameFor, rememberBuild, type KnownBuild } from "../src/rollback.js";

/**
 * **「最新がバグっている」ときに戻れるようにするための仕組み。**
 *
 * pin は 1 本だけ（D-010）。それは「同じコマンドが日によって違う地図を作らない」ため。
 * ただし pin だけだと**戻り先が無い**ので、確認済みの旧版を manifest に持っておく。
 */

const base = {
  source: {
    provider: "protomaps-daily-planet",
    buildsIndexUrl: "https://build-metadata.protomaps.dev/builds.json",
    buildBaseUrl: "https://build.protomaps.com/",
    key: "20260915.pmtiles",
    basemapVersion: "4.15.2",
    size: 138031484053,
    md5sum: "gKc5TWbhCwYIeUrIcDReAQ==",
    b3sum: "ba618b3b5f301cc8b4142736932c798b0444860bb2caa67cc79a7b4bc5e35357",
    uploaded: "2026-09-15T09:02:55.277Z",
    knownGood: [
      { key: "20260914.pmtiles", basemapVersion: "4.15.2", size: 137900000000, uploaded: "2026-09-14T08:57:17.654Z" },
      { key: "20260913.pmtiles", basemapVersion: "4.15.2", size: 137800000000, uploaded: "2026-09-13T08:54:28.274Z" },
    ],
  },
  attribution: "© OpenStreetMap contributors",
  regions: {
    japan: { bbox: [122.93, 20.42, 153.99, 45.56], output: "japan.pmtiles", maxzoom: 15 },
  },
};

const manifest = parseManifest(base);

describe("manifest が knownGood を読む", () => {
  it("確認済みの旧版を持てる", () => {
    expect(manifest.source.knownGood).toHaveLength(2);
    expect(manifest.source.knownGood?.[0]?.key).toBe("20260914.pmtiles");
  });

  it("knownGood が無い manifest も読める（いままでの形を壊さない）", () => {
    // knownGood を「落とす」ためだけに取り出している（使わない）
    const { knownGood: _dropped, ...source } = base.source;
    const without = parseManifest({ ...base, source });
    expect(without.source.knownGood).toBeUndefined();
  });

  it("**pin と同じ版を knownGood に書かせない**（どちらが正か分からなくなる）", () => {
    const bad = {
      ...base,
      source: { ...base.source, knownGood: [{ key: "20260915.pmtiles", basemapVersion: "4.15.2", size: 1, uploaded: "x" }] },
    };
    expect(() => parseManifest(bad)).toThrow(/20260915/);
  });
});

describe("chooseBuild", () => {
  const known: KnownBuild[] = [
    { key: "20260915.pmtiles", basemapVersion: "4.15.2", size: 138031484053, uploaded: "2026-09-15T09:02:55.277Z" },
    { key: "20260914.pmtiles", basemapVersion: "4.15.2", size: 137900000000, uploaded: "2026-09-14T08:57:17.654Z" },
    { key: "20260913.pmtiles", basemapVersion: "4.15.2", size: 137800000000, uploaded: "2026-09-13T08:54:28.274Z" },
  ];

  it("指定が無ければ pin を使う", () => {
    expect(chooseBuild(known, undefined).key).toBe("20260915.pmtiles");
  });

  it("キーで選べる（拡張子は付けても付けなくてもよい）", () => {
    expect(chooseBuild(known, "20260914.pmtiles").key).toBe("20260914.pmtiles");
    expect(chooseBuild(known, "20260914").key).toBe("20260914.pmtiles");
  });

  it("`previous` で 1 つ前、`previous-2` で 2 つ前", () => {
    expect(chooseBuild(known, "previous").key).toBe("20260914.pmtiles");
    expect(chooseBuild(known, "previous-2").key).toBe("20260913.pmtiles");
  });

  it("**知らない版は受けない。**任意の URL を叩かせない（§21）", () => {
    expect(() => chooseBuild(known, "20260101.pmtiles")).toThrow(/20260915|20260914|20260913/);
    expect(() => chooseBuild(known, "../../etc/passwd")).toThrow();
    expect(() => chooseBuild(known, "https://example.com/evil.pmtiles")).toThrow();
  });

  it("**戻り先が無いときは、その事実を言う**（黙って pin を使わない）", () => {
    expect(() => chooseBuild([known[0]!], "previous")).toThrow(/戻れる版がありません|1 本/);
  });

  it("行き過ぎた previous も、あるところまでしか戻らないとは言わない（黙って丸めない）", () => {
    expect(() => chooseBuild(known, "previous-9")).toThrow(/previous-9|2/);
  });
});

describe("outputNameFor", () => {
  it("pin で切ったら、いままでどおりの名前", () => {
    expect(outputNameFor("japan.pmtiles", "20260915.pmtiles", "20260915.pmtiles")).toBe("japan.pmtiles");
  });

  it("**古い版で切ったら、版名が入る。**新しい方を間違えて潰さないため", () => {
    expect(outputNameFor("japan.pmtiles", "20260914.pmtiles", "20260915.pmtiles")).toBe("japan.20260914.pmtiles");
  });

  it("拡張子が無い出力名でも壊れない", () => {
    expect(outputNameFor("japan", "20260914.pmtiles", "20260915.pmtiles")).toBe("japan.20260914");
  });
});

describe("rememberBuild", () => {
  const known: KnownBuild[] = [
    { key: "20260914.pmtiles", basemapVersion: "4.15.2", size: 2, uploaded: "2026-09-14T08:57:17.654Z" },
  ];
  const entry = { key: "20260913.pmtiles", version: "4.15.2", size: 3, uploaded: "2026-09-13T08:54:28.274Z" };

  it("新しい順に並べて足す", () => {
    const next = rememberBuild(known, entry, 3);
    expect(next.map((b) => b.key)).toEqual(["20260914.pmtiles", "20260913.pmtiles"]);
  });

  it("同じ版を二重に持たない", () => {
    const next = rememberBuild(known, { ...entry, key: "20260914.pmtiles" }, 3);
    expect(next).toHaveLength(1);
  });

  it("**上限を超えたら古いものから落とす。**際限なく増やさない", () => {
    let list = known;
    for (const day of ["13", "12", "11"]) {
      list = rememberBuild(list, { ...entry, key: `202609${day}.pmtiles`, uploaded: `2026-09-${day}T00:00:00Z` }, 3);
    }
    expect(list).toHaveLength(3);
    expect(list.map((b) => b.key)).toEqual(["20260914.pmtiles", "20260913.pmtiles", "20260912.pmtiles"]);
  });
});
