/**
 * 見本のラスタタイルを、どこに・何色で置くかの判断。**ここは純粋関数。**
 *
 * ## なぜ見本を自前で作るのか
 *
 * `<mmj-raster>` が動くことを見せるには、重ねる画像タイルが要る。
 * しかし**実在のハザードや雨雲を置けない**——
 *
 * - OSM の公式タイルサーバーは**商用と大量アクセスを認めていない**
 * - 国土地理院のタイルは**測量成果の利用**にあたるかの判断が要る（`PRD.md` §2）
 * - 気象庁のものは**出典と時点**を正しく出す責任が生じる
 *
 * そして**実在のデータに見えるものを作り置くと、いつか誰かがそれを本物として使う**
 * （`apps/demo/data/README.md` と同じ理由）。
 *
 * だから**見るからに人工的な格子**にする。ハザードマップのふりをしない。
 */

/** タイル 1 枚の辺の長さ（画素）。MapLibre の既定 */
export const TILE_SIZE = 256;

/**
 * 見本の色。**中心から離れるほど段階が下がる**だけの、意味を持たない並び。
 *
 * **浸水深や震度の色ではありません。**それらしく見える配色にすると、
 * **凡例が無いまま意味があるように読まれる**。段階があることだけを示す。
 */
export const SAMPLE_BANDS = [
  [255, 110, 60],
  [255, 200, 60],
  [90, 190, 255],
  [60, 120, 255],
] as const;

/** 見本の濃さ（0〜255）。**下の地図が読めることが条件** */
export const SAMPLE_ALPHA = 110;

/** 縁を濃くして、タイルの境目が見えるようにする（**格子だと分かる形にする**） */
export const EDGE_ALPHA = 230;

export interface TilePlan {
  readonly z: number;
  readonly x: number;
  readonly y: number;
  readonly rgb: readonly [number, number, number];
}

/**
 * 経度緯度から、その倍率のタイル座標を出す（Web メルカトル）。
 *
 * **切り捨てで整数にする。**四捨五入すると、境目の座標が隣のタイルを指す。
 */
export function tileAt(lng: number, lat: number, z: number): { x: number; y: number } {
  if (!Number.isInteger(z) || z < 0 || z > 24) {
    throw new Error(`倍率は 0〜24 の整数で指定してください: ${z}`);
  }
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

/**
 * 中心のまわり `radius` タイルぶんを並べる。
 *
 * **段階は中心からの距離で決める。**意味は無い——段階があることだけを示す。
 *
 * @param center `[経度, 緯度]`
 * @param z 倍率
 * @param radius 中心から何タイルぶん広げるか（`1` なら 3×3）
 */
export function planTiles(center: readonly [number, number], z: number, radius: number): TilePlan[] {
  if (!Number.isInteger(radius) || radius < 0) {
    throw new Error(`広さはタイル数（0 以上の整数）で指定してください: ${radius}`);
  }
  const origin = tileAt(center[0] ?? Number.NaN, center[1] ?? Number.NaN, z);

  const tiles: TilePlan[] = [];
  for (let x = origin.x - radius; x <= origin.x + radius; x += 1) {
    for (let y = origin.y - radius; y <= origin.y + radius; y += 1) {
      const distance = Math.abs(x - origin.x) + Math.abs(y - origin.y);
      const band = SAMPLE_BANDS[Math.min(SAMPLE_BANDS.length - 1, distance)];
      // 段階の一覧は空にしないので、ここは必ず引ける
      tiles.push({ z, x, y, rgb: band ?? SAMPLE_BANDS[0] });
    }
  }
  return tiles;
}

/**
 * 置いたものが何かを、人が読める形で言う。
 *
 * **「見本」と言い切る。**枚数とバイト数だけ出すと、本物のデータだと思われる。
 */
export function sampleReport(count: number, bytes: number): string {
  return (
    `${count} 枚 / ${(bytes / 1024).toFixed(1)} KB — ` +
    "見本です。実在のハザード・雨雲・地盤ではありません。" +
    "`<mmj-raster>` が重なることを見せるためだけの格子です。"
  );
}
