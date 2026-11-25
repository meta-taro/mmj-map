import { describe, expect, it } from "vitest";

import { listen } from "../src/listen.js";

/** MapLibre の on / off だけを真似る（層つきの受け口も同じ形で数える） */
function fakeMap() {
  /** @type {{ type: string, layer: string | null, fn: Function }[]} */
  const handlers = [];
  return {
    handlers,
    /** @param {string} type @param {any[]} rest */
    on(type, ...rest) {
      const fn = rest.at(-1);
      handlers.push({ type, layer: rest.length === 2 ? rest[0] : null, fn });
    },
    /** @param {string} type @param {any[]} rest */
    off(type, ...rest) {
      const fn = rest.at(-1);
      const layer = rest.length === 2 ? rest[0] : null;
      const index = handlers.findIndex((h) => h.type === type && h.layer === layer && h.fn === fn);
      if (index !== -1) handlers.splice(index, 1);
    },
    /** @param {string} type @param {any} event */
    fire(type, event = {}) {
      // 写しを回す（受け口の中で付け外しされても、数え間違えない）
      for (const h of handlers.slice()) if (h.type === type && h.layer === null) h.fn(event);
    },
  };
}

describe("listen", () => {
  it("removes exactly what it added, including the per-layer handlers", () => {
    const map = fakeMap();
    const off = listen(map, [
      ["click", () => {}],
      ["click", "points", () => {}],
      ["mouseenter", "points", () => {}],
    ]);
    expect(map.handlers).toHaveLength(3);
    off();
    expect(map.handlers).toEqual([]);
  });

  it("does not pile up when an element is attached and removed again and again", () => {
    const map = fakeMap();
    let clicks = 0;
    for (let i = 0; i < 5; i += 1) listen(map, [["click", () => (clicks += 1)]])();
    listen(map, [["click", () => (clicks += 1)]]);
    map.fire("click");
    // 付け外しを 5 回したあとでも、1 回押せば 1 回だけ届く
    expect(clicks).toBe(1);
  });

  it("is safe to call twice", () => {
    const map = fakeMap();
    const off = listen(map, [["moveend", () => {}]]);
    off();
    expect(() => off()).not.toThrow();
    expect(map.handlers).toEqual([]);
  });
});
