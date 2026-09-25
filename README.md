# MMJ

**M**odern **M**ap — a map you own. No API key, no per-view billing, no tile server to run.

> **Renamed to `mmj-map` on 2026-09-24** (D-025), matching the npm scope `@mmj-map`.
> `github.com/meta-taro/modern-map-japan` still redirects (301), but **GitHub Pages does
> not**: the old demo URL is a hard 404 (measured 2026-09-24). The demo now lives at
> <https://meta-taro.github.io/mmj-map/> — update any link you have shared.

> **Status: usable, early.** The components are on npm as
> [`@mmj-map/elements`](https://www.npmjs.com/package/@mmj-map/elements), the demo is live
> at <https://meta-taro.github.io/mmj-map/> (ten pages, all working) with **eight regions you
> can switch between** — Osaka, Hanoi, Ho Chi Minh City, New York, Singapore, Shanghai,
> Taipei, Seoul — and the install guide exists in five languages.
>
> **What is not done:** there are no hosted tiles — you cut your own, which is the point;
> there are no Japanese glyphs, so CJK labels fall back to the viewer's font and the
> letterforms change per machine; and the six styles are **proposals**, not an approved
> palette. See [`.claude/roadmap.md`](.claude/roadmap.md).

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
| **Learning how serving works** | **Some hosts answer `Range` with 200.** The map still draws, so you cannot see it — but **every tile pulls the whole archive**. MMJ ships a check for exactly this (`pnpm tiles:check-range`) |
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
