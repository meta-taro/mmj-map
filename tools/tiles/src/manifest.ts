import { parseBBox, type BBox } from "./bbox.js";
import type { BuildEntry } from "./builds.js";
import { findBuild } from "./builds.js";

/** manifest.json に pin してある上流ビルド 1 個ぶん。 */
/** 確認済みの旧版。**戻り先**（D-014） */
export interface KnownGoodBuild {
  readonly key: string;
  readonly basemapVersion: string;
  readonly size: number;
  readonly uploaded: string;
}

export interface PinnedSource {
  readonly provider: string;
  readonly buildsIndexUrl: string;
  readonly buildBaseUrl: string;
  readonly key: string;
  readonly basemapVersion: string;
  readonly size: number;
  readonly uploaded: string;
  readonly md5sum?: string;
  readonly b3sum?: string;
  /**
   * 確認済みの旧版。新しい順。**戻り先**（D-014）。
   * pin は 1 本のまま（D-010）で、ここは「選べる過去」を持つだけ。
   */
  readonly knownGood?: readonly KnownGoodBuild[];
}

export interface Region {
  /**
   * 領域を囲む四隅。**region があっても消さない。**
   * 「この region は何を囲っているつもりか」を 1 行で読めるようにしておくため。
   */
  readonly bbox: BBox;
  /**
   * 切り出す形（GeoJSON MultiPolygon ファイル）。manifest からの相対パス。
   * **bbox 1 個だと海まで抱える**ので、複数の四角で囲って落とす。
   */
  readonly region?: string;
  /**
   * この倍率から region を使う。これ未満は bbox で取る。
   *
   * **低い倍率で region を使うと、海に穴が開く**（z5 で日本全体を見ると、
   * region の外の海のタイルが無くて黒い矩形が出る）。低い倍率は安いので
   * （全域 z0-10 で 78 MB）、そこだけ bbox で取って merge する。
   */
  readonly regionMinZoom?: number;
  readonly output: string;
  readonly maxzoom?: number;
  readonly note?: string;
}

export interface TilesManifest {
  readonly source: PinnedSource;
  readonly regions: Readonly<Record<string, Region>>;
  /** 画面から外さない帰属表示（LICENSES.md）。 */
  readonly attribution: string;
}

function requireString(record: Record<string, unknown>, field: string, where: string): string {
  const value = record[field];
  if (typeof value !== "string" || value === "") {
    throw new TypeError(`${where}.${field} が文字列ではありません`);
  }
  return value;
}

function requireNumber(record: Record<string, unknown>, field: string, where: string): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${where}.${field} が数値ではありません`);
  }
  return value;
}

function requireRecord(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${where} がオブジェクトではありません`);
  }
  return value as Record<string, unknown>;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function parseRegion(raw: unknown, name: string): Region {
  const record = requireRecord(raw, `regions.${name}`);
  const bbox = parseBBox(record["bbox"], `regions.${name}.bbox`);
  const output = requireString(record, "output", `regions.${name}`);

  const regionMinZoomRaw = record["regionMinZoom"];
  if (
    regionMinZoomRaw !== undefined &&
    (typeof regionMinZoomRaw !== "number" ||
      !Number.isInteger(regionMinZoomRaw) ||
      regionMinZoomRaw < 1 ||
      regionMinZoomRaw > 24)
  ) {
    throw new TypeError(`regions.${name}.regionMinZoom が 1〜24 の整数ではありません`);
  }

  const regionRaw = record["region"];
  if (regionRaw !== undefined && typeof regionRaw !== "string") {
    throw new TypeError(`regions.${name}.region が文字列ではありません`);
  }
  if (typeof regionRaw === "string" && (regionRaw.startsWith("/") || regionRaw.includes(".."))) {
    // manifest の外を指させない（§21: 入力を信用しない）
    throw new TypeError(`regions.${name}.region は manifest からの相対パスで書いてください: ${regionRaw}`);
  }

  if (output.includes("/") || output.includes("\\") || output.includes("..")) {
    // 出力名がパスを含むと、manifest を書き換えるだけで任意の場所へ書ける。
    throw new TypeError(`regions.${name}.output にパス区切りは書けません: ${output}`);
  }

  const maxzoomRaw = record["maxzoom"];
  const note = optionalString(record["note"]);

  if (maxzoomRaw !== undefined) {
    if (typeof maxzoomRaw !== "number" || !Number.isInteger(maxzoomRaw) || maxzoomRaw < 0 || maxzoomRaw > 24) {
      throw new TypeError(`regions.${name}.maxzoom が 0〜24 の整数ではありません: ${String(maxzoomRaw)}`);
    }
  }

  return {
    bbox,
    ...(typeof regionRaw === "string" ? { region: regionRaw } : {}),
    ...(typeof regionMinZoomRaw === "number" ? { regionMinZoom: regionMinZoomRaw } : {}),
    output,
    ...(typeof maxzoomRaw === "number" ? { maxzoom: maxzoomRaw } : {}),
    ...(note === undefined ? {} : { note }),
  };
}

