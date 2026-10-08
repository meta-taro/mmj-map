/**
 * 時間で動く雨雲の見本を作る。純粋関数（画素の値を返すだけ）。
 *
 * ## 格子（`plan.ts`）と、こちらの役割の違い
 *
 * | | 見せるもの |
 * | --- | --- |
 * | `plan.ts` の格子 | **しくみ**。画像をタイルに貼っているだけ、という説明 |
 * | ここ | **ここまでできる**。時間で動く雨雲・台風の接近 |
 *
 * 格子は消さない。四角が大きくて人工的なのは意図で、
 * 「z/x/y の画像が並んでいるだけ」を一目で言うための形だから。
 *
 * ## なぜ、こちらは本物らしく作ってよいのか
 *
 * `plan.ts` には「ハザードマップのふりをしない」と書いてある。懸念は正しい——
 * 実在のデータに見えるものを置くと、いつか誰かが本物として使う。
 *
 * ここでは担保のしかたを変える。**画素に `SAMPLE` の文字を焼き込む。**
 * 形は本物らしく、剥がせない形で嘘だと分かる。画面の注記は消せるが、これは消せない。
 *
 * ## 何を描くか
 *
 * 台風 1 つ（渦と目）と、前線の雨帯。中心が時刻ごとに北東へ進む。
 * 値は 0〜1 の連続量で、レーダーの配色（弱い青 → 強い赤）に写す。
 */

/** タイル 1 枚の辺の長さ（画素） */
export const TILE_SIZE = 256;

/** 見本の時刻の数（1 時間ごと） */
export const FRAME_COUNT: number = 12;

/**
 * 台風の中心が通る道。`[経度, 緯度]` を始点と終点で持ち、時刻ごとに補間する。
 *
 * 南西から北東——日本へ近づく台風の典型的な進路。実在の台風ではない。
 */
export const TRACK_START = [131.0, 30.0] as const;
export const TRACK_END = [138.0, 36.0] as const;

/** 時刻ごとの中心（0 始まり） */
export function centerAt(frame: number): [number, number] {
  const t = FRAME_COUNT === 1 ? 0 : frame / (FRAME_COUNT - 1);
  return [
    TRACK_START[0] + (TRACK_END[0] - TRACK_START[0]) * t,
    TRACK_START[1] + (TRACK_END[1] - TRACK_START[1]) * t,
  ];
}

/**
 * レーダーの配色。弱いほど青、強いほど赤。
 *
 * 各社の雨雲レーダーと同じ並びにしてある。見た人が強さを読み違えないため
 * （独自の配色にすると、赤が弱雨に見えるようなことが起きる）。
 * 外界が決めている配色は写すもので、作るものではない。
 */
const RADAR = [
  { at: 0.3, rgba: [120, 170, 255, 70] },
  { at: 0.45, rgba: [60, 120, 255, 130] },
  { at: 0.6, rgba: [60, 200, 160, 160] },
  { at: 0.72, rgba: [230, 220, 70, 180] },
  { at: 0.85, rgba: [250, 150, 50, 200] },
  { at: 1.01, rgba: [230, 60, 60, 215] },
] as const;

/** 降っていないとみなす値。これ未満は透明 */
export const RAIN_FLOOR = 0.18;

/** 強さ（0〜1）を色へ */
export function radarColor(value: number): [number, number, number, number] {
  if (!Number.isFinite(value) || value < RAIN_FLOOR) return [0, 0, 0, 0];
  for (const band of RADAR) {
    if (value < band.at) return [...band.rgba] as [number, number, number, number];
  }
  return [...RADAR[RADAR.length - 1]!.rgba] as [number, number, number, number];
}

/** 画素の位置（タイル座標 ＋ 画素）から経度緯度へ */
export function pixelToLngLat(z: number, x: number, y: number, px: number, py: number): [number, number] {
  const n = 2 ** z;
  const lng = ((x + px / TILE_SIZE) / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + py / TILE_SIZE)) / n)));
  return [lng, (latRad * 180) / Math.PI];
}

