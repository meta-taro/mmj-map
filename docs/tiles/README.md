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

## 5. 帰属表示

`© OpenStreetMap contributors` を画面から外さないでください（`LICENSES.md` / D-007）。
ベースデータは ODbL です。帰属を消した状態で公開しないこと。

---

## まだできていないこと

- **グリフ（日本語）。** Protomaps が配っているフォントは Latin のみで、
  CJK のフォントスタックがありません。**1 範囲でも 404 になると地図全体が真っ白になります。**
- **配信先。** 「すぐ試せる配信先」を用意するかどうかは未決です（`.claude/decisions.md` 未決）。
- **スタイル JSON。** S1 で持ち込みます。
