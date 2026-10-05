/**
 * HTML が参照しているローカルのアセットを取り出し、実在するかを確かめる。
 * **ここは純粋関数。**ファイルシステムは触らない（触るのは cli.ts）。
 *
 * baseline §23: 参照だけ足してアップロードを忘れると、
 * **ビルドもテストも通ったまま、実行時にだけ壊れる。**
 * `apps/demo` は素の HTML でビルド工程が無いため、
 * 綴りを 1 文字間違えても誰も止めてくれない。
 */

/** URL の先頭と、それが指す実ディレクトリの対応 */
export interface Mount {
  /** URL の先頭（"/" で始まる）。長いものから順に照合する */
  readonly prefix: string;
  /** リポジトリルートからの相対パス */
  readonly dir: string;
}

export interface Reference {
  readonly raw: string;
  /** 参照元の HTML の中での行番号（1 始まり） */
  readonly line: number;
}

/**
 * データに混ざった文章の記法（アスタリスク 2 つで囲む強調）。
 *
 * カードは渡された文字をそのまま出すので、データに書くと
 * アスタリスクがそのまま画面に出る。実際に見本データへ漏れ、
 * 公開デモの決済タブにアスタリスクが出ていた（2026-10-05・人の指摘で判明）。
 *
 * 書く側が気をつける方式では漏れる。強調したいときは HTML で書き、
 * `card-rich` で項目を名指しすること。
 *
 * 1 つだけのアスタリスク（掛け算・注記）は記法ではないので拾わない。
 */
const MARKDOWN_EMPHASIS = /\*\*[^*\n]+\*\*/g;

/**
 * データの中の文章の記法を探す。
 *
 * @param text JSON や GeoJSON の中身
 * @returns 見つかった箇所（空なら問題なし）
 */
export function findMarkdownInData(text: string): { sample: string; line: number }[] {
  const found: { sample: string; line: number }[] = [];
  text.split("\n").forEach((line, index) => {
    for (const match of line.matchAll(MARKDOWN_EMPHASIS)) {
      found.push({ sample: match[0], line: index + 1 });
    }
  });
  return found;
}

/**
 * 公開先の根。**ここを指す絶対 URL は「外部」ではない。**
 *
 * `og:image` は絶対 URL で書く決まり（相対では SNS が解決できない）なので、
 * 外部 CDN と同じ扱いにすると検査をすり抜ける。
 */
const OWN_SITE = "https://meta-taro.github.io/mmj-map/";

/**
 * 自分のサイトを指す絶対 URL を、`apps/demo` からの相対パスへ直す。
 *
 * @returns 自分のサイトでなければ null。サイトの根（ファイルではない）も null
 */
function ownSitePath(value: string): string | null {
  if (!value.startsWith(OWN_SITE)) return null;
  const rest = value.slice(OWN_SITE.length).split("?")[0]?.split("#")[0] ?? "";
  if (rest === "") return null;
  return `./${rest}`;
}

/**
 * 外へ出て行く参照かどうか。**外部 CDN はこの検査の対象外**
 * （存在するかは向こうの都合で、こちらのリポジトリでは保証できない）。
 * @param {string} value
 */
function isExternal(value: string): boolean {
  return (
    value === "" ||
    value.startsWith("#") ||
    // **クエリだけのリンクは同じ頁を指す。**一覧の `<a href="?shop=akari">` は
    // ファイルではない（実測・2026-09-30。3 件を実在しないファイルとして止めた）
    value.startsWith("?") ||
    value.startsWith("data:") ||
    value.startsWith("mailto:") ||
    value.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/i.test(value)
  );
}

/**
 * HTML から `src=` / `href=` のローカル参照を拾う。
 *
 * **動的に組み立てられる URL は拾えない。**`import('/elements/index.js')` のような
 * 静的な文字列だけを見る。拾えないものがあること自体は、この検査の限界として受け入れる
 * （拾えた範囲で止められれば、いま起きている壊れ方は防げる）。
 */
