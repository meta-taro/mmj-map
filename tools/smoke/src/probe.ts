/**
 * 頁の中で測る式と、その読み取り。**測るだけで、合否は決めない**（決めるのは `checks.ts`）。
 *
 * **文字列で書くしかない。**CDP の `Runtime.evaluate` へ渡すので、
 * ここだけは頁の中で動く JavaScript をそのまま持つ。
 * **その代わり、返ってきたものは必ずこちらで検算する**（`readProbe`）。
 */
import type { PinReport, Stage, TapTarget } from "./checks.js";

export interface Probe {
  readonly scrollWidth: number;
  readonly clientWidth: number;
  readonly stage: Stage | null;
  readonly taps: readonly TapTarget[];
  readonly skipLink: boolean;
  readonly skipTarget: boolean;
  readonly headings: readonly number[];
  readonly pins: readonly PinReport[];
  readonly focusInPopup: boolean;
}

/**
 * 頁の中で走る式。**JSON の文字列を返す。**
 *
 * - 押す的は**見えているものだけ**（`hidden` や `display:none` を数えない）
 * - 地図の入れ物は `.map-area`（道具の頁）か `.lp-stage`（読み物の頁）
 * - 飛ぶ先は `href="#..."` が指す要素の実在で見る（**リンクだけあって着かないのが一番悪い**）
 */
export const PROBE = `(() => {
  const box = (el) => el.getBoundingClientRect();
  const shown = (el) => {
    const r = box(el);
    return r.width > 0 && r.height > 0;
  };

  const area = document.querySelector('.map-area');
  const lp = document.querySelector('.lp-stage');
  const target = area ?? lp;
  const stage = target === null ? null : {
    kind: area === null ? 'lp-stage' : 'map-area',
    top: box(target).top + window.scrollY,
    height: box(target).height,
  };

  // **文の中のリンクは見ない。**「詳しくは<a>導入手順</a>を見てください」の
  // リンクを 36px にすると、行間が壊れて文が読めなくなる。
  // WCAG 2.5.8 も「文中に置かれたもの」を的の大きさの対象から外している。
  // 見分け方は**親から <a> の文字を引いて、残りがあるか**——
  // 残れば文の中、残らなければリンクだけの並び（＝的として扱う）。
  // **親は文を入れる要素に限る。**body 直下のスキップリンクまで
  // 「文の中」と見なしてしまい、**24px の的を見逃していた**（実測・2026-09-30）
  // ※この式は文字列として渡すので、**中でバッククォートを使わないこと**
  const PROSE = new Set(['P', 'LI', 'TD', 'TH', 'DD', 'DT', 'FIGCAPTION', 'BLOCKQUOTE',
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SUMMARY']);
  const inProse = (el) => {
    if (el.tagName !== 'A') return false;
    const parent = el.parentElement;
    if (parent === null || !PROSE.has(parent.tagName)) return false;
    const links = [...parent.querySelectorAll('a')].map((a) => a.textContent ?? '').join('');
    return (parent.textContent ?? '').replace(links, '').trim() !== '';
  };

  const taps = [...document.querySelectorAll('a[href], button, summary, [role="button"]')]
    .filter((el) => shown(el) && !inProse(el))
    .map((el) => ({
      label: (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim().slice(0, 24),
      width: box(el).width,
      height: box(el).height,
    }));

  const skip = document.querySelector('.skip-link, .lp-skip');
  const to = skip === null ? null : (skip.getAttribute('href') ?? '').slice(1);

  // **開いている吹き出しを、いちばん近いピンと組にして測る。**
  // <mmj-marker> 要素からはたどれない（<mmj-map> は描くときに子を DOM から外す）。
  // ピンの絵（svg）が 60px より遠い吹き出しは、ピンの無いもの（店のカードなど）として見ない。
  // 地図が出ていない頁では 0 件になる。数えた数は cli.ts が出す
  const PAIR_MAX = 60;
  const shapes = [...document.querySelectorAll('.maplibregl-marker svg')].filter(shown).map(box);
  const pins = [...document.querySelectorAll('.maplibregl-popup')].flatMap((root) => {
    const tip = root.querySelector('.maplibregl-popup-tip');
    const content = root.querySelector('.maplibregl-popup-content');
    const frame = root.closest('.maplibregl-map');
    if (!tip || !content || !frame) return [];
    const t = box(tip), c = box(content), f = box(frame);
    const tipX = (t.left + t.right) / 2;
    const near = shapes
      .map((s) => ({ s, d: Math.hypot((s.left + s.right) / 2 - tipX, s.top - t.bottom) }))
      .sort((a, b) => a.d - b.d)[0];
    if (!near || near.d > PAIR_MAX) return [];
    const s = near.s;
    const text = root.querySelector('.mmj-popup-text');
    const anchor = ([...root.classList].find((name) => name.startsWith('maplibregl-popup-anchor-')) || '')
      .replace('maplibregl-popup-anchor-', '');
    return [{
      label: ((text && text.textContent) || '').trim().slice(0, 24),
      anchor,
      offsetX: tipX - (s.left + s.right) / 2,
      gap: s.top - t.bottom,
      overflow: Math.max(0, f.left - c.left, c.right - f.right, f.top - c.top),
    }];
  });

  const focused = document.activeElement;

  return JSON.stringify({
    pins,
    focusInPopup: focused !== null && focused.closest('.maplibregl-popup') !== null,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    stage,
    taps,
    skipLink: skip !== null,
    skipTarget: to !== null && to !== '' && document.getElementById(to) !== null,
    headings: [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((el) => Number(el.tagName.slice(1))),
  });
})()`;

