/**
 * 吹き出しを「カード」にするための状態の判断。**ここは純粋関数。**DOM も地図も触らない。
 *
 * ## なぜ容れ物が先なのか
 *
 * 目的は**「地図から離れずに店を見て回る」**こと。媒体や地図サービスは、
 * ピンを押すと店舗ページへ飛ばすので、**戻ると地図が作り直され、
 * どこまで見たかが消える**。しかも 1 店あたり 1〜3 MB 動く。
 *
 * 写真・タブ・長文を足す前に、**それを収められる容れ物**が要る。
 * **幅 360px の吹き出しに写真とタブは入らない。**
 *
 * ## 3 つの状態
 *
 *     閉じている  →  吹き出し（一目で分かる）  →  最大化（地図いっぱい）
 *                          ⇅                        ⇅
 *                      見出しバーの [⤢] [⤡] [✕]
 *
 * **短い吹き出しには見出しバーを付けない。**「大阪城」の 3 文字に
 * ボタンを並べると、**箱がボタンで埋まる**（閉じるボタンを外したのと同じ理由）。
 */

/**
 * @typedef {"closed" | "popup" | "sheet" | "maximized"} CardState
 *
 * `sheet` は**狭い画面で下から出る面**。**地図は上に残る。**
 *
 * 以前は狭い画面でもいきなり `maximized`（地図いっぱい）にしていたが、
 * **地図が消えると「押した点」と「出てきた面」のつながりが切れる**。
 * 人からの言葉は「マップ全体にひろがって見にくかったというか、
 * なんおこっちゃとなりました」（2026-09-29）。
 * Google マップも Apple マップも、スマホでは下から出る面で地図を残している。
 */

/**
 * 見出しバーを付けはじめる中身の数。
 *
 * 文字だけ（1 つ）なら今までどおりの吹き出し。写真が付く（2 つ以上）と容れ物になる。
 */
const RICH_PART_THRESHOLD = 2;

/**
 * 狭い画面では、吹き出しではなく最大化から始める。
 *
 * **幅 360px に写真とタブは入らない。**吹き出しは地図の上に浮くので、
 * 画面が狭いほど「地図が見えない・中身も読めない」の両方が起きる。
 *
 * **数字は実測で決め直すこと。**いまは一般的な携帯の幅（375〜430）を
 * 全部含む値に置いている。
 */
export const NARROW_WIDTH = 480;

/**
 * 次の状態を決める。**知らない指示では状態を変えない。**
 *
 * @param {CardState} current
 * @param {"open" | "maximize" | "restore" | "close"} action
 * @param {CardState} [rest] 最大化から戻る先。狭い画面では "sheet"
 * @returns {CardState}
 */
export function nextCardState(current, action, rest = "popup") {
  switch (action) {
    case "open":
      // **開いているものを開き直さない。**最大化中に目印を押しても縮まない
      return current === "closed" ? rest : current;
    case "maximize":
      // 閉じているものは広げない（**中身が無い箱を開かない**）
      return current === "closed" ? "closed" : "maximized";
    case "restore":
      // **帰る先は画面で違う。**広い画面は吹き出し、狭い画面は下から出る面
      return current === "maximized" ? rest : current;
    case "close":
      return "closed";
    default:
      return current;
  }
}

/**
 * その状態で出すボタン。
 *
 * **最大化中に「最大化」を出さない。**押しても何も起きないボタンを置くと、
 * 壊れているのか仕様なのか分からない。**送り先が無いときの「次へ」も同じ**。
 *
 * @param {CardState} state
 * @param {number} [siblings] その地図にある点の数。2 件以上で送りボタンが出る
 * @returns {("prev" | "next" | "maximize" | "restore" | "close")[]}
 */
export function controlsFor(state, siblings = 1) {
  if (state === "closed") return [];
  /** @type {("prev" | "next")[]} */
  const nav = typeof siblings === "number" && siblings > 1 ? ["prev", "next"] : [];
  // **下から出る面も、吹き出しと同じボタン。**押す人にとっては同じ「小さいほう」
  return state === "maximized" ? [...nav, "restore", "close"] : [...nav, "maximize", "close"];
}

