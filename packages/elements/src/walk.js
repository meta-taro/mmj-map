/**
 * 経路の線から「歩く人に要るもの」を組む。**ここは純粋関数**（地図に触るのは `mmj-route.js`）。
 *
 * **経路は計算しない。**線は外（API でも、手元で前もって計算したものでも）から来る。
 * ここがやるのは、**渡された線の形を読んで見せ方を決めること**だけ。
 * 「データを持たない。表現を持つ」の範囲に収まる:
 *
 *   - 距離と所要分数（線の長さを測るだけ）
 *   - 曲がり角の「左へ／右へ」（線の折れ角を読むだけ）
 *   - 目印（ベース地図にもう入っているお店から選ぶだけ）
 *   - 出発と到着の印（線の両端）
 *
 * ## なぜ要るのか
 *
 * 2026-11-13、MMJ を使ったホテル検索サイトが「駅からの徒歩経路」を出そうとして、
 * `<mmj-route>` が線を描くだけなので、**案内・分数・目印・両端の印を全部自前で作る**ことになった。
 * 店が約 4,000 あると、案内文を前もって作って保存するのも重い。
 * **線さえ渡せば、ここまで出るようにする。**
 */

/** 渡されなかったときの値 */
export const WALK_DEFAULTS = {
  /**
   * 1 分に歩く距離（m）。**不動産の表示の決まり（徒歩 1 分＝80m・端数は切り上げ）と同じ。**
   * 同じ頁に出ている「駅から徒歩◯分」と食い違わないようにする。
   */
  speed: 80,
  /** これより浅い折れは案内しない（度）。道なりに歩けば済む */
  minTurn: 30,
  /** これより深い折れは「斜め」ではなく、はっきり曲がる（度） */
  sharpTurn: 60,
  /**
   * 角の前後をどれだけ離れて見るか（m）。
   * **OSM の道は、角が細かい点の連なりになっていることが多い。**
   * すぐ隣の点だけで向きを測ると、1 つの角が浅い折れ 3 つに割れて、どれも案内されない。
   */
  lookAround: 15,
  /** これより近い折れは、同じ 1 つの角として数える（m） */
  mergeWithin: 20,
  /** 書いてある案内（`instruction`）からこの距離の内側には、自動の案内を重ねない（m） */
  nearExplicit: 20,
  /** 目印にする店は、角からこの距離まで（m） */
  landmarkRadius: 30,
  /** 距離は何 m 単位で見せるか */
  roundTo: 10,
};

/**
 * 目印になりやすい順。**曲がり角で人が探すのは、看板が目に入るもの。**
 * 種類は `styles/*.json` の `label-poi` が名前を出しているものと同じ範囲
 * （地図に名前が出ていないものを目印にすると、画面の上で探せない）。
 */
const LANDMARK_KINDS = [
  "convenience",
  "bank",
  "post_office",
  "pharmacy",
  "supermarket",
  "department_store",
  "mall",
  "hotel",
  "police",
  "fire_station",
  "hospital",
  "library",
  "museum",
  "theatre",
  "cinema",
  "school",
  "university",
  "college",
  "place_of_worship",
  "park",
  "attraction",
];

/** 地球の半径（m・平均） */
const EARTH_RADIUS = 6_371_008.8;
const RAD = Math.PI / 180;

/**
 * @typedef {[number, number]} LngLat
 * @typedef {{ name: string, kind: string, lngLat: LngLat }} Landmark
 * @typedef {{ lngLat: LngLat, turn: string, next: number, text: string, image: null, landmark: string | null }} TurnStep
 */

/** @param {any} data */
function features(data) {
  return Array.isArray(data?.features) ? data.features : [];
}

/**
 * 添字で読む。**範囲の内側だけを読む所で使う**（`lines` は 2 点以上の線しか返さない）。
 * 型の上で undefined を外すためだけのもので、範囲外を読めば素直に undefined が出る。
 * @template T @param {T[]} list @param {number} index @returns {T}
 */
const nth = (list, index) => /** @type {T} */ (list[index]);