/** 繰り返しの無い、なめらかな揺らぎ（雨雲の縁をギザギザにしないため） */
function wobble(a: number, b: number): number {
  return (
    Math.sin(a * 1.7 + b * 2.3) * 0.5 + Math.sin(a * 3.1 - b * 1.3) * 0.3 + Math.sin(a * 0.7 + b * 5.1) * 0.2
  );
}

/**
 * ある時刻・ある場所の雨の強さ（0〜1）。
 *
 * 渦（中心からの距離と角度で腕を作る）＋ 目（中心は降っていない）＋ 前線の雨帯。
 */
export function rainAt(lng: number, lat: number, frame: number): number {
  const [cx, cy] = centerAt(frame);
  // 緯度による経度の縮みを入れないと、渦が横に伸びる
  const dx = (lng - cx) * Math.cos((lat * Math.PI) / 180);
  const dy = lat - cy;
  const r = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);

  // 渦の腕。角度と距離で巻く
  const arms = Math.sin(angle * 2 + r * 2.6 - frame * 0.35);
  // 中心から離れるほど弱い
  const falloff = Math.exp(-((r / 3.2) ** 2));
  let value = falloff * (0.55 + 0.45 * arms);

  // 目。中心ほど降っていないのが台風の見え方
  const eye = Math.exp(-((r / 0.35) ** 2));
  value *= 1 - eye * 0.95;

  // 前線の雨帯。台風とは別に、北側へ帯を 1 本
  const band = Math.exp(-(((lat - (34.5 + frame * 0.12) - wobble(lng, frame) * 0.35) / 0.55) ** 2));
  value = Math.max(value, band * 0.42);

  // 縁をなめらかに乱す
  value *= 0.85 + 0.15 * wobble(lng * 2, lat * 2 + frame);
  return Math.min(1, Math.max(0, value));
}

/** 5×7 の字。`SAMPLE` を焼き込むためだけに持つ（フォントを足さない） */
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
};

const WORD = "SAMPLE";
/** 字の拡大率。小さすぎると読めず、大きすぎると雨雲が見えない（実測で 2 → 1 に下げた） */
const SCALE = 1;
const CHAR_W = (5 + 1) * SCALE;
const WORD_W = WORD.length * CHAR_W;
const WORD_H = 7 * SCALE;
/** 焼き込む間隔（画素）。**タイル 1 枚に 1 つ**——大きいと雨雲が読めない */
const STEP = TILE_SIZE;

/**
 * その画素が `SAMPLE` の字の上かどうか。
 *
 * 透明な場所にも書く。雨が降っていないところだけ切り取って
 * 本物として使う、ということができないように。
 */
export function onWatermark(px: number, py: number): boolean {
  const ox = ((px % STEP) + STEP) % STEP;
  const oy = ((py % STEP) + STEP) % STEP;
  if (oy >= WORD_H || ox >= WORD_W) return false;

  const charIndex = Math.floor(ox / CHAR_W);
  const letter = WORD[charIndex];
  if (letter === undefined) return false;
  const rows = GLYPHS[letter];
  if (rows === undefined) return false;

  const cx = Math.floor((ox - charIndex * CHAR_W) / SCALE);
  const cy = Math.floor(oy / SCALE);
  if (cx > 4) return false; // 字と字のあいだ
  return rows[cy]?.[cx] === "1";
}

/** 画素 1 つの色。雨の色の上に、見本の文字を重ねる */
export function pixelColor(
  lng: number,
  lat: number,
  frame: number,
  px: number,
  py: number,
): [number, number, number, number] {
  const [r, g, b, a] = radarColor(rainAt(lng, lat, frame));
  if (!onWatermark(px, py)) return [r, g, b, a];
  // 字は白。雨が無いところでは薄く、あるところでははっきり
  return [255, 255, 255, Math.max(90, Math.min(235, a + 80))];
}

/** 時刻の見出し（画面に出す用）。実在の日時ではないので、時刻だけ出す */
export function frameLabel(frame: number): string {
  return `${String(9 + frame).padStart(2, "0")}:00`;
}
