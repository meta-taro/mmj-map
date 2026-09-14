# Modern Map Japan（仮）企画書

## 1. 概要

**Modern Map Japan** は、日本向けのモダンな地図を、APIキー・従量課金・専用地図サーバーへの依存なしで利用できることを目指すOSSプロジェクト。

Google Maps等の商用地図APIを置き換えることそのものを目的とするのではなく、まずは以下に集中する。

- 日本全国を表示できる
- 見た目がモダンで、Webサイトやアプリへそのまま組み込みやすい
- 地図データを利用者自身が保持・配信できる
- 地図表示のためのAPIキーを不要にする
- ベース地図と、店舗・物件・会社所在地等の利用者データを明確に分離する
- OSS側では変化の激しい店舗・駐車場等のPOIデータを原則として保有しない
- React / Web Components / Flutter等から簡単に利用できるSDKを提供する
- 地図生成工程を再現可能にし、利用元データと権利関係を追跡可能にする

第1次ゴールは **「権利的に問題のない公開データから、日本全国のモダンなベースマップを生成・配布できるOSS」** とする。

---

## 2. 解決したい課題

既存のOSS・公的地図は機能面では十分でも、一般企業のWebサイトや消費者向けアプリへ組み込んだ際に、デザイン面で古さ・情報過多・統一感不足を感じる場合がある。

一方、商用地図APIには以下の課題がある。

- APIキー管理が必要
- 利用量に応じた料金体系への依存
- 提供事業者の仕様・料金改定リスク
- 外部サービス停止時に地図表示まで影響を受ける
- オフライン利用や完全自前配信が難しい場合がある
- 地図デザインの自由度に制約がある

Modern Map Japanは、**「地図をサービスとして借りる」のではなく「地図データを利用者が所有できる」** ことを重視する。

---

## 3. 基本思想

### 3.1 ベース地図とPOIを分離する

OSS側が責任を持つのは、主として以下。

- 道路
- 建物
- 河川・水域
- 海岸線
- 鉄道
- 行政界
- 地名
- 基本的な地形・土地表現
- 地図スタイル
- 描画エンジンとの接続
- ピン
- ラベル
- 吹き出し
- クラスタリング
- オーバーレイ
- UIコンポーネント

一方、以下のような変化の激しいPOIデータは、原則としてOSS本体では保有しない。

- 飲食店
- ホテル
- 物件
- 駐車場
- 営業時間
- 空車情報
- 価格
- 口コミ
- 店舗写真
- 在庫
- 営業中・閉店状態

食べログ型サービス、不動産サービス、駐車場サービス等は、自社DBに保持している緯度経度と付随情報をModern Map Japanへ渡して表示する。

### 3.2 「データは持たないが、表現は持つ」

例えばOSS側に駐車場の最新一覧は保持しないが、駐車場ピンのUIは提供できる。

```tsx
<Marker
  type="parking"
  lat={34.702}
  lng={135.495}
  label="空車"
/>
```

同様に、

- company
- shop
- restaurant
- hotel
- property
- parking
- station
- hospital
- custom

などの標準Marker Variantを提供する。

利用者は自社データを渡すだけで、統一された見た目を利用できる。

---

## 4. 想定ユースケース

### 4.1 企業ホームページ

「弊社はこちら」を簡単に表示する。

```html
<modern-map
  lat="34.702"
  lng="135.495"
  zoom="16">
  <map-pin
    lat="34.702"
    lng="135.495"
    label="弊社はこちら">
  </map-pin>
</modern-map>
```

目標は、GISやMapLibreの知識がなくても導入できること。

### 4.2 店舗検索サイト

利用サービス側の店舗DBを地図へ表示する。

```tsx
<ModernMap>
  {shops.map(shop => (
    <Marker
      key={shop.id}
      lat={shop.lat}
      lng={shop.lng}
      label={shop.name}
    />
  ))}
</ModernMap>
```

### 4.3 不動産サイト

物件価格を地図上へ表示する。

```tsx
<PropertyMarker
  lat={property.lat}
  lng={property.lng}
  label="8.5万円"
/>
```

### 4.4 駐車場サービス

