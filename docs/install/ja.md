# MMJ の導入

> **部品は npm にあります。**それ以外は自分で置きます。
>
> ```bash
> pnpm add @mmj-map/elements
> ```
>
> **これで手に入るのは部品だけです。**配信されたタイルもスタイルもありません。
> `.pmtiles` とスタイル JSON は自分で用意します。**それがこの製品の狙い**です——
> API キーなし・従量課金なし・地図サーバーなし。

地図に要るものは 3 つ。MMJ は後ろ 2 つを配り、最初の 1 つの作り方を示します。

**1. タイル — 地図の中身。** 道・川・建物・地名が、**1 つのファイル**に詰まったものです。
写真や PDF と同じように、自分のサーバーに置きます。拡張子は `.pmtiles` で、
ブラウザは**その中の必要な数 KB だけ**を取りに行きます（動画の途中から再生するときと
同じ、HTTP の範囲指定という仕組みです）。**自分で用意するのはここだけ**です。
サイトが扱う土地ごとに中身が違うからです。**1 都市でだいたい 10〜60 MB。**

**2. スタイル — 地図の見た目。** 川はこの青、高速道路はこの太さ、地名はこの倍率から
この大きさで——と書いた JSON です。**同じタイルでも、スタイルが違えば別の地図に見えます。**
このリポジトリに 6 枚あるので、選ぶだけで構いません。

**3. 部品 — HTML のタグ。** `<mmj-map>` などです。タグを 1 つ書いて、
上の 2 つのファイルの場所を指すと地図が出ます。ビルド工程もフレームワークも要りません。

| | 何 | どこから |
| --- | --- | --- |
| 1 | **タイル** — `.pmtiles` 1 ファイル | **ここだけ自分で作る。**公開ビルドから切り出すか、デモ用を落とす |
| 2 | **スタイル** — `.json` 1 ファイル | このリポジトリの `styles/`（6 枚） |
| 3 | **部品** — 素の ESM。ビルド不要 | npm、または `packages/elements/src/` をコピー |

**立てるサーバーはありません。**静的配信 ＋ HTTP Range だけで完結します。
サイトが既に GitHub Pages・Netlify・S3・素の nginx のどれかに載っているなら、
**それで足ります**（どれも範囲指定に対応しています）。

## 1. タイルを用意する

### A. デモ用タイルを落とす（最短）

```bash
gh release download demo-tiles-20260915 \
  --repo meta-taro/mmj-map \
  --pattern demo.pmtiles --output tiles/demo.pmtiles
```

**62.8 MB・大阪のみ・z0〜15。**地図が気に入るかを見るには足ります。
**他の土地のサイトを出すには足りません。**

### B. 自分で切り出す

