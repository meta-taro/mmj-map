/**
 * タイルが入っていない場所を、入っていないと見せる。**ここは純粋関数。**
 *
 * 1 つの `.pmtiles` は地球の一部しか持たない（デモは大阪だけの 62.8 MB）。
 * それまでは、その外へ動かすと `background` の色だけが残った。
 * **「読み込み中」とも「壊れた」とも区別がつかない。**
 *
 * この製品は**利用者が自分で範囲を切り出す**前提なので、
 * 「持っている範囲の縁」は例外ではなく**通常の状態**。通常の状態には表示が要る。
 *
 * ## なぜヘッダの範囲を使わないか
 *
 * PMTiles のヘッダは範囲を名乗るが、**それは入っている範囲とは限らない。**
 * `demo.pmtiles` を実測した（2026-09-24・`pmtiles show`）:
 *
 *     bounds: (122.93, 20.42) - (153.99, 45.56)   ← 日本全体と名乗る
 *
 * 実際は **z0–9 が全国の俯瞰・z10–15 が大阪だけ**という二段構えで、
 * **四角 1 つでは表せない**（`tools/tiles/manifest.json` の `demo` 区画）。
 * 宣言を信じると、**入っていない場所を「入っている」と描く**ことになる。
 *
 * ## 代わりに見るもの
 *
 * **実際に取りに行った結果。** pmtiles のプロトコルは、無いタイルに対して
 * `{data: null}` を返す（配信中の `pmtiles@4.4.0` の実体を読んで確認）。
 * タイルの URL は `pmtiles://<書庫>/<z>/<x>/<y>`。
 * **返ってこなかったタイルの四角を塗る。**
 *
 *   - ズームで範囲が変わる書庫でも正しい
 *   - 利用者が自分で切り出した書庫でも、**宣言なしで効く**
 *   - **嘘をつけない。**描いているのは「取りに行って空だった場所」そのもの
 */

/** 作るものの名前。**接頭辞を揃えて、手書きスタイルの層と混ざらないようにする** */
const SOURCE_ID = "mmj-missing";
const FILL_ID = "mmj-missing-fill";

/** `pmtiles://<書庫>/<z>/<x>/<y>`。**末尾の 3 つを取る**（書庫の URL に数字が入りうる） */
const TILE_URL = /\/(\d+)\/(\d+)\/(\d+)$/;

/** `"z/x/y"` の形 */
const TILE_KEY = /^(\d+)\/(\d+)\/(\d+)$/;

/**
 * スタイルから色を読めなかったときに使う値。
 * **すべて `styles/modern-dark.json` に既にある値で、新しい色を作っていない**
 * （`attrs.js` の `POPUP_COLORS` と同じ約束。テストで縛ってある）。
 */
export const MISSING_COLORS = {
  /** ラベルの縁取り（`label-place-city` の text-halo-color）。地図に対して沈む色 */
  surface: "#111418",
  /** 地名ラベル（`label-place-city` の text-color） */
  text: "#D8DCE1",
  /** 細街路（`roads-minor` の line-color） */
  border: "#2E343B",
};

/**
 * タイル座標を経緯度の四角へ。**ここが Web メルカトルを触る唯一の場所。**
 *
 * @param {number} z
 * @param {number} x
 * @param {number} y
 * @returns {[number, number, number, number]} `[西, 南, 東, 北]`
 */
export function tileBounds(z, x, y) {
  const n = 2 ** z;
  const west = (x / n) * 360 - 180;
  const east = ((x + 1) / n) * 360 - 180;
  // **北が y の小さい側。**取り違えると、塗る四角が上下に裏返る
  const north = latitude(1 - (2 * y) / n);
  const south = latitude(1 - (2 * (y + 1)) / n);
  return [west, south, east, north];
}

/**
 * プロトコルが受け取った URL から、どのタイルかを読む。
 * **読めなければ null。**推測で座標を作らない。
 *
 * @param {unknown} url
 * @returns {{ z: number, x: number, y: number } | null}
 */
export function readTileKey(url) {
  if (typeof url !== "string") return null;
  const matched = TILE_URL.exec(url);
  if (matched === null) return null;
  return { z: Number(matched[1]), x: Number(matched[2]), y: Number(matched[3]) };
}

/**
 * そのタイルは「入っていない」か。
 *
 * **`null` だけを見てはいけない。**プロトコルの実装は `{data: null}` を返す場所を
 * 持っているが、**書庫に無いタイルは実際には長さ 0 のバッファで返ってくる**。
 * 実測（2026-09-24・`demo.pmtiles` の z11 を岐阜の上で 6 枚）:
 *
 *     /11/1800/809 -> 0    /11/1801/809 -> 0    /11/1799/809 -> 0
 *     /11/1800/810 -> 0    /11/1801/810 -> 0    /11/1799/810 -> 0
 *
 * `null` だけを見ていたときは **1 件も拾えなかった**（欠けた場所が塗られなかった）。
 *
 * @param {unknown} data プロトコルが返した `data`
 * @returns {boolean}
 */