export function parseManifest(raw: unknown): TilesManifest {
  const root = requireRecord(raw, "manifest");
  const sourceRecord = requireRecord(root["source"], "source");

  const md5sum = optionalString(sourceRecord["md5sum"]);
  const b3sum = optionalString(sourceRecord["b3sum"]);

  const knownGood = parseKnownGood(sourceRecord["knownGood"], requireString(sourceRecord, "key", "source"));

  const source: PinnedSource = {
    provider: requireString(sourceRecord, "provider", "source"),
    buildsIndexUrl: requireString(sourceRecord, "buildsIndexUrl", "source"),
    buildBaseUrl: requireString(sourceRecord, "buildBaseUrl", "source"),
    key: requireString(sourceRecord, "key", "source"),
    basemapVersion: requireString(sourceRecord, "basemapVersion", "source"),
    size: requireNumber(sourceRecord, "size", "source"),
    uploaded: requireString(sourceRecord, "uploaded", "source"),
    ...(md5sum === undefined ? {} : { md5sum }),
    ...(b3sum === undefined ? {} : { b3sum }),
    ...(knownGood === undefined ? {} : { knownGood }),
  };

  const regionsRecord = requireRecord(root["regions"], "regions");
  const regionNames = Object.keys(regionsRecord);
  if (regionNames.length === 0) {
    throw new TypeError("regions が空です");
  }

  const regions: Record<string, Region> = {};
  for (const name of regionNames) {
    regions[name] = parseRegion(regionsRecord[name], name);
  }

  const attribution = requireString(root, "attribution", "manifest");
  if (!attribution.includes("OpenStreetMap")) {
    // 帰属表示は消してはいけないもの（LICENSES.md / D-007）。manifest 側で先に止める。
    throw new TypeError("attribution に OpenStreetMap の帰属が含まれていません");
  }

  return { source, regions, attribution };
}

export type PinIssue =
  | { readonly kind: "missing"; readonly key: string }
  | { readonly kind: "size"; readonly key: string; readonly pinned: number; readonly upstream: number }
  | { readonly kind: "md5sum"; readonly key: string; readonly pinned: string; readonly upstream: string | undefined }
  | { readonly kind: "b3sum"; readonly key: string; readonly pinned: string; readonly upstream: string | undefined }
  | { readonly kind: "basemapVersion"; readonly key: string; readonly pinned: string; readonly upstream: string };

/**
 * pin した上流ビルドが、いまも同じ中身で公開されているかを突き合わせる。
 * 空配列なら一致。**`missing` は D-001 の「止めるべき条件」に当たる合図**なので、
 * 黙って最新へ乗り換えない。
 */
