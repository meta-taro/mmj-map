/**
 * 名前の付いた範囲を**形で**渡すときの、ぼかしと名札。**ここは純粋関数。**
 *
 * 「守谷市」「つくば駅周辺」のような範囲は、形そのものが「確かにここ」の芯で、
 * **縁から外へ `blur` m かけて薄くなる**ように描く（円は半径を挟んでぼかすが、
 * 形は縁より内側を削らない。境界の内側は確かにその範囲なので）。
 *
 * ## 地表の m で測った距離から濃さを決める
 *
 * 形を小さな画像に描き、**外側の各画素から形までの距離**を測って（距離変換）、
 * 縁で `opacity`、`blur` m 先で 0 になるよう直線で薄くする。その画像を、
 * 地表の 4 隅に貼り付けて地図へ重ねる。**倍率を変えても同じ場所を指す。**
 *
 * 2026-11-19、最初は縁に沿った線を外へずらして重ねたが、**へこんだ角と穴の角で線が
 * 自分と重なり、扇形の筋が出た**（ズーム 15 で画面で確かめた）。実際の市町村界は
 * 細かい角だらけなので、この方法に替えた。距離で決めるので、角も穴も崩れない。
 *
 * **人ひとりの今いる場所を範囲として出す使い方は受けない**（付きまといに使えるため）。
 */
import { CIRCLE_DEFAULTS } from "./circle.js";

export const FILL_BLUR = {
  /** 縁での濃さ（＝内側の濃さ）。**縁の線が無いぶん濃くする。**円のぼかしと同じ */
  opacity: CIRCLE_DEFAULTS.blurOpacity,
};

export const BLUR_RASTER = {
  /** 画像の長い辺の上限。**携帯でも作れる大きさ**（1024² で 100 万画素） */
  maxSide: 1024,
  /** ぼかしの幅に、何画素を割くか。**少ないと段が見える** */
  pixelsPerBlur: 16,
};

/** 同じ source に形と名札の点を入れるとき、塗りは形だけを拾う（Multi を返す版もある） */
export const SHAPES = ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false];

/** Web メルカトルの地球の半径（m） */
const MERCATOR_RADIUS = 6_378_137;

/**
 * 形だけを拾った**新しい** FeatureCollection と、南北の真ん中の緯度。
 * **描ける形が 1 つも無ければ null**（推測した場所を描かない）。
 * @param {any} geojson FeatureCollection / Feature / Polygon / MultiPolygon
 * @returns {{ data: any, latitude: number } | null}
 */
export function prepareAreas(geojson) {
  /** @type {any[]} */
  const features = [];
  for (const feature of featuresOf(geojson)) {
    const polygons = polygonsOf(feature?.geometry);
    if (polygons.length === 0) continue;
    const copy = polygons.map((rings) => rings.map((ring) => ring.map((p) => [p[0], p[1]])));
    const geometry =
      feature.geometry.type === "Polygon"
        ? { type: "Polygon", coordinates: copy[0] }
        : { type: "MultiPolygon", coordinates: copy };
    features.push({ type: "Feature", properties: { ...feature.properties }, geometry });
  }
  if (features.length === 0) return null;
  const [south, north] = extent(
    features.flatMap((feature) => ringsOf(feature.geometry)),
    1,
  );
  return { data: { type: "FeatureCollection", features }, latitude: (south + north) / 2 };
}

/**
 * 名札を置く点。**必ず形の内側に置く。**
 *
 * 重心はコの字や三日月では形の外へ落ちる。形の南北の真ん中を東西に切り、
 * 内側にあたる区間のうち**いちばん長い区間の真ん中**に置く（穴の上には置かない）。
 *
 * @param {any} collection prepareAreas の data
 * @param {string} key 名前の入った属性
 */
export function labelPoints(collection, key) {
  /** @type {any[]} */
  const points = [];
  for (const feature of collection.features) {
    const raw = feature.properties?.[key];
    const label = typeof raw === "string" ? raw.trim() : typeof raw === "number" ? String(raw) : "";
    if (label === "") continue;
    const coordinates = insidePoint(largest(polygonsOf(feature.geometry)));
    if (coordinates === null) continue;
    points.push({ type: "Feature", properties: { label }, geometry: { type: "Point", coordinates } });
  }
  return points;
}

/**
 * ぼかした範囲を描く画像の濃さ（0〜255）と、地表に貼る 4 隅。
 *
 * - 画素は**メルカトルで等間隔**に並べる（MapLibre は画像をメルカトルの上で引き伸ばす）
 * - 形の内側は 255、外側は形までの距離 d（m）で `255 × (1 − d / blur)`、`blur` より先は 0
 * - 画像の大きさは `BLUR_RASTER.maxSide` まで。広い範囲では 1 画素が粗くなる
 *   （縮めて見る広さなので、ぼかしの段は目立たない）
 *
 * @param {any} collection prepareAreas の data
 * @param {number} blur m
 */
