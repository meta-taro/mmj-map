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

/** @typedef {"closed" | "popup" | "maximized"} CardState */

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
 * @returns {CardState}
 */
export function nextCardState(current, action) {
  switch (action) {
    case "open":
      // **開いているものを開き直さない。**最大化中に目印を押しても縮まない
      return current === "closed" ? "popup" : current;
    case "maximize":
      // 閉じているものは広げない（**中身が無い箱を開かない**）
      return current === "closed" ? "closed" : "maximized";
    case "restore":
      return current === "maximized" ? "popup" : current;
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
 * 壊れているのか仕様なのか分からない。
 *
 * @param {CardState} state
 * @returns {("maximize" | "restore" | "close")[]}
 */
export function controlsFor(state) {
  if (state === "popup") return ["maximize", "close"];
  if (state === "maximized") return ["restore", "close"];
  return [];
}

/** ボタンに出す文字。**記号だけにしない**（読み上げにも押す人にも伝わらない） */
export const CONTROL_LABELS = {
  maximize: "大きく表示",
  restore: "元の大きさに戻す",
  close: "閉じる",
};

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
  return input.width < NARROW_WIDTH ? "maximized" : "popup";
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
  if (state === "popup") return "close";
  return null;
}