駐車場サービス側が保持する最新データを使用。

```tsx
<ParkingMarker
  lat={parking.lat}
  lng={parking.lng}
  label="空車"
/>
```

### 4.5 モバイル地図アプリ

地域別PMTilesを端末へ保存し、オフライン利用できる構成も将来的に提供する。

---

## 5. 地図データ方針

### 5.1 第1次ゴール

日本全国のベースマップを生成する。

ただし、**Google Maps / Google Earth / Google Places等の商用地図サービスから地理情報を抽出・転記することはしない。**

利用可能な候補は、

- 国・自治体の公開データ
- 国土地理院の利用可能な測量成果・コンテンツ
- 国土数値情報
- Project PLATEAU
- その他、再利用条件が明確な公共オープンデータ
- 必要に応じてOpenStreetMap（ODbL条件を満たす形）

とする。

### 5.2 権利管理

「国のデータだから自由」とは判断しない。

各データセット単位で、最低限以下を管理する。

```text
source_name
source_url
license
attribution
redistribution_allowed
derivative_allowed
commercial_use_allowed
approval_required
retrieved_at
source_version
checksum
```

生成済み地図から、どのデータがどのレイヤーに利用されたか追跡できるようにする。

### 5.3 国土地理院データ

国土地理院の測量成果には、利用方法によって測量法第29条（複製）・第30条（使用）に基づく承認申請が必要な場合と、申請不要で出典表示により利用できる場合がある。

そのため、初期開発時に

**「日本全国の加工済みベクトル地図をOSSとして再配布する」**

という本プロジェクトの利用形態について、対象データごとに明確に確認する。

### 5.4 OSMを使用する場合

OpenStreetMapデータはODbLで提供されるため、利用・改変・再配布時は帰属表示とODbLの条件を遵守する。

OSMを採用する場合は、生成データ全体へのライセンス波及範囲を設計段階で整理する。

---

## 6. データ生成アーキテクチャ

```text
Public / Open Geographic Data
              ↓
        Download Pipeline
              ↓
       License Validation
              ↓
       Normalize / Convert
              ↓
          GeoParquet
              ↓
       Layer Generation
              ↓
       Vector Tile Build
              ↓
             MVT
              ↓
           PMTiles
              ↓
      Static Object Storage
              ↓
          MapLibre
```

---

## 7. 推奨技術スタック

### 7.1 地図生成

| 領域 | 技術 |
|---|---|
| データ取得 | Python |
| GIS変換 | GDAL / OGR |
| 地理データ操作 | GeoPandas |
| Columnar処理 | PyArrow |
| 大規模データ処理 | DuckDB |
| 中間形式 | GeoParquet |
| ベクタータイル | MVT |
| タイル生成 | Tippecanoe等 |
| 高負荷処理 | 必要になった箇所のみRust |
| 配布形式 | PMTiles |

基本方針は、

**Pythonでまず完成させ、性能上のボトルネックだけRust化する。**

全面Rust化は初期フェーズでは行わない。

### 7.2 地図表示

| 領域 | 技術 |
|---|---|
| Browser Renderer | MapLibre GL JS |
| Mobile Renderer | MapLibre Native |
| Core SDK | TypeScript |
| Web Components | TypeScript |
| React | React wrapper |
| Vue | Vue wrapper |
| Flutter | Flutter wrapper / MapLibre系 |
| iOS | MapLibre Native |
| Android | MapLibre Native |

MapLibre GL JSはTypeScript/WebGLベースでベクタータイルを描画でき、Style Specによって外観を制御できるため、本プロジェクトと相性がよい。

---

## 8. PMTilesによる配信

地図タイルは原則PMTilesとして生成する。

```text
japan.pmtiles
```

PMTilesをHTTP Range Request対応ストレージへ配置することで、利用者が全国ファイル全体を毎回ダウンロードする必要はない。

```text
Browser / App
      ↓
必要なByte Rangeだけ取得
      ↓
japan.pmtiles
```

MapLibre側からPMTilesを直接利用する。

### 8.1 公式配信

例：

