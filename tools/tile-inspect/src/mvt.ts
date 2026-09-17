/**
 * MVT（Mapbox Vector Tile）を読む。**ここは純粋関数。**
 *
 * 依存を足していない。**数えるためだけに geojson-vt / vector-tile を入れない**
 * （形式は固まっていて、読むだけなら短い）。
 *
 * 幾何は読まない。**この道具の目的は「何が何件あるか」**で、
 * 形を描くことではない（描くのは MapLibre の仕事）。
 */
import { gunzipSync } from "node:zlib";

export type PropertyValue = string | number | boolean;

export interface Feature {
  readonly props: Record<string, PropertyValue>;
  /** 1=Point, 2=LineString, 3=Polygon */
  readonly type: number;
}

export interface Layer {
  readonly name: string;
  readonly extent: number;
  readonly features: Feature[];
  /**
   * 読めなかった地物の数。**0 でないことを呼ぶ側が出すこと。**
   * 黙って少ない数を出すと、**数え間違いが「そういうデータ」に見える。**
   */
  readonly unreadable: number;
}

/** 読み進める位置を持つカーソル */
interface Cursor {
  readonly buf: Buffer;
  pos: number;
}

function varint(c: Cursor): number {
  let result = 0;
  let shift = 0;
  for (;;) {
    const byte = c.buf[c.pos++] ?? 0;
    result += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  return result;
}

function bytes(c: Cursor): Buffer {
  const length = varint(c);
  const out = c.buf.subarray(c.pos, c.pos + length);
  c.pos += length;
  return out;
}

/**
 * 知らないフィールドを読み飛ばす。**落とさずに飛ばす**（上流が足しても壊れない）。
 *
 * **`c.pos += varint(c)` と書かないこと。**複合代入は左辺の値を先に読むため、
 * `varint` が `c.pos` を進めたぶんが**捨てられて 1 バイトずれる**。
 * ずれたまま読み進めると、地物が黙って数え落とされる（実測: buildings が 2724 → 5）。
 */
function skip(c: Cursor, wire: number): void {
  if (wire === 0) varint(c);
  else if (wire === 1) c.pos += 8;
  else if (wire === 2) {
    const length = varint(c);
    c.pos += length;
  } else if (wire === 5) c.pos += 4;
  else throw new Error(`読めない wire type: ${wire}（位置 ${c.pos} / 全長 ${c.buf.length}）`);
}

/** フィールドを 1 つずつ返す */
function* fields(buf: Buffer): Generator<{ tag: number; wire: number; c: Cursor }> {
  const c: Cursor = { buf, pos: 0 };
  while (c.pos < buf.length) {
    const key = varint(c);
    yield { tag: key >> 3, wire: key & 7, c };
  }
}

function decodeValue(buf: Buffer): PropertyValue | null {
  for (const { tag, wire, c } of fields(buf)) {
    if (tag === 1 && wire === 2) return bytes(c).toString("utf8");
    if (tag === 3 && wire === 1) {
      const value = buf.readDoubleLE(c.pos);
      c.pos += 8;
      return value;
    }
    if (tag === 4 || tag === 5) return varint(c);
    if (tag === 6) {
      const raw = varint(c);
      return (raw >>> 1) ^ -(raw & 1);
    }
    if (tag === 7) return varint(c) !== 0;
    skip(c, wire);
  }
  return null;
}

function decodeFeature(buf: Buffer, keys: string[], values: PropertyValue[]): Feature {
  const props: Record<string, PropertyValue> = {};
  let type = 0;

  for (const { tag, wire, c } of fields(buf)) {
    if (tag === 2 && wire === 2) {
      const pairs = bytes(c);
      const pc: Cursor = { buf: pairs, pos: 0 };
      while (pc.pos < pairs.length) {
        const key = keys[varint(pc)];
        const value = values[varint(pc)];
        if (key !== undefined && value !== undefined) props[key] = value;
      }
    } else if (tag === 3) type = varint(c);
    else skip(c, wire);
  }
  return { props, type };
}

function decodeLayer(buf: Buffer): Layer {
  let name = "";
  let extent = 4096;
  const keys: string[] = [];
  const values: PropertyValue[] = [];
  const featureBufs: Buffer[] = [];

  for (const { tag, wire, c } of fields(buf)) {
    if (tag === 1 && wire === 2) name = bytes(c).toString("utf8");
    else if (tag === 2 && wire === 2) featureBufs.push(Buffer.from(bytes(c)));
    else if (tag === 3 && wire === 2) keys.push(bytes(c).toString("utf8"));
    else if (tag === 4 && wire === 2) {
      const value = decodeValue(bytes(c));
      if (value !== null) values.push(value);
    } else if (tag === 5) extent = varint(c);
    else skip(c, wire);
  }

  // **keys / values は features より後ろに来ることがある。**先に全部読んでから組み立てる
  const features: Feature[] = [];
  let unreadable = 0;
  for (const featureBuf of featureBufs) {
    try {
      features.push(decodeFeature(featureBuf, keys, values));
    } catch {
      // 1 件読めなくても、残りの数え上げは出す。**件数として必ず報告する**
      unreadable++;
    }
  }
  return { name, extent, features, unreadable };
}

/**
 * タイル 1 枚を読む。gzip されていれば展開する（PMTiles の中身は圧縮されている）。
 * **空のタイルは例外にしない。**空は起こりうる状態で、異常ではない。
 */
export function decodeTile(raw: Buffer): Layer[] {
  if (raw.length === 0) return [];
  const buf = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw;

  const layers: Layer[] = [];
  for (const { tag, wire, c } of fields(buf)) {
    if (tag === 3 && wire === 2) layers.push(decodeLayer(bytes(c)));
    else skip(c, wire);
  }
  return layers;
}