export function blurRaster(collection, blur) {
  /** @type {number[][][]} */
  const rings = collection.features.flatMap((/** @type {any} */ f) => ringsOf(f.geometry)).map(toMercatorRing);
  const [minX, maxX] = extent(rings, 0);
  const [minY, maxY] = extent(rings, 1);
  // メルカトルの 1 単位（地球 1 周）が、この緯度で何 m か
  const metersPerUnit = 2 * Math.PI * MERCATOR_RADIUS * Math.cos(latitudeOf((minY + maxY) / 2));
  // **2% 余分に取る。**m への換算は真ん中の緯度で決め打つので、南北の端では少し足りなくなる
  //（取らないと、ぼかしの先端が画像の端で切れる）
  const pad = (blur * 1.02) / metersPerUnit;
  const west = minX - pad;
  const north = minY - pad;
  const spanMeters = Math.max(maxX + pad - west, maxY + pad - north) * metersPerUnit;
  const metersPerPixel = Math.max(blur / BLUR_RASTER.pixelsPerBlur, spanMeters / (BLUR_RASTER.maxSide - 1));
  const unit = metersPerPixel / metersPerUnit;
  const width = Math.min(BLUR_RASTER.maxSide, Math.ceil((maxX + pad - west) / unit) + 1);
  const height = Math.min(BLUR_RASTER.maxSide, Math.ceil((maxY + pad - north) / unit) + 1);

  const inside = insideMask(rings, { west, north, unit, width, height });
  const squared = distanceSquared(inside, width, height);
  const alpha = new Uint8ClampedArray(width * height);
  for (let i = 0; i < alpha.length; i += 1) {
    if (inside[i] === 1) {
      alpha[i] = 255;
      continue;
    }
    // 画素の中心どうしの距離は、縁までの距離より半画素ほど長い
    const meters = Math.max(0, Math.sqrt(/** @type {number} */ (squared[i])) - 0.5) * metersPerPixel;
    alpha[i] = Math.round(255 * Math.max(0, 1 - meters / blur));
  }

  const east = west + width * unit;
  const south = north + height * unit;
  /** @param {number} x @param {number} y @returns {[number, number]} */
  const corner = (x, y) => [x * 360 - 180, (latitudeOf(y) * 180) / Math.PI];
  // MapLibre の画像の source が受ける順（左上・右上・右下・左下）
  /** @type {[[number, number], [number, number], [number, number], [number, number]]} */
  const coordinates = [corner(west, north), corner(east, north), corner(east, south), corner(west, south)];
  return { width, height, metersPerPixel, alpha, coordinates };
}

/**
 * 輪の座標の `axis` 番目の最小と最大。
 * **`Math.min(...配列)` を使わない。**市町村界は数万点あり、引数に広げると落ちる。
 * @param {number[][][]} rings @param {number} axis @returns {[number, number]}
 */
function extent(rings, axis) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const ring of rings) {
    for (const point of ring) {
      const value = /** @type {number} */ (point[axis]);
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }
  return [min, max];
}

/** 経度・緯度 → メルカトル（0〜1、下向きが正） @param {number[][]} ring */
function toMercatorRing(ring) {
  return ring.map(([lng, lat]) => {
    const rad = (/** @type {number} */ (lat) * Math.PI) / 180;
    return [(/** @type {number} */ (lng) + 180) / 360, (1 - Math.log(Math.tan(Math.PI / 4 + rad / 2)) / Math.PI) / 2];
  });
}

/** メルカトルの y → 緯度（ラジアン） @param {number} y */
function latitudeOf(y) {
  return Math.atan(Math.sinh(Math.PI * (1 - 2 * y)));
}

/**
 * 画素の中心が形の内側なら 1（外周と穴をまとめて偶奇で数える）。
 * @param {number[][][]} rings メルカトル
 * @param {{ west: number, north: number, unit: number, width: number, height: number }} grid
 */
function insideMask(rings, grid) {
  const mask = new Uint8Array(grid.width * grid.height);
  for (let y = 0; y < grid.height; y += 1) {
    const at = grid.north + (y + 0.5) * grid.unit;
    const crossings = rings.flatMap((ring) => crossingsAt(ring, at)).sort((a, b) => a - b);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const from = Math.max(0, Math.ceil((/** @type {number} */ (crossings[i]) - grid.west) / grid.unit - 0.5));
      const to = Math.min(grid.width - 1, Math.floor((/** @type {number} */ (crossings[i + 1]) - grid.west) / grid.unit - 0.5));
      for (let x = from; x <= to; x += 1) mask[y * grid.width + x] = 1;
    }
  }
  return mask;
}

/**
 * 各画素から、いちばん近い内側の画素までの距離の 2 乗（画素）。
 * 行ごと・列ごとに 1 次元の距離変換を 2 回かける（Felzenszwalb と Huttenlocher の方法）。
 * @param {Uint8Array} inside @param {number} width @param {number} height
 */
