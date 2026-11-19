/**
 * ベクタタイル（MVT）を読む。**ここは純粋関数。**ブラウザでも Node でも同じに動く。
 *
 * 依存を足していない。**形を取り出すためだけに vector-tile / pbf を入れない**
 * （形式は固まっていて、読むだけなら短い）。`tools/tile-inspect/src/mvt.ts` と同じ読み方で、
 * こちらは `Buffer` と `node:zlib` を使わない（PMTiles の `getZxy` は展開済みの中身を返す）。
 *
 * 座標は**タイルの中の整数**（0 〜 `extent`。縁の外の「のりしろ」は負や `extent` 超え）。
 * 経度緯度への変換は呼ぶ側（`outline.js`）。
 */

/** @typedef {string | number | boolean} PropertyValue */

/**
 * @typedef {{
 *   properties: Record<string, PropertyValue>,
 *   type: number,
 *   geometry: number[][][],
 * }} TileFeature `type` は 1=点 / 2=線 / 3=面。`geometry` は線か環の並び
 */

/** @typedef {{ name: string, extent: number, features: TileFeature[] }} TileLayer */

/** @typedef {{ buf: Uint8Array, pos: number }} Cursor */

const utf8 = new TextDecoder();

/** @param {Cursor} c */
function varint(c) {
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

/** @param {Cursor} c */
function bytes(c) {
  const length = varint(c);
  const out = c.buf.subarray(c.pos, c.pos + length);
  c.pos += length;
  return out;
}

/**
 * 知らないフィールドを読み飛ばす（上流が足しても壊れない）。
 * **`c.pos += varint(c)` と書かない**——複合代入は左辺を先に読むので 1 バイトずれる。
 * @param {Cursor} c
 * @param {number} wire
 */
function skip(c, wire) {
  if (wire === 0) varint(c);
  else if (wire === 1) c.pos += 8;
  else if (wire === 2) {
    const length = varint(c);
    c.pos += length;
  } else if (wire === 5) c.pos += 4;
  else throw new Error(`読めない wire type: ${wire}（位置 ${c.pos} / 全長 ${c.buf.length}）`);
}

/** @param {Uint8Array} buf */
function* fields(buf) {
  const c = { buf, pos: 0 };
  while (c.pos < buf.length) {
    const key = varint(c);
    yield { tag: key >> 3, wire: key & 7, c };
  }
}

/** @param {number} raw */
const zigzag = (raw) => (raw >>> 1) ^ -(raw & 1);

/** @param {Uint8Array} buf @returns {PropertyValue | null} */
function decodeValue(buf) {
  for (const { tag, wire, c } of fields(buf)) {
    if (tag === 1 && wire === 2) return utf8.decode(bytes(c));
    if (tag === 2 && wire === 5) {
      const value = new DataView(buf.buffer, buf.byteOffset + c.pos, 4).getFloat32(0, true);
      c.pos += 4;
      return value;
    }
    if (tag === 3 && wire === 1) {
      const value = new DataView(buf.buffer, buf.byteOffset + c.pos, 8).getFloat64(0, true);
      c.pos += 8;
      return value;
    }
    if (tag === 4 || tag === 5) return varint(c);
    if (tag === 6) return zigzag(varint(c));
    if (tag === 7) return varint(c) !== 0;
    skip(c, wire);
  }
  return null;
}

/**
 * 幾何を読む。**MoveTo が来るたびに別の線（環）として区切る**——繋げると、
 * 通っていない場所を通る線ができる。知らないコマンドではそこで止め、読めたぶんを返す。
 * @param {Uint8Array} buf
 * @returns {number[][][]}
 */
function decodeGeometry(buf) {
  /** @type {number[][][]} */
  const parts = [];
  /** @type {number[][]} */
  let current = [];
  let x = 0;
  let y = 0;
  const c = { buf, pos: 0 };
  while (c.pos < buf.length) {
    const header = varint(c);
    const id = header & 0x7;
    const count = header >> 3;
    if (id === 7) continue; // ClosePath。座標は増えない
    if (id !== 1 && id !== 2) break;
    for (let i = 0; i < count && c.pos < buf.length; i += 1) {
      x += zigzag(varint(c));
      y += zigzag(varint(c));
      if (id === 1) {
        if (current.length > 0) parts.push(current);
        current = [];
      }
      current.push([x, y]);
    }
  }
  if (current.length > 0) parts.push(current);
  return parts;
}

/**
 * @param {Uint8Array} buf
 * @param {string[]} keys
 * @param {PropertyValue[]} values
 * @returns {TileFeature}
 */
function decodeFeature(buf, keys, values) {
  /** @type {Record<string, PropertyValue>} */
  const properties = {};
  let type = 0;
  /** @type {number[][][]} */
  let geometry = [];
  for (const { tag, wire, c } of fields(buf)) {
    if (tag === 4 && wire === 2) geometry = decodeGeometry(bytes(c));
    else if (tag === 2 && wire === 2) {
      const pairs = bytes(c);
      const pc = { buf: pairs, pos: 0 };
      while (pc.pos < pairs.length) {
        const key = keys[varint(pc)];
        const value = values[varint(pc)];
        if (key !== undefined && value !== undefined) properties[key] = value;
      }
    } else if (tag === 3) type = varint(c);
    else skip(c, wire);
  }
  return { properties, type, geometry };
}

/** @param {Uint8Array} buf @returns {TileLayer} */
function decodeLayer(buf) {
  let name = "";
  let extent = 4096;
  /** @type {string[]} */
  const keys = [];
  /** @type {PropertyValue[]} */
  const values = [];
  /** @type {Uint8Array[]} */
  const featureBufs = [];
  for (const { tag, wire, c } of fields(buf)) {
    if (tag === 1 && wire === 2) name = utf8.decode(bytes(c));
    else if (tag === 2 && wire === 2) featureBufs.push(bytes(c));
    else if (tag === 3 && wire === 2) keys.push(utf8.decode(bytes(c)));
    else if (tag === 4 && wire === 2) {
      // **読めない値も 1 つ分の場所を取る。**飛ばすと、後ろの値の番号が全部ずれる
      values.push(decodeValue(bytes(c)) ?? "");
    } else if (tag === 5) extent = varint(c);
    else skip(c, wire);
  }
  // keys / values は features より後ろに来ることがある。先に全部読んでから組み立てる
  return { name, extent, features: featureBufs.map((f) => decodeFeature(f, keys, values)) };
}

/**
 * タイル 1 枚を読む。**欲しい層だけ組み立てる**（建物や道の層は数が多く、読むだけ無駄）。
 * 空のタイルは空の配列（空は起こりうる状態で、異常ではない）。
 *
 * @param {Uint8Array | ArrayBuffer} raw 展開済みの MVT
 * @param {readonly string[]} [wanted] 層の名前。省くと全部
 * @returns {TileLayer[]}
 */
export function decodeTile(raw, wanted) {
  const buf = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
  if (buf.length === 0) return [];
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    throw new Error("タイルが gzip のままです。PMTiles の getZxy で取ると展開されます");
  }
  /** @type {TileLayer[]} */
  const layers = [];
  for (const { tag, wire, c } of fields(buf)) {
    if (tag !== 3 || wire !== 2) {
      skip(c, wire);
      continue;
    }
    const body = bytes(c);
    if (wanted !== undefined && !wanted.includes(layerName(body))) continue;
    layers.push(decodeLayer(body));
  }
  return layers;
}

/** 層の名前だけを先に読む（中身を組み立てずに飛ばせるように） @param {Uint8Array} buf */
function layerName(buf) {
  for (const { tag, wire, c } of fields(buf)) {
    if (tag === 1 && wire === 2) return utf8.decode(bytes(c));
    skip(c, wire);
  }
  return "";
}
