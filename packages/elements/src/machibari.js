/**
 * まち針の斜め刺しと、種別の割合の輪。**ここは純粋関数。**地図も DOM も触らない。
 *
 * ## なぜ丸をやめる選択肢を足したか
 *
 * 丸い点は**どこを指しているか分からず、密集すると重なって読めない**
 * （2026-11-06・導入先からの依頼）。まち針は**針の先だけが位置を指し**、
 * 玉は右上へずらして描くので、店が密集しても先端どうしは重ならない。
 *
 * ## 値の出どころ
 *
 * 寸法と角度は、人が作った試作（claude.ai「ピン試作：まち針の斜め刺し」2026-11-06）の
 * 値を**そのまま**写している。**ここで形を作り直さない。**
 * 色は採用側が渡す（§11・MMJ は種別の色を決めない）。針の灰色だけは試作の値。
 *
 * 描く関数は 2D の context を受け取るだけにしてある。canvas を作るのは要素側。
 */

/** 画像 id の印。**source 名を前に付ける**ので、頁に複数置いても混ざらない */
const NEEDLE_MARK = "--machibari--";
const RING_MARK = "--ring--";
const SPLIT = "|";

/** 種別ごとの件数を入れる、まとまりの属性名。**利用者の属性と衝突しない名前にする** */
export const RING_KEY_PREFIX = "mmj_k";

/**
 * 試作の値。**単位は CSS px**（試作の SVG の 1 単位を 1px として写す）。
 *
 * 角度は真横から測る。`-60` は「真上から右へ 30°」。選んだ点は `-90`（真上）。
 */
export const MACHIBARI = {
  rest: { length: 20, radius: 5, angle: -60 },
  picked: { length: 26, radius: 7, angle: -90 },
  needleWidth: 0.6,
  needleColor: "#c9ccd8",
  ballStroke: 1.2,
  shadow: { dx: 1, dy: 1, rx: 2, ry: 0.9, color: "rgba(0,0,0,.55)" },
  shine: { offset: 0.35, radius: 0.32, color: "rgba(255,255,255,.55)" },
  // 選んだ点だけ、針先に白い点。**どこを指しているかを、選んだときに確かめられる**
  tip: { radius: 1.2, color: "#fff" },
};

/** 輪の寸法。半径は件数で伸びるが、**60 件で止める**（大きくなりすぎると地図を隠す） */
export const RING = { base: 9, perCount: 1 / 6, countCap: 60, width: 3, inset: 2.5 };

/** 箱の余白。**狭いと縁が欠けて見える** */
const PAD = 1;

/**
 * まち針 1 本の寸法。**針先が画像のどこにあるか**を返す（そこを地図の点へ合わせる）。
 *
 * @param {boolean} picked
 * @returns {{ width: number, height: number, tip: { x: number, y: number },
 *   head: { x: number, y: number }, radius: number }}
 */
export function needleGeometry(picked) {
  const { length, radius, angle } = picked ? MACHIBARI.picked : MACHIBARI.rest;
  const rad = (angle * Math.PI) / 180;
  // 針先を原点に置いたときの、玉の中心
  const hx = Math.cos(rad) * length;
  const hy = Math.sin(rad) * length;
  const reach = radius + MACHIBARI.ballStroke / 2;
  const { dx, dy, rx, ry } = MACHIBARI.shadow;

  const minX = Math.min(dx - rx, hx - reach, -MACHIBARI.tip.radius);
  const maxX = Math.max(dx + rx, hx + reach);
  const minY = Math.min(hy - reach, -MACHIBARI.tip.radius);
  const maxY = Math.max(dy + ry, MACHIBARI.tip.radius);

  const tip = { x: PAD - minX, y: PAD - minY };
  return {
    width: Math.ceil(maxX - minX + PAD * 2),
    height: Math.ceil(maxY - minY + PAD * 2),
    tip,
    head: { x: tip.x + hx, y: tip.y + hy },
    radius,
  };
}

/**
 * `icon-offset`。**左上を基準に置き、針先のぶんだけ戻す**と、針先が座標に乗る。
 * @param {boolean} picked
 * @returns {[number, number]}
 */
