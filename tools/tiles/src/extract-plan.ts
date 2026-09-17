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

/**
 * 切り出しを何段で行うかを決める。
 *
 * **低い倍率で region を使うと、海に穴が開く。**z5 で日本全体を見ると、
 * region の外の海のタイルが無いので黒い矩形が出る（2026-09-17 に撮って気づいた）。
 * 低い倍率のタイルは安い（全域 z0-10 で 78 MB）ので、そこだけ bbox で取って merge する。
 *
 * `regionMinZoom` が無ければ 1 段のまま（いままでどおり）。
 */
export function planExtractSteps(
  manifest: TilesManifest,
  regionName: string,
  outDir: string,
  options: ExtractOptions = {},
): ExtractPlan[] {
  const region = manifest.regions[regionName];
  if (region === undefined) return [planExtract(manifest, regionName, outDir, options)];

  const split = region.regionMinZoom;
  // 試し切り（bbox 上書き）は切り分けない。範囲を狭めるためのものなので、意味がない
  if (split === undefined || region.region === undefined || options.bbox !== undefined) {
    return [planExtract(manifest, regionName, outDir, options)];
  }

  const base = planExtract(manifest, regionName, outDir, options);
  const command = base.command;
  const sourceUrl = base.sourceUrl;
  const finalPath = base.outputPath;
  // **中間ファイルは最終成果物と別名にする。**同じ名前にすると merge の入力と出力が
  // 同じファイルになって壊れる
  const lowPath = finalPath.replace(/.pmtiles$/, ".low.pmtiles");
  const highPath = finalPath.replace(/.pmtiles$/, ".high.pmtiles");

  const regionPath = path.join(options.manifestDir ?? "", region.region).split(path.sep).join("/");

  const low: ExtractPlan = {
    region: regionName,
    sourceUrl,
    outputPath: lowPath,
    command,
    args: [
      "extract",
      sourceUrl,
      lowPath,
      `--bbox=${formatBBox(region.bbox)}`,
      `--maxzoom=${split - 1}`,
    ],
  };

  const high: ExtractPlan = {
    region: regionName,
    sourceUrl,
    outputPath: highPath,
    command,
    args: [
      "extract",
      sourceUrl,
      highPath,
      `--region=${regionPath}`,
      `--minzoom=${split}`,
      ...(region.maxzoom === undefined ? [] : [`--maxzoom=${region.maxzoom}`]),
    ],
  };

  const merge: ExtractPlan = {
    region: regionName,
    sourceUrl,
    outputPath: finalPath,
    command,
    args: ["merge", lowPath, highPath, finalPath],
  };

  return [low, high, merge];
}