```text
R2 / S3-compatible Object Storage

/maps/
├─ japan.pmtiles
├─ kansai.pmtiles
├─ osaka.pmtiles
├─ kyoto.pmtiles
└─ tokyo.pmtiles
```

### 8.2 自前ホスト

利用者は必要な地域だけ取得して、自社ストレージへ配置できる。

```text
会社Webサーバー
└─ maps/
   └─ osaka.pmtiles
```

以後、Modern Map Japan運営側のサーバーへアクセスする必要はない。

### 8.3 オフライン

アプリでは、

```text
Local Storage
├─ osaka.pmtiles
├─ kyoto.pmtiles
└─ hyogo.pmtiles
```

として保持可能な設計を目指す。

---

## 9. 更新方式

地図は定期リリース方式とする。

例：

```text
2026-09
2026-10
2026-11
```

利用者は更新を強制されない。

古いPMTilesを持っている限り、その地図は継続して利用できる。

将来的にはCLIを提供する。

```bash
modern-map update osaka
```

想定処理：

```text
最新版確認
    ↓
manifest取得
    ↓
checksum比較
    ↓
必要なら最新版取得
    ↓
検証
    ↓
atomic replace
```

### 任意範囲生成

上級者向けに、

```bash
modern-map build \
  --bbox 135.45,34.62,135.60,34.75
```

のような任意範囲ビルドも検討する。

---

## 10. デザイン

本プロジェクトでは、デザインを主要価値と位置付ける。

「OSMを別配色にしただけ」にはしない。

### 10.1 初期テーマ

- Modern Light
- Modern Dark
- Minimal Japan

### 10.2 将来テーマ

- Navigation
- Tourism
- Real Estate
- Restaurant
- Nightlife
- High Contrast
- Offline Outdoor

### 10.3 Design Tokens

デザインをコードで管理する。

```text
styles/
├─ tokens.json
├─ light.json
├─ dark.json
├─ minimal.json
└─ layers/
   ├─ roads.json
   ├─ buildings.json
   ├─ railway.json
   ├─ water.json
   └─ labels.json
```

概念例：

```json
{
  "road.motorway.width": 5,
  "road.primary.width": 3,
  "building.opacity": 0.65,
  "label.poi.maxDensity": 8
}
```

Design TokensからMapLibre Style JSONを生成する。

これにより、デザイン変更をGit diffとして追跡できる。

---

## 11. Marker / Pin

標準Markerコンポーネントを提供する。

```tsx
<Marker
  lat={34.702}
  lng={135.495}
  label="弊社はこちら"
/>
```

### Variant

```text
default
company
shop
restaurant
hotel
property
parking
station
hospital
custom
```

### 状態

- default
- hover
- selected
- disabled
- highlighted

### 内容

- アイコン
- 任意SVG
- テキスト
- 数値
- 価格
- バッジ
- 画像
- ステータス

---

## 12. Popup / 吹き出し

```tsx
<Popup>
  <h3>株式会社○○</h3>
  <p>弊社はこちら</p>
</Popup>
```

以下をサポートする。

- title
- text
- image
- link
- CTA
- custom HTML / component
- close
- auto positioning
- mobile optimization

スマートフォンではPopupだけでなくBottom Sheetも提供候補とする。

---

## 13. Cluster

大量Marker表示のためクラスタリングを基本機能とする。

```text
● 38
```

ズームすると個別Markerへ展開。

食べログ・不動産・ホテル検索等の用途を想定する。

---

## 14. Web Components

特定フレームワークに依存しない導入方法を重要視する。

```html
<script src="modern-map.js"></script>

<modern-map
  lat="34.702"
  lng="135.495"
  zoom="16">

  <map-pin
    lat="34.702"
    lng="135.495"
    label="弊社はこちら">
  </map-pin>

</modern-map>
```

これにより、

- PHP
- Laravel
- WordPress
- Rails
- Django
- 静的HTML
- その他CMS

からも利用できる。

---

## 15. Framework SDK

### 優先順位

1. TypeScript Core
2. Web Components
3. React
4. Vue
5. Flutter
6. Swift / iOS
7. Kotlin / Android
8. Svelte等

各バックエンド言語専用SDKを大量に作るのではなく、**UIプラットフォーム単位で提供する**。

