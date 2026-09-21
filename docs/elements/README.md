# 部品（Web Components）— S2

HTML だけで地図を置くための部品です。**ビルド工程はありません。**
`packages/elements/src/*.js` が素の ESM で、そのまま配られます。

```html
<script src="https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.js"></script>
<script src="https://cdn.jsdelivr.net/npm/pmtiles@4.4.0/dist/pmtiles.js"></script>
<script type="module" src="/elements/index.js"></script>

<mmj-map tiles="https://tiles.example.com/japan.pmtiles"
         style-url="/styles/modern-dark.json"
         center="135.5023,34.6937" zoom="12" hash>
  <mmj-marker lnglat="135.4959,34.7024" popup="大阪梅田"></mmj-marker>
  <mmj-marker lnglat="135.5258,34.6873" popup="大阪城" color="#8fd3a6" popup-open></mmj-marker>
</mmj-map>
```

手元で動かすなら `pnpm serve` のあと <http://localhost:8787/elements.html>。
点をまとめる例は <http://localhost:8787/cluster.html>。

## 属性

### `<mmj-map>`

| 属性 | 意味 |
|---|---|
| `tiles` | PMTiles の URL（必須） |
| `style-url` | スタイル JSON の URL（必須） |
| `center` | `経度,緯度`（GeoJSON と同じ並び）。既定は大阪 |
| `zoom` | 0〜24。既定 12 |
| `hash` | 付けると URL の `#zoom/lat/lon` で場所を持つ |
| `3d` | 付けると建物を押し出す（下記） |
| `pitch` | 傾き 0〜85。既定 0、`3d` を付けたときだけ 45。**`hash` と併用しても効きます**（下記） |
| `accent` | **サイトのテーマカラー 1 色。**高速道路・駅の丸の縁・目印/まとまり/POI の既定色に当たる（下記） |
| `palette-url` | 役割ごとに色を指定した JSON の URL。`accent` より優先する（下記） |
| `cooperative` | 付けると 1 本指はページ送り、2 本指だけ地図が取る。**1 ページに何枚も置くときに要る** |
| `lang` | ラベルを出す言語（`en` / `zh-Hant` / `ko` …）。**地域ごとにスタイルを増やさないための仕組み**（下記） |
| `ideograph-fonts` | 漢字かなを描くフォント。既定は日本語向け。**中国語・韓国語の地図では差し替える** |

### `lang` — ラベルの言語

```html
<mmj-map tiles="..." style-url="/styles/modern-dark.json" lang="en"></mmj-map>
```

読み込んだあとに `text-field` を差し替えます。**スタイルは 6 枚のままです。**
地域 × 配色でスタイルを持つと **6 枚が 24 枚 48 枚と増えて破綻する**ので、色と同じく
「読み込んだあとに当てる」形にしてあります。

**`name` への落とし先は残ります。**その言語の名前が無い地物は、元の名前のまま出ます。
**消えません。**

> **日本の外では `lang` を必ず付けてください。**
> 配っている 6 枚のスタイルは `name:ja` を優先します。付け忘れると、
> **`name:ja` を持つ地物だけ日本語**になり、残りは現地語という**混在**になります。
>
> 実例（2026-09-22・実物で確認）: ホーチミンを `lang` 無しで開くと、
> 市の名前が **「ホーチミン市」** と日本語で出て、周りの水路はベトナム語のままでした。
> `lang="vi"` を付けると揃います。

#### 使えるキーは、タイルを開いて数えてください

上流が持っているキーは地域によって違います。大阪のタイルで数えた実測（2026-09-21）:

| キー | 件数 |
| --- | --- |
| `name:en` | 508 |
| `name:zh-Hant` | 20 |
| `name:zh-Hans` | 20 |
| `name:ko` | 9 |
| `name:vi` | 2 |

**`name:zh` は存在しません。**`zh-Hans` / `zh-Hant` に分かれています。推測で書くと当たりません。

```bash
pnpm tile:inspect -- dist/tiles/demo.pmtiles 12 3589 1626 --layer=places --list
```

**大阪で `lang="zh-Hant"` にしても、見た目はほとんど変わりません**（20 件しか無いため）。
**台北のタイルでは効きます**（`name:zh-Hant` が 215 件・2026-09-22 に実物で確認。
`docs/screenshots/2026-09-22-taipei-lang.jpg`）。

