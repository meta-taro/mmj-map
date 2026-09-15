/**
 * Protomaps 日次ビルドの索引（builds.json）を読む。
 *
 * **上流の JSON は外から来る入力**なので、形を信用しない。
 * 古いエントリには md5sum / b3sum が無く、将来フィールドが増えることもあるため、
 * 「必須が欠けた行だけ落として、落とした事実を返す」形にしてある。
 * 黙って捨てると、pin 先が消えていても気づけない。
 */
export interface BuildEntry {
  /** 例: "20260915.pmtiles" */
  readonly key: string;
  readonly size: number;
  /** ISO 8601 */
  readonly uploaded: string;
  /** Protomaps basemap のスキーマ版。スタイルが依存する。 */
  readonly version: string;
  /** base64。古いビルドには無い。 */
  readonly md5sum?: string;
  /** 16 進。古いビルドには無い。 */
  readonly b3sum?: string;
}

export interface BuildsIndex {
  readonly entries: readonly BuildEntry[];
  /** 必須フィールドが欠けていて読めなかった行の理由。 */
  readonly skipped: readonly string[];
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

export function parseBuildsIndex(raw: unknown): BuildsIndex {
  if (!Array.isArray(raw)) {
    throw new TypeError("builds.json が配列ではありません");
  }

  const entries: BuildEntry[] = [];
  const skipped: string[] = [];

  raw.forEach((item, index) => {
    if (typeof item !== "object" || item === null) {
      skipped.push(`[${index}] オブジェクトではありません`);
      return;
    }

    const record = item as Record<string, unknown>;
    const key = optionalString(record["key"]);
    const version = optionalString(record["version"]);
    const uploaded = optionalString(record["uploaded"]);
    const size = record["size"];

    if (key === undefined) {
      skipped.push(`[${index}] key がありません`);
      return;
    }
    if (typeof size !== "number" || !Number.isFinite(size)) {
      skipped.push(`[${index}] ${key}: size が数値ではありません`);
      return;
    }
    if (uploaded === undefined || Number.isNaN(Date.parse(uploaded))) {
      skipped.push(`[${index}] ${key}: uploaded が日時として読めません`);
      return;
    }
    if (version === undefined) {
      skipped.push(`[${index}] ${key}: version がありません`);
      return;
    }

    const md5sum = optionalString(record["md5sum"]);
    const b3sum = optionalString(record["b3sum"]);

    entries.push({
      key,
      size,
      uploaded,
      version,
      ...(md5sum === undefined ? {} : { md5sum }),
      ...(b3sum === undefined ? {} : { b3sum }),
    });
  });

  return { entries, skipped };
}

export function findBuild(entries: readonly BuildEntry[], key: string): BuildEntry | undefined {
  return entries.find((entry) => entry.key === key);
}

/** 索引は概ね時系列だが、並びを前提にしない（上流の都合で崩れても壊れないように）。 */
export function latestBuild(entries: readonly BuildEntry[]): BuildEntry | undefined {
  let latest: BuildEntry | undefined;
  let latestTime = Number.NEGATIVE_INFINITY;

  for (const entry of entries) {
    const time = Date.parse(entry.uploaded);
    if (time > latestTime) {
      latest = entry;
      latestTime = time;
    }
  }

  return latest;
}
