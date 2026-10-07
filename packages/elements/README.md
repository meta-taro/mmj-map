# @mmj-map/elements

Web Components that put a real map on a page with plain HTML.
**No API key, no per-view billing, no tile server, no build step.**

> 日本語版は [README.ja.md](./README.ja.md) にあります（こちらが詳しい版です）。

[![Shops with photo cards on a map][shot-shops]][demo-shops]

<p align="center">
  <b><a href="https://meta-taro.github.io/mmj-map/">Open the live demo</a></b> ·
  <a href="https://meta-taro.github.io/mmj-map/shops.html">the page above</a> ·
  <a href="https://meta-taro.github.io/mmj-map/rain.html">a typhoon you can scrub through</a>
</p>

| | |
|---|---|
| [![A route through 3D buildings][shot-3d-route]][demo-3d-route]<br>**Directions with the buildings up.** Turn-by-turn callouts, and a photo at the corner where you turn. | [![A rain radar animation with a typhoon track][shot-rain]][demo-rain]<br>**Time-stepped overlays.** Rain radar, storm and gale areas, a forecast cone — twelve hours from PNG files. |

**Everything you see there is static files on GitHub Pages.** There is no backend behind
any of it.

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/maplibre-gl@6.12.0/dist/maplibre-gl.css">
<style>mmj-map { display: block; height: 70vh; }</style>

<mmj-map
  tiles="./tiles/japan.pmtiles"
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

## You host the data. This package only draws it.

`tiles` and `style-url` point at **files you put somewhere**. There is no delivery origin
behind this package, which is why there is no key and no metered billing. A single
[PMTiles](https://docs.protomaps.com/pmtiles/) archive on static hosting is enough —
the browser fetches byte ranges out of it over HTTP.

Need an archive? [`@mmj-map/tiles`](https://www.npmjs.com/package/@mmj-map/tiles) cuts one
for any bounding box on earth from public data, with no account:

```bash
npx @mmj-map/tiles extract osaka --bbox=135.4,34.6,135.6,34.8
```

## Elements

| Element | What it does |
| --- | --- |
| `<mmj-map>` | The map itself. Themes, 3D buildings, geolocation, URL hash, fullscreen |
| `<mmj-marker>` | One point with an optional popup |
| `<mmj-poi>` | Your own GeoJSON points, with optional rich cards and a linked list |
| `<mmj-cluster>` | Many points, grouped as you zoom out |
| `<mmj-route>` | A path with step-by-step callouts (it does **not** compute routes) |
| `<mmj-circle>` | A radius in real metres from a point |
| `<mmj-raster>` | A raster overlay — rainfall, hazard maps, aerial imagery |
| `<mmj-fill>` | Polygons shaded by a value — flood depth, ground type, intensity |

Every element is plain ESM. There is nothing to compile; copy `src/` if you prefer.

## Cards, without writing a UI

`<mmj-poi>` can build a card from your GeoJSON properties: photos, rating, tabs, opening
hours per weekday, labelled links. The open item is kept in `?shop=`, so a single place
can be shared as a link.

```html
<mmj-poi src="./data/shops.geojson"
         card-title="shop_name" card-images="photos" card-body="description"
         card-tabs="Menu:menu,Coupon:coupon,Hours:hours"></mmj-poi>
```

`card-live` re-fetches the parts that change over time when the card opens.
`card-rich` lets named fields contain HTML — off by default, and only the fields you name.

## Requirements

| | |
| --- | --- |
| MapLibre GL JS | `>=5` (peer dependency, optional) |
| pmtiles | `>=4` (peer dependency, optional) |
| Browser | WebGL2 is required by MapLibre 6 |

**MapLibre 6 ships ESM only.** `dist/maplibre-gl.js` (the UMD build) no longer exists, so
changing only the version number in an old `<script src=...>` line gives you a 404 and a
blank map. Use the `<script type="module">` form above, and take the namespace with
`import * as` — v6 has no default export, so a default import silently yields `undefined`.

## Attribution is not optional

The base data is OpenStreetMap under ODbL. The elements render
`© OpenStreetMap contributors` and **the attribution control cannot be removed**.
Keep it visible. See [LICENSES.md](https://github.com/meta-taro/mmj-map/blob/develop/LICENSES.md).

## Where to find things

| You want | Go to |
| --- | --- |
| **Every attribute, in one fetch** | <https://meta-taro.github.io/mmj-map/llms-full.txt> |
| An index plus a copy-paste starter | <https://meta-taro.github.io/mmj-map/llms.txt> |
| The same, offline | `node_modules/@mmj-map/elements/llms.txt` |
| What changed between versions | [CHANGELOG.md](./CHANGELOG.md) |
| Live examples of all of it | <https://meta-taro.github.io/mmj-map/> |
| The detailed Japanese docs | [README.ja.md](./README.ja.md) |

If you are handing this to an agent, hand it `llms-full.txt` rather than this page.

## License

MIT for the code. Map data is OpenStreetMap, ODbL — see the attribution section above.

<!--
  Images and demo links are defined here, in one place.

  Absolute URLs on purpose: npm resolves relative paths against nothing useful,
  and a relative image dies on the package page. They point at files the deploy
  regenerates, so swapping a screenshot replaces a file — not this README.

  Look at any screenshot before adding it. `venue.jpg` is deliberately unused:
  that area puts one company's facility names at the centre of the picture, and
  a promotional page implies an association that does not exist.
-->

[shot-shops]: https://raw.githubusercontent.com/meta-taro/mmj-map/develop/apps/demo/shots/shops.jpg
[shot-3d-route]: https://raw.githubusercontent.com/meta-taro/mmj-map/develop/apps/demo/shots/3d-route.jpg
[shot-rain]: https://raw.githubusercontent.com/meta-taro/mmj-map/develop/apps/demo/shots/rain.jpg

[demo-shops]: https://meta-taro.github.io/mmj-map/shops.html
[demo-3d-route]: https://meta-taro.github.io/mmj-map/3d-route.html
[demo-rain]: https://meta-taro.github.io/mmj-map/rain.html
