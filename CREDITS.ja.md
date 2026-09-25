# この地図が立っている土台

**この地図に載っているもののほとんどを、私たちは測っていません。**
この文書は、その土台になっている仕事の名前を書いたものです。

> **英語版が正です。** これは [`CREDITS.md`](CREDITS.md) の訳で、
> **名簿は英語版だけを直してください**（二重に管理すると必ずずれます）。
> 食い違ったときは英語版が正しいものとします。

**ここに載っている＝「依存している」か「コモンズへ返されている」**という意味です。
**載っている誰も、この企画を推薦していませんし、関わってもいません。**

## 地図そのもの

- **[OpenStreetMap](https://www.openstreetmap.org/) の貢献者** — ベース地図の
  道・建物・川・地名のすべて。**数十万人**が関わっていて、その多くは
  **自分が住んでいる通りを地図にした人**です。**ODbL 1.0**。
  画面上の帰属表示を消さないでください（[`LICENSES.md`](LICENSES.md)）。
- **[OpenStreetMap Foundation](https://osmfoundation.org/)** — サーバー・ライセンス・
  コミュニティを回しています。

## 使えるようにしている道具

- **[Protomaps](https://protomaps.com/)** — 日次プラネットビルドと
  [PMTiles](https://github.com/protomaps/PMTiles) の形式。**1 ファイルを静的配信するだけで、
  タイルサーバーが要らなくなります。**この企画がタイル生成パイプラインを自作しないのは、
  **これが既にあるから**です。
- **[MapLibre](https://maplibre.org/)** — 描画エンジンとスタイル仕様。
  このリポジトリの見た目に関わるものは、すべてこれに向けて書かれています。
- **[tippecanoe](https://github.com/felt/tippecanoe)**、**GDAL/OGR**、
  そのほかの地理空間の OSS 一式。

## 土台にできる公開データ

- **[Microsoft Global ML Building Footprints](https://github.com/microsoft/GlobalMLBuildingFootprints)**
  — 衛星画像から機械学習で抽出した建物の輪郭。**CDLA-Permissive 2.0** で公開され、
  **225 地域**（日本を含む）を覆います。建物の出どころとして検討中です。
- **[Overture Maps Foundation](https://overturemaps.org/)** — base / buildings /
  divisions / transportation / places を持ち寄って公開したもの。
  テーマごとに ODbL 1.0 と CDLA-Permissive 2.0。

## OpenStreetMap に資金を出している組織

OSM 財団の法人会員。**2026 年 9 月時点**の一覧です。

| 区分 | 会員 |
|---|---|
| Platinum | TomTom, Microsoft, Esri, Meta, Proton |
| Gold | Mapbox, Grab, Komoot |
| Silver | OpenCage, Geofabrik, Nextbillion.ai, Elastic, GraphHopper, Bolt, HOT, Regrid, QGIS, Calimoto, Mapy.com, Regione Marche |
| Bronze | Geotab, Krick.com, YellowMap, NextGIS, Mail.ru Maps, Init, Rinkai, Stadia Maps, SUSE, Verso, Interline Technologies, E-SMART, Landclan, mySociety, GB Consite, MapTiler, Data Center Map, Iphigénie, Maptoolkit, Yahoo Japan |

ほかに 20 ほどの組織が supporter として支えています。
**会費は年 750 ユーロから**で、小さな会社でも手が届く額です。

## OpenStreetMap を直接編集している組織

[organised editing](https://wiki.openstreetmap.org/wiki/Organised_Editing/Activities)
に登録されているチームと、開始年。

| 組織 | 開始 | 範囲 |
|---|---|---|
| Apple | 2017 | 全世界・地図全般の改善 |
| Meta | 2017 | 全世界・道路 |
| Microsoft | 2017 | オセアニア、セルビア、南米、カリブ — 道路と建物 |
| Amazon | 2018 | アメリカ、イギリス、ドイツ、アラブ首長国連邦 — 道路網 |
| Lyft | 2018 | カリフォルニア — 道路と street |
| Uber | — | 歩行者データ、道路の形状 |
| Snap | 2021 | 係争のある境界 |

**この 2 つの表は、思ったほど重なりません。**財団の会員でないのに編集している組織があり、
会員なのに編集していない組織もあります。**だから両方載せています。**

## 名簿についての断り

上に企業名が出ているのは、**それらの企業が、この企画が依存しているコモンズに
資金を出し、あるいは貢献しているから**です。**それは声に出して言う価値があります。**

順位付けではありません。どちらの方向の推薦でもありません。
**その企業の製品についての言明でもありません。**

訂正は歓迎します。issue を立ててください。**一覧は 2026 年 9 月に読んだもので、
そのうち古くなります。**
