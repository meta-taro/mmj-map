/**
 * HTML の属性を、MapLibre へ渡す値へ直す。**ここは純粋関数。**
 *
 * DOM もブラウザも触らないので、テストに jsdom のような依存が要らない。
 * 実際に描けることは、ブラウザで撮って確かめる（`pnpm shot`）。
 */
import { isDarkColor } from "./palette.js";

const NONE = null;

/**
 * "経度,緯度" を読む。**GeoJSON と同じ並び**（lng, lat）。
 * 読めなければ null を返す。**勝手に [0,0] へ置かない**
 * （アフリカ沖の海に置かれた地図は、間違いだと気づきにくい）。
 * @param {string | null | undefined} value
 * @returns {[number, number] | null}
 */
export function parseLngLat(value) {
  if (typeof value !== "string") return NONE;
  const parts = value.split(",");
  if (parts.length !== 2) return NONE;

  const lng = toNumber(parts[0]);
  const lat = toNumber(parts[1]);
  if (lng === null || lat === null) return NONE;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return NONE;
  return [lng, lat];
}

/**
 * zoom を読む。読めなければ既定値。MapLibre の範囲（0〜24）へ収める。
 * @param {string | null | undefined} value
 * @param {number} fallback
 * @returns {number}
 */
export function parseZoom(value, fallback) {
  const parsed = typeof value === "string" ? toNumber(value) : null;
  if (parsed === null) return fallback;
  return Math.min(24, Math.max(0, parsed));
}

/**
 * 手書きスタイルの `__TILES_URL__` を配信先へ差し替える（D-002 / D-003）。
 * **組み立てているのは URL だけで、色ではない。**
 * @param {string} styleText
 * @param {string} tilesUrl
 * @returns {{ text: string, replaced: number }}
 */
export function applyTilesUrl(styleText, tilesUrl) {
  const replaced = styleText.split("__TILES_URL__").length - 1;
  return { text: styleText.replaceAll("__TILES_URL__", tilesUrl), replaced };
}

/**
 * 傾き（pitch）を読む。読めなければ既定値。MapLibre の範囲（0〜85）へ収める。
 *
 * **3D にしたのに真上から見た絵が出る**、という壊れ方を避けるために要る。
 * 押し出しは傾けて初めて見えるので、`3d` を付けたときは 0 のままにしない。
 * @param {string | null | undefined} value
 * @param {number} fallback
 * @returns {number}
 */
export function parsePitch(value, fallback) {
  const parsed = typeof value === "string" ? toNumber(value) : null;
  if (parsed === null) return fallback;
  return Math.min(85, Math.max(0, parsed));
}

/**
 * MapLibre の Map へ渡す設定。
 * **帰属表示と CJK の扱いを、呼ぶ側が忘れられない場所に置く**のがこの関数の役目。
 * @param {{ container: unknown, style: unknown, center: [number, number], zoom: number, hash: boolean, pitch?: number, cooperative?: boolean, ideographFonts?: string }} input
 */
export function buildMapOptions(input) {
  return {
    container: input.container,
    style: input.style,
    center: input.center,
    zoom: input.zoom,
    hash: input.hash,
    pitch: input.pitch ?? 0,
    // グリフに CJK が無いため、漢字かなは閲覧側のフォントで描く（decisions.md 未決）。
    // **既定は日本語向け。**中国語や韓国語の地図では字形が合わないので、
    // 置く側が `ideograph-fonts` で差し替えられる（同じ符号でも国ごとに字体が違う）。
    // **空文字では上書きしない。**空のフォント指定は字を消す
    localIdeographFontFamily:
      input.ideographFonts !== undefined && input.ideographFonts !== ""
        ? input.ideographFonts
        : "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', sans-serif",
    // 帰属表示は必須。**消せる形で渡さない**（LICENSES.md・ODbL）
    attributionControl: { compact: false },
    // 1 本指をページへ返し、2 本指だけを地図が取る。
    // **地図を縦に並べたページで、指でページを送れなくなるのを防ぐ。**
    // 既定は false。1 枚だけのページで 2 本指を要求すると、そちらが使いにくくなる。
    cooperativeGestures: input.cooperative === true,
  };
}

