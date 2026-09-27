/**
 * 部品をまとめて登録する。
 *
 * ```html
 * <script src="/vendor/maplibre-gl/maplibre-gl.js"></script>
 * <script src="/vendor/pmtiles/pmtiles.js"></script>
 * <script type="module" src="/elements/index.js"></script>
 * ```
 *
 * **二重登録で落とさない。**同じページで 2 回読まれても、後勝ちにせず黙って通す。
 */
import { MmjCluster } from "./mmj-cluster.js";
import { MmjMap } from "./mmj-map.js";
import { MmjMarker } from "./mmj-marker.js";
import { MmjPoi } from "./mmj-poi.js";
import { MmjRaster } from "./mmj-raster.js";
import { MmjRoute } from "./mmj-route.js";

/**
 * @param {string} name
 * @param {CustomElementConstructor} constructor
 */
function define(name, constructor) {
  if (!customElements.get(name)) customElements.define(name, constructor);
}

define("mmj-map", MmjMap);
define("mmj-marker", MmjMarker);
define("mmj-cluster", MmjCluster);
define("mmj-poi", MmjPoi);
define("mmj-raster", MmjRaster);
define("mmj-route", MmjRoute);

export { MmjCluster, MmjMap, MmjMarker, MmjPoi, MmjRaster, MmjRoute };
