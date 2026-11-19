/**
 * 海岸線と県境を、**図の下地として**取り出す。地図の部品は使わない。
 *
 * ```js
 * import { PMTiles } from "pmtiles";
 * import { extractOutline, svgHeight, toSvgPath } from "@mmj-map/elements/outline";
 *
 * const bbox = [128, 30, 146, 46];
 * const outline = await extractOutline({ source: new PMTiles(url), bbox, zoom: 5 });
 * const height = svgHeight(bbox, 600);
 * const land = toSvgPath(outline.features.filter((f) => f.properties.kind === "land"), { bbox, width: 600, height });
 * ```
 *
 * 天気図の解説図（台風の進路予想図など）を SVG で自前で描いている頁が、
 * 海岸線を手で点を打って描かなくて済むように。
 *
 * - **新しいデータを持たない。**元はデモと同じ Protomaps のベースタイル（`earth` と `boundaries` の層）
 * - **サーバーを立てない。**PMTiles を HTTP Range で読む（`source` に `getZxy` を持つものを渡す）。
 *   ブラウザでも Node でも同じ関数で動く
 * - **独自に間引かない。**低いズームのタイルが既に持っている粗さを使う（ズームで粗さを選ぶ）
 *
 * ## タイルの継ぎ目を見せない
 *
 * タイルは 1 枚ずつ縁で切られ、縁の外に「のりしろ」が付いている。そのまま描くと、
 * **陸の輪郭にタイルの縁の線が混ざる。**だから 3 つに分けて返す:
 *
 * | `kind` | 形 | 描き方 |
 * |---|---|---|
 * | `land` | 面（のりしろ付き） | **塗りだけ。**隣のタイルと重なるので、継ぎ目に隙間が出ない |
 * | `coastline` | 線（タイルの中だけ） | 輪郭を引くならこちら。タイルの縁に沿った線は入っていない |
 * | `country`・`region` | 線（タイルの中だけ） | 国境・都道府県境。重なって二重に引かれない |
 *
 * 線はタイルの縁で切れているが、隣のタイルの線と同じ所で始まる。
 * **`stroke-linecap="round"` で引くと、切れ目は見えない。**
 */
import { decodeTile } from "./mvt.js";

/** 帰属表示。**取り出した形を使うなら、図のどこかに出す**（OpenStreetMap は ODbL） */
export const OUTLINE_ATTRIBUTION = "© OpenStreetMap contributors";

/**
 * 1 回で読むタイルの上限。**超えたら読まずに断る**——ズームを上げすぎた日本全体は
 * 数千枚になり、ブラウザが固まる（ズームを下げてもらう）。
 */
export const OUTLINE_LIMITS = { maxTiles: 64, maxZoom: 15 };

/** 既定で返す境界の種類。`county`（市区町村）は図の下地には細かすぎる */
const DEFAULT_BOUNDARIES = ["country", "region"];

/** @typedef {[number, number, number, number]} BBox `[西, 南, 東, 北]`（経度緯度） */

/**
 * @typedef {{ getZxy(z: number, x: number, y: number): Promise<{ data: ArrayBuffer } | undefined> }} TileSource
 *   `pmtiles` の `PMTiles` がそのまま渡せる
 */

/** @param {number} lat */
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

/**
 * 範囲を覆うタイルの番号。**南北の端（±85°）は切る**（メルカトルの外）。
 * @param {BBox} bbox
 * @param {number} zoom
 * @returns {{ z: number, x: number, y: number }[]}
 */
export function tilesFor(bbox, zoom) {
  const n = 2 ** zoom;
  const clamp = (/** @type {number} */ v) => Math.min(n - 1, Math.max(0, Math.floor(v)));
  const tileX = (/** @type {number} */ lng) => ((lng + 180) / 360) * n;
  const tileY = (/** @type {number} */ lat) => ((1 - mercY(Math.max(-85, Math.min(85, lat))) / Math.PI) / 2) * n;
  const [west, south, east, north] = bbox;
  const x0 = clamp(tileX(west));
  // **東の端がちょうどタイルの縁なら、その先のタイルは要らない**
  const x1 = clamp(tileX(east) - 1e-9);
  const y0 = clamp(tileY(north));
  const y1 = clamp(tileY(south) - 1e-9);
  /** @type {{ z: number, x: number, y: number }[]} */
  const tiles = [];
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) tiles.push({ z: zoom, x, y });
  return tiles;
}

