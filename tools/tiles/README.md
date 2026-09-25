# @mmj-map/tiles

**地球上の好きな範囲の PMTiles を、公開データと公開ツールだけで切り出す道具です。**
鍵も、アカウントも、タイルサーバーも要りません。

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

出来た 1 ファイルを静的配信に置けば、それがあなたの地図です。
表示側は [MMJ](https://meta-taro.github.io/mmj-map/) の `<mmj-map>` でも、
素の [MapLibre](https://maplibre.org/) ＋ [pmtiles](https://www.npmjs.com/package/pmtiles) でも構いません。

## 先に要るもの

| | |
|---|---|
| Node.js | 22.12 以上 |
| `pmtiles` コマンド | [go-pmtiles のリリース](https://github.com/protomaps/go-pmtiles/releases)から OS に合うものを落として PATH に置く（BSD-3-Clause） |

**`pmtiles` を自動で落とすことはしません。**checksum が公開されておらず、
**確かめられないバイナリを黙って実行させたくない**ためです。

## 何をしているのか

[Protomaps の日次プラネットビルド](https://maps.protomaps.com/builds/)（全体 138 GB）から、
**HTTP Range で必要な範囲だけ**を取ります。1 都市あたり数十リクエスト・数十秒です。

**タイル生成パイプラインは自作していません。**データは借りて、切り出すだけです。

## 使い方

### 範囲を四角で渡す

```bash
npx @mmj-map/tiles extract <名前> --bbox=<西>,<南>,<東>,<北> [--maxzoom=15]
```

| | |
|---|---|
| 出力先 | **叩いた場所の `./tiles/`**（`--out-dir=` で変えられます） |
| 使う上流 | **実行時に索引から最新を解決**。`--build=<キー>` で指定もできます |
| 最大倍率 | 既定 15。`--maxzoom=13` のように下げると軽くなります |

**出力名に版が入ります**（`nagoya.20260924.pmtiles`）。上流の日次ビルドは
**1 週間ほどで消えます**（pin してから 9 日で消えたのを実測）。
版を名前に持たせておくと、**どの版で作ったかを後から言えます**。

### 配信先が Range に応えるか確かめる

```bash
npx @mmj-map/tiles check-range https://example.com/tiles/nagoya.20260924.pmtiles
```

**`200` を返す配信先は使えません。**地図は出ますが、**1 タイル見るたびに
元ファイル全体が落ちてきます**。見ただけでは分かりません。

`206` を返す例: GitHub Pages / Cloudflare R2 / Amazon S3 / Netlify。

### 大きさの目安（実測）

| 範囲 | 大きさ |
|---|---|
| 名古屋（市街・z15） | 9.8 MB |
| ハノイ | 10.9 MB |
| 大阪（デモ用・広域 z9 ＋ 市街 z15） | 62.8 MB |
| 日本全土（z15） | 2.6 GB |

**ほとんどの用途で、世界中のタイルは要りません。**自分の街のぶんを持てば足ります。

## ライセンスと帰属

- このパッケージのコード: **MIT**
- 切り出したタイルの中身: **ODbL**（OpenStreetMap 由来）

**`© OpenStreetMap contributors` を画面から外さないでください。**
これは体裁ではなく、ODbL の条件です。

## もっと詳しく

- 手順の全文: <https://github.com/meta-taro/mmj-map/blob/develop/docs/tiles/README.md>
- 製品のデモ: <https://meta-taro.github.io/mmj-map/>
- 不具合・要望: <https://github.com/meta-taro/mmj-map/issues>
