# プロジェクトステータス — modern-map-japan

- **現在フェーズ**: S1 は完了条件を満たした（**人の目視判定待ち**）。S2（UI 部品）は
  Map / Marker / Popup / Cluster / 自前 POI まで完了。残りはベース地図の POI（提案中）
- **最終更新**: 2026-09-17

## 完了した作業

- 企画の確定（原案 §1〜§30 → `PRD.md` / `.claude/decisions.md` / `.claude/roadmap.md`）
- ライセンス方針の確定（コード MIT / データ ODbL・`LICENSES.md`）
- リポジトリの初期構成
- pnpm workspace の骨格（`pnpm-workspace.yaml` / root `package.json` / `tsconfig.base.json`）
- **タイル生成ワークフローの書き直し（D-005 / S1）** — `tools/tiles`
  - 上流ビルドを pin し、索引と突き合わせる（`pnpm tiles:resolve`・D-010）
  - 日本ぶんの切り出し（`pnpm tiles:extract japan`）と `pmtiles verify`
  - 配信経路の Range 疎通確認（`pnpm tiles:check-range <URL>`）
  - 手順書 `docs/tiles/README.md`
  - 判断はすべて純粋関数側にあり、単体テストが付いている（`tools/tiles/test/`）
- CI（`.github/workflows/ci.yml`）で typecheck / test を回す構成
- oss-privacy-check の赤を直した（`OSS_ALLOWED_EMAILS` を追加）
- **開発環境が動くようになった（2026-09-16）** — 下の「開発環境」を見ること
- **`tools/tiles` のテストを初めて実行した（2026-09-16）** — 下の「テスト状況」
- **手書きスタイルの 1 枚目（`styles/modern-dark.json`・22 レイヤ）**
- **手元の配信（`tools/serve`）** — `pnpm serve` で `dist/tiles` / `styles` / `apps/demo` を
  Range 付きで配る。**本番の配信ではない**
- **`pnpm tiles:check-range` を初めて通した（2026-09-16）** — 下の「Range の実測」
- **スタイルの検査（`tools/style-check`・2026-09-16）** — スタイルが pin したビルドの
  中身と噛み合っているかを CI で止める（`pnpm style:check`・`docs/styles/README.md`）
- **地図が実際に描けた（2026-09-16）** — ヘッドレスで撮った実物が
  `docs/screenshots/` にある（大阪 z12 / 梅田 z15 / 関西 z9）。
  **人の目視判定はまだ**（§29）
- **キャプチャの道具（`tools/shot`）** — `pnpm shot -- <URL> <出力先>`。
  手元を見られない人へ実物を渡すため。依存は足していない（機械のブラウザを CDP で動かす）
- **デモが URL で場所を持つようになった** — `#zoom/lat/lon`（例: `#15/34.7024/135.4959`）
- **本番の配信経路（`infra/pmtiles-worker`・2026-09-16）** — R2 の PMTiles を
  HTTP Range で配る Cloudflare Worker。**まだデプロイしていません**（鍵とドメインは人）。
  手順は `docs/serving/README.md`
- **S2 の部品（`packages/elements`・2026-09-16）** — `<mmj-map>` / `<mmj-marker>` で
  HTML だけで地図を置ける。**ビルド工程なし**（素の ESM）。実物は
  `docs/screenshots/2026-09-16-elements-*.jpg`、使い方は `docs/elements/README.md`
- **全国タイルを初めて地図として描いた（2026-09-16）** — 東京 / 京都 / 那覇 / 札幌 / 全国 z5
- **Range の解釈を 1 か所へ寄せた（`packages/http-range`）** — 手元の配信と Worker が
  同じ実装を使う。別々に書くと、**手元では通って本番で 200 を返す**という壊れ方をする
- **個人のホームディレクトリのパスを検出するようにした（2026-09-17）** —
  `oss-privacy-check` はメールしか見ておらず、`C:\Users\<名前>` のような
  **OS のアカウント名が素通りしていた**。規則 `[added-homepath]` を足した（下の「既知の問題」）