export function extractReferences(html: string): Reference[] {
  const found: Reference[] = [];
  const lines = html.split("\n");

  for (const [index, line] of lines.entries()) {
    // src="..." / href="..."
    // **`card-href` や `data-src` を巻き込まない。**`\b` だけだと `-` の後ろでも
    // 境目と見なされ、**属性名をファイルのパスとして拾う**。
    // `<mmj-poi card-href="url">` は「GeoJSON の `url` 属性を見よ」という指定で、
    // `url` というファイルは無い（実測・2026-09-28。`shops.html` で CI が止まった）。
    for (const match of line.matchAll(/(?<![-\w])(?:src|href)\s*=\s*["']([^"']*)["']/gi)) {
      const raw = match[1] ?? "";
      if (!isExternal(raw)) found.push({ raw, line: index + 1 });
    }
    // import('...') / import("...")
    for (const match of line.matchAll(/\bimport\s*\(\s*["']([^"']*)["']\s*\)/g)) {
      const raw = match[1] ?? "";
      if (!isExternal(raw)) found.push({ raw, line: index + 1 });
    }
    // **自分のサイトを指す絶対 URL**（`og:image` / `twitter:image` / `og:url`）。
    // これらは絶対 URL で書く決まりなので `src`/`href` には現れず、`content=` に入る。
    // 外部 CDN と同じ扱いにすると、**絵を消しても誰も気づかない**（baseline §23）。
    for (const match of line.matchAll(/\bcontent\s*=\s*["']([^"']*)["']/gi)) {
      const path = ownSitePath(match[1] ?? "");
      if (path !== null) found.push({ raw: path, line: index + 1 });
    }
  }
  return found;
}

/**
 * 参照を、リポジトリの中の実ファイルパスへ解く。解けなければ null。
 *
 * @param reference HTML に書かれている値
 * @param fromDir 参照元 HTML があるディレクトリ（リポジトリルート相対）
 * @param mounts 絶対パス参照（"/..." で始まるもの）の対応表
 */
export function resolveReference(
  reference: string,
  fromDir: string,
  mounts: readonly Mount[],
): string | null {
  const path = reference.split("?")[0]?.split("#")[0] ?? "";
  if (path === "") return null;

  if (path.startsWith("/")) {
    // 長い prefix を先に照合する（"/elements" が "/" に吸われないように）
    const candidates = [...mounts].sort((a, b) => b.prefix.length - a.prefix.length);
    for (const mount of candidates) {
      const prefix = mount.prefix.replace(/\/$/, "");
      if (path !== mount.prefix && path !== prefix && !path.startsWith(prefix + "/")) continue;
      const rest = path.slice(prefix.length).replace(/^\//, "");
      return join(mount.dir, rest);
    }
    return null;
  }

  return join(fromDir, path.replace(/^\.\//, ""));
}

/** POSIX の join。**Windows の区切りを混ぜない**（比較と表示が OS で変わるため） */
function join(...parts: string[]): string {
  const merged = parts.filter((p) => p !== "").join("/");
  const out: string[] = [];
  for (const segment of merged.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out.join("/");
}

/**
 * **公開先に base path があると壊れる参照**を挙げる。**ここは純粋関数。**
 *
 * GitHub Pages は `https://<user>.github.io/<repo>/` の下に置かれる。
 * `/elements/index.js` は `https://<user>.github.io/elements/index.js` を見に行き、404 になる。
 *
 * **手元の `pnpm serve` は `/` 直下で配るので通ってしまう。**
 * `resolveReference` も mount 表で解けてしまうため「実在する」と判定していた。
 * **公開先でしか出ない壊れ方**で、実際に 4 枚のデモが地図を出せなくなっていた
 * （2026-09-21）。
 *
 * 相対パスなら base path があっても無くても通る。
 *
 * @param references `extractReferences` の結果
 */
export function findBasePathHazards(references: readonly Reference[]): Reference[] {
  // `//host/path` はプロトコル相対の外部 URL。base path の話ではない
  return references.filter((r) => r.raw.startsWith("/") && !r.raw.startsWith("//"));
}
