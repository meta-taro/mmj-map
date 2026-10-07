# MMJ

**M**odern **M**ap — **put a real map on your page, and own it.**
No API key. No per-view billing. No tile server to run.

[![A typhoon approaching Japan, drawn over a rain-radar animation][shot-rain]][demo-rain]

<p align="center">
  <b><a href="https://meta-taro.github.io/mmj-map/">Open the live demo</a></b> ·
  <a href="https://meta-taro.github.io/mmj-map/rain.html">press play on the one above</a> ·
  <a href="docs/install/en.md">Install guide</a> ·
  <a href="README.ja.md">日本語</a>
</p>

> Everything on this page is **static files on GitHub Pages**. There is no backend behind
> any of it — including the animation above.

## See it working

| | |
|---|---|
| [![Shops with photo cards on a map][shot-shops]][demo-shops]<br>**Your own places, with real cards** — photos, ratings, opening hours per weekday, tabs. The open one lives in `?shop=`, so a single place is a shareable link. | [![A route through 3D buildings in Osaka][shot-3d-route]][demo-3d-route]<br>**Walking directions with the buildings up** — turn-by-turn callouts, and a photo at the corner where you turn. Buildings tilt up and lie back down on a running map. |
| [![Six hand-written map styles side by side][shot-themes]][demo-themes]<br>**Six hand-written styles**, or hand it your brand colour and it lands on the motorways and station rings — not on the whole map, which would make it unreadable. | [![Points grouped into clusters that split apart as you zoom][shot-cluster]][demo-cluster]<br>**Thousands of points without a mess** — they group as you pull back and come apart as you move in. Your GeoJSON, read straight from your own hosting. |

Eight regions you can switch between — Osaka, Hanoi, Ho Chi Minh City, New York, Singapore,
Shanghai, Taipei, Seoul — and seventeen demo pages in all.

## When this is the right tool

### "Our map bill grows with traffic we do not control"

You are billed per view. The better your site does, the worse the graph looks, and the
number is not yours to cap. MMJ has **no meter** — you cut the area you care about once
(10–60 MB for a city, under a minute) and serve it as a file. **Traffic costs what your
static host charges for a file, which for most sites is nothing.**

### "The venue has no signal"

A hall, a basement, a festival site, a disaster drill. **GPS still works without a
network** — positioning comes from satellites, not from your carrier. The only missing
piece was that the map itself was behind a network call.

One of the demo pages keeps working with the network switched off: 1.9 MB of tiles +
562 KB of glyphs + 1.15 MB of renderer. **That works because a venue is small** — the
whole of Japan could not do the same.

### "We need our own points on a map, not someone else's"

Your shops, your facilities, your inspection sites. You want them styled like your site,
labelled in your users' language, with your photos in the popup — and you do not want to
publish your point list to anyone to get that.

**Your data never leaves your hosting.** The components read the GeoJSON you serve, and
MMJ has no delivery origin to send it to.

## Try it

**One command and a copy-paste.** Cut your own town, then put it on a page.

```bash
npx @mmj-map/tiles extract osaka --bbox=135.4,34.6,135.6,34.8
```

```
Cutting from the current upstream build 20260924.pmtiles (basemap 4.15.2).
Done: ./tiles/osaka.20260924.pmtiles
9.8 MB — fits on GitHub Pages (100 MB per file, 1 GB per site).
```

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/maplibre-gl@6.12.0/dist/maplibre-gl.css">
<style>mmj-map { display: block; height: 70vh; }</style>

<mmj-map
  tiles="./tiles/osaka.20260924.pmtiles"
  style-url="./styles/modern-dark.json"
  center="135.5023,34.6937"
  zoom="12">
  <mmj-marker lnglat="135.4959,34.7024" popup="Umeda"></mmj-marker>
</mmj-map>

<script type="module">
  import * as maplibregl from "https://cdn.jsdelivr.net/npm/maplibre-gl@6.12.0/dist/maplibre-gl.mjs";
  window.maplibregl = maplibregl;
