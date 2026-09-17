# タイルを開いて数える（`pnpm tile:inspect`）

**推測で地図を作らないための道具です。**

「大阪市のラベルが出ない」「京セラドームが無い」のような話は、
タイルを開けば切り分けられます。**どちらも実際にそうでした**
（前者はスタイルが `min_zoom` を見ていなかった／後者はスタイルに POI レイヤが無かった。
データはどちらも入っていました）。

## 使い方

```bash
# 座標からタイル番号を出す（手で計算しない）
pnpm tile:inspect -- --lonlat=135.4761,34.6693 --zoom=15
#=> 15 28715 13016

# タイルに何が何件入っているか
pnpm tile:inspect -- dist/tiles/kansai.pmtiles 15 28715 13016

# レイヤを絞って、kind ごとに数える
pnpm tile:inspect -- dist/tiles/kansai.pmtiles 15 28715 13016 --layer=pois

# その倍率で「出る資格があるもの」だけに絞る（上流の min_zoom を尊重する）
pnpm tile:inspect -- dist/tiles/kansai.pmtiles 15 28715 13016 --layer=pois --at=15

# 別の属性で数える／中身を全部出す
pnpm tile:inspect -- dist/tiles/kansai.pmtiles 15 28715 13016 --layer=pois --by=min_zoom --list
```

go-pmtiles を外部コマンドとして呼びます。**依存は足していません。**
PATH に無ければ `PMTILES_BIN` で場所を渡してください。

```bash
PMTILES_BIN=~/.local/bin/pmtiles.exe pnpm tile:inspect -- dist/tiles/kansai.pmtiles 15 28715 13016
```

## 実測の例（2026-09-17）

```
15/28715/13016
boundaries(1) buildings(2724) earth(1) landuse(57) places(13) pois(516) roads(50) water(15)

--- pois: 516 件 → z15 で出る資格があるのは 45 件 ---
[kind]
  administrative: 9
  hospital: 5
  bank: 4
  water: 4
  post_office: 3
  school: 3
  ...
  stadium: 1      ← 京セラドーム大阪（min_zoom 15）
```

## この道具の限界

- **幾何は読みません。**「何が何件あるか」までで、形は見ません（描くのは MapLibre の仕事）
- **1 タイルずつです。**範囲全体の集計はしません
- **読めなかった地物は件数として出します。**黙って少ない数を出しません

## 作っているときに出たバグ（残しておきます）

読み飛ばしを `c.pos += varint(c)` と書いていました。**複合代入は左辺の値を先に読む**ため、
`varint` が位置を進めたぶんが捨てられ、**1 バイトずれます**。

ずれたまま読み進めると例外になり、その地物が数え落とされます。
実測で **buildings が 2724 件 → 5 件**になりました。

**合成タイルのテストは通っていました。**幾何を 0 埋めで作っていたためです。
`0x00` は「tag 0 / wire 0」として無害に読み飛ばせるので、**ずれていても通ります**。
いまは `0x0c`（tag 1 / wire 4 ＝ 読めない wire）で埋めていて、
**ずれたら必ず落ちます**。

**本物のデータに当てるまで気づけませんでした。**
