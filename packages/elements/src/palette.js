/**
 * 導入者の色を、スタイルの役割へ当てる。**ここは純粋関数。**
 *
 * **こちらは色を 1 つも作らない**（baseline §11 / D-002）。
 * 受け取った色を、どのレイヤのどの paint に置くかを決めているだけ。
 * 1 色から土台の配色を機械的に作る（陸・水・道の明度を振る）のは
 * **D-002 が採らなかった案**なので、ここには入れていない。
 *
 * 想定している使い方は 2 つ。
 *
 *   <mmj-map accent="#0A5FFF">             サイトのテーマカラー 1 色
 *   <mmj-map palette-url="./brand.json">   24 の役割を全部指定する
 *
 * どちらも、土台になるスタイル（`style-url`）は導入者が選ぶ。
 */

/**
 * 役割 → そのスタイルのどこに当たるか。
 *
 * **MMJ が配る 6 枚のレイヤ id に合わせてある**（6 枚とも同じ構成であることは
 * `tools/style-check/test/parity.test.ts` が見ている）。
 * 自前のスタイルでも、この id を保っていればそのまま当たる。
 *
 * **当たらなかったことは `applyPalette` の `applied` で分かる。**
 * 黙って 0 件で通すと、色を渡したのに何も変わらない地図が出る。
 */
export const ROLE_LAYERS = {
  background: [{ layer: "background", prop: "background-color" }],
  earth: [{ layer: "earth", prop: "fill-color" }],
  landcover: [{ layer: "landcover", prop: "fill-color" }],
  green: [{ layer: "landuse-green", prop: "fill-color" }],
  built: [{ layer: "landuse-built", prop: "fill-color" }],
  paved: [{ layer: "landuse-paved", prop: "fill-color" }],
  water: [{ layer: "water", prop: "fill-color" }],
  waterway: [{ layer: "waterway", prop: "line-color" }],
  buildings: [{ layer: "buildings", prop: "fill-color" }],
  path: [{ layer: "roads-path", prop: "line-color" }],
  "road-minor": [{ layer: "roads-minor", prop: "line-color" }],
  "road-medium": [{ layer: "roads-medium", prop: "line-color" }],
  "road-major": [{ layer: "roads-major", prop: "line-color" }],
  "highway-casing": [{ layer: "roads-highway-casing", prop: "line-color" }],
  highway: [{ layer: "roads-highway", prop: "line-color" }],
  rail: [{ layer: "rail", prop: "line-color" }],
  boundary: [{ layer: "boundaries", prop: "line-color" }],
  station: [{ layer: "station-dot", prop: "circle-stroke-color" }],
  "station-fill": [{ layer: "station-dot", prop: "circle-color" }],
  "label-city": [{ layer: "label-place-city", prop: "text-color" }],
  "label-station": [{ layer: "label-station", prop: "text-color" }],
  "label-neighbourhood": [{ layer: "label-place-neighbourhood", prop: "text-color" }],
  "label-water": [{ layer: "label-water", prop: "text-color" }],
  // 縁取りは 4 つのラベル全部に同じ色が要る。**1 つ漏らすと、そのラベルだけ縁が残る**
  halo: [
    { layer: "label-place-city", prop: "text-halo-color" },
    { layer: "label-station", prop: "text-halo-color" },
    { layer: "label-place-neighbourhood", prop: "text-halo-color" },
    { layer: "label-water", prop: "text-halo-color" },
  ],
};

/**
 * `accent` の 1 色が当たる役割。
 *
 * **地図全体をテーマカラーで塗らない。**塗ると地物の区別が付かなくなり、
 * 地図として読めなくなる。色を置くのは「そこが一番目に入る線」と
 * 「押せる点」に絞ってある。目印・まとまり・自前 POI の既定色も同じ色になる。
 *
 * **足りなければ `palette-url` で全部指定できる。**ここは便利のための既定であって、
 * 制限ではない。
 */
export const ACCENT_ROLES = ["highway", "station"];

/** 枠（ポップアップなど）が借りる色を、スタイルのどこから読むか */
const THEME_SOURCES = {
  background: { layer: "background", prop: "background-color" },
  text: { layer: "label-place-city", prop: "text-color" },
  muted: { layer: "label-place-neighbourhood", prop: "text-color" },
  border: { layer: "roads-minor", prop: "line-color" },
};

/**
 * paint から色を読む。**式（配列）やオブジェクトは色として読まない。**
 * `["interpolate", ...]` を CSS へ書くと、意味の無い文字列が入る。
 * @param {any} style
 * @param {{ layer: string, prop: string }} source
 * @returns {string | null}
 */
