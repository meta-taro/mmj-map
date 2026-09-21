/**
 * 色を混ぜる。**ここは純粋関数。**
 *
 * **sRGB のまま混ぜない。**理由は 2 つ。
 *
 * 1. **階調の間隔が目の感じ方と合わない。**道の 6 段のような等間隔の階調を sRGB で作ると、
 *    明るい側が詰まって 2 段ぶんが同じに見える
 * 2. **混ぜるとくすむ。**赤と緑を sRGB で平均すると `#808000` の濁った黄土色になる
 *
 * Oklab（Björn Ottosson・2020）は、目の感じ方に近い間隔で並ぶ色空間で、
 * 明度の階調と色みの保持がどちらも素直に出る。**依存は足していない**（式だけ）。
 * 出典: https://bottosson.github.io/posts/oklab/
 */

/** sRGB（0〜1）。ガンマ補正後の値 */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** Oklab。L は明度、a/b は色み */
interface Lab {
  readonly L: number;
  readonly a: number;
  readonly b: number;
}

const HEX = /^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * `#rrggbb` / `#rgb` を読む。**読めなければ投げる。**
 * 黒へ落とすと、綴り間違いが「黒い地図」として出てしまい、原因を探せない。
 * @param value
 */
export function parseHex(value: string): Rgb {
  if (typeof value !== "string" || !HEX.test(value.trim())) {
    throw new Error(`色として読めません: ${JSON.stringify(value)}（#rrggbb か #rgb）`);
  }
  const body = value.trim().replace(/^#/, "");
  const full =
    body.length === 3
      ? body
          .split("")
          .map((c) => c + c)
          .join("")
      : body;
  const n = Number.parseInt(full, 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

/** 0〜1 の外は端で止める。**回り込ませない**（255 を越えて 0 に戻ると別の色になる） */
function clamp(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** `#rrggbb` に戻す。小文字で揃える（差分の見た目を安定させるため） */
export function toHex(rgb: Rgb): string {
  const part = (value: number) =>
    Math.round(clamp(value) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${part(rgb.r)}${part(rgb.g)}${part(rgb.b)}`;
}

/** sRGB のガンマを外して線形にする */
function toLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** 線形からガンマを戻す */
function fromLinear(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

function toLab(rgb: Rgb): Lab {
  const r = toLinear(rgb.r);
  const g = toLinear(rgb.g);
  const b = toLinear(rgb.b);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function fromLab(lab: Lab): Rgb {
  const l = (lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b) ** 3;
  const m = (lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b) ** 3;
  const s = (lab.L - 0.0894841775 * lab.a - 1.291485548 * lab.b) ** 3;

  return {
    r: fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

/**
 * 2 色を混ぜる。`t` が 0 なら `from`、1 なら `to`。
 * @param from 色（`#rrggbb`）
 * @param to 色（`#rrggbb`）
 * @param t 0〜1
 */
export function mix(from: string, to: string, t: number): string {
  // 端はそのまま返す。**丸め誤差で `#ffffff` が `#fffffe` にならないように**
  if (t <= 0) return toHex(parseHex(from));
  if (t >= 1) return toHex(parseHex(to));

  const a = toLab(parseHex(from));
  const b = toLab(parseHex(to));
  return toHex(
    fromLab({
      L: a.L + (b.L - a.L) * t,
      a: a.a + (b.a - a.a) * t,
      b: a.b + (b.b - a.b) * t,
    }),
  );
}
