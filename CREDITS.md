# Credits

Almost nothing on this map was surveyed by us. This file names the work it stands on.

> 日本語版: [`CREDITS.ja.md`](CREDITS.ja.md)（この英語版が正）

**Listed here means "we depend on it" or "it is given back to the commons".** Nobody
listed has endorsed this project, reviewed it, or is affiliated with it.

## The map itself

- **[OpenStreetMap](https://www.openstreetmap.org/) contributors** — every road,
  building, river and place name in the base map. Hundreds of thousands of people, most
  of whom mapped the street they live on. Licensed **ODbL 1.0**; attribution must stay
  visible on screen (see [`LICENSES.md`](LICENSES.md)).
- **[OpenStreetMap Foundation](https://osmfoundation.org/)** — keeps the servers,
  the licence and the community running.

## The tools that make it usable

- **[Protomaps](https://protomaps.com/)** — daily planet builds and the
  [PMTiles](https://github.com/protomaps/PMTiles) format. A single file, served from
  static hosting, with no tile server. This project does not build a tile pipeline of
  its own because this one already exists.
- **[MapLibre](https://maplibre.org/)** — the renderer and the style specification.
  Everything visual in this repository is written against it.
- **[tippecanoe](https://github.com/felt/tippecanoe)**, **GDAL/OGR** and the rest of the
  open geospatial toolchain.

## Open data we can build on

- **[Microsoft Global ML Building Footprints](https://github.com/microsoft/GlobalMLBuildingFootprints)**
  — building outlines extracted from satellite imagery by machine learning and released
  under **CDLA-Permissive 2.0**, covering Japan among 225 regions. Under evaluation here
  as a buildings source.
- **[Overture Maps Foundation](https://overturemaps.org/)** — pooled base, buildings,
  divisions, transportation and places data, published under ODbL 1.0 and
  CDLA-Permissive 2.0 depending on the theme.

## Organisations that fund OpenStreetMap

Corporate members of the OpenStreetMap Foundation, by tier, as listed in September 2026.

| Tier | Members |
|---|---|
| Platinum | TomTom, Microsoft, Esri, Meta, Proton |
| Gold | Mapbox, Grab, Komoot |
| Silver | OpenCage, Geofabrik, Nextbillion.ai, Elastic, GraphHopper, Bolt, HOT, Regrid, QGIS, Calimoto, Mapy.com, Regione Marche |
| Bronze | Geotab, Krick.com, YellowMap, NextGIS, Mail.ru Maps, Init, Rinkai, Stadia Maps, SUSE, Verso, Interline Technologies, E-SMART, Landclan, mySociety, GB Consite, MapTiler, Data Center Map, Iphigénie, Maptoolkit, Yahoo Japan |

Around twenty more organisations support the foundation at supporter level. Membership
starts at €750 a year, which is within reach of a small company.

## Organisations that edit OpenStreetMap directly

Teams registered on the [organised editing](https://wiki.openstreetmap.org/wiki/Organised_Editing/Activities)
list, with the year they started.

| Organisation | Since | Scope |
|---|---|---|
| Apple | 2017 | global, general map improvement |
| Meta | 2017 | global, roads |
| Microsoft | 2017 | Oceania, Serbia, South America, the Caribbean — roads and buildings |
| Amazon | 2018 | United States, United Kingdom, Germany, United Arab Emirates — road network |
| Lyft | 2018 | California — roads and streets |
| Uber | — | pedestrian data, road geometry |
| Snap | 2021 | disputed boundaries |

**Several of these are not foundation members, and several members do not edit.** The
two lists overlap less than you would expect, which is why both are here.

## A note on the lists

Company names appear above because those companies fund or contribute to the commons
this project depends on, and that is worth saying out loud. It is not a ranking, not an
endorsement in either direction, and not a statement about their products.

Corrections are welcome — open an issue. The lists were read in September 2026 and will
go stale.
