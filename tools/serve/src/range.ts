/**
 * HTTP Range 要求の解釈。
 *
 * この配信は本番ではなく、**手元で「配信経路が Range に応える」状態を作るため**にある。
 * PMTiles は 1 枚のファイルの一部だけを読む形式なので、配信が Range を無視して
 * 200（全量）を返すと、1 タイルごとに 3.6GB が落ちてくる（PRD §4）。
 * 手元でそれを再現できないと、`tiles:check-range` を試す相手がいないまま S1 が終わる。
 *
 * RFC 9110 §14.1。**解釈できない Range は無視して全量を返す**のが規格の指示で、
 * エラーにしない（エラーにすると、Range を知らないクライアントが弾かれる）。
 */
export type RangeRequest =
  | { readonly kind: "full" }
  /** start / end はどちらも包含。HTTP の Range は閉区間で数える */
  | { readonly kind: "partial"; readonly start: number; readonly end: number }
  | { readonly kind: "unsatisfiable" };

const FULL: RangeRequest = { kind: "full" };
const UNSATISFIABLE: RangeRequest = { kind: "unsatisfiable" };

export function parseRangeHeader(header: string | undefined, size: number): RangeRequest {
  if (header === undefined || header.trim() === "") return FULL;

  const [unit, spec] = splitOnce(header, "=");
  if (spec === null || unit.trim().toLowerCase() !== "bytes") return FULL;

  // 複数範囲は multipart/byteranges で返すことになる。実装しても PMTiles は使わないため、
  // 半端に 1 つだけ返して転送量の話を狂わせるより、全量で応える。
  if (spec.includes(",")) return FULL;

  const [rawStart, rawEnd] = splitOnce(spec, "-");
  if (rawEnd === null) return FULL;

  const startText = rawStart.trim();
  const endText = rawEnd.trim();

  // "bytes=-100" — 末尾から 100 バイト
  if (startText === "") {
    const wanted = toInt(endText);
    if (wanted === null || wanted <= 0 || size === 0) return UNSATISFIABLE;
    return { kind: "partial", start: Math.max(0, size - wanted), end: size - 1 };
  }

  const start = toInt(startText);
  if (start === null) return FULL;
  if (start >= size) return UNSATISFIABLE;

  // "bytes=900-" — そこから末尾まで
  if (endText === "") {
    if (size === 0) return UNSATISFIABLE;
    return { kind: "partial", start, end: size - 1 };
  }

  const end = toInt(endText);
  if (end === null) return FULL;
  if (end < start) return UNSATISFIABLE;

  return { kind: "partial", start, end: Math.min(end, size - 1) };
}

function splitOnce(text: string, sep: string): [string, string | null] {
  const at = text.indexOf(sep);
  if (at < 0) return [text, null];
  return [text.slice(0, at), text.slice(at + sep.length)];
}

/** 10 進の非負整数だけを受ける。`parseInt` と違い "12abc" を 12 と読まない */
function toInt(text: string): number | null {
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) ? value : null;
}
