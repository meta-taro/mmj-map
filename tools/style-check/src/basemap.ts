/**
 * pin したビルドの vector_layers スナップショットを読む。
 *
 * **このファイルだけがスナップショットの在り処を知っている。**
 * 判定側（style.ts）は、どこから来た一覧かを知らない。
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { VectorLayer } from "./style.js";

export interface BasemapSnapshot {
  readonly source: {
    readonly key: string;
    readonly basemapVersion: string;
    readonly measuredFrom: string;
    readonly measuredAt: string;
    readonly tilesetVersion: string | null;
  };
  readonly vectorLayers: readonly VectorLayer[];
}

const snapshotPath = resolve(dirname(fileURLToPath(import.meta.url)), "basemap-layers.json");

export function loadSnapshot(path: string = snapshotPath): BasemapSnapshot {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<BasemapSnapshot>;
  const layers = parsed.vectorLayers;
  if (!Array.isArray(layers) || layers.length === 0) {
    // 黙って空で通さない。空の一覧はすべての source-layer 参照を「未知」にしてしまう
    throw new Error(`スナップショットに vectorLayers がありません: ${path}`);
  }
  return parsed as BasemapSnapshot;
}

export const loadVectorLayers = (path?: string): readonly VectorLayer[] => loadSnapshot(path).vectorLayers;