/**
 * タイルの中の座標を経度緯度にする。
 * @param {{ z: number, x: number, y: number }} tile
 * @param {number} extent
 * @returns {(point: number[]) => [number, number]}
 */
function toLngLat(tile, extent) {
  const n = 2 ** tile.z;
  return ([px = 0, py = 0]) => {
    const lng = ((tile.x + px / extent) / n) * 360 - 180;
    const y = (tile.y + py / extent) / n;
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
    return [lng, lat];
  };
}

/**
 * 線分を、タイルの四角（0〜extent）の中に切る（Liang–Barsky）。外なら `null`。
 * @param {number[]} a
 * @param {number[]} b
 * @param {number} extent
 * @returns {[number[], number[]] | null}
 */
function clipSegment(a, b, extent) {
  const [ax = 0, ay = 0] = a;
  const [bx = 0, by = 0] = b;
  const dx = bx - ax;
  const dy = by - ay;
  let t0 = 0;
  let t1 = 1;
  /** @type {[number, number][]} */
  const edges = [
    [-dx, ax],
    [dx, extent - ax],
    [-dy, ay],
    [dy, extent - ay],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return null;
  }
  return [
    [ax + t0 * dx, ay + t0 * dy],
    [ax + t1 * dx, ay + t1 * dy],
  ];
}

/**
 * 四角の縁の上を走る線分か。**のりしろを縁で切ると、縁に沿った線が残る**——
 * それは海岸線ではなく、タイルの切れ目。
 * @param {number[]} a
 * @param {number[]} b
 * @param {number} extent
 */
function onEdge(a, b, extent) {
  const [ax, ay] = a;
  const [bx, by] = b;
  return (
    (ax === 0 && bx === 0) || (ax === extent && bx === extent) || (ay === 0 && by === 0) || (ay === extent && by === extent)
  );
}

/**
 * 線（または閉じた環）を、タイルの中の部分だけの線の並びにする。
 * **縁に沿った部分は捨てる。**つながっている所は 1 本のまま。
 *
 * @param {number[][]} line タイルの中の座標
 * @param {number} extent
 * @param {boolean} closed 環なら最後の点から最初の点へも結ぶ
 * @returns {number[][][]}
 */
export function clipToTile(line, extent, closed) {
  const points = closed && line.length > 2 ? [...line, /** @type {number[]} */ (line[0])] : line;
  /** @type {number[][][]} */
  const out = [];
  /** @type {number[][]} */
  let current = [];
  for (let i = 1; i < points.length; i += 1) {
    const clipped = clipSegment(/** @type {number[]} */ (points[i - 1]), /** @type {number[]} */ (points[i]), extent);
    if (clipped === null || onEdge(clipped[0], clipped[1], extent)) {
      if (current.length > 1) out.push(current);
      current = [];
      continue;
    }
    const [start, end] = clipped;
    const last = current.at(-1);
    if (last === undefined || last[0] !== start[0] || last[1] !== start[1]) {
      if (current.length > 1) out.push(current);
      current = [start];
    }
    current.push(end);
  }
  if (current.length > 1) out.push(current);
  return out;
}

/**
 * MVT の面の環を、面ごとに束ねる。**外周はタイル座標（y が下向き）で面積が正**、
 * 穴は負（MVT の決まり）。
 * @param {number[][][]} rings
 * @returns {number[][][][]}
 */
