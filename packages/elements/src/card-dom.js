/**
 * カードの容れ物（見出しバーと最大化）の DOM 側。
 *
 * **`card.js` が状態を決め、ここが画面に反映する。**
 *
 * ## 最大化は、吹き出しの中ではやらない
 *
 * MapLibre の吹き出しは**地図の座標に貼り付いている**ので、地図を動かすと一緒に動く。
 * 最大化したものが地図と一緒に流れていくと読めないので、**地図の入れ物の上へ
 * 別の面を重ねて、中身をそこへ移す**。
 *
 * **中身は作り直さない。**同じ要素を移すので、開いていたタブも、
 * めくった写真の位置も、**そのまま持ち越せる**（作り直すと全部戻る）。
 *
 * ## 先に潰しておく落とし穴
 *
 * 1. **地図がホイールを取る。**スクロールする面を地図の上に置くと、
 *    読もうとして指を動かしたつもりが、地図の拡大縮小になる
 * 2. **`closeOnClick` が効く。**中のボタンを押しただけで吹き出しが閉じる
 * 3. **フォーカスが地図に残る。**最大化しても Tab が後ろの地図へ行ってしまう
 */
import { controlsFor, CONTROL_LABELS, keyAction, nextCardState } from "./card.js";

/** 最大化した面の class。CSS は `buildCardStyle` が出す */
const SHEET_CLASS = "mmj-card-sheet";

/**
 * カードの見た目。**色は読み込んだスタイルから借りる**（吹き出しと同じ 3 色）。
 *
 * `className` を配色ごとに分けるのは吹き出しと同じ理由
 * （1 ページに配色違いを並べると、最初の 1 枚の色が全部へ効く）。
 *
 * @param {{ background: string, text: string, border: string }} colors
 * @param {string} className
 */
export function buildCardStyle(colors, className) {
  return (
    // **吹き出しは伸び続ける。**写真 2 枚＋長文で画面の上へはみ出し、
    // **見出しバーごと画面の外へ出た**（実測・2026-09-28。撮って気づいた）。
    // 高さを止めて、**中身だけをスクロールさせる**（バーは残す）。
    // **地図より背を高くしない。**画面基準（60vh）にしたら、地図の外へはみ出して
    // **見出しバーごと頁のヘッダの下に潜った**（実測・2026-09-28。
    // 吹き出しの上端が y=45、地図の上端が y=75 だった）。
    // 地図は画面より小さいのが普通なので、**画面の半分より小さく**しておく。
    // **ここは見た目の調整で詰め直す値**（地図の実寸から決めるのが本筋）。
    // **地図の高さから決める**（`--mmj-card-max` を地図の入れ物に入れている）。
    // 画面基準の値は控えで、**地図が画面より小さいときに効かない**
    `.${className} .maplibregl-popup-content{max-height:var(--mmj-card-max,min(42vh,20rem));` +
    "display:flex;flex-direction:column;overflow:hidden;}" +
    `.${className} .maplibregl-popup-content > div{` +
    "display:flex;flex-direction:column;min-height:0;}" +
    `.${className} .maplibregl-popup-content .mmj-popup-body{overflow:auto;min-height:0;` +
    "overscroll-behavior:contain;}" +
    // 見出しバー。**中身とボタンを分ける線を 1 本引く**
    `.${className} .mmj-card-bar{flex:none;` +
    "display:flex;align-items:center;gap:.25rem;justify-content:flex-end;" +
    `border-bottom:1px solid ${colors.border};` +
    // **上へ負の余白を掛けない。**高さを止めた `overflow:hidden` に切り取られ、
    // **バーごと消える**（実測・2026-09-28。撮って気づいた）。
    // 横だけ広げて、吹き出しの内側の余白いっぱいに敷く
    "margin:0 -10px 6px;padding:4px 6px;}" +
    `.${className} .mmj-card-btn{` +
    "display:inline-flex;align-items:center;justify-content:center;" +
    "min-width:32px;min-height:32px;padding:0 .4rem;" +
    `border:1px solid ${colors.border};border-radius:6px;` +
    `background:transparent;color:${colors.text};` +
    "font:inherit;font-size:13px;line-height:1;cursor:pointer;}" +
    `.${className} .mmj-card-gap{flex:1;min-width:6px;}` +
    `.${className} .mmj-card-btn:hover{background:${colors.border};}` +
    `.${className} .mmj-card-btn:focus-visible{outline:2px solid ${colors.text};outline-offset:1px;}` +
    // 最大化した面。**地図の入れ物いっぱいに敷く**
    `.${SHEET_CLASS}{` +
    "position:absolute;inset:0;z-index:4;display:flex;flex-direction:column;" +
    `background:${colors.background};color:${colors.text};` +
    "font:13px/1.6 system-ui,-apple-system,'Segoe UI','Hiragino Sans','Noto Sans JP',sans-serif;}" +
    // **中身だけがスクロールする。**面ごと動くと見出しバーが流れる
    `.${SHEET_CLASS} .mmj-card-body{flex:1;min-height:0;overflow:auto;padding:12px 14px;` +
    "overscroll-behavior:contain;}" +
    `.${SHEET_CLASS} .mmj-card-bar{margin:0;padding:8px 10px;}` +
    // 吹き出しでは短い名前を折り返さないが、**最大化したら折り返す**（長文が入る）
    `.${SHEET_CLASS} .mmj-popup-text{white-space:normal;}` +
    // **高さの上限が要る。**幅だけ広げると、寸法を持たない SVG が
    // 画面いっぱいに膨らんで、下の文字が押し出される（実測・2026-09-28）。
    // 半分に収めれば、写真と文字が同時に見える
    `.${SHEET_CLASS} .mmj-popup-body img{max-width:100%;max-height:50vh;object-fit:contain;}` +
    // 大きくしても**横に流す**。縦に積むと、下の文字まで指が届かない。
    // **枠の幅で割らない。**広い面では枠のほうが写真より大きくなり、
    // 写真が枠の中央に浮いて、**隣の枠には何も映らない**
    // （実測・2026-09-28。枠 802px に対し写真は 471px しか出ず、
    // 3 枚あるのに 1 枚に見えた。撮らなければ数字は正しいままだった）。
    // 高さだけ揃えて、幅は写真の形なりにする。**並べば、並んで見える**
    // 吹き出しでは帯の高さを固定しているが（**出した瞬間の高さで向きが決まる**ため）、
    // 最大化した面は向きを持たないので、**大きく見せてよい**
    `.${SHEET_CLASS} .mmj-popup-gallery{height:auto;}` +
    `.${SHEET_CLASS} .mmj-popup-gallery img{` +
    "flex:0 0 auto;width:auto;min-width:0;max-width:none;height:min(38vh,320px);}"
  );
}

