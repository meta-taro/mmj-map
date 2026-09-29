/**
 * 面を値で塗り分ける（浸水深・地盤・震度・土砂災害の区域）。**ここは純粋関数。**
 *
 * ## 色はこちらで作らない
 *
 * ハザードマップの配色は、**国や自治体が決めた意味のある色**です
 * （浸水深の青、土砂災害の黄と赤）。**独自配色に置き換えると誤読を生みます**
 * ——`CLAUDE.md`「外界が色を決めているものは、配色ルールの適用外」。
 *
 * だから `steps` は**置く側が渡すもの**で、MMJ は並べ替えて描くだけです。
 *
 * ## MMJ は判断しない
 *
 * **「ここは危ない」とも「逃げろ」とも言いません。**渡された値を、
 * 渡された色で塗るところまでです（PRD §3 /
 * `docs/elements/README.md` の「防災・避難で使うときの約束」）。
 */

/** 既定値。**色は持たない**（置く側が渡す）ので、ここにあるのは濃さだけ */
export const FILL_DEFAULTS = {
  /**
   * 透かし具合。**下の地図が読めなくなると、避難に使えない。**
   * 道と建物が透けて見える濃さに置いている。**実測で詰め直すこと。**
   */
  opacity: 0.55,
};

/**
 * 色として通してよい形か。
 *
 * **スタイルへそのまま渡る値**なので、`url(...)` のようなものを
 * 入れられる経路を作らない。**迷ったら通さない。**
 *
 * @param {string} value
 */
function isColorLike(value) {
  // `;` `{` `}` を含むものは、そもそも色ではない
  if (/[;{}]/.test(value)) return false;
  if (/^#[0-9a-f]{3,8}$/i.test(value)) return true;
  // 関数形は rgb / rgba / hsl / hsla だけに限る
  if (/^(rgb|rgba|hsl|hsla)\([^()]*\)$/i.test(value)) return true;
  // 色の名前（`rebeccapurple` など）。**英字だけ**に限る
  return /^[a-z]+$/i.test(value);
}

/**
 * `steps` の指定を読む。**「しきい値:色」の組。**
 *
 *     steps="0.5:#cfe8ff,1:#8ec6ff,3:#3b82f6,5:#1e3a8a"
 *
 * **小さい順に並べ直す。**MapLibre の `step` は昇順でないと落ちる。
 * **壊れた組は飛ばす**（1 か所の書き間違いで、面が丸ごと消えるほうが分かりにくい）。
 *
 * @param {string | null | undefined} attribute
 * @returns {{ at: number, color: string }[]}
 */
export function parseSteps(attribute) {
  if (typeof attribute !== "string" || attribute.trim() === "") return [];

  /** @type {{ at: number, color: string }[]} */
  const steps = [];
  for (const chunk of attribute.split(",")) {
    const at = chunk.indexOf(":");
    if (at < 0) continue;
    const head = chunk.slice(0, at).trim();
    const value = head === "" ? Number.NaN : Number(head);
    const color = chunk.slice(at + 1).trim();
    if (!Number.isFinite(value) || color === "" || !isColorLike(color)) continue;
    steps.push({ at: value, color });
  }
  return steps.sort((a, b) => a.at - b.at);
}

/**
 * 面の source / layer を組む。
 *
 * **ベース地図には触らない**（D-001・データを持たない）。別 source を重ねるだけ。
 *
 * @param {{
 *   id: string,
 *   src: string,
 *   valueKey: string,
 *   steps: readonly { at: number, color: string }[],
 *   opacity?: number,
 *   attribution?: string,
 * }} input
 * @returns {{ sourceId: string, source: any, layers: any[] }}
 */
export function buildFillSpec(input) {
  if (!input.id) throw new Error("id が要ります（source 名が衝突すると後勝ちで消えます）");
  if (!input.src) throw new Error("src が要ります（面の GeoJSON の URL）");
  if (!input.valueKey) throw new Error("value-key が要ります（どの属性で塗り分けるか）");
  if (!Array.isArray(input.steps) || input.steps.length === 0) {
    throw new Error("steps が要ります（例: 0.5:#cfe8ff,3:#3b82f6）");
  }

  const attribution = typeof input.attribution === "string" ? input.attribution.trim() : "";

  // **最初のしきい値より下は塗らない。**0.1m の浸水を薄い青で塗ると、
  // **浸水していない場所と見分けがつかない**まま色だけが付く。
  // 値が無い地物も同じ（`to-number` の既定を -1 にして、必ず下へ落とす）
  /** @type {any[]} */
  const color = ["step", ["to-number", ["get", input.valueKey], -1], "transparent"];
  for (const step of input.steps) color.push(step.at, step.color);

  return {
    sourceId: input.id,
    source: {
      type: "geojson",
      data: input.src,
      // **出典と時点は、地図の中に出す。**持ち出された先では配布元の頁は付いて来ない
      ...(attribution === "" ? {} : { attribution }),
    },
    layers: [
      {
        id: `${input.id}-fill`,
        type: "fill",
        source: input.id,
        paint: {
          "fill-color": color,
          // **下の地図が読めなくなると、避難に使えない**
          "fill-opacity": typeof input.opacity === "number" ? input.opacity : FILL_DEFAULTS.opacity,
        },
      },
    ],
  };
}

/**
 * 凡例に出す項目。**色だけ出しても、濃い青が何メートルかは誰にも分からない。**
 *
 * 区間で読ませ、**最後は「以上」**にする
 * （上限を書くと、そこで終わると読めてしまう）。
 *
 * @param {readonly { at: number, color: string }[]} steps **昇順であること**
 * @returns {{ label: string, color: string }[]}
 */
export function legendItems(steps) {
  if (!Array.isArray(steps)) return [];
  return steps.map((step, index) => {
    const next = steps[index + 1];
    return {
      label: next === undefined ? `${step.at} 以上` : `${step.at} 〜 ${next.at}`,
      color: step.color,
    };
  });
}
