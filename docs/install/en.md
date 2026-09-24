# Install MMJ

> **The components are on npm.** Everything else you host yourself.
>
> ```bash
> pnpm add @mmj-map/elements
> ```
>
> **That gets you the components and nothing else.** There is no hosted tile endpoint and
> no hosted style: you still supply a `.pmtiles` file and a style JSON. That is the point —
> no API key, no per-view billing, no tile server to run.

A map needs three things. MMJ gives you the last two and shows you how to make the first.

**1. Tiles — the map data.** Roads, rivers, buildings and place names for one area of the
world, packed into **a single file** that you put on your web server like a photo or a PDF.
Ours are `.pmtiles`. A browser pulls only the few kilobytes it needs out of that file using
an ordinary HTTP range request — the same mechanism that lets you skip ahead in a video.
**This is the one piece you have to produce yourself**, because it is specific to the area
your site is about. A city is typically 10–60 MB.

**2. A style — how the map should look.** A JSON file saying rivers are this blue, motorways
are that thick, place names use this size at this zoom. **The same tiles look completely
different under a different style.** Six are in this repository; pick one.

**3. The components — the HTML tags.** `<mmj-map>` and friends. You write a tag, point it at
your tile file and your style file, and a map appears. No build step, no framework.

| | What | Where it comes from |
| --- | --- | --- |
| 1 | **Tiles** — one `.pmtiles` file | **You make this.** Cut it from a public planet build, or take our demo file |
| 2 | **A style** — one `.json` file | `styles/` in this repository (6 of them) |
| 3 | **The components** — plain ESM, no build step | npm, or copy `packages/elements/src/` |

**There is no server to run.** Static hosting plus HTTP Range requests is the whole thing.
If your site is already on GitHub Pages, Netlify, S3 or plain nginx, you are set — they all
serve range requests already.

## 1. Get tiles

### Option A — take the demo tiles (fastest)

```bash
gh release download demo-tiles-20260915 \
  --repo meta-taro/mmj-map \
  --pattern demo.pmtiles --output tiles/demo.pmtiles
```

**62.8 MB, Osaka only, zoom 0–15.** Good enough to see whether you like the map.
Not good enough to ship a site about anywhere else.

### Option B — build your own