/**
 * スタイルの中の相対 URL（`glyphs` / `sprite`）を、**スタイルの位置から解いて絶対にする**。
 *
 * **本番でだけ壊れた実例がある**（2026-09-27）。`glyphs` を
 * `../glyphs/{fontstack}/{range}.pbf` にしたところ、**MapLibre は
 * 「スタイルの位置」ではなく「頁の位置」で相対 URL を解決した**。
 *
 *     スタイル: https://example.com/mmj-map/styles/modern-dark.json
 *     頁      : https://example.com/mmj-map/venue.html
 *     期待    : https://example.com/mmj-map/glyphs/...
 *     実際    : https://example.com/glyphs/...        ← 404
 *
 * **手元では通っていた。**開発サーバーが `/glyphs` を root に配っていたため
 * （`pnpm serve -- --base=/mmj-map` なら再現できた）。
 *
 * **元のスタイルは書き換えない**（ECC coding-style）。新しい値を返す。
 * **絶対 URL はそのまま**——外を指しているものを勝手に書き換えない。
 *
 * @param {any} style 読み込んだスタイル
 * @param {string} styleUrl そのスタイルを取ってきた URL
 * @returns {any} 新しいスタイル
 */
export function resolveStyleUrls(style, styleUrl) {
  if (typeof styleUrl !== "string" || styleUrl === "") return style;

  /** @param {string} value */
  const resolve = (value) => {
    if (value === "") return value;
    try {
      // **`new URL()` は `{` `}` を `%7B` `%7D` にする。**そのまま返すと
      // MapLibre が置換子を見つけられず、**404 を別の 404 に置き換えるだけ**になる。
      // 戻すのは安全——この 2 文字が出てくるのは置換子だけ（テストで縛ってある）
      return new URL(value, styleUrl).href.replaceAll("%7B", "{").replaceAll("%7D", "}");
    } catch {
      // 解けないものは触らない。**地図を殺さない**
      return value;
    }
  };

  /** @type {any} */
  const next = { ...style };
  if (typeof style?.glyphs === "string") next.glyphs = resolve(style.glyphs);
  if (typeof style?.sprite === "string") next.sprite = resolve(style.sprite);
  return next;
}

/**
 * 現在地を出すかどうかと、その設定。**属性が無ければ `null`。**
 *
 *   <mmj-map locate>
 *
 * **避難で本当に要るのは「地図」より「いま自分がどこで、どっちを向いているか」。**
 * **GPS は通信が無くても動く**（測位は衛星からで、通信ではない）。
 * つまり**地図さえ手元にあれば、停電でも輻輳でも現在地つきで動ける**。
 * 欠けていた唯一のピースは、**地図のほうがネット越しだった**ことだけ。
 *
 * **勝手に要求しない。**位置情報は、属性で明示されたときだけ出す。
 * 押すまで測位も始めない（開いた瞬間に許可を求める画面は、それだけで閉じられる）。
 *
 * @param {string | null | undefined} attribute `locate` 属性の値（空文字でよい）
 * @returns {{
 *   positionOptions: { enableHighAccuracy: boolean },
 *   trackUserLocation: boolean,
 *   showUserHeading: boolean,
 *   showAccuracyCircle: boolean,
 * } | null}
 */
export function buildLocateOptions(attribute) {
  if (attribute === null || attribute === undefined) return NONE;

  return {
    positionOptions: {
      // **衛星を優先する。**Wi-Fi や基地局から位置を出す方式は、
      // まさに通信が無い場所で効かない
      enableHighAccuracy: true,
      // **`timeout` を入れない。**通信が無いと初回の測位に数十秒かかる
      // （普段は軌道情報を通信で先取りしている＝A-GPS）。
      // ここを切ると、**効いてほしい場面で自分から諦める**ことになる
    },
    // 止まった点だけ出しても、歩いている人には使えない
    trackUserLocation: true,
    // **避難では「どっちへ走るか」が要る。**点だけでは向きが分からない
    showUserHeading: true,
    showAccuracyCircle: true,
  };
}

/**
 * 全画面ボタンを出すか。**属性があるときだけ。**
 *
 *   <mmj-map fullscreen>
 *
 * 頁の一部に置かれた地図は、**周りの文字より小さいことが多い**。
 * 広げる手段が無いと、**指で動かすたびに周りの文字が邪魔をする**
 * （2026-09-29・地図は全画面で見たいもの、という指摘）。
 *
 * **勝手には出さない。**`locate` と同じで、置く側が決める
 * （地図を並べた頁では、1 枚ずつにボタンが並ぶと騒がしい）。
 *
 * @param {string | null | undefined} attribute
 * @returns {boolean}
 */
export function wantsFullscreen(attribute) {
  return attribute !== null && attribute !== undefined;
}

