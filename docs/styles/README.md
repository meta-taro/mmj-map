# スタイルの検査（style-check）

`styles/*.json` は**手書きの正本**です（ビルド生成物ではありません・D-002）。
色や字の大きさの良し悪しはここで扱いません。**人が決める領域です**（ベースルール §11）。

ここが見るのは「描かれるかどうか」だけです。止めたいのは、
**ビルドもテストも通ったまま、実行時にだけ空になる**壊れ方です（§23）。

```bash
pnpm style:check                       # styles/modern-dark.json
pnpm style:check -- styles/other.json
```

指摘が 1 件でもあれば 1 で落ちます。同じ判定は `pnpm -r test` からも走るので、
**人が思い出さなくても CI が止まります**（`.github/workflows/ci.yml`）。

## 何を見ているか

| 検査 | 何が起きるのを防ぐか |
|---|---|
| `unknown-source-layer` | 上流に無い `source-layer` を指している → そのレイヤは永久に空 |
| `unreachable-zoom` | zoom の窓がデータと交わらない → 一度も描かれない |
| `missing-min-zoom-guard` | `min_zoom` を持つ地物のラベルが、それを見ていない → 出すべきでない縮尺で出る |
| `missing-glyphs` | `symbol` があるのに `glyphs` が無い → **地図全体が白くなる** |

### `min_zoom` を見る、とは

Protomaps の `places` / `pois` / `water` は、地物ごとに
「この zoom 以上で出してよい」という `min_zoom` を持っています。
**これを見ないと、上流が持っている縮尺の判断を捨てることになります。**

実測（2026-09-16・`dist/tiles/kansai.pmtiles`・z12 の大阪 = `12/3589/1626`）:

| レイヤ | 見ない場合 | 見る場合 |
|---|---|---|
| `label-place-city` | 6 件 | **2 件**（大阪市 mz3 / 吹田市 mz8） |
| `label-water` | 27 件 | 27 件（この範囲では差が出ない） |

見ない場合に z12 で出ていたのは、**道頓堀 / 本坊庭園 / 中心伽藍 / でんでん**（いずれも mz13）。
寺の庭が「大阪市」と同じ重みで出ていました。

`places` / `pois` は、実測した 3 タイル（大阪 z12 / 難波 z13 / 梅田 z14）で
**min_zoom の欠けが 0 件**でした。`["<=", ["get", "min_zoom"], ["zoom"]]` が
どの地物でも評価できるということです。

## 照合先（スナップショット）

`tools/style-check/src/basemap-layers.json` は、**pin したビルドが実際に持っている**
`vector_layers` の写しです（`tools/tiles/manifest.json` の pin と対応）。
**手で書かないでください。**

上流の版を上げたとき（`pnpm tiles:resolve -- --update=...`）は、切り出し直した
アーカイブでこれを再生成します。

```bash
pnpm --filter @modern-map-japan/style-check run snapshot -- dist/tiles/kansai.pmtiles
```

`pmtiles` が PATH に無い場合は `PMTILES_BIN=/path/to/pmtiles` を付けてください。

## 検査が見ていないこと

- **色・字体・余白。** `DESIGN.md` の領域です。AI は埋めません（§11）。
- **実際の見え方。** レイヤが描かれる条件を満たしているかまでで、
  **重なり・読みやすさ・ラベルの衝突は画面を見ないと分かりません**（§29）。
- **フィルタが何件拾うか。** `kind` の値が上流と噛み合っているかは、
  `pnpm tile:inspect` で数えられます（[手順](../tiles/inspect.md)）。