**件数が少ない ＝ 効かない、ではありません。**ベトナムは `name:vi` が 5 件しかありませんが、
`name` 自体がベトナム語なので `lang="vi"` で正しく出ます。

**当たらなければ例外を投げます。**言語を指定したのに元のままの地図を黙って出すと、
「指定したのに変わらない」という気づきにくい壊れ方になります。

### `ideograph-fonts` — 漢字かなのフォント

CJK のグリフは配っていないので、漢字かなは**閲覧側のフォント**で描きます。
既定は日本語向け（`Noto Sans JP` ほか）で、**中国語や韓国語の地図では字形が合いません**
（同じ符号でも国ごとに字体が違う）。

```html
<mmj-map ... lang="zh-Hant" ideograph-fonts="'Noto Sans TC', 'Microsoft JhengHei', sans-serif"></mmj-map>
```

**空文字では上書きしません**（空のフォント指定は字を消します）。

### `accent` / `palette-url` — サイトの色を当てる

**ほとんどの導入先には、そのサイトのテーマカラーがあります。**
180 行のスタイル JSON を書かせないために、色だけを渡せるようにしてあります。

```html
<!-- 1 色だけ渡す。土台は 6 枚から選ぶ -->
<mmj-map tiles="..." style-url="/styles/modern-light.json" accent="#0A5FFF"></mmj-map>
```

`accent` の 1 色が当たるのは **2 か所だけ**です。

| 当たる | 何 |
| --- | --- |
| `highway` | 高速道路の線。**画面で一番目に入る線** |
| `station` | 駅の丸の縁 |

加えて、`<mmj-marker>` / `<mmj-cluster>` / `<mmj-poi>` の**色を指定しなかったとき**の既定が
この色になります。ポップアップの箱と文字は、**土台のスタイルから借ります**
（明るいスタイルなら明るい箱）。

**地図全体をテーマカラーで塗りません。**塗ると陸・水・建物・道の区別が付かなくなり、
地図として読めなくなります。**もっと広く変えたいときは `palette-url`** を使ってください。

```html
<mmj-map tiles="..." style-url="/styles/modern-light.json" palette-url="./brand.json"></mmj-map>
```

```json
{
  "background": "#FFFFFF",
  "earth": "#FFFFFF",
  "water": "#DCE9F5",
  "buildings": "#EFF2F6",
  "road-minor": "#FFFFFF",
  "road-medium": "#FFFFFF",
  "road-major": "#F4F6F9",
  "highway": "#0A5FFF",
  "highway-casing": "#0842B5",
  "label-city": "#10172A",
  "halo": "#FFFFFF"
}
```

役割は 24 個あります。**書いたものだけが当たり、書かなかったところは土台のまま**です。

`background` `earth` `landcover` `green` `built` `paved` `water` `waterway` `buildings`
`path` `road-minor` `road-medium` `road-major` `highway-casing` `highway` `rail` `boundary`
`station` `station-fill` `label-city` `label-station` `label-neighbourhood` `label-water` `halo`

`accent` と `palette-url` を両方書いたときは `palette-url` が勝ちます（細かいほうを優先）。

**当たらなかったら例外を投げます。** 色を渡したのに 1 つも当たらない地図を黙って出すと、
「指定したのに変わらない」という気づきにくい壊れ方になります。
自前のスタイルに当てるときは、`styles/README.md` のレイヤ id を保ってください。

**こちらは色を作りません**（baseline §11 / D-002）。1 色から陸・水・道の明度を機械的に
振って土台ごと生成する案は、**D-002 が採らなかった案**なので入れていません。
必要なら提案として出します。

#### いま出来ないこと

- **読み込んだあとに `style-url` / `accent` を書き換えても切り替わりません。**
  生成時に 1 回だけ読みます。切り替えたいときは要素を置き直してください
  （`apps/demo/brand.html` がそうしています）

### `3d` — 建物の押し出し

```html
<mmj-map tiles="..." style-url="..." center="135.4959,34.7024" zoom="16" 3d pitch="60"></mmj-map>
```

