/**
 * 指し値（アンカー）から 24 の役割を作る。**ここは純粋関数。**
 *
 * **これは D-002 が採らなかった「配色をアルゴリズムで振る」そのものです。**
 * 人が範囲を決めて認めました（D-021・2026-09-21）:
 *
 *   「独自で完全につくれるなら OK です」
 *
 * 認められた範囲は **導入者のための道具** であって、MMJ が配る `styles/*.json` の 6 枚は
 * 手書きのまま（D-002 は生きている）。ここが吐いたものを `styles/` へ置かないこと。
 *
 * 出したものは**手で直される前提**なので、返すのは完成品ではなく
 * 「役割 → 色」の表。どの行を直せば何が変わるかが分かる形にしてある。
 */
import { mix, parseHex, toHex } from "./oklab.js";

/**
 * 役割の並び。**`packages/elements/src/palette.js` の `ROLE_LAYERS` と一致していること。**
 * 一致はテストが見ている（片方だけ増やすと落ちる）。
 */
export const ROLE_ORDER = [
  "background",
  "earth",
  "landcover",
  "green",
  "built",
  "paved",
  "water",
  "waterway",
  "buildings",
  "path",
  "road-minor",
  "road-medium",
  "road-major",
  "highway-casing",
  "highway",
  "rail",
  "boundary",
  "station",
  "station-fill",
  "label-city",
  "label-station",
  "label-neighbourhood",
  "label-water",
  "halo",
] as const;

export type Role = (typeof ROLE_ORDER)[number];

/** 人が決める指し値。**ここだけが人の判断で、残りはここから導く** */
export interface Anchors {
  /** 陸・背景。地図の地色 */
  readonly land: string;
  /** 水域。**陸の系列から独立させる**（水だけ色みが違うのが地図の慣習） */
  readonly water: string;
  /** 文字。ラベルの一番濃い側 */
  readonly ink: string;
  /** テーマカラー。高速道路と駅の縁に乗る */
  readonly accent: string;
  /** 公園・森。**省くと陸から導く** */
  readonly green?: string;
}

/**
 * 地色から文字色へ向かう道のり。**細いものほど地色に近い。**
 *
 * 明暗どちらの土台でも同じ式で使える（`land → ink` へ混ぜるだけなので、
 * 暗い土台では明るく、明るい土台では暗くなる）。**式を 2 つ持たない。**
 *
 * 白抜きの道（明るい土台で道路だけ `#fff`）にしたいときは、
 * 出したあとに `road-*` を手で直す。**そこは好みなので式にしない。**
 */
const LAND_TO_INK: Readonly<Partial<Record<Role, number>>> = {
  landcover: 0.05,
  built: 0.07,
  paved: 0.09,
  buildings: 0.12,
  path: 0.18,
  "road-minor": 0.26,
  "road-medium": 0.38,
  "road-major": 0.5,
  boundary: 0.42,
  rail: 0.56,
  "label-neighbourhood": 0.72,
  "label-station": 0.86,
};

/** 緑を渡されなかったときの行き先。**紙の地図の公園の色に寄せた中間値** */
const GREEN_HINT = "#6f9e58";

/**
 * 指し値から 24 の役割を作る。
 *
 * @param anchors 人が決める 4〜5 色
 * @param overrides 手で決めた色。**ここが最後に勝つ**
 */
export function deriveRoles(
  anchors: Anchors,
  overrides: Readonly<Record<string, string>> = {},
): Record<Role, string> {
  // 読めない色はここで落とす。**黙って黒へ落とすと、間違いが黒い地図として出る**
  const land = toHex(parseHex(anchors.land));
  const water = toHex(parseHex(anchors.water));
  const ink = toHex(parseHex(anchors.ink));
  const accent = toHex(parseHex(anchors.accent));
  const green =
    anchors.green === undefined ? mix(land, GREEN_HINT, 0.55) : toHex(parseHex(anchors.green));

  const roles = {
    background: land,
    earth: land,
    green,
    water,
    // 水路は水より一段濃い。同じ色だと、川筋が面に埋もれて見えなくなる
    waterway: mix(water, ink, 0.28),
    // 水の名前は水の系列から取る。陸のラベルと同じ色だと、何の名前か分からなくなる
    "label-water": mix(water, ink, 0.62),

    // **指し値そのもの**。作り変えない
    highway: accent,
    station: accent,
    "station-fill": land,
    "label-city": ink,
    // 縁取りは地色。文字と同じ側にすると、ラベルが背景に溶ける
    halo: land,
    // 高速の縁取りは本体より濃い。**同じにすると太い線が塊になる**（Modern Ink で実際に潰れた）
    "highway-casing": mix(accent, ink, 0.4),
  } as Record<Role, string>;

  for (const [role, t] of Object.entries(LAND_TO_INK)) {
    roles[role as Role] = mix(land, ink, t);
  }

  for (const [role, color] of Object.entries(overrides)) {
    if (!(ROLE_ORDER as readonly string[]).includes(role)) {
      // 綴り間違いを黙って捨てない。捨てると「指定したのに効かない」になる
      throw new Error(`知らない役割です: ${role}（使えるのは ${ROLE_ORDER.join(" ")}）`);
    }
    roles[role as Role] = toHex(parseHex(color));
  }

  // 並びを固定して返す。**差分が読める形にするため**
  const ordered = {} as Record<Role, string>;
  for (const role of ROLE_ORDER) ordered[role] = roles[role];
  return ordered;
}
