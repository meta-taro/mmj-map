# Principles

What this project is for, how it chooses what it is built on, and who is welcome to
work on it.

This is a statement of intent. It is not a set of rules to be enforced against anyone.

## 1. What we promise

- **No API key.** Nothing here asks the reader of your map to be authenticated, and
  nothing asks you to register before you can build.
- **No per-view billing.** Traffic to your site is not an invoice.
- **No obligation to display our data on someone else's map.** What you build with this
  is yours to place where you like.
- **You can host it yourself.** Static files and HTTP Range requests are the whole
  deployment story. There is no server component you are required to run, and no service
  of ours that can be withdrawn.
- **The look is yours to change.** Styles are readable JSON, licensed MIT, meant to be
  edited. A map you cannot restyle is someone else's map.

## 2. How we choose data

We choose sources by **condition**, not by who publishes them. A source qualifies when
all three hold:

- **Published.** Anyone can download it, not only partners or customers.
- **Licensed in writing.** The licence is named and its terms are readable before you
  commit to it.
- **Reproducible.** Anyone can fetch the same snapshot and get the same result.

What follows from that, as of today:

| Source | Licence | Qualifies |
|---|---|---|
| OpenStreetMap (via Protomaps planet builds) | ODbL 1.0 | yes — current base |
| Overture Maps | ODbL 1.0 / CDLA-Permissive 2.0 (varies by theme) | yes |
| Microsoft Global ML Building Footprints | CDLA-Permissive 2.0 | yes — under evaluation for buildings |
| Geospatial data that is extracted but never published | — | no |

**The last row is a condition, not a boycott.** It applies to any holder of unpublished
data, including ourselves. If a source is published tomorrow under a licence we can
read, it qualifies tomorrow.

## 3. Who we credit

This map stands on work almost none of which is ours. [`CREDITS.md`](CREDITS.md) names
it: the people who survey and edit OpenStreetMap, the projects that make the data
usable, and the organisations that fund the foundation or run mapping teams of their own.

**Individual mappers and corporate teams are listed the same way.** A road traced by
one person on a weekend and a road imported by a company's pipeline are the same road
to the renderer, and neither is worth less here.

## 4. Who is welcome

**Anyone. We do not distinguish contributors by who employs them.**

Section 2 is about data, not people. A condition on data sources says nothing about who
may open an issue or send a pull request. If you work for a company whose data this
project cannot use, your patch is still judged as a patch.

There is no contributor licence agreement, no corporate approval step, and no list of
organisations whose contributions are unwelcome. There will not be one.

## 5. This is where we stand today

Measured in **September 2026**:

- **Funding the OpenStreetMap Foundation** as corporate members: TomTom, Microsoft,
  Esri, Meta and Proton at the top tier, with around fifty more below it — Mapbox, Grab,
  Komoot, Geofabrik, GraphHopper, Bolt, HOT, QGIS, MapTiler, Yahoo Japan and others.
- **Running organised editing teams** that edit OpenStreetMap directly: Apple (since
  2017, global), Meta (2017, roads), Microsoft (2017, roads and buildings), Amazon
  (2018), Lyft (2018), Uber, Snap (2021).
- **Google appears on neither list**, and does not publish the geospatial data it
  extracts.

That is the state of the world we are building in, not a verdict on anyone. **If it
changes, this document changes.** It is written down here, in one file, with a date on
it, precisely so that it can be revised without touching anything else in the
repository. No code and no style in this project reads this file.

## Background

Three facts that shaped the decisions above. They are stated without adjectives on
purpose; check them yourself rather than taking them from us.

1. Commercial map platforms generally require an API key and bill per map load, so the
   cost of a map rises with the success of the site that carries it.
2. Some platform terms require that content obtained from their place data be displayed
   on that platform's own map. Where that applies, **the base map is not a free choice**,
   and replacing it is not something you can do unilaterally. Read the current terms of
   whatever you use before planning around this.
3. Several large companies publish geospatial data they extracted at their own expense,
   or contribute it back to OpenStreetMap directly. This project exists because they do.

## See also

- [`CREDITS.md`](CREDITS.md) — who this is built on
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how to take part
- [`LICENSES.md`](LICENSES.md) — what you must keep on screen