[Protomaps](https://protomaps.com/) の日次ビルドから、地球上の好きな範囲を切り出します。
[go-pmtiles](https://github.com/protomaps/go-pmtiles) とディスクが要ります。

```bash
git clone https://github.com/meta-taro/mmj-map
cd mmj-map && pnpm install
pnpm tiles:extract -- hanoi       # tools/tiles/manifest.json にある region 名
```

**実例を 3 つ。** 3 つとも 2026-09-24 に、同じ上流ビルドから、手元のノート PC で
**それぞれ 1 分かからず**切り出したものです。数字は実測で、見積もりではありません。

| 地域 | コマンド | 大きさ | Range 往復 | ラベル |
| --- | --- | --- | --- | --- |
| **大阪** | `pnpm tiles:extract -- demo` | 62.8 MB | — | 既定（日本語） |
| **ハノイ** | `pnpm tiles:extract -- hanoi` | **10.9 MB** | 45 | `lang="vi"` |
| **ニューヨーク** | `pnpm tiles:extract -- newyork` | **21.2 MB** | 41 | `lang="en"` |

大阪はデモ用のファイルで、**四角ではなく多角形**で切ってあります
（低い倍率は全国の俯瞰、街路まで持つのは大阪中心部だけ）。GitHub Pages の
1 ファイル上限に収めるためで、ハノイとニューヨークは**素の四角**です。
普通に書くのはこちらの形になります。

`lang` はタグの属性です。**タイルもスタイルも別物を用意しません。**

```html
<mmj-map tiles="./tiles/hanoi.pmtiles" style-url="./styles/modern-dark.json"
         center="105.8520,21.0285" zoom="13" lang="vi"></mmj-map>
```

**付けないと既定のまま**で、既定は日本語の名前を優先します。ベトナム語で読む人に
ハノイが「ハノイ」と出ます。ハノイの切り出しで実測したキー（z10 のタイル 1 枚）:
`name:en` 45 / `name:ko` 29 / `name:zh-Hant` 28 / `name:zh-Hans` 28 / **`name:vi` 27**。

ニューヨークは逆で、地物が最初からラテン文字の `name` を持っています。
`lang="en"` の役目は、**少数だけ入っている日本語訳が混ざるのを止めること**です。

**同じコマンドで取れる地域が、あと 4 つ定義済み**です。

| 地域 | コマンド | `lang` |
| --- | --- | --- |
| ソウル | `pnpm tiles:extract -- seoul` | `ko` |
| 台北 | `pnpm tiles:extract -- taipei` | `zh-Hant` |
| 上海 | `pnpm tiles:extract -- shanghai` | `zh-Hans` |
| シンガポール | `pnpm tiles:extract -- singapore` | `en` |

**自分の土地は `tools/tiles/manifest.json` に 1 項目足すだけ**です。
名前と、`[西, 南, 東, 北]` の順に並べた四角と、最大倍率。それだけです。

手順は [`docs/tiles/README.md`](../tiles/README.md)。
**公開データと公開ツールだけ**で完結します。アカウントも鍵も上限もありません。

> **大きさは効きます。**1 ファイル 100 MB を越えると GitHub Pages に載りません。
> タイルサーバーの費用を払う前に、**範囲か倍率を削る**ほうを先に考えてください。

## 2. スタイルを選ぶ

[`styles/`](../../styles/) から `.json` を 1 枚、ページの隣へ置きます。

| ファイル | どんな見た目か |
| --- | --- |
| `modern-dark.json` | 夜。既定 |
| `modern-light.json` | 昼。道を白で抜き、太さだけで序列を付ける |
| `modern-ink.json` | 無彩色。白黒で刷っても潰れない |
| `modern-sand.json` | 暖色。紙の地図寄り |
| `modern-neon.json` | 夜のネオン。道の序列を**色相**で分ける |
| `modern-candy.json` | 昼のパステル。同じ色相の並びを明るい側で |

**6 枚とも提案で、承認された配色ではありません**（[`styles/README.md`](../../styles/README.md)）。

どのスタイルも `__TILES_URL__` を差し込み口として残しています。
**タイルの URL を焼き込まないでください。**部品が読み込み時に差し替えるので、
同じスタイルがどの環境でもそのまま動きます。

## 3. 部品を入れる

```bash
pnpm add @mmj-map/elements
```

コピーでも構いません。素の ES モジュールで**ビルド工程が無い**ので、どちらでも動きます。

```bash
cp -r packages/elements/src/ your-site/elements/
```

下の例はコピーした場合のパス（`./elements/index.js`）です。npm から入れた場合は
`node_modules/@mmj-map/elements/src/index.js` を指すか、束ねる道具に
`@mmj-map/elements` を解決させてください。

## 4. ページ

```html
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.css">
<style>
  mmj-map { display: block; height: 70vh; }
</style>
</head>
<body>

<mmj-map
  tiles="./tiles/demo.pmtiles"
  style-url="./styles/modern-dark.json"
  center="135.5023,34.6937"
  zoom="12">
  <mmj-marker lnglat="135.4959,34.7024" popup="梅田"></mmj-marker>
</mmj-map>

<script src="https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.js"></script>
<script src="https://cdn.jsdelivr.net/npm/pmtiles@4.4.0/dist/pmtiles.js"></script>
<script type="module" src="./elements/index.js"></script>
</body>
</html>
```

`maplibre-gl` と `pmtiles` は**読み込む側が** `<script>` で入れます。
MMJ は同梱しないので、**版を握るのはあなた**です。

`center` は `経度,緯度` です。**GeoJSON と同じ並び**で、口で言う順番とは逆です。

## サイトのテーマカラー

たいていのサイトにはあります。そのために 180 行のスタイル JSON を書かせません。

```html
<mmj-map tiles="..." style-url="./styles/modern-light.json" accent="#0A5FFF"></mmj-map>
```

`accent` は高速道路の線と駅の丸の縁に乗り、目印・まとまり・自前 POI の既定色にもなります。
**地図全体は塗りません。**塗ると陸・水・建物・道の区別が付かなくなります。

全部指定したいときは 24 の役割を渡します。

```html
<mmj-map tiles="..." style-url="./styles/modern-light.json" palette-url="./brand.json"></mmj-map>
```

その JSON は、4 色から作れます（手で書かなくて構いません）。

```bash
pnpm palette -- --land=#f7f9fb --water=#bfd7e8 --ink=#16202b --accent=#0a5fff --out=brand.json
```

[`tools/palette/README.md`](../../tools/palette/README.md) に詳細があります。
**MCP の口**もあるので、エージェントに作らせることもできます。

## 帰属表示は任意ではありません

ベースデータは OpenStreetMap、**ODbL 1.0** です。
`© OpenStreetMap contributors` を画面から消さないでください。
部品はこれを必ず描き、**消すための属性を用意していません**。

コードとスタイルは MIT です。上に重ねたあなたのデータはあなたのものです。
出す前に [`LICENSES.md`](../../LICENSES.md) を読んでください。

## まだ無いもの

- **配信されたタイル。**MMJ が配っている配信先はありません。自分のファイルを置いてください
- **経路探索。**`<mmj-route>` は**渡された**経路を描くだけで、計算はしません
- **日本語のグリフ。**漢字かなは閲覧側のフォントで描きます
  （`localIdeographFontFamily`）。**字形は環境ごとに変わります**

## そのほか

- [`docs/elements/README.md`](../elements/README.md) — 部品ごとの属性表
- [`docs/styles/README.md`](../styles/README.md) — スタイルをタイルと突き合わせる検査
- [`docs/serving/README.md`](../serving/README.md) — 配信と HTTP Range
- デモ: https://meta-taro.github.io/mmj-map/
