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

import { labelLayer } from "./circle.js";
import { blurRaster, FILL_BLUR, labelPoints, prepareAreas, SHAPES } from "./fill-blur.js";

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
 * ## 名前の付いた範囲（`color`・`blur`・`labelKey`）
 *
 * 「守谷市」「つくば駅周辺」のような範囲は、値で塗り分けない。**色を 1 つ**渡す
 * （`steps` と `valueKey` の代わり）。`blur`（m）で縁から外へ薄くし、
 * `labelKey` の属性を名札にする。**ぼかしと名札には形そのものが要る**ので、
 * `src` に URL ではなく GeoJSON を渡す（要素の側で取ってから渡す）。仕組みは `fill-blur.js`。
 *
 * @param {{
 *   id: string,
 *   src: string | object,
 *   valueKey?: string,
 *   steps?: readonly { at: number, color: string }[],
 *   color?: string,
 *   opacity?: number,
 *   attribution?: string,
 *   blur?: number,
 *   labelKey?: string,
 * }} input
 * @returns {{ sourceId: string, source: any, layers: any[], raster?: any }}
 */
export function buildFillSpec(input) {
  if (!input.id) throw new Error("id が要ります（source 名が衝突すると後勝ちで消えます）");
  if (!input.src) throw new Error("src が要ります（面の GeoJSON の URL）");
  const color = fillColor(input);

  const attribution = typeof input.attribution === "string" ? input.attribution.trim() : "";
  const blur = typeof input.blur === "number" && Number.isFinite(input.blur) && input.blur > 0 ? input.blur : 0;
  const labelKey = typeof input.labelKey === "string" ? input.labelKey.trim() : "";
  const opacity =
    typeof input.opacity === "number" ? input.opacity : blur > 0 ? FILL_BLUR.opacity : FILL_DEFAULTS.opacity;
  const source = (/** @type {unknown} */ data) => ({
    type: "geojson",
    data,
    // **出典と時点は、地図の中に出す。**持ち出された先では配布元の頁は付いて来ない
    ...(attribution === "" ? {} : { attribution }),
  });
  const fill = {
    id: `${input.id}-fill`,
    type: "fill",
    source: input.id,
    // **下の地図が読めなくなると、避難に使えない**
    paint: { "fill-color": color, "fill-opacity": opacity },
  };

  if (blur === 0 && labelKey === "") return { sourceId: input.id, source: source(input.src), layers: [fill] };

  if (typeof input.src === "string") {
    throw new Error("blur と label-key には形そのものが要ります（src の URL を取ってから GeoJSON で渡してください）");
  }
  const prepared = prepareAreas(input.src);
  if (prepared === null) throw new Error("描ける形がありません（Polygon / MultiPolygon が 0 件）");

  const labels = labelKey === "" ? [] : labelPoints(prepared.data, labelKey);
  const label = labels.length > 0 ? [labelLayer(input.id)] : [];

  if (blur === 0) {
    const data = { type: "FeatureCollection", features: [...prepared.data.features, ...labels] };
    return { sourceId: input.id, source: source(data), layers: [{ ...fill, filter: SHAPES }, ...label] };
  }

  // **ぼかした範囲は、地表に貼った 1 枚の画像で描く**（濃さは形までの距離で決める。`fill-blur.js`）。
  // 名札（と出典）は、これまでどおり GeoJSON の source に載せる
  const rasterId = `${input.id}-blur`;
  const raster = { sourceId: rasterId, color, ...blurRaster(prepared.data, blur) };
  const layer = {
    id: rasterId,
    type: "raster",
    source: rasterId,
    paint: { "raster-opacity": opacity, "raster-resampling": "linear", "raster-fade-duration": 0 },
  };
  return {
    sourceId: input.id,
    source: source({ type: "FeatureCollection", features: labels }),
    raster,
    layers: [layer, ...label],
  };
}

/**
 * 塗りの色。**`color` が 1 つ**なら範囲の色、無ければ `steps` で値を塗り分ける。
 * @param {{ color?: string, valueKey?: string, steps?: readonly { at: number, color: string }[] }} input
 * @returns {unknown}
 */
function fillColor(input) {
  if (typeof input.color === "string" && input.color.trim() !== "") {
    const color = input.color.trim();
    // **スタイルへそのまま渡る値**なので、色に見えないものは通さない
    if (!isColorLike(color)) throw new Error(`color を色として読めません: ${color}`);
    return color;
  }
  if (!input.valueKey) throw new Error("value-key が要ります（どの属性で塗り分けるか）");
  if (!Array.isArray(input.steps) || input.steps.length === 0) {
    throw new Error("steps が要ります（例: 0.5:#cfe8ff,3:#3b82f6）");
  }
  // **最初のしきい値より下は塗らない。**0.1m の浸水を薄い青で塗ると、
  // **浸水していない場所と見分けがつかない**まま色だけが付く。
  // 値が無い地物も同じ（`to-number` の既定を -1 にして、必ず下へ落とす）
  /** @type {any[]} */
  const color = ["step", ["to-number", ["get", input.valueKey], -1], "transparent"];
  for (const step of input.steps) color.push(step.at, step.color);
  return color;
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
