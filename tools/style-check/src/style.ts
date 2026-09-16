/**
 * 手書きスタイルと、pin したビルドの中身が噛み合っているかを判定する。
 *
 * **ここは純粋関数だけ。**ファイルもネットワークも触らない（判断を外界から切り離す）。
 *
 * 見ているのは「見た目」ではなく「描かれるかどうか」。色の良し悪しは人が決める領域で、
 * ここで扱わない（ベースルール §11）。止めたいのは、**ビルドもテストも通ったまま
 * 実行時にだけ空になる**壊れ方（§23）:
 *
 *  - 上流に存在しない source-layer を指している → そのレイヤは永久に空
 *  - zoom の窓がデータと交わらない → 一度も描かれない
 *  - `min_zoom` を持つ地物のラベルが、それを見ていない → 出すべきでない縮尺で出る
 *  - symbol があるのに glyphs が無い → **地図全体が白くなる**
 */

/** MapLibre のスタイル。検査に要る範囲だけを型にしてある */
export interface StyleLayer {
  readonly id: string;
  readonly type: string;
  readonly source?: string;
  readonly "source-layer"?: string;
  readonly minzoom?: number;
  readonly maxzoom?: number;
  readonly filter?: unknown;
}

export interface MapStyle {
  readonly version?: number;
  readonly name?: string;
  readonly glyphs?: string;
  readonly sources?: Readonly<Record<string, unknown>>;
  readonly layers: readonly StyleLayer[];
}

/** PMTiles のメタデータが申告している vector_layers の 1 つ */
export interface VectorLayer {
  readonly id: string;
  readonly minzoom: number;
  readonly maxzoom: number;
  readonly fields: readonly string[];
}

export type FindingKind = "unknown-source-layer" | "unreachable-zoom" | "missing-min-zoom-guard" | "missing-glyphs";

export interface Finding {
  readonly layerId: string;
  readonly kind: FindingKind;
  readonly message: string;
}

/** MapLibre の既定。minzoom は含み、maxzoom は含まない（zoom < maxzoom） */
const DEFAULT_MINZOOM = 0;
const DEFAULT_MAXZOOM = 24;

/** ラベルの出し方を `min_zoom` に委ねる対象。面や線は縮尺で間引く対象ではない */
const LABEL_TYPES: ReadonlySet<string> = new Set(["symbol", "circle"]);

const byId = (layers: readonly VectorLayer[]): ReadonlyMap<string, VectorLayer> =>
  new Map(layers.map((l) => [l.id, l]));

/** タイルセット全体の最深 zoom。これより深い要求は最深タイルの overzoom で賄われる */
const tilesetMaxzoom = (layers: readonly VectorLayer[]): number =>
  layers.reduce((max, l) => Math.max(max, l.maxzoom), 0);

export function findUnknownSourceLayers(style: MapStyle, available: readonly VectorLayer[]): Finding[] {
  const known = byId(available);
  const found: Finding[] = [];

  for (const layer of style.layers) {
    const sourceLayer = layer["source-layer"];
    if (sourceLayer === undefined) continue; // background 等
    if (known.has(sourceLayer)) continue;
    found.push({
      layerId: layer.id,
      kind: "unknown-source-layer",
      message: `source-layer "${sourceLayer}" は pin したビルドにありません（あるのは ${[...known.keys()].join(", ")}）`,
    });
  }
  return found;
}

export function findUnreachableZoomWindows(style: MapStyle, available: readonly VectorLayer[]): Finding[] {
  const known = byId(available);
  const deepest = tilesetMaxzoom(available);
  const found: Finding[] = [];

  for (const layer of style.layers) {
    const sourceLayer = layer["source-layer"];
    if (sourceLayer === undefined) continue;
    const data = known.get(sourceLayer);
    if (data === undefined) continue; // 未知の source-layer は上の検査の担当

    const from = layer.minzoom ?? DEFAULT_MINZOOM;
    const to = layer.maxzoom ?? DEFAULT_MAXZOOM; // 含まない
    // データが最深まであるなら、それより深い zoom は overzoom で描ける。
    // 途中で終わっているレイヤ（landcover 等）は引き伸ばされない。
    const dataTo = data.maxzoom >= deepest ? DEFAULT_MAXZOOM : data.maxzoom;
    if (from <= dataTo && data.minzoom < to) continue;

    found.push({
      layerId: layer.id,
      kind: "unreachable-zoom",
      message:
        `zoom ${from}–${to} で描く指定ですが、"${sourceLayer}" のデータは ${data.minzoom}–${data.maxzoom} にしかありません` +
        `（このレイヤは一度も描かれません）`,
    });
  }
  return found;
}

/** 式の木に `["get", name]` が現れるか */
export function filterReadsProperty(filter: unknown, name: string): boolean {
  if (!Array.isArray(filter)) return false;
  if (filter[0] === "get" && filter[1] === name) return true;
  return filter.some((part) => filterReadsProperty(part, name));
}

export function findMissingMinZoomGuards(style: MapStyle, available: readonly VectorLayer[]): Finding[] {
  const known = byId(available);
  const found: Finding[] = [];

  for (const layer of style.layers) {
    if (!LABEL_TYPES.has(layer.type)) continue;
    const sourceLayer = layer["source-layer"];
    if (sourceLayer === undefined) continue;
    const data = known.get(sourceLayer);
    if (data === undefined || !data.fields.includes("min_zoom")) continue;
    if (filterReadsProperty(layer.filter, "min_zoom")) continue;

    found.push({
      layerId: layer.id,
      kind: "missing-min-zoom-guard",
      message:
        `"${sourceLayer}" は地物ごとに min_zoom を持っていますが、このレイヤは見ていません` +
        `（["<=", ["get", "min_zoom"], ["zoom"]] を filter に入れる）`,
    });
  }
  return found;
}

export function findSymbolLayersWithoutGlyphs(style: MapStyle): Finding[] {
  if (style.glyphs !== undefined && style.glyphs !== "") return [];
  return style.layers
    .filter((layer) => layer.type === "symbol")
    .map((layer) => ({
      layerId: layer.id,
      kind: "missing-glyphs" as const,
      message: "symbol レイヤがありますが、スタイルに glyphs がありません（字が引けず、地図全体が白くなります）",
    }));
}

export function checkStyle(style: MapStyle, available: readonly VectorLayer[]): Finding[] {
  return [
    ...findUnknownSourceLayers(style, available),
    ...findUnreachableZoomWindows(style, available),
    ...findMissingMinZoomGuards(style, available),
    ...findSymbolLayersWithoutGlyphs(style),
  ];
}

export const describeFinding = (finding: Finding): string => `${finding.layerId}: ${finding.message}`;
