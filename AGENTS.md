# エージェントへ

この文書は**機械が読む前提**で置いてあります。読む相手によって、行き先が違います。

## MMJ を「使う」なら（HTML を書く）

**ここは読まなくてよいです。** 1 ファイルで足ります。

| 欲しいもの | 取る場所 |
| --- | --- |
| 索引と、写して動く最小の 1 枚 | <https://meta-taro.github.io/mmj-map/llms.txt> |
| 属性の全文（1 回の取得で全部） | <https://meta-taro.github.io/mmj-map/llms-full.txt> |
| ネットワークが無いとき | `node_modules/@mmj-map/elements/llms.txt` |

**地図のタイルとスタイルは、利用者が自分で置きます**。MMJ は配信元を持ちません
（API キーも従量課金もありません）。

## このリポジトリを「触る」なら（直す・足す）

**`CLAUDE.md` を読んでください**。この文書はその入口です
（`CLAUDE.md` は Claude Code の慣習で、他のエージェントは読みに来ないため置いています）。

特に外せないもの:

| | |
| --- | --- |
| パッケージマネージャ | **pnpm のみ**。npm / yarn は使わない |
| commit と push | **commit は AI、push は人**。AI から push を代行しない |
| 品質ゲート | `pnpm gate`（lint → typecheck → test → 参照 → スタイル → **エージェント向け文書**） |
| 公開リポジトリ | **個人名・個人メールを commit history に残さない** |
| 秘密情報 | **AI は作らない・置かない・貼らない** |

## 定期点検

月に 1 度、または大きな機能を入れた直後に `docs/pdca.md` の手順を通します。

測る → 外を見る（競合と上流の版） → 効き目の高い順に 3 つ → 実物を見る → 検査に落とす。

**推測で改善案を並べないこと**。数字を先に出さないと、次回との比較ができません。

## 属性を足したら

`docs/elements/README.md` に書いてください。**書き忘れると `pnpm gate` が落ちます**
（`tools/agent-doc` が、ソースが読んでいる属性と文書を突き合わせています）。

```bash
pnpm agent-doc:build    # llms.txt / llms-full.txt を作り直す
pnpm agent-doc:check    # 古びていたら落とす（gate の中で走る）
```

**生成物を手で直さないでください**。`llms.txt` と `llms-full.txt` は生成物で、
手で足した行は次の `build` で消えます。意味を書く場所は `docs/elements/README.md` と
`tools/agent-doc/src/cli.ts` の `LINKS` です。
