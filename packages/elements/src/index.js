/**
 * 部品をまとめて登録する。
 *
 * ```html
 * <script src="https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.js"></script>
 * <script src="https://cdn.jsdelivr.net/npm/pmtiles@4.4.0/dist/pmtiles.js"></script>
 * <script type="module" src="/elements/index.js"></script>
 * ```
 *
 * **二重登録で落とさない。**同じページで 2 回読まれても、後勝ちにせず黙って通す。
 */
import { MmjCluster } from "./mmj-cluster.js";
import { MmjMap } from "./mmj-map.js";
import { MmjMarker } from "./mmj-marker.js";

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

export { MmjCluster, MmjMap, MmjMarker };