/**
 * 10 進数として読む。空文字や "12px" を数にしない。
 * @param {string | undefined} text
 * @returns {number | null}
 */
function toNumber(text) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/**
 * 目印のポップアップに渡す設定。
 *
 * @param {string} [className]
 * @param {string} [maxWidth] カードのときだけ渡す（既定の 240px では狭い）
 *
 * **閉じるボタンを出さない。** MapLibre の既定は `closeButton: true` で、
 * `position: absolute; right: 0; top: 0` の × が箱の右上に乗る。
 * 「大阪城」のような短い文字だと箱が狭く、**× が文字に重なって潰れて見える**
 * （実測: docs/screenshots/2026-09-16-elements-popup.jpg の「謎の四角」がこれ）。
 *
 * **閉じる手段は奪っていない。**地図を押せば閉じる（`closeOnClick`）。
 * 目印をもう一度押しても閉じる。
 */
export function buildPopupOptions(className = DEFAULT_POPUP_CLASS, maxWidth) {
  return {
    offset: 24,
    className,
    closeButton: false,
    closeOnClick: true,
    // **カードだけ広げる。**MapLibre の既定は 240px で、タブを 4 枚並べると
    // 2 段に折れて中身が下で切れた（実測・2026-09-28）。
    // **短い吹き出しは今までどおり**——「大阪城」の 3 文字に広い箱は要らない
    ...(maxWidth === undefined ? {} : { maxWidth }),
  };
}

/** 配色を渡さないときのクラス名。**既定の見た目を変えないため** */
const DEFAULT_POPUP_CLASS = "mmj-popup";

/**
 * ポップアップに使う色。**すべて `styles/modern-dark.json` に既にある値。**
 *
 * **新しい色を作っていない**（baseline §11）。見た目の方向性は人が決める領域で、
 * ここで足した色はそのまま既成事実になるため、スタイルの正本（D-002）から借りるだけにする。
 * **借りていることはテストで縛ってある**（スタイルに無い値を書いたら落ちる）。
 */
export const POPUP_COLORS = {
  /** 地図のパネル面と同じ（`background` / `station-dot` の circle-color） */
  background: "#1B1F24",
  /** 地名ラベルと同じ（`label-place-city` の text-color） */
  text: "#D8DCE1",
  /** 道路の線と同じ（`roads-minor` の line-color） */
  border: "#2E343B",
};

/** 配色を渡さないときのクラス名。**既定の見た目を変えないため** */
const DEFAULT_CONTROL_CLASS = "mmj-ctrl";

/**
 * 地図の部品（帰属表示・縮尺）を、読み込んだ配色に合わせる CSS。**ここは純粋関数**。
 *
 * MapLibre の既定は**白い箱**で、暗い地図の隅に紙が 2 枚浮いて見える。
 * 吹き出しは D-019 で直したが、**この 2 つは残っていた**
 * （2026-09-25・人が指摘。公開デモ 10 枚すべてで出ていた）。
 *
 * **帰属表示は消さない・薄くしない。**`© OpenStreetMap contributors` は ODbL の条件で
 * あって体裁ではない（`LICENSES.md`）。ここでやるのは
 * **「読める形で地図に馴染ませる」ところまで**で、`display:none` も `opacity` も書かない。
 * **テストで縛ってある**（書いたら落ちる）。
 *
 * 色は吹き出しと同じ 3 つを借りる。`background` には地色ではなく `surface`
 * （ラベルの縁取り色＝**地図に対して読めるために選ばれている色**）が渡ってくる。
 *
 * `className` を分けるのは吹き出しと同じ理由で、**1 ページに配色違いを並べたときに
 * 最初の 1 枚の色が全部へ効く**のを防ぐため（`themes.html` は 6 枚並ぶ）。
 *
 * @param {{ background: string, text: string, border: string }} [colors]
 * @param {string} [className]
 */
