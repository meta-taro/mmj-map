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
| `pmtiles`（go-pmtiles） | **未インストール。**切り出しの実行にはこれが要る |

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
- `pnpm tiles:extract` — **未実行。**`pmtiles` コマンドがまだ無い
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
2. **`pmtiles` コマンド（go-pmtiles）を入れる。** 切り出しの実行に要ります。
3. **先行実装のソースを渡す。** S1 の完了条件は「先行実装を一切参照せずに地図が 1 枚出ること」ですが、
   切り出し元がこのリポにもマシンにも無く、場所の記録もありません。
   最低限、**手書きダークスタイルの JSON** が要ります。
4. **日本語グリフの方針**（`.claude/decisions.md` 未決）。S1 の間に止めるかどうか。
5. **デザインの色を決める**（`DESIGN.md` の記入待ち欄）。提案は
   `.claude/proposals/2026-09-16-design-umeda-namba.md` に置いてあります。
   **AI は `DESIGN.md` に手を入れません**（baseline §11）。

## 次のタスク

1. push 後の CI を読み、赤なら直す（§20）
2. 梅田〜難波の提案 3 本について、進めるかどうかの判断をもらう
   （`.claude/proposals/`）
3. `pmtiles` が入ったら `pnpm tiles:extract` を初めて実行し、実測サイズを記録する
4. `apps/demo/` を、手元の PMTiles で 1 枚描くところまで繋ぐ

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
- `pnpm tiles:extract` / `check-range` — **未実行**（`pmtiles` コマンドと配信先が無い）。
- `.github/scripts/oss-privacy-check.sh` — 自動テストは無し。手動実行で赤→緑を確認済み。
- `apps/demo/` — 未整備。

## 既知の問題

- **ベースタイルの配信先が未決。** デモは配信先が決まるまで地図を描けません。
- **日本語グリフが無い。** Protomaps が配るフォントは Latin のみで、CJK のスタックがありません。
  1 範囲でも 404 になると地図全体が真っ白になります。
- **上流の索引 `build-metadata.protomaps.dev/builds.json` は文書化された API ではありません。**
  消えた場合は `pnpm tiles:resolve` が落ちて気づけるようにしてあります。
