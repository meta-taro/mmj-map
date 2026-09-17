import path from "node:path";

import { formatBBox, type BBox } from "./bbox.js";
import type { TilesManifest } from "./manifest.js";

/**
 * 実行するコマンドを、実行しないで組み立てる。
 *
 * **タイルを切るのは go-pmtiles の仕事**で、ここは引数を決めるだけ（D-001）。
 * 引数の組み立てだけを純粋関数にしてあるので、100GB を落とさずにテストできる。
 */
export interface ExtractPlan {
  readonly region: string;
  readonly sourceUrl: string;
  readonly outputPath: string;
  readonly command: string;
  readonly args: readonly string[];
}

export interface ExtractOptions {
  /** PATH 上の go-pmtiles。既定は `pmtiles`。 */
  readonly command?: string;
  /** manifest の bbox を上書きする（試し切り用）。**region より優先する。** */
  readonly bbox?: BBox;
  /** manifest のある場所。region の相対パスをここから解く。 */
  readonly manifestDir?: string;
}

export function buildSourceUrl(manifest: TilesManifest): string {
  const { buildBaseUrl, key } = manifest.source;
  // base が末尾 `/` でないと最後の区切りが落ちるので、URL に任せず先に揃える。
  const base = buildBaseUrl.endsWith("/") ? buildBaseUrl : `${buildBaseUrl}/`;
  return new URL(key, base).toString();
}

export function planExtract(
  manifest: TilesManifest,
  regionName: string,
  outDir: string,
  options: ExtractOptions = {},
): ExtractPlan {
  const region = manifest.regions[regionName];
  if (region === undefined) {
    const known = Object.keys(manifest.regions).join(", ");
    throw new Error(`region '${regionName}' は manifest にありません。ある region: ${known}`);
  }

  const sourceUrl = buildSourceUrl(manifest);
  const outputPath = path.join(outDir, region.output);

  // **--bbox と --region を両方渡さない。**go-pmtiles は片方しか見ないので、
  // 両方書くと「どちらが効いているか」が読む人に分からなくなる。
  // 試し切りの bbox 上書きは、範囲を狭めるためのものなので region より優先する。
  const args = ["extract", sourceUrl, outputPath];
  if (options.bbox !== undefined) {
    args.push(`--bbox=${formatBBox(options.bbox)}`);
  } else if (region.region !== undefined) {
    const regionPath = path.join(options.manifestDir ?? "", region.region);
    args.push(`--region=${regionPath.split(path.sep).join("/")}`);
  } else {
    args.push(`--bbox=${formatBBox(region.bbox)}`);
  }
  if (region.maxzoom !== undefined) {
    args.push(`--maxzoom=${region.maxzoom}`);
  }

  return {
    region: regionName,
    sourceUrl,
    outputPath,
    command: options.command ?? "pmtiles",
    args,
  };
}

/** 切り出した後に中身を確かめる。ダウンロードが途中で切れても extract は成功して見えるため。 */
export function planVerify(plan: ExtractPlan): ExtractPlan {
  return {
    ...plan,
    args: ["verify", plan.outputPath],
  };
}

export function formatCommandLine(plan: ExtractPlan): string {
  return [plan.command, ...plan.args].join(" ");
}
