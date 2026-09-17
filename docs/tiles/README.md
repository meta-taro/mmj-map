# ベースタイルを自分で作る

**このリポジトリはタイルを配りません。作り方を配ります。**
ここに書いた手順は、公開データと公開ツールだけで完結します。作者の環境にも鍵にも依存しません（PRD §0）。

| 使うもの | 何のため | ライセンス |
|---|---|---|
| [Protomaps 日次プラネットビルド](https://maps.protomaps.com/builds/) | ベースタイルの出どころ | データは ODbL（OSM 由来） |
| [go-pmtiles](https://github.com/protomaps/go-pmtiles) | 日本ぶんの切り出し | BSD-3-Clause |

タイル生成パイプラインは自作しません（`.claude/decisions.md` D-001）。

---

## 1. 用意する

- Node.js 22.12 以上と pnpm（`corepack enable pnpm`）
- `pmtiles` コマンド — [go-pmtiles のリリース](https://github.com/protomaps/go-pmtiles/releases)から
  OS に合うものを落として PATH に置く

```bash
pnpm install
pmtiles version
```

## 2. 出どころを確かめる

`tools/tiles/manifest.json` に、**上流のビルド 1 個だけ**が pin してあります。
同じ入力から同じ出力を作れることが、再現可能ビルドの中身です。

```bash
pnpm tiles:resolve
```

pin と上流が一致していれば 0 で終わります。一致しないときは理由を出して落ちます。

| 出る指摘 | 意味 | どうするか |
|---|---|---|
| `missing` | pin したビルドが上流から消えた | 日次ビルドは古いものから消えます。新しい日付へ pin し直す |
| `md5sum` / `b3sum` | 同じ日付で中身が差し替わった | **自動で乗り換えない。**上流に何が起きたかを見る |
| `basemapVersion` | basemap のスキーマ版が変わった | スタイルが依存しています。スタイル側を確認してから上げる |

pin を変えるとき（**手で JSON を書き換えないこと**）。
`--` を挟むのは、後ろのフラグを pnpm ではなくスクリプトへ渡すためです。

```bash
pnpm tiles:resolve -- --update=latest      # 上流の最新へ
pnpm tiles:resolve -- --update=20260915.pmtiles
```

## 3. 切り出す

```bash
# まず小さい範囲で。全国は 100GB 級の元ファイルから切るので時間がかかります。
pnpm tiles:extract -- kansai

# 全国
pnpm tiles:extract -- japan

# 実行せずコマンドだけ見る
pnpm tiles:extract -- japan --dry-run
```

出力先は `dist/tiles/`（git 管理外）。切り出しのあと `pmtiles verify` まで必ず走ります。
**`extract` が 0 で返っても中身が揃っているとは限らない**ためです。

範囲は `tools/tiles/manifest.json` の `regions` にあります。

| region | 範囲 |
|---|---|
| `japan` | 西=与那国島 / 南=沖ノ鳥島 / 東=南鳥島 / 北=択捉島 |
| `kansai` | 疎通確認用の小さい範囲 |

その場限りの範囲は `--bbox=w,s,e,n` で上書きできます。

## 4. 配信して、Range に応えているか確かめる

**PMTiles を 1 枚置くだけでは足りません。**
配信側が `Range:` に 206 ではなく 200（全量）を返す実装があり、そうなると
1 タイル見るたびに元ファイル全体が落ちてきます。地図は出るので、見ただけでは分かりません。

```bash
pnpm tiles:check-range -- https://example.com/japan.pmtiles
```

206 と `Content-Range: bytes ...` が返れば通ります。200 が返ったらその配信先は使えません。

手元の配信（`pnpm serve`）に対しては **2026-09-16 に実際に通しました**。

```
GET http://localhost:8787/tiles/kansai.pmtiles  Range: bytes=0-15
  status: 206
  content-range: bytes 0-15/373534235
  accept-ranges: bytes
```

**これは手元の配信が通っただけです。**本番の配信先は、決まってから同じ手順で通してください。

## 5. 帰属表示

`© OpenStreetMap contributors` を画面から外さないでください（`LICENSES.md` / D-007）。
ベースデータは ODbL です。帰属を消した状態で公開しないこと。

---

## まだできていないこと

- **グリフ（日本語）。** Protomaps が配っているフォントは Latin のみで、
  CJK のフォントスタックがありません。**1 範囲でも 404 になると地図全体が真っ白になります。**
- **配信先。** 「すぐ試せる配信先」を用意するかどうかは未決です（`.claude/decisions.md` 未決）。
- **画面を人が見ること。** 手元で `pnpm serve` すればデモは描けますが、
  **まだ誰もブラウザで見ていません**（§29）。テストが通ることと、地図が読めることは別です。

スタイル JSON は `styles/modern-dark.json` にあります。検査は `docs/styles/README.md`。

## タイルの中身を数える

切り出したタイルに何が何件入っているかは `pnpm tile:inspect` で見ます。
手順は [inspect.md](inspect.md)。

## 切り出す「形」について

全国は **z11 以上を 8 つの四角**（`tools/tiles/regions/japan.geojson`）で、
**z10 以下を bbox 全域**で切り、`pmtiles merge` で 1 つにします。

四隅（与那国島・沖ノ鳥島・南鳥島・択捉島）を 1 つの四角で囲うと、**太平洋をまるごと抱えます**。

| 切り方 | タイル件数 | 容量（実測） |
|---|---|---|
| bbox 1 個（四隅） | 1,732,855 | 3.37 GiB |
| **z10 以下 bbox ＋ z11 以上 8 つの四角** | **819,672** | **2.60 GiB** |

**-792 MiB（-23%）／タイル件数 -53%。**

### なぜ倍率で切り分けるのか

**低い倍率で region を使うと、海に穴が開きます。**

z5 で日本全体を見たとき、region の外にある海のタイルが無いので、
**東京の東の太平洋に黒い矩形**が出ました（2026-09-17・撮って気づいた）。
低い倍率のタイルは安く、**全域 z0-10 で 78 MB** しかないので、そこだけ bbox で取ります。

| 倍率 | 全域 bbox の容量 |
|---|---|
| z0-6 | 1.9 MB |
| z0-8 | 13 MB |
| **z0-10** | **78 MB** |

切り替え倍率は `manifest.json` の `regionMinZoom`（いまは 11）。

**遠方の島は 1 つも落としていません。**四隅を含む 35 点（県庁所在地・離島）が
領域に入っていることを `tools/tiles/test/coverage.test.ts` が止めています。
**四角を足したり縮めたりするときは、このテストが通ることを確認してください。**

最初に書いた版では、屋久島・種子島・トカラ列島が抜けていました（29.1〜30.9N が空白）。
**測らなければ気づきません。**

### 容量の本丸は zoom です

| maxzoom | 容量（8 つの四角） |
|---|---|
| 12 | 285 MB |
| 13 | 622 MB |
| 14 | 1.3 GB |
| **15** | **2.8 GB** |

**z15 だけで全体の 54%（1.5 GB）**です。
どこまで寄れる地図にするかは品質の判断なので、`DESIGN.md` 側の話になります。
