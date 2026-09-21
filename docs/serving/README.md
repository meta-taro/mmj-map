# 配信（Cloudflare R2 + Worker）

デモが地図を描くには、PMTiles を **HTTP Range に 206 で応える場所**へ置く必要があります。
ここはその置き場所の作り方です。

**この文書の時点で、まだデプロイしていません。**鍵とドメインは人が入れる領域です（§14）。

## なぜ GitHub Pages に置けないか

| 置き場所 | 1 ファイルの上限 | kansai 373 MB | japan 3.6 GB |
|---|---|---|---|
| GitHub（リポジトリ） | 100 MB | 入らない | 入らない |
| Cloudflare Pages | 25 MiB | 入らない | 入らない |
| Cloudflare R2 | 5 TB | 入る | 入る |

**デモ（HTML とスタイル）は Pages、タイルは R2** という分担になります。
`.github/workflows/deploy.yml` が出しているのは前者だけです。

## 手順

### 1. バケツを作って、タイルを上げる（人）

```bash
wrangler r2 bucket create modern-map-japan-tiles
```

**大きいファイルは wrangler の単発 put では上がりません**（版によって上限が違います）。
弾かれたら、R2 の S3 互換エンドポイントへ多部アップロードしてください
（`aws s3 cp` / `rclone`）。認証情報は人が入れます。**AI は値を作りません。**

### 2. Worker を出す（人）

```bash
cd infra/pmtiles-worker
wrangler deploy
```

`wrangler.toml` の `bucket_name` を、作ったバケツの名前に合わせてから出すこと。
独自ドメインを当てるときは `[[routes]]` の行を外します。

### 3. **Range に応えているかを確かめる（ここを飛ばさない）**

```bash
pnpm tiles:check-range -- https://<配信先>/kansai.pmtiles
```

206 と `Content-Range: bytes ...` が返れば通ります。
**200 が返ったらその配信先は使えません。**1 タイル見るたびに 373 MB が落ちてきます。

### 4. デモを配信先へ向ける

`apps/demo/config.js` の `tilesUrl` を配信先の URL にします。
`styleUrl` は同一オリジンの相対パスのままで構いません。

## Worker が守っていること

- **Range に 206 で応える**（解釈は `@mmj-map/http-range`。
  手元の配信（`pnpm serve`）と**同じ実装**を使っています）
- **CORS で `Content-Range` を expose する。** これが無いと、別オリジンのデモから
  範囲を読めません（地図は出ず、原因も分かりにくい）
- **PMTiles 以外を配らない。** バケツの中身を無条件に公開しません
- **`immutable` を付けない。** 上流の版を上げて同じ名前で差し替えたとき、
  古いタイルを掴んだまま直らなくなるため

テストは `pnpm --filter @mmj-map/pmtiles-worker test`（14 件）。
R2 を差し替え可能な形にしてあるので、**Cloudflare へ繋がらない環境でも走ります**（§4）。

## まだ決めていないこと

- **japan（3.6 GB）を置くか、kansai（373 MB）から始めるか。**
  R2 の保管料と取り出し回数は、置いた量ではなくリクエスト数で効きます。
- **japan（2.60 GiB）を Range で配るか、そもそも配らないか。**
  **配らなければタダ乗りは起きません**（原案 §8.2 — 利用者が必要な地域だけ取得して
  自社ストレージへ置く）。会社 HP の「弊社はこちら」なら **±2.2km / z12-15 で 2.9 MB** です。
  Range 配信が要るのは「全国を街区まで、こちらから配る」場合だけです。

## 読ませるオリジン（`ALLOW_ORIGINS`）

**未設定なら閉じます。** 設定を忘れたデプロイが、そのまま誰でも使える CDN に
ならないようにするためです。守っているのはデータではなく（ODbL なので隠す対象では
ない）、**こちらの転送量**です。

```toml
# wrangler.toml
ALLOW_ORIGINS = "https://meta-taro.github.io,https://example.co.jp"
```

| 設定 | 挙動 |
|---|---|
| 未設定 | **403。**理由を本文に書いて返す |
| `"https://a, https://b"` | 一致したオリジンだけに返す（`Vary: Origin` 付き） |
| `"*"` | 誰にでも開く。**自分でそう書いたときだけ** |

- **`Origin` が無い要求は通します。** curl や `pnpm tiles:check-range` を殺さないためです。
  ブラウザ以外はそもそも CORS の対象外で、止めても意味がありません。
- **preflight（OPTIONS）も同じ判定を通ります。** ここだけ素通しにすると抜け道になります。

### これはブラウザにしか効きません

**サーバー経由の取得は止まりません。**止めたいなら、Range で配るのをやめて
**地域ごとのファイルを渡す**ほうが確実です（原案 §8.2）。
