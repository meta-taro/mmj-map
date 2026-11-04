/**
 * 窓の組み立て。**判断は `view.js` と `snippet.js` にあり、ここは受け取って並べるだけ。**
 *
 * タブの URL は `activeTab` で読む。**拡張のボタンを押したときだけ**、そのタブに限って読める。
 * 常に頁を見張る仕組み（content script・全サイトの権限）は置かない。
 */
import { buildAgentBrief, buildSnippet } from "./snippet.js";
import { readGoogleView, toPreviewQuery } from "./view.js";

const chrome = /** @type {any} */ (globalThis).chrome;

/** 読めなかったときの文。**何をすれば読めるか**まで書く */
const REASONS = {
  "not-google-maps": "Google マップの頁を開いて、もう一度押してください。",
  "short-link": "短縮リンクのままでは場所が読めません。地図が開ききってから、もう一度押してください。",
  "no-view": "地図を少し動かすと、URL に場所が入ります。動かしてから、もう一度押してください。",
  "not-map-view": "航空写真・3D・ストリートビューでは縮尺が読めません。地図の表示に切り替えてから押してください。",
};

/** 「写しました」を出しておく時間 */
const COPIED_MS = 1500;

/** @param {string} id */
function byId(id) {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`窓に #${id} がありません`);
  return element;
}

/**
 * @param {HTMLElement} button
 * @param {string} text
 */
async function copy(button, text) {
  const label = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "写しました";
  } catch (error) {
    button.textContent = "写せませんでした";
    console.error(error);
  }
  setTimeout(() => {
    button.textContent = label;
  }, COPIED_MS);
}

async function main() {
  const status = byId("status");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const view = readGoogleView(tab?.url ?? "");
  if (!view.ok) {
    status.textContent = REASONS[view.reason];
    return;
  }

  status.hidden = true;
  byId("result").hidden = false;
  byId("center").textContent = `経度 ${view.lng}、緯度 ${view.lat}`;
  byId("zoom").textContent = String(view.zoom);
  const snippet = buildSnippet(view);
  /** @type {HTMLTextAreaElement} */ (byId("snippet")).value = snippet;

  const copyHtml = byId("copy-html");
  copyHtml.addEventListener("click", () => copy(copyHtml, snippet));
  const copyBrief = byId("copy-brief");
  copyBrief.addEventListener("click", () => copy(copyBrief, buildAgentBrief(view)));
  byId("preview").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL(`preview.html${toPreviewQuery(view)}`) });
  });
}

main().catch((error) => {
  byId("status").textContent = `読めませんでした: ${error instanceof Error ? error.message : String(error)}`;
  console.error(error);
});