function distanceSquared(inside, width, height) {
  const far = 1e20;
  const grid = new Float64Array(width * height);
  for (let i = 0; i < grid.length; i += 1) grid[i] = inside[i] === 1 ? 0 : far;
  const longest = Math.max(width, height);
  const line = new Float64Array(longest);
  const out = new Float64Array(longest);
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) line[y] = /** @type {number} */ (grid[y * width + x]);
    transform1d(line, height, out);
    for (let y = 0; y < height; y += 1) grid[y * width + x] = /** @type {number} */ (out[y]);
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) line[x] = /** @type {number} */ (grid[y * width + x]);
    transform1d(line, width, out);
    for (let x = 0; x < width; x += 1) grid[y * width + x] = /** @type {number} */ (out[x]);
  }
  return grid;
}

/**
 * 1 次元の距離変換（2 乗）。放物線の下側の包絡を取る。
 * @param {Float64Array} f @param {number} n @param {Float64Array} out
 */
function transform1d(f, n, out) {
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  let k = 0;
  z[0] = Number.NEGATIVE_INFINITY;
  z[1] = Number.POSITIVE_INFINITY;
  const at = (/** @type {number} */ i) => /** @type {number} */ (f[i]);
  for (let q = 1; q < n; q += 1) {
    let s = 0;
    for (;;) {
      const p = /** @type {number} */ (v[k]);
      s = (at(q) + q * q - (at(p) + p * p)) / (2 * q - 2 * p);
      if (s > /** @type {number} */ (z[k]) || k === 0) break;
      k -= 1;
    }
    if (s <= /** @type {number} */ (z[k])) {
      v[k] = q;
      z[k + 1] = Number.POSITIVE_INFINITY;
      continue;
    }
    k += 1;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Number.POSITIVE_INFINITY;
  }
  k = 0;
  for (let q = 0; q < n; q += 1) {
    while (/** @type {number} */ (z[k + 1]) < q) k += 1;
    const p = /** @type {number} */ (v[k]);
    out[q] = (q - p) * (q - p) + at(p);
  }
}

/** @param {any} geojson @returns {any[]} */
function featuresOf(geojson) {
  if (geojson === null || typeof geojson !== "object") return [];
  if (geojson.type === "FeatureCollection") return Array.isArray(geojson.features) ? geojson.features : [];
  if (geojson.type === "Feature") return [geojson];
  return [{ type: "Feature", properties: {}, geometry: geojson }];
}

/**
 * Polygon / MultiPolygon を「多角形（輪の並び）の並び」へ。読めない輪は落とす。
 * @param {any} geometry
 * @returns {number[][][][]}
 */
function polygonsOf(geometry) {
  const raw =
    geometry?.type === "Polygon" ? [geometry.coordinates] : geometry?.type === "MultiPolygon" ? geometry.coordinates : [];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(Array.isArray)
    .map((rings) => rings.filter(isRing))
    .filter((rings) => rings.length > 0);
}

/** @param {any} geometry */
function ringsOf(geometry) {
  return polygonsOf(geometry).flat();
}

/** @param {unknown} ring @returns {ring is number[][]} */
function isRing(ring) {
  return (
    Array.isArray(ring) &&
    ring.length >= 4 &&
    ring.every((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
  );
}

/** 符号付き面積（向きは問わず、大きさだけ使う） @param {number[][]} ring */
function signedArea(ring) {
  let sum = 0;
  for (let i = 1; i < ring.length; i += 1) {
    const [x1, y1] = /** @type {[number, number]} */ (ring[i - 1]);
    const [x2, y2] = /** @type {[number, number]} */ (ring[i]);
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

/** 面積のいちばん大きい多角形（飛び地のうち本体に名札を置く） @param {number[][][][]} polygons */
function largest(polygons) {
  /** @param {number[][][]} rings */
  const size = (rings) => Math.abs(signedArea(rings[0] ?? []));
  return polygons.reduce((best, rings) => (size(rings) > size(best) ? rings : best), polygons[0] ?? []);
}

/**
 * 南北の真ん中を東西に切って、内側の区間のいちばん長いものの真ん中。
 * @param {number[][][]} rings
 * @returns {[number, number] | null}
 */
function insidePoint(rings) {
  const outer = rings[0];
  if (outer === undefined) return null;
  const [south, north] = extent([outer], 1);
  const y = (south + north) / 2;
  const crossings = rings.flatMap((ring) => crossingsAt(ring, y)).sort((a, b) => a - b);
  /** @type {[number, number] | null} */
  let best = null;
  for (let i = 0; i + 1 < crossings.length; i += 2) {
    const west = /** @type {number} */ (crossings[i]);
    const east = /** @type {number} */ (crossings[i + 1]);
    if (best === null || east - west > best[1] - best[0]) best = [west, east];
  }
  return best === null ? null : [(best[0] + best[1]) / 2, y];
}

/** 輪が y を横切る x の並び @param {number[][]} ring @param {number} y */
function crossingsAt(ring, y) {
  /** @type {number[]} */
  const xs = [];
  for (let i = 1; i < ring.length; i += 1) {
    const [x1, y1] = /** @type {[number, number]} */ (ring[i - 1]);
    const [x2, y2] = /** @type {[number, number]} */ (ring[i]);
    if (y1 > y !== y2 > y) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
  }
  return xs;
}
