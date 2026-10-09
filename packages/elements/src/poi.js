/**
 * 利用者が持ち込む POI の source / layer を組み立てる。**ここは純粋関数。**
 *
 * ベース地図の `pois` とは別の層。**ベースには触らない**（D-001・データを持たない）。
 * まとめないのがこの部品の役目で、まとめたいときは `<mmj-cluster>`（D-011）。
 */
import { hasIconFilter } from "./icons.js";
import { PIN_PHOTO, pinImageExpression } from "./pin.js";


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
 *   pinImage?: string,
 *   pinColorKey?: string,
 *   pinColors?: readonly { name: string, color: string }[],
 *   minZoom?: number,
 *   color?: string,
 *   textColor?: string,
 *   attribution?: string,
 * }} input
 * @returns {{ sourceId: string, hitId: string, pickedId: string | null,
 *   pinId: string | null, pinHitId: string | null, source: any, layers: any[] }}
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

  // **写真を持つ点は、ピンの中に写真を出す。**
  // 押す前に「ここに写真がある」と分かるようにするため（2026-10-09）。
  // 絵は**地物ごとに別**なので、分類ごとの `icons` とは別の仕組みが要る——
  // **先に全部登録しない。**MapLibre が描こうとしたぶんだけ要素側が作る
  // （`styleimagemissing`）。1,027 件あっても、作るのは画面に出ている数十枚だけ。
  const pinKey = typeof input.pinImage === "string" && input.pinImage !== "" ? input.pinImage : null;

  // **ピンになる点**（写真を持つ点と、分類の絵を持つ点）。
  // **絵もピンの形に入れる**ので、同じ扱いになる（2026-10-09）——
  // 片方だけ平らな丸だと、同じ地図に 2 種類の目印が並んで読み分けられない。
  const covered = [
    ...(iconKey === null ? [] : [hasIconFilter(iconKey, icons)]),
    ...(pinKey === null ? [] : [["has", pinKey]]),
  ];
  const coveredFilter = covered.length === 0
    ? null
    : covered.length === 1
      ? covered[0]
      : ["any", ...covered];

  // **ピンは座標の上に立つ。**当たり判定は座標を中心にした丸のままなので、
  // **絵や写真のところを押しても反応しない**（触れそうに見えて触れないのは、無いより悪い）。
  // 中心ぶんだけ持ち上げた当たり判定を、もう 1 枚足す。
  const pinId = coveredFilter === null ? null : `${sourceId}-pin`;
  const pinHitId = coveredFilter === null ? null : `${sourceId}-hit-pin`;

  // **同じ点に丸とピンを重ねない。**重なると下からはみ出して汚れる
  const plainOnly = coveredFilter === null ? {} : { filter: ["!", coveredFilter] };

  return {
    sourceId,
    hitId: `${sourceId}-hit`,
    pickedId,
    pinId,
    pinHitId,
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
      // **ピンの写真のところも押せるようにする。**`circle-translate` は層ごとなので、
      // **ピンを出す点だけの層**にする（丸のままの点を持ち上げると、ずれて押せなくなる）
      ...(pinHitId === null
        ? []
        : [
            {
              id: pinHitId,
              type: "circle",
              source: sourceId,
              minzoom,
              filter: coveredFilter,
              paint: {
                "circle-radius": HIT_RADIUS,
                "circle-color": color,
                "circle-opacity": 0,
                // 画像は下端が座標。写真の中心は、そこから `height - width/2` だけ上
                "circle-translate": [0, -(PIN_PHOTO.height - PIN_PHOTO.width / 2)],
              },
            },
          ]),
      {
        id: `${sourceId}-dot`,
        type: "circle",
        source: sourceId,
        minzoom,
        // **絵やピンを持つ点には丸を出さない。**重ねると下から丸がはみ出して汚れる。
        // どちらの指定も無ければ誰にも当たらない＝今までどおり全部が丸
        ...plainOnly,
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
      // **ピンを出す点の「いまここ」。**ピンは座標の上に立つので、
      // 印を座標へ置くと**ピンの下に青い丸が離れて出る**（実測で見た）。
      // 当たり判定と同じだけ持ち上げて、写真を囲む輪にする。
      ...(pickedId === null || coveredFilter === null
        ? []
        : [
            {
              id: `${pickedId}-pin`,
              type: "circle",
              source: sourceId,
              minzoom,
              filter: coveredFilter,
              paint: {
                // ピンの本体（半径 14.5）より外。**内側だと写真に隠れる**
                "circle-radius": ["case", ["boolean", ["feature-state", "picked"], false], 19, 0],
                "circle-color": "transparent",
                "circle-stroke-width": ["case", ["boolean", ["feature-state", "picked"], false], 3, 0],
                "circle-stroke-color": color,
                "circle-translate": [0, -(PIN_PHOTO.height - PIN_PHOTO.width / 2)],
              },
            },
          ]),
      ...(pickedId === null
        ? []
        : [
            {
              id: pickedId,
              type: "circle",
              source: sourceId,
              minzoom,
              // **ピンになる点は、上の層が受け持つ**（二重に出さない）
              ...(coveredFilter === null ? {} : { filter: ["!", coveredFilter] }),
              paint: {
                // **絵があるときは輪を大きくする。**絵（22px）より内側だと
                // 絵に隠れて、選ばれていることが見えない（実測・2026-09-30）
                // ここは丸のままの点だけ（絵も写真もピンの層が受け持つ）
                "circle-radius": ["case", ["boolean", ["feature-state", "picked"], false], 9, 0],
                "circle-color": color,
                // **縁は太く。**色だけで差をつけると、配色によっては見分けが付かない
                "circle-stroke-width": ["case", ["boolean", ["feature-state", "picked"], false], 3.5, 0],
                "circle-stroke-color": POI_DEFAULTS.haloColor,
              },
            },
          ]),
      // **写真を持つ点は、ピンの中に写真。**押す前に「写真がある」と分かるように
      // （2026-10-09・「ピンに画像があるとわからないですよ」）。
      //
      // **`icon-anchor` は `bottom`。**ピンは先がその地点を指す形なので、
      // 中心を合わせると**半径のぶん、指す場所がずれる**。
      //
      // 絵は要素側が作る。**ここが指す id のうち、MapLibre が実際に描こうとした
      // ぶんだけ**問い合わせが来る（`styleimagemissing`）。
      ...(pinId === null
        ? []
        : [
            {
              id: pinId,
              type: "symbol",
              source: sourceId,
              minzoom,
              filter: coveredFilter,
              layout: {
                "icon-image": pinImageExpression({
                  sourceId,
                  photoKey: pinKey,
                  iconKey,
                  icons,
                  colorKey: typeof input.pinColorKey === "string" && input.pinColorKey !== "" ? input.pinColorKey : null,
                  colors: Array.isArray(input.pinColors) ? input.pinColors : [],
                  fallbackColor: color,
                }),
                "icon-anchor": "bottom",
                // **重なっても消さない。**写真があることが消えると、合図の意味が無くなる
                "icon-allow-overlap": true,
                "icon-ignore-placement": true,
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
