# 安裝 MMJ

> ⚠️ **本頁為機器翻譯，尚未經母語者校閱。**
> 以 [`en.md`](en.md)（英文）為準；若有出入，以英文版為正。
> 歡迎提交修正。
>
> **Machine-translated. No native speaker has reviewed this page.**
> [`en.md`](en.md) is authoritative. Corrections welcome.

> **MMJ 尚未發佈到 npm。**套件存在於本儲存庫，但全部是 `private: true`，
> 而且 `@mmj-map` 這個 scope 也還沒註冊。
> **`pnpm add @mmj-map/elements` 目前無法使用。**
> 以下是**現在真的可行**的做法：把三樣東西放進你的網站。

一張地圖需要三樣東西。MMJ 提供後兩樣，並告訴你第一樣怎麼做。

| | 是什麼 | 從哪裡來 |
| --- | --- | --- |
| 1 | **圖磚** — 一個 `.pmtiles` 檔 | 自己切出來，或下載示範檔 |
| 2 | **樣式** — 一個 `.json` 檔 | 本儲存庫的 `styles/`（共 6 種） |
| 3 | **元件** — 純 ESM，不需打包 | `packages/elements/src/` |

**不需要架伺服器。**靜態託管加上 HTTP Range 就是全部。

## 1. 取得圖磚

### A. 下載示範圖磚（最快）

```bash
gh release download demo-tiles-20260915 \
  --repo meta-taro/modern-map-japan \
  --pattern demo.pmtiles --output tiles/demo.pmtiles
```

**62.8 MB，只涵蓋大阪，zoom 0–15。**用來判斷你喜不喜歡這張地圖已經足夠，
**但不足以上線一個涵蓋其他地區的網站。**

### B. 自己切出來

從 [Protomaps](https://protomaps.com/) 的每日全球建置中，切出地球上任何範圍。
需要 [go-pmtiles](https://github.com/protomaps/go-pmtiles) 和磁碟空間。

```bash
git clone https://github.com/meta-taro/modern-map-japan
cd modern-map-japan && pnpm install
pnpm tiles:extract -- demo        # 也可以用 japan / kansai，或自己加一個區域
```

完整步驟在 [`docs/tiles/README.md`](../tiles/README.md)（日文）。
**只用公開資料與公開工具**，不需要帳號、金鑰或配額。

> **檔案大小很關鍵。**單一檔案超過 100 MB 就放不進 GitHub Pages。
> 在考慮付錢架圖磚伺服器之前，**先縮小範圍或減少縮放層級**。

## 2. 選一個樣式

從 [`styles/`](../../styles/) 複製一個 `.json` 到你的頁面旁邊。

| 檔案 | 外觀 |
| --- | --- |
| `modern-dark.json` | 夜晚。預設 |
| `modern-light.json` | 白天。道路留白，只用寬度分層級 |
| `modern-ink.json` | 無彩色。黑白列印也不會糊成一團 |
| `modern-sand.json` | 暖色。接近紙本地圖 |
| `modern-neon.json` | 夜間霓虹。道路層級用**色相**區分，而非明度 |
| `modern-candy.json` | 日間粉彩。相同色相，用在明亮的一側 |

**這 6 種都只是提案，不是已核可的配色**（見 [`styles/README.md`](../../styles/README.md)）。

每個樣式都保留 `__TILES_URL__` 作為佔位符。**請不要把圖磚網址寫死進去**——
元件會在載入時替換，所以同一個樣式在任何環境都能用。

## 3. 複製元件

```bash
cp -r packages/elements/src/ your-site/elements/
```

**不需要打包步驟。**它們是純 ES 模組，除非你想要，否則打包工具不會介入。

## 4. 頁面

```html
<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.css">
<style>
  mmj-map { display: block; height: 70vh; }
</style>
</head>
<body>

<mmj-map
  tiles="./tiles/demo.pmtiles"
  style-url="./styles/modern-dark.json"
  center="135.5023,34.6937"
  zoom="12">
  <mmj-marker lnglat="135.4959,34.7024" popup="梅田"></mmj-marker>
</mmj-map>

<script src="https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.js"></script>
<script src="https://cdn.jsdelivr.net/npm/pmtiles@4.4.0/dist/pmtiles.js"></script>
<script type="module" src="./elements/index.js"></script>
</body>
</html>
```

`maplibre-gl` 和 `pmtiles` 由**你**用 `<script>` 載入。MMJ 不會把它們打包進去，
所以**版本由你掌握**。

`center` 是 `經度,緯度`——和 GeoJSON 同樣的順序，和口語習慣相反。

## 你的品牌色

大多數網站都有一個。你不該為了用它而去寫 180 行的樣式檔。

```html
<mmj-map tiles="..." style-url="./styles/modern-light.json" accent="#0A5FFF"></mmj-map>
```

`accent` 會套用在高速公路線條與車站圓圈的外框，並成為標記、叢集與自有 POI 的預設顏色。
**它不會重新塗滿整張地圖**——那樣做的話，陸地、水域、建築與道路就分不出來了。

如果要完全控制，就指定全部 24 個角色：

```html
<mmj-map tiles="..." style-url="./styles/modern-light.json" palette-url="./brand.json"></mmj-map>
```

這個檔案可以從 4 個顏色產生，不必手寫：

```bash
pnpm palette -- --land=#f7f9fb --water=#bfd7e8 --ink=#16202b --accent=#0a5fff --out=brand.json
```

詳見 [`tools/palette/README.md`](../../tools/palette/README.md)，
其中也說明了 **MCP 介面**，可以讓 AI agent 幫你產生配色。

## 姓名標示不是選配

底圖資料來自 OpenStreetMap，採用 **ODbL 1.0** 授權。
`© OpenStreetMap contributors` 必須留在畫面上。
元件一定會繪製它，而且**沒有提供關閉它的屬性**。

程式碼與樣式採用 MIT。你疊加在上面的自有資料仍然屬於你。
上線前請閱讀 [`LICENSES.md`](../../LICENSES.md)。

## 還沒有的東西

- **npm 套件。**尚未發佈。目前請直接複製檔案
- **代管的圖磚。**沒有 MMJ 的圖磚服務端點可以指。請自行託管你的檔案
- **路線規劃。**`<mmj-route>` 只會**繪製**你提供的路線，不會計算路線
- **中日文字形檔。**CJK 標籤使用瀏覽端自己的字型
  （`localIdeographFontFamily`），因此字形會隨裝置而異

## 更多

- [`docs/elements/README.md`](../elements/README.md) — 每個元件的所有屬性
- [`docs/styles/README.md`](../styles/README.md) — 樣式如何對照圖磚檢查
- [`docs/serving/README.md`](../serving/README.md) — 託管與 HTTP Range
- 線上示範：https://meta-taro.github.io/modern-map-japan/