export function isMissingTile(data) {
  if (data === null || data === undefined) return true;
  const length = /** @type {any} */ (data).byteLength ?? /** @type {any} */ (data).length;
  return typeof length === "number" && length === 0;
}

/**
 * タイルの URL から、どの書庫のものかを読む。
 *
 * **1 ページに書庫違いの地図が並ぶ**（`themes.html` は 6 枚）。
 * プロトコルの登録は 1 回きりなので、**記録を書庫ごとに分けないと混ざる。**
 *
 * @param {unknown} url
 * @returns {string | null} `pmtiles://` を外した書庫の URL
 */
export function readArchive(url) {
  if (typeof url !== "string") return null;
  if (!url.startsWith("pmtiles://")) return null;
  const body = url.slice("pmtiles://".length);
  const matched = TILE_URL.exec(body);
  if (matched === null) return null;
  return body.slice(0, matched.index);
}

/**
 * 欠けたタイルの四角を GeoJSON にする。
 *
 * **同じ鍵を 2 度渡しても 1 つ。**重ねて塗ると、そこだけ濃くなって
 * 「より無い場所」があるように見える。
 *
 * **空でも FeatureCollection を返す**（null ではない）。
 * 呼ぶ側が source を作り直さずに `setData` だけで済むようにするため。
 *
 * @param {Iterable<string>} keys `"z/x/y"` の並び
 * @returns {any} GeoJSON の FeatureCollection
 */
export function missingTilesFeature(keys) {
  /** @type {any[]} */
  const features = [];
  for (const key of new Set(keys)) {
    const matched = TILE_KEY.exec(key);
    // **読めない鍵は黙って捨てる。**1 つの壊れた値で、他の表示まで失わない
    if (matched === null) continue;

    const [west, south, east, north] = tileBounds(
      Number(matched[1]),
      Number(matched[2]),
      Number(matched[3]),
    );
    features.push({
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [west, south],
            [west, north],
            [east, north],
            [east, south],
            [west, south],
          ],
        ],
      },
    });
  }
  return { type: "FeatureCollection", features };
}

/**
 * 欠けた場所を塗る面。**色はスタイルから借りる**（`palette.js` の `readTheme`）。
 *
 * 部品が独自の色を持つと、配色を 6 枚に増やした時点で
 * **明るい地図の上に暗い面**のような噛み合わない画面になる（D-019 と同じ失敗）。
 *
 * @param {Partial<Record<"background" | "surface" | "text" | "muted" | "border", string | null>>} [theme]
 * @returns {{ sourceId: string, layers: any[] }}
 */
export function buildMissingLayers(theme = {}) {
  return {
    sourceId: SOURCE_ID,
    layers: [
      {
        id: FILL_ID,
        type: "fill",
        source: SOURCE_ID,
        paint: {
          // ラベルの縁取りの色＝**地図に対して読める色**として選ばれている値。
          // 地の色より一段沈めて、「ここには何も無い」を面で出す
          "fill-color": theme.surface ?? MISSING_COLORS.surface,
          "fill-opacity": 0.72,
        },
      },
    ],
  };
}

/**
 * 一行を出してよいか。
 *
 * **描けているなら出さない**（端が少し欠けているだけのことは普通にある）。
 * **まだ 1 枚も取りに行っていないなら出さない**（読み込み中に警告を出さない）。
 *
 * @param {{ rendered: number, missing: number }} state
 * @returns {boolean}
 */
export function shouldNotice(state) {
  return state.rendered === 0 && state.missing > 0;
}

/**
 * 外へ出たときに出す一行。
 *
 * **「エラー」と書かない。**壊れていないので、壊れたと読ませない。
 * 起きているのは「この `.pmtiles` にその範囲を入れていない」ことだけで、
 * **入れるかどうかは見ている人が決められる**（切り出しは自分でやるため）。
 *
 * @returns {string}
 */
export function coverageNotice() {
  return "このタイルに入っていない範囲です。切り出す範囲を広げると出ます。";
}

/**
 * Web メルカトルの逆変換。`t` は `1 - 2y/n`。
 * @param {number} t
 * @returns {number} 緯度（度）
 */
function latitude(t) {
  return (Math.atan(Math.sinh(Math.PI * t)) * 180) / Math.PI;
}
