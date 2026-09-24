# MMJ

**M**odern **M**ap — a map you own. No API key, no per-view billing, no tile server to run.

> **Renamed to `mmj-map` on 2026-09-24** (D-025), matching the npm scope `@mmj-map`.
> `github.com/meta-taro/modern-map-japan` still redirects (301), but **GitHub Pages does
> not**: the old demo URL is a hard 404 (measured 2026-09-24). The demo now lives at
> <https://meta-taro.github.io/mmj-map/> — update any link you have shared.

> **Status: early.** The design is written down and the approach has been proven in a
> production site, but this repository is still being assembled. See
> [`.claude/roadmap.md`](.claude/roadmap.md) for what happens first.

## Why

Most Japanese web maps look the same, because most of them are the same map. The
alternatives each have a catch:

- **Commercial map APIs** need a key, bill per view, and put your budget on a graph that
  only goes up as your site succeeds.
- **The OpenStreetMap tile server** is not an option: its
  [Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) rules out
  commercial and heavy-traffic use. Plenty of sites use it anyway. That is a liability,
  not a plan.
- **Self-hosting a tile server** works, but now you operate a tile server.

So the map you can actually ship ends up being someone else's map, with someone else's
look, on someone else's meter.

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
- **UI parts** (marker, popup, cluster, your own POIs, routes) ship as Web Components.
  React and Vue wrappers are planned, not written.
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

- [`docs/tiles/README.md`](docs/tiles/README.md) — **build the base tiles yourself** (public data and public tools only; written in Japanese)
- [`PRINCIPLES.md`](PRINCIPLES.md) — what this project is for, how it chooses data, who is welcome
- [`CREDITS.md`](CREDITS.md) — the work this map stands on
- [`PRD.md`](PRD.md) — scope, and what we deliberately do not build
- [`.claude/roadmap.md`](.claude/roadmap.md) — phases
- [`.claude/decisions.md`](.claude/decisions.md) — decisions and the reasoning behind them
- [`docs/origin/`](docs/origin/) — the original proposal, in Japanese, unedited
- [`docs/install/`](docs/install/) — **how to put a map on your site** (English, 日本語, 繁體中文, 简体中文, Tiếng Việt)
- [`README.ja.md`](README.ja.md) — 日本語

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Issues in Japanese or English are both fine.