/** ボタンに出す文字。**記号だけにしない**（読み上げにも押す人にも伝わらない） */
export const CONTROL_LABELS = {
  prev: "前の地点",
  next: "次の地点",
  maximize: "大きく表示",
  restore: "元の大きさに戻す",
  close: "閉じる",
};

/**
 * 隣の点へ送る。**端まで行ったら反対側へ回る。**
 *
 * 端でボタンを消すと**バーの並びがずれて、押す場所が動く**。
 * 端で無反応にすると、**壊れているのか端なのか区別がつかない**。
 *
 * @param {number} current いまの位置
 * @param {number} delta 次へなら 1、前へなら -1
 * @param {number} length 点の数
 * @returns {number}
 */
export function stepIndex(current, delta, length) {
  if (!Number.isInteger(length) || length <= 0) return 0;
  const base = Number.isInteger(current) ? current : 0;
  return (((base + delta) % length) + length) % length;
}

/**
 * id で点を引く。**無ければ -1。**
 *
 * **数で書き出す媒体がある**（`"shop_id": 7`）。URL から来る値は必ず文字列なので、
 * **文字に揃えてから比べる**。揃えないと「7 と "7" が別物」になり、
 * 共有された URL が**その店だけ開けない**という形で壊れる。
 *
 * @param {readonly any[]} features
 * @param {string | null | undefined} idKey
 * @param {string | null | undefined} id
 * @returns {number}
 */
export function indexOfShop(features, idKey, id) {
  if (!Array.isArray(features)) return -1;
  if (idKey === null || idKey === undefined || idKey === "") return -1;
  if (id === null || id === undefined || id === "") return -1;
  return features.findIndex((feature) => {
    const value = feature?.properties?.[idKey];
    return value !== undefined && value !== null && String(value) === String(id);
  });
}

/**
 * URL の query に、いま見ている点を書く。**新しい文字列を返す**（元は変えない）。
 *
 * **知らない値に触らない。**媒体は `?utm_source=...` のような値を付ける。
 * 丸ごと差し替えると、**その頁がどこから来たかを消してしまう**。
 * `&` で区切られた要素のうち `shop=` だけを入れ替える。
 *
 * @param {string} search いまの `location.search`
 * @param {string | null} id 書く id。`null` で外す
 * @returns {string} 新しい query（空なら空文字）
 */
export function writeShopParam(search, id) {
  const body = typeof search === "string" ? search.replace(/^\?/, "") : "";
  const kept = body.split("&").filter((part) => part !== "" && !part.startsWith("shop="));
  // **記号も日本語も通す。**`&` が入った id をそのまま置くと、区切りとして読まれる
  const parts = id === null || id === undefined ? kept : [...kept, `shop=${encodeURIComponent(id)}`];
  return parts.length === 0 ? "" : `?${parts.join("&")}`;
}

/**
 * 見出しバーを付けるか。
 *
 * **短い吹き出しには付けない。**「大阪城」だけの箱にボタンを並べると、
 * 箱がボタンで埋まる。中身が増えたときだけ容れ物になる。
 *
 * @param {readonly unknown[]} parts `popup.js` が組んだ中身
 * @returns {boolean}
 */
export function needsChrome(parts) {
  return Array.isArray(parts) && parts.length >= RICH_PART_THRESHOLD;
}

/**
 * 開いたときの最初の状態。
 *
 * **狭い画面では最大化から始める。**幅 360px の吹き出しに写真は入らない。
 * **見出しバーを持たない短い吹き出しは広げない**（広げても中身が無い）。
 *
 * @param {{ width: number, rich: boolean }} input
 * @returns {CardState}
 */
export function initialCardState(input) {
  if (!input.rich) return "popup";
  // **狭い画面は下から出る面。**全面にすると地図が消え、押した点とのつながりが切れる
  return input.width < NARROW_WIDTH ? "sheet" : "popup";
}

/**
 * キーの割り当て。**Escape は 1 段だけ戻す。**
 *
 * 最大化中の Escape でいきなり閉じると、**読んでいた店が消える**。
 * まず吹き出しへ戻し、もう一度で閉じる（ブラウザの全画面と同じ挙動）。
 *
 * @param {string} key
 * @param {CardState} state
 * @returns {"restore" | "close" | null} 何もしないなら null
 */