export function needleOffset(picked) {
  const { tip } = needleGeometry(picked);
  return [-tip.x, -tip.y];
}

/**
 * 針先から見た玉の中心（px）。**押す目標は玉**なので、当たり判定をここへずらす。
 * @param {boolean} picked
 * @returns {[number, number]}
 */
export function ballOffset(picked) {
  const { tip, head } = needleGeometry(picked);
  return [head.x - tip.x, head.y - tip.y];
}

/**
 * 輪の半径。
 * @param {number} count
 */
export function ringRadius(count) {
  const n = Number.isFinite(count) && count > 0 ? count : 0;
  return RING.base + Math.min(n, RING.countCap) * RING.perCount;
}

/**
 * 輪の弧。**12 時から時計回り**に、渡された順で並べる。
 * 対応に無い種別（と、種別を持たない点）は最後に既定の色でまとめる。
 * 0 件の種別は弧を作らない（**幅 0 の弧でも、端の丸みが点になって見える**）。
 *
 * @param {number} total
 * @param {readonly number[]} counts `colors` と同じ順
 * @param {readonly string[]} colors
 * @param {string} fallbackColor
 * @returns {{ color: string, start: number, end: number }[]}
 */
export function ringArcs(total, counts, colors, fallbackColor) {
  const known = counts.map((c) => (Number.isFinite(c) && c > 0 ? c : 0));
  const sum = known.reduce((a, b) => a + b, 0);
  const all = Math.max(total, sum);
  if (!(all > 0)) return [];

  const parts = [
    ...known.map((count, i) => ({ color: colors[i] ?? fallbackColor, count })),
    { color: fallbackColor, count: all - sum },
  ].filter((part) => part.count > 0);

  /** @type {{ color: string, start: number, end: number }[]} */
  const arcs = [];
  let start = -Math.PI / 2;
  for (const part of parts) {
    const end = start + (2 * Math.PI * part.count) / all;
    arcs.push({ color: part.color, start, end });
    start = end;
  }
  return arcs;
}

/**
 * 種別ごとに数える `clusterProperties`。**数えるのは MapLibre**（D-011・自前で集計しない）。
 * @param {string} colorKey
 * @param {readonly { name: string }[]} colors
 * @returns {Record<string, any[]>}
 */
export function ringClusterProperties(colorKey, colors) {
  return Object.fromEntries(
    colors.map((c, i) => [
      `${RING_KEY_PREFIX}${i}`,
      ["+", ["case", ["==", ["to-string", ["get", colorKey]], c.name], 1, 0]],
    ]),
  );
}

/**
 * 輪の画像 id を作る式。**件数をそのまま id に入れる**ので、id から描き直せる。
 * @param {string} sourceId
 * @param {number} kinds 種別の数（`colors.length`）
 * @returns {any[]}
 */
export function ringImageExpression(sourceId, kinds) {
  const counts = Array.from({ length: kinds }, (_, i) => ["to-string", ["get", `${RING_KEY_PREFIX}${i}`]]);
  const joined = counts.flatMap((c, i) => (i === 0 ? [c] : [",", c]));
  return ["concat", `${sourceId}${RING_MARK}`, ["to-string", ["get", "point_count"]], SPLIT, ...joined];
}

/**
 * 輪の id から件数へ戻す。**自分の source の輪だけ**を読む。
 * @param {string} sourceId
 * @param {unknown} id
 * @returns {{ total: number, counts: number[] } | null}
 */
export function ringImageParts(sourceId, id) {
  if (typeof id !== "string") return null;
  const head = `${sourceId}${RING_MARK}`;
  if (!id.startsWith(head)) return null;
  const rest = id.slice(head.length);
  const at = rest.indexOf(SPLIT);
  if (at < 0) return null;
  const total = Number(rest.slice(0, at));
  if (!Number.isFinite(total) || total <= 0) return null;
  const tail = rest.slice(at + 1);
  const counts = tail === "" ? [] : tail.split(",").map(Number);
  if (counts.some((c) => !Number.isFinite(c) || c < 0)) return null;
  return { total, counts };
}

