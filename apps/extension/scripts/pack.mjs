/**
 * ストアへ出す zip を作る。**先に `build.mjs` で `dist/` を組んでから**固める。
 *
 *   pnpm --filter @mmj-map/extension pack:store
 *
 * できるのは `apps/extension/mmj-extension-<版>.zip`。中身は `dist/` そのもので、
 * **一番上に manifest.json** がある（ストアはそれ以外を受け付けない）。
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildZip } from "./zip.mjs";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(app, "dist");
const { version } = JSON.parse(readFileSync(resolve(dist, "manifest.json"), "utf8"));

// 並びを名前順に固定する。**同じ dist から同じ zip** にして、出したものを後で突き合わせられるように
const names = readdirSync(dist, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => relative(dist, resolve(entry.parentPath, entry.name)).split(sep).join("/"))
  .sort();

const zip = buildZip(names.map((name) => ({ name, data: readFileSync(resolve(dist, name)) })));
const out = resolve(app, `mmj-extension-${version}.zip`);
writeFileSync(out, zip);
console.log(`固めました: ${out}（${names.length} 件・${(zip.length / 1024 / 1024).toFixed(1)} MB）`);
