/**
 * `@mmj-map/elements` の部品を、React から使う形にしたもの。
 *
 * ```jsx
 * import { MmjMap, MmjMarker } from "@mmj-map/react";
 *
 * <MmjMap tiles="/japan.pmtiles" styleUrl="/styles/modern-dark.json" center={[135.5, 34.69]} zoom={13}
 *         style={{ height: 400 }} onMmjReady={(e) => console.log(e.detail.map)}>
 *   {shops.map((s) => <MmjMarker key={s.id} lnglat={s.lnglat} popup={s.name} />)}
 * </MmjMap>
 * ```
 *
 * **本体は書き直さない。**部品はカスタム要素のままで、ここは名前の書き換えと受け渡しだけ
 * （フレームワークごとに本体を書くと、実装がずれていく）。
 */
import { createComponent } from "./create.js";

export const MmjMap = createComponent("mmj-map");
export const MmjMarker = createComponent("mmj-marker");
export const MmjCircle = createComponent("mmj-circle");
export const MmjCluster = createComponent("mmj-cluster");
export const MmjFill = createComponent("mmj-fill");
export const MmjPoi = createComponent("mmj-poi", ["geocode"]);
export const MmjRaster = createComponent("mmj-raster");
export const MmjTyphoon = createComponent("mmj-typhoon");
export const MmjRoute = createComponent("mmj-route");
export const MmjRouteEditor = createComponent("mmj-route-editor", ["value"]);

export { createComponent };
