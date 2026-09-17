/**
 * タイルビルドの入口。
 *
 * **ここだけが外界（ネットワーク・ファイル・子プロセス）に触る。**
 * 判断は src/ の純粋関数側にあり、こちらは運ぶだけ。
 */
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
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
import { planExtract, planExtractSteps, planVerify, formatCommandLine, type ExtractPlan } from "./extract-plan.js";
import { chooseBuild, outputNameFor, rememberBuild, type KnownBuild } from "./rollback.js";

/** 戻り先として覚えておく本数。際限なく増やさない（D-014） */
const KNOWN_GOOD_LIMIT = 3;
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

  // 確認済みの旧版を覚える（戻り先・D-014）。**上流の索引と突き合わせてから書く。**
  const remember = getFlag(argv, "remember");
  if (remember !== undefined) {
    const key = remember.endsWith(".pmtiles") ? remember : `${remember}.pmtiles`;
    const entry = findBuild(entries, key);
    if (entry === undefined) {
      console.error(`上流に ${key} がありません。索引にあるものだけ覚えられます。`);
      return 1;
    }
    if (key === manifest.source.key) {
      console.error(`${key} は pin そのものです。戻り先としては覚えません。`);
      return 1;
    }
    const next = rememberBuild(manifest.source.knownGood ?? [], entry, KNOWN_GOOD_LIMIT);
    const rawSource = (raw as Record<string, unknown>)["source"] as Record<string, unknown>;
    await writeFile(
      manifestPath,
      `${JSON.stringify({ ...raw, source: { ...rawSource, knownGood: next } }, null, 2)}
`,
      "utf8",
    );
    console.log(`戻り先に ${key}（basemap ${entry.version}）を覚えました。`);
    console.log(`いまの戻り先: ${next.map((b) => b.key).join(", ")}`);
    console.log("**この版で実際に地図が出ることは、まだ誰も確かめていません。**");
    console.log(`確かめるなら: pnpm tiles:extract -- <region> --build=${key.replace(".pmtiles", "")}`);
    return 0;
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

  // **戻り先が上流から消えていたら、消えたと言う。**いざ戻ろうとした日に気づくのでは遅い
  const knownGood = manifest.source.knownGood ?? [];
  if (knownGood.length === 0) {
    console.warn("戻り先: ありません（pin 1 本だけ）。--remember=<キー> で足せます。");
  } else {
    const gone = knownGood.filter((build) => findBuild(entries, build.key) === undefined);
    console.log(`戻り先: ${knownGood.map((b) => b.key).join(", ")}`);
    for (const build of gone) {
      console.warn(`  警告 ${build.key} は上流の索引から消えています。**戻れません。**`);
    }
  }

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
  const buildFlag = getFlag(argv, "build");

  // manifest が知っている版だけ（先頭が pin）。**引数で任意の URL を取りに行かせない**（§21）
  const known: KnownBuild[] = [
    {
      key: manifest.source.key,
      basemapVersion: manifest.source.basemapVersion,
      size: manifest.source.size,
      uploaded: manifest.source.uploaded,
    },
    ...(manifest.source.knownGood ?? []),
  ];

  let build: { key: string; outputName: string } | undefined;
  if (buildFlag !== undefined) {
    let chosen;
    try {
      chosen = chooseBuild(known, buildFlag);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      return 2;
    }
    const region = manifest.regions[regionName];
    if (region === undefined) {
      console.error(`region '${regionName}' は manifest にありません`);
      return 2;
    }
    build = { key: chosen.key, outputName: outputNameFor(region.output, chosen.key, manifest.source.key) };
    if (chosen.key !== manifest.source.key) {
      // **戻していることを黙って進めない。**pin と違う版で切ったことが後から分かるように
      console.warn(`pin（${manifest.source.key}）ではなく ${chosen.key} で切り出します。`);
      console.warn(`出力: ${build.outputName}（pin の成果物は上書きしません）`);
    }
  }

  const steps = planExtractSteps(manifest, regionName, outDir, {
    // region の相対パスは manifest のある場所から解く（叩いた場所に依存させない）
    manifestDir: packageRoot,
    ...(commandFlag === undefined ? {} : { command: commandFlag }),
    ...(bboxFlag === undefined ? {} : { bbox: parseBBoxString(bboxFlag) }),
    ...(build === undefined ? {} : { build }),
  });

  // 最後の段の出力が成果物（1 段のときはその段そのもの）
  const plan = steps[steps.length - 1]!;

  if (argv.includes("--dry-run")) {
    for (const step of steps) console.log(formatCommandLine(step));
    console.log(formatCommandLine(planVerify(plan)));
    return 0;
  }

  await mkdir(outDir, { recursive: true });

  for (const step of steps) {
    const code = await run(step);
    if (code !== 0) return code;
  }

  // extract が 0 で返っても中身が揃っているとは限らない。必ず verify まで通す。
  const verifyCode = await run(planVerify(plan));
  if (verifyCode !== 0) return verifyCode;

  // 中間ファイルは verify が通ってから消す。**先に消すと、失敗したときに取り直しになる**
  for (const step of steps.slice(0, -1)) {
    if (steps.length > 1) await rm(step.outputPath, { force: true });
  }

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