export function keyAction(key, state) {
  if (key !== "Escape") return null;
  if (state === "maximized") return "restore";
  if (state === "popup" || state === "sheet") return "close";
  return null;
}

/** ここより上まで引き上げたら全面。**数字は実測で決め直すこと** */
const DROP_HIGH = 0.75;

/** ここより下まで引き下げたら閉じる */
const DROP_LOW = 0.25;

/**
 * つまんで動かした面を、指を離したところの高さで落ち着かせる。
 *
 * **横棒を出しておきながら動かなかった**（人からの指摘・2026-09-29
 * 「お店下から出る風で、実際動かないんで窓サイズ変えられない」）。
 * **触れそうに見えるのに触れないのは、横棒が無いより悪い。**
 *
 * **端は「戻る」側に寄せてある。**少し動かしただけで全面になったり
 * 閉じたりすると、**触るのが怖くなる**。
 *
 * @param {number} ratio 地図の高さに対する、面の高さの割合（0〜1）
 * @returns {"maximize" | "close" | "rest"}
 */
export function dropAction(ratio) {
  if (typeof ratio !== "number" || !Number.isFinite(ratio)) return "rest";
  if (ratio > DROP_HIGH) return "maximize";
  if (ratio < DROP_LOW) return "close";
  return "rest";
}

/**
 * `card-tabs` の指定を読む。**「見出し:属性名」の組**を並べたもの。
 *
 *     card-tabs="品書き:menu,クーポン:coupon"
 *
 * **渡すのは属性名で、値ではない**（`card-*` と同じ）。
 * **見出しだけは値**——媒体の属性名をそのまま画面に出すと `menu` と出てしまう。
 *
 * **壊れた指定で全部を捨てない。**書けている組だけ出す
 * （1 か所の書き間違いで、タブが丸ごと消えるほうが分かりにくい）。
 *
 * @param {string | null | undefined} attribute
 * @returns {{ label: string, key: string }[]}
 */
export function parseTabs(attribute) {
  if (typeof attribute !== "string" || attribute.trim() === "") return [];

  /** @type {{ label: string, key: string }[]} */
  const tabs = [];
  const seen = new Set();
  for (const chunk of attribute.split(",")) {
    const at = chunk.indexOf(":");
    if (at < 0) continue;
    const label = chunk.slice(0, at).trim();
    const key = chunk.slice(at + 1).trim();
    if (label === "" || key === "" || seen.has(key)) continue;
    seen.add(key);
    tabs.push({ label, key });
  }
  return tabs;
}

/**
 * `card-links` の指定を読む。**「見出し:属性名[:アイコンの URL]」の組。**
 *
 *     card-links="Instagram:ig_url:./icons/ig.svg,X:x_url"
 *
 * **MMJ はブランドのアイコンを配らない。**商標なので、こちらが持つと
 * **使う側が意図しない形で配る**ことになる。置く側が自分のものを渡す。
 * アイコンは省ける（省くと文字だけのリンクになる）。
 *
 * @param {string | null | undefined} attribute
 * @returns {{ label: string, key: string, icon: string | null }[]}
 */
export function parseLinks(attribute) {
  if (typeof attribute !== "string" || attribute.trim() === "") return [];

  /** @type {{ label: string, key: string, icon: string | null }[]} */
  const links = [];
  for (const chunk of attribute.split(",")) {
    const parts = chunk.split(":");
    const label = (parts[0] ?? "").trim();
    const key = (parts[1] ?? "").trim();
    if (label === "" || key === "") continue;
    // アイコンの URL に `:` が入る（`https://`）ので、**3 つ目から後ろは繋ぎ直す**
    const icon = parts.slice(2).join(":").trim();
    links.push({ label, key, icon: icon === "" ? null : icon });
  }
  return links;
}

/**
 * リンクの中身を読む。**中身があって、安全なものだけ返す。**
 *
 * @param {Record<string, unknown>} properties
 * @param {readonly { label: string, key: string, icon: string | null }[]} spec
 * @param {(value: any) => boolean} isSafe URL を確かめる関数（`popup.js` の `isSafeLink`）
 * @returns {{ label: string, href: string, icon: string | null }[]}
 */
