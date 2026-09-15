/**
 * bbox の順序は [west, south, east, north]。
 * go-pmtiles の `--bbox` と同じ並びに揃えてある（並べ替えを挟むと、間違えたときに気づけない）。
 */
export type BBox = readonly [number, number, number, number];

const LON_MIN = -180;
const LON_MAX = 180;
const LAT_MIN = -90;
const LAT_MAX = 90;

/** JSON から読んだ値を bbox として受け取る。壊れていたら理由つきで投げる。 */
export function parseBBox(input: unknown, label = "bbox"): BBox {
  if (!Array.isArray(input) || input.length !== 4) {
    throw new TypeError(`${label} は [west, south, east, north] の 4 要素で書きます`);
  }

  const values = input.map((value, index) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError(`${label}[${index}] が有限の数値ではありません: ${String(value)}`);
    }
    return value;
  }) as [number, number, number, number];

  const [west, south, east, north] = values;

  if (west < LON_MIN || west > LON_MAX || east < LON_MIN || east > LON_MAX) {
    throw new RangeError(`${label} の経度が範囲外です: west=${west} east=${east}`);
  }
  if (south < LAT_MIN || south > LAT_MAX || north < LAT_MIN || north > LAT_MAX) {
    throw new RangeError(`${label} の緯度が範囲外です: south=${south} north=${north}`);
  }
  if (west >= east) {
    throw new RangeError(`${label} は west < east である必要があります: west=${west} east=${east}`);
  }
  if (south >= north) {
    throw new RangeError(`${label} は south < north である必要があります: south=${south} north=${north}`);
  }

  return values;
}

/** `--bbox=` に渡す文字列。区切りはカンマのみで、空白を入れない。 */
export function formatBBox(bbox: BBox): string {
  return bbox.join(",");
}

/** コマンドラインの `--bbox=w,s,e,n` を読む。 */
export function parseBBoxString(input: string, label = "--bbox"): BBox {
  const parts = input.split(",").map((part) => part.trim());
  if (parts.length !== 4) {
    throw new TypeError(`${label} は w,s,e,n の 4 つをカンマ区切りで書きます: ${input}`);
  }
  return parseBBox(
    parts.map((part) => (part === "" ? Number.NaN : Number(part))),
    label,
  );
}
