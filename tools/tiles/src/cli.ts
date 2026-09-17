/**
 * タイルビルドの入口。
 *
 * **ここだけが外界（ネットワーク・ファイル・子プロセス）に触る。**
 * 判断は src/ の純粋関数側にあり、こちらは運ぶだけ。
 */
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseBBoxString } from "./bbox.js";
import { parseBuildsIndex, findBuild, latestBuild } from "./builds.js";
import {
  parseManifest,
  verifyPin,
  describePinIssue,
  withPinnedBuild,
  type TilesManifest,
} from "./manifest.js";
import { planExtract, planVerify, formatCommandLine, type ExtractPlan } from "./extract-plan.js";
import { interpretRangeResponse, PROBE_RANGE_HEADER } from "./range.js";

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifestPath = path.join(packageRoot, "manifest.json");
const repoRoot = path.dirname(path.dirname(packageRoot));
const defaultOutDir = path.join(repoRoot, "dist", "tiles");

async function readManifest(): Promise<{ manifest: TilesManifest; raw: Record<string, unknown> }> {
  const text = await readFile(manifestPath, "utf8");
  const raw = JSON.parse(text) as Record<string, unknown>;
  return { manifest: parseManifest(raw), raw };
}

async function fetchBuildsIndex(url: string) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`上流の索引が取得できません: HTTP ${response.status} ${url}`);
  }
  return parseBuildsIndex(await response.json());
}

function getFlag(argv: readonly string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = argv.find((arg) => arg.startsWith(prefix));
  return hit?.slice(prefix.length);
}

async function commandResolve(argv: readonly string[]): Promise<number> {
  const { manifest, raw } = await readManifest();
  const { entries, skipped } = await fetchBuildsIndex(manifest.source.buildsIndexUrl);

  if (skipped.length > 0) {
    console.warn(`索引に読めない行が ${skipped.length} 件ありました:`);
    for (const reason of skipped.slice(0, 5)) console.warn(`  - ${reason}`);
  }

  const updateTo = getFlag(argv, "update");
  if (updateTo !== undefined) {
    const target = updateTo === "latest" ? latestBuild(entries) : findBuild(entries, updateTo);
    if (target === undefined) {
      console.error(`上流に ${updateTo} がありません。`);
      return 1;
    }
    const next = withPinnedBuild(manifest, target);
    // `_note` など manifest 側の注記を落とさずに source だけ差し替える。
    await writeFile(manifestPath, `${JSON.stringify({ ...raw, source: next.source }, null, 2)}\n`, "utf8");
    console.log(`pin を ${target.key}（basemap ${target.version}）に更新しました。差分を読んでから commit してください。`);
    return 0;
  }

  const newest = latestBuild(entries);
  console.log(`pin:   ${manifest.source.key}（basemap ${manifest.source.basemapVersion}）`);
  console.log(`上流最新: ${newest?.key ?? "不明"}（basemap ${newest?.version ?? "不明"}）`);

  const issues = verifyPin(manifest, entries);
  if (issues.length === 0) {
    console.log("pin と上流は一致しています。");
    return 0;
  }

  console.error("pin と上流が一致しません:");
  for (const issue of issues) console.error(`  - ${describePinIssue(issue)}`);
  console.error("自動では乗り換えません。decisions.md D-001 の『止めるべき条件』を確認してください。");
  return 1;
}

function run(plan: ExtractPlan): Promise<number> {
  console.log(`$ ${formatCommandLine(plan)}`);
  return new Promise((resolve, reject) => {
    const child = spawn(plan.command, [...plan.args], { stdio: "inherit" });
    child.on("error", (error) => {
      reject(new Error(`${plan.command} を実行できません（PATH にありますか）: ${error.message}`));
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function commandExtract(argv: readonly string[]): Promise<number> {
  const { manifest } = await readManifest();
  const regionName = argv.find((arg) => !arg.startsWith("--")) ?? "japan";
  const outDir = getFlag(argv, "out-dir") ?? defaultOutDir;
  const bboxFlag = getFlag(argv, "bbox");
  const commandFlag = getFlag(argv, "command");

  const plan = planExtract(manifest, regionName, outDir, {
    // region の相対パスは manifest のある場所から解く（叩いた場所に依存させない）
    manifestDir: packageRoot,
    ...(commandFlag === undefined ? {} : { command: commandFlag }),
    ...(bboxFlag === undefined ? {} : { bbox: parseBBoxString(bboxFlag) }),
  });

  if (argv.includes("--dry-run")) {
    console.log(formatCommandLine(plan));
    console.log(formatCommandLine(planVerify(plan)));
    return 0;
  }

  await mkdir(outDir, { recursive: true });

  const extractCode = await run(plan);
  if (extractCode !== 0) return extractCode;

  // extract が 0 で返っても中身が揃っているとは限らない。必ず verify まで通す。
  const verifyCode = await run(planVerify(plan));
  if (verifyCode !== 0) return verifyCode;

  console.log(`できました: ${plan.outputPath}`);
  console.log(`帰属表示（画面から外さない）: ${manifest.attribution}`);
  return 0;
}

async function commandCheckRange(argv: readonly string[]): Promise<number> {
  const url = argv.find((arg) => !arg.startsWith("--"));
  if (url === undefined) {
    console.error("使い方: check-range <配信中の PMTiles の URL>");
    return 2;
  }

  const response = await fetch(url, { headers: { range: PROBE_RANGE_HEADER } });
  const verdict = interpretRangeResponse(response.status, response.headers);

  console.log(`GET ${url}  Range: ${PROBE_RANGE_HEADER}`);
  console.log(`  status: ${verdict.status}`);
  console.log(`  content-range: ${verdict.contentRange ?? "無し"}`);
  console.log(`  accept-ranges: ${verdict.acceptRanges ?? "無し"}`);
  console.log(`  ${verdict.reason}`);

  return verdict.ok ? 0 : 1;
}

async function main(): Promise<number> {
  const [command, ...argv] = process.argv.slice(2);

  switch (command) {
    case "resolve":
      return commandResolve(argv);
    case "extract":
      return commandExtract(argv);
    case "check-range":
      return commandCheckRange(argv);
    default:
      console.error("使い方: cli.ts <resolve | extract | check-range> [...]");
      return 2;
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  },
);
