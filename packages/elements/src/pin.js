/**
 * ピンの形と、地物ごとの画像 id。**ここは純粋関数。**DOM も地図も触らない。
 *
 * ## なぜ 1 か所に出したか
 *
 * 同じ雫形を**2 通りの描き方**で使う——道のり案内は SVG の `<path>`、
 * お店の点は canvas（MapLibre の層には DOM を置けないので、画像を作って渡す）。
 * **形を 2 か所に書くと、片方だけ直して食い違う。**
 *
 * `Path2D` が SVG の `d` をそのまま受けるので、**文字列 1 本で両方に効く**。
 *
 * ## 形の経緯
 *
 * 2026-10-09、道のり案内のピンを **4 回**出し直した末に決まった形
 * （丸の中に写真 → 尖りを足す → 小さい → 鋭い → **丸と三角をやめて一体の雫形**）。
 * **丸と三角を別々に置くと継ぎ目ができて「丸に針が刺さっている」ように見える。**
 */
import { isSafeImage } from "./popup.js";

/** 画像 id の区切り。**source 名を前に付ける**ので、頁に複数置いても混ざらない */
const PIN_MARK = "--pin--";

/**
 * @param {{ radius: number, body: number, tail: number }} input
 * @returns {{ radius: number, body: number, tail: number, width: number, height: number }}
 */
function buildPinSize(input) {
  // 囲い（1.5px）の半分が外へ出る。**箱を少し広く取る**（狭いと縁が欠けて見える）
  const width = Math.round((input.body + 1) * 2);
  return { ...input, width, height: width + input.tail };
}

/**
 * 写真を入れるピンの寸法（px）。
 *
 * `radius` が写真の丸、`body` が本体の丸で、**差がそのまま輪**になる。
 * `tail` は本体の下端から先までの長さで、**丸の半径より短い**（長いと針に見える）。
 */
export const PIN_PHOTO = buildPinSize({ radius: 12, body: 14.5, tail: 7 });

/**
 * 雫形の `d` を組む。**本体の丸が、そのまま下へ流れて先になる。**
 *
 * 肩は三次ベジェでなだらかに繋ぐ。**直線で繋ぐと角が立ち、鋭く見える。**
 *
 * @param {{ body: number, width: number, height: number }} size
 * @returns {string} SVG の `d`（`Path2D` にもそのまま渡せる）
 */
export function pinPath(size) {
  const { body, width, height } = size;
  const center = width / 2;
  const tip = height - 1;
  return (
    `M ${center},${tip}` +
    ` C ${center - body * 0.62},${center + body * 0.78}` +
    ` ${center - body},${center + body * 0.42} ${center - body},${center}` +
    ` A ${body},${body} 0 1,1 ${center + body},${center}` +
    ` C ${center + body},${center + body * 0.42}` +
    ` ${center + body * 0.62},${center + body * 0.78} ${center},${tip} Z`
  );
}

/** 色と URL の区切り。**色に `|` は入らない**ので、最初の 1 つで割れる */
const PIN_SPLIT = "|";

/**
 * 画像の id を作る。**色と URL をそのまま入れる**ので、id から読み戻せる。
 *
 * **色を入れないと使い回される。**MapLibre は id で画像を持つので、
 * 色を入れないと**同じ写真を使う 2 店が、先に描かれたほうの色で両方描かれる**。
 *
 * @param {string} sourceId
 * @param {string} color
 * @param {string} url
 */
export function pinImageId(sourceId, color, url) {
  return `${sourceId}${PIN_MARK}${color}${PIN_SPLIT}${url}`;
}

/**
 * `名前:色` の対応を読む。**色は導入側が指定する**（§11・MMJ は色を作らない）。
 *
 * **色として読めないものは捨てる。**canvas は読めない色を黙って透明にするので、
 * 通すと**ピンが消えた理由が分からない**。16 進だけを受ける。
 *
 * @param {string | null | undefined} attribute `ramen:#E4572E,cafe:#C9A227`
 * @returns {{ name: string, color: string }[]}
 */
export function parsePinColors(attribute) {
  if (typeof attribute !== "string") return [];
  /** @type {{ name: string, color: string }[]} */
  const found = [];
  const seen = new Set();
  for (const pair of attribute.split(",")) {
    const at = pair.indexOf(":");
    if (at < 0) continue;
    const name = pair.slice(0, at).trim();
    const color = pair.slice(at + 1).trim();
    if (name === "" || seen.has(name)) continue;
    if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color)) continue;
    seen.add(name);
    found.push({ name, color });
  }
  return found;
}