/**
 * まち針の画像 id を作る式。**色は値ごと**（対応に無ければ既定の色）。
 * @param {{ sourceId: string, picked: boolean, colorKey?: string | null,
 *   colors?: readonly { name: string, color: string }[], fallbackColor: string }} input
 * @returns {any[]}
 */
export function needleImageExpression(input) {
  const { sourceId, picked, colorKey = null, colors = [], fallbackColor } = input;
  const color =
    colorKey === null || colors.length === 0
      ? fallbackColor
      : ["match", ["to-string", ["get", colorKey]], ...colors.flatMap((c) => [c.name, c.color]), fallbackColor];
  return ["concat", `${sourceId}${NEEDLE_MARK}`, color, SPLIT, picked ? "picked" : "rest"];
}

/**
 * まち針の id から色と状態へ戻す。
 * @param {string} sourceId
 * @param {unknown} id
 * @returns {{ color: string, picked: boolean } | null}
 */
export function needleImageParts(sourceId, id) {
  if (typeof id !== "string") return null;
  const head = `${sourceId}${NEEDLE_MARK}`;
  if (!id.startsWith(head)) return null;
  const rest = id.slice(head.length);
  const at = rest.lastIndexOf(SPLIT);
  if (at <= 0) return null;
  const state = rest.slice(at + 1);
  if (state !== "picked" && state !== "rest") return null;
  return { color: rest.slice(0, at), picked: state === "picked" };
}

/**
 * まち針を描く。**順番は影 → 針 → 玉 → 光 → 針先の白い点**（後に描いたものが上）。
 * @param {any} context CanvasRenderingContext2D（倍率は呼ぶ側で掛けておく）
 * @param {{ color: string, casing: string, picked: boolean }} input
 */
export function drawNeedle(context, input) {
  const { tip, head, radius } = needleGeometry(input.picked);
  const { shadow, shine } = MACHIBARI;

  context.fillStyle = shadow.color;
  context.beginPath();
  context.ellipse(tip.x + shadow.dx, tip.y + shadow.dy, shadow.rx, shadow.ry, 0, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = MACHIBARI.needleColor;
  context.lineWidth = MACHIBARI.needleWidth;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(tip.x, tip.y);
  context.lineTo(head.x, head.y);
  context.stroke();

  context.fillStyle = input.color;
  context.strokeStyle = input.casing;
  context.lineWidth = MACHIBARI.ballStroke;
  context.beginPath();
  context.arc(head.x, head.y, radius, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.fillStyle = shine.color;
  context.beginPath();
  context.arc(head.x - radius * shine.offset, head.y - radius * shine.offset, radius * shine.radius, 0, Math.PI * 2);
  context.fill();

  if (input.picked) {
    context.fillStyle = MACHIBARI.tip.color;
    context.beginPath();
    context.arc(tip.x, tip.y, MACHIBARI.tip.radius, 0, Math.PI * 2);
    context.fill();
  }
}

/**
 * 輪 1 つの箱の一辺（px）。
 * @param {number} total
 */
export function ringSize(total) {
  return Math.ceil((ringRadius(total) + RING.width / 2 + PAD) * 2);
}

/**
 * 輪を描く。**件数の文字は描かない**（地図の文字層が受け持つ。フォントをスタイルと揃えるため）。
 * @param {any} context CanvasRenderingContext2D
 * @param {{ total: number, counts: readonly number[], colors: readonly string[],
 *   fallbackColor: string, fill: string }} input
 */
export function drawRing(context, input) {
  const size = ringSize(input.total);
  const center = size / 2;
  const radius = ringRadius(input.total);

  context.lineWidth = RING.width;
  for (const arc of ringArcs(input.total, input.counts, input.colors, input.fallbackColor)) {
    context.strokeStyle = arc.color;
    context.beginPath();
    context.arc(center, center, radius, arc.start, arc.end);
    context.stroke();
  }

  context.fillStyle = input.fill;
  context.beginPath();
  context.arc(center, center, radius - RING.inset, 0, Math.PI * 2);
  context.fill();
}
