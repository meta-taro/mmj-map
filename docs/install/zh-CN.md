# 安装 MMJ

> ⚠️ **本页为机器翻译，尚未经母语者校对。**
> 以 [`en.md`](en.md)（英文）为准；如有出入，以英文版为正。
> 欢迎提交修正。
>
> **Machine-translated. No native speaker has reviewed this page.**
> [`en.md`](en.md) is authoritative. Corrections welcome.

> **组件已发布到 npm。**其余部分由你自行托管。
>
> ```bash
> pnpm add @mmj-map/elements
> ```
>
> **这只会给你组件，不包含其他东西。**没有托管的瓦片端点，也没有托管的样式：
> `.pmtiles` 文件与样式 JSON 仍需你自己准备。**这正是本项目的用意**——
> 不需 API 密钥、不按浏览次数计费、不必架瓦片服务器。

一张地图需要三样东西。MMJ 提供后两样，并告诉你第一样怎么做。

| | 是什么 | 从哪里来 |
| --- | --- | --- |
| 1 | **瓦片** — 一个 `.pmtiles` 文件 | 自己切出来，或下载示例文件 |
| 2 | **样式** — 一个 `.json` 文件 | 本仓库的 `styles/`（共 6 种） |
| 3 | **组件** — 纯 ESM，无需打包 | `packages/elements/src/` |

**不需要架服务器。**静态托管加上 HTTP Range 就是全部。

## 1. 获取瓦片

### A. 下载示例瓦片（最快）

```bash
gh release download demo-tiles-20260915 \
  --repo meta-taro/modern-map-japan \
  --pattern demo.pmtiles --output tiles/demo.pmtiles
```

**62.8 MB，仅覆盖大阪，zoom 0–15。**用来判断你喜不喜欢这张地图已经足够，
**但不足以上线一个覆盖其他地区的网站。**

### B. 自己切出来

从 [Protomaps](https://protomaps.com/) 的每日全球构建中，切出地球上任意范围。
需要 [go-pmtiles](https://github.com/protomaps/go-pmtiles) 和磁盘空间。

```bash
git clone https://github.com/meta-taro/modern-map-japan
cd modern-map-japan && pnpm install
pnpm tiles:extract -- demo        # 也可以用 japan / kansai，或自己加一个区域
```

完整步骤在 [`docs/tiles/README.md`](../tiles/README.md)（日文）。
**只用公开数据与公开工具**，不需要账号、密钥或配额。

> **文件大小很关键。**单个文件超过 100 MB 就放不进 GitHub Pages。
> 在考虑付费架瓦片服务器之前，**先缩小范围或减少缩放级别**。

## 2. 选一个样式

从 [`styles/`](../../styles/) 复制一个 `.json` 到你的页面旁边。

| 文件 | 外观 |
| --- | --- |
| `modern-dark.json` | 夜晚。默认 |
| `modern-light.json` | 白天。道路留白，只用宽度分层级 |
| `modern-ink.json` | 无彩色。黑白打印也不会糊成一团 |
| `modern-sand.json` | 暖色。接近纸质地图 |
| `modern-neon.json` | 夜间霓虹。道路层级用**色相**区分，而非明度 |
| `modern-candy.json` | 日间粉彩。相同色相，用在明亮的一侧 |

**这 6 种都只是提案，不是已批准的配色**（见 [`styles/README.md`](../../styles/README.md)）。

每个样式都保留 `__TILES_URL__` 作为占位符。**请不要把瓦片地址写死进去**——
组件会在加载时替换，所以同一个样式在任何环境都能用。

## 3. 获取组件

```bash
pnpm add @mmj-map/elements
```

也可以直接复制。它们是纯 ES 模块且**不需要打包步骤**，两种方式都行：

```bash
cp -r packages/elements/src/ your-site/elements/
```

下面的示例使用复制后的路径（`./elements/index.js`）。若从 npm 安装，
请指向 `node_modules/@mmj-map/elements/src/index.js`，或让打包工具解析 `@mmj-map/elements`。

## 4. 页面

```html
<!doctype html>
<html lang="zh-Hans">
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

`maplibre-gl` 和 `pmtiles` 由**你**用 `<script>` 加载。MMJ 不会把它们打包进去，
所以**版本由你掌握**。

`center` 是 `经度,纬度`——和 GeoJSON 同样的顺序，和口语习惯相反。

## 你的品牌色

大多数网站都有一个。你不该为了用它而去写 180 行的样式文件。

```html
<mmj-map tiles="..." style-url="./styles/modern-light.json" accent="#0A5FFF"></mmj-map>
```

`accent` 会作用在高速公路线条与车站圆圈的描边上，并成为标记、聚合与自有 POI 的默认颜色。
**它不会重新涂满整张地图**——那样做的话，陆地、水域、建筑与道路就分不出来了。

如果要完全控制，就指定全部 24 个角色：

```html
<mmj-map tiles="..." style-url="./styles/modern-light.json" palette-url="./brand.json"></mmj-map>
```

这个文件可以从 4 个颜色生成，不必手写：

```bash
pnpm palette -- --land=#f7f9fb --water=#bfd7e8 --ink=#16202b --accent=#0a5fff --out=brand.json
```

详见 [`tools/palette/README.md`](../../tools/palette/README.md)，
其中也说明了 **MCP 接口**，可以让 AI agent 帮你生成配色。

## 署名不是可选项

底图数据来自 OpenStreetMap，采用 **ODbL 1.0** 许可。
`© OpenStreetMap contributors` 必须留在画面上。
组件一定会绘制它，而且**没有提供关闭它的属性**。

代码与样式采用 MIT。你叠加在上面的自有数据仍然属于你。
上线前请阅读 [`LICENSES.md`](../../LICENSES.md)。

## 还没有的东西

- **托管的瓦片。**没有 MMJ 的瓦片服务端点可以指向。请自行托管你的文件
- **路径规划。**`<mmj-route>` 只会**绘制**你提供的路线，不会计算路线
- **中日文字形文件。**CJK 标签使用浏览端自己的字体
  （`localIdeographFontFamily`），因此字形会随设备而异

## 更多

- [`docs/elements/README.md`](../elements/README.md) — 每个组件的所有属性
- [`docs/styles/README.md`](../styles/README.md) — 样式如何对照瓦片检查
- [`docs/serving/README.md`](../serving/README.md) — 托管与 HTTP Range
- 在线示例：https://meta-taro.github.io/modern-map-japan/
