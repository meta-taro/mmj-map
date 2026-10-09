/**
 * 経路の描き方を組む。**ここは純粋関数**（地図に触るのは `mmj-route.js`）。
 *
 * **経路を計算しない。**計算には道路グラフとルーティングエンジンが要り、
 * それは D-003（地図サーバーを立てない）の外側にある。
 * **作るのは外（API でも AI でも）で、ここは描くだけ。**
 * 「データを持たない。表現を持つ」の形そのもの。
 *
 * 渡す GeoJSON はこの形:
 *
 *   LineString                      → 経路の線
 *   Point + `instruction`           → 曲がる地点の吹き出し（「コンビニを左折」）
 *   Point + `instruction` + `image` → 写真つきの吹き出し
 *
 * **後から足せる。**経路を描いたあとで案内の点だけ増やしても、同じ形で描ける。
 */
import { isSafeImage } from "./popup.js";

/**
 * 渡されなかったときの値。
 *
 * **色は新しく作っていない**（baseline §11）。`color` は MapLibre の Marker が元から
 * 使っている値で、`casingColor` は `styles/modern-dark.json` の `label-*` の縁取りと同じ。
 * **置く側が属性で差し替えられる**し、`<mmj-map accent>` があればそちらが既定になる。
 */
export const ROUTE_DEFAULTS = {
  color: "#3FB1CE",
  casingColor: "#111418",
  width: 6,
  /** 縁取りは本体より何 px 太いか。**細いと縁にならない** */
  casingExtra: 4,
  /** 案内文を読む属性名。媒体ごとに違うので差し替えられる */
  stepKey: "instruction",
};

/** 線だけを描く。**同じ source に入っている点まで線にしない** */
const LINE_ONLY = ["==", ["geometry-type"], "LineString"];

/**
 * ピンの丸の半径（px）。**写真が入るほうを大きくする。**
 *
 * 写真を既定の点（7px）に入れても、**何かが入っているのか汚れなのか分からない**。
 * 12px は「小さくて何が写っているかは分からないが、写真だと分かる」ところ。
 * **実測で決め直すこと**（2026-10-09 に手元と本番で見て決めた値）。
 */
const PIN_RADIUS = { dot: 7, photo: 12 };

/**
 * 丸の下に付ける尖りの高さ（px）。**先端がその地点になる。**
 *
 * **丸だけだと、どこを指しているのか分からない。**地図の目印は
 * 「先端がその地点」という読み方が共通していて、丸を中央に置くと
 * **半径のぶん、指す場所がぼやける**（2026-10-09 の依頼）。
 *
 * **形は 3 回直している。**全部、実物を見ての指摘（同日）。
 *
 * 1. 8px は小さすぎた——「**さんかくがちいさくて視認できません**」
 * 2. 高さ 15px にしたら鋭くなった——「もうすこし緩和してほしい」
 * 3. 底辺を広げて比を 0.85（ほぼ正三角形）にしても変わらなかった——
 *    「**ちょと鋭利すぎてこわいのでかわいらしいピンがいいのです**」
 *
 * **3 で、比を直す路線そのものが誤りだと分かった。**
 * 原因は比ではなく、**丸と三角を別々に置いていたこと**。
 * 継ぎ目があるので「丸に針が刺さっている」ように見え、
 * 三角をどう整えても消えない。
 *
 * **一体の雫形にする。**本体の丸がそのまま下へ流れて先になる形
 * （地図のピンで一般的な形）。角が立たず、先も短い。
 */

/** 本体の丸の半径。**写真より一回り大きく**、その差がそのまま輪になる */
const PIN_BODY = PIN_RADIUS.photo + 2.5;

/** 本体の丸の下端から、先までの長さ。**短くする**（長いと針に見える） */
const PIN_TAIL = 7;

/**
 * ピンの中に何を出すかを決める。**ここは判断だけ**で、SVG は `mmj-route.js` が組む。
 *
 * ## なぜ要るのか
 *
 * **写真があることは、押す前に分からないといけない。**
 * 2026-10-09 に「**ピンに画像があるとわからないですよ**」と指摘を受けた。
 * 吹き出しを開くまで分からないなら、**写真は無いのと同じ**になる
 * （`3d-route.html` を独立させたときの「押さないと出ない機能は、無いのと同じ」と同型）。
 *
 * **合図のために別の印を足さない。**丸の中が写真になっていれば、
 * **小さくて何が写っているか分からなくても「写真がある」は伝わる**
 * （「ちいさくてみえなくてもよくて、そうするとなんかがぞうあるなってわかる感じ」）。
 * 輪や角マークを足すのは、同じことを二重に言うことになる。
 *
 * **安全でない URL は写真として扱わない。**SVG の `<image href>` は
 * 吹き出しの `<img src>` と同じ経路で危ない URL を踏むので、
 * **`popup.js` と同じ判定**を通す（写すと片方だけ直す事故が起きる）。
 *
 * ## 線の上で溶けないようにする
 *
 * **色だけで描くと、経路の線と同化する。**2026-10-09 に
 * 「みちあんないの線といろがどうかしています。**ボーダーでほそいせんでかこめるといいかも**」
 * と指摘を受けた。線は「色 ＋ 縁取り（casing）」で地図から浮かせているので、
 * **ピンも同じ作りにする**。**新しい色は作らない**（baseline §11）——
 * 線の縁取りと同じ値（`casingColor`）で細く囲う。
 *
 * @param {{ image?: unknown }} step `extractSteps` が返す 1 件
 * @param {string} color 丸と縁の色（`step-color` / `accent` / 既定）
 * @param {string} [casing] 囲いの色。既定は経路の線の縁取りと同じ
 * @returns {{
 *   kind: "photo" | "dot", href: string | null,
 *   radius: number, body: number, tail: number,
 *   width: number, height: number, color: string, casing: string,
 * }}
 */
