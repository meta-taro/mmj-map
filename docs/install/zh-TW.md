# 安裝 MMJ

> ⚠️ **本頁為機器翻譯，尚未經母語者校閱。**
> 以 [`en.md`](en.md)（英文）為準；若有出入，以英文版為正。
> 歡迎提交修正。
>
> **Machine-translated. No native speaker has reviewed this page.**
> [`en.md`](en.md) is authoritative. Corrections welcome.

> **元件已發佈到 npm。**其餘部分由你自行託管。
>
> ```bash
> pnpm add @mmj-map/elements
> ```
>
> **這只會給你元件，不包含其他東西。**沒有代管的圖磚端點，也沒有代管的樣式：
> `.pmtiles` 檔與樣式 JSON 仍需你自己準備。**這正是本專案的用意**——
> 不需 API 金鑰、不按瀏覽次數計費、不必架圖磚伺服器。

一張地圖需要三樣東西。MMJ 提供後兩樣，並告訴你第一樣怎麼做。

**1. 圖磚 — 地圖的內容。** 某一塊地區的道路、河川、建築與地名，裝進**一個檔案**，
像放照片或 PDF 一樣放到自己的伺服器上。副檔名是 `.pmtiles`，瀏覽器只會用一般的
HTTP 範圍請求（和影片快轉所用的機制相同）**取出其中需要的那幾 KB**。
**只有這一樣要你自己準備**，因為它隨著網站涵蓋的地區而不同。一座城市大約 10〜60 MB。

**2. 樣式 — 地圖的長相。** 一個 JSON 檔，寫明河川是哪種藍、高速公路多粗、
地名從哪個縮放層級開始用多大。**同樣的圖磚換一個樣式，看起來就是另一張地圖。**
本儲存庫裡有 6 種，挑一種即可。

**3. 元件 — HTML 標籤。** 也就是 `<mmj-map>` 等等。寫一個標籤，指向上面兩個檔案，
地圖就出現了。不需要打包工具，也不需要框架。

| | 是什麼 | 從哪裡來 |
| --- | --- | --- |
| 1 | **圖磚** — 一個 `.pmtiles` 檔 | **只有這個要自己做。**從公開的全球建置切出，或下載示範檔 |
| 2 | **樣式** — 一個 `.json` 檔 | 本儲存庫的 `styles/`（共 6 種） |
| 3 | **元件** — 純 ESM，不需打包 | npm，或複製 `packages/elements/src/` |

**不需要架伺服器。**靜態託管加上 HTTP Range 就是全部。

## 1. 取得圖磚

### A. 下載示範圖磚（最快）

```bash
gh release download demo-tiles-20260915 \
  --repo meta-taro/mmj-map \
  --pattern demo.pmtiles --output tiles/demo.pmtiles
```

**62.8 MB，只涵蓋大阪，zoom 0–15。**用來判斷你喜不喜歡這張地圖已經足夠，
**但不足以上線一個涵蓋其他地區的網站。**

### B. 自己切出來

從 [Protomaps](https://protomaps.com/) 的每日全球建置中，切出地球上任何範圍。
需要 [go-pmtiles](https://github.com/protomaps/go-pmtiles) 和磁碟空間。

```bash
git clone https://github.com/meta-taro/mmj-map
cd mmj-map && pnpm install
pnpm tiles:extract -- hanoi       # tools/tiles/manifest.json 裡的任一區域名稱
```

**三個實例。** 三者都在 2026-09-24 從同一個全球建置切出，在筆電上**各花不到一分鐘**。
數字是實測值，不是估計值。

| 區域 | 指令 | 大小 | Range 次數 | 標籤 |
| --- | --- | --- | --- | --- |
| **大阪** | `pnpm tiles:extract -- demo` | 62.8 MB | — | 預設（日文） |
| **河內** | `pnpm tiles:extract -- hanoi` | **10.9 MB** | 45 | `lang="vi"` |
| **紐約** | `pnpm tiles:extract -- newyork` | **21.2 MB** | 41 | `lang="en"` |

大阪是示範用的檔案，**以多邊形而非方框切出**（低縮放層級涵蓋全日本，街道細節只在市中心），
為的是不超過 GitHub Pages 的單檔上限。河內與紐約是單純的方框，**你通常會寫的是這種**。

`lang` 是標籤上的屬性，**不需要另外準備圖磚或樣式**：

```html
<mmj-map tiles="./tiles/hanoi.pmtiles" style-url="./styles/modern-dark.json"
         center="105.8520,21.0285" zoom="13" lang="vi"></mmj-map>
```

**不寫就會用預設值，而預設優先顯示日文名稱。**在河內的切出檔中實測（一張 z10 圖磚）:
`name:en` 45、`name:ko` 29、`name:zh-Hant` 28、`name:zh-Hans` 28、**`name:vi` 27**。
紐約則相反——地物本身就帶拉丁字母的 `name`，`lang="en"` 的作用是**擋掉少數日文翻譯**。

**另外四個區域已經定義好，用同一個指令即可取得：**

| 區域 | 指令 | `lang` |
| --- | --- | --- |
| 首爾 | `pnpm tiles:extract -- seoul` | `ko` |
| 台北 | `pnpm tiles:extract -- taipei` | `zh-Hant` |
| 上海 | `pnpm tiles:extract -- shanghai` | `zh-Hans` |
| 新加坡 | `pnpm tiles:extract -- singapore` | `en` |

**你自己的區域，只是 `tools/tiles/manifest.json` 裡的一個項目**——
一個名稱、一個依 `[西, 南, 東, 北]` 排列的方框、一個最大縮放層級。沒有別的了。

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

## 3. 取得元件

```bash
pnpm add @mmj-map/elements
```

也可以直接複製。它們是純 ES 模組且**不需要打包步驟**，兩種方式都行：

```bash
cp -r packages/elements/src/ your-site/elements/
```

下面的範例使用複製後的路徑（`./elements/index.js`）。若從 npm 安裝，
請指向 `node_modules/@mmj-map/elements/src/index.js`，或讓打包工具解析 `@mmj-map/elements`。

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

- **代管的圖磚。**沒有 MMJ 的圖磚服務端點可以指。請自行託管你的檔案
- **路線規劃。**`<mmj-route>` 只會**繪製**你提供的路線，不會計算路線
- **中日文字形檔。**CJK 標籤使用瀏覽端自己的字型
  （`localIdeographFontFamily`），因此字形會隨裝置而異

## 更多

- [`docs/elements/README.md`](../elements/README.md) — 每個元件的所有屬性
- [`docs/styles/README.md`](../styles/README.md) — 樣式如何對照圖磚檢查
- [`docs/serving/README.md`](../serving/README.md) — 託管與 HTTP Range
- 線上示範：https://meta-taro.github.io/mmj-map/