/**
 * 画像の id から URL へ戻す。**自分の source のピンだけ**を読む。
 *
 * MapLibre は**描こうとしたときだけ** `styleimagemissing` で id を聞いてくる。
 * そのとき「何を読めばいいか」を知る唯一の手がかりがこの id なので、
 * **往復できることが要る**。
 *
 * @param {string} sourceId
 * @param {unknown} id
 * @returns {{ color: string, url: string } | null} ピンの id でなければ `null`
 */
export function pinImageParts(sourceId, id) {
  if (typeof id !== "string") return null;
  const head = `${sourceId}${PIN_MARK}`;
  if (!id.startsWith(head)) return null;
  const rest = id.slice(head.length);
  const at = rest.indexOf(PIN_SPLIT);
  if (at < 0) return null;
  const color = rest.slice(0, at);
  const url = rest.slice(at + 1);
  if (color === "" || url === "") return null;
  return { color, url };
}

/**
 * 複数枚から**先頭の 1 枚**を取り出す。配列でも、`,` と改行で区切った文字列でも受ける
 * （`card-images` と同じ形をそのまま渡せるようにするため）。
 *
 * **安全でない URL は返さない。**canvas へ読み込む前に弾く
 * （判定は吹き出しの写真と同じ `isSafeImage`）。
 *
 * **危ないものが混ざっていたら、その値ごと捨てる。**`data:` は中に `,` を含むので
 * （`data:image/svg+xml,<svg …>`）、**割ってから 1 つずつ見ると、後半が
 * 「相対パス」に見えて通ってしまう**（実装したその場で試験に落ちた）。
 * 拾い直す利点より、取りこぼす危険のほうが重い。
 *
 * @param {unknown} value
 * @returns {string | null}
 */
export function firstImageUrl(value) {
  // **割る前に、値そのものを見る。**危ないスキームが付いていたらここで終わり
  if (typeof value === "string" && value.trim() !== "" && !isSafeImage(value)) return null;
  const list = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\n]/)
      : [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const url = item.trim();
    if (url !== "" && isSafeImage(url)) return url;
  }
  return null;
}

/**
 * `icon-image` に渡す式。**地物ごとに別の id** を作る。
 *
 * **先に全部登録しない。**この式が指す id のうち、MapLibre が実際に描こうとした
 * ぶんだけ `styleimagemissing` で聞いてくる。**画面の外も、ズームで間引かれた点も
 * 問い合わせが来ない**ので、1,027 件あっても作るのは画面に出ている数十枚だけ。
 *
 * **値が無い地物は空の id**にして、描こうとさせない（いままでの丸が残る）。
 * 複数枚のときは `,` までを切る（**残りは要素側が `firstImageUrl` で詰める**）。
 *
 * @param {{
 *   sourceId: string, fallbackColor: string,
 *   photoKey?: string | null, iconKey?: string | null,
 *   icons?: readonly { name: string, url: string }[],
 *   colorKey?: string | null, colors?: readonly { name: string, color: string }[],
 * }} input
 * @returns {any[]}
 */
export function pinImageExpression(input) {
  const { sourceId, photoKey = null, iconKey = null, icons = [], colorKey = null, colors = [], fallbackColor } = input;

  // 写真は `,` 区切りのことがある。**先頭までを切る**（残りは要素側が詰める）
  const firstPhoto = [
    "let",
    "raw",
    ["to-string", ["get", photoKey]],
    [
      "case",
      [">", ["index-of", ",", ["var", "raw"]], -1],
      ["slice", ["var", "raw"], 0, ["index-of", ",", ["var", "raw"]]],
      ["var", "raw"],
    ],
  ];

  // 分類の絵は **値 → URL** の対応。**知らない値は空**（描こうとしない）
  const iconUrl =
    iconKey === null || icons.length === 0
      ? ""
      : ["match", ["to-string", ["get", iconKey]], ...icons.flatMap((i) => [i.name, i.url]), ""];

  // **写真が優先。**写真があるのに分類の絵を出す理由が無い
  const url =
    photoKey === null
      ? iconUrl
      : ["case", ["has", photoKey], firstPhoto, iconUrl];

  // **色は値ごと。**対応に無ければ既定（要素の `color` / `accent`）
  const color =
    colorKey === null || colors.length === 0
      ? fallbackColor
      : ["match", ["to-string", ["get", colorKey]], ...colors.flatMap((c) => [c.name, c.color]), fallbackColor];

  // **出すものが無ければ空の id。**MapLibre は空の `icon-image` を描こうとしない
  return [
    "case",
    ["==", url, ""],
    "",
    ["concat", `${sourceId}${PIN_MARK}`, color, PIN_SPLIT, url],
  ];
}
