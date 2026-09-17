import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseManifest } from "../src/manifest.js";
import { buildSourceUrl, planExtract, planExtractSteps, planVerify, formatCommandLine } from "../src/extract-plan.js";

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
      split: {
        bbox: [122.93, 20.42, 153.99, 45.56],
        region: "regions/japan.geojson",
        regionMinZoom: 11,
        maxzoom: 15,
        output: "split.pmtiles",
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

/**
 * **低い倍率で region を使うと、海に穴が開く。**
 *
 * z5 で日本全体を見ると、region の外の海のタイルが無いので黒い矩形が出る
 * （実測: 2026-09-17 に撮って気づいた）。低い倍率のタイルは安いので
 * （全域 z0-10 で 78 MB）、そこだけ bbox で取って merge する。
 */
describe("planExtractSteps（倍率で切り分ける）", () => {
  it("regionMinZoom があれば、低い倍率は bbox・高い倍率は region で取って merge する", () => {
    const steps = planExtractSteps(manifest, "split", "dist/tiles", { manifestDir: "tools/tiles" });
    expect(steps).toHaveLength(3);

    const [low, high, merge] = steps;
    expect(low?.args).toContain("--bbox=122.93,20.42,153.99,45.56");
    expect(low?.args).toContain("--maxzoom=10");
    expect(low?.args.some((a) => a.startsWith("--region="))).toBe(false);

    expect(high?.args).toContain("--region=tools/tiles/regions/japan.geojson");
    expect(high?.args).toContain("--minzoom=11");
    expect(high?.args).toContain("--maxzoom=15");

    expect(merge?.args[0]).toBe("merge");
  });

  it("merge の出力が、最終的な成果物になる", () => {
    const steps = planExtractSteps(manifest, "split", "dist/tiles", { manifestDir: "tools/tiles" });
    const merge = steps[2];
    expect(merge?.outputPath.endsWith("split.pmtiles")).toBe(true);
    expect(merge?.args.at(-1)).toBe(merge?.outputPath);
    // **中間ファイルは最終成果物と別名にする。**同じ名前にすると、
    // merge の入力と出力が同じファイルになって壊れる
    expect(steps[0]?.outputPath).not.toBe(merge?.outputPath);
    expect(steps[1]?.outputPath).not.toBe(merge?.outputPath);
  });

  it("regionMinZoom が無ければ、1 段のまま（いままでどおり）", () => {
    expect(planExtractSteps(manifest, "shaped", "dist/tiles", { manifestDir: "tools/tiles" })).toHaveLength(1);
    expect(planExtractSteps(manifest, "nozoom", "dist/tiles")).toHaveLength(1);
  });

  it("bbox の上書き（試し切り）は 1 段に落とす。**切り分ける意味がないため**", () => {
    const steps = planExtractSteps(manifest, "split", "dist/tiles", { bbox: [135, 34, 136, 35] });
    expect(steps).toHaveLength(1);
    expect(steps[0]?.args).toContain("--bbox=135,34,136,35");
  });
});