**タイルは 2D のときと同じものです。**足すデータも、追加の取得もありません。

| | リクエスト | 転送量 |
|---|---|---|
| 2D | 17 | 735,015 B |
| 3D | 17 | 735,015 B |

（梅田 z16 / pitch 60 の同一視点で実測・2026-09-20）

変わるのは描き方だけなので、**スタイルの決定ではなく、置く側の切り替え**にしてあります。
手書きスタイル（`styles/modern-dark.json`）は書き換えません。読み込んだ後のオブジェクトへ
押し出しレイヤを 1 枚足すだけです。

知っておくべきことが 3 つあります。

- **高さを持つ建物だけが立ちます。**実測で **3 割ほどが `height` を持ちません**
  （梅田 12,166/17,651・難波 20,383/29,435）。持たないものは 2D のまま平らに残ります。
  **既定値で埋めていません。**データに無い高さを、あるように見せないためです
- **色は決めていません。**押し出す面の色は、スタイルの 2D 建物レイヤが持っている
  `fill-color` をそのまま読みます。ここで新しい色を作ると、人が決めていない配色が
  既成事実になります
- **陰影は MapLibre の既定のままです。**面ごとの明暗を決めていません。
  `DESIGN.md` に 3D の規定が無いため、**仮置き**です


イベント: `mmj-ready`（`detail.map` に MapLibre の Map）／ `mmj-error`。

### `<mmj-marker>`

| 属性 | 意味 |
|---|---|
| `lnglat` | `経度,緯度`（必須） |
| `popup` | 押したときに出す文字 |
| `image` | 吹き出しに載せる写真の URL（**http / https と相対パスだけ**） |
| `image-alt` | 写真の代替テキスト。省くと `popup` の文字を使う |
| `popup-open` | 最初から開いておく |
| `color` | 目印の色 |

### `<mmj-cluster>`

点が多いときに、まとめて描きます。**まとめる計算は MapLibre の GeoJSON source が
持っている**ので、この部品は 3 枚のレイヤを排他の filter で置くだけです（D-011）。

```html
<mmj-map tiles="..." style-url="...">
  <mmj-cluster src="./data/sample-points.geojson" radius="50" max-zoom="14"></mmj-cluster>
</mmj-map>
```

| 属性 | 意味 |
| --- | --- |
| `src` | 点の GeoJSON の URL（必須） |
| `radius` | まとめる距離（px）。既定 50 |
| `max-zoom` | ここより寄ると、まとめずに 1 点ずつ出す。既定 14 |
| `color` | まとまりの色。既定は MapLibre の Marker と同じ `#3FB1CE` |
| `text-color` | 件数の文字色と、丸の縁の色。既定 `#111418` |
| `point-color` | ばらの点の色 |
| `layer-id` | source / layer の名前。既定は自動で振る（同じページに複数置ける） |

- **まとまりを押すと、それが解ける倍率まで寄ります。**
- **ばらの点を押すと `mmj-cluster-point` が飛びます**（`detail.properties` /
  `detail.lngLat`）。ポップアップを出すかどうかは**使う側が決めます**。
  ここで決めると厚くなるので、部品は中身を渡すところで止めています。
- **件数は色ではなく大きさで表しています。**色の段階は配色を決める行為で、
  凡例が無いまま出すと読む人ごとに違う意味に読まれます（baseline §11 / D-011）。
  既定の 2 色は**新しく作った色ではなく**、MapLibre の既定値と
  `styles/modern-dark.json` に既にある値です。**DESIGN.md が埋まるまでの仮置きです。**

### `<mmj-route>` — 経路と案内の吹き出し

```html
<mmj-map tiles="..." style-url="...">
  <mmj-route src="/data/route.geojson" fit></mmj-route>
</mmj-map>
```

| 属性 | 意味 |
| --- | --- |
| `src` | 経路の GeoJSON の URL（**必須**） |
| `fit` | 付けると、経路ぜんぶが入るところまで寄せる |
| `color` | 線の色。既定は `<mmj-map accent>`、無ければ `#3FB1CE` |
| `casing-color` | 縁取りの色。既定は地図の地色 |
| `width` | 線の太さ（px）。既定 6。縁取りは +4 |
| `step-key` | 案内文を読む属性名。既定 `instruction`（媒体ごとに違うため） |
| `step-color` | 案内の目印の色。既定は `<mmj-map accent>` |
| `layer-id` | source / layer の名前。既定は自動（同じページに複数置ける） |

