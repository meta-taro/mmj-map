/**
 * 地図に付けた受け口を、**付けたときと同じ形で外す**ための小さな道具。
 *
 * 部品を地図から外すと、層と source は片付けても、`map.on` で付けた受け口は残る。
 * 付け外しを繰り返すと受け口が溜まり、1 回押すと何度も届く（Issue #11）。
 * **付けたものを覚えておき、外すときにそのまま `map.off` へ渡す。**
 */

/**
 * @typedef {[string, Function] | [string, string, Function]} Handler
 *   `[出来事, 受け口]` か、層に付けるなら `[出来事, 層の id, 受け口]`（MapLibre の `on` と同じ並び）
 */

/**
 * @param {{ on: (...args: any[]) => unknown, off: (...args: any[]) => unknown }} map
 * @param {Handler[]} handlers
 * @returns {() => void} 外す。**2 回呼んでも何も起きない**
 */
export function listen(map, handlers) {
  for (const handler of handlers) map.on(...handler);
  let attached = true;
  return () => {
    if (!attached) return;
    attached = false;
    for (const handler of handlers) map.off(...handler);
  };
}
