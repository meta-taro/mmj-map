/**
 * 配っているタイルが古びていないかを言葉にする。**ここは純粋関数。**
 *
 * 時点そのものの読み取りは `@mmj-map/elements/provenance` にある
 * （画面にも同じ値を出すので、判断を 2 か所に持たない）。
 * ここがやるのは**人が読む文**と**機械が読む印**の作り分けだけ。
 */
import { asOfTime, isStale } from "@mmj-map/elements/provenance";

/**
 * 機械が読む印。**deploy.yml がこの行を grep する。**
 *
 * 以前は日本語の文面（「越えています」）を grep させていた。
 * **言い回しを直した日に、黙って要約が出なくなる**形で、
 * 落ちないので誰も気づけない。人が読む文と分けて、テストで固定する。
 */
export const STALE_FLAG = "mmj:stale=";

/** 古びていると言い切れないとき。**決めつけない**（自作タイルには時点が無い） */
const UNKNOWN = "unknown";

export type AgeReport = {
  /** 標準出力へそのまま流す行。最後の行が {@link STALE_FLAG} */
  readonly lines: readonly string[];
  /** しきい値を越えているか。読めなかったときは false（**判断しない**） */
  readonly stale: boolean;
};

/**
 * @param input.metadata PMTiles のメタデータ
 * @param input.now 基準時刻（テストで固定するため引数にしてある）
 * @param input.days この日数より古ければ「越えている」
 */
export function ageReport(input: {
  metadata: Record<string, unknown> | null | undefined;
  now: Date;
  days: number;
}): AgeReport {
  const { metadata, now, days } = input;
  const time = asOfTime(metadata);
  if (time === null) {
    return {
      lines: ["時点が入っていません（planetiler で作られていないタイル）。判断しません", `${STALE_FLAG}${UNKNOWN}`],
      stale: false,
    };
  }

  // 切った直後は負の端数になる。**「-0 日前」を出さない**
  const age = Math.max(0, Math.floor((now.getTime() - Date.parse(time)) / 86_400_000));
  const stale = isStale(metadata, now, days);
  return {
    lines: [
      `地図データの時点: ${time}（${age} 日前）`,
      stale
        ? `しきい値 ${days} 日を越えています。切り直しは人の判断です（pnpm tiles:extract）`
        : `しきい値 ${days} 日以内です`,
      `${STALE_FLAG}${String(stale)}`,
    ],
    stale,
  };
}
