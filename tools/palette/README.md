# @mmj-map/palette

**導入者が自分の配色を完全に作るための道具。**指し値（4〜5 色）から、
24 役割の配色、またはそのまま配れるスタイル JSON を作ります。

> **ここが吐いたものを `styles/` へ置かないこと。**
> MMJ が配る 6 枚は手書きの作品のままです（D-002）。
> この道具は**導入者のためのもの**として切り出してあります（D-021）。
> 出力には `mmj:generated: true` が入り、手書きと見分けが付きます。

## 使う

```bash
# 24 役割の配色（<mmj-map palette-url> にそのまま渡せる）
pnpm palette -- --land=#f7f9fb --water=#bfd7e8 --ink=#16202b --accent=#0a5fff

# そのまま配れるスタイル
pnpm palette -- --land=#f7f9fb --water=#bfd7e8 --ink=#16202b --accent=#0a5fff \
  --style --base=modern-light --name="Acme Maps" --out=acme.json

# 出したあとに確かめる
pnpm style:check -- acme.json
```

| 引数 | 意味 |
| --- | --- |
| `--land` | 陸・背景の色（**必須**） |
| `--water` | 水域の色（**必須**）。陸の系列から独立させる |
| `--ink` | 文字の色（**必須**）。ラベルの一番濃い側 |
| `--accent` | テーマカラー（**必須**）。高速道路と駅の縁に乗る |
| `--green` | 公園・森。省くと陸から導く |
| `--set=役割=色` | 役割を手で上書きする。**最後に勝つ**。何度でも書ける |
| `--style` | 配色ではなくスタイルごと作る |
| `--base` | 土台のスタイル名。既定 `modern-light`（`--style` のとき） |
| `--name` | 作るスタイルの名前。既定 `Custom` |
| `--out` | 書き出し先。**無ければ標準出力** |

## 何が導かれるか

**指し値はそのまま出ます**（作り変えません）。

| 役割 | どうなるか |
| --- | --- |
| `background` `earth` `station-fill` `halo` | `--land` そのもの |
| `water` | `--water` そのもの |
| `label-city` | `--ink` そのもの |
| `highway` `station` | `--accent` そのもの |
| `landcover` `built` `paved` `buildings` `path` `road-*` `rail` `boundary` `label-station` `label-neighbourhood` | 地色から文字色へ向かって濃くなる。**細いものほど地色に近い** |
| `waterway` `label-water` | 水から文字色へ向かって濃くなる |
| `highway-casing` | accent を文字色側へ寄せた色 |
| `green` | `--green`、無ければ陸から導く |

混ぜるのは **Oklab**（sRGB のまま混ぜると階調が詰まり、色がくすむ）。**依存は足していません**（式だけ）。

### 好みで変わるところは式にしていない

明るい土台で**道路を白抜き**にしたい（地色より明るくする）ことがありますが、
ここでは地色から文字色へ向かって濃くしています。白抜きにしたいときは上書きしてください。

```bash
pnpm palette -- ... --set=road-minor=#ffffff --set=road-medium=#ffffff --set=road-major=#ffffff
```

## MCP の口

エージェントから直接作れます。

```bash
pnpm palette:mcp
```

Claude Code への登録（`.mcp.json` / `claude mcp add`）:

```json
{
  "mcpServers": {
    "mmj-palette": {
      "command": "pnpm",
      "args": ["palette:mcp"],
      "cwd": "<このリポジトリのパス>"
    }
  }
}
```

| 道具 | 何をするか |
| --- | --- |
| `mmj_list_roles` | 24 役割と、それぞれが地図の何を変えるかを返す |
| `mmj_list_bases` | 土台にできるスタイル名を返す |
| `mmj_derive_palette` | 指し値から 24 役割の配色を作る |
| `mmj_build_style` | 指し値からスタイル JSON を作る |

**SDK は入れていません。**MCP の stdio は JSON-RPC 2.0 を改行区切りで流すだけで、
ここで要るのは `initialize` / `tools/list` / `tools/call` の 3 つです。
公式 SDK（`@modelcontextprotocol/sdk` 1.30.0・MIT）は express / hono / cors / jose /
express-rate-limit まで引いてきて **99 パッケージ増えます**（実測・2026-09-21）。
HTTP と SSE の輸送のためのもので、**stdio 1 本には釣り合いません**（baseline §1 / §12）。

代わりに、**本物のプロセスを起動して本物の JSON-RPC を流すテスト**があります
（`test/mcp.test.ts`）。仕様が動いたらそこが落ちます。

## 使う側

```html
<!-- 配色だけ渡す -->
<mmj-map tiles="..." style-url="/styles/modern-light.json" palette-url="./acme-palette.json"></mmj-map>

<!-- スタイルごと持つ -->
<mmj-map tiles="..." style-url="./acme.json"></mmj-map>
```

スタイルごと作った場合、`metadata["mmj:anchors"].accent` を部品が読むので、
**`accent` 属性を書かなくても目印・まとまり・自前 POI の色が揃います**。

## 出したものの扱い

- **あなたのものです。**手で直して構いません（そのための形にしてあります）
- `__TILES_URL__` は残ります。**焼き込むと配信先を変えられなくなる**ため
- `© OpenStreetMap contributors` の帰属表示は残ります。**消して配らないでください**（ODbL）
- `mmj:generated: true` が入ります。**外さないでください**（手書きの作品と混ざります）
