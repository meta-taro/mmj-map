# @mmj-map/react

React components for [`@mmj-map/elements`](https://www.npmjs.com/package/@mmj-map/elements):
a self-hosted web map with **no API key, no per-view billing and no tile server**.

This package is a thin wrapper. The map itself stays a set of Web Components; this package only
renames props into attributes and passes events and values to the elements. It works with React 18 and 19.

Live demo: <https://meta-taro.github.io/mmj-map/react.html>

## Install

```sh
pnpm add @mmj-map/react maplibre-gl pmtiles
```

`<mmj-map>` reads MapLibre and pmtiles from `window`, so load them once before the map renders:

```js
import * as maplibregl from "maplibre-gl";
import * as pmtiles from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";

window.maplibregl = maplibregl;
window.pmtiles = pmtiles;
```

## Use

```jsx
import { MmjMap, MmjMarker, MmjRouteEditor } from "@mmj-map/react";

export function ShopMap({ shops, route, onRoute }) {
  return (
    <MmjMap
      tiles="https://tiles.example.com/japan.pmtiles"
      styleUrl="/styles/modern-dark.json"
      center={[135.4985, 34.7015]}
      zoom={15}
      style={{ height: 480 }}
      onMmjReady={(event) => console.log(event.detail.map)}
    >
      {shops.map((shop) => (
        <MmjMarker key={shop.id} lnglat={shop.lnglat} popup={shop.name} />
      ))}
      <MmjRouteEditor from="Station exit A2" to="Shop" value={route} onMmjRouteChange={(e) => onRoute(e.detail.geojson)} />
    </MmjMap>
  );
}
```

- **Attributes**: write them in camelCase (`styleUrl`) or as-is (`"style-url"`). `true` sets the attribute, `false` / `null` remove it, and `[lng, lat]` becomes `"lng,lat"`
- **Events**: `onMmjReady` listens to `mmj-ready`, `onMmjRouteChange` to `mmj-route-change`, and so on
- **Values**: `<MmjRouteEditor value>` and `<MmjPoi geocode>` are passed as properties. The editor's `value` is reassigned only when its content changes, so feeding `detail.geojson` straight back keeps the editor's undo history
- **Ref**: `ref` gives you the element. `ref.current.map` is the MapLibre map once `onMmjReady` has fired
- **SSR**: the elements are registered on the client only (they extend `HTMLElement`)

Components: `MmjMap` `MmjMarker` `MmjCircle` `MmjCluster` `MmjFill` `MmjPoi` `MmjRaster` `MmjTyphoon` `MmjRoute` `MmjRouteEditor`.
Every attribute and event is documented in the [elements reference](https://github.com/meta-taro/mmj-map/blob/develop/docs/elements/README.md).

## License

MIT. Map data © OpenStreetMap contributors (ODbL); keep the attribution visible.
