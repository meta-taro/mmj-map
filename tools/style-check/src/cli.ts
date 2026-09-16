/**
 * スタイルを検査する入口。
 *
 *   pnpm style:check                       # styles/modern-dark.json
 *   pnpm style:check -- styles/other.json
 *
 * **指摘があれば 1 で落ちる。**同じ判定が `test/modern-dark.test.ts` からも走るので、
 * CI は人が思い出さなくても止まる。
 */
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadSnapshot } from "./basemap.js";
import { checkStyle, describeFinding, type MapStyle } from "./style.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function main(argv: readonly string[]): number {
  const targets = argv.filter((arg) => !arg.startsWith("--"));
  const files = targets.length > 0 ? targets : ["styles/modern-dark.json"];

  const snapshot = loadSnapshot();
  console.log(
    `照合先: ${snapshot.source.key}（basemap ${snapshot.source.basemapVersion}・` +
      `vector_layers ${snapshot.vectorLayers.length} 件・${snapshot.source.measuredAt} 実測）`,
  );

  let failed = 0;
  for (const file of files) {
    const path = resolve(repoRoot, file);
    const style = JSON.parse(readFileSync(path, "utf8")) as MapStyle;
    const findings = checkStyle(style, snapshot.vectorLayers);
    const name = relative(repoRoot, path).replaceAll("\\", "/");

    if (findings.length === 0) {
      console.log(`  ${name}: 指摘なし（レイヤ ${style.layers.length} 件）`);
      continue;
    }
    failed += findings.length;
    console.error(`  ${name}: ${findings.length} 件`);
    for (const finding of findings) console.error(`    - ${describeFinding(finding)}`);
  }
  return failed === 0 ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));