/**
 * これより近い隣の点は、同じ点とみなして捨てる（m）。
 * **経路の出力は、始まりと終わりの点が二重になっていることが多い。**
 * 同じ点どうしの向きは「北」と読めてしまい、ありもしない角ができる（2026-11-13 のレビュー）。
 */
const SAME_POINT = 0.5;

/**
 * 線の座標の並びを取り出す。**数として読めない点・二重の点は捨てる**（壊れたデータで落ちない）。
 * 名札の名前を同じ線から取れるよう、`properties` も一緒に返す。
 * @param {any} data
 * @returns {{ points: LngLat[], properties: any }[]}
 */
function lines(data) {
  /** @type {{ points: LngLat[], properties: any }[]} */
  const found = [];
  for (const feature of features(data)) {
    if (feature?.geometry?.type !== "LineString") continue;
    const raw = feature.geometry.coordinates;
    if (!Array.isArray(raw)) continue;
    /** @type {LngLat[]} */
    const points = [];
    for (const p of raw) {
      if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
      /** @type {LngLat} */
      const point = [Number(p[0]), Number(p[1])];
      const previous = points[points.length - 1];
      if (previous && distance(previous, point) < SAME_POINT) continue;
      points.push(point);
    }
    if (points.length >= 2) found.push({ points, properties: feature.properties ?? {} });
  }
  return found;
}

/**
 * 2 点の距離（m）。大圏距離（haversine）。
 * @param {LngLat} a @param {LngLat} b
 */
