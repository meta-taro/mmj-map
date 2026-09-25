# ベースタイルを自分で作る

**このリポジトリはタイルを配りません。作り方を配ります。**
ここに書いた手順は、公開データと公開ツールだけで完結します。作者の環境にも鍵にも依存しません（PRD §0）。

| 使うもの | 何のため | ライセンス |
|---|---|---|
| [Protomaps 日次プラネットビルド](https://maps.protomaps.com/builds/) | ベースタイルの出どころ | データは ODbL（OSM 由来） |
| [go-pmtiles](https://github.com/protomaps/go-pmtiles) | 日本ぶんの切り出し | BSD-3-Clause |

タイル生成パイプラインは自作しません（`.claude/decisions.md` D-001）。

---

## clone せずに使う（`npx`）

**このリポジトリを clone しなくても、自分の街を切り出せます。**

```bash
npx @mmj-map/tiles extract nagoya --bbox=136.85,35.13,136.95,35.20
```

```
上流の最新 20260924.pmtiles（basemap 4.15.2）で切り出します。
出力: nagoya.20260924.pmtiles（名前に版が入ります）
...
できました: ./tiles/nagoya.20260924.pmtiles
9.8 MB — GitHub Pages に乗ります（1 ファイル 100 MB / サイト全体 1 GB）。
帰属表示（画面から外さない）: © OpenStreetMap contributors
```

**`pmtiles` コマンドだけは別に要ります**（下の「用意する」）。

| | |
|---|---|
| 出力先 | **叩いた場所の `./tiles/`**（`--out-dir=` で変えられます） |
| 使う上流 | **実行時に索引から最新を解決**。`--build=<キー>` で指定もできます |
| 最大倍率 | 既定 15。`--maxzoom=13` のように下げると軽くなります |
| `manifest.json` | **編集不要**。`--bbox` を渡せばその場限りの範囲として扱います |

**なぜ最新を取るのか。**このリポジトリの中では 1 本を pin しますが（D-010）、
**pin は 1 週間ほどで上流から消えます**（実測 9 日）。配った道具が pin だけを見ていたら、
**配った翌週には 404 で止まります。**代わりに**出力名へ版を入れる**ので、
「どの版で作ったか」は後から言えます。

配信先が `Range` に 206 で応えるかは、出したあとに確かめてください。

```bash
npx @mmj-map/tiles check-range https://example.com/tiles/nagoya.20260924.pmtiles
```

**200 を返す配信先は使えません。**地図は出ますが、**1 タイル見るたびに元ファイル全体が
落ちてきます**（見ただけでは分かりません）。

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
pnpm tiles:resolve -- --update=20260923.pmtiles
```

### pin は上流から消えます

**日次ビルドは古いものから削除されます。**実測（2026-09-24）では、
**pin してから 9 日で消えました**。消えると切り出しが落ちます。

```
pmtiles extract https://build.protomaps.com/20260915.pmtiles ...
Failed to create range reader, HTTP error: 404
```

`pnpm tiles:resolve` も同じことを検出して止まります。**自動では乗り換えません**（D-010）。

```
pin している 20260915.pmtiles が上流の索引にありません。
  警告 20260914.pmtiles は上流の索引から消えています。戻れません。
```

**このとき戻り先も一緒に消えていることがあります**（実測ではそうでした）。
その場合は上げるしかありません。**上げる前に `basemapVersion` を見ること。**
同じなら、スタイルは高い確率で無傷です。

```bash
pnpm tiles:resolve -- --update=<上流にある新しいキー>
pnpm --filter @mmj-map/style-check run snapshot -- dist/tiles/<新しく切ったもの>.pmtiles
pnpm style:check     # vectorLayers に差が無ければ、スタイルは無傷
```

2026-09-24 に `20260915` → `20260923` へ上げたときは、**`basemap` が 4.15.2 のまま同じ**で、
スナップショットの差分は**出どころの 3 行だけ**、`vectorLayers` は 1 バイトも変わりませんでした。

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
- **全国ぶんの配信先。** R2 + Worker のコードは出来ていますが、**まだデプロイしていません**。
  **デモを出すだけなら要りません** — 大阪の 62.8 MB は GitHub Pages に直接載っていて、
  Release `demo-tiles-20260915` からも落とせます。R2 が要るのは、
  Pages の上限（1 ファイル 100 MB / サイト 1 GB）を越える範囲を配るときです。

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

## 上流がおかしいときに戻る（ロールバック）

pin は 1 本だけです（D-010）。**同じコマンドが日によって違う地図を作らない**ためです。
ただしそれだけだと**戻り先がありません**ので、確認済みの旧版を 3 本まで持ちます（D-014）。

```bash
# いまの pin と戻り先を見る
pnpm tiles:resolve
#=> pin:      20260923.pmtiles（basemap 4.15.2）
#   上流最新: 20260923.pmtiles（basemap 4.15.2）
#   戻り先:   20260922.pmtiles, 20260921.pmtiles
#   pin と上流は一致しています。

# 1 つ前の版で切り出す（出力名に版が入る）
pnpm tiles:extract -- japan --build=previous
#=> dist/tiles/japan.20260922.pmtiles

# 2 つ前 / キー直指定
pnpm tiles:extract -- japan --build=previous-2
pnpm tiles:extract -- japan --build=20260921

# 戻り先を足す（上流の索引と突き合わせてから書く・3 本まで）
pnpm tiles:resolve -- --remember=20260922.pmtiles
```

**manifest に書いていない版は使えません**（引数で任意の URL を取りに行かせないため・§21）。

```
$ pnpm tiles:extract -- kansai --build=20200101
manifest が知らない版です: 20200101
使えるのは: 20260923.pmtiles, 20260922.pmtiles, 20260921.pmtiles
足すなら `pnpm tiles:resolve -- --remember=<キー>`
```

### 出力名に版が入ります

**pin 以外で切ったら、`japan.20260922.pmtiles` になります。**
同じ名前へ上書きすると、20 分かけて作った新しい方を古い版で潰す事故が起きるためです。
配信へ出すときは rename してください。

### 戻り先が上流から消えたら、resolve が言います

```
戻り先: 20260922.pmtiles, 20260921.pmtiles
  警告 20260914.pmtiles は上流の索引から消えています。戻れません。
```

### 上流が何を残しているか（2026-09-24 実測）

索引にあるのは **62 版**ですが、**日次で残っているのは直近 7 版だけ**です。

| | |
|---|---|
| 最古 | `20230918`（3 年前） |
| 最新 | `20260924` |
| **連続している範囲** | **`20260918`〜`20260924` の 7 日ぶんだけ** |
| その前 | 飛び飛び（`20260811` → `20260722` → `20260720` → `20260709` …） |

**つまり pin は 1 週間ほどで日次の窓から落ちます。**実際、9 日前の `20260915` は
索引から消えていました。**戻り先を 3 本持っていても、同じ週のものなら一緒に消えます。**

**以前ここには「61 版・約 2 か月ぶん保持」と書いてありました。外れています。**
件数だけ見て間隔を見ていなかったのが原因です。

### 分かっていること

**切り出したファイルは「どの上流版から作ったか」を持っていません。**
持っているのは OSM の時刻だけです。

```
planetiler:osm:osmosisreplicationtime  2026-09-15T04:00:00Z
```

pin で切ったファイル（`japan.pmtiles`）は、**名前からも中身からも版を特定できません。**
時刻から推測はできます。ここは未対応です（D-014）。
