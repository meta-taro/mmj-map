import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseManifest } from "../src/manifest.js";
import { buildSourceUrl, planExtract, planVerify, formatCommandLine } from "../src/extract-plan.js";

function manifestWith(buildBaseUrl: string) {
  return parseManifest({
    source: {
      provider: "protomaps-daily-planet",
      buildsIndexUrl: "https://build-metadata.protomaps.dev/builds.json",
      buildBaseUrl,
      key: "20260915.pmtiles",
      basemapVersion: "4.15.2",
      size: 1,
      uploaded: "2026-09-15T09:02:55.277Z",
    },
    regions: {
      japan: { bbox: [122.93, 20.42, 153.99, 45.56], maxzoom: 15, output: "japan.pmtiles" },
      nozoom: { bbox: [134.2, 33.4, 136.6, 35.9], output: "nozoom.pmtiles" },
      shaped: {
        bbox: [122.93, 20.42, 153.99, 45.56],
        region: "regions/japan.geojson",
        maxzoom: 15,
        output: "shaped.pmtiles",
      },
    },
    attribution: "© OpenStreetMap contributors",
  });
}

const manifest = manifestWith("https://build.protomaps.com/");

describe("buildSourceUrl", () => {
  it("base に key を繋ぐ", () => {
    expect(buildSourceUrl(manifest)).toBe("https://build.protomaps.com/20260915.pmtiles");
  });

  it("base の末尾に / が無くても、最後の区切りを落とさない", () => {
    expect(buildSourceUrl(manifestWith("https://build.protomaps.com"))).toBe(
      "https://build.protomaps.com/20260915.pmtiles",
    );
  });

  it("base にパスがあっても、その下に繋ぐ", () => {
    expect(buildSourceUrl(manifestWith("https://example.com/mirror/"))).toBe(
      "https://example.com/mirror/20260915.pmtiles",
    );
  });
});

describe("planExtract", () => {
  it("bbox と maxzoom を引数に載せる", () => {
    const plan = planExtract(manifest, "japan", "dist/tiles");

    expect(plan.command).toBe("pmtiles");
    expect(plan.args).toEqual([
      "extract",
      "https://build.protomaps.com/20260915.pmtiles",
      path.join("dist/tiles", "japan.pmtiles"),
      "--bbox=122.93,20.42,153.99,45.56",
      "--maxzoom=15",
    ]);
  });

  it("maxzoom が無い region では --maxzoom を付けない", () => {
    const plan = planExtract(manifest, "nozoom", "dist/tiles");
    expect(plan.args.some((arg) => arg.startsWith("--maxzoom"))).toBe(false);
  });

  it("**region があれば bbox ではなく region を渡す**（海のぶんを切り落とすため）", () => {
    const plan = planExtract(manifest, "shaped", "dist/tiles");
    expect(plan.args.some((a) => a.startsWith("--region="))).toBe(true);
    // **両方渡さない。**go-pmtiles は片方だけを見るので、
    // 両方書くと「どちらが効いているか」が読む人に分からなくなる
    expect(plan.args.some((a) => a.startsWith("--bbox="))).toBe(false);
  });

  it("region のパスは manifest のある場所から解く（叩いた場所に依存させない）", () => {
    const plan = planExtract(manifest, "shaped", "dist/tiles", { manifestDir: "tools/tiles" });
    expect(plan.args).toContain("--region=tools/tiles/regions/japan.geojson");
  });

  it("bbox の上書きは region より優先する（試し切りは範囲を狭めるため）", () => {
    const plan = planExtract(manifest, "shaped", "dist/tiles", { bbox: [135, 34, 136, 35] });
    expect(plan.args).toContain("--bbox=135,34,136,35");
    expect(plan.args.some((a) => a.startsWith("--region="))).toBe(false);
  });

  it("bbox を上書きできる（試し切り）", () => {
    const plan = planExtract(manifest, "japan", "dist/tiles", { bbox: [135, 34, 136, 35] });
    expect(plan.args).toContain("--bbox=135,34,136,35");
  });

  it("無い region を指定したら、ある region を並べて落ちる", () => {
    expect(() => planExtract(manifest, "hokkaido", "dist/tiles")).toThrow(/japan, nozoom/);
  });
});

describe("planVerify", () => {
  it("切り出した先を verify する（extract の終了コードだけを信用しない）", () => {
    const plan = planExtract(manifest, "japan", "dist/tiles");
    expect(planVerify(plan).args).toEqual(["verify", plan.outputPath]);
  });
});

describe("formatCommandLine", () => {
  it("そのまま貼れる形で出す", () => {
    const plan = planExtract(manifest, "nozoom", "out");
    expect(formatCommandLine(plan)).toBe(
      `pmtiles extract https://build.protomaps.com/20260915.pmtiles ${path.join("out", "nozoom.pmtiles")} --bbox=134.2,33.4,136.6,35.9`,
    );
  });
});
