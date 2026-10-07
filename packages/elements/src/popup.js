/**
 * 吹き出しの中身を組む。**ここは純粋関数**で、DOM は要素側が作る。
 *
 * **`setHTML` を使わない。**媒体が登録した文字列をそのまま HTML として実行すると、
 * `<img onerror=...>` の 1 行で、その地図を置いたページ全体が乗っ取られる。
 * この製品は「媒体側が POI を登録する」使い方を想定しているので、
 * **入ってくる文字列を信用しない**（baseline §21）。
 *
 * ここが返すのは**組み立ての指示**だけ。要素側が `createElement` と
 * `textContent` で組むので、文字が HTML として解釈される経路が存在しない。
 */

/**
 * 画像の URL として通してよいか。
 *
 * **通すのは http / https と相対パスだけ。**
 * `javascript:` は `src` に入れられると押した瞬間に走る。
 * `data:` は「画像に見せかけた SVG」からスクリプトが走る経路がある。
 * **迷ったら通さない**（通した結果は、置いた人のページで起きる）。
 * @param {string} value
 */
function isSafeImage(value) {
  const trimmed = value.trim();
  if (trimmed === "") return false;
  // 相対パスは土台から見て https になる。**通すのは http / https だけ**
  const scheme = schemeOf(trimmed);
  return scheme === "http" || scheme === "https";
}

/**
 * 相対パスを読むための土台。**外へ出ない名前**を使う（`.invalid` は予約で、
 * 誰も取れない）。ここへ通信することはなく、スキームを決めるためだけに要る。
 */
const RELATIVE_BASE = "https://mmj.invalid/";

/**
 * スキームを**ブラウザと同じ読み方**で取り出す。
 *
 * **文字列の見た目で判定してはいけない。**ブラウザは URL を読む前に、
 * タブと改行を**どこにあっても取り除き**、先頭と末尾の C0 制御と空白も落とす
 * （WHATWG URL の "Remove all ASCII tab or newline from input"）。
 * つまり `java<TAB>script:alert(1)` は `href` へ入れた瞬間 `javascript:` に戻る。
 *
 * **2026-10-07 に実機で確認した。**正規表現でスキームを見ていたころは、
 * これが「スキーム無し＝相対パス」と読まれて素通りし、しかも `/^https?:/` にも
 * 一致しないので `target="_blank"` すら付かず、**同じタブでそのまま走った**。
 * 同じ読み方をするものに判定させれば、この手の分断は最初から起きない。
 *
 * 読めない URL は `null`。**迷ったら通さない。**
 * @param {string} trimmed
 * @returns {string | null} `http` のような小文字のスキーム名
 */
function schemeOf(trimmed) {
  try {
    return new URL(trimmed, RELATIVE_BASE).protocol.slice(0, -1).toLowerCase();
  } catch {
    return null;
  }
}

/**
 * @typedef {{ kind: "image", src: string, alt: string } | { kind: "text", text: string }} PopupPart
 */

/**
 * @param {{ text?: string | null, image?: string | null, imageAlt?: string | null }} input
 * @returns {PopupPart[]} **中身が無ければ空**（空の箱を開かないため）
 */
export function buildPopupContent(input) {
  /** @type {PopupPart[]} */
  const parts = [];

  const image = typeof input.image === "string" ? input.image.trim() : "";
  const text = typeof input.text === "string" ? input.text : "";

  // 写真が先、文字が後。**見る順に並べる**
  if (image !== "" && isSafeImage(image)) {
    // 代替テキストは文字から取る。**写真だけの吹き出しを、読み上げで無にしない**
    const alt = typeof input.imageAlt === "string" && input.imageAlt !== "" ? input.imageAlt : text;
    parts.push({ kind: "image", src: image, alt });
  }

  if (text !== "") parts.push({ kind: "text", text });

  return parts;
}

/**
 * リンクとして通してよいか。
 *
 * **`javascript:` は押した瞬間に走る。**媒体が登録した文字列が `href` に入る
 * 作りなので、ここを通すと**その地図を置いたページが乗っ取られる**。
 * `data:` も同じ理由で通さない。
 *
 * **電話とメールは通す。**店の情報として普通に要るし、実行はされない。
 * @param {string | null | undefined} value
 */
export function isSafeLink(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed === "") return false;
  // 読み方は `schemeOf` に任せる（**見た目で判定すると分断で抜けられる**）。
  // 相対パスは土台から見て https になるので、ここでは別扱いにしなくてよい
  const scheme = schemeOf(trimmed);
  return scheme === "http" || scheme === "https" || scheme === "mailto" || scheme === "tel";
}

