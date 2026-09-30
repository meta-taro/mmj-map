/**
 * 利用者が持ち込む POI の source / layer を組み立てる。**ここは純粋関数。**
 *
 * ベース地図の `pois` とは別の層。**ベースには触らない**（D-001・データを持たない）。
 * まとめないのがこの部品の役目で、まとめたいときは `<mmj-cluster>`（D-011）。
 */
import { hasIconFilter, iconImageExpression } from "./icons.js";


/**
 * 既定値。**色は提案であって、承認された色ではない**（baseline §11）。
 * `color` は MapLibre の Marker が元から使っている色、`textColor` と `haloColor` は
 * `styles/modern-dark.json` に既にある値。**新しい色を足していない。**
 */
/**
 * 押せる範囲の半径（px）。**見える点は 5 のまま。**
 *
 * 直径 36px。触る目標の目安（Apple 44pt / Material 48dp）にはまだ届かないが、
 * **密集した地図で隣と重なりすぎない**ところで止めている。
 * **数字は実測で決め直すこと。**
 */
const HIT_RADIUS = 18;

export const POI_DEFAULTS = {
  color: "#3FB1CE",
  textColor: "#D8DCE1",
  haloColor: "#111418",
  // スタイルと同じフォント。増やすと glyphs が 404 になり、地図全体が白くなる
  font: "Noto Sans Regular",
  labelKey: "name",
  minZoom: 13,
};

/**
 * @param {{
 *   id: string,
 *   src: string,
 *   labelKey?: string,
 *   idKey?: string,
 *   iconKey?: string,
 *   icons?: readonly { name: string, url: string }[],
 *   minZoom?: number,
 *   color?: string,
 *   textColor?: string,
 *   attribution?: string,
 * }} input
 * @returns {{ sourceId: string, hitId: string, pickedId: string | null, iconId: string | null,
 *   imageIdFor: (name: string) => string, source: any, layers: any[] }}
 */
