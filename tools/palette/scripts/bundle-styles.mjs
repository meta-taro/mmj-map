/**
 * 正本のスタイルを、配る包みの中へ写す。
 *
 * **正本はリポジトリの根の `styles/`**（D-002）。ここは写しで、git に入れない。
 * 配った包みの中に無いと、`npx` で起動したときに土台が 1 枚も無い状態になる
 * （**参照だけ足して実体を忘れる**・baseline §23）。
 */
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, "../../../styles");
const target = resolve(here, "../styles");

const names = readdirSync(source).filter((name) => name.endsWith(".json"));
if (names.length === 0) throw new Error(`正本のスタイルがありません: ${source}`);

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
for (const name of names) cpSync(resolve(source, name), resolve(target, name));

console.log(`スタイルを ${names.length} 枚写しました: ${names.join(" ")}`);