export function stepPinSpec(step, color, casing = ROUTE_DEFAULTS.casingColor) {
  const image = typeof step?.image === "string" ? step.image.trim() : "";
  const usable = image !== "" && isSafeImage(image);
  const radius = usable ? PIN_RADIUS.photo : PIN_RADIUS.dot;
  const body = usable ? PIN_BODY : radius;
  // 囲い（1.5px）の半分が外へ出る。**箱を少し広く取る**（狭いと縁が欠けて見える）
  const width = Math.round((body + 1) * 2);
  return {
    kind: usable ? "photo" : "dot",
    href: usable ? image : null,
    radius,
    body,
    tail: PIN_TAIL,
    width,
    height: width + PIN_TAIL,
    color,
    casing,
  };
}

/**
 * 経路の source と layer を組む。
 *
 * @param {{ id: string, data: any, color?: string, casingColor?: string, width?: number }} input
 * @returns {{ sourceId: string, source: any, layers: any[] }}
 */
export function buildRouteSpec(input) {
  if (!input.id) {
    // 名前が衝突すると後勝ちで消える。**黙って消えると原因が分からない**
    throw new Error("[mmj-route] id が要ります");
  }
  if (countLines(input.data) === 0) {
    // 空の経路を黙って描かない。「線が出ない」理由をここで言う
    throw new Error("[mmj-route] LineString が 1 本もありません（経路の線が入っていません）");
  }

  const color = input.color ?? ROUTE_DEFAULTS.color;
  const casingColor = input.casingColor ?? ROUTE_DEFAULTS.casingColor;
  const width = input.width ?? ROUTE_DEFAULTS.width;
  const layout = { "line-cap": "round", "line-join": "round" };

  return {
    sourceId: input.id,
    source: { type: "geojson", data: input.data },
    // **縁取りが先、本体が後。**順が逆だと本体が隠れる
    layers: [
      {
        id: `${input.id}-casing`,
        type: "line",
        source: input.id,
        filter: LINE_ONLY,
        layout,
        paint: { "line-color": casingColor, "line-width": width + ROUTE_DEFAULTS.casingExtra },
      },
      {
        id: `${input.id}-line`,
        type: "line",
        source: input.id,
        filter: LINE_ONLY,
        layout,
        paint: { "line-color": color, "line-width": width },
      },
    ],
  };
}

/** @param {any} data */
function features(data) {
  return Array.isArray(data?.features) ? data.features : [];
}

/** @param {any} data */
function countLines(data) {
  return features(data).filter((/** @type {any} */ f) => f?.geometry?.type === "LineString").length;
}

/**
 * 案内文を持つ点を拾う。**壊れたデータでも落ちない**（空を返す）。
 *
 * @param {any} data GeoJSON
 * @param {string} [key] 案内文を読む属性名
 * @returns {{ lngLat: [number, number], text: string, image: string | null }[]}
 */
export function extractSteps(data, key = ROUTE_DEFAULTS.stepKey) {
  /** @type {{ lngLat: [number, number], text: string, image: string | null }[]} */
  const found = [];
  for (const feature of features(data)) {
    if (feature?.geometry?.type !== "Point") continue;
    const text = feature?.properties?.[key];
    if (typeof text !== "string" || text === "") continue;

    const coordinates = feature.geometry.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) continue;

    const image = feature.properties?.["image"];
    found.push({
      lngLat: /** @type {[number, number]} */ ([Number(coordinates[0]), Number(coordinates[1])]),
      text,
      image: typeof image === "string" && image !== "" ? image : null,
    });
  }
  return found;
}

/**
 * 経路ぜんぶが収まる範囲。**座標が無ければ `null`。**
 * `[0,0]` へ寄せない（アフリカ沖の海へ飛ばされると、間違いだと気づきにくい）。
 *
 * @param {any} data GeoJSON
 * @returns {[[number, number], [number, number]] | null} `[[西,南],[東,北]]`
 */
export function routeBounds(data) {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  const visit = (/** @type {any} */ value) => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === "number" && typeof value[1] === "number") {
      west = Math.min(west, value[0]);
      east = Math.max(east, value[0]);
      south = Math.min(south, value[1]);
      north = Math.max(north, value[1]);
      return;
    }
    for (const child of value) visit(child);
  };

  for (const feature of features(data)) visit(feature?.geometry?.coordinates);

  if (west === Infinity) return null;
  return [
    [west, south],
    [east, north],
  ];
}
