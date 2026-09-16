/**
 * pin したビルドの vector_layers を実測して `basemap-layers.json` を書き直す。
 *
 *   pnpm --filter @modern-map-japan/style-check run snapshot -- dist/tiles/kansai.pmtiles
 *
 * **手で書かない。**上流の版を上げたとき（`pnpm tiles:resolve -- --update=...`）は、
 * 切り出し直したアーカイブでこれを走らせる。
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

// pnpm は `--` をそのまま実引数として渡してくる（tools/tiles と同じ扱いに揃える）
const archive = process.argv.slice(2).find((arg) => !arg.startsWith("--")) ?? "dist/tiles/kansai.pmtiles";
const pmtiles = process.env["PMTILES_BIN"] ?? "pmtiles";

const raw = execFileSync(pmtiles, ["show", resolve(repoRoot, archive), "--metadata"], { maxBuffer: 1 << 26 });
const metadata = JSON.parse(raw.toString("utf8")) as {
  version?: string;
  vector_layers?: readonly { id: string; minzoom: number; maxzoom: number; fields?: Record<string, string> }[];
};
const manifest = JSON.parse(readFileSync(resolve(repoRoot, "tools/tiles/manifest.json"), "utf8")) as {
  source: { key: string; basemapVersion: string };
};

const vectorLayers = [...(metadata.vector_layers ?? [])]
  .map((l) => ({ id: l.id, minzoom: l.minzoom, maxzoom: l.maxzoom, fields: Object.keys(l.fields ?? {}).sort() }))
  .sort((a, b) => a.id.localeCompare(b.id));

if (vectorLayers.length === 0) throw new Error(`vector_layers が空です: ${archive}`);

const out = {
  _note: [
    "pin したビルドが実際に持っている vector_layers。**手で書かない**。",
    "再生成: pnpm --filter @modern-map-japan/style-check run snapshot -- <PMTiles のパス>",
    "スタイルが参照する source-layer が、ここに無ければ CI が落ちる（ベースルール §23）。",
  ],
  source: {
    key: manifest.source.key,
    basemapVersion: manifest.source.basemapVersion,
    measuredFrom: archive.replaceAll("\\", "/"),
    measuredAt: new Date().toISOString().slice(0, 10),
    tilesetVersion: metadata.version ?? null,
  },
  vectorLayers,
};

const path = resolve(here, "basemap-layers.json");
writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`, "utf8");
console.log(`書きました: ${path}（vector_layers ${vectorLayers.length} 件）`);