- **点をまとめる部品（`<mmj-cluster>`・2026-09-17）** — GeoJSON の URL を渡すだけで
  点がまとまる。**まとめる計算は MapLibre の GeoJSON source**（D-011）。
  件数は色ではなく大きさで表す（配色は人の領域・§11）。実物は
  `docs/screenshots/2026-09-17-cluster-*.jpg`（200 点の**合成データ**・大阪）
- **利用者が自前 POI を持てるようになった（`<mmj-poi>`・2026-09-17）** — ベース地図には
  触らず別 source で重ねる。名前を取る属性は `label-key` で指定（媒体ごとに `name` /
  `title` / `shop_name` と違うため）。**MMJ はデータを持たない**（D-001）。
  実物は `docs/screenshots/2026-09-17-poi-z15.jpg`
- **参照されているのに存在しないアセットを CI で止めるようにした（`tools/asset-check`・2026-09-17）**
  — baseline §23 が未実装だった。`apps/demo` は素の HTML で**ビルド工程が無い**ため、
  綴りを 1 文字間違えても typecheck も test も通ったまま**開いたときにだけ壊れる**。
  `pnpm asset:check`。対応表は `tools/serve` の mounts と `deploy.yml` のコピー先に揃えてある
- **上流がおかしいときに戻れるようにした（D-014・2026-09-17）** — pin は 1 本のまま
  （D-010）だが、確認済みの旧版を `source.knownGood` に 3 本まで持つ。
  `pnpm tiles:extract -- <region> --build=previous` で切り出せる。
  **pin 以外で切ったら出力名に版が入る**（新しい方を潰さないため）。
  **manifest に無い版は使えない**（任意の URL を取りに行かせない・§21）。
  **実際に戻して確認済み**（`kansai.20260914.pmtiles` が別日のデータであることを確認）
- **全国の切り出しから、太平洋を落とした（D-013・2026-09-17・実行済み）** —
  **z11 以上は 8 つの四角**（`tools/tiles/regions/japan.geojson`）、
  **z10 以下は bbox 全域**で取って `pmtiles merge`。
  **3.37 GiB → 2.60 GiB（-792 MiB / -23%）/ タイル件数 1,732,855 → 819,672（-53%）**。
  **遠方の島は 1 つも落としていない**（島 22 か所をバイト単位で突き合わせ・全部一致）。
  `dist/tiles/japan.pmtiles` は差し替え済み・`pmtiles verify` 通過
- **タイルを開いて数える道具（`tools/tile-inspect`・2026-09-17）** — `pnpm tile:inspect`。
  推測で地図を作らないため（D-012）。**依存は足していない**（MVT を自前で読む・幾何は読まない）。
  手順は `docs/tiles/inspect.md`
- **配信の content-type に `.geojson` を足した（`tools/serve`）** — octet-stream のままでも
  MapLibre は描けるが、掴んだ側が何のファイルか分からない

## 開発環境（2026-09-16 時点・実測）

| 道具 | 状態 |
|---|---|
| Node.js | **24.21.0 LTS**（利用者のホーム配下・`%USERPROFILE%\.local\node-v24.21.0-win-x64`） |
| pnpm | **12.4.2**（corepack 経由・`packageManager` と一致） |
| git / bash | git 2.55.0.windows.3 / Git for Windows の bash |
| gh | 2.100.0（ログイン済み） |
| `pmtiles`（go-pmtiles） | **1.31.2 を配置済み**（`~/.local/bin/pmtiles.exe`・恒久 PATH には未登録） |

Node は **管理者権限なし**で入れてある。公式 zip を SHA256 で検証してから
ユーザー領域へ展開し、user PATH へ追加した（winget は昇格が要るため使わなかった）。

### 入れたときに分かったこと

- **`minimumReleaseAge: 1440` は実際に効いた。** `pnpm install` が
  `ERR_PNPM_NO_MATURE_MATCHING_VERSION` で止まり、公開から 24 時間未満の
  vitest 5.0.1 を弾いた。`^5.0.1` は範囲内に成熟版が 1 つも無かったため、
  範囲を `^5.0.0` へ緩めた（5.0.1 が 24 時間を越えれば自動で上がる）。
  **設定を外して通していない。**
