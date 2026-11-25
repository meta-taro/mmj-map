/**
 * 部品（カスタム要素）を React の部品にする。**中身は部品のまま**で、ここは受け渡しだけ。
 *
 * React 18 はカスタム要素の出来事（`mmj-ready` など）を受け取れず、値（プロパティ）も渡せない。
 * 19 は渡せるが、要素が登録される前に描くと属性の文字になる。**どちらの版でも同じに動くように**、
 * 出来事と値は描いたあとに要素へ直接付ける。
 */
import { createElement, forwardRef, useCallback, useEffect, useLayoutEffect, useRef } from "react";

import { shouldAssign, splitProps } from "./props.js";

/** サーバーで描くときは layout effect を使わない（React が警告を出す） */
const useClientEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;

/** @type {Promise<unknown> | null} */
let loading = null;

/**
 * 部品を登録する。**サーバーでは読まない**——部品は `HTMLElement` を継ぐので、
 * サーバーで読むと落ちる（Next.js などの SSR）。頁が `<script>` で先に読んでいれば何もしない。
 * @param {string} tagName
 */
function ensureDefined(tagName) {
  if (customElements.get(tagName) !== undefined || loading !== null) return;
  loading = import("@mmj-map/elements").catch((error) => {
    loading = null;
    console.error("[@mmj-map/react] @mmj-map/elements を読めませんでした", error);
  });
}

/**
 * @param {string} tagName 例: `"mmj-map"`
 * @param {readonly string[]} [propertyNames] 属性ではなく値として渡す名前（例: `["value"]`）
 */
export function createComponent(tagName, propertyNames = []) {
  const Component = forwardRef(function MmjComponent(/** @type {any} */ props, forwardedRef) {
    /** @type {import("react").MutableRefObject<any>} */
    const element = useRef(null);
    const { attributes, events, properties } = splitProps(props, propertyNames);

    // **受け口は最新のものを呼ぶ。**描くたびに付け直さない（付け外しの間に届いた出来事を落とさない）
    const handlers = useRef(events);
    handlers.current = events;
    const eventKey = Object.keys(events).sort().join("|");

    useClientEffect(() => ensureDefined(tagName), []);

    useClientEffect(() => {
      const node = element.current;
      if (node === null || eventKey === "") return undefined;
      const listeners = eventKey.split("|").map((name) => {
        const listener = (/** @type {Event} */ event) => handlers.current[name]?.(event);
        return /** @type {const} */ ([name, listener]);
      });
      for (const [name, listener] of listeners) node.addEventListener(name, listener);
      return () => {
        for (const [name, listener] of listeners) node.removeEventListener(name, listener);
      };
    }, [eventKey]);

    /** @type {import("react").MutableRefObject<Record<string, unknown>>} */
    const assigned = useRef({});
    useClientEffect(() => {
      const node = element.current;
      if (node === null || Object.keys(properties).length === 0) return undefined;
      let cancelled = false;
      const assign = () => {
        if (cancelled) return;
        for (const [name, value] of Object.entries(properties)) {
          if (shouldAssign(assigned.current[name], value, node[name])) node[name] = value;
        }
        assigned.current = properties;
      };
      // **登録を待ってから入れる。**登録前に入れると、要素そのものの値になって部品の口を隠す
      if (customElements.get(tagName) !== undefined) assign();
      else void customElements.whenDefined(tagName).then(assign);
      return () => {
        cancelled = true;
      };
    });

    const setRef = useCallback(
      (/** @type {any} */ node) => {
        element.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef !== null && forwardedRef !== undefined) forwardedRef.current = node;
      },
      [forwardedRef],
    );

    return createElement(tagName, { ...attributes, ref: setRef }, props.children);
  });
  Component.displayName = tagName
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return Component;
}
