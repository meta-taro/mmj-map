/**
 * 「この地図はいつのものか」を読む。**ここは純粋関数。**通信も DOM も触らない。
 *
 * ## なぜ要るのか
 *
 * 配った `.pmtiles` は**凍った成果物**。上流は毎日更新されるが、
 * **手元のファイルは切った日のまま**で、置き換えるまで古びていく。
 *
 * **「自分のものになる」製品の最悪の壊れ方がこれ。**
 * 8 か月前の地図を配り続けていても、**画面には何も出ない**ので誰も気づけない。
 * 所有には**古びる責任**が付いてくる。
 *
 * ## データはすでに入っている
 *
 * 配信中の `demo.pmtiles` を読んだ実測（2026-09-30）:
 *
 *     planetiler:osm:osmosisreplicationtime = 2026-09-15T04:00:00Z
 *     planetiler:buildtime                  = 2026-03-28T14:41:39.524Z
 *     version                               = 4.15.2
 *
 * **足りなかったのは「持っていないこと」ではなく「出していないこと」。**
 * Protomaps / planetiler で作られたタイルなら、
 * **利用者が自分で切ったものにも同じ値が入る**。
 */

/**
 * 地図データの時点。**OSM がいつの状態か**を優先する。
 *
 * `osmosisreplicationtime` は**取り込んだ OSM の時刻**で、これが「地図がいつのものか」。
 * `buildtime` は**タイルを組み立てた時刻**で、ずれることがある
 * （実測: 取り込みは 2026-09、組み立ては 2026-03 と出ていた）。
 * **組み立て時刻を「地図の時点」と名乗らない。**
 *
 * @param {Record<string, unknown> | null | undefined} metadata PMTiles のメタデータ
 * @returns {string | null} `2026-09-15T04:00:00Z` の形。読めなければ null
 */
export function asOfTime(metadata) {
  if (typeof metadata !== "object" || metadata === null) return null;
  const record = /** @type {Record<string, unknown>} */ (metadata);
  const candidates = [record["planetiler:osm:osmosisreplicationtime"], record["planetiler:buildtime"]];
  for (const value of candidates) {
    if (typeof value !== "string" || value === "") continue;
    // **読めない値を通さない。**日付でないものを「時点」として出すと、嘘になる
    if (Number.isNaN(Date.parse(value))) continue;
    return value;
  }
  return null;
}

/**
 * 帰属表示の隣に出す一行。**月までしか出さない。**
 *
 * 日まで出すと「今日の地図」に見える。**実際には切った日で凍っている**ので、
 * 月の粒度が正直（時差でずれる日付を、時差の話なしに出さない）。
 *
 * @param {Record<string, unknown> | null | undefined} metadata
 * @returns {string | null} 例 `地図データ: 2026-09 時点`。読めなければ null
 */
export function asOfLabel(metadata) {
  const time = asOfTime(metadata);
  if (time === null) return null;
  const date = new Date(time);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `地図データ: ${date.getUTCFullYear()}-${month} 時点`;
}

/**
 * 古びているか。**しきい値は呼ぶ側が決める**（配る頻度は製品ごとに違う）。
 *
 * @param {Record<string, unknown> | null | undefined} metadata
 * @param {Date} now
 * @param {number} days この日数より古ければ true
 * @returns {boolean} 判断できなければ false（**決めつけない**）
 */
export function isStale(metadata, now, days) {
  const time = asOfTime(metadata);
  if (time === null) return false;
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) return false;
  if (typeof days !== "number" || !Number.isFinite(days)) return false;
  return (now.getTime() - Date.parse(time)) / 86_400_000 > days;
}

/**
 * 帰属表示へ時点を足したスタイルを返す。**元のスタイルは書き換えない。**
 *
 * **地図は単体で持ち歩かれる。**オフラインで端末に入ったあと、配布元の頁は
 * 付いて来ない。**時点を頁のどこかに書いても、読む人には届かない**ので、
 * `© OpenStreetMap contributors` の隣——地図の中——へ置く。
 *
 * @param {any} style 読み込んだスタイル
 * @param {string | null} label `asOfLabel` の結果
 * @returns {any} 新しいスタイル（`label` が null なら元のまま）
 */
export function withAsOf(style, label) {
  if (label === null || label === "" || typeof style !== "object" || style === null) return style;
  const sources = style.sources;
  if (typeof sources !== "object" || sources === null) return style;

  /** @type {Record<string, any>} */
  const next = {};
  let touched = false;
  for (const [id, source] of Object.entries(sources)) {
    const value = /** @type {any} */ (source);
    // **ベース地図だけに足す。**利用者が重ねた点や面の出典に、
    // ベース地図の時点を混ぜると**どちらの時点か分からなくなる**
    if (typeof value?.url !== "string" || !value.url.startsWith("pmtiles://")) {
      next[id] = source;
      continue;
    }
    const before = typeof value.attribution === "string" ? value.attribution : "";
    // 同じ文を 2 回足さない（読み込み直しでも増えない）
    next[id] = before.includes(label)
      ? value
      : { ...value, attribution: before === "" ? label : `${before} · ${label}` };
    touched = true;
  }
  return touched ? { ...style, sources: next } : style;
}