渡す GeoJSON はこの形です。

```json
{
  "type": "FeatureCollection",
  "features": [
    { "type": "Feature", "properties": {},
      "geometry": { "type": "LineString", "coordinates": [[135.49,34.70],[135.50,34.69]] } },
    { "type": "Feature", "properties": { "instruction": "コンビニを左折" },
      "geometry": { "type": "Point", "coordinates": [135.495,34.695] } },
    { "type": "Feature", "properties": { "instruction": "橋を渡って右手", "image": "./corner.jpg" },
      "geometry": { "type": "Point", "coordinates": [135.50,34.69] } }
  ]
}
```

**後から足せます。**案内の点だけ増やした GeoJSON を渡せば、そのぶんだけ吹き出しが増えます。
AI に経路と案内文を作らせて、この形で渡す使い方を想定しています。

置き終わると `mmj-route-ready` が飛びます（`detail.steps` が案内の件数）。
**0 件でも気づけるように**、件数を画面へ出すことを勧めます。

#### **経路は計算しません**

計算には道路グラフとルーティングエンジンが要り、それは D-003（地図サーバーを立てない）の
外側です。**作るのは外**（ルーティング API でも、AI でも）で、ここは描くだけです。
「データを持たない。表現を持つ」の形そのものです。

### 吹き出しに写真を載せる

`<mmj-marker>` と `<mmj-route>` の案内、どちらにも載ります。

```html
<mmj-marker lnglat="135.5023,34.6937" popup="北浜の店" image="./shop.jpg" image-alt="店の外観"></mmj-marker>
```

| 属性 | 意味 |
| --- | --- |
| `image` | 写真の URL。**http / https と相対パスだけ** |
| `image-alt` | 代替テキスト。省くと `popup` の文字を使う |

**`setHTML` を使っていません。**媒体が登録した文字列をそのまま HTML として実行すると、
`<img onerror=...>` の 1 行で、その地図を置いたページ全体が乗っ取られます。
`createElement` と `textContent` だけで組むので、**文字が HTML として解釈される経路が
そもそも存在しません**（baseline §21）。

同じ理由で、`javascript:` と `data:` の画像は**黙って落とします**。
`data:` は「画像に見せかけた SVG」からスクリプトが走る経路があるためです。

### `<mmj-poi>`

**利用者が自分で持っている POI** を、ベース地図の上に重ねます。
ベース地図（Protomaps / OSM）には触りません。**MMJ はデータを持ちません**（D-001）。

```html
<mmj-map tiles="..." style-url="...">
  <mmj-poi src="/data/our-poi.geojson" label-key="shop_name" min-zoom="15"></mmj-poi>
</mmj-map>
```

| 属性 | 意味 |
| --- | --- |
| `src` | 点の GeoJSON の URL（必須） |
| `label-key` | 名前を取る属性名。既定 `name`（媒体ごとに `title` / `shop_name` と違うため） |
| `min-zoom` | ここから出す。既定 13。**件数を知っているのは持ち込む側だけ**なので既定を当てにしない |
| `color` / `text-color` | 点と名前の色。既定は `<mmj-cluster>` と同じ扱い（新しい色を作っていない） |
| `layer-id` | source / layer の名前。既定は自動 |

- **押すと `mmj-poi-click` が飛びます**（`detail.properties` / `detail.lngLat`）。
  何を出すかは使う側が決めます。
- **名前は衝突したら消えます**（`text-allow-overlap: false`）。重ねて出しても読めないためで、
  **点は残るので場所は分かります**。実物（`2026-09-17-poi-z15.jpg`）でも 8 点中 1 つの名前が
  衝突で消えています。
- `<mmj-cluster>` との使い分け: **まとめたいときはクラスタ、1 点ずつ名前を出したいときはこちら。**

## この部品が引き受けていること

1. `pmtiles` プロトコルの登録（1 回だけ）
2. スタイルの取得と `__TILES_URL__` の差し替え（**組み立てるのは URL だけで、色ではない**）
3. **帰属表示**（`attributionControl` を消せない形で渡す・ODbL）と
   **CJK フォントの既定**（`localIdeographFontFamily`）