/**
 * ボタンを 1 つ作る。
 * @param {"prev" | "next" | "maximize" | "restore" | "close"} name
 * @param {() => void} onPress
 */
function controlButton(name, onPress) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mmj-card-btn";
  button.textContent = { prev: "‹", next: "›", maximize: "⤢", restore: "⤡", close: "✕" }[name];
  // **記号だけにしない。**読み上げにも、押す人にも伝わらない
  button.title = CONTROL_LABELS[name];
  button.setAttribute("aria-label", CONTROL_LABELS[name]);
  button.addEventListener("click", (event) => {
    // **地図まで届かせない。**`closeOnClick` が効いて、押した瞬間に閉じる
    event.stopPropagation();
    event.preventDefault();
    onPress();
  });
  return button;
}

/**
 * 見出しバーの中身を組む。**状態が変わるたびに入れ替える。**
 *
 * @param {{
 *   state: import("./card.js").CardState,
 *   act: (action: any) => void,
 *   siblings?: number,
 * }} input
 * @returns {HTMLElement}
 */
export function buildCardBar(input) {
  const bar = document.createElement("div");
  bar.className = "mmj-card-bar";
  for (const name of controlsFor(input.state, input.siblings)) {
    // 送りは左、窓の操作は右。**間に伸びる隙間を挟んで分ける**
    // （並べてしまうと、「次へ」と「閉じる」が隣り合って押し間違える）
    if (name === "maximize" || name === "restore") {
      const gap = document.createElement("div");
      gap.className = "mmj-card-gap";
      bar.append(gap);
    }
    bar.append(controlButton(name, () => input.act(name)));
  }
  return bar;
}

/**
 * カードを動かす。**状態を持つのはここだけ。**
 *
 * @param {{
 *   body: HTMLElement,
 *   container: HTMLElement,
 *   popup: any,
 *   className: string,
 *   initial: import("./card.js").CardState,
 *   siblings?: number,
 *   onStep?: (delta: number) => void,
 * }} input
 */
