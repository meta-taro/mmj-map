/**
 * 自分の地点を名前で探す窓の判断。**ここは純粋関数。**DOM も地図も触らない。
 *
 * ## 何を探すのか
 *
 * **`<mmj-poi>` に渡された点だけ**を探す。地名や住所から場所を引く
 * ジオコーダは持たない（PRD §2「やらないこと」・D-033）。
 * 全国の地名を引くには地名の索引が要り、それは地点データベースそのものなので。
 *
 * 住所で探したい置き手は、**自分の選んだ住所検索を `geocode` へつなぐ**。
 * MMJ は「名前で当たらなかった問いを渡す」だけで、どこへも問い合わせない。
 *
 * ## 打ち方の揺れを揃える
 *
 * 人が打つ文字は揺れる（全角英数・カタカナ・大文字・空白）。
 * 揃えないと「カフェ」で「かふぇ」が当たらない。**読みがなの項目を足せば、
 * 漢字が打てなくても当たる**（`search-keys`）。
 */

/** 揃えた文字の中で、項目の境目に置く印。**問いの側には残らない**（空白は落とすため） */
const FIELD_GAP = " ";

/** カタカナ（ァ〜ヶ）とひらがなの差 */
const KANA_OFFSET = 0x60;

/**
 * 打ち方の揺れを揃える。全角→半角・大文字→小文字・カタカナ→ひらがな・空白を落とす。
 *
 * **長音と濁点は残す。**「らーめん」と「らめん」は別の語。
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeForSearch(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - KANA_OFFSET))
    .replace(/\s+/g, "");
}

/**
 * どの項目を探すか。`shop_name,shop_kana` のような**項目名の並び**。
 *
 * **指定が無ければ `card-title` の項目だけ。**勝手に属性名を推測して、
 * 関係のない値（説明文の一語など）で当てない。
 *
 * @param {string | null | undefined} attribute `search-keys`
 * @param {string | null | undefined} titleKey `card-title`
 * @returns {string[]}
 */
export function parseSearchKeys(attribute, titleKey) {
  /** @type {string[]} */
  const keys = [];
  if (typeof attribute === "string") {
    for (const raw of attribute.split(",")) {
      const name = raw.trim();
      if (name !== "" && !keys.includes(name)) keys.push(name);
    }
  }
  if (keys.length > 0) return keys;
  return typeof titleKey === "string" && titleKey !== "" ? [titleKey] : [];
}

/**
 * 探す 1 件。**揃えた文字を先に作っておく**（打つたびに全件を揃え直さない）。
 *
 * @typedef {{ id: string, text: string }} SearchEntry
 */

/**
 * 点の一覧から、探すための索引を作る。**順は点の順のまま**（プラン順を崩さない）。
 *
 * **id の無い点は入れない。**当たっても開けない。
 *
 * @param {readonly any[] | null | undefined} features
 * @param {string | null | undefined} idKey `card-id`
 * @param {readonly string[]} keys `parseSearchKeys` の結果
 * @returns {SearchEntry[]}
 */
export function buildSearchIndex(features, idKey, keys) {
  if (!Array.isArray(features) || typeof idKey !== "string" || idKey === "") return [];

  /** @type {SearchEntry[]} */
  const index = [];
  for (const feature of features) {
    const properties = feature?.properties ?? {};
    const id = properties[idKey];
    if (id === null || id === undefined || id === "") continue;
    const text = keys
      .map((key) => normalizeForSearch(properties[key]))
      .filter((part) => part !== "")
      .join(FIELD_GAP);
    index.push({ id: String(id), text });
  }
  return index;
}

/**
 * 問いに当たる id を、索引の順のまま返す。
 *
 * **空の問いは `null`**（絞り込まない）。「0 件」と「絞り込んでいない」を混ぜると、
 * 窓を空にしたとき一覧が全部消える。
 *
 * @param {readonly SearchEntry[]} index
 * @param {unknown} query
 * @returns {string[] | null}
 */
export function matchIds(index, query) {
  const needle = normalizeForSearch(query);
  if (needle === "") return null;
  return index.filter((entry) => entry.text.includes(needle)).map((entry) => entry.id);
}

/**
 * Enter を押したとき何をするか。
 *
 * **名前で当たるものを住所検索へ回さない。**外へ問い合わせる回数を増やさない
 * （置き手がつないだ先が従量課金かもしれない）。
 *
 * **一覧を読み終える前は待つ。**まだ 0 件に見えるだけなので、住所検索へ回さない。
 *
 * @param {unknown} query
 * @param {number | null} matchCount 名前で当たった数。一覧を読み終える前は `null`
 * @param {boolean} hasGeocoder 置き手が `geocode` をつないでいるか
 * @returns {"clear" | "wait" | "open" | "geocode" | "none"}
 */
export function planSearch(query, matchCount, hasGeocoder) {
  if (normalizeForSearch(query) === "") return "clear";
  if (matchCount === null) return "wait";
  if (matchCount > 0) return "open";
  return hasGeocoder ? "geocode" : "none";
}

/**
 * 住所検索から返った値を、`[経度, 緯度]` として読む。**読めなければ `null`。**
 *
 * **外から来た値を信じない。**範囲の外や NaN で地図を飛ばすと、
 * 海の真ん中か真っ白な画面になり、何が起きたか分からない。
 *
 * @param {unknown} value `[lng, lat]` / `{ lng, lat }` / `{ lon, lat }`
 * @returns {[number, number] | null}
 */
export function readLngLat(value) {
  /** @type {unknown} */
  let lng;
  /** @type {unknown} */
  let lat;
  if (Array.isArray(value)) {
    [lng, lat] = value;
  } else if (value !== null && typeof value === "object") {
    const object = /** @type {Record<string, unknown>} */ (value);
    lng = object.lng ?? object.lon;
    lat = object.lat;
  } else {
    return null;
  }
  if (typeof lng !== "number" || typeof lat !== "number") return null;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
  return [lng, lat];
}

/**
 * 窓の脇に出す件数。**絞り込んでいなければ空**（何も出さない）。
 *
 * **読み込み中に「見つかりません」と言わない。**まだ探していないだけ。
 *
 * @param {number | null} matched 当たった数。絞り込んでいなければ `null`
 * @param {number | null} total 一覧を読み終える前は `null`
 * @returns {string}
 */
export function searchCountLabel(matched, total) {
  if (matched === null) return "";
  if (total === null) return "読み込み中…";
  if (matched === 0) return "見つかりません";
  return `${matched} / ${total} 件`;
}
