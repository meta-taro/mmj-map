/**
 * React の props を、部品へ渡す 3 つに分ける（**DOM を触らない**。判断はここだけ）。
 *
 * - **属性**: `styleUrl="…"` → `style-url="…"`。`true` は付ける、`false` / `null` / `undefined` は付けない
 * - **出来事**: `onMmjRouteChange` → `mmj-route-change`、`onClick` → `click`
 * - **値（プロパティ）**: 部品ごとに決めた名前（`<mmj-route-editor>` の `value` など）。
 *   文字にすると壊れる GeoJSON の物などを、そのまま渡す
 *
 * **部品の属性の一覧をここに持たない。**一覧を持つと、部品に属性を足した日に React だけ遅れる。
 * 名前の書き換えだけにして、何が効くかは部品が決める。
 */

/** React が自分で扱うので、部品へ渡さないもの */
const REACT_OWN = new Set(["children", "key", "ref"]);

/** React の書き方のまま渡すもの（`style` は物、`className` は React が `class` にする） */
const PASS_THROUGH = new Set(["style", "className", "id"]);

/**
 * `styleUrl` → `style-url`。**すでにハイフンが入っている名前はそのまま**（`aria-label`・`data-x`）。
 * @param {string} name
 */
export function toAttributeName(name) {
  if (name.includes("-")) return name;
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * `onMmjRouteChange` → `mmj-route-change`。出来事の受け口でなければ `null`。
 * @param {string} name
 * @returns {string | null}
 */
export function toEventName(name) {
  if (!/^on[A-Z]/.test(name)) return null;
  return toAttributeName(name.slice(2)).replace(/^-/, "");
}

/**
 * 属性に書ける形にする。付けないなら `null`。
 *
 * **`true` は `true` のまま渡す。**空の文字にすると、React 19 は要素が同じ名前の口を持つとき
 * （`draggable`・`hidden`）に `node.draggable = ""` と入れ、`false` になって `draggable="false"` が付いた
 * （react.html で確かめて見つけた）。`true` なら React 18 も 19 も、その属性を付ける。
 * @param {unknown} value
 * @returns {string | true | null}
 */
export function toAttributeValue(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return null;
  // `center={[135.5, 34.69]}` → `"135.5,34.69"`（部品の属性の書き方そのもの）
  if (Array.isArray(value)) return value.join(",");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * @param {Record<string, unknown>} props
 * @param {readonly string[]} propertyNames 属性ではなく値として渡す名前
 * @returns {{
 *   attributes: Record<string, unknown>,
 *   events: Record<string, Function>,
 *   properties: Record<string, unknown>,
 * }}
 */
export function splitProps(props, propertyNames) {
  /** @type {Record<string, unknown>} */
  const attributes = {};
  /** @type {Record<string, Function>} */
  const events = {};
  /** @type {Record<string, unknown>} */
  const properties = {};
  for (const [name, value] of Object.entries(props)) {
    if (REACT_OWN.has(name)) continue;
    if (propertyNames.includes(name)) {
      if (value !== undefined) properties[name] = value;
      continue;
    }
    const event = toEventName(name);
    if (event !== null) {
      if (typeof value === "function") events[event] = value;
      continue;
    }
    if (PASS_THROUGH.has(name)) {
      if (value !== undefined && value !== null) attributes[name] = value;
      continue;
    }
    const text = toAttributeValue(value);
    if (text !== null) attributes[toAttributeName(name)] = text;
  }
  return { attributes, events, properties };
}

/**
 * 値を部品へ入れ直すか。**同じものを入れ直さない。**
 *
 * `<mmj-route-editor>` は `value` を入れ直すと「1 つ戻す」の履歴を消す。
 * 受け取った GeoJSON をそのまま state に入れて戻す書き方（React でよくある形）でも、
 * 中身が同じなら入れ直さないので、履歴は消えず、出来事の往復も止まる。
 *
 * @param {unknown} previous 前に描いたときの props の値
 * @param {unknown} next 今回の props の値
 * @param {unknown} current 部品がいま持っている値
 */
export function shouldAssign(previous, next, current) {
  if (Object.is(previous, next)) return false;
  return sameJson(next, current) === false;
}

/** @param {unknown} a @param {unknown} b */
function sameJson(a, b) {
  try {
    const left = typeof a === "string" ? JSON.parse(a) : a;
    return JSON.stringify(left) === JSON.stringify(b);
  } catch {
    // 読めない文字は「違う」として部品へ渡す（部品が空の経路にして、理由を出す）
    return false;
  }
}
