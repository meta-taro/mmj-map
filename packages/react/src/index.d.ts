/**
 * 型。**よく使う属性と出来事だけを名前で書き、残りは素通しにする**
 * （部品に属性を足した日に、型だけが遅れて書けなくならないように）。
 * 属性は `styleUrl` のように camelCase でも、`"style-url"` のままでも書ける。
 */
import type { CSSProperties, ForwardRefExoticComponent, ReactNode, RefAttributes } from "react";

type Attr = string | number | boolean | readonly (string | number)[] | null | undefined;
type Handler<D = unknown> = (event: CustomEvent<D>) => void;

interface Common {
  id?: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  /** 名前で書いていない属性・出来事（`onMmjVisible` など）も渡せる */
  [attributeOrEvent: string]: unknown;
}

export interface MmjMapProps extends Common {
  tiles: string;
  styleUrl: string;
  /** `[経度, 緯度]` か `"135.50,34.69"` */
  center?: Attr;
  zoom?: number | string;
  pitch?: number | string;
  hash?: boolean;
  accent?: string;
  paletteUrl?: string;
  lang?: string;
  locate?: boolean;
  fullscreen?: boolean;
  /** 地図ができた。`event.detail.map` は MapLibre の地図 */
  onMmjReady?: Handler<{ map: any }>;
  onMmjError?: Handler<{ message: string }>;
}

export interface MmjMarkerProps extends Common {
  lnglat: Attr;
  popup?: string;
  popupBody?: string;
  popupHref?: string;
  popupOpen?: boolean;
  color?: string;
  image?: string;
  draggable?: boolean;
  onMmjMarkerMove?: Handler<{ lng: number; lat: number }>;
}

export interface MmjRouteProps extends Common {
  src?: string;
  fit?: boolean;
  steps?: boolean;
  landmarks?: boolean;
  ends?: boolean;
  summary?: boolean;
  color?: string;
  stepKey?: string;
  onMmjRouteReady?: Handler;
}

export interface RouteChange {
  geojson: unknown;
  text: string;
  meters: number;
  minutes: number;
  points: number;
  steps: number;
  issues: { kind: "line" | "words" | "image"; message: string; count?: number }[];
  reason: string;
}

export interface MmjRouteEditorProps extends Common {
  from?: string;
  to?: string;
  src?: string;
  fit?: boolean;
  color?: string;
  stepKey?: string;
  /**
   * 経路（GeoJSON の物か、その文字）。**中身が変わったときだけ**部品へ入れ直す。
   * 受け取った `geojson` をそのまま戻しても、「1 つ戻す」の履歴は消えない
   */
  value?: unknown;
  onMmjRouteChange?: Handler<RouteChange>;
}

export interface MmjClusterProps extends Common {
  src?: string;
  onMmjClusterPoint?: Handler;
}

export interface MmjPoiProps extends Common {
  src?: string;
  /** 住所から位置を引く関数など（属性ではなく値で渡す） */
  geocode?: unknown;
  onMmjPoiClick?: Handler;
}

type Component<P> = ForwardRefExoticComponent<P & RefAttributes<HTMLElement & { [member: string]: any }>>;

export declare const MmjMap: Component<MmjMapProps>;
export declare const MmjMarker: Component<MmjMarkerProps>;
export declare const MmjCircle: Component<Common>;
export declare const MmjCluster: Component<MmjClusterProps>;
export declare const MmjFill: Component<Common>;
export declare const MmjPoi: Component<MmjPoiProps>;
export declare const MmjRaster: Component<Common>;
export declare const MmjTyphoon: Component<Common>;
export declare const MmjRoute: Component<MmjRouteProps>;
export declare const MmjRouteEditor: Component<MmjRouteEditorProps>;

export declare function createComponent(tagName: string, propertyNames?: readonly string[]): Component<Common>;
