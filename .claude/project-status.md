# プロジェクトステータス — modern-map-japan

- **現在フェーズ**: S1（切り出し）着手中
- **最終更新**: 2026-09-16

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

## 開発環境（2026-09-16 時点・実測）

| 道具 | 状態 |
|---|---|
| Node.js | **24.21.0 LTS**（`C:\Users\onlin\.local\node-v24.21.0-win-x64`） |
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

- 先行実装からの切り出し（スタイル JSON / 配信経路 / グリフ）— 着手できていません
- `apps/demo/` で素の地図を 1 枚出す
- lint（eslint）と Git hooks — 未整備

## CI の状況（2026-09-16 時点）

| workflow | 最後に走った commit | 結果 |
| --- | --- | --- |
| oss-privacy-check | 02daccd | failure → 修正済み・**CI 上では未検証** |
| Deploy demo to GitHub Pages | 02daccd | success |
| CI（typecheck / test） | — | **1 度も走っていません**（未 push のため） |

**手元では typecheck / test / `--frozen-lockfile` install がすべて通っています。**
CI で初めて走るときの結果は、push 後に確認します。

## 止まっているもの（人にしかできない工程・baseline §29）

1. **未 push の commit を確認して push する。** これが済むまで CI の初回結果が出ません。
2. **先行実装のソースを渡す。** S1 の完了条件は「先行実装を一切参照せずに地図が 1 枚出ること」ですが、
   切り出し元がこのリポにもマシンにも無く、場所の記録もありません。
   最低限、**手書きダークスタイルの JSON** が要ります。
3. **日本語グリフの方針**（`.claude/decisions.md` 未決）。S1 の間に止めるかどうか。
4. **デザインの色を決める**（`DESIGN.md` の記入待ち欄）。提案は
   `.claude/proposals/2026-09-16-design-umeda-namba.md` に置いてあります。
   **AI は `DESIGN.md` に手を入れません**（baseline §11）。

## 次のタスク

1. push 後の CI を読み、赤なら直す（§20）
2. 梅田〜難波の提案 3 本について、進めるかどうかの判断をもらう
   （`.claude/proposals/`）
3. `apps/demo/` を、手元の `dist/tiles/kansai.pmtiles` で 1 枚描くところまで繋ぐ
4. 配信先が決まったら `pnpm tiles:check-range` を通す（**まだ 1 度も走っていない**）

## 切り出しの実測値（2026-09-16・Node 24.19.0 / go-pmtiles 1.31.2）

上流 `20260915.pmtiles`（138 GB・basemap 4.15.2）から HTTP Range で切り出した結果。
**2 範囲とも `pmtiles verify` まで通過**。出力は `dist/tiles/`（git 管理外）。

| region | 出力 | tile entries | 所要 | リクエスト数 | 転送量 / overfetch |
|---|---|---|---|---|---|
| `kansai` | 373 MB | 63,684（領域 81,550） | 2m09s | 100 | 392 MB / 0.05 |
| `japan` | 3.6 GB | 1,732,855（領域 10,450,864） | 20m29s | 103 | 3.8 GB / 0.05 |

**Range が正しく効いていることの実測**でもある。138 GB の元ファイルに対して
全国ぶんが 103 リクエスト・overfetch 0.05 で済んでいる。
配信側が 206 を返さない場合にここが破綻する（PRD §4）ため、
`check-range` は配信先が決まり次第かならず通すこと。

## 技術的決定

- `.claude/decisions.md` を参照（D-001 〜 D-010）

## 提案（未決・`.claude/proposals/`）

- `2026-09-16-umeda-namba.md` — S1 の 1 枚目を梅田〜難波の bbox にする
- `2026-09-16-osm-3tile-probe.md` — z14 の 3 タイルで OSM 由来の属性を実測する
- `2026-09-16-design-umeda-namba.md` — ダーク / ライト 2 枚のデザイン提案

## テスト状況

- `tools/tiles` — **2026-09-16 に初めて実行。5 ファイル / 45 テストすべて通過**
  （vitest 5.0.0 / Node 24.21.0 / 所要 333ms）。
  `pnpm -r typecheck` も通過。
- `pnpm tiles:resolve` — **実行済み。**pin（`20260915.pmtiles` / basemap 4.15.2）が
  上流の索引と一致することを確認。
- `pnpm tiles:extract` — **2026-09-16 に kansai / japan とも完走。`pmtiles verify` 通過。**
  実測は下記「切り出しの実測値」。
- `pnpm tiles:check-range` — **未実行**（配信先が未決のため試す URL が無い）。
- `.github/scripts/oss-privacy-check.sh` — 自動テストは無し。手動実行で赤→緑を確認済み。
- `apps/demo/` — 未整備。

## 既知の問題

- **ベースタイルの配信先が未決。** デモは配信先が決まるまで地図を描けません。
- **日本語グリフが無い。** Protomaps が配るフォントは Latin のみで、CJK のスタックがありません。
  1 範囲でも 404 になると地図全体が真っ白になります。
- **上流の索引 `build-metadata.protomaps.dev/builds.json` は文書化された API ではありません。**
  消えた場合は `pnpm tiles:resolve` が落ちて気づけるようにしてあります。
- **go-pmtiles は checksums を公開していません。** リリース資産は各 OS の
  アーカイブだけで、`checksums.txt` 相当がありません。**取得物を上流の公式値と
  照合できていない**ということです。手元に置いた 1.31.2 の sha256 は
  `a658baa4d7e55020aef6ca17bd9ff9faa1582671266b36f58c52db0ac8e785a1`
  （`go-pmtiles_1.31.2_Windows_x86_64.zip`）。次に入れ直すときはこの値と突き合わせる。
- **`PRD.md` と `.claude/decisions.md` が食い違っています。** PRD §1 は
  「ダークを 1 枚目に」と断定していますが、`decisions.md` の未決には
  「1 枚目をダークにするかライトにするか」が残っています。どちらかが古い（baseline §10）。
- **同じリポで複数のセッションが並行して編集しています。** 2026-09-16 に、
  作業ツリーの編集が別セッションの commit と衝突しました（同じ内容だったため実害なし）。
  **編集前に `git log` と `git status` を見ること。**