- **`onlyBuiltDependencies: []` も効いた。** esbuild の install script が止まった。
  走らせなくても tsx / vitest は動いたので、**止めたまま**にしてある
  （`pnpm-workspace.yaml` の `allowBuilds.esbuild: false`）。
- **pnpm 12 は `package.json` の `pnpm` 欄を読まない**（警告を出して無視する）。
  二重に書いてあった設定を `pnpm-workspace.yaml` の 1 か所へ寄せた。

## 未完了の作業

- **人が実物を見て判断すること。** 地図は描けていて、キャプチャも
  `docs/screenshots/` にありますが、**見て良し悪しを言った人がまだいません**（§29）。
  ここが S1 の実質的な残りです
- 日本語グリフの方針（`localIdeographFontFamily` で逃げている・未決）
- **配信先を立てること**（R2 + Worker・コードは出来ている／デプロイが未）。
  それまで GitHub Pages のデモは案内画面のまま
- lint と Git hooks — 未整備。**別セッションが oxlint を入れている最中**で、
  2026-09-17 時点では devDependency だけあって設定ファイルも CI 配線もありません

## CI の状況（2026-09-16 時点）

最後に走ったのは `fd6eaca`。**3 つとも success**。

| workflow | 結果 | 所要 |
| --- | --- | --- |
| CI（typecheck / test） | success | 16s |
| Deploy demo to GitHub Pages | success | 16s |
| oss-privacy-check | success | 8s |

privacy-check は 2 時間超かかっていたのを 1 パスへ書き直して 5 秒台になりました（`30e36e3`）。

**未 push の commit があります**（本数は `git rev-list --count origin/develop..HEAD`。
数を本文へ書くと、その修正自体で 1 本増えて必ずずれる）。上の結果は `fd6eaca` までのもので、
以降の変更（スタイル修正・style-check・shot・Worker・部品）は **CI を通っていません**。
push は人の確認後（baseline §6）。

## 止まっているもの（人にしかできない工程・baseline §29）

1. **撮った地図を人が見て、良し悪しを言う。** 画像は `docs/screenshots/` に 12 枚
   あります（大阪 z12 / 梅田 z15 / 関西 z9 / 全国 z5 / 東京 / 京都 / 那覇 / 札幌 /
   部品の例 2 枚・2026-09-16、点をまとめた例 2 枚・2026-09-17）。
   **撮れたことは、読めることの証明ではありません。**見てほしい点は
   `docs/screenshots/README.md` の末尾に 5 つ挙げてあります（ラベル密度・
   大阪市のラベルが衝突で消えている・z9 の緑の強さ・地名の扱い・
   まとまりの丸の色）。

   手元で動かせる人は、これで同じものが出ます。

   ```bash
   pnpm serve                                                   # http://localhost:8787/
   pnpm shot -- "http://localhost:8787/#12/34.6937/135.5023" a.png
   ```
2. **デザインの色を決める**（`DESIGN.md` の記入待ち欄）。提案は
   `.claude/proposals/2026-09-16-design-umeda-namba.md` に置いてあります。
   **AI は `DESIGN.md` に手を入れません**（baseline §11）。
   いまスタイルに入っている色は**提案であって、承認された色ではありません**。
3. **日本語グリフの方針**（`.claude/decisions.md` 未決）。
   いまは `localIdeographFontFamily` で閲覧側のフォントに逃げています。
   **字形が閲覧環境ごとに変わる**ため、`DESIGN.md` §3 と衝突したままです。
4. **配信先を実際に立てる（鍵は人・§14）。** 方針は **Cloudflare R2 + Worker** と
   指示がありました（2026-09-16）。**GitHub Pages にはタイルを置けません**
   （1 ファイル 100 MB 上限に対し kansai 373 MB / japan 3.6 GB）。
   人がやる工程は 3 つです。

   1. R2 にバケツを作り、`dist/tiles/*.pmtiles` を上げる（大きいので多部アップロード）
   2. `infra/pmtiles-worker` を `wrangler deploy` で出す（ドメインを当てる）
   3. `pnpm tiles:check-range -- https://<配信先>/kansai.pmtiles` で **206 を確認する**

   そのあと `apps/demo/config.js` の `tilesUrl` を配信先へ向ければ、
   公開デモが地図を描きます。手順は `docs/serving/README.md`。
