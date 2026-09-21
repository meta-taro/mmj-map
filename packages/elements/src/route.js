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
