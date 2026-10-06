/**
 * エージェントが最初に読むもの（`llms.txt`）を組み立てる。**純粋関数。**
 *
 * ## なぜ README では足りないか
 *
 * MMJ を使って HTML を書くのは、**たいていエージェント**になる。相手は
 *
 * - **1 回の取得で足りる**ものを好む（頁を渡り歩くと、その分だけ高くつく）
 * - **最初に見た例をそのまま写す**（例が間違っていると、そのまま広がる）
 * - **相対リンクを解けない**ことがある（全文を別の場所へ写して読むため）
 *
 * `README.md` は人が読む入口で、**1047 行の属性表を毎回読ませるのは無駄**。
 * だから索引（`llms.txt`）と全文（`llms-full.txt`）に分け、
 * **索引には写して動く例を 1 つ置く**。
 *
 * 体裁は `llmstxt.org` の慣習に合わせてある（H1 → 引用の一文 → `## 節` の箇条書き）。
 */

/** 索引に載せるリンク 1 本 */
export type IndexLink = {
  /** まとまりの名前（同じ名前が続くと 1 つの節になる） */
  readonly section: string;
  readonly title: string;
  /** サイトの中の位置（`site` からの相対。出力では絶対 URL にする） */
  readonly path: string;
  /** 一言。**何が分かる頁か**を書く */
  readonly note: string;
};

export type IndexInput = {
  /** 公開サイトの根（末尾の `/` あり） */
  readonly site: string;
  readonly links: readonly IndexLink[];
  /** ソースが読んでいる属性。**数だけ出す**（全文は `llms-full.txt`） */
  readonly attributes: readonly string[];
};

/**
 * 写して動く最小の 1 枚。**`docs/install/ja.md` の実物を写してある。**
 *
 * ここを手で書き換えると、**文書と食い違ったまま配られる**。
 * `cli.ts` の検査が、ここで使っている属性が実在するかを見ている。
 */
export const SNIPPET = `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.css">
<style>mmj-map { display: block; height: 70vh; }</style>

<mmj-map
  tiles="./tiles/demo.pmtiles"
  style-url="./styles/modern-dark.json"
  center="135.5023,34.6937"
  zoom="12">
  <mmj-marker lnglat="135.4959,34.7024" popup="梅田"></mmj-marker>
</mmj-map>

<script src="https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.js"></script>
<script src="https://cdn.jsdelivr.net/npm/pmtiles@4.4.0/dist/pmtiles.js"></script>
<script type="module" src="./elements/index.js"></script>`;

const SUMMARY =
  "API キーもタイルサーバーも要らない地図の部品（Web Components）。" +
  "PMTiles 1 ファイルと手書きのスタイル JSON を、静的配信だけで地図にする。";

/**
 * `site` と `path` をつなぐ。**相対リンクを残さない**（エージェントは解けないことがある）。
 *
 * `https` で始まるものは外の行き先なので、そのまま出す。
 * 導入手順とライセンスは公開サイトではなく GitHub にあり、
 * 根を付けると 404 になる（実際に 10 本中 4 本が切れていた・2026-10-06）。
 */
const absolute = (site: string, path: string): string =>
  /^https?:\/\//i.test(path) ? path : `${site.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;

/** 索引に入れない頁。**見本を作るための版下**（SNS カードを撮るだけの頁） */
const NOT_INDEXED = new Set(["og.html"]);

/**
 * `sitemap.xml` を組む。
 *
 * **手で書くと腐る。**頁を足したときに索引だけ古いまま残り、
 * 新しい頁が検索に出ない（しかも誰も気づかない）。生成物にして検査で縛る。
 *
 * @param site 公開サイトの根（末尾の `/` あり）
 * @param pages `apps/demo` にある HTML のファイル名
 */
export function buildSitemap(site: string, pages: readonly string[]): string {
  const root = site.replace(/\/+$/, "");
  const locations = [...pages]
    .filter((page) => !NOT_INDEXED.has(page))
    .sort()
    // **トップは拡張子を付けない。**同じ頁が 2 つの URL で出ると、評価が割れる
    .map((page) => (page === "index.html" ? `${root}/` : `${root}/${page}`));

  const body = locations.map((loc) => `  <url>\n    <loc>${loc}</loc>\n  </url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function buildIndex(input: IndexInput): string {
  const out: string[] = ["# MMJ (mmj-map)", "", `> ${SUMMARY}`, ""];

  out.push(
    "**データを持たない。表現を持つ。**地図のタイルは利用者が自分で置き、",
    "MMJ は描き方だけを持つ。だから API キーも従量課金も無い。",
    "",
    "## 写して動く最小の 1 枚",
    "",
    "```html",
    SNIPPET,
    "```",
    "",
    "`tiles` と `style-url` は**自分で置いたファイル**を指す。配信元は無い。",
    "",
  );

  let current = "";
  for (const link of input.links) {
    if (link.section !== current) {
      out.push(`## ${link.section}`, "");
      current = link.section;
    }
    out.push(`- [${link.title}](${absolute(input.site, link.path)}): ${link.note}`);
  }
  if (input.links.length > 0) out.push("");

  out.push(
    "## 属性",
    "",
    `部品が読む属性は **${input.attributes.length} 件**。**全文はこの 1 ファイルに入っている**（頁を渡り歩かなくてよい）:`,
    "",
    `- [llms-full.txt](${absolute(input.site, "llms-full.txt")}): 部品ごとの属性と、使いどころ`,
    "",
  );

  return `${out.join("\n")}\n`;
}