export function buildControlStyle(colors = POPUP_COLORS, className = DEFAULT_CONTROL_CLASS) {
  const plate =
    `background:${colors.background};` +
    `color:${colors.text};` +
    // 地色に近い面を置くので、**縁が無いと地図との境目が消える**
    `border:1px solid ${colors.border};` +
    "border-radius:3px;";

  // **黒い絵記号（＋ − 方位）は、暗い面の上では消える。**反転させる。
  // 明るい面で反転すると今度はそちらで消えるので、**面の明暗で決める**。
  const icons = isDarkColor(colors.background)
    ? `.${className} .maplibregl-ctrl-group button .maplibregl-ctrl-icon{filter:invert(1);}`
    : "";

  return (
    `.${className} .maplibregl-ctrl-attrib{${plate}}` +
    // **リンクの色も変える。**既定の青のままだと、暗い面で沈んで読めない。
    // 下線は消さない（リンクだと分かる手がかりを、色だけに頼らせないため）
    `.${className} .maplibregl-ctrl-attrib a{color:${colors.text};}` +
    `.${className} .maplibregl-ctrl-scale{${plate}}` +
    // 開閉ボタンの丸も白地で来る。**箱だけ直すと、ボタンだけ白く残る**
    `.${className} .maplibregl-ctrl-attrib-button{background-color:${colors.background};}` +
    // **箱は 3 つある。**帰属表示・縮尺・操作ボタン。2 つだけ直すと、
    // 残った 1 つが前より目立つ（実測: `themes.html` の Modern Dark と Neon で
    // 右上に白い列が残った・2026-09-25）。
    `.${className} .maplibregl-ctrl-group{${plate}}` +
    // **操作ボタンは 29x29 しかない。**MapLibre の既定で、指の目安（Apple 44pt /
    // Material 48dp）の 2/3 以下（実測・2026-09-30。全 15 頁で `pnpm smoke` が検出した）。
    // **配色は変えていない。**大きさだけ。絵記号は中央に置き直す
    `.${className} .maplibregl-ctrl-group button{` +
    "width:36px;height:36px;display:flex;align-items:center;justify-content:center;}" +
    // 目印も 27px 幅しかない。**絵は変えず、押せる幅だけ広げる**——
    // 横の余白を足して同じだけ外へ戻すので、**見た目の位置は動かない**
    // （MapLibre は目印を translate(-50%) で置くため、左右対称なら中心は変わらない）
    `.${className} .maplibregl-marker{padding:0 5px;margin:0 -5px;}` +
    `.${className} .maplibregl-ctrl-group button{background:transparent;}` +
    // ボタン同士の仕切りも既定は薄い黒。暗い面では見えないので縁と同じ色にする
    `.${className} .maplibregl-ctrl-group button+button{border-top-color:${colors.border};}` +
    // 既定の hover は `rgba(0,0,0,.05)` で、**暗い面では押せることが分からない**
    `.${className} .maplibregl-ctrl-group button:hover{background:${colors.border};}` +
    icons
  );
}

/** tip（三角）が向きごとに塗る辺。**1 つでも漏らすと、その向きだけ白い三角が残る。** */
const TIP_SIDES = {
  top: "bottom",
  "top-left": "bottom",
  "top-right": "bottom",
  bottom: "top",
  "bottom-left": "top",
  "bottom-right": "top",
  left: "right",
  right: "left",
};

/**
 * ポップアップを暗い地図に合わせる CSS。**ここは純粋関数**（文字列を組むだけ）。
 *
 * MapLibre の既定は白地で、暗い地図の上に置くと紙が 1 枚浮いて見える。
 * **箱だけ暗くしても足りない。**三角（tip）は向きごとに別の辺を `#fff` で塗るので、
 * 8 方向すべてを上書きしないと、開く向きによって白い三角が残る。
 *
 * **色は読み込んだスタイルから借りる**（`palette.js` の `readTheme`）。
 * 以前は暗いスタイルの値を固定で持っていたため、配色が 6 枚になった時点で
 * **明るい地図の上でポップアップだけ暗い箱**になっていた（D-019）。
 *
 * `className` を分けるのは、1 ページに配色違いを並べたときに
 * **最初の 1 枚の色が全部へ効く**のを防ぐため（`themes.html` は 6 枚並ぶ）。
 *
 * @param {{ background: string, text: string, border: string }} [colors]
 * @param {string} [className]
 */
