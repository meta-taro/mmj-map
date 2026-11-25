/**
 * `<mmj-route-editor>` の画面の部品（操作の帯・線の点・案内の入力欄）を組む DOM 側。
 * 判断は `route-edit.js`（純粋関数）にあり、ここは組むだけ。
 *
 * **文字は全部 `textContent` で入れる。**人が打ったひとことや URL を HTML として
 * 読ませない（`popup.js` の頭と同じ理由）。
 *
 * **色を作らない。**帯は地図の部品と同じ配色（`controls-dom.js` が地図の入れ物に付ける）、
 * 線の点は経路の線と同じ色を使う。
 */
import { isSafeImage } from "./popup.js";

const STYLE_ID = "mmj-route-editor-style";

/** 案内の欄の大きさが変わったときに、欄（form）から出す出来事の名前 */
export const RESIZE_EVENT = "mmj-re-resize";

/**
 * 帯の中のボタンは MapLibre の既定（29px 角の絵のボタン）を外して、文字のボタンにする。
 * **押す目標は 36px 以上**（指で押すため）。
 *
 * **帯の幅は窓ではなく地図の幅で決める。**右上の拡大縮小のぶん（64px）を空ける。
 * 窓の幅で決めていたので、390px で帯が拡大縮小のボタンに 2px かぶっていた（2026-11-25）。
 */
const CSS = `
.maplibregl-map:has(.mmj-route-editor-panel) { container-type: inline-size; }
.mmj-route-editor-panel { box-sizing: border-box; padding: 6px; display: flex; flex-direction: column; gap: 6px; max-width: min(320px, calc(100vw - 32px)); max-width: min(320px, calc(100cqw - 64px)); font-size: 13px; line-height: 1.5; }
.mmj-route-editor-panel .mmj-re-row { display: flex; flex-wrap: wrap; gap: 4px; }
.maplibregl-ctrl-group.mmj-route-editor-panel button { width: auto; height: auto; min-height: 36px; padding: 4px 10px; border: 1px solid currentColor; border-radius: 6px; background: transparent; color: inherit; font: inherit; cursor: pointer; display: inline-flex; align-items: center; }
.maplibregl-ctrl-group.mmj-route-editor-panel button + button { border-top: 1px solid currentColor; }
.maplibregl-ctrl-group.mmj-route-editor-panel button[aria-pressed="true"] { font-weight: 700; box-shadow: inset 0 0 0 2px var(--mmj-re-accent); }
.maplibregl-ctrl-group.mmj-route-editor-panel button:disabled { opacity: .45; cursor: default; }
.mmj-route-editor-panel .mmj-re-status { margin: 0; }
.mmj-route-editor-panel .mmj-re-issues { margin: 0; padding-left: 1.2em; }
.mmj-re-vertex { width: 32px; height: 32px; display: grid; place-items: center; cursor: grab; }
.mmj-re-vertex > span { box-sizing: border-box; display: grid; place-items: center; border-radius: 50%; border: 3px solid var(--mmj-re-accent); background: var(--mmj-re-ground); color: var(--mmj-re-ink); font-size: 11px; font-weight: 700; line-height: 1; }
.mmj-re-step-mode .mmj-re-vertex { pointer-events: none; }
.mmj-re-vertex:focus-visible { outline: 3px solid var(--mmj-re-accent); outline-offset: 2px; border-radius: 50%; }
.mmj-re-form { display: flex; flex-direction: column; gap: 6px; min-width: 220px; }
.mmj-re-form label { display: flex; flex-direction: column; gap: 2px; font-size: 12px; }
.mmj-re-form input { font: inherit; font-size: 14px; min-height: 36px; padding: 4px 8px; border: 1px solid currentColor; border-radius: 6px; background: transparent; color: inherit; }
.mmj-re-form img { width: 100%; max-height: 96px; object-fit: cover; border-radius: 6px; }
.mmj-re-form button, .mmj-re-remove { font: inherit; min-height: 36px; padding: 4px 10px; border: 1px solid currentColor; border-radius: 6px; background: transparent; color: inherit; cursor: pointer; }
`;

export function ensureEditorStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.append(style);
}

/**
 * @param {string} label
 * @param {() => void} onClick
 */
function button(label, onClick) {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.addEventListener("click", onClick);
  return element;
}

/**
 * 操作の帯。**キーボードだけでも線を引ける**ように「真ん中に置く」を持つ
 * （地図を矢印キーで送り、真ん中に点を置く）。
 *
 * @param {{
 *   onMode: (mode: "line" | "step") => void,
 *   onCenter: () => void,
 *   onUndo: () => void,
 *   onClear: () => void,
 * }} handlers
 */
