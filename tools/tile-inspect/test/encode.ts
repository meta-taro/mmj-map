/**
 * テスト用の、最小の MVT エンコーダ。
 *
 * **バイナリの fixture をリポジトリに置かない。**置くと、中身が何なのかを
 * 誰も読めなくなり、直すときに直せない。ここで組み立てれば、
 * 「この入力から、この出力が出る」がテストの中で完結する。
 *
 * また、**切り出したタイル（`dist/tiles/`）はリポジトリに無い**ので、
 * それを前提にしたテストは CI で走らない（baseline §4）。
 */

function varint(value: number): Buffer {
  const bytes: number[] = [];
  let v = value;
  while (v > 0x7f) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v);
  return Buffer.from(bytes);
}

/** tag 番号と wire type を 1 バイト（以上）にする */
function key(tag: number, wire: number): Buffer {
  return varint((tag << 3) | wire);
}

/** 長さ付きフィールド */
function delimited(tag: number, body: Buffer): Buffer {
  return Buffer.concat([key(tag, 2), varint(body.length), body]);
}

/** varint フィールド */
function uint(tag: number, value: number): Buffer {
  return Buffer.concat([key(tag, 0), varint(value)]);
}

function str(tag: number, value: string): Buffer {
  return delimited(tag, Buffer.from(value, "utf8"));
}

export interface TestFeature {
  /** 属性。値は文字列か整数だけ扱う（テストに要るのはそこまで） */
  readonly props: Record<string, string | number>;
  /** 1=Point, 2=LineString, 3=Polygon */
  readonly type?: number;
  /**
   * 幾何のバイト数。**本物のタイルには必ず付いていて、しかも最後に来る。**
   * ここを出さないテストは、**末尾の読み飛ばしがずれていても通る**（実際に通した）。
   */
  readonly geometryBytes?: number;
  /** 幾何の中身そのもの。**座標を読めることを確かめるときに使う** */
  readonly geometryRaw?: Buffer;
  /** 知らないフィールド（上流が足したもの）を 1 つ混ぜる */
  readonly unknownField?: { readonly tag: number; readonly value: number };
}

export interface TestLayer {
  readonly name: string;
  readonly features: readonly TestFeature[];
  readonly extent?: number;
}

/** レイヤ 1 枚を組み立てる */
function encodeLayer(layer: TestLayer): Buffer {
  const keys: string[] = [];
  const values: (string | number)[] = [];

  const featureBufs = layer.features.map((feature) => {
    const tags: number[] = [];
    for (const [k, v] of Object.entries(feature.props)) {
      let ki = keys.indexOf(k);
      if (ki === -1) ki = keys.push(k) - 1;
      let vi = values.findIndex((existing) => existing === v && typeof existing === typeof v);
      if (vi === -1) vi = values.push(v) - 1;
      tags.push(ki, vi);
    }
    const tagBody = Buffer.concat(tags.map((t) => varint(t)));
    const parts = [delimited(2, tagBody), uint(3, feature.type ?? 1)];
    if (feature.unknownField !== undefined) {
      parts.push(uint(feature.unknownField.tag, feature.unknownField.value));
    }
    if (feature.geometryRaw !== undefined) {
      parts.push(delimited(4, feature.geometryRaw));
    } else if (feature.geometryBytes !== undefined) {
      // **0 埋めにしない。**0x00 は「tag 0 / wire 0」として無害に読み飛ばせてしまうため、
      // 読み飛ばしが 1 バイトずれていてもテストが通る（実際に通してしまった）。
      // 0x0C は「tag 1 / wire 4」で、**ずれて読まれたら必ず例外になる**。
      parts.push(delimited(4, Buffer.alloc(feature.geometryBytes, 0x0c)));
    }
    return delimited(2, Buffer.concat(parts));
  });

  const keyBufs = keys.map((k) => str(3, k));
  const valueBufs = values.map((v) =>
    delimited(4, typeof v === "string" ? str(1, v) : uint(4, v)),
  );

  return Buffer.concat([
    str(1, layer.name),
    ...featureBufs,
    ...keyBufs,
    ...valueBufs,
    uint(5, layer.extent ?? 4096),
    uint(15, 2),
  ]);
}

/** タイル 1 枚を組み立てる */
export function encodeTile(layers: readonly TestLayer[]): Buffer {
  return Buffer.concat(layers.map((layer) => delimited(3, encodeLayer(layer))));
}
