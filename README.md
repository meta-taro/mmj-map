# modern-map-japan

A modern map for Japan — no API key, no per-view billing, no tile server to run.

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

- **Base tiles** come from [Protomaps](https://protomaps.com/) daily planet builds,
  cut to Japan and served as a single [PMTiles](https://github.com/protomaps/PMTiles)
  archive. We do not build a tile pipeline of our own.
- **Styles** are hand-written [MapLibre](https://maplibre.org/) styles designed for
  Japanese cartography — dense place names, mixed scripts, rail lines that carry their
  operator's own colours.
- **UI parts** (marker, popup, cluster, persistent layout) ship as Web Components, with
  thin React and Vue wrappers.
- **No server.** Static hosting plus HTTP Range requests is the whole deployment story.

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

- [`PRINCIPLES.md`](PRINCIPLES.md) — what this project is for, how it chooses data, who is welcome
- [`CREDITS.md`](CREDITS.md) — the work this map stands on
- [`PRD.md`](PRD.md) — scope, and what we deliberately do not build
- [`.claude/roadmap.md`](.claude/roadmap.md) — phases
- [`.claude/decisions.md`](.claude/decisions.md) — decisions and the reasoning behind them
- [`docs/origin/`](docs/origin/) — the original proposal, in Japanese, unedited
- [`README.ja.md`](README.ja.md) — 日本語

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Issues in Japanese or English are both fine.