export function mountCard(input) {
  let state = input.initial;
  /** @type {HTMLElement | null} */
  let sheet = null;
  /** いま入っている中身。**送るたびに差し替える**（容れ物は作り直さない） */
  let body = input.body;

  // **class は最初に付ける。**中身だけ入れ替えると `.mmj-card-bar` が付かず、
  // **バーの CSS が 1 つも当たらない**（実測・2026-09-28。撮って気づいた）
  const bar = document.createElement("div");
  bar.className = "mmj-card-bar";

  const shell = document.createElement("div");
  shell.append(bar, body);

  /** 見出しバーを、いまの状態に合わせて描き直す */
  const drawBar = () =>
    bar.replaceChildren(...buildCardBar({ state, act, siblings: input.siblings ?? 1 }).childNodes);

  /**
   * 面の中の最初のボタンへフォーカスを移す。
   *
   * **バーを描き直した後に呼ぶこと。**先に移すと、`drawBar()` が
   * **フォーカスした要素ごと作り直して**、フォーカスが body へ落ちる
   * （実測・2026-09-28。`document.activeElement` が BODY になっていた）。
   */
  const focusFirst = () => {
    const first = sheet?.querySelector("button");
    if (first instanceof HTMLElement) first.focus();
  };

  /** 最大化の面を閉じ、中身を吹き出しへ戻す */
  const collapse = () => {
    if (sheet === null) return;
    sheet.remove();
    sheet = null;
    shell.append(bar, body);
    input.popup.setDOMContent(shell);
  };

  /** 中身を地図の上の面へ移す。**作り直さない**（タブも写真の位置も持ち越す） */
  const expand = () => {
    if (sheet !== null) return;
    sheet = document.createElement("div");
    sheet.className = `${SHEET_CLASS} ${input.className}`;
    sheet.setAttribute("role", "dialog");
    // 地図は後ろで生きている。**閉じ込めない**（`aria-modal` にしない）
    sheet.setAttribute("aria-label", "カードを大きく表示しています");

    const pane = document.createElement("div");
    pane.className = "mmj-card-body";
    pane.append(body);
    sheet.append(bar, pane);

    // **地図にホイールを取らせない。**取られると、読もうとして拡大してしまう
    for (const type of ["wheel", "touchmove", "dblclick", "mousedown", "pointerdown"]) {
      sheet.addEventListener(type, (event) => event.stopPropagation(), { passive: true });
    }
    // 押しただけで閉じない（`closeOnClick`）
    sheet.addEventListener("click", (event) => event.stopPropagation());

    input.container.append(sheet);
  };

  /** @param {"open" | "prev" | "next" | "maximize" | "restore" | "close"} action */
  function act(action) {
    // **送りは状態を変えない。**開いたまま中身だけ入れ替える
    // （閉じて開き直すと、最大化していたら縮み、見ていた位置も消える）
    if (action === "prev" || action === "next") {
      input.onStep?.(action === "next" ? 1 : -1);
      return;
    }

    const next = nextCardState(state, action);
    if (next === state) return;
    state = next;

    if (state === "maximized") expand();
    else collapse();

    // **描き直してから移す。**逆にすると、フォーカスした要素ごと作り直される
    drawBar();
    if (state === "maximized") focusFirst();
    if (state === "closed") input.popup.remove();
  }

  // **Escape は 1 段だけ戻す**（最大化 → 吹き出し → 閉じる）
  const onKey = (/** @type {KeyboardEvent} */ event) => {
    const action = keyAction(event.key, state);
    if (action === null) return;
    event.stopPropagation();
    act(action);
  };
  document.addEventListener("keydown", onKey);

  if (state === "maximized") expand();
  drawBar();
  if (state === "maximized") focusFirst();

  return {
    content: shell,
    act,
    /**
     * 中身だけ入れ替える。**容れ物は作り直さない。**
     *
     * 最大化していたら最大化のまま、吹き出しなら吹き出しのまま差し替わる。
     * **隣の店へ送るのに閉じて開き直すと、状態が毎回戻る。**
     *
     * @param {HTMLElement} next
     */
    setBody(next) {
      body.replaceWith(next);
      body = next;
    },
    /**
     * 目印が外れたときに呼ぶ。**聞きっぱなしにしない。**
     *
     * **吹き出しへは戻さない**（`collapse()` を呼ばない）。
     * 閉じたあとの吹き出しに中身を入れ直そうとすることになる。
     */
    destroy() {
      document.removeEventListener("keydown", onKey);
      sheet?.remove();
      sheet = null;
    },
  };
}