5. **提案の可否。**7 本あり、**判断待ちは 5 本**
   （`osm-3tile-probe` と `media-poi` は中身を実施済み）。うち `release-plan` は
   「2 媒体がタイルを自分で配信するか」の答え待ちで、そこで順序が変わります。

## 次のタスク

1. **`docs/screenshots/` を人が見て、直す点を言う**（上の「止まっているもの」1）
   - 特に **z12 で「大阪市」が衝突で消えている**件。直すなら `symbol-sort-key` で
     優先順位を決める話になり、**どのラベルを勝たせるかは設計判断**なので提案を先に出す
2. 判断待ちの提案 5 本について、進めるかどうかの判断をもらう（`.claude/proposals/`）
3. 配信先が決まったら、その URL で `pnpm tiles:check-range` を通す
   （**手元では通ったが、本番の配信先では未実行**）
4. `PRD.md` と `.claude/decisions.md` の食い違い（ダーク / ライトの 1 枚目）を解消する
   — **材料は並べました**（`decisions.md` 未決）。**あとは人が「ダーク」と言うだけで消えます**
5. ~~フィルタが実際に何件拾うかを数える道具~~ — **`tools/tile-inspect` で入れた**（2026-09-17）
6. **POI の提案の可否**（`.claude/proposals/2026-09-17-poi.md`）。
   群の分け方は設計判断なので、人が決めてから実装する
7. **2 媒体が自前 POI で何を持っているか**を聞く（属性名・件数）。
   `<mmj-poi>` は動くようになったが、**形式（`properties` の約束）はまだ決めていない**。
   先に決めると、持っていないものを要求する形式になる

## 切り出しの実測値（2026-09-16・Node 24.19.0 / go-pmtiles 1.31.2）

上流 `20260915.pmtiles`（138 GB・basemap 4.15.2）から HTTP Range で切り出した結果。
**2 範囲とも `pmtiles verify` まで通過**。出力は `dist/tiles/`（git 管理外）。

| region | 出力 | tile entries | 所要 | リクエスト数 | 転送量 / overfetch |
|---|---|---|---|---|---|
| `kansai` | 373 MB | 63,684（領域 81,550） | 2m09s | 100 | 392 MB / 0.05 |
| `japan` | 3.6 GB | 1,732,855（領域 10,450,864） | 20m29s | 103 | 3.8 GB / 0.05 |

**2026-09-17 追記**: 上は `--bbox` で切ったときの値です。**切り方を変えて流し直しました**（D-013）。

| | タイル件数 | 容量 | 所要 |
|---|---|---|---|
| 旧（bbox 1 個） | 1,732,855 | 3.37 GiB | 20m29s |
| **新（z10 以下 bbox ＋ z11 以上 8 つの四角）** | **819,672** | **2.60 GiB** | 14m27s |

**-792 MiB（-23%）。遠方の島は 1 つも落ちていません**
（与那国・南鳥島・沖ノ鳥島・択捉・屋久島ほか **22 か所をバイト単位で突き合わせ、全部一致**）。

**低い倍率まで region にすると海に穴が開きます。**最初にそれをやって、
z5 で東京の東に黒い矩形が出ました（撮って気づいた）。低い倍率は安い
（全域 z0-10 で 78 MB）ので、そこだけ bbox にしてあります（`regionMinZoom: 11`）。

| maxzoom | 容量（8 つの四角） |
|---|---|
| 12 | 285 MB |
| 13 | 622 MB |
| 14 | 1.3 GB |
| **15（いまの設定）** | **2.8 GB** |

**z15 だけで全体の 54%（1.5 GB）**です。容量の本丸はここですが、
どこまで寄れる地図にするかは**品質の判断**なので AI では決めません（§11）。

**Range が正しく効いていることの実測**でもある。138 GB の元ファイルに対して
全国ぶんが 103 リクエスト・overfetch 0.05 で済んでいる。
配信側が 206 を返さない場合にここが破綻する（PRD §4）ため、
`check-range` は配信先が決まり次第かならず通すこと。

