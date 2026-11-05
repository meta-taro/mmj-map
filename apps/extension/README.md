# MMJ の Chrome 拡張

Google マップで開いている場所を、**API キーなしで自分の頁に置ける HTML** にします（D-034）。

- **HTML を写す** — そのまま貼れる 1 枚。先頭に、頁の隣へ置くもの（タイルの切り出し・MapLibre と pmtiles の写し方・
  スタイルと部品）を書いてあります。**MapLibre と pmtiles は CDN ではなく `./vendor/` から読みます**
  （ストアの審査は、拡張が実行しない文面でも、中の CDN の `<script src>` で落とすため。2026-11-05）
- **AI に渡す形で写す** — 手順・守ること・属性の全文の在りかを入れた Markdown
- **頁に置いた見本** — 仮の頁に置いた地図を、携帯 390 と PC 1100、明るい地図と暗い地図で見比べる。
  **自分の会社名・住所・ホームページを入れ、地図を押してピンを置ける**（写すものにそのまま入り、地図の中心もピンになる）。
  **この場所で見本が街路まで出るか**を最初に出す（出ない場所は、写したコマンドで切り出すと出る）

**読むのはタブの URL の表示位置（`/@緯度,経度,縮尺z`）だけ**です。店名・ピン・画面は読みません。
権限は `activeTab` だけで、押したときだけ、そのタブの URL が読めます。

## 組んで読み込む

```bash
pnpm install
pnpm --filter @mmj-map/extension build
```

Chrome で `chrome://extensions` を開き、「デベロッパー モード」を入れて
「パッケージ化されていない拡張機能を読み込む」で `apps/extension/dist` を選びます。

ストアへ出すときは `pnpm --filter @mmj-map/extension pack:store` で zip を作ります。
入力欄へ貼る文面（説明・権限の理由・データの扱い）は [`STORE.md`](./STORE.md) にあります。

## 中身

| ファイル | 役目 |
| --- | --- |
| `src/view.js` | URL から表示位置を読む・縮尺を直す（純粋関数・試験あり） |
| `src/snippet.js` | 貼る HTML・渡す Markdown・見本のタイルを作る（純粋関数・試験あり） |
| `src/constants.js` | 版・公開先・見本の都市。**リポの正本と試験で突き合わせている** |
| `src/popup.*` | 拡張の窓 |
| `src/preview.*` | 見本の頁 |
| `scripts/build.mjs` | `dist/` へ写す（部品・MapLibre・pmtiles を同梱する） |
| `scripts/zip.mjs` / `pack.mjs` | `dist/` をストアへ出す zip に固める（依存なし・試験あり） |
| `src/icons/` | アイコン。**デモの仮の favicon（`apps/demo/favicon.svg`）を描き出したもの**で、ブランドではない |

**縮尺は Google より 1 小さくなります**。Google は 256px、MapLibre は 512px の区画で数えるためです。
