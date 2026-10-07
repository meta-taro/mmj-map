# MMJ

**自分の地図を持つ**ための道具。**API キーなし・従量課金なし・地図サーバーなし。**

[![台風が近づく雨雲レーダーの画面][shot-rain]][demo-rain]

<p align="center">
  <b><a href="https://meta-taro.github.io/mmj-map/">デモを開く</a></b> ·
  <a href="https://meta-taro.github.io/mmj-map/rain.html">上の絵を動かす</a> ·
  <a href="docs/install/ja.md">導入手順</a> ·
  <a href="README.md">English</a>
</p>

> この頁に出ているものは**全部、GitHub Pages に置いた静的ファイル**です。
> 上の動く絵も含めて、裏側に何もありません。

## 動いているところ

| | |
|---|---|
| [![写真つきのカードが開いた店舗の地図][shot-shops]][demo-shops]<br>**自分の店舗を、中身のあるカードで**——写真・星・曜日ごとの営業時間・タブ。開いている店は `?shop=` に残るので、**その 1 軒を開いた状態で共有**できます。 | [![建物が立った大阪の道案内][shot-3d-route]][demo-3d-route]<br>**建物を立てたまま道案内**——曲がる角に写真を出せます。建物は走っている地図のまま立てたり寝かせたりできます。 |
| [![6 枚のスタイルを並べた画面][shot-themes]][demo-themes]<br>**手書きのスタイル 6 枚**。サイトのテーマカラー 1 色を渡すこともできます。当たるのは高速道路と駅の丸だけで、**地図全体は塗りません**（塗ると地図として読めなくなります）。 | [![点がまとまって表示されている地図][shot-cluster]][demo-cluster]<br>**点が多くても潰れない**——引くとまとまり、寄るとばらけます。読むのは**あなたが置いた GeoJSON** です。 |

8 地域を切り替えられます（大阪・ハノイ・ホーチミン・ニューヨーク・シンガポール・上海・台北・ソウル）。
デモは全 17 頁。

## こういうときに使えます

### 「地図の請求が、こちらで止められない量に比例して増える」

表示ごとの課金です。サイトが伸びるほどグラフが悪くなり、**その数字はこちらで上限を決められません**。
MMJ に**メーターはありません**。必要な範囲を 1 度だけ切り出し（街ひとつで 10〜60 MB・1 分かかりません）、
ファイルとして置くだけです。**通信費は「静的ファイルの配信料」で、多くのサイトでは 0 円です。**

### 「会場に電波が無い」

ホール・地下・催事場・防災訓練。**GPS は通信が無くても動きます**——測位は衛星からで、回線ではありません。
欠けていた唯一のピースは、**地図のほうがネット越しだった**ことだけでした。

デモの 1 頁は、通信を切っても地図が出ます（タイル 1.9 MB ＋ 字 562 KB ＋ 道具 1.15 MB）。
**会場ほどの範囲だからできること**で、日本全土では同じことはできません。

### 「他人の地図ではなく、自分の点を出したい」

自社の店舗・施設・点検箇所。サイトの配色で、利用者の言語で、写真つきで出したい。
そして**その一覧を、どこかへ渡したくない**。

**データは配信元から出ません**。部品が読むのは**あなたが置いた GeoJSON** で、
MMJ には送り先になる配信元がそもそもありません。

## 試す

**1 コマンドと、写すだけ**。自分の街を切り出して、頁に置きます。

```bash
npx @mmj-map/tiles extract osaka --bbox=135.4,34.6,135.6,34.8
```

```
上流の最新 20260924.pmtiles（basemap 4.15.2）で切り出します。
できました: ./tiles/osaka.20260924.pmtiles
9.8 MB — GitHub Pages に乗ります（1 ファイル 100 MB / サイト全体 1 GB）。
```

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/maplibre-gl@6.12.0/dist/maplibre-gl.css">
<style>mmj-map { display: block; height: 70vh; }</style>