</script>
<script src="https://cdn.jsdelivr.net/npm/pmtiles@4.4.0/dist/pmtiles.js"></script>
<script type="module" src="./elements/index.js"></script>
```

`center` is `longitude,latitude` — the same order as GeoJSON, not the order you say out loud.

**Eight elements** ship in the package: `mmj-map`, `mmj-marker`, `mmj-poi`, `mmj-cluster`,
`mmj-route`, `mmj-circle`, `mmj-raster`, `mmj-fill`. All of them are plain ESM; there is
nothing to compile.

| | |
|---|---|
| Components | [`@mmj-map/elements`](https://www.npmjs.com/package/@mmj-map/elements) |
| Tile extractor | [`@mmj-map/tiles`](https://www.npmjs.com/package/@mmj-map/tiles) |
| Full install guide | [English](docs/install/en.md) · [日本語](docs/install/ja.md) · [繁體中文](docs/install/zh-TW.md) · [简体中文](docs/install/zh-CN.md) · [Tiếng Việt](docs/install/vi.md) |
| Every attribute, in one fetch | <https://meta-taro.github.io/mmj-map/llms-full.txt> |

> **Status: usable, early.** There are **no hosted tiles — you cut your own, which is the
> point**. There are no Japanese glyphs, so CJK labels fall back to the viewer's font and
> the letterforms change per machine. The six styles are **proposals**, not an approved
> palette. See [`PRD.md`](PRD.md) for scope.

## Why

**There are two complaints about maps, and they point in different directions.**

- **Commercial map APIs need a key.** They are not free to use freely. You are billed per
  view, and what you may put on the map is decided by someone else's terms.
- **The OpenStreetMap map is not good to look at as it comes.** The data is free. **The
  default appearance is not.**

**And almost nobody needs the whole planet.** You need the area your site is about, and
**that you can hold yourself** — 10–60 MB for a city, under a minute to cut.
**Because you are not serving the world, you do not need a server.**

MMJ solves those three at once. **We borrow the data and own the presentation.**

The remaining alternatives each have a catch:

- **Commercial map APIs** bill per view, and put your budget on a graph that only goes up
  as your site succeeds.
- **The OpenStreetMap tile server** is not an option: its
  [Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) rules out
  commercial and heavy-traffic use. Plenty of sites use it anyway. That is a liability,
  not a plan.
- **Self-hosting a tile server** works, but now you operate a tile server.

So the map you can actually ship ends up being someone else's map, with someone else's
look, on someone else's meter.

> **Saying the default look is not good is not a complaint about the commons.**
> This map stands on the people and organisations who survey, fund and edit
> OpenStreetMap. **[`CREDITS.md`](CREDITS.md) names them.** Owning the presentation is
> how we take that part on ourselves.

### "Then join the community and fix it"

**That is a fair objection, and for the data it is simply correct.** If a road is wrong,
the place to fix it is OpenStreetMap, not this repository.

But **the look is not the kind of thing you fix upstream.** The default OSM style has to
answer **every use on earth with one design**. Anything that answers everything is
optimal for nothing. That is a difference in role, not a defect.

What MMJ carries is **the part that should never go upstream**:

- **Your site's brand colour** — that is your colour, not the map's
- **Labels in the local language** — the right answer depends on who is reading
- **Your own POIs** — your data, not the map's data
- **A photo at the turn in a route** — "left at this convenience store."
  **It means nothing to anyone not walking that route**

Every one of those is **one site's business, and none of it is data**.
**Data improvements go to OSM. Presentation belongs to each site.** That is the line.

## What you skip

**Starting from zero, four things stand between you and one working map.** MMJ removes them.

| What you skip | What it costs you otherwise |
|---|---|
| **Working out the rights** | The OSM [Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) **rules out commercial and heavy-traffic use**, and dropping the ODbL attribution from the screen is a breach |
| **Learning how serving works** | **Some hosts answer `Range` with 200.** The map still draws, so you cannot see it — but **every tile pulls the whole archive**. MMJ ships a check for exactly this (`npx @mmj-map/tiles check-range <url>`) |
| **Learning how upstream works** | Daily builds **disappear**. Ours **vanished nine days after we pinned it** (measured 2026-09-24). Without a pin and a fallback, one morning you simply cannot cut tiles any more |
| **Hunting for a look** | Six hand-written styles. **That whole search is gone** |

There are more, and they are all the kind you find out about by stepping on them.

- **`name:zh` does not exist** — it is `zh-Hant` / `zh-Hans`. Guessing gets you nothing.
  MMJ switches with one attribute (`lang`)
- **One archive holds only part of the planet.** Outside it, an empty screen is **correct** —
  and **indistinguishable from broken**. MMJ paints the tiles that came back empty

**You could work all of this out. The problem is that you work it out afterwards.**

## What this is

**Data we borrow. Presentation we own.**

- **Base tiles** come from [Protomaps](https://protomaps.com/) daily **planet** builds,
  cut to whatever area you need and served as a single
  [PMTiles](https://github.com/protomaps/PMTiles) archive.
  We do not build a tile pipeline of our own.
- **Styles** are hand-written [MapLibre](https://maplibre.org/) styles, and they are
  **per region**. The first set is written for Japanese cartography — dense place names,
  mixed scripts, rail lines that carry their operator's own colours.
  **The tools are global; the styling is local.** That distinction is the whole design.
- **UI parts** (marker, popup, cluster, your own POIs, routes, overlays) ship as Web
  Components. React and Vue wrappers are planned, not written.
- **No server.** Static hosting plus HTTP Range requests is the whole deployment story.

## Where it works

**Anywhere Protomaps covers, which is the planet.** Nothing in the tooling is
Japan-specific: point the extractor at a bounding box or a polygon and you get tiles.

Japan is simply the region whose styling is furthest along. Taiwan, Shanghai, Vietnam and
Singapore are next (D-018). **What is per-region is the style, not the code.**

## What this is not

- Not a tile server, and not a fork of one.
- Not a rendering engine. MapLibre does that.
- Not a geocoder, a router, or a place database.
- **Not a way to cut your existing maps bill.** If your coordinates come from a provider
  whose terms require displaying them on that provider's map, swapping the base map is
  not something you are free to do. Check before you plan around it.

## Licence

**Two licences, and they do not overlap.**

| Part | Licence |
|---|---|
| Code, styles, UI components | **MIT** (`LICENSE`) |
| Base map data (OpenStreetMap) | **ODbL 1.0** — attribution required on screen |

Read [`LICENSES.md`](LICENSES.md) before you ship. Short version: keep
`© OpenStreetMap contributors` visible, and your own data layered on top stays yours.

## Documentation

- [`docs/install/`](docs/install/) — **how to put a map on your site** (English, 日本語, 繁體中文, 简体中文, Tiếng Việt)
- [`docs/tiles/README.md`](docs/tiles/README.md) — **build the base tiles yourself** (public data and public tools only; written in Japanese)
- [`docs/elements/README.md`](docs/elements/README.md) — every attribute of every component
- [`PRINCIPLES.md`](PRINCIPLES.md) — what this project is for, how it chooses data, who is welcome
- [`CREDITS.md`](CREDITS.md) — the work this map stands on
- [`PRD.md`](PRD.md) — scope, and what we deliberately do not build
- [`docs/decisions.md`](docs/decisions.md) — decisions and the reasoning behind them
- [`docs/origin/`](docs/origin/) — the original proposal, in Japanese, unedited
- [`README.ja.md`](README.ja.md) — 日本語

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Issues in Japanese or English are both fine.

<!--
  Every image and demo link used above is defined here, in one place.

  The images are absolute URLs on purpose: this file is also read on npm and in
  forks, where a relative path resolves somewhere else and the image dies.
  They point at files the deploy regenerates, so swapping a screenshot means
  replacing the file — not editing this README.

  Before adding a screenshot, look at it. The demo data is fictional, but a shot
  can still carry a name that should not be in a public, promotional page.
  `venue.jpg` is deliberately not used here: that area puts one company's
  facility names at the centre of the picture, and a promotional page implies an
  association that does not exist (the same reasoning is recorded in `og.html`).
-->

[shot-rain]: https://raw.githubusercontent.com/meta-taro/mmj-map/develop/apps/demo/shots/rain.jpg
[shot-shops]: https://raw.githubusercontent.com/meta-taro/mmj-map/develop/apps/demo/shots/shops.jpg
[shot-3d-route]: https://raw.githubusercontent.com/meta-taro/mmj-map/develop/apps/demo/shots/3d-route.jpg
[shot-themes]: https://raw.githubusercontent.com/meta-taro/mmj-map/develop/apps/demo/shots/themes.jpg
[shot-cluster]: https://raw.githubusercontent.com/meta-taro/mmj-map/develop/apps/demo/shots/cluster.jpg

[demo-rain]: https://meta-taro.github.io/mmj-map/rain.html
[demo-shops]: https://meta-taro.github.io/mmj-map/shops.html
[demo-3d-route]: https://meta-taro.github.io/mmj-map/3d-route.html
[demo-themes]: https://meta-taro.github.io/mmj-map/themes.html
[demo-cluster]: https://meta-taro.github.io/mmj-map/cluster.html