export function buildLinks(properties, spec, isSafe = defaultIsSafe) {
  if (!Array.isArray(spec)) return [];
  /** @type {{ label: string, href: string, icon: string | null }[]} */
  const links = [];
  for (const { label, key, icon } of spec) {
    const value = properties?.[key];
    if (!isSafe(value)) continue;
    // **アイコンも同じ目で見る。**`javascript:` を `img` の src に入れない
    links.push({ label, href: String(value).trim(), icon: isSafe(icon) ? icon : null });
  }
  return links;
}

/**
 * URL として通してよいか。**`popup.js` の `isSafeLink` と同じ約束。**
 *
 * **2 か所に同じものを書くのは、片方だけ直るから避けたい。**
 * ただし `card.js` は DOM も他の部品も知らない純粋な層なので、
 * **呼ぶ側が渡せる形**にしてあり、`mmj-poi` は `popup.js` のものを渡している。
 *
 * @param {unknown} value
 */
function defaultIsSafe(value) {
  if (typeof value !== "string") return false;
  const url = value.trim();
  if (url === "") return false;
  return /^(https?:|mailto:|tel:|[./#?])/i.test(url);
}

/**
 * タブの中身を読む。**中身のあるタブだけ返す。**
 *
 * 押しても何も出ないタブを並べると、**壊れているのか空なのか分からない**
 * （`controlsFor` と同じ理由）。店ごとにクーポンの有無が違うので、ここで効く。
 *
 * @param {Record<string, unknown>} properties
 * @param {readonly { label: string, key: string }[]} spec
 * @returns {{ label: string, text: string }[]}
 */
export function buildTabs(properties, spec) {
  if (!Array.isArray(spec)) return [];
  /** @type {{ label: string, text: string }[]} */
  const tabs = [];
  for (const { label, key } of spec) {
    const value = properties?.[key];
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text === "") continue;
    tabs.push({ label, text });
  }
  return tabs;
}

/**
 * `card-live` の指定を読む。**「見出し:URL の型」。**
 *
 *     card-live="いまの情報:./live/{id}.json"
 *
 * ## なぜ別扱いなのか
 *
 * クーポン・シフト・今日の品切れは**時間で変わる**。GeoJSON に書くと
 * **地図と一緒に持ち歩かれて古くなり**、オフラインで開いた人に
 * **先月のクーポンが今日の顔で出る**。
 *
 * ## 代わりに払うもの
 *
 * **「どの店を開いたか」が配信元に伝わる。**MMJ の部品はどこへも送らないが、
 * **取りに行く先は使う側のサーバー**なので、そこには残る。
 * **使うかどうかは置く側が決める**（既定では取りに行かない）。
 *
 * @param {string | null | undefined} attribute
 * @returns {{ label: string, template: string } | null}
 */
export function parseLive(attribute) {
  if (typeof attribute !== "string" || attribute.trim() === "") return null;
  const at = attribute.indexOf(":");
  if (at < 0) return null;
  const label = attribute.slice(0, at).trim();
  // URL に `:` が入る（`https://`）ので、**最初の 1 つだけで割る**
  const template = attribute.slice(at + 1).trim();
  if (label === "" || template === "") return null;
  return { label, template };
}

/**
 * 取りに行く URL を組む。**`{id}` が無い型は使わない。**
 *
 * `{id}` を書き忘れると、**全部の店で同じものを取りに行く**。
 * 画面には「何か出ている」ので、**間違いに気づけない**形になる。
 *
 * @param {string} template
 * @param {string | null | undefined} id
 * @returns {string | null}
 */
export function liveUrl(template, id) {
  if (typeof template !== "string" || !template.includes("{id}")) return null;
  if (id === null || id === undefined || String(id).trim() === "") return null;
  return template.replaceAll("{id}", encodeURIComponent(String(id)));
}

/**
 * 取ってきたものから文字を読む。**中身が無ければ null**（空のタブを出さない）。
 *
 * 文字列そのままでも、`{"text": "..."}` でも受ける。
 * **形を 1 つに決めない**のは、置く側の既存の API に合わせられるようにするため。
 *
 * @param {unknown} json
 * @returns {string | null}
 */
export function readLiveText(json) {
  const raw = typeof json === "string" ? json : /** @type {any} */ (json)?.text;
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  return text === "" ? null : text;
}

/**
 * カードの中身を「いつも見えるぶん」と「タブの中へ入れるぶん」に分ける。
 *
 * **題と写真は、タブを切り替えても出したまま。**どの店を見ているかが消えると、
 * **切り替えた先が何の店か分からなくなる**。
 *
 * **元の配列は変えない**（ECC coding-style）。
 *
 * @param {readonly any[]} parts `popup.js` が組んだ中身
 * @returns {{ head: any[], rest: any[] }}
 */
export function splitForTabs(parts) {
  if (!Array.isArray(parts)) return { head: [], rest: [] };
  // 先頭から続く「題（text）と写真（image）」までが、いつも見えるぶん
  let at = 0;
  while (at < parts.length && (parts[at]?.kind === "text" || parts[at]?.kind === "image")) at += 1;
  return { head: parts.slice(0, at), rest: parts.slice(at) };
}

/**
 * 指にいちばん近い点を選ぶ。**無ければ `null`。**
 *
 * **指は点より太い。**点は半径 5px（縁を入れて 13px）で、触る目標の目安
 * （Apple 44pt / Material 48dp）の 1/4 しかない。人からの言葉は
 * 「店舗のぽっちがちいさくてたぷしにくい」（2026-09-29）。
 *
 * そこで**見えない当たり判定を広げる**が、広げると**隣と重なる**。
 * 重なった候補の先頭を取ると、**目で見て選んだ点と違うものが開く**ので、
 * **押した位置にいちばん近い点**を選ぶ。
 *
 * **点だけを見る。**線や面は中心が意味を持たないので飛ばす。
 *
 * @param {readonly any[]} features 重なって返ってきた候補
 * @param {{ x: number, y: number } | null} point 押された画面上の位置
 * @param {(coordinates: any) => { x: number, y: number }} project 座標を画面へ写す関数
 * @returns {any | null}
 */
export function nearestByPoint(features, point, project) {
  if (!Array.isArray(features) || features.length === 0) return null;

  const points = features.filter((feature) => {
    const geometry = feature?.geometry;
    if (!geometry || !Array.isArray(geometry.coordinates)) return false;
    // `type` を持たない見本もあるので、**持っているときだけ弾く**
    return geometry.type === undefined || geometry.type === "Point";
  });
  if (points.length === 0) return null;
  if (points.length === 1 || point === null || point === undefined) return points[0];

  let best = points[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const feature of points) {
    const at = project(feature.geometry.coordinates);
    // **平方根を取らない。**比べるだけなので、二乗のままで順番は同じ
    const distance = (at.x - point.x) ** 2 + (at.y - point.y) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = feature;
    }
  }
  return best;
}