<mmj-map
  tiles="./tiles/osaka.20260924.pmtiles"
  style-url="./styles/modern-dark.json"
  center="135.5023,34.6937"
  zoom="12">
  <mmj-marker lnglat="135.4959,34.7024" popup="梅田"></mmj-marker>
</mmj-map>

<script type="module">
  import * as maplibregl from "https://cdn.jsdelivr.net/npm/maplibre-gl@6.12.0/dist/maplibre-gl.mjs";
  window.maplibregl = maplibregl;
</script>
<script src="https://cdn.jsdelivr.net/npm/pmtiles@4.4.0/dist/pmtiles.js"></script>
<script type="module" src="./elements/index.js"></script>
```

`center` は `経度,緯度` です。**GeoJSON と同じ並び**で、口で言う順番とは逆です。

部品は **8 つ**あります（`mmj-map` `mmj-marker` `mmj-poi` `mmj-cluster` `mmj-route`
`mmj-circle` `mmj-raster` `mmj-fill`）。どれも素の ESM で、**ビルド工程はありません**。

| | |
|---|---|
| 部品 | [`@mmj-map/elements`](https://www.npmjs.com/package/@mmj-map/elements) |
| 切り出し | [`@mmj-map/tiles`](https://www.npmjs.com/package/@mmj-map/tiles) |
| 導入手順 | [日本語](docs/install/ja.md) · [English](docs/install/en.md) · [繁體中文](docs/install/zh-TW.md) · [简体中文](docs/install/zh-CN.md) · [Tiếng Việt](docs/install/vi.md) |
| 属性の全文（1 回の取得で全部） | <https://meta-taro.github.io/mmj-map/llms-full.txt> |

> **状態: 使えます。ただし初期です。**
> **配信されたタイルはありません**（自分で切り出します。それが狙いです）。
> **日本語のグリフがありません**——漢字かなは閲覧側のフォントで描くので、**字形が環境ごとに変わります**。
> スタイル 6 枚は**提案**で、承認された配色ではありません。詳細は [`PRD.md`](PRD.md)。
>
> **2026-09-24 に `mmj-map` へ改名しました**（D-025）。
> `github.com/meta-taro/modern-map-japan` は 301 でリダイレクトされますが、
> **GitHub Pages はリダイレクトしません**。旧デモ URL は 404 です。

## なぜ

**地図には、方向の違う不満が 2 つあります。**

- **商用の地図 API は鍵が要ります。** 無料で自由には使えません。表示ごとに課金され、
  何をどう載せられるかも向こうの規約で決まります。
- **OpenStreetMap の地図は、そのままでは良くありません。** データは自由ですが、
  **既定の見え方は自由になっていません。**

**そして、ほとんどの利用者に世界中のタイルは要りません。**
必要なのは自分が扱う範囲だけで、**それなら自分で持てます**——1 都市で 10〜60 MB、
切り出しに 1 分かかりません。**世界を配る必要がないから、サーバーが要らなくなります。**

MMJ は、この 3 つを同時に解いたものです。**データは OSM から借り、表現は自分で持ちます。**

残りの選択肢にも、それぞれ引っかかりがあります。

- **OpenStreetMap の公式タイルサーバー**は選択肢になりません。
  [Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) が
  商用利用・高トラフィック利用を認めていません。**使っているサイトは実在しますが、
  それは計画ではなく将来の事故です。**
- **タイルサーバーを自前で立てる**のは動きますが、**タイルサーバーの運用が仕事に加わります**。

結果として、実際に出せる地図は「他人の地図を、他人の見た目で、他人のメーターで」になります。

> **OSM の見え方に不満があると書きましたが、それはコモンズへの不満ではありません。**
> この地図は、OpenStreetMap に測量・資金・編集で関わっている人と組織の上に立っています。
> **誰が支えているかは [`CREDITS.ja.md`](CREDITS.ja.md) に名指しで書いてあります。**
> 見え方を自分で持つのは、**そこを引き受けるため**です。

### 「なら、コミュニティに入って直せばいい」

**正当な指摘です**。そして、データについてはそのとおりです。**道が間違っていたら、
直す先は OSM です**。このリポジトリではありません。

ただし**見え方は、上流で直せる種類のものではありません。** OSM の既定スタイルは
**世界中のあらゆる用途に 1 枚で応える**ものです。**1 枚で全部に応えるものは、
どの用途にも最適になりません**。それは欠陥ではなく、役割の違いです。

MMJ が持ち込むのは、**上流へ出すべきでないもの**です。

- **サイトのテーマカラー** — その 1 サイトの色であって、地図の色ではありません
- **その土地の言語でのラベル** — 読む人によって正解が違います
- **自前の POI** — そのサイトが持っているデータで、地図のデータではありません
- **道案内の、曲がる地点に出す写真** — 「このコンビニを左折」。
  **その経路を通る人にしか意味がありません**

どれも**その 1 サイトの都合**で、**データではありません。**
**データの改善は OSM へ。表現は各サイトが持つ**。これがこの製品の線引きです。

## 何が飛ぶか

**ゼロから始めると、地図が 1 枚出るまでに 4 つの工程があります。** MMJ を使うと、それが飛びます。

| 飛ぶ工程 | 知らないと起きること |
|---|---|
| **権利を把握する** | OSM の [Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) は**商用と大量アクセスを認めていません**。ODbL の帰属を画面から外すのも違反です |
| **配信の仕組みを知る** | **`Range` に 200 を返す配信先があります**。地図は出るので見ても分かりませんが、**1 タイル見るたびに元ファイル全体が落ちてきます**。MMJ には検査が入っています（`pnpm tiles:check-range`） |
| **上流の仕組みを知る** | 日次ビルドは**消えます**。**pin してから 9 日で消えました**（2026-09-24 実測）。pin と戻り先を持っていないと、ある日いきなり切り出せなくなります |
| **デザイン調整を探る** | 手書きのスタイルが 6 枚あります。**配色を探す工程がまるごと無くなります** |

ほかにも、踏んでから気づく種類のものがあります。

- **`name:zh` は存在しません**（`zh-Hant` / `zh-Hans` に分かれています）。推測で書くと当たりません。
  MMJ は属性 1 つで切り替えます（`lang`）
- **1 ファイルは地球の一部しか持ちません**。その外へ出て何も出ないのは**正常**ですが、
  **壊れたのと区別がつきません**。MMJ は、取りに行って空だった場所を塗ります

**どれも調べれば分かります。ただ、調べる前に踏みます。**

## 何を作るか

**データは借りる。表現は持つ。**

- **ベースタイル**は [Protomaps](https://protomaps.com/) の日次**プラネット**ビルドから
  **必要な範囲を**切り出し、[PMTiles](https://github.com/protomaps/PMTiles) 1 枚として配ります。
  **タイル生成パイプラインは自作しません。**
- **スタイル**は [MapLibre](https://maplibre.org/) のスタイルを手書きし、**地域ごとに持ちます。**
  1 組目は日本の条件——**地名の密度・漢字かな英数の混在・鉄道の路線色**——に向けて作っています。
  **道具は世界、スタイルは地域ごと**。この線引きが設計そのものです。
- **UI 部品**（Marker / Popup / Cluster / 自前 POI / 経路）を Web Components で配ります。
  React・Vue のラッパは**予定であって、まだ書いていません**。
- **サーバーを立てません。** 静的配信 ＋ HTTP Range だけでデプロイが完結します。

## どこで動くか

**Protomaps が覆っている範囲、つまり地球全体です**。道具に日本固有のものはありません。
bbox か多角形を渡せば、その範囲のタイルが出ます。

日本は**スタイルが一番進んでいる地域**というだけです。
台湾・上海・ベトナム・シンガポールが次です（D-018）。
**地域ごとなのはスタイルで、コードではありません。**

## 作らないもの

- タイルサーバー。その fork も作りません。
- レンダリングエンジン。それは MapLibre の仕事です。
- ジオコーダ・経路探索・地点データベース。
- **地図の費用を下げる道具ではありません。** 座標の取得元が
  「その提供者の地図の上に表示すること」を条件にしている場合、
  **ベース地図だけを差し替える自由はありません。** 前提にする前に確認してください。

## ライセンス

**2 つあり、重なりません。**

| 対象 | ライセンス |
|---|---|
| コード・スタイル・UI 部品 | **MIT**（`LICENSE`） |
| ベース地図データ（OpenStreetMap） | **ODbL 1.0** — 画面上の帰属表示が必要 |

出す前に [`LICENSES.md`](LICENSES.md) を読んでください。要点は 2 つで、
**`© OpenStreetMap contributors` を画面から消さないこと**、そして
**その上に重ねたあなたのデータは、あなたのものから変わらないこと**です。

## 資料

- [`docs/install/`](docs/install/) — **サイトに地図を置く手順**（English / 日本語 / 繁體中文 / 简体中文 / Tiếng Việt）
- [`docs/tiles/README.md`](docs/tiles/README.md) — **ベースタイルを自分で作る手順**（公開データと公開ツールだけで完結します）
- [`PRINCIPLES.md`](PRINCIPLES.md) — このプロジェクトの指針。何を約束し、データを何で選び、誰を歓迎するか（英語）
- [`CREDITS.ja.md`](CREDITS.ja.md) — **この地図が立っている土台**（英語版: [`CREDITS.md`](CREDITS.md)）
- [`PRD.md`](PRD.md) — スコープと、**あえて作らないもの**
- [`docs/decisions.md`](docs/decisions.md) — 決定と、その理由
- [`docs/origin/`](docs/origin/) — 原案の原文（手を入れていません）

## 参加

[`CONTRIBUTING.md`](CONTRIBUTING.md) を読んでください。Issue は日本語でも英語でも構いません。

<!--
  上で使っている画像とデモのリンクは、ここ 1 か所にまとめてある。

  画像を絶対 URL にしているのは意図的。この文書は npm や fork でも読まれ、
  相対パスだと別の場所を指して画像が死ぬ。指しているのは deploy が作り直す
  ファイルなので、差し替えは「ファイルを置き換える」で済み、この README は触らない。

  スクリーンショットを足すときは、必ず目で見ること。デモのデータは架空だが、
  それでも公開の宣伝物に出してはいけない名前が写ることがある。
  `venue.jpg` をここで使っていないのはそのため——あの範囲は特定企業の施設名が
  絵の主役になり、宣伝物では提携していると読まれかねない
  （同じ判断が `apps/demo/og.html` に記録されている）。
-->

[shot-rain]: https://raw.githubusercontent.com/meta-taro/mmj-map/develop/apps/demo/shots/rain.jpg
[shot-shops]: https://raw.githubusercontent.com/meta-taro/mmj-map/develop/apps/demo/shots/shops.jpg
[shot-3d-route]: https://raw.githubusercontent.com/meta-taro/mmj-map/develop/apps/demo/shots/3d-route.jpg
[shot-themes]: https://raw.githubusercontent.com/meta-taro/mmj-map/develop/apps/demo/shots/themes.jpg
[shot-cluster]: https://raw.githubusercontent.com/meta-taro/mmj-map/develop/apps/demo/shots/cluster.jpg

[demo-rain]: https://meta-taro.github.io/mmj-map/rain.html
[demo-shops]: https://meta-taro.github.io/mmj-map/shops.html
[demo-3d-route]: https://meta-taro.github.io/mmj-map/3d-route.html
[demo-themes]: https://meta-taro.github.io/mmj-map/themes.html
[demo-cluster]: https://meta-taro.github.io/mmj-map/cluster.html
