# modern-map-japan

> このリポジトリは、人と AI エージェント（Claude Code）が一緒に開発することを前提に構成されています。
> AI エージェントは以下を必ず守ってください。

## 必読

- **`.claude/rules/product-baseline.md`** — 開発のベースルール。**最優先で従うこと**。
- **`PRD.md`** — このプロダクトの方向性・スコープ・やらないこと。
- **`.claude/roadmap.md`** — フェーズと進め方。**S1 が最初の一手**。
- **`.claude/decisions.md`** — 決定と、その理由。**未決は本文末尾にまとめてある**。
- **`docs/origin/`** — 受領した原案の原文。PRD は原案の要約ではなく、
  **原案から何を動かしたかを書いた文書**。動かしていない部分は原案を読むこと。

## このプロダクトで特に効く原則

- **データを持たない。表現を持つ。** ベース地図は Protomaps の日次プラネットビルドを使う。
  タイル生成パイプラインを自作しない（原案 §3.2 / §6-9）。
- **地図サーバーを立てない。** 静的配信 ＋ HTTP Range で完結させる（原案 §24）。
- **スタイルは生成物ではなく作品として扱う。** `*.json` のスタイルは手書きの正本であり、
  ビルド生成物ではない。`.gitignore` で除外しない。
- **外界が色を決めているものは、配色ルールの適用外。** 鉄道の路線色・信号・
  ブランドカラーは**写すもの**であって作るものではない。独自配色に置き換えると誤読を生む。
- **`© OpenStreetMap contributors` の帰属表示を画面から外さない。** ベースデータは ODbL。
  帰属を消した状態でデモを出さない（`LICENSES.md`）。

## 守ることの要点（詳細は product-baseline.md）

- pnpm のみ（npm / yarn 禁止）。
- 実装前に計画を立てる。小さいフェーズで作業。テストを後回しにしない／削除しない。
- **commit は AI、push は人間**。人間確認なしの push は禁止。
- 進捗は `.claude/project-status.md` に随時記録。テスト未実装で「完了」と書かない。
- **本番へ出す経路は push で自動に走らせる**。`.github/workflows/deploy.yml` がデモサイトを
  GitHub Pages へ出す。**ファイルごと消さない**。`workflow_dispatch` だけにしない
  （押した日しか本番が変わらず、走らない workflow は CI 赤にもならないので誰も気づけない）。
- **認証情報・鍵は人が投入する。** AI が値を作らない・ログへ出さない・Issue へ貼らない。

## 公開リポジトリであることの制約

- **個人名・個人のメールアドレスを commit history に残さない。**
  `git config user.email` を noreply に設定してから commit する。
  `.github/workflows/oss-privacy-check.yml` が検出する。
- **Issue・コメント・commit message に、このリポと無関係な案件名を書かない。**
- GitHub の Issue / コメント編集は edit history が公開のまま残る。**出す前しか対策できない。**

## 進捗管理

- `.claude/project-status.md` … 現在フェーズ・完了/未完了・次タスク・既知問題
- `.claude/decisions.md` … 技術的決定の記録

## セッションの進め方

### 開始時

1. `git pull --ff-only`
2. `gh issue list --state open` ＋ `gh issue list --state closed --limit 10`
   （**close 済 Issue にも後追いで追記が入ることがある。必ず両方見る**）
3. open Issue は全件 `gh issue view <番号> --json title,body,comments --jq '.'` で本文＋コメント確認
   （`--comments` は exit 0 のまま何も出力しないことがあり、「読んだが何も無かった」と区別がつかない）

### 終了時

1. `.claude/project-status.md` に進捗を記録（テスト未実装で「完了」と書かない）
2. 完了 Issue は `gh issue close <番号> --comment "..."`

### git pull の 3 タイミング

1. **セッション開始時**: `git pull --ff-only`
2. **commit する直前**: `git pull --rebase --ff-only`
3. **人間 push 時**: ff エラーなら `pull --rebase` してから再 push
