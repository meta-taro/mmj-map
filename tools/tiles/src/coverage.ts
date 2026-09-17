/**
 * 切り出す領域（GeoJSON MultiPolygon）に、ある点が入っているかを見る。
 *
 * **領域を四角の集合で書くと、書いた人が気づかないうちに島が抜ける。**
 * 実際に最初の版で屋久島・種子島・トカラ列島が抜けた（29.1〜30.9N が空白だった）。
 * 容量を減らす工夫をするたびに、**落ちていないことを機械で確かめる**ためのもの。
 *
 * 依存は足していない。**必要なのは点が多角形に入るかどうかだけ**で、
 * 交差判定も面積計算も要らない。
 */

/** [経度, 緯度]。**GeoJSON と同じ並び。** */
export type Point = readonly [number, number];

/** 外周だけ。穴（内周）は使わない — 使うようになったら、ここを増やす前に相談すること */
export type Ring = readonly Point[];
export type MultiPolygon = readonly (readonly Ring[])[];

/**
 * GeoJSON の文字列から MultiPolygon を読む。
 * **Polygon を黙って受けない。**受けると「1 つしか書いていない」ことに気づけない。
 */
export function parseMultiPolygon(text: string): MultiPolygon {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null) {
    throw new TypeError("GeoJSON として読めません");
  }
  const geometry = parsed as { type?: unknown; coordinates?: unknown };
  if (geometry.type !== "MultiPolygon") {
    throw new TypeError(`MultiPolygon ではありません: ${String(geometry.type)}`);
  }
  if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) {
    throw new TypeError("coordinates が空です");
  }
  return geometry.coordinates as MultiPolygon;
}

/** 辺の上に乗っているか（島が境界線に乗っているときに落とさないため） */
function onSegment(point: Point, a: Point, b: Point): boolean {
  const [px, py] = point;
  const [ax, ay] = a;
  const [bx, by] = b;
  const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  if (Math.abs(cross) > 1e-12) return false;
  return (
    px >= Math.min(ax, bx) - 1e-12 &&
    px <= Math.max(ax, bx) + 1e-12 &&
    py >= Math.min(ay, by) - 1e-12 &&
    py <= Math.max(ay, by) + 1e-12
  );
}

/** 外周 1 本に入っているか。**辺の上は入っている扱い。** */
function inRing(ring: Ring, point: Point): boolean {
  const [px, py] = point;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a === undefined || b === undefined) continue;
    if (onSegment(point, a, b)) return true;

    const [ax, ay] = a;
    const [bx, by] = b;
    // 半直線を東へ伸ばして、交差回数を数える
    if (ay > py !== by > py) {
      const x = ((bx - ax) * (py - ay)) / (by - ay) + ax;
      if (px < x) inside = !inside;
    }
  }
  return inside;
}

/** どれか 1 つの多角形に入っていればよい */
export function covers(region: MultiPolygon, point: Point): boolean {
  for (const polygon of region) {
    const outer = polygon[0];
    if (outer === undefined) continue;
    if (inRing(outer, point)) return true;
  }
  return false;
}