## 技術的決定

- `.claude/decisions.md` を参照（D-001 〜 D-014）

## 提案（未決・`.claude/proposals/`）

- `2026-09-16-umeda-namba.md` — S1 の 1 枚目を梅田〜難波の bbox にする
- `2026-09-16-osm-3tile-probe.md` — z14 の 3 タイルで OSM 由来の属性を実測する
  （**この提案の中身は実施済み**。実測は下の「スタイルの実測」）
- `2026-09-16-design-umeda-namba.md` — ダーク / ライト 2 枚のデザイン提案
- `2026-09-16-label-mode.md` — ラベルを日本語のみ / インバウンドのモードで持つ
- `2026-09-16-release-plan.md` — pnpm 配布を第一ゴールに置いたときのリリース計画
- `2026-09-17-poi.md` — **POI を描く／育てる**。駅以外を 1 件も描いていないことが
  実測で分かった。上流へ書く（OSM）を第一に、オーバーレイを補助にする。
  ベースタイルへの焼き込みは採らない（D-001 に反するため）
- `2026-09-17-media-poi.md` — **利用者が自前 POI を持てるようにする**（`<mmj-poi>` で実装済み）。
  窓口・仕分け・OSM への投稿手続きは**媒体側の運用**なので範囲外として畳んだ

## テスト状況（2026-09-17・手元で実行）

| パッケージ | ファイル | テスト |
|---|---|---|
| `tools/tiles` | 8 | 108 |
| `tools/serve` | 1 | 7 |
| `tools/asset-check` | 1 | 13 |
| `tools/tile-inspect` | 1 | 13 |
| `tools/privacy-check` | 1 | 22 |
| `tools/style-check` | 2 | 18 |
| `tools/shot` | 1 | 13 |
| `packages/http-range` | 2 | 18 |
| `infra/pmtiles-worker` | 1 | 14 |
| `packages/elements` | 3 | 39 |
| **合計** | **21** | **265 すべて通過**（2026-09-17 実行） |

`pnpm -r typecheck` も 8 パッケージとも通過。
`tools/serve` の Range のテストは `packages/http-range` へ移りました（同じ実装を
Worker も使うため）。**Worker のテストは Cloudflare へ繋がらない環境でも走ります**（§4）。

- `pnpm tiles:resolve` — 実行済み。pin（`20260915.pmtiles` / basemap 4.15.2）が
  上流の索引と一致することを確認。
- `pnpm tiles:extract` — kansai / japan とも完走。`pmtiles verify` 通過。
- `pnpm tiles:check-range` — **手元の配信に対して初通過**（下記「Range の実測」）。
  **本番の配信先では未実行**。
- `pnpm style:check` — 通過（`styles/modern-dark.json` 22 レイヤ・指摘なし）。
- `apps/demo/` — 自動テストは無し。CI では config.js とスタイル検査で止めている。
  描画は `pnpm shot` で撮って確かめている（10 枚）。**人はまだ見ていない。**

## Range の実測（2026-09-16・手元の `pnpm serve` に対して）

```
GET http://localhost:8787/tiles/kansai.pmtiles  Range: bytes=0-15
  status: 206
  content-range: bytes 0-15/373534235
  accept-ranges: bytes
```

**手元の配信が 206 を返しただけです。**本番の配信先は、決まってから同じ手順で通すこと。

## スタイルの実測（2026-09-16・`dist/tiles/kansai.pmtiles`）

スタイルが参照する 9 つの `source-layer` は、pin したビルドに**全部あります**。
グリフ（`Noto Sans Regular` の 0-255 / 256-511）も **HTTP 200** で引けました。

タイルを開いて数えた結果、**バグが 1 件出ました**。
駅ラベルは `min_zoom` を見ているのに、地名ラベルは見ていませんでした。

- z12 の大阪（`12/3589/1626`）で `label-place-city` が 6 件 → うち 4 件が `min_zoom 13` の
  **道頓堀 / 本坊庭園 / 中心伽藍 / でんでん**。寺の庭が「大阪市」と同じ重みで出ていた