/**
 * カードが地図の外へ出ているぶんを、`map.panBy` に渡す値にして返す。
 *
 * **吹き出しは地図の座標に貼り付いている。**端の点を押すと、そのぶん外へ出る。
 * **外へ出たカードは、押せないだけでは済まない。**実測（2026-09-28）では
 * 地図の上端 y=265 に対し吹き出しの上端が y=168 になり、
 * **頁のヘッダの下に潜って、カードのボタンを押したつもりが
 * メニューのリンクを押していた**（別の頁へ飛ぶので、見ていた店も地図も消える）。
 *
 * **地図を送る向きと、画面で物が動く向きは逆。**カードを下へ出したいときは、
 * 地図を上へ送る（`panBy([0, -n])`）。
 *
 * @param {{ top: number, bottom: number, left: number, right: number } | null} card
 * @param {{ top: number, bottom: number, left: number, right: number } | null} map
 * @param {number} [margin] 端に残す余白
 * @returns {[number, number]} `map.panBy` に渡す値
 */
export function panDelta(card, map, margin = 8) {
  if (card === null || card === undefined || map === null || map === undefined) return [0, 0];

  /**
   * 1 方向ぶん。**入りきらないときは手前側（上・左）を合わせる。**
   * 見出しバーと題が上にあるので、**下が切れるより、バーが外にあるほうが困る**（閉じられない）。
   * @param {number} near カードの手前側
   * @param {number} far カードの奥側
   * @param {number} limitNear 地図の手前側
   * @param {number} limitFar 地図の奥側
   */
  const fit = (near, far, limitNear, limitFar) => {
    if (near < limitNear + margin) return near - (limitNear + margin);
    if (far > limitFar - margin) return far - (limitFar - margin);
    return 0;
  };

  return [
    fit(card.left, card.right, map.left, map.right),
    fit(card.top, card.bottom, map.top, map.bottom),
  ];
}