function distance(a, b) {
  const dLat = (b[1] - a[1]) * RAD;
  const dLng = (b[0] - a[0]) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * a から b へ向かう方位（度・北が 0、時計回り）。**歩く距離では平面とみなして足りる。**
 * @param {LngLat} a @param {LngLat} b
 */
function bearing(a, b) {
  const east = (b[0] - a[0]) * Math.cos(((a[1] + b[1]) / 2) * RAD);
  const north = b[1] - a[1];
  return Math.atan2(east, north) / RAD;
}

/** -180〜180 に収める。**正が右（時計回り）** @param {number} degrees */
function normalize(degrees) {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

/** @param {number} meters */
function roundMeters(meters) {
  const unit = WALK_DEFAULTS.roundTo;
  return Math.max(unit, Math.round(meters / unit) * unit);
}

/**
 * 線の長さ（m）。線が何本あっても足す。**線が無ければ 0。**
 * @param {any} data GeoJSON
 */
export function routeLength(data) {
  let total = 0;
  for (const { points } of lines(data)) {
    for (let i = 1; i < points.length; i += 1) total += distance(nth(points, i - 1), nth(points, i));
  }
  return total;
}

/**
 * 距離と所要分数。**分数は切り上げ、0 分にはしない。**
 * **線が読めなければ両方 0**（呼ぶ側は出さない）。作った「徒歩 1 分・10m」を見せない。
 * @param {any} data GeoJSON
 * @param {number} [speed] 1 分に歩く距離（m）。読めなければ既定
 * @returns {{ meters: number, minutes: number }}
 */
export function walkSummary(data, speed = WALK_DEFAULTS.speed) {
  const pace = Number.isFinite(speed) && speed > 0 ? speed : WALK_DEFAULTS.speed;
  // **分数は、見せる距離から出す。**測ったままの 400.003m で切り上げると
  // 「400m・徒歩 6 分」になり、画面の上で数が食い違う
  const length = routeLength(data);
  if (length === 0) return { meters: 0, minutes: 0 };
  const meters = roundMeters(length);
  return { meters, minutes: Math.max(1, Math.ceil(meters / pace)) };
}

/**
 * 「徒歩 5 分・400m」。1km 以上は km（小数 1 桁）。
 * @param {{ meters: number, minutes: number }} summary
 */
export function formatWalk(summary) {
  const length = summary.meters >= 1000 ? `${(summary.meters / 1000).toFixed(1)}km` : `${summary.meters}m`;
  return `徒歩 ${summary.minutes} 分・${length}`;
}

/**
 * 線の両端。名前は線の `properties.from` / `to`（無ければ「出発」「到着」）。
 * **線が何本あっても、最初の線の始まりと最後の線の終わり。**
 * @param {any} data GeoJSON
 * @returns {{ start: { lngLat: LngLat, label: string }, end: { lngLat: LngLat, label: string } } | null}
 */
export function routeEnds(data) {
  const found = lines(data);
  if (found.length === 0) return null;
  // **名前と位置は同じ線から取る。**壊れた線の名前を、別の線の端に付けない
  const first = nth(found, 0);
  const last = nth(found, found.length - 1);
  const from = first.properties?.from;
  const to = last.properties?.to;
  return {
    start: { lngLat: nth(first.points, 0), label: typeof from === "string" && from.trim() !== "" ? from.trim() : "出発" },
    end: {
      lngLat: nth(last.points, last.points.length - 1),
      label: typeof to === "string" && to.trim() !== "" ? to.trim() : "到着",
    },
  };
}

/**
 * 角のそばの目印を 1 つ選ぶ。**目印になりやすい種類を優先し、同じ種類なら近いほう。**
 * 遠い・名前が無い・知らない種類のものは選ばない（それを頼りに探しても見つからない）。
 * @param {LngLat} corner
 * @param {Landmark[]} candidates
 * @returns {Landmark | null}
 */
export function pickLandmark(corner, candidates) {
  /** @type {{ landmark: Landmark, rank: number, meters: number } | null} */
  let best = null;
  for (const landmark of candidates) {
    if (typeof landmark?.name !== "string" || landmark.name.trim() === "") continue;
    const rank = LANDMARK_KINDS.indexOf(landmark.kind);
    if (rank < 0) continue;
    const meters = distance(corner, landmark.lngLat);
    if (meters > WALK_DEFAULTS.landmarkRadius) continue;
    if (best === null || rank < best.rank || (rank === best.rank && meters < best.meters)) {
      best = { landmark, rank, meters };
    }
  }
  return best?.landmark ?? null;
}

/**
 * 線の上で、始まりから `at` m の点。
 * @param {LngLat[]} points @param {number[]} along 各点までの累計距離 @param {number} at
 * @returns {LngLat}
 */
function pointAlong(points, along, at) {
  if (at <= 0) return nth(points, 0);
  const total = nth(along, along.length - 1);
  if (at >= total) return nth(points, points.length - 1);
  let i = 1;
  while (nth(along, i) < at) i += 1;
  const span = nth(along, i) - nth(along, i - 1);
  const t = span === 0 ? 0 : (at - nth(along, i - 1)) / span;
  const [a, b] = [nth(points, i - 1), nth(points, i)];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * 1 本の線の中の折れを拾う（まとめる前）。
 * @param {LngLat[]} points
 * @param {number[]} along
 * @returns {{ index: number, at: number, delta: number }[]}
 */
function rawTurns(points, along) {
  const look = WALK_DEFAULTS.lookAround;
  const found = [];
  for (let i = 1; i < points.length - 1; i += 1) {
    const at = nth(along, i);
    const corner = nth(points, i);
    const before = pointAlong(points, along, at - look);
    const after = pointAlong(points, along, at + look);
    const delta = normalize(bearing(corner, after) - bearing(before, corner));
    if (Math.abs(delta) >= WALK_DEFAULTS.minTurn) found.push({ index: i, at, delta });
  }
  return found;
}

/**
 * 近い折れを 1 つの角にまとめる。
 *
 * - **まとまりは、最初の折れから `mergeWithin` までで切る。**細かい折れが続いても、
 *   際限なく伸びて先の角を飲み込まない
 * - **向きは、まとまりの手前から先までの「正味」で決める。**左へ曲がってすぐ右へ戻る段差は
 *   向きが変わっていないので案内しない。深い折れ 1 つだけを見ると「左へ」とだけ言ってしまう
 * - 位置は、いちばん深く折れた点
 *
 * @param {LngLat[]} points @param {number[]} along
 * @param {{ index: number, at: number, delta: number }[]} turns
 */
function mergeTurns(points, along, turns) {
  /** @type {{ index: number, at: number, delta: number }[][]} */
  const clusters = [];
  for (const turn of turns) {
    const current = clusters[clusters.length - 1];
    if (current && turn.at - nth(current, 0).at <= WALK_DEFAULTS.mergeWithin) current.push(turn);
    else clusters.push([turn]);
  }

  const look = WALK_DEFAULTS.lookAround;
  return clusters
    .map((cluster) => {
      const deepest = cluster.reduce((a, b) => (Math.abs(b.delta) > Math.abs(a.delta) ? b : a));
      if (cluster.length === 1) return deepest;
      // **入る向きと出る向きを比べる。**角の点 1 つから測ると、段差の横ずれが向きに混ざる
      const first = nth(cluster, 0);
      const last = nth(cluster, cluster.length - 1);
      const incoming = bearing(pointAlong(points, along, first.at - look), nth(points, first.index));
      const outgoing = bearing(nth(points, last.index), pointAlong(points, along, last.at + look));
      return { index: deepest.index, at: deepest.at, delta: normalize(outgoing - incoming) };
    })
    .filter((turn) => Math.abs(turn.delta) >= WALK_DEFAULTS.minTurn);
}

/** @param {number} delta */
function turnWord(delta) {
  const side = delta > 0 ? "右へ" : "左へ";
  return Math.abs(delta) < WALK_DEFAULTS.sharpTurn ? `斜め${side}` : side;
}

/**
 * 書いてある案内（`instruction` を持つ点）の場所。ここの近くには自動の案内を重ねない。
 * @param {any} data @param {string} key
 * @returns {LngLat[]}
 */
function explicitPoints(data, key) {
  return features(data)
    // **文の無い点は数えない。**吹き出しにならない点が、自動の案内だけを消すと角に何も出なくなる
    .filter((/** @type {any} */ f) => {
      const text = f?.properties?.[key];
      return f?.geometry?.type === "Point" && typeof text === "string" && text !== "";
    })
    .map((/** @type {any} */ f) => /** @type {LngLat} */ ([Number(f.geometry.coordinates[0]), Number(f.geometry.coordinates[1])]))
    .filter((/** @type {LngLat} */ p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
}

/**
 * 曲がり角の案内を、線の形から作る。
 *
 * - 30 度より浅い折れは案内しない（道なりに歩けば済む）
 * - 60 度までは「斜め右へ」、それより深ければ「右へ」
 * - 次の角（最後の角なら到着）までの距離を添える
 * - **書いてある案内の近くには重ねない**（置く側が書いたほうを優先する）
 * - 目印の候補を渡せば「ローソンの角を左へ」にする
 *
 * @param {any} data GeoJSON
 * @param {{ landmarks?: Landmark[], stepKey?: string }} [options]
 * @returns {TurnStep[]}
 */
export function turnSteps(data, options = {}) {
  const explicit = explicitPoints(data, options.stepKey ?? "instruction");
  /** @type {TurnStep[]} */
  const steps = [];

  for (const { points } of lines(data)) {
    /** @type {number[]} */
    const along = [0];
    for (let i = 1; i < points.length; i += 1) along.push(nth(along, i - 1) + distance(nth(points, i - 1), nth(points, i)));
    const total = nth(along, along.length - 1);

    const turns = mergeTurns(points, along, rawTurns(points, along)).filter(
      (turn) => !explicit.some((p) => distance(p, nth(points, turn.index)) <= WALK_DEFAULTS.nearExplicit),
    );

    turns.forEach((turn, i) => {
      const nextAt = i + 1 < turns.length ? nth(turns, i + 1).at : total;
      const next = roundMeters(nextAt - turn.at);
      const lngLat = nth(points, turn.index);
      const word = turnWord(turn.delta);
      const landmark = options.landmarks ? pickLandmark(lngLat, options.landmarks) : null;
      const lead = landmark ? `${landmark.name}の角を${word}` : word;
      steps.push({
        lngLat,
        turn: word,
        next,
        text: `${lead}（その先 ${next}m）`,
        image: null,
        landmark: landmark?.name ?? null,
      });
    });
  }
  return steps;
}
