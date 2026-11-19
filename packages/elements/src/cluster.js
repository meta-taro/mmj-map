/**
 * 点をまとめて描くための source / layer を組み立てる。**ここは純粋関数。**
 *
 * まとめる計算そのものは **MapLibre の GeoJSON source が持っている**（supercluster）。
 * この部品が足しているのは「3 枚のレイヤを排他の filter で置く」という定型だけで、
 * **クラスタリングを自前で実装していない**（PRD §3・厚くしない）。
 */
import {
  ballOffset,
  needleImageExpression,
  ringClusterProperties,
  ringImageExpression,
} from "./machibari.js";
import { needleLayout as needlePlacement } from "./machibari-image.js";

/**
 * 既定値。**色は提案であって、承認された色ではない**（baseline §11）。
 * `color` は MapLibre の Marker が元から使っている色、`textColor` は
 * `styles/modern-dark.json` に既にある値。**新しい色を足していない。**
 */
export const DEFAULTS = {
  color: "#3FB1CE",
  textColor: "#111418",
  pointColor: "#3FB1CE",
  // スタイルと同じフォント。増やすと glyphs が 404 になり、地図全体が白くなる
  font: "Noto Sans Regular",
  // まち針の輪の中の件数。輪の中は地図の地色で塗るので、**地図の上の字と同じ色**
  // （`poi.js` の `textColor` と同じ値。新しい色を足していない）
  labelColor: "#D8DCE1",
  radius: 50,
  maxZoom: 14,
};

/**
 * 0 以上の数として読む。読めなければ既定値。
 * **NaN や負の値を MapLibre へ渡さない**（渡すと source が黙って壊れる）。
 * @param {string | null | undefined} value
 * @param {number} fallback
 * @returns {number}
 */
export function parseCount(value, fallback) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!/^\d+\.?\d*$/.test(trimmed)) return fallback;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** まち針を押せる範囲の半径（px）。`poi.js` の `HIT_RADIUS` と同じ（直径 36px） */
const HIT_RADIUS = 18;

/**
 * ピンの形。**既定は丸**（いままでの見た目を変えない）。
 * `machibari` は、引くと種別の割合の輪、寄るとまち針の斜め刺し（`machibari.js`）。
 * @param {string | null | undefined} value
 * @returns {"circle" | "machibari"}
 */
export function parsePinStyle(value) {
  return typeof value === "string" && value.trim() === "machibari" ? "machibari" : "circle";
}

/**
 * 選んだ点を描き分ける filter。**`icon-image` は feature-state を読めない**ので、
 * 選んだ点は filter で別の層へ移す（同じ点を 2 本描かない）。
 * @param {string} idKey
 * @param {string | null} id `null` なら誰も選ばれていない
 * @returns {{ points: any[], picked: any[] }}
 */
export function pickFilters(idKey, id) {
  const single = ["!", ["has", "point_count"]];
  // **誰も選ばれていないときは、常に偽の式。**`["==", 1, 0]` は古い書式の filter と
  // 読まれて検証で落ち、**層ごと足されなかった**（実物で見た・2026-11-06）
  if (id === null) return { points: single, picked: ["boolean", false] };
  const same = ["==", ["to-string", ["get", idKey]], id];
  return { points: ["all", single, ["!", same]], picked: ["all", single, same] };
}

/**
 * `weightKey` を渡すと、**まとまりの数を点の数ではなく件数の合計**にする
 * （店の座標が無く、駅ごとに「店 ◯ 件」を出す使い方）。**丸の形のときだけ**——
 * まち針の輪は種別の割合を点の数で描くので、件数を混ぜると割合と数が食い違う。
 *
 * `src` は URL でも、読み込んだ GeoJSON でもよい（一覧と繋ぐときは、要素の側で読む）。
 *
 * @param {{
 *   id: string,
 *   src: string | object,
 *   radius?: number,
 *   maxZoom?: number,
 *   color?: string,
 *   textColor?: string,
 *   pointColor?: string,
 *   pin?: "circle" | "machibari",
 *   colorKey?: string | null,
 *   colors?: readonly { name: string, color: string }[],
 *   idKey?: string | null,
 *   weightKey?: string | null,
 *   labelColor?: string,
 * }} input
 * @returns {{ sourceId: string, source: any, layers: any[], pin: "circle" | "machibari",
 *   ids: { clusters: string, hit: string | null, points: string, picked: string | null },
 *   colors: { name: string, color: string }[], fallbackColor: string, casing: string,
 *   idKey: string | null, weightKey: string | null, maxZoom: number }}
 */
