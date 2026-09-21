# modern-map-japan

日本向けのモダンな地図を、**API キーなし・従量課金なし・地図サーバーなし**で。

> **状態: 初期。** 設計は書き終わっており、やり方は本番サイトで一度通していますが、
> このリポジトリ自体はまだ組み立て中です。最初の一手は
> [`.claude/roadmap.md`](.claude/roadmap.md) の S1 です。

## なぜ

日本の Web 地図の多くは似ています。**同じ地図を使っているから**です。
代わりの選択肢には、それぞれ引っかかりがあります。

- **商用の地図 API** はキーが要り、表示ごとに課金され、
  **サイトが当たるほど費用が増える**形になります。
- **OpenStreetMap の公式タイルサーバー**は選択肢になりません。
  [Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) が
  商用利用・高トラフィック利用を認めていません。**使っているサイトは実在しますが、
  それは計画ではなく将来の事故です。**
- **タイルサーバーを自前で立てる**のは動きますが、**タイルサーバーの運用が仕事に加わります**。

結果として、実際に出せる地図は「他人の地図を、他人の見た目で、他人のメーターで」になります。

## 何を作るか

**データは借りる。表現は持つ。**

- **ベースタイル**は [Protomaps](https://protomaps.com/) の日次プラネットビルドから
  日本ぶんを切り出し、[PMTiles](https://github.com/protomaps/PMTiles) 1 枚として配ります。
  **タイル生成パイプラインは自作しません。**
- **スタイル**は [MapLibre](https://maplibre.org/) のスタイルを手書きします。
  日本の地図特有の条件——**地名の密度・漢字かな英数の混在・鉄道の路線色**——に向けて作ります。
- **UI 部品**（Marker / Popup / Cluster / 自前 POI）を Web Components で配り、
  React・Vue は薄いラッパにします。
- **サーバーを立てません。** 静的配信 ＋ HTTP Range だけでデプロイが完結します。

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
- [`CREDITS.md`](CREDITS.md) — この地図が立っている土台（英語）
- [`PRD.md`](PRD.md) — スコープと、**あえて作らないもの**
- [`.claude/roadmap.md`](.claude/roadmap.md) — フェーズ
- [`.claude/decisions.md`](.claude/decisions.md) — 決定と、その理由
- [`docs/origin/`](docs/origin/) — 原案の原文（手を入れていません）

## 参加

[`CONTRIBUTING.md`](CONTRIBUTING.md) を読んでください。Issue は日本語でも英語でも構いません。