- 直した結果、z12 で出るのは **大阪市（mz3）/ 吹田市（mz8）の 2 件**
- `label-water` にも同じ守りを足した（実測した 3 タイルでは差は出ない。
  上流の判断を捨てないための揃え）
- **同じ抜けが再発したら CI が落ちる**（`tools/style-check`）

## 既知の問題

- **POI を駅しか描いていません（2026-09-17 実測）。** `pois` レイヤは
  `14/14357/6508` に 124 件・`15/28715/13016` に 516 件あって全部 name つきですが、
  スタイルが読んでいるのは `kind == "station"` だけです。
  **京セラドーム大阪はタイルに入っています**（`kind: stadium` / `min_zoom: 15`）。
  データの問題でもタイルの問題でもなく、**スタイルに POI レイヤが無い**だけです。
  提案は `.claude/proposals/2026-09-17-poi.md`。

- **ベースタイルの配信先がまだ立っていません。** 方針は R2 + Worker（上記）ですが、
  **バケツもドメインも未作成**です。公開デモはそれまで案内画面のままです
  （手元は `pnpm serve` で描けます）。
- **日本語グリフが無い。** Protomaps が配るフォントは Latin のみで、CJK のスタックがありません。
  いまは `localIdeographFontFamily` で閲覧側のフォントに逃げているため真っ白にはなりませんが、
  **字形は閲覧環境ごとに変わります**。ラテン側のグリフは 200 で引けることを確認済み
  （`Noto Sans Regular` の 0-255 / 256-511）。**1 範囲でも 404 になれば地図全体が白くなる**
  という性質自体は変わっていません。
- **上流の索引 `build-metadata.protomaps.dev/builds.json` は文書化された API ではありません。**
  消えた場合は `pnpm tiles:resolve` が落ちて気づけるようにしてあります。
- **go-pmtiles は checksums を公開していません。** リリース資産は各 OS の
  アーカイブだけで、`checksums.txt` 相当がありません。**取得物を上流の公式値と
  照合できていない**ということです。手元に置いた 1.31.2 の sha256 は
  `a658baa4d7e55020aef6ca17bd9ff9faa1582671266b36f58c52db0ac8e785a1`
  （`go-pmtiles_1.31.2_Windows_x86_64.zip`）。次に入れ直すときはこの値と突き合わせる。
- **切り出したファイルが「どの上流版から作ったか」を持っていません**（D-014 の未対応）。
  PMTiles のメタデータにあるのは OSM の時刻だけで、上流のキーは入りません。
  `pmtiles edit --metadata` で書けるはずですが、手を付けていません。
- **`PRD.md` と `.claude/decisions.md` が食い違っています。** PRD は
  「ダークを 1 枚目に」と断定していますが（69 行目）、`decisions.md` の未決には
  「1 枚目をダークにするかライトにするか」が残っています。どちらかが古い（baseline §10）。
  **判断に要る材料は `decisions.md` の未決に並べました**（2026-09-17）。
  ダークで確定なら手戻りゼロ、ライトなら手書き 22 レイヤぶんの作業です。
  **AI は見た目を決めません**（§11）。
- **個人のホームディレクトリのパスが、すでに公開履歴に入っています。**
  `.claude/project-status.md` に `C:\Users\<アカウント名>\...` と書いてあり、
  それが `fd6eaca` までの commit として **origin/develop に push 済み**です。
  作業ツリーからは消し、**同じ形を CI が止めるようにしました**（`[added-homepath]`）が、
  **履歴に残っているものは、履歴を書き換えないと消えません**（baseline §25）。
  - 消すなら `git filter-repo` 等での書き換え ＋ force push になり、
    **他のクローンを壊します。やるかどうかは人の判断です**（AI からは実行しません）
  - 消さない判断もあり得ます。漏れているのは Windows のローカルアカウント名 1 つで、
    メールアドレスでも実名でもありません
- **同じリポで複数のセッションが並行して編集しています。** 2026-09-16 に、
  作業ツリーの編集が別セッションの commit と衝突しました（同じ内容だったため実害なし）。
  **編集前に `git log` と `git status` を見ること。**