function groupRings(rings) {
  /** @type {number[][][][]} */
  const polygons = [];
  for (const ring of rings) {
    if (ring.length < 3) continue;
    const closed = [...ring, /** @type {number[]} */ (ring[0])];
    let area = 0;
    for (let i = 1; i < closed.length; i += 1) {
      const [x0 = 0, y0 = 0] = /** @type {number[]} */ (closed[i - 1]);
      const [x1 = 0, y1 = 0] = /** @type {number[]} */ (closed[i]);
      area += x0 * y1 - x1 * y0;
    }
    if (area > 0 || polygons.length === 0) polygons.push([closed]);
    else polygons.at(-1)?.push(closed);
  }
  return polygons;
}

/**
 * タイル 1 枚から、陸・海岸線・境界を取り出す。
 * @param {import("./mvt.js").TileLayer[]} layers
 * @param {{ z: number, x: number, y: number }} tile
 * @param {readonly string[]} boundaryKinds
 * @returns {any[]}
 */
export function outlineFromTile(layers, tile, boundaryKinds) {
  /** @type {any[]} */
  const features = [];
  for (const layer of layers) {
    const lngLat = toLngLat(tile, layer.extent);
    const toLine = (/** @type {number[][]} */ line) => line.map(lngLat);
    for (const feature of layer.features) {
      if (layer.name === "earth" && feature.type === 3) {
        const polygons = groupRings(feature.geometry);
        if (polygons.length === 0) continue;
        features.push(geo("land", "MultiPolygon", polygons.map((polygon) => polygon.map(toLine))));
        const coast = feature.geometry.flatMap((ring) => clipToTile(ring, layer.extent, true));
        if (coast.length > 0) features.push(geo("coastline", "MultiLineString", coast.map(toLine)));
      } else if (layer.name === "boundaries" && feature.type === 2) {
        const kind = String(feature.properties.kind ?? "");
        if (!boundaryKinds.includes(kind)) continue;
        const lines = feature.geometry.flatMap((line) => clipToTile(line, layer.extent, false));
        if (lines.length > 0) features.push(geo(kind, "MultiLineString", lines.map(toLine)));
      }
    }
  }
  return features;
}

/** @param {string} kind @param {string} type @param {any} coordinates */
function geo(kind, type, coordinates) {
  return { type: "Feature", properties: { kind }, geometry: { type, coordinates } };
}

/**
 * 範囲の海岸線と境界を取り出す。
 *
 * @param {{
 *   source: TileSource,
 *   bbox: BBox,
 *   zoom: number,
 *   boundaries?: readonly string[],
 * }} input `boundaries` は境界の種類（既定 `country`・`region`。`county` で市区町村）
 * @returns {Promise<{ type: "FeatureCollection", features: any[], attribution: string,
 *   zoom: number, tiles: number, missing: number }>} `missing` は書庫に無かったタイルの数
 */
export async function extractOutline(input) {
  const { source, bbox, zoom } = input;
  if (!isBBox(bbox)) throw new Error(`範囲は [西, 南, 東, 北] の経度緯度で渡してください: ${JSON.stringify(bbox)}`);
  if (!Number.isInteger(zoom) || zoom < 0 || zoom > OUTLINE_LIMITS.maxZoom) {
    throw new Error(`ズームは 0〜${OUTLINE_LIMITS.maxZoom} の整数で渡してください: ${zoom}`);
  }
  if (typeof source?.getZxy !== "function") throw new Error("source には getZxy を持つもの（pmtiles の PMTiles）を渡してください");

  const tiles = tilesFor(bbox, zoom);
  if (tiles.length > OUTLINE_LIMITS.maxTiles) {
    // **黙って一部だけ返さない。**欠けた海岸線は「そういう形」に見える
    throw new Error(`タイルが ${tiles.length} 枚になります（上限 ${OUTLINE_LIMITS.maxTiles}）。ズームを下げるか、範囲を狭めてください`);
  }
  const kinds = input.boundaries ?? DEFAULT_BOUNDARIES;
  const results = await Promise.all(tiles.map(async (tile) => ({ tile, found: await source.getZxy(tile.z, tile.x, tile.y) })));

  /** @type {any[]} */
  const features = [];
  let missing = 0;
  for (const { tile, found } of results) {
    if (found === undefined || found === null) {
      missing += 1;
      continue;
    }
    features.push(...outlineFromTile(decodeTile(new Uint8Array(found.data), ["earth", "boundaries"]), tile, kinds));
  }
  return { type: "FeatureCollection", features, attribution: OUTLINE_ATTRIBUTION, zoom, tiles: tiles.length, missing };
}

