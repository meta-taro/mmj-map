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
- **oss-privacy-check の赤を直した（2026-09-16）** — `OSS_ALLOWED_EMAILS`
  （空白区切り・完全一致）を足し、生成ツールの no-reply だけを通す。
  手元の git bash で修正前 exit 1 / 修正後 exit 0 を確認し、
  使い捨てリポで「同じドメインの別アドレスは通らない」ことも確認済み。
  **ただし CI 上ではまだ走っていない**（未 push のため）。

## 未完了の作業

- **`tools/tiles` はまだ 1 度も実行していません。**
  開発機に Node が無く、`pnpm install` すらできていません（下記「止まっているもの」）。
  **テストを書いた ＝ 通した、ではありません。** CI の初回結果を見るまで「完了」と書きません。
- 先行実装からの切り出し（スタイル JSON / 配信経路 / グリフ）— 着手できていません
- `apps/demo/` で素の地図を 1 枚出す
- lint（eslint）と Git hooks — Node が入ってから入れます
- `pnpm-lock.yaml` — 生成できていないため、CI は `--no-frozen-lockfile` で走ります

## CI の状況（2026-09-16 時点）

`gh run list` で確認した実際の結果。

| workflow | 最後に走った commit | 結果 |
| --- | --- | --- |
| oss-privacy-check | 02daccd | **failure**（`NG [message-email]`）→ ed0685e で修正済み・未検証 |
| Deploy demo to GitHub Pages | 02daccd | success |
| CI（typecheck / test） | — | **1 度も走っていません**（74fe70e が未 push のため） |

未 push の commit は 2 本（74fe70e・ed0685e）。**push は人間の工程です**（baseline §6）。

## 止まっているもの（人にしかできない工程・baseline §29）

1. **開発機に Node.js 22.12+ を入れる。** これが入るまで、手元では
   install も test も typecheck も 1 つも走りません。`corepack enable pnpm` まで。
   （2026-09-16 再確認: `node` / `pnpm` / `npm` / `corepack` いずれも PATH に無し）
2. **未 push の 2 commit を確認して push する。** これが済むまで、
   `ci.yml` の初回結果も、oss-privacy-check の修正が効いたかも分かりません。
3. **先行実装のソースを渡す。** S1 の完了条件は「先行実装を一切参照せずに地図が 1 枚出ること」ですが、
   切り出し元がこのリポにもマシンにも無く、場所の記録もありません。
   最低限、**手書きダークスタイルの JSON** が要ります。
4. **`pmtiles` コマンド（go-pmtiles）を入れる。** 切り出しの実行に要ります（2026-09-16 時点で未インストール）。
5. **日本語グリフの方針**（`.claude/decisions.md` 未決）。S1 の間に止めるかどうか。

> 環境メモ（2026-09-16 更新）: `git` 2.55（Git for Windows）・`bash`・`gh` 2.100 は
> PATH に入り、使えるようになりました。Issue は `gh` で確認済みで、
> **open / closed とも 0 件**です。

## 次のタスク

1. 上記「止まっているもの」1・2 の解消（Node の導入 / push）
2. push 後の CI を読み、赤なら直す（§20）
3. 先行実装のスタイル JSON を持ち込み、固有の語を外す
4. `apps/demo/` を、ローカルの `dist/tiles/kansai.pmtiles` で 1 枚描くところまで繋ぐ

## 技術的決定

- `.claude/decisions.md` を参照（D-001 〜 D-010）

## テスト状況

- `tools/tiles` — 単体テスト 5 ファイル（bbox / builds / manifest / extract-plan / range）を**記述済み**。
  **未実行。** 実行結果は CI の初回で確認します。
- `.github/scripts/oss-privacy-check.sh` — 自動テストはありません。
  2026-09-16 に手元で手動実行して赤→緑を確認しました（上記「完了した作業」）。
- それ以外 — 未整備

## 既知の問題

- **ベースタイルの配信先が未決。** デモは配信先が決まるまで地図を描けません。
  手元のファイルを Range 対応の静的配信で出せば、配信先が決まる前でも 1 枚は出せます。
- **日本語グリフが無い。** Protomaps が配るフォントは Latin のみで、CJK のスタックがありません。
  1 範囲でも 404 になると地図全体が真っ白になります。
- **上流の索引 `build-metadata.protomaps.dev/builds.json` は文書化された API ではありません。**
  消えた場合は `pnpm tiles:resolve` が落ちて気づけるようにしてあります。