export function buildPanel(handlers) {
  const element = document.createElement("div");
  element.className = "maplibregl-ctrl maplibregl-ctrl-group mmj-route-editor-panel";
  element.setAttribute("role", "group");
  element.setAttribute("aria-label", "道案内の線を引く");

  const line = button("線を引く", () => handlers.onMode("line"));
  const step = button("案内を置く", () => handlers.onMode("step"));
  const center = button("真ん中に置く", handlers.onCenter);
  const undo = button("1 つ戻す", handlers.onUndo);
  const clear = button("全部消す", handlers.onClear);

  const modes = document.createElement("div");
  modes.className = "mmj-re-row";
  modes.append(line, step);
  const actions = document.createElement("div");
  actions.className = "mmj-re-row";
  actions.append(center, undo, clear);

  const status = document.createElement("p");
  status.className = "mmj-re-status";
  status.setAttribute("role", "status");
  const issues = document.createElement("ul");
  issues.className = "mmj-re-issues";

  element.append(modes, actions, status, issues);

  return {
    element,
    /** @param {"line" | "step"} mode */
    setMode(mode) {
      line.setAttribute("aria-pressed", String(mode === "line"));
      step.setAttribute("aria-pressed", String(mode === "step"));
    },
    /**
     * @param {string} summary
     * @param {string[]} messages
     * @param {{ canUndo: boolean, empty: boolean }} state
     */
    setStatus(summary, messages, state) {
      status.textContent = summary;
      issues.replaceChildren(
        ...messages.map((message) => {
          const item = document.createElement("li");
          item.textContent = message;
          return item;
        }),
      );
      issues.hidden = messages.length === 0;
      undo.disabled = !state.canUndo;
      clear.disabled = state.empty;
    },
  };
}

/**
 * 線の点。**見た目は小さく、押せる所は 32px**（指で掴めるように）。
 * 出発と到着は大きくして「出」「着」を入れる——どちらから引いたかが見て分かる。
 *
 * @param {"start" | "end" | "middle"} role
 * @param {string} label 読み上げ用
 */
export function vertexElement(role, label) {
  const element = document.createElement("div");
  element.className = "mmj-re-vertex";
  element.tabIndex = 0;
  element.setAttribute("role", "button");
  element.setAttribute("aria-label", label);
  const dot = document.createElement("span");
  const size = role === "middle" ? 16 : 24;
  dot.style.width = `${size}px`;
  dot.style.height = `${size}px`;
  dot.textContent = role === "start" ? "出" : role === "end" ? "着" : "";
  element.append(dot);
  return element;
}

/**
 * 線の点を押したときの小窓（消すだけ）。
 * @param {() => void} onRemove
 */
export function vertexMenu(onRemove) {
  const remove = button("この点を消す", onRemove);
  remove.className = "mmj-re-remove";
  return remove;
}

/**
 * 案内の点の入力欄。**打っている間は保存しない**——欄を離れたとき（`change`）に 1 回だけ渡す。
 * 打つたびに渡すと、「1 つ戻す」が 1 字ずつ戻ることになる。
 *
 * @param {{ instruction: string, image: string }} step
 * @param {{
 *   onChange: (change: { instruction?: string, image?: string }) => void,
 *   onRemove: () => void,
 * }} handlers
 */
export function stepForm(step, handlers) {
  const form = document.createElement("form");
  form.className = "mmj-re-form";
  // Enter で頁を送らない（管理画面の大きなフォームの中に置かれることがある）
  form.addEventListener("submit", (event) => event.preventDefault());

  const words = input("ひとこと（地図の吹き出しに出ます）", step.instruction, "例: コンビニの角を左");
  const photo = input("写真の URL（任意）", step.image, "https://… または ./door.jpg");
  // `type="url"` にしない。相対パス（`./door.jpg`）を「正しくない」と赤くされる
  photo.field.inputMode = "url";
  const preview = document.createElement("img");
  preview.alt = "";
  // **読めない写真は、読めないと言う。**壊れた絵の印だけが出ても、URL の打ち間違いだと気づけない
  const broken = document.createElement("p");
  broken.textContent = "この URL の写真を読めません（地図にも出ません）";
  broken.style.margin = "0";
  preview.addEventListener("error", () => {
    preview.hidden = true;
    broken.hidden = false;
  });
  preview.addEventListener("load", () => {
    preview.hidden = false;
    broken.hidden = true;
    // **写真が入ると欄が伸びる。**吹き出しの向きは開いたときの大きさで決まるので、置き直してもらう。
    // 置き直さないと、伸びたぶんが地図の下の縁で切れて「この案内を消す」が押せなかった（2026-11-25）
    form.dispatchEvent(new Event(RESIZE_EVENT));
  });
  const showPreview = (/** @type {string} */ url) => {
    // **安全な URL だけ見せる**（描く側と同じ判定。ここで見えたものは地図でも出る）
    const ok = url !== "" && isSafeImage(url);
    preview.hidden = true;
    broken.hidden = !(url !== "" && !ok);
    if (ok) preview.src = url;
    else preview.removeAttribute("src");
  };
  showPreview(step.image);

  words.field.addEventListener("change", () => handlers.onChange({ instruction: words.field.value }));
  photo.field.addEventListener("change", () => {
    showPreview(photo.field.value.trim());
    handlers.onChange({ image: photo.field.value });
  });

  const remove = button("この案内を消す", handlers.onRemove);
  form.append(words.label, photo.label, preview, broken, remove);
  return { form, focus: () => words.field.focus() };
}

/** @param {string} caption @param {string} value @param {string} placeholder */
function input(caption, value, placeholder) {
  const label = document.createElement("label");
  const text = document.createElement("span");
  text.textContent = caption;
  const field = document.createElement("input");
  field.value = value;
  field.placeholder = placeholder;
  label.append(text, field);
  return { label, field };
}
