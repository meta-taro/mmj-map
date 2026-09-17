/**
 * 数える側。**ここは純粋関数。**
 *
 * `label-place-city` が `min_zoom` を見ていなかった件は、
 * **タイルを開いて数えて初めて分かった**（`docs/styles/README.md`）。
 * 推測で地図を作らないための道具なので、**数え方に細工をしない**。
 */
import type { PropertyValue } from "./mvt.js";

/**
 * 数えるのに要るのは属性だけ。**幾何の型を要求しない**
 * （要求すると、呼ぶ側とテストが要らない値を用意することになる）。
 */
export interface HasProps {
  readonly props: Record<string, PropertyValue>;
}

export interface Count {
  readonly value: string;
  readonly count: number;
}

/** 属性を持たないものを、どう呼ぶか。**黙って落とさない** */
export const ABSENT = "(なし)";

/**
 * 指定した属性の値ごとに数える。多い順、同数なら値の順。
 * @param features
 * @param key
 */
export function tally(features: readonly HasProps[], key: string): Count[] {
  const counts = new Map<string, number>();
  for (const feature of features) {
    const raw = feature.props[key];
    const value = raw === undefined ? ABSENT : String(raw);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/**
 * その倍率で出る資格があるものだけを返す。
 *
 * **上流の `min_zoom` を捨てない。**これを見落として、
 * 寺の庭が「大阪市」と同じ重みで出ていたことがある。
 *
 * `min_zoom` を持たないものは**出る側**に入れる（上流が黙っている＝制限なし）。
 */
export function visibleAt<T extends HasProps>(features: readonly T[], zoom: number): T[] {
  return features.filter((feature) => {
    const raw = feature.props["min_zoom"];
    if (raw === undefined) return true;
    const min = Number(raw);
    return Number.isFinite(min) ? min <= zoom : true;
  });
}