---

## 16. 住所検索・Geocoding

第1版の必須機能にはしない。

会社所在地等は、

```text
住所
 ↓
一度だけ座標化
 ↓
lat / lng保存
 ↓
地図表示時はAPI問い合わせ不要
```

とできる。

GeocodingまでOSS側で提供すると、住所DBの保守・検索サーバー・更新責務が増えるため、別フェーズまたは別プロジェクトとして検討する。

---

## 17. ルート検索

第1版の対象外。

以下は別レイヤーとして将来検討する。

- 車経路
- 徒歩経路
- 自転車経路
- 公共交通
- 所要時間
- 距離計算

「美しい日本地図を簡単に表示できる」というコア価値を先に完成させる。

---

## 18. AIの位置付け

本プロジェクトはAIサービスではない。

利用者がAI APIやAIサブスクリプションを契約する必要はない。

AIは主に**開発・制作工程**で利用する。

例：

- デザイン案作成
- Style JSON生成補助
- アイコン制作補助
- コード生成
- 地図スクリーンショットのデザインレビュー
- データ変換処理の実装
- テスト生成
- ドキュメント生成

完成物は通常のOSS・地図データとして利用できる。

MCP接続等も現段階では要件に含めない。

---

## 19. リポジトリ構成

第1版は **1 repository / monorepo** とする。

```text
modern-map-japan/

apps/
├─ demo/
├─ docs/
└─ style-studio/

packages/
├─ core/
├─ web-component/
├─ react/
├─ vue/
├─ styles/
└─ icons/

generator/
├─ python/
├─ rust/
└─ pipelines/

data-schema/
├─ roads/
├─ buildings/
├─ railway/
├─ water/
└─ labels/

examples/
├─ company-access/
├─ restaurant-map/
├─ property-map/
└─ parking-map/

scripts/

.github/
└─ workflows/
```

巨大なPMTilesデータはGitリポジトリへ直接含めない。

---

## 20. 再現可能ビルド

OSSとして特に重要な要件。

理想：

```bash
git clone ...
just build japan
```

または、

```bash
make build-japan
```

で、

```text
公開データ取得
 ↓
利用元manifest確認
 ↓
checksum確認
 ↓
展開
 ↓
座標系統一
 ↓
GeoParquet化
 ↓
レイヤー生成
 ↓
MVT生成
 ↓
PMTiles生成
 ↓
Style validation
 ↓
成果物完成
```

まで実行可能にする。

### メリット

- 地図生成経路を第三者が監査できる
- 権利上問題のあるデータ混入を確認しやすい
- Google等からの転記ではないことを説明しやすい
- 同じ地図を第三者が再生成できる
- データ更新が自動化しやすい

---

## 21. CI/CD

GitHub Actions等で、

```text
Source Update Detection
       ↓
Generator Test
       ↓
Regional Build
       ↓
Visual Regression
       ↓
Metadata / License Check
       ↓
Release
       ↓
Object Storage Upload
```

を実行する。

全国ビルドが重い場合は、都道府県単位・地域単位へ分割する。

---

## 22. Visual Regression Test

地図プロジェクトではコードテストだけでなく、見た目の回帰テストを重要視する。

テスト都市例：

- 東京
- 大阪
- 京都
- 札幌
- 地方都市
- 郊外
- 山間部
- 海岸
- 島嶼部

固定座標・固定Zoomでスクリーンショットを生成し、変更前後を比較する。

確認項目：

- ラベル重複
- 道路階層
- 建物密度
- 水域視認性
- 鉄道視認性
- 地名密度
- コントラスト
- ピン視認性
- Dark Mode品質

---

## 23. 配布モデル

### OSS

無料。

### 地図データ

無料で取得可能な形を基本とする。

### 公式配信

利用者の利便性のため公式PMTiles CDNを提供することは可能だが、OSS利用の必須条件にはしない。

```text
A. 公式配信URLを利用
B. 自社R2/S3へコピー
C. 自社Webサーバーへ配置
D. アプリへローカル保存
```

から選択できる。

---

## 24. サーバーレス思想

従来型：