/** @param {unknown} bbox @returns {bbox is BBox} */
function isBBox(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(Number.isFinite)) return false;
  const [west, south, east, north] = bbox;
  return west < east && south < north && south >= -90 && north <= 90;
}

/**
 * 範囲を、縦横の比を崩さずに描く高さ（px）。
 * @param {BBox} bbox
 * @param {number} width
 * @param {"mercator" | "equirectangular"} [projection]
 */
export function svgHeight(bbox, width, projection = "mercator") {
  const [west, south, east, north] = bbox;
  const span = ((east - west) * Math.PI) / 180;
  const tall = projection === "mercator" ? mercY(north) - mercY(south) : ((north - south) * Math.PI) / 180;
  return Math.round((width * tall) / span);
}

/**
 * GeoJSON を SVG の `d` 文字列にする。範囲の北西の角が `(0, 0)`、南東の角が `(width, height)`。
 *
 * - 線は `M … L …`、面の環は `M … Z`。**面は `fill-rule="nonzero"`（SVG の既定）で塗る**——
 *   隣のタイルと重なった所は `evenodd` だと抜ける
 * - 座標は `precision` 桁に丸め、丸めて同じになった点は捨てる（文字を減らす）
 *
 * @param {readonly any[] | { features: readonly any[] }} input Feature の並びか FeatureCollection
 * @param {{ bbox: BBox, width: number, height: number, projection?: "mercator" | "equirectangular", precision?: number }} view
 * @returns {string}
 */
export function toSvgPath(input, view) {
  const features = Array.isArray(input) ? input : /** @type {any} */ (input)?.features ?? [];
  const project = projector(view);
  const scale = 10 ** (view.precision ?? 1);
  const round = (/** @type {number} */ v) => Math.round(v * scale) / scale;
  /** @type {string[]} */
  const parts = [];
  /** @param {number[][]} line @param {boolean} closed */
  const draw = (line, closed) => {
    let last = "";
    /** @type {string[]} */
    const points = [];
    for (const position of line) {
      const [x, y] = project(position);
      const text = `${round(x)} ${round(y)}`;
      if (text !== last) points.push(text);
      last = text;
    }
    if (points.length < 2) return;
    parts.push(`M${points[0]}L${points.slice(1).join(" ")}${closed ? "Z" : ""}`);
  };
  for (const feature of features) {
    const geometry = feature?.geometry;
    if (!geometry) continue;
    const c = geometry.coordinates;
    if (geometry.type === "LineString") draw(c, false);
    else if (geometry.type === "MultiLineString") for (const line of c) draw(line, false);
    else if (geometry.type === "Polygon") for (const ring of c) draw(ring, true);
    else if (geometry.type === "MultiPolygon") for (const polygon of c) for (const ring of polygon) draw(ring, true);
  }
  return parts.join("");
}

/**
 * @param {{ bbox: BBox, width: number, height: number, projection?: "mercator" | "equirectangular" }} view
 * @returns {(position: number[]) => [number, number]}
 */
function projector(view) {
  const [west, south, east, north] = view.bbox;
  const mercator = (view.projection ?? "mercator") === "mercator";
  const top = mercator ? mercY(north) : north;
  const bottom = mercator ? mercY(south) : south;
  return ([lng = 0, lat = 0]) => {
    const y = mercator ? mercY(Math.max(-85, Math.min(85, lat))) : lat;
    return [((lng - west) / (east - west)) * view.width, ((top - y) / (top - bottom)) * view.height];
  };
}
