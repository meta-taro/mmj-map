/**
 * ラベルの字を上流から取って、自前で配れるところへ置く。
 *
 *   pnpm glyphs:fetch              # ラテン系だけ（6 範囲・561.7 KB）
 *   pnpm glyphs:fetch -- --all     # 256 範囲すべて（5.95 MB）
 *   pnpm glyphs:fetch -- --out-dir=apps/demo/glyphs
 *
 * **なぜ要るか。**スタイルが `protomaps.github.io` を指している限り、
 * **通信が無いところでラベルが出ない**。タイルだけ手元にあっても、字が引けない。
 *
 * **判断は `plan.ts` にある。**ここはネットワークとファイルだけを触る。
 *
 * **取れなかったら落とす。**1 範囲欠けただけでも、その字を含むラベルが消える。
 * 地図そのものは出るので、**見ても気づきにくい**——だから機械が数える。
 */
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { assetUrl, FONT, missingRanges, plannedRanges, sizeReport } from "./plan.js";

// pnpm はスクリプトをパッケージの中で走らせる。**人が叩いた場所**で解く
const invokedFrom = process.env["INIT_CWD"] ?? process.cwd();
const args = process.argv.slice(2).filter((arg) => arg !== "--");

const all = args.includes("--all");
const outFlag = args.find((arg) => arg.startsWith("--out-dir="))?.slice("--out-dir=".length);
const outDir = path.resolve(invokedFrom, outFlag ?? "dist/glyphs");
const fontDir = path.join(outDir, FONT);

const ranges = plannedRanges(all);
console.log(`${ranges.length} 範囲を ${fontDir} へ置きます（フォント: ${FONT}）`);

mkdirSync(fontDir, { recursive: true });

let bytes = 0;
const failed: string[] = [];

for (const range of ranges) {
  const target = path.join(fontDir, `${range}.pbf`);
  // 既にあるものは取り直さない。**上流へ 256 回行く必要はない**
  if (existsSync(target)) {
    bytes += statSync(target).size;
    continue;
  }

  const response = await fetch(assetUrl(range, FONT));
  if (!response.ok) {
    // 握り潰さない（§8）。どの範囲が取れなかったかを名指しで残す
    failed.push(`${range}: HTTP ${response.status}`);
    continue;
  }

  const body = Buffer.from(await response.arrayBuffer());
  writeFileSync(target, body);
  bytes += body.byteLength;
}

const present = readdirSync(fontDir)
  .filter((name) => name.endsWith(".pbf"))
  .map((name) => name.replace(/\.pbf$/, ""));
const missing = missingRanges(ranges, present);

console.log(sizeReport(bytes, ranges.length - missing.length));

if (failed.length > 0) {
  console.error(`取れなかった範囲: ${failed.length} 件`);
  for (const line of failed) console.error(`  - ${line}`);
}

if (missing.length > 0) {
  // **揃っていないものを、揃ったことにしない。**
  // 欠けた範囲の字だけが消えるので、地図を見ても気づけない
  console.error(`揃っていません。欠けている範囲: ${missing.join(", ")}`);
  process.exitCode = 1;
}
