# プロジェクトステータス — modern-map-japan

- **現在フェーズ**: S1（切り出し）着手中
- **最終更新**: 2026-09-15

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

## 未完了の作業

- **`tools/tiles` はまだ 1 度も実行していません。**
  開発機に Node が無く、`pnpm install` すらできていません（下記「止まっているもの」）。
  **テストを書いた ＝ 通した、ではありません。** CI の初回結果を見るまで「完了」と書きません。
- 先行実装からの切り出し（スタイル JSON / 配信経路 / グリフ）— 着手できていません
- `apps/demo/` で素の地図を 1 枚出す
- lint（eslint）と Git hooks — Node が入ってから入れます
- `pnpm-lock.yaml` — 生成できていないため、CI は `--no-frozen-lockfile` で走ります

## 止まっているもの（人にしかできない工程・baseline §29）

1. **開発機に Node.js 22.12+ を入れる。** これが入るまで、手元では
   install も test も typecheck も 1 つも走りません。`corepack enable pnpm` まで。
2. **GitHub CLI（`gh`）を入れる。** 入っていないため、**このセッションでは Issue を
   1 件も確認できていません**（CLAUDE.md「セッションの進め方」が実行できていない）。
3. **先行実装のソースを渡す。** S1 の完了条件は「先行実装を一切参照せずに地図が 1 枚出ること」ですが、
   切り出し元がこのリポにもマシンにも無く、場所の記録もありません。
   最低限、**手書きダークスタイルの JSON** が要ります。
4. **`pmtiles` コマンド（go-pmtiles）を入れる。** 切り出しの実行に要ります。
5. **日本語グリフの方針**（`.claude/decisions.md` 未決）。S1 の間に止めるかどうか。

> 補足: `git` は PATH に無く、GitHub Desktop 同梱のもの
> （`%LOCALAPPDATA%\GitHubDesktop\app-3.6.5\resources\app\git\cmd`）を使っています。

## 次のタスク

1. 上記「止まっているもの」1・2 の解消（Node / gh）
2. CI の初回結果を読み、赤なら直す（§20）
3. 先行実装のスタイル JSON を持ち込み、固有の語を外す
4. `apps/demo/` を、ローカルの `dist/tiles/kansai.pmtiles` で 1 枚描くところまで繋ぐ

## 技術的決定

- `.claude/decisions.md` を参照（D-001 〜 D-010）

## テスト状況

- `tools/tiles` — 単体テスト 5 ファイル（bbox / builds / manifest / extract-plan / range）を**記述済み**。
  **未実行。** 実行結果は CI の初回で確認します。
- それ以外 — 未整備

## 既知の問題

- **ベースタイルの配信先が未決。** デモは配信先が決まるまで地図を描けません。
  手元のファイルを Range 対応の静的配信で出せば、配信先が決まる前でも 1 枚は出せます。
- **日本語グリフが無い。** Protomaps が配るフォントは Latin のみで、CJK のスタックがありません。
  1 範囲でも 404 になると地図全体が真っ白になります。
- **上流の索引 `build-metadata.protomaps.dev/builds.json` は文書化された API ではありません。**
  消えた場合は `pnpm tiles:resolve` が落ちて気づけるようにしてあります。