export function buildPopupStyle(colors = POPUP_COLORS, className = DEFAULT_POPUP_CLASS) {
  const tip = Object.entries(TIP_SIDES)
    .map(
      ([anchor, side]) =>
        `.${className}.maplibregl-popup-anchor-${anchor} .maplibregl-popup-tip{border-${side}-color:${colors.background};}`,
    )
    .join("");

  return (
    `.${className} .maplibregl-popup-content{` +
    `background:${colors.background};` +
    `color:${colors.text};` +
    `border:1px solid ${colors.border};` +
    "border-radius:4px;" +
    "padding:6px 10px;" +
    "box-shadow:0 2px 8px rgba(0,0,0,.45);" +
    "font:13px/1.5 system-ui,-apple-system,'Segoe UI','Hiragino Sans','Noto Sans JP',sans-serif;" +
    "}" +
    // 「大阪梅田」の 4 文字が 2 行に割れると、箱が縦長になって読みにくい。
    // **箱ごとではなく文字の行だけに掛ける**（写真の下の説明が 1 行に伸びて溢れるため）
    `.${className} .mmj-popup-text{white-space:nowrap;}` +
    // **写真が 2 枚以上なら横に流す。**縦に積むと、星も長文もリンクも画面の外へ出る
    // （実測・2026-09-28。写真 2 枚で吹き出しが 422px になり、地図からはみ出した）。
    // **1 枚ぶんずつ止まる**ので、めくったことが分かる
    // **先に高さを取っておく。**写真は遅れて読み込まれる（`loading="lazy"`）ので、
    // 高さを決めずにいると、**箱が出たあとで上へ伸びる**。
    // MapLibre は出した瞬間の高さで向き（上に出すか下に出すか）を決めるため、
    // **後から伸びたぶんは地図の外へはみ出す**（実測・2026-09-28。
    // 地図の上端 y=265 に対し吹き出しの上端が y=168。**頁のヘッダの下に潜り、
    // カードのボタンを押したつもりがメニューのリンクを押していた**）。
    `.${className} .mmj-popup-gallery{` +
    "display:flex;gap:6px;height:120px;overflow-x:auto;scroll-snap-type:x mandatory;" +
    "overscroll-behavior-x:contain;scrollbar-width:thin;}" +
    // **1 枚を幅いっぱいにしない。**ぴったり収めると、横に流せることが
    // 画面のどこにも出ず、**写真 1 枚の店にしか見えない**
    // （実測・2026-09-28。3 枚入れて撮ったら 1 枚目しか見えなかった）。
    // 次の 1 枚の端を覗かせる。**続きがあることは、覗いている端が伝える**
    `.${className} .mmj-popup-gallery img{` +
    "flex:0 0 86%;scroll-snap-align:start;max-width:none;min-width:0;" +
    // 帯の高さいっぱいに敷く。**写真ごとに縦が違うと、帯がぎざぎざになる**
    "height:100%;max-height:none;object-fit:cover;}" +
    // 帯そのものがキーボードで触れる（`tabindex`）。**どこにいるか出す**
    `.${className} .mmj-popup-gallery:focus-visible{` +
    `outline:2px solid ${colors.text};outline-offset:2px;}` +
    // **長文と星は折り返す。**短い名前と同じ扱いにすると、横へ伸び続ける
    `.${className} .mmj-popup-copy{white-space:normal;max-width:28em;margin-top:.35em;}` +
    `.${className} .mmj-popup-rating{white-space:nowrap;margin-top:.2em;opacity:.85;}` +
    // タブの帯。**選んでいるものが見て分かる形**にする
    // （下線だけだと、触る画面では押せることも、いまどれかも伝わらない——
    //   デモの頁のメニューで 2 回やり直している）
    `.${className} .mmj-popup-tabs{` +
    // **折り返さず、横へ流す。**6 枚で 2 段になり、そのぶん中身が折り目の下へ沈んだ
    // （実測・2026-09-29。PC 幅で「星・長文・リンク」が最初の画面に出ていなかった）。
    // **縮めることを許す**（`min-width` の既定だと、行の幅が箱を押し広げる）
    "display:flex;gap:.25rem;margin:.5em 0 .4em;flex-wrap:nowrap;" +
    "overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:thin;min-width:0;" +
    `border-bottom:1px solid ${colors.border};padding-bottom:.35em;}` +
    `.${className} .mmj-popup-tab{` +
    "min-height:30px;padding:.25em .6em;border-radius:6px;" +
    `border:1px solid ${colors.border};background:transparent;color:${colors.text};` +
    "font:inherit;font-size:12px;line-height:1.4;cursor:pointer;opacity:.75;flex:0 0 auto;}" +
    `.${className} .mmj-popup-tab[aria-selected="true"]{` +
    `background:${colors.border};opacity:1;font-weight:600;}` +
    `.${className} .mmj-popup-tab:focus-visible{outline:2px solid ${colors.text};outline-offset:1px;}` +
    // **改行を残す。**品書きもクーポンも、行で分かれているのが中身そのもの
    `.${className} .mmj-popup-panel{white-space:pre-line;}` +
    // 口コミ。**本文が主役**で、星と名前は添えもの
    `.${className} .mmj-popup-review{padding:.4em 0;}` +
    `.${className} .mmj-popup-review + .mmj-popup-review{border-top:1px solid ${colors.border};}` +
    `.${className} .mmj-popup-by{margin-top:.2em;font-size:.85em;opacity:.7;}` +
    // 曜日ごとの営業時間。**行で読ませる**（表の罫線は要らない）
    `.${className} .mmj-popup-hours-row{display:flex;gap:.6em;padding:.15em 0;}` +
    `.${className} .mmj-popup-hours-day{flex:0 0 4.5em;opacity:.8;}` +
    // **今日の行だけ強くする。**これは判断ではなく暦
    `.${className} .mmj-popup-hours-row[data-today]{font-weight:600;}` +
    `.${className} .mmj-popup-hours-row[data-today] .mmj-popup-hours-day{opacity:1;}` +
    // 写真の送りボタン。**指で払える画面では出さない**
    // （指のほうが速く、ボタンは写真を隠す。2026-09-29・PC で払えないという指摘）
    `.${className} .mmj-popup-gallery-wrap{position:relative;}` +
    `.${className} .mmj-popup-slide{display:none;}` +
    "@media (hover: hover) and (pointer: fine){" +
    `.${className} .mmj-popup-slide{` +
    "display:flex;align-items:center;justify-content:center;position:absolute;top:50%;" +
    "transform:translateY(-50%);width:28px;height:44px;padding:0;" +
    `border:1px solid ${colors.border};border-radius:6px;` +
    `background:${colors.background};color:${colors.text};` +
    "font:inherit;font-size:16px;line-height:1;cursor:pointer;opacity:.85;}" +
    `.${className} .mmj-popup-slide:hover{opacity:1;}` +
    `.${className} .mmj-popup-slide:focus-visible{outline:2px solid ${colors.text};outline-offset:1px;}` +
    `.${className} .mmj-popup-slide-prev{left:2px;}` +
    `.${className} .mmj-popup-slide-next{right:2px;}` +
    "}" +
    // リンクは**押せると分かる形**にする（下線を消さない）
    `.${className} .mmj-popup-link{` +
    `display:inline-block;margin-top:.45em;color:${colors.text};` +
    "text-decoration:underline;text-underline-offset:2px;margin-right:.6em;}" +
    // 置く側が渡したアイコン。**大きさはこちらが決める**
    // （ばらばらの寸法で来るので、揃えないと並びが読みにくい）
    `.${className} .mmj-popup-link-icon{` +
    "display:inline-block;width:1em;height:1em;margin-right:.3em;" +
    "vertical-align:-0.12em;object-fit:contain;}" +
    // 写真は原寸で来る。**抑えないと画面が埋まる**
    `.${className} .mmj-popup-body img{` +
    "display:block;max-width:220px;max-height:160px;width:100%;height:auto;" +
    "object-fit:cover;border-radius:3px;margin:0 0 6px;" +
    "}" +
    // 写真があるときは 1 行に縛らない（説明が長いことがある）
    `.${className} .mmj-popup-body:has(img) .mmj-popup-text{white-space:normal;max-width:220px;}` +
    tip
  );
}

