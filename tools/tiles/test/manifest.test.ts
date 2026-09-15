import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { BuildEntry } from "../src/builds.js";
import { parseManifest, verifyPin, withPinnedBuild } from "../src/manifest.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(here, "..", "manifest.json");

function baseManifest() {
  return {
    source: {
      provider: "protomaps-daily-planet",
      buildsIndexUrl: "https://build-metadata.protomaps.dev/builds.json",
      buildBaseUrl: "https://build.protomaps.com/",
      key: "20260915.pmtiles",
      basemapVersion: "4.15.2",
      size: 138031484053,
      md5sum: "gKc5TWbhCwYIeUrIcDReAQ==",
      b3sum: "bb00",
      uploaded: "2026-09-15T09:02:55.277Z",
    },
    regions: {
      japan: { bbox: [122.93, 20.42, 153.99, 45.56], maxzoom: 15, output: "japan.pmtiles" },
    },
    attribution: "© OpenStreetMap contributors",
  };
}

const upstream: BuildEntry = {
  key: "20260915.pmtiles",
  size: 138031484053,
  md5sum: "gKc5TWbhCwYIeUrIcDReAQ==",
  b3sum: "bb00",
  uploaded: "2026-09-15T09:02:55.277Z",
  version: "4.15.2",
};

describe("parseManifest", () => {
  it("リポジトリに置いてある manifest.json が読める", async () => {
    const raw = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
    const manifest = parseManifest(raw);
    expect(manifest.regions["japan"]?.output).toBe("japan.pmtiles");
    expect(manifest.attribution).toContain("OpenStreetMap");
  });

  it("帰属表示が欠けていたら落ちる（画面から外さないもの）", () => {
    const broken = baseManifest();
    broken.attribution = "© 誰か";
    expect(() => parseManifest(broken)).toThrow(/OpenStreetMap/);
  });

  it("output にパス区切りを書けない", () => {
    const broken = baseManifest();
    broken.regions.japan.output = "../../japan.pmtiles";
    expect(() => parseManifest(broken)).toThrow(/パス区切り/);
  });

  it("regions が空なら落ちる", () => {
    const broken = { ...baseManifest(), regions: {} };
    expect(() => parseManifest(broken)).toThrow(/regions/);
  });

  it("maxzoom が整数でなければ落ちる", () => {
    const broken = baseManifest();
    broken.regions.japan.maxzoom = 15.5;
    expect(() => parseManifest(broken)).toThrow(/maxzoom/);
  });
});

describe("verifyPin", () => {
  it("一致していれば指摘は無い", () => {
    expect(verifyPin(parseManifest(baseManifest()), [upstream])).toEqual([]);
  });

  it("pin したビルドが上流から消えていたら missing", () => {
    const issues = verifyPin(parseManifest(baseManifest()), []);
    expect(issues).toEqual([{ kind: "missing", key: "20260915.pmtiles" }]);
  });

  it("同じ key で中身が差し替わっていたら checksum で気づく", () => {
    const issues = verifyPin(parseManifest(baseManifest()), [{ ...upstream, md5sum: "別物==" }]);
    expect(issues.map((issue) => issue.kind)).toEqual(["md5sum"]);
  });

  it("basemap のスキーマ版が変わったら指摘する（スタイルが依存している）", () => {
    const issues = verifyPin(parseManifest(baseManifest()), [{ ...upstream, version: "5.0.0" }]);
    expect(issues.map((issue) => issue.kind)).toEqual(["basemapVersion"]);
  });

  it("サイズ違いも見る", () => {
    const issues = verifyPin(parseManifest(baseManifest()), [{ ...upstream, size: 1 }]);
    expect(issues.map((issue) => issue.kind)).toEqual(["size"]);
  });
});

describe("withPinnedBuild", () => {
  it("checksum の無いビルドへ乗り換えると、前の checksum を残さない", () => {
    const manifest = parseManifest(baseManifest());
    const next = withPinnedBuild(manifest, {
      key: "20230918.pmtiles",
      size: 114683195425,
      uploaded: "2023-09-18T11:02:48.409Z",
      version: "0.0.0",
    });

    expect(next.source.key).toBe("20230918.pmtiles");
    expect(next.source.basemapVersion).toBe("0.0.0");
    expect(next.source.md5sum).toBeUndefined();
    expect(next.source.b3sum).toBeUndefined();
  });

  it("元の manifest を書き換えない", () => {
    const manifest = parseManifest(baseManifest());
    withPinnedBuild(manifest, { ...upstream, key: "別.pmtiles" });
    expect(manifest.source.key).toBe("20260915.pmtiles");
  });
});