function readColor(style, source) {
  const layer = style?.layers?.find((/** @type {any} */ l) => l?.id === source.layer);
  const value = layer?.paint?.[source.prop];
  return typeof value === "string" ? value : null;
}

/**
 * 役割ごとの色をスタイルへ当てる。**元のスタイルは書き換えない**（ECC coding-style）。
 *
 * @param {any} style 読み込んだスタイル
 * @param {Record<string, string>} colors 役割 → 色
 * @returns {{ style: any, applied: number }} `applied` は実際に当たった paint の数
 */
export function applyPalette(style, colors) {
  /** @type {Map<string, Record<string, string>>} レイヤ id → 上書きする paint */
  const overrides = new Map();

  for (const [role, color] of Object.entries(colors ?? {})) {
    const targets = ROLE_LAYERS[/** @type {keyof typeof ROLE_LAYERS} */ (role)];
    if (!targets) continue; // 知らない役割は黙って無視する（数にも入れない）
    for (const target of targets) {
      const current = overrides.get(target.layer) ?? {};
      overrides.set(target.layer, { ...current, [target.prop]: color });
    }
  }

  let applied = 0;
  /** @type {any[]} */
  const layers = [];
  // `map` + spread ではなくループで組む。**不変のまま**（ECC coding-style）で、
  // lint の no-map-spread（「その場で書き換えろ」）とも衝突しない
  for (const layer of style?.layers ?? []) {
    const patch = overrides.get(layer?.id);
    if (patch === undefined) {
      layers.push(layer);
      continue;
    }
    applied += Object.keys(patch).length;
    layers.push({ ...layer, paint: { ...layer.paint, ...patch } });
  }

  return { style: { ...style, layers }, applied };
}

/**
 * `accent` の 1 色を、役割ごとの色へ広げる。
 * @param {string} color
 * @returns {Record<string, string>}
 */
export function accentPalette(color) {
  return Object.fromEntries(ACCENT_ROLES.map((role) => [role, color]));
}

/**
 * スタイルから、枠が借りる色を読む。
 *
 * **部品が色を持たないようにするために要る。**以前は暗いスタイルの値を
 * 部品側へ焼き込んでいたので、**明るいスタイルの上でポップアップだけ暗い箱**になっていた。
 *
 * 読めない値は `null`。**勝手に色を作らない**（baseline §11）。呼ぶ側が既定へ落とす。
 *
 * **テーマカラー（accent）はここに含めない。**含めると
 * 「導入者が渡した色」と「スタイルが元から持っている高速道路の色」が同じ名前になり、
 * **accent を渡していない地図の目印が灰色になる**（実際になった）。
 * 渡された色は `<mmj-map>` の `accent` プロパティが持つ。
 * @param {any} style
 */
export function readTheme(style) {
  return {
    background: readColor(style, THEME_SOURCES.background),
    text: readColor(style, THEME_SOURCES.text),
    muted: readColor(style, THEME_SOURCES.muted),
    border: readColor(style, THEME_SOURCES.border),
  };
}

/**
 * スタイル自身が名乗っているテーマカラーを読む。
 *
 * `pnpm palette -- --style` が作ったスタイルは、**作った元の指し値を metadata に持つ**。
 * そこから読めば、`accent` 属性を書かなくても目印やまとまりが地図と揃う。
 *
 * **手書きの 6 枚にはこの欄が無いので null**。高速道路の色で代用しない
 * （代用すると、テーマカラーを渡していない地図の目印が灰色になる）。
 *
 * @param {any} style
 * @returns {string | null}
 */
export function readDeclaredAccent(style) {
  const value = style?.metadata?.["mmj:anchors"]?.accent;
  return typeof value === "string" ? value : null;
}

/**
 * 配色ごとの CSS クラス名。
 *
 * ポップアップの CSS は `<head>` に 1 枚入れる形なので、**名前が同じだと
 * 1 ページに配色違いの地図を並べたとき、最初の 1 枚の色が全部に効く**
 * （`themes.html` は 6 枚並ぶ）。色から名前を作って混ざらないようにする。
 *
 * @param {{ background: string | null, text: string | null, border: string | null }} colors
 * @returns {string}
 */
export function themeClassName(colors) {
  const seed = `${colors.background}|${colors.text}|${colors.border}`;
  // 衝突しても実害が「同じ CSS を共有する」だけなので、短い決定的な値で足りる
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `mmj-popup-${(hash >>> 0).toString(36)}`;
}