/**
 * URL の hash が傾き（pitch）まで持っているかを見る。**ここは純粋関数。**
 *
 * MapLibre の hash は `#zoom/lat/lng/bearing/pitch` の 5 要素。
 * **3 要素しか書かれていない URL を開くと、bearing と pitch が 0 に戻される。**
 * `pitch="60"` と書いてあっても hash が勝つ。
 *
 * その結果、**3D のページを URL で渡すと、渡された側では建物が平らになる**
 * （実測: `3d.html#16/34.7024/135.4959` で立たなかった・2026-09-20）。
 *
 * hash が pitch を持っていないときだけ、属性の pitch を当て直す。
 * **持っているときは触らない。**利用者が URL で指定した角度を奪わないため。
 *
 * @param {string | null | undefined} hash `location.hash`（先頭の `#` は有無どちらでも）
 * @returns {boolean} pitch を持っているなら true
 */
export function hashOverridesPitch(hash) {
  if (typeof hash !== "string") return false;
  const body = hash.startsWith("#") ? hash.slice(1) : hash;
  if (body === "") return false;
  // `#map=16/34.7/135.5` のような名前つきの形は、この判定の対象にしない
  if (body.includes("=")) return false;

  const parts = body.split("/");
  if (parts.length < 5) return false;
  // 5 要素目が数でなければ pitch ではない。**位置だけ見て信じない**
  return toNumber(parts[4]) !== null;
}
