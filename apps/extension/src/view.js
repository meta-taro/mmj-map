/**
 * Google マップの URL から「いま見ている場所」を読む。**ここは純粋関数。**
 *
 * ## 読むのは表示位置だけ（D-034）
 *
 * URL の `/@緯度,経度,縮尺z` は、**利用者が自分で動かした画面の位置**。
 * 店名（`/place/<名前>/`）とピン（`!3d…!4d…`）は **Google が持つ地点のデータ**で、
 * 写すと利用規約 2.2（中身を写さない）に触れる。だから読まない。
 *
 * 画面（DOM）も読まない。Google が画面を変えるたびに壊れるうえ、
 * 読めるものの大半が Google のデータだから。
 */

/** `@緯度,経度,縮尺z`。縮尺が `m`（航空写真）や `a`（3D・ストリートビュー）のものは別に扱う */
const VIEW = /\/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)([a-z])/;

/** `www.google.com` / `google.co.jp` / `maps.google.com` など。**名前に google を含むだけの別のサイトは通さない** */
const GOOGLE_HOST = /^(?:(?:www|maps)\.)?google\.(?:com|co\.[a-z]{2}|com\.[a-z]{2}|[a-z]{2})$/;

/** 小数 5 桁は約 1 m。これより細かく書いても、貼る人には読めないだけ */
const COORD_DIGITS = 5;

/** 短縮リンク。開くと本来の URL へ移るので、**移る前に押されたときだけ**ここへ来る */
const SHORT_LINK = /^(?:maps\.app\.goo\.gl|goo\.gl)$/;

/** `/maps` か `/maps/…`。`/mapsfoo` は別の頁 */
const MAPS_PATH = /^\/maps(?:\/|$)/;

/**
 * @typedef {{ ok: true, lng: number, lat: number, zoom: number }} View
 * @typedef {{ ok: false, reason: "not-google-maps" | "short-link" | "no-view" | "not-map-view" }} NoView
 */

/**
 * @param {string} href 開いているタブの URL
 * @returns {View | NoView} `zoom` は MMJ（MapLibre）の縮尺に直してある
 */
export function readGoogleView(href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return { ok: false, reason: "not-google-maps" };
  }
  if (SHORT_LINK.test(url.hostname)) return { ok: false, reason: "short-link" };
  const isMaps = url.hostname.startsWith("maps.") || MAPS_PATH.test(url.pathname);
  if (url.protocol !== "https:" || !GOOGLE_HOST.test(url.hostname) || !isMaps) {
    return { ok: false, reason: "not-google-maps" };
  }

  const match = VIEW.exec(url.pathname);
  if (match === null) return { ok: false, reason: "no-view" };
  if (match[4] !== "z") return { ok: false, reason: "not-map-view" };

  const lat = Number(match[1]);
  const lng = Number(match[2]);
  const zoom = Number(match[3]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || zoom > 22) return { ok: false, reason: "no-view" };

  return { ok: true, lng: round(lng, COORD_DIGITS), lat: round(lat, COORD_DIGITS), zoom: toMmjZoom(zoom) };
}

/**
 * Google の縮尺を MMJ の縮尺へ直す。
 *
 * Google は 256px の区画で縮尺を数え、MapLibre は 512px で数える。
 * **同じ範囲を出すには 1 引く。**引かないと、貼った地図が 2 倍に寄って見える。
 *
 * @param {number} googleZoom
 * @returns {number}
 */
export function toMmjZoom(googleZoom) {
  return Math.max(0, round(googleZoom - 1, 2));
}

/**
 * 見本の頁へ渡す場所。`?c=経度,緯度&z=縮尺`（MMJ の縮尺のまま渡す）。
 *
 * @param {{ lng: number, lat: number, zoom: number }} place
 * @returns {string} `?` から始まる問い合わせ
 */
export function toPreviewQuery({ lng, lat, zoom }) {
  return `?c=${lng},${lat}&z=${zoom}`;
}

/**
 * 見本の頁が受け取った場所を読む。**手で書き換えられた URL でも落とさない。**
 *
 * @param {string} search `location.search`
 * @returns {{ lng: number, lat: number, zoom: number } | null}
 */
export function readPreviewQuery(search) {
  const params = new URLSearchParams(search);
  const [lng, lat] = (params.get("c") ?? "").split(",").map((part) => (part === "" ? Number.NaN : Number(part)));
  // `Number("")` は 0 になる。空の縮尺を 0 として通さない
  const rawZoom = (params.get("z") ?? "").trim();
  const zoom = rawZoom === "" ? Number.NaN : Number(rawZoom);
  if (lng === undefined || lat === undefined) return null;
  if (![lng, lat, zoom].every(Number.isFinite)) return null;
  if (Math.abs(lng) > 180 || Math.abs(lat) > 90 || zoom < 0 || zoom > 22) return null;
  return { lng, lat, zoom };
}

/**
 * @param {number} value
 * @param {number} digits
 */
function round(value, digits) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
