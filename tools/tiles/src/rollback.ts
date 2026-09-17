/**
 * 「最新がバグっている」ときに、確認済みの旧版へ戻るための選択。**ここは純粋関数。**
 *
 * pin は 1 本だけ（D-010）。それは「同じコマンドが日によって違う地図を作らない」ため。
 * ただし **pin だけだと戻り先がありません。**道も POI も上流で変わるので、
 * 新しい版で何かが壊れたときに、**手で manifest を書き換えるしか手が無い**状態になります。
 *
 * そこで、確認済みの旧版を manifest に数本持っておき、引数で選べるようにする。
 * **manifest に書いていない版は使えない**（任意の URL を叩かせない・baseline §21）。
 */

/** manifest が知っている上流ビルド（pin も旧版も同じ形） */
export interface KnownBuild {
  /** 例: "20260915.pmtiles" */
  readonly key: string;
  readonly basemapVersion: string;
  readonly size: number;
  readonly uploaded: string;
}

/** "20260914" でも "20260914.pmtiles" でも同じものを指す */
function normalizeKey(value: string): string {
  return value.endsWith(".pmtiles") ? value : `${value}.pmtiles`;
}

/**
 * どの版で切り出すかを決める。
 *
 * - 指定なし … pin（`known[0]`）
 * - `previous` / `previous-N` … N 個前
 * - キー … その版（**manifest にあるものだけ**）
 *
 * @param known 先頭が pin、以降が新しい順の旧版
 * @param requested `--build=` に渡された値
 */
export function chooseBuild(known: readonly KnownBuild[], requested: string | undefined): KnownBuild {
  const pinned = known[0];
  if (pinned === undefined) throw new Error("manifest に上流ビルドがありません");
  if (requested === undefined) return pinned;

  const previous = /^previous(?:-(\d+))?$/.exec(requested);
  if (previous !== null) {
    const steps = previous[1] === undefined ? 1 : Number(previous[1]);
    if (known.length === 1) {
      throw new Error(
        "戻れる版がありません。manifest の source.knownGood が空です（pin 1 本しかありません）。" +
          "`pnpm tiles:resolve --remember=<キー>` で確認済みの版を足してください。",
      );
    }
    const target = known[steps];
    if (target === undefined) {
      // **黙って一番古いところへ丸めない。**戻ったつもりの版と実際が食い違う
      throw new Error(
        `${requested} まで戻れません。戻れるのは previous-${known.length - 1} までです` +
          `（manifest が知っているのは ${known.length} 本）。`,
      );
    }
    return target;
  }

  const wanted = normalizeKey(requested);
  const found = known.find((build) => build.key === wanted);
  if (found !== undefined) return found;

  // **manifest に無い版は使わない。**ここを緩めると、引数で任意の URL を取りに行ける
  throw new Error(
    `manifest が知らない版です: ${requested}\n` +
      `使えるのは: ${known.map((b) => b.key).join(", ")}\n` +
      "足すなら `pnpm tiles:resolve --remember=<キー>`（上流の索引と突き合わせてから書きます）。",
  );
}

/**
 * 出力ファイル名。**pin 以外で切ったら、名前に版を入れる。**
 *
 * 同じ名前へ上書きすると、20 分かけて作った新しい方を古い版で潰す事故が起きる。
 * 名前が違えば、新旧を並べて見比べられる。
 */
export function outputNameFor(output: string, chosenKey: string, pinnedKey: string): string {
  if (chosenKey === pinnedKey) return output;

  const stamp = chosenKey.replace(/\.pmtiles$/, "");
  const dot = output.lastIndexOf(".");
  if (dot <= 0) return `${output}.${stamp}`;
  return `${output.slice(0, dot)}.${stamp}${output.slice(dot)}`;
}

/**
 * 確認済みの旧版を覚える。**新しい順**に並べ、上限を超えたら古いものから落とす。
 *
 * 際限なく増やすと、**いつ確認したのか分からない版が溜まります。**
 * 戻り先は 2〜3 本あれば足りる（それ以上前に戻る必要が出たら、それは別の問題）。
 *
 * @param known いまの旧版（新しい順）
 * @param entry 上流の索引から取ってきた行
 * @param limit 保持する本数
 */
export function rememberBuild(
  known: readonly KnownBuild[],
  entry: { readonly key: string; readonly version: string; readonly size: number; readonly uploaded: string },
  limit: number,
): KnownBuild[] {
  const next: KnownBuild = {
    key: entry.key,
    basemapVersion: entry.version,
    size: entry.size,
    uploaded: entry.uploaded,
  };

  const merged = [...known.filter((build) => build.key !== next.key), next];
  merged.sort((a, b) => b.uploaded.localeCompare(a.uploaded));
  return merged.slice(0, limit);
}
