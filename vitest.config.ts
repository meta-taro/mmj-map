/**
 * カバレッジを測るためだけの設定。**テストの実行方法は変えていない。**
 *
 *   pnpm coverage
 *
 * 各パッケージのテストは今までどおり `pnpm -r test`（`pnpm gate` の中）で走る。
 * ここはワークスペース全体を 1 回で測るためだけに置いてある。
 *
 * **なぜ 1 か所にまとめたか**: 各パッケージへ `@vitest/coverage-v8` を入れると
 * 12 個ぶん増える。**公開リポジトリに載せる依存は少ないほうがよい**（baseline §1 / §12）。
 *
 * ECC `testing.md` は 80% を必須としているが、baseline §4 は「目安」で、
 * **数字を満たすためのテストは書かない**（意味のないテストは負債）。
 * **まず測る。**測っていない状態が一番まずい。
 */
import { defineConfig } from "vitest/config";

/** テストを持つパッケージ。**増やしたらここにも足すこと**（足さないと黙って測られない） */
const PACKAGES = [
  "infra/pmtiles-worker",
  "packages/elements",
  "packages/http-range",
  "tools/asset-check",
  "tools/lint-gate",
  "tools/palette",
  "tools/privacy-check",
  "tools/serve",
  "tools/shot",
  "tools/style-check",
  "tools/tile-inspect",
  "tools/tiles",
];

export default defineConfig({
  test: {
    projects: PACKAGES,
    coverage: {
      provider: "v8",
      // `text` は端末で読む用、`json-summary` は数字を機械で拾う用、`html` は行単位で見る用
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "coverage",
      // **測る対象を明示する。**既定だと読み込まれたファイルしか出ず、
      // 「テストが 1 行も触っていないファイル」が 0% として現れない
      include: PACKAGES.map((p) => `${p}/src/**/*.{ts,js}`),
      /**
       * **測らないもの。**どれも「テストで確かめない」と決めたものだけを挙げる。
       * **数字を上げるために除外を足さないこと。**理由を書けないものは除外しない。
       */
      exclude: [
        // 入口。引数の解釈は別ファイル（args.ts / options.ts）に出してテストしてある
        "**/src/cli.ts",
        "**/src/mcp.ts",
        "**/src/index.js",
        // **要素は jsdom を入れずに、ブラウザで撮って確かめる**（attrs.js の頭に理由）。
        // 判断が要る部分は純粋関数へ出してあり、そちらは 90% を超えている
        "packages/elements/src/mmj-*.js",
        "packages/elements/src/popup-dom.js",
        // 上流のタイルから実測値を取り直す道具。**走らせること自体が目的**で、
        // 固定値に対するテストを書くと「上流が変わったこと」を隠してしまう
        "tools/style-check/src/snapshot.ts",
      ],
      /**
       * **下がったら落とす。**測っただけで終わると、次に下がったとき誰も気づかない。
       *
       * 80 は ECC `testing.md` の必須値。**実測はこれより上**（2026-09-21 時点で
       * statements 92.9% / branches 88.7% / functions 97.1% / lines 94.9%）なので、
       * **いまの余裕を天井にせず、割り込んだときだけ止まる**高さにしてある。
       *
       * **閾値を下げて通すのは禁止。**下がったのなら、テストを足すか、
       * 測らないと決めた理由を `exclude` に書くかのどちらか。
       */
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