Cut any area of the planet out of a [Protomaps](https://protomaps.com/) daily build.
You need [go-pmtiles](https://github.com/protomaps/go-pmtiles) and disk space.

```bash
git clone https://github.com/meta-taro/mmj-map
cd mmj-map && pnpm install
pnpm tiles:extract -- hanoi       # any region name from tools/tiles/manifest.json
```

**Three worked examples.** All three were cut on 2026-09-24 from the same planet build,
on a laptop, in well under a minute each. The numbers are measured, not estimated.

| Region | Command | Size | Range requests | Labels |
| --- | --- | --- | --- | --- |
| **Osaka** | `pnpm tiles:extract -- demo` | 62.8 MB | — | default (Japanese) |
| **Hanoi** | `pnpm tiles:extract -- hanoi` | **10.9 MB** | 45 | `lang="vi"` |
| **New York** | `pnpm tiles:extract -- newyork` | **21.2 MB** | 41 | `lang="en"` |

Osaka is the demo file, and its region is a polygon rather than a box — nationwide
overview at low zoom plus street detail only around the city, so it stays under the
GitHub Pages file limit. Hanoi and New York are plain boxes, which is what you will
normally write.

`lang` is an attribute on the tag, not a different tile file or a different style:

```html
<mmj-map tiles="./tiles/hanoi.pmtiles" style-url="./styles/modern-dark.json"
         center="105.8520,21.0285" zoom="13" lang="vi"></mmj-map>
```

**Without it you get our default, which prefers Japanese names** and will label Hanoi
「ハノイ」 to a Vietnamese reader. Measured in the Hanoi extract (one zoom-10 tile):
`name:en` 45, `name:ko` 29, `name:zh-Hant` 28, `name:zh-Hans` 28, **`name:vi` 27**.
New York is the opposite case — its features already carry Latin `name` values, so
`lang="en"` mainly stops the handful of Japanese translations from showing through.

Four more regions are already defined, and take the same command:

| Region | Command | `lang` |
| --- | --- | --- |
| Seoul | `pnpm tiles:extract -- seoul` | `ko` |
| Taipei | `pnpm tiles:extract -- taipei` | `zh-Hant` |
| Shanghai | `pnpm tiles:extract -- shanghai` | `zh-Hans` |
| Singapore | `pnpm tiles:extract -- singapore` | `en` |

**Your own area is one entry in `tools/tiles/manifest.json`** — a name, a bounding box in
`[west, south, east, north]` order, and a maximum zoom. Nothing else.

The full walkthrough is in [`docs/tiles/README.md`](../tiles/README.md) (Japanese).
**Public data and public tools only** — no account, no key, no quota.

> **Size matters.** A single file over 100 MB will not fit on GitHub Pages.
> Cut a smaller area or fewer zoom levels rather than paying for a tile server.

## 2. Pick a style

Copy one `.json` from [`styles/`](../../styles/) next to your page.

| File | What it looks like |
| --- | --- |
| `modern-dark.json` | Night. The default |
| `modern-light.json` | Day. White roads, hierarchy by width alone |
| `modern-ink.json` | Greyscale. Survives a black-and-white printer |
| `modern-sand.json` | Warm. Closer to a paper map |
| `modern-neon.json` | Night neon. Road hierarchy by **hue**, not lightness |
| `modern-candy.json` | Daylight pastel. The same hues on the light side |

**These six are proposals, not an approved palette.** See [`styles/README.md`](../../styles/README.md).

Every style keeps `__TILES_URL__` as a placeholder. **Do not bake your tile URL into it** —
the component substitutes it at load time, so the same style works in every environment.

## 3. Get the components

```bash
pnpm add @mmj-map/elements
```

Or copy them — they are plain ES modules and there is **no build step**, so either works:

```bash
cp -r packages/elements/src/ your-site/elements/
```

The examples below use the copied path (`./elements/index.js`). If you installed from npm,
point at `node_modules/@mmj-map/elements/src/index.js` or let your bundler resolve
`@mmj-map/elements`.

## 4. The page

```html
<!doctype html>
<html lang="en">
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
  <mmj-marker lnglat="135.4959,34.7024" popup="Umeda"></mmj-marker>
</mmj-map>

<script src="https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.js"></script>
<script src="https://cdn.jsdelivr.net/npm/pmtiles@4.4.0/dist/pmtiles.js"></script>
<script type="module" src="./elements/index.js"></script>
</body>
</html>
```

`maplibre-gl` and `pmtiles` are loaded by **you**, with `<script>` tags. MMJ does not bundle them,
so you stay in control of the versions.

`center` is `longitude,latitude` — the same order as GeoJSON, not the order you say out loud.

## Your brand colour

Most sites have one. You should not have to write a 180-line style file to use it.

```html
<mmj-map tiles="..." style-url="./styles/modern-light.json" accent="#0A5FFF"></mmj-map>
```

`accent` lands on the motorway line and the station ring, and becomes the default colour for
markers, clusters and your own POIs. **It does not repaint the whole map** — do that and land,
water, buildings and roads stop being distinguishable.

For full control, specify all 24 roles:

```html
<mmj-map tiles="..." style-url="./styles/modern-light.json" palette-url="./brand.json"></mmj-map>
```

You can generate that file from four colours instead of writing it by hand:

```bash
pnpm palette -- --land=#f7f9fb --water=#bfd7e8 --ink=#16202b --accent=#0a5fff --out=brand.json
```

See [`tools/palette/README.md`](../../tools/palette/README.md), which also documents an MCP
server so an agent can build palettes for you.

## Attribution is not optional

The base data is OpenStreetMap, under **ODbL 1.0**. `© OpenStreetMap contributors` must stay
visible on screen. The component renders it and **gives you no attribute to switch it off**.

The code and the styles are MIT. Your own data layered on top stays yours.
Read [`LICENSES.md`](../../LICENSES.md) before you ship.

## What is not ready

- **Hosted tiles.** There is no MMJ tile endpoint to point at. You host your own file
- **Routing.** `<mmj-route>` *draws* a route you supply; it does not compute one
- **Japanese glyph files.** CJK labels use the viewer's own fonts
  (`localIdeographFontFamily`), so letterforms vary by device

## More

- [`docs/elements/README.md`](../elements/README.md) — every attribute of every component
- [`docs/styles/README.md`](../styles/README.md) — how the styles are checked against the tiles
- [`docs/serving/README.md`](../serving/README.md) — hosting and HTTP Range
- Live demo: https://meta-taro.github.io/mmj-map/