export function buildPoiSpec(input) {
  if (!input.id) throw new Error("id が要ります（source 名が衝突すると後勝ちで消えます）");
  if (!input.src) throw new Error("src が要ります（点の GeoJSON の URL）");

  const sourceId = input.id;
  const color = input.color ?? POI_DEFAULTS.color;
  const textColor = input.textColor ?? POI_DEFAULTS.textColor;
  // **件数を知っているのは持ち込む側だけ。**3 件と 3000 件で出しはじめは変わる
  const minzoom = input.minZoom ?? POI_DEFAULTS.minZoom;

  // **地図は単体で持ち歩かれる。**オフラインで端末に入ったあと、
  // 配布元のページは付いて来ない。**出典を地図の外に書いても、読む人には届かない。**
  // 避難所の指定のように「間違っていると人が危ない」データを重ねるときに要る。
  //
  // **渡されたときだけ付ける。**空の出典欄を地図に出しても意味が無いし、
  // 出どころを騙ることになる。MapLibre が `© OpenStreetMap contributors` の隣へ並べる。
  const attribution = typeof input.attribution === "string" ? input.attribution.trim() : "";

  // **選ばれた点を、点そのもので引けるようにする。**
  // `promoteId` を付けると GeoJSON の `properties[idKey]` がその点の id になり、
  // `setFeatureState` で「いまここ」を立てられる。
  // **id が無ければ付けない**（空の `promoteId` は MapLibre が投げる）。
  const idKey = typeof input.idKey === "string" && input.idKey !== "" ? input.idKey : null;
  const pickedId = idKey === null ? null : `${sourceId}-picked`;

  // **絵は、名前と URL の対応を渡されたときだけ出す。**
  // 名前は地図へ入れるときに `<layer-id>--<名前>` にする——1 枚の頁に地図が
  // 何枚も載るので（`themes.html` は 6 枚）、**素の名前だと隣の地図と衝突する**。
  const iconKey = typeof input.iconKey === "string" && input.iconKey !== "" ? input.iconKey : null;
  const icons = Array.isArray(input.icons) ? input.icons : [];
  const iconId = iconKey === null || icons.length === 0 ? null : `${sourceId}-icon`;
  const imageIdFor = (/** @type {string} */ name) => `${sourceId}--${name}`;

  return {
    sourceId,
    hitId: `${sourceId}-hit`,
    pickedId,
    iconId,
    imageIdFor,
    source: {
      type: "geojson",
      data: input.src,
      ...(idKey === null ? {} : { promoteId: idKey }),
      ...(attribution === "" ? {} : { attribution }),
    },
    layers: [
      {
        // **指は点より太い。**見える点は直径 10px（縁を入れて 13px）で、
        // 触る目標の目安（Apple 44pt / Material 48dp）の 1/4 しかない
        // （2026-09-29・点が小さくて指で押しにくい、という指摘）。
        //
        // **見た目は太らせない。**点を大きくすると地図が点で埋まる。
        // 透明な層をもう 1 枚重ねて、**そちらを押す対象にする**。
        //
        // **いちばん下に置く。**上に重ねると、透明でも見える点の縁が濁る。
        // 下にあっても、押す対象としては拾える。
        //
        // **広げると隣と重なる。**どれを開くかは
        // 「指にいちばん近い点」で決める（`nearestByPoint`）。
        id: `${sourceId}-hit`,
        type: "circle",
        source: sourceId,
        minzoom,
        paint: { "circle-radius": HIT_RADIUS, "circle-color": color, "circle-opacity": 0 },
      },
      {
        id: `${sourceId}-dot`,
        type: "circle",
        source: sourceId,
        minzoom,
        // **絵を持つ点には丸を出さない。**重ねると絵の下から丸がはみ出して汚れる。
        // 絵の指定が無ければ誰にも当たらない＝今までどおり全部が丸
        ...(iconKey === null ? {} : { filter: ["!", hasIconFilter(iconKey, icons)] }),
        paint: {
          "circle-color": color,
          "circle-radius": 5,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": POI_DEFAULTS.haloColor,
        },
      },
      // **いま開いている点。**矢印で送ったとき、どれの話なのかが分からないと、
      // カードだけが差し替わって「何が起きたか分からない」状態になる
      // （2026-09-29・送ったときにどれが「いま」か分かること、という指摘）。
      //
      // **別の層にする理由は、密集しているところ。**同じ層の中では前後を選べないので、
      // 隣の点の下に潜る。**1 枚上に置けば、必ず前面に出る。**
      //
      // 選ばれていないうちは半径 0 ＝ 何も出ない。**別の source を作らない**
      // （同じ点を 2 回配ることになり、ずれる余地ができる）。
      ...(pickedId === null
        ? []
        : [
            {
              id: pickedId,
              type: "circle",
              source: sourceId,
              minzoom,
              paint: {
                // **絵があるときは輪を大きくする。**絵（22px）より内側だと
                // 絵に隠れて、選ばれていることが見えない（実測・2026-09-30）
                "circle-radius": ["case", ["boolean", ["feature-state", "picked"], false], iconId === null ? 9 : 16, 0],
                "circle-color": color,
                // **縁は太く。**色だけで差をつけると、配色によっては見分けが付かない
                "circle-stroke-width": ["case", ["boolean", ["feature-state", "picked"], false], 3.5, 0],
                "circle-stroke-color": POI_DEFAULTS.haloColor,
              },
            },
          ]),
      // **一目で何屋か分かるようにする。**点が全部同じ丸だと、
      // カードを 1 枚ずつ開くまで何の店か分からない
      // （2026-09-30・うどん・ラーメン・ケーキ・コーヒーを絵で出したい、という依頼）。
      //
      // **絵は持ち込む側のもの**（D-001）。ここは置き場所と大きさだけ決める。
      // **知らない名前は描かない**ので、分類の無い点は静かに丸のまま。
      ...(iconId === null
        ? []
        : [
            {
              id: iconId,
              type: "symbol",
              source: sourceId,
              minzoom,
              layout: {
                "icon-image": iconImageExpression(/** @type {string} */ (iconKey), icons, imageIdFor),
                // **重なっても消さない。**名前は消えてよいが、
                // **何屋かが消えると地図の意味が変わる**
                "icon-allow-overlap": true,
                "icon-ignore-placement": true,
                // **`feature-state` は layout では使えない**（MapLibre が投げる。
                // 実測・2026-09-30「"feature-state" data expressions are not
                // supported with layout properties」）。
                // **選ばれている点を目立たせるのは `-picked` の丸に任せる**——
                // 絵の後ろに大きな丸が出るので、絵の大きさは変えなくてよい
              },
            },
          ]),
      {
        id: `${sourceId}-label`,
        type: "symbol",
        source: sourceId,
        minzoom,
        layout: {
          // 媒体ごとに name / title / shop_name と違う。**MMJ が決め打ちしない**
          "text-field": ["get", input.labelKey ?? POI_DEFAULTS.labelKey],
          "text-font": [POI_DEFAULTS.font],
          "text-size": 12,
          "text-offset": [0, 1.1],
          "text-anchor": "top",
          // 衝突したら消す。**重ねて出しても読めない**（点は残るので場所は分かる）
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": textColor,
          // 地図の上の字は、縁が無いと背景に溶ける
          "text-halo-color": POI_DEFAULTS.haloColor,
          "text-halo-width": 1.2,
          // **選ばれている点の名前は、地図には出さない。**
          // 吹き出しが同じ名前を出しているので、**同じ文字が 2 つ並ぶ**
          // （実測・2026-09-30。点の上と下に「らーめん 汀」が出ていた）
          ...(pickedId === null
            ? {}
            : { "text-opacity": ["case", ["boolean", ["feature-state", "picked"], false], 0, 1] }),
        },
      },
    ],
  };
}