export function buildClusterSpec(input) {
  if (!input.id) throw new Error("id が要ります（source 名が衝突すると後勝ちで消えます）");
  if (!input.src) throw new Error("src が要ります（点の GeoJSON の URL）");

  const color = input.color ?? DEFAULTS.color;
  const textColor = input.textColor ?? DEFAULTS.textColor;
  const pointColor = input.pointColor ?? DEFAULTS.pointColor;
  const sourceId = input.id;
  const maxZoom = input.maxZoom ?? DEFAULTS.maxZoom;
  const source = {
    type: "geojson",
    data: input.src,
    cluster: true,
    clusterRadius: input.radius ?? DEFAULTS.radius,
    clusterMaxZoom: maxZoom,
  };

  if (input.pin === "machibari") return buildMachibariSpec(input, { sourceId, source, pointColor, textColor, maxZoom });

  const idKey = nonEmpty(input.idKey);
  const weightKey = nonEmpty(input.weightKey);
  const ids = {
    clusters: `${sourceId}-clusters`,
    hit: null,
    points: `${sourceId}-points`,
    picked: idKey === null ? null : `${sourceId}-picked`,
  };
  const single = ["!", ["has", "point_count"]];
  const filters = idKey === null ? { points: single, picked: null } : pickFilters(idKey, null);
  const count = countOf(weightKey);
  // **件数は大きさで表す。**色を段階で変えると配色を決めたことになる（§11）
  const sized = ["step", count.value, 14, 50, 18, 200, 24];
  /** 件数を持つ点は、ばらでもまとまりと同じ丸にする（「この駅に 12 件」が読めるように） */
  const pointRadius = weightKey === null ? 6 : sized;

  return {
    sourceId,
    pin: "circle",
    ids,
    colors: [],
    fallbackColor: pointColor,
    casing: textColor,
    idKey,
    weightKey,
    maxZoom,
    source: weightKey === null ? source : { ...source, clusterProperties: weightProperties(weightKey) },
    layers: [
      {
        id: ids.clusters,
        type: "circle",
        source: sourceId,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": color,
          "circle-radius": sized,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": textColor,
        },
      },
      countLayer(`${sourceId}-count`, sourceId, ["has", "point_count"], count.label, textColor),
      {
        id: ids.points,
        type: "circle",
        source: sourceId,
        // まとまりに入らなかった点だけ。**排他にしないと二重に出る**
        filter: filters.points,
        paint: {
          "circle-color": pointColor,
          "circle-radius": pointRadius,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": textColor,
        },
      },
      // **選んだ点は縁を太く、一回り大きく、縁は地図の上の字の色**（暗い地図でも縁が見える）。
      // 色は足さない（§11・`labelColor` はスタイルの字の色）
      ...(ids.picked === null
        ? []
        : [
            {
              id: ids.picked,
              type: "circle",
              source: sourceId,
              filter: filters.picked,
              paint: {
                "circle-color": pointColor,
                "circle-radius": weightKey === null ? 9 : ["+", sized, 3],
                "circle-stroke-width": 3,
                "circle-stroke-color": input.labelColor ?? DEFAULTS.labelColor,
              },
            },
          ]),
      // **ばらの点の件数は、点より上。**下に置くと、点の丸に隠れる
      ...(weightKey === null
        ? []
        : [countLayer(`${sourceId}-point-count`, sourceId, ["all", single, ["has", weightKey]], count.label, textColor)]),
    ],
  };
}

/**
 * まとまりに足し上げる件数の名前。**利用側の属性と重ならない名前にする**
 * （`weight` のような属性を持つ点があると、ばらの点で取り違える）。
 */
export const WEIGHT_PROPERTY = "mmj_weight";

/**
 * **まとまりの数は、点の数ではなく件数の合計。**「駅 3 つ」ではなく「店 27 件」を出す。
 * 数として読めない件数は 0 として足す（1 件の読み違いで、まとまり全体を消さない）。
 * @param {string} weightKey
 */
function weightProperties(weightKey) {
  return { [WEIGHT_PROPERTY]: ["+", ["to-number", ["get", weightKey], 0]] };
}

/**
 * 丸に出す数と、大きさを決める数。
 *
 * まとまりは足し上げた合計、**ばらの点は自分の件数**（まとまりではないので合計が無い）。
 * @param {string | null} weightKey
 */
