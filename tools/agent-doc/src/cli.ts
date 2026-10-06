#!/usr/bin/env node
/**
 * エージェント向けの入口を組み立て、腐っていないかを見る。
 *
 *   pnpm agent-doc:build    # llms.txt / llms-full.txt を作り直す
 *   pnpm agent-doc:check    # 文書が古びていたら落とす（pnpm gate の中）
 *
 * **ここだけが外界（ファイル）に触る。**判断は `attrs.ts` と `content.ts`。
 *
 * ## check が見ている 3 つ
 *
 * 1. **ソースが読んでいる属性が、文書に出ているか**（足して書き忘れたら落ちる）
 * 2. **見本が、実在しない属性を使っていないか**（消したのに残っていたら落ちる）
 * 3. **生成物が最新か**（`build` を忘れて commit したら落ちる）
 *
 * **落ちない検査は検査ではない。**どれも 1 度わざと壊して、赤くなることを見ている。
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { attributesInDoc, attributesInHtml, attributesInSource, undocumented, unknownInText } from "./attrs.js";
import { SNIPPET, buildIndex, buildSitemap, type IndexLink } from "./content.js";

// src/cli.ts → tools/agent-doc → tools → リポジトリの根（**3 つ上**）
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const elementsDir = path.join(repoRoot, "packages/elements/src");
const reference = path.join(repoRoot, "docs/elements/README.md");

/** 公開サイトの根。**ここが変わったら生成し直す**（相対リンクを出さないため） */
const SITE = "https://meta-taro.github.io/mmj-map/";

/** 生成物の置き場。**公開サイトと npm パッケージの両方へ同じものを置く** */
const INDEX_OUT = ["apps/demo/llms.txt", "packages/elements/llms.txt"];
const FULL_OUT = ["apps/demo/llms-full.txt"];

/** HTML の素の属性。**MMJ のものではない**ので、見本の中にあっても咎めない */
const PLAIN_HTML_ATTRS = new Set(["rel", "href", "src", "type"]);

/** 索引に載せる頁。**人が書く。**何が分かる頁かは、機械には書けない。 */
const LINKS: readonly IndexLink[] = [
  { section: "はじめに", title: "入れ方（日本語）", path: "https://github.com/meta-taro/mmj-map/blob/develop/docs/install/ja.md", note: "タイル・スタイル・部品の 3 つを置くまで" },
  { section: "はじめに", title: "Install (English)", path: "https://github.com/meta-taro/mmj-map/blob/develop/docs/install/en.md", note: "the same, in English" },
  { section: "見本", title: "素の地図", path: "plain.html", note: "HTML だけで地図を 1 枚置く" },
  { section: "見本", title: "お店を見て回る", path: "shops.html", note: "点に自前の SVG・カード・決済タブ・一覧との連動" },
  { section: "見本", title: "建物を立てる", path: "3d.html", note: "3d 属性で建物を押し出す" },
  { section: "見本", title: "3D で道案内", path: "3d-route.html", note: "建物を立てたまま経路と案内を描く" },
  { section: "見本", title: "点をまとめる", path: "cluster.html", note: "点が多いときにまとめて見せる" },
  { section: "見本", title: "配色を見くらべる", path: "themes.html", note: "6 枚のスタイルを並べる" },
  { section: "きまり", title: "ライセンスと帰属表示", path: "https://github.com/meta-taro/mmj-map/blob/develop/LICENSES.md", note: "ODbL。帰属表示を画面から外さない" },
];

/** 属性の正本（`packages/elements/src/*.js`） */
function sourceAttributes(): string[] {
  const files = readdirSync(elementsDir).filter((name) => name.endsWith(".js"));
  const found = files.flatMap((name) => attributesInSource(readFileSync(path.join(elementsDir, name), "utf8")));
  return [...new Set(found)].sort();
}

function generated(): { file: string; text: string }[] {
  const attributes = sourceAttributes();
  const index = buildIndex({ site: SITE, links: LINKS, attributes });
  const full = readFileSync(reference, "utf8");
  // **索引も生成物。**手で書くと、頁を足したときに古いまま残る
  const pages = readdirSync(path.join(repoRoot, "apps/demo")).filter((name) => name.endsWith(".html"));
  return [
    ...INDEX_OUT.map((file) => ({ file, text: index })),
    ...FULL_OUT.map((file) => ({ file, text: full })),
    { file: "apps/demo/sitemap.xml", text: buildSitemap(SITE, pages) },
  ];
}

function readOrNull(file: string): string | null {
  try {
    return readFileSync(path.join(repoRoot, file), "utf8");
  } catch {
    return null;
  }
}

function commandBuild(): number {
  for (const { file, text } of generated()) {
    writeFileSync(path.join(repoRoot, file), text, "utf8");
    console.log(`書きました: ${file}`);
  }
  return 0;
}

function commandCheck(): number {
  const attributes = sourceAttributes();
  const problems: string[] = [];

  // 1. 足して、書き忘れていないか
  for (const name of undocumented(attributes, attributesInDoc(readFileSync(reference, "utf8")), [])) {
    problems.push(`属性 ${name} が docs/elements/README.md に出ていません（ソースは読んでいます）`);
  }

  // 2. 消したのに、見本に残っていないか
  for (const name of unknownInText([SNIPPET], attributes, attributesInHtml)) {
    if (PLAIN_HTML_ATTRS.has(name)) continue;
    problems.push(`見本（content.ts の SNIPPET）が ${name} を使っていますが、ソースにありません`);
  }

  // 3. 索引のリンクが実在するか。
  //
  // **エージェント向けの入口として配っているのに、10 本中 4 本が 404 だった**
  // （2026-10-06 実測）。公開サイトに無い頁へ、サイトの根を付けて書いていた。
  // 外（https）は相手の都合なので見ない。**こちらが出す頁だけを見る。**
  for (const link of LINKS) {
    if (/^https?:\/\//i.test(link.path)) continue;
    if (readOrNull(`apps/demo/${link.path}`) === null) {
      problems.push(`索引のリンク ${link.path} が apps/demo にありません（配ると 404 になります）`);
    }
  }

  // 4. 生成物が最新か（**build を忘れて commit したら落ちる**）
  for (const { file, text } of generated()) {
    const current = readOrNull(file);
    if (current === null) problems.push(`${file} がありません。pnpm agent-doc:build を走らせてください`);
    else if (current !== text) problems.push(`${file} が古いままです。pnpm agent-doc:build を走らせてください`);
  }

  if (problems.length > 0) {
    console.error("エージェント向けの文書が古びています:");
    for (const line of problems) console.error(`  - ${line}`);
    return 1;
  }

  console.log(`検査: 属性 ${attributes.length} 件・生成物 ${INDEX_OUT.length + FULL_OUT.length} 本`);
  console.log("OK 文書とソースは一致しています");
  return 0;
}

const command = process.argv[2];
if (command === "build") process.exitCode = commandBuild();
else if (command === "check") process.exitCode = commandCheck();
else {
  console.error("使い方: cli.ts <build | check>");
  process.exitCode = 2;
}