```text
Browser
 ↓
Map API
 ↓
Application Server
 ↓
Spatial DB
 ↓
Tile Server
```

Modern Map Japan：

```text
Browser / App
      ↓
MapLibre
      ↓
PMTiles
      ↓
Static Object Storage
```

データを静的成果物へ落とすことで、

- APIサーバー不要
- DB不要
- APIキー不要
- 認証不要
- 通常の地図API従量課金不要

を目指す。

---

## 25. MVP

### Phase 0 — 権利・データ調査

- 日本全国で利用できる公開地理データ一覧
- ライセンス確認
- 再配布条件確認
- 加工条件確認
- Attribution設計
- 国土地理院成果の利用可否整理
- OSMを採用する場合のODbL設計

### Phase 1 — 大阪PoC

まず大阪周辺で、

- 道路
- 建物
- 河川
- 鉄道
- 地名
- Modern Light Style
- PMTiles
- MapLibre表示

を完成させる。

### Phase 2 — 基本UI

- Marker
- 「弊社はこちら」
- Popup
- Custom Marker
- Parking Marker表現
- Cluster
- Click / Hover event

### Phase 3 — Web導入

- TypeScript Core
- Web Component
- React
- Demo
- Documentation

### Phase 4 — 日本全国

- 全国ビルド
- 都道府県別ビルド
- 地域別ビルド
- Update manifest
- checksum
- versioning

### Phase 5 — モバイル

- Flutter
- iOS
- Android
- Offline PMTiles

---

## 26. MVPでやらないこと

初期スコープ肥大化を防ぐため、以下は原則対象外。

- 店舗DBの維持
- 駐車場DBの維持
- 口コミ
- 店舗営業時間
- Google Places相当サービス
- リアルタイム交通情報
- 本格Geocoding
- 本格Reverse Geocoding
- ルート検索
- ナビゲーション
- AI API
- MCP
- ユーザーアカウント
- 課金システム
- 独自GISサーバー

---

## 27. 成功条件

第1段階では、以下を満たせば成功とする。

### 利用者目線

```html
<modern-map>
  <map-pin label="弊社はこちら" />
</modern-map>
```

相当の簡単さで、自社HPへ美しい日本地図を載せられる。

### 開発者目線

```bash
npm install ...
```

程度で、React等へ導入可能。

### インフラ目線

PMTilesを自社ストレージへコピーすれば、第三者地図APIへ依存せず動作する。

### 権利目線

地図生成に利用した全データソース・ライセンス・加工経路を追跡できる。

### OSS目線

第三者が公開ソースと公開データから地図成果物を再生成できる。

---

## 28. このプロジェクトの価値

Modern Map Japanの価値は、

**「無料の地図」**

だけではない。

目指すのは、

> **美しく、組み込みやすく、所有できる日本地図。**

である。

利用者が自分のWebサイト・アプリ・ストレージ上に地図データを保持できることで、

- API事業者へのロックインを避ける
- APIキーを管理しない
- 利用量を気にせず表示する
- 地図データを長期間保持する
- 必要な地域だけ所有する
- 自社データを自由に重ねる

ことを可能にする。

最終的には、

```text
公開地理データ
      ↓
Modern Map Generator
      ↓
Beautiful Japan Map
      ↓
PMTiles
      ↓
MapLibre
      ↓
Web / App / Offline
```

という、シンプルで再現可能なOSS地図基盤を目指す。

---

## 29. 参考・確認対象

実装時には必ず最新版の公式条件を再確認する。

- MapLibre GL JS  
  https://maplibre.org/maplibre-gl-js/docs/

- MapLibre PMTiles Example  
  https://maplibre.org/maplibre-gl-js/docs/examples/pmtiles/

- OpenStreetMap Copyright and License  
  https://www.openstreetmap.org/copyright

- 国土地理院 測量成果の利用手続  
  https://www.gsi.go.jp/LAW/2930-index.html

- Project PLATEAU  
  https://www.mlit.go.jp/plateau/

---

## 30. 仮称

現時点では説明性を優先し、

**Modern Map Japan**

を仮称とする。

正式名称はリポジトリ作成時に別途検討する。