function countOf(weightKey) {
  if (weightKey === null) return { value: ["get", "point_count"], label: ["get", "point_count_abbreviated"] };
  const value = [
    "case",
    ["has", "point_count"],
    ["get", WEIGHT_PROPERTY],
    ["to-number", ["get", weightKey], 0],
  ];
  return { value, label: ["to-string", value] };
}

/**
 * 丸の上の数。**数が出ない丸は、ただの模様になる。**衝突しても必ず出す。
 * @param {string} id @param {string} sourceId @param {any[]} filter @param {any} label @param {string} color
 */
function countLayer(id, sourceId, filter, label, color) {
  return {
    id,
    type: "symbol",
    source: sourceId,
    filter,
    layout: {
      "text-field": label,
      "text-font": [DEFAULTS.font],
      "text-size": 12,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: { "text-color": color },
  };
}

/** @param {unknown} value @returns {string | null} */
function nonEmpty(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * まち針の組み。層は 4 枚——**輪と件数（1 枚に両方）・押せる範囲・まち針・選んだまち針**。
 *
 * **重なる順は画面の縦位置**（`symbol-z-order` の既定 `auto` は、重なりを許す記号を
 * 画面の下にあるものほど手前に描く）。試作の「南ほど手前」と同じになる。
 *
 * @param {Parameters<typeof buildClusterSpec>[0]} input
 * @param {{ sourceId: string, source: any, pointColor: string, textColor: string, maxZoom: number }} base
 * @returns {ReturnType<typeof buildClusterSpec>}
 */
function buildMachibariSpec(input, base) {
  const { sourceId, pointColor, textColor } = base;
  const colorKey = typeof input.colorKey === "string" && input.colorKey !== "" ? input.colorKey : null;
  const colors = colorKey === null || !Array.isArray(input.colors) ? [] : [...input.colors];
  const idKey = typeof input.idKey === "string" && input.idKey !== "" ? input.idKey : null;
  const labelColor = input.labelColor ?? DEFAULTS.labelColor;
  const ids = {
    clusters: `${sourceId}-clusters`,
    hit: `${sourceId}-hit`,
    points: `${sourceId}-points`,
    picked: idKey === null ? null : `${sourceId}-picked`,
  };
  const filters = pickFilters(idKey ?? "", null);
  /** @param {boolean} picked */
  const needleLayout = (picked) => ({
    "icon-image": needleImageExpression({ sourceId, picked, colorKey, colors, fallbackColor: pointColor }),
    // **針先が座標を指す。**素の maplibre-gl へ貸し出す配置と同じものを使う
    ...needlePlacement(picked),
  });

  return {
    sourceId,
    pin: "machibari",
    ids,
    colors,
    fallbackColor: pointColor,
    casing: textColor,
    idKey,
    weightKey: null,
    maxZoom: base.maxZoom,
    source: {
      ...base.source,
      // **種別ごとの件数は MapLibre が数える**（D-011）。対応が無ければ数えない
      ...(colors.length === 0 ? {} : { clusterProperties: ringClusterProperties(String(colorKey), colors) }),
    },
    layers: [
      {
        id: ids.clusters,
        type: "symbol",
        source: sourceId,
        filter: ["has", "point_count"],
        layout: {
          "icon-image": ringImageExpression(sourceId, colors.length),
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": [DEFAULTS.font],
          "text-size": 11,
          // 数が出ない輪は、ただの模様になる。**衝突しても必ず出す**
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: { "text-color": labelColor },
      },
      // **押す目標は玉、見えない丸で広げる。**玉は直径 10px しかなく、指で狙えない
      // （目安 36px 以上・`poi.js` の当たり判定と同じ半径）。**いちばん下**に置く
      {
        id: ids.hit,
        type: "circle",
        source: sourceId,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": HIT_RADIUS,
          "circle-color": pointColor,
          "circle-opacity": 0,
          "circle-translate": ballOffset(false),
        },
      },
      { id: ids.points, type: "symbol", source: sourceId, filter: filters.points, layout: needleLayout(false) },
      // **選んだ点は 1 枚上の層。**同じ層の中では前後を選べないので、隣の針の下に潜る
      ...(ids.picked === null
        ? []
        : [{ id: ids.picked, type: "symbol", source: sourceId, filter: filters.picked, layout: needleLayout(true) }]),
    ],
  };
}
