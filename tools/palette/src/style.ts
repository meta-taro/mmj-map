/**
 * 土台と色から、完成したスタイルを組み立てる。**ここは純粋関数。**
 *
 * 24 の役割だけを渡す道（`<mmj-map palette-url>`）だけでは足りない場面がある。
 * **配布物に自分のスタイルを同梱したい導入者**は、スタイルそのものを持つ必要がある。
 *
 * 出したものには **`mmj:generated: true`** を残す。
 * 残さないと、**MMJ が手書きしている 6 枚と見分けが付かなくなる**（D-002 / D-021）。
 */
import { applyPalette } from "@mmj-map/elements/palette";

import type { Anchors } from "./derive.js";

export interface BuildOptions {
  /** スタイルの名前。**付けないと、どれを見ているのか分からなくなる** */
  readonly name: string;
  /** どの指し値から作ったか。**後から作り直せるように残す** */
  readonly anchors?: Anchors;
}

/**
 * @param base 土台にするスタイル（`styles/*.json` のどれか、または自前のもの）
 * @param roles 役割ごとの色
 * @param options 名前と、作った元の指し値
 * @returns 新しいスタイル。**`base` は書き換えない**
 */
export function buildStyle(
  base: any,
  roles: Readonly<Record<string, string>>,
  options: BuildOptions,
): any {
  const result = applyPalette(base, roles);
  if (result.applied === 0) {
    // 色を渡したのに 1 つも当たらないスタイルを黙って出さない
    throw new Error(
      "渡した色がどのレイヤにも当たりませんでした。土台のレイヤ id が MMJ の 6 枚と違う可能性があります",
    );
  }

  return {
    ...result.style,
    name: options.name,
    metadata: {
      ...base.metadata,
      // **これが生成物である印。**手書きの 6 枚と混ざらないようにする（D-021）
      "mmj:generated": true,
      "mmj:base": base.name ?? null,
      "mmj:anchors": options.anchors ?? null,
      "mmj:status": "生成物。色は導入者のもので、MMJ は承認していない",
    },
  };
}