/**
 * 数として読む。**媒体の書き出しは文字列のことがある**（`"4.3"`）。
 * @param {unknown} value
 * @returns {number | undefined}
 */
function readNumberField(value) {
  if (typeof value === "number") return value;
  // 媒体の書き出しは文字列のことがある（`"4.3"`）。**数として読めるなら読む**
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

/**
 * GeoJSON の `properties` から、カードの中身へ割り当てる。
 *
 * **500 店を手書きしない。**`<mmj-poi label-key="shop_name">` と同じ発想で、
 * 「どの属性に何が入っているか」だけを受け取る。
 * **媒体ごとに名前が違う**（`name` / `title` / `shop_name`）ので、推測しない。
 *
 * ```html
 * <mmj-poi src="./shops.geojson"
 *          card-title="name" card-images="photos"
 *          card-rating="rating" card-rating-count="reviews"
 *          card-href="url" card-body="description"></mmj-poi>
 * ```
 *
 * **写真は配列でも、区切り文字でも受ける。**GeoJSON の属性に配列を入れられない
 * 書き出し方をする媒体があるため（実際に多い）。
 *
 * @param {Record<string, unknown>} properties
 * @param {Record<string, string | null>} keys `card-*` で指定された属性名
 * @returns {{
 *   title: unknown, images: unknown[], body: unknown,
 *   rating: number | undefined, ratingCount: number | undefined,
 *   href: unknown, hrefLabel: string | undefined,
 * }} `buildCardContent` へ渡す形
 */
export function mapCardFields(properties, keys) {
  const read = (/** @type {string | null | undefined} */ key) =>
    key === null || key === undefined || key === "" ? undefined : properties?.[key];

  const rawImages = read(keys.images);
  const images = Array.isArray(rawImages)
    ? rawImages
    : typeof rawImages === "string"
      // 区切りは `,` と改行の両方。**空白では割らない**（URL に空白は入らないが、
      // 題名に空白は入る——将来ここを使い回したときに壊れる）
      ? rawImages.split(/[,\n]/).map((s) => s.trim()).filter((s) => s !== "")
      : [];

  return {
    title: read(keys.title),
    images,
    body: read(keys.body),
    rating: readNumberField(read(keys.rating)),
    ratingCount: readNumberField(read(keys.ratingCount)),
    href: read(keys.href),
    hrefLabel: keys.hrefLabel ?? undefined,
  };
}

/**
 * URL の `?shop=<id>` から、開く店を読む。
 *
 * **「この店いいよ」と送るのは頁の共有。**復元できないと、結局
 * 店舗ページへ飛ばすことになり、**地図で完結させた意味が消える**。
 *
 * ## なぜ `#` ではなく `?` なのか
 *
 * **`#` は地図が持ち主。**`<mmj-map hash>` を付けると MapLibre が
 * `#15/34.70/135.49` を書き込むが、**その実装は自分の形以外を捨てる**
 * （`getHashString()` が `#${zoom}/${lat}/${lng}` を丸ごと返す・5.24.0 で確認）。
 * `#shop=` に置くと、**地図を少し動かしただけで消える**。
 * 消えたことは画面に出ないので、**共有して初めて壊れているのが分かる**。
 *
 * @param {string} search `location.search`
 * @returns {string | null}
 */
export function readShopParam(search) {
  // **`#` から後ろは見ない。**地図の持ち物なので、そこに書かれた `shop=` は
  // 次に地図が動いた瞬間に消える。**読めてしまうと、消えるものを当てにしてしまう**
  const body = (typeof search === "string" ? search : "").split("#")[0] ?? "";
  const match = /(?:^\?|[?&])shop=([^&]+)/.exec(body);
  if (match?.[1] === undefined) return null;
  try {
    return decodeURIComponent(match[1]) || null;
  } catch {
    // 壊れた URL で落とさない。**地図は出す**
    return null;
  }
}