4. 失敗したときに**白い地図ではなく理由を画面へ出す**
5. 子要素への map の受け渡し（`mmj-ready` を待つので、読み込み順で崩れない）

## 厚さの判断（PRD §3 の止め条件）

**素の MapLibre を呼ぶのと変わらない厚さなら、この部品は要りません。**
実測で比べます。

| 画面 | 地図を出すために書いた JS |
|---|---|
| `apps/demo/index.html`（素の MapLibre） | 約 40 行 |
| `apps/demo/elements.html`（部品） | **10 行**（属性を配信元へ向ける部分だけ。目印 3 つは HTML） |

差が出ているのは、上の 1〜4 が**呼ぶ側から見えなくなる**ためです。
特に **2 と 3 は、忘れても画面が白くならずに静かに間違う**（帰属表示が消える・
字が出ない）ので、既定に埋める価値があります。

**ここから厚くしない**のが約束です。地図の状態を抱え込む、独自のイベント体系を作る、
スタイルを組み立てる — これらをやり始めたら、素の MapLibre より薄いという根拠が消えます。

## 実物

![部品で置いた目印](../screenshots/2026-09-17-elements-markers.jpg)

![ポップアップ](../screenshots/2026-09-17-elements-popup.jpg)

200 点を `<mmj-cluster>` で置いたところ（z11 でまとまり、z15 でばらける）。
**この 200 点は合成データで、実在の場所ではありません**（`apps/demo/data/README.md`）。

![点をまとめたところ](../screenshots/2026-09-17-cluster-z11.jpg)

![寄るとばらける](../screenshots/2026-09-17-cluster-z15.jpg)

自前の POI を `shop_name` から出したところ。**中央の丸い建物（京セラドーム）に名前が
付いていないのは、ベースのスタイルに POI レイヤが無いから**です
（`.claude/proposals/2026-09-17-poi.md`）。

![自前の POI](../screenshots/2026-09-17-poi-z15.jpg)

## まだやっていないこと（S2 の残り）

- **React / Vue のラッパ**（S3 / S4）。Web Components はそのまま使えるので、
  ラッパが薄くならないなら作りません。

## 実装のときに実測で見つけたこと

- **暗いページに置くと、ポップアップの文字が読めなくなる。**
  MapLibre のポップアップは白地で、文字色をページから継承します。
  暗いページ（`color: #e7e9ee` など）だと白地に明るい文字になります。
  部品側で文字色だけ戻しています（`.mmj-popup`）。**配色を決めているのではなく、
  MapLibre が元々想定している対比へ戻しているだけ**です。
- **属性は部品を読み込む前に入れる。** 逆にすると、属性が付く前に
  `connectedCallback` が走り「配信先が無い」と言って終わります。
- **`mmj-ready` の時点では、まだ source を足せない。** `mmj-ready` は Map を作った直後に
  出ますが、そこではスタイルがまだ読み終わっていません。`addSource` すると例外になります。
  `<mmj-cluster>` は `isStyleLoaded()` を見て、必要なら `load` を待ってから足しています。
- **GeoJSON を配るとき、content-type が `application/octet-stream` だと紛らわしい。**
  MapLibre は中身を見に行くので描けますが、掴んだ側が何のファイルか分かりません。
  `tools/serve` に `.geojson` → `application/geo+json` を足しました。

### `hash` と `pitch` を一緒に使うとき

**MapLibre の hash は `#zoom/lat/lng/bearing/pitch` の 5 要素です。**
3 要素しか書かれていない URL を開くと、**bearing と pitch が 0 に戻されます。**

そのままだと、**3D のページを URL で渡した相手の画面では建物が平らになります。**
実際にそうなりました（2026-09-20・撮って気づいた）。

```
#16/34.7024/135.4959        → pitch 0 に戻る。建物が立たない
#16/34.7024/135.4959/0/60   → 立つ
```

**部品側で当て直しています。**hash が pitch を持っていないときだけ、
属性の `pitch` を地図へ当て直します。**持っているときは触りません**
（利用者が URL で指定した角度を奪わないため）。
