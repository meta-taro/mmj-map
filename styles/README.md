# styles

地図の配色。**手書きの正本であって、ビルド生成物ではない**（D-002）。
`.gitignore` で除外しない。差分はレビュー対象。

## いま置いてあるもの

| ファイル | 名前 | ねらい |
| --- | --- | --- |
| `modern-dark.json` | Modern Dark | 夜。1 枚目に選んだ既定（D-016） |
| `modern-light.json` | Modern Light | 昼。道を白で抜き、太さだけで序列を付ける |
| `modern-ink.json` | Modern Ink | 無彩色。白い道に黒い輪郭。白黒で刷っても潰れない |
| `modern-sand.json` | Modern Sand | 暖色。紙の地図寄り。緑と水が強く出る |
| `modern-neon.json` | Modern Neon | 夜のネオン。道の序列を明るさではなく**色相**で分ける |
| `modern-candy.json` | Modern Candy | 昼のパステル。同じ色相の並びを明るい側で使う |

**どれもまだ提案**です。`DESIGN.md` の配色欄は空のままで、
ここに入っている色は**承認された配色ではなく、実装された値**です（baseline §11）。

## 違っていいのは色だけ

レイヤ構成・`filter`・`minzoom` / `maxzoom`・`layout`・線の太さは **6 枚とも同一**。
`tools/style-check/test/parity.test.ts` が一致を見ている。

構造まで枝分かれさせると「dark では出るのに light では出ない地物」が生まれ、
**どちらが正しいのか誰にも分からなくなる**。色を人が選ぶ話（D-002）と、
構造を枝分かれさせる話は別。

## 増やすとき

1. `modern-dark.json` をそのまま複製する
2. **色の値だけ**を変える。レイヤを足したり消したりしない
3. `metadata` の `mmj:status` を提案のままにする（承認は人の工程）
4. `pnpm style:check` を通す（**既定で `styles/` の全部を見る**。登録作業は無い）
5. `apps/demo/themes.html` に 1 枚足す（並べないと比べられない）

レイヤを増やしたいときは、**6 枚すべてに同じものを足す**。
parity テストが片側だけの追加で落ちる。

## 色を決めているのが外界のとき

鉄道の路線色・信号・ブランドカラーは**写すもの**であって作るものではない。
独自配色に置き換えると誤読を生む（`CLAUDE.md`）。いまの 6 枚は路線色を持っていない。

## 帰属表示

`sources.basemap.attribution` の `© OpenStreetMap contributors` を消さない。
ベースデータは ODbL（`LICENSES.md`）。parity テストが 6 枚とも見ている。

## `__TILES_URL__`

配信先の URL は焼き込まない。読み込む側（`<mmj-map tiles="...">`）が差し替える。
差し替えに失敗したら `mmj-map` が例外を投げる（白い地図を出さないため）。