export function verifyPin(manifest: TilesManifest, entries: readonly BuildEntry[]): PinIssue[] {
  const { source } = manifest;
  const upstream = findBuild(entries, source.key);

  if (upstream === undefined) {
    return [{ kind: "missing", key: source.key }];
  }

  const issues: PinIssue[] = [];

  if (upstream.size !== source.size) {
    issues.push({ kind: "size", key: source.key, pinned: source.size, upstream: upstream.size });
  }
  if (source.md5sum !== undefined && upstream.md5sum !== source.md5sum) {
    issues.push({ kind: "md5sum", key: source.key, pinned: source.md5sum, upstream: upstream.md5sum });
  }
  if (source.b3sum !== undefined && upstream.b3sum !== source.b3sum) {
    issues.push({ kind: "b3sum", key: source.key, pinned: source.b3sum, upstream: upstream.b3sum });
  }
  if (upstream.version !== source.basemapVersion) {
    issues.push({
      kind: "basemapVersion",
      key: source.key,
      pinned: source.basemapVersion,
      upstream: upstream.version,
    });
  }

  return issues;
}

export function describePinIssue(issue: PinIssue): string {
  switch (issue.kind) {
    case "missing":
      return `pin している ${issue.key} が上流の索引にありません。日次ビルドは古いものから消えます。`;
    case "size":
      return `${issue.key} のサイズが変わりました（pin=${issue.pinned} / 上流=${issue.upstream}）。`;
    case "md5sum":
      return `${issue.key} の md5sum が一致しません（pin=${issue.pinned} / 上流=${issue.upstream ?? "無し"}）。`;
    case "b3sum":
      return `${issue.key} の b3sum が一致しません（pin=${issue.pinned} / 上流=${issue.upstream ?? "無し"}）。`;
    case "basemapVersion":
      return `${issue.key} の basemap スキーマ版が変わりました（pin=${issue.pinned} / 上流=${issue.upstream}）。スタイルが依存しています。`;
  }
}

/**
 * pin を差し替えた manifest を返す（元は変えない）。
 * checksum は**引き継がず**、新しいエントリにあるものだけを持つ。
 * 前の pin の md5sum が残ると、checksum の無いビルドを pin したときに
 * 「検証している」ように見えて実際は前のビルドの値を見ることになる。
 */
export function withPinnedBuild(manifest: TilesManifest, entry: BuildEntry): TilesManifest {
  const { provider, buildsIndexUrl, buildBaseUrl } = manifest.source;

  return {
    ...manifest,
    source: {
      provider,
      buildsIndexUrl,
      buildBaseUrl,
      key: entry.key,
      basemapVersion: entry.version,
      size: entry.size,
      uploaded: entry.uploaded,
      ...(entry.md5sum === undefined ? {} : { md5sum: entry.md5sum }),
      ...(entry.b3sum === undefined ? {} : { b3sum: entry.b3sum }),
    },
  };
}

/**
 * 確認済みの旧版を読む。**pin と同じ版は書かせない**（どちらが正か分からなくなる）。
 * @param raw
 * @param pinnedKey
 */
function parseKnownGood(raw: unknown, pinnedKey: string): readonly KnownGoodBuild[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw new TypeError("source.knownGood が配列ではありません");

  const seen = new Set<string>([pinnedKey]);
  return raw.map((entry, index) => {
    const record = requireRecord(entry, `source.knownGood[${index}]`);
    const key = requireString(record, "key", `source.knownGood[${index}]`);
    if (seen.has(key)) {
      throw new TypeError(
        `source.knownGood[${index}].key が pin または他の行と同じです: ${key}` +
          "（どちらが正か分からなくなります）",
      );
    }
    seen.add(key);
    return {
      key,
      basemapVersion: requireString(record, "basemapVersion", `source.knownGood[${index}]`),
      size: requireNumber(record, "size", `source.knownGood[${index}]`),
      uploaded: requireString(record, "uploaded", `source.knownGood[${index}]`),
    };
  });
}
