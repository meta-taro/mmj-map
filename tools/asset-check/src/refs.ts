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
 * 外へ出て行く参照かどうか。**外部 CDN はこの検査の対象外**
 * （存在するかは向こうの都合で、こちらのリポジトリでは保証できない）。
 * @param {string} value
 */
function isExternal(value: string): boolean {
  return (
    value === "" ||
    value.startsWith("#") ||
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
    for (const match of line.matchAll(/\b(?:src|href)\s*=\s*["']([^"']*)["']/gi)) {
      const raw = match[1] ?? "";
      if (!isExternal(raw)) found.push({ raw, line: index + 1 });
    }
    // import('...') / import("...")
    for (const match of line.matchAll(/\bimport\s*\(\s*["']([^"']*)["']\s*\)/g)) {
      const raw = match[1] ?? "";
      if (!isExternal(raw)) found.push({ raw, line: index + 1 });
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