/** 星の満点。**5 段階以外を使う媒体もあるが、揃えないと読み比べられない** */
const RATING_MAX = 5;

/**
 * 星を、読める形にする。
 *
 * **星だけにしない。**読み上げには「★★★★☆」が伝わらない。
 * そして**件数が無い評価は根拠が無い**ので、あれば必ず添える。
 *
 * **読めない値は出さない。**`0 件の星`を出すと、評価が無いのに有るように見える。
 *
 * @param {unknown} value
 * @param {unknown} count
 * @returns {string | null}
 */
export function formatRating(value, count) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const clamped = Math.min(RATING_MAX, Math.max(0, value));
  const shown = Number.isInteger(clamped) ? clamped : clamped.toFixed(1);
  const times = typeof count === "number" && Number.isFinite(count) && count > 0
    ? `（${count} 件）`
    : "";
  return `${shown} / ${RATING_MAX}${times}`;
}

/** リンクに文字が無いときの既定。**`undefined` と書かれたリンクを出さない** */
const DEFAULT_LINK_LABEL = "詳しく見る";

/**
 * カードの中身を組む。**ここも純粋関数**で、DOM は要素側が作る。
 *
 * 並びは**見る順**——題 → 写真 → 星 → 長文 → リンク。
 *
 * **危ないものは落として、残りは出す。**写真 1 枚のせいでカード全部を
 * 消すと、**なぜ出ないのかが誰にも分からない**。
 *
 * @param {{
 *   title?: unknown, images?: unknown, body?: unknown,
 *   rating?: unknown, ratingCount?: unknown,
 *   href?: unknown, hrefLabel?: unknown, bodyRich?: unknown,
 *   links?: { label: string, href: string, icon: string | null }[],
 * }} input
 * @returns {any[]} **中身が無ければ空**（空の箱を開かないため）
 */
export function buildCardContent(input) {
  /** @type {any[]} */
  const parts = [];

  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (title !== "") parts.push({ kind: "text", text: title });

  const images = Array.isArray(input.images) ? input.images : [];
  for (const src of images) {
    if (typeof src !== "string" || !isSafeImage(src)) continue;
    parts.push({ kind: "image", src: src.trim(), alt: title });
  }

  const rating = formatRating(input.rating, input.ratingCount);
  if (rating !== null) parts.push({ kind: "rating", text: rating });

  const body = typeof input.body === "string" ? input.body.trim() : "";
  // **rich は置く側が名指しした項目だけ。**既定は文字のまま（`rich.js` の頭に理由）
  if (body !== "") parts.push({ kind: "body", text: body, rich: input.bodyRich === true });

  if (isSafeLink(/** @type {any} */ (input.href))) {
    const label = typeof input.hrefLabel === "string" && input.hrefLabel.trim() !== ""
      ? input.hrefLabel.trim()
      : DEFAULT_LINK_LABEL;
    parts.push({ kind: "link", href: String(input.href).trim(), label });
  }

  // **SNS などへのリンク。**アイコンは置く側が渡したものだけ
  // （MMJ は商標の絵を配らない）。**中身も URL も card.js 側で確かめ済み**
  for (const link of Array.isArray(input.links) ? input.links : []) {
    parts.push({ kind: "link", href: link.href, label: link.label, icon: link.icon ?? null });
  }

  return parts;
}

/**
 * 続いている写真を 1 つのまとまりにする。**ここも純粋関数。**
 *
 * **縦に積むと、星も長文もリンクも画面の外へ出る。**
 * 実測（2026-09-28）: 写真 2 枚で吹き出しが 422px になり、地図からはみ出して
 * **見出しバーがヘッダの下に潜った**。横に流せば、高さは写真 1 枚ぶんで済む。
 *
 * **1 枚のときはまとめない。**横スクロールの手がかりを出しても、流す先が無い。
 *
 * **離れた写真はまとめない。**間に文字が挟まっているのは、
 * 「ここまでが 1 組」という別の意図。並び順は変えない。
 *
 * @param {any[]} parts
 * @returns {any[]}
 */
export function groupParts(parts) {
  if (!Array.isArray(parts)) return [];

  /** @type {any[]} */
  const out = [];
  /** @type {any[]} */
  let run = [];

  const flush = () => {
    if (run.length === 0) return;
    // 2 枚以上のときだけ、横に流すまとまりにする
    out.push(run.length >= 2 ? { kind: "gallery", images: run } : run[0]);
    run = [];
  };

  for (const part of parts) {
    if (part?.kind === "image") {
      run.push(part);
      continue;
    }
    flush();
    out.push(part);
  }
  flush();

  return out;
}