/**
 * 測った結果を読む。**壊れていたら `null`**（落とさない）。
 *
 * 頁の中で動かすものは、**こちらの想定どおりに返ってくるとは限らない**
 * （読み込み途中・例外・別の頁）。そのまま `checks` へ渡すと、
 * **数字でないものを比べて「合格」になる**のが一番まずい。
 */
export function readProbe(raw: unknown): Probe | null {
  if (typeof raw !== "string") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const value = parsed as Record<string, unknown>;
  const scrollWidth = numberOf(value["scrollWidth"]);
  const clientWidth = numberOf(value["clientWidth"]);
  if (scrollWidth === null || clientWidth === null) return null;

  return {
    scrollWidth,
    clientWidth,
    stage: readStage(value["stage"]),
    taps: readTaps(value["taps"]),
    skipLink: value["skipLink"] === true,
    skipTarget: value["skipTarget"] === true,
    headings: Array.isArray(value["headings"])
      ? value["headings"].filter((level): level is number => typeof level === "number")
      : [],
    pins: readPins(value["pins"]),
    focusInPopup: value["focusInPopup"] === true,
  };
}

/** **数字でない吹き出しは数えない**（合格にもしない。数えた数は cli.ts が出す） */
function readPins(value: unknown): PinReport[] {
  if (!Array.isArray(value)) return [];
  const pins: PinReport[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const pin = item as Record<string, unknown>;
    const offsetX = numberOf(pin["offsetX"]);
    const gap = numberOf(pin["gap"]);
    const overflow = numberOf(pin["overflow"]);
    if (offsetX === null || gap === null || overflow === null) continue;
    pins.push({
      label: typeof pin["label"] === "string" ? pin["label"] : "(名前なし)",
      anchor: typeof pin["anchor"] === "string" ? pin["anchor"] : "",
      offsetX,
      gap,
      overflow,
    });
  }
  return pins;
}

function numberOf(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readStage(value: unknown): Stage | null {
  if (typeof value !== "object" || value === null) return null;
  const stage = value as Record<string, unknown>;
  const top = numberOf(stage["top"]);
  const height = numberOf(stage["height"]);
  if (top === null || height === null) return null;
  // **知らない種類は見ない。**判定の基準が違うので、当てずっぽうで当てはめない
  if (stage["kind"] !== "map-area" && stage["kind"] !== "lp-stage") return null;
  return { kind: stage["kind"], top, height };
}

function readTaps(value: unknown): TapTarget[] {
  if (!Array.isArray(value)) return [];
  const taps: TapTarget[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const tap = item as Record<string, unknown>;
    const width = numberOf(tap["width"]);
    const height = numberOf(tap["height"]);
    if (width === null || height === null) continue;
    taps.push({ label: typeof tap["label"] === "string" ? tap["label"] : "(名前なし)", width, height });
  }
  return taps;
}
