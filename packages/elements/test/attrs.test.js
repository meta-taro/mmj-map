import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  applyTilesUrl,
  parsePitch,
  buildMapOptions,
  buildPopupOptions,
  wantsFullscreen,
  buildControlStyle,
  buildLocateOptions,
  buildPopupStyle,
  resolveStyleUrls,
  hashOverridesPitch,
  parseLngLat,
  parseZoom,
  POPUP_COLORS,
} from "../src/attrs.js";

describe("parseLngLat", () => {
  it("経度,緯度 の順で読む（GeoJSON と同じ並び）", () => {
    expect(parseLngLat("135.5023,34.6937")).toEqual([135.5023, 34.6937]);
  });

  it("空白は許す", () => {
    expect(parseLngLat(" 135.5 , 34.7 ")).toEqual([135.5, 34.7]);
  });

  it("読めなければ null（**勝手に 0,0 へ置かない**。海の真ん中に置かれても気づけない）", () => {
    expect(parseLngLat("")).toBeNull();
    expect(parseLngLat("135.5")).toBeNull();
    expect(parseLngLat("東京,大阪")).toBeNull();
    expect(parseLngLat(null)).toBeNull();
  });

  it("地球の外は受けない", () => {
    expect(parseLngLat("200,34")).toBeNull();
    expect(parseLngLat("135,91")).toBeNull();
  });
});

describe("parseZoom", () => {
  it("数として読む", () => {
    expect(parseZoom("12", 5)).toBe(12);
    expect(parseZoom("12.5", 5)).toBe(12.5);
  });

  it("読めなければ既定値", () => {
    expect(parseZoom(null, 5)).toBe(5);
    expect(parseZoom("ちかく", 5)).toBe(5);
  });

  it("MapLibre の範囲へ収める", () => {
    expect(parseZoom("-3", 5)).toBe(0);
    expect(parseZoom("40", 5)).toBe(24);
  });
});

describe("applyTilesUrl", () => {
  it("__TILES_URL__ を差し替える。**色は組み立てない**（手書き JSON が正本・D-002）", () => {
    const style = '{"sources":{"basemap":{"url":"pmtiles://__TILES_URL__"}}}';
    const result = applyTilesUrl(style, "https://t.example.com/japan.pmtiles");
    expect(result.text).toContain("pmtiles://https://t.example.com/japan.pmtiles");
    expect(result.replaced).toBe(1);
  });

  it("差し替え先が無いことを黙って通さない（配信先を指していない地図は白くなる）", () => {
    expect(applyTilesUrl('{"layers":[]}', "https://t.example.com/a.pmtiles").replaced).toBe(0);
  });

  it("複数箇所あっても全部差し替える", () => {
    expect(applyTilesUrl("__TILES_URL__ __TILES_URL__", "x").replaced).toBe(2);
  });
});

describe("buildMapOptions", () => {
  const base = { container: "c", style: { version: 8 }, center: /** @type {[number, number]} */ ([135.5, 34.7]), zoom: 12, hash: false };

  it("帰属表示を消せない形で渡す（LICENSES.md）", () => {
    expect(buildMapOptions(base).attributionControl).toEqual({ compact: false });
  });

  it("漢字かなは閲覧側のフォントで描く（グリフに CJK が無いため）", () => {
    expect(buildMapOptions(base).localIdeographFontFamily).toContain("Noto Sans JP");
  });

  it("渡した中心と zoom をそのまま使う", () => {
    const options = buildMapOptions({ ...base, zoom: 9 });
    expect(options.center).toEqual([135.5, 34.7]);
    expect(options.zoom).toBe(9);
  });

  it("hash は指定どおり", () => {
    expect(buildMapOptions({ ...base, hash: true }).hash).toBe(true);
  });
});

describe("buildPopupOptions", () => {
  it("**閉じるボタンを出さない。**狭い吹き出しでは文字に重なる", () => {
    // MapLibre の既定は closeButton: true で、position:absolute の × が右上に乗る。
    // 「大阪城」の 3 文字だと箱が狭く、文字が押しつぶされて四角く見える（実測・撮って気づいた）
    expect(buildPopupOptions().closeButton).toBe(false);
  });

  it("地図を押せば閉じる（**閉じる手段を奪っていない**）", () => {
    expect(buildPopupOptions().closeOnClick).toBe(true);
  });

  it("目印の上に出す。**重ならない距離を既定に持つ**", () => {
    expect(buildPopupOptions().offset).toBeGreaterThan(0);
  });

  it("独自のクラスを付ける（**MapLibre 全体の見た目を書き換えない**）", () => {
    expect(buildPopupOptions().className).toBe("mmj-popup");
  });
});

describe("POPUP_COLORS", () => {
  // **新しい色を作っていないことを、機械で縛る**（baseline §11）。
  // スタイルは手書きの正本（D-002）なので、そこに無い色を部品が持ち込んだら落とす。
  const style = readFileSync(new URL("../../../styles/modern-dark.json", import.meta.url), "utf8");

  for (const [name, value] of Object.entries(POPUP_COLORS)) {
    it(`${name} (${value}) は styles/modern-dark.json にある色`, () => {
      expect(style.toUpperCase()).toContain(value.toUpperCase());
    });
  }
});

describe("buildPopupStyle", () => {
  const css = buildPopupStyle();

  it("独自クラスの中だけを変える（**MapLibre 全体の見た目を書き換えない**）", () => {
    for (const rule of css.split("}").filter((r) => r.trim() !== "")) {
      expect(rule).toContain(".mmj-popup");
    }
  });

  it("**三角（tip）も塗り替える。**箱だけ暗くすると、白い三角が残る", () => {
    expect(css).toContain("maplibregl-popup-tip");
    // 8 方向すべて。1 つでも漏らすと、その向きに開いたときだけ白い三角が出る
    for (const anchor of ["top", "bottom", "left", "right", "top-left", "top-right", "bottom-left", "bottom-right"]) {
      expect(css).toContain(`maplibregl-popup-anchor-${anchor} `);
    }
  });

  it("折り返しを止める（短い名前が 2 行に割れない）", () => {
    expect(css).toContain("white-space:nowrap");
  });

  /**
   * 吹き出しに写真を載せられるようにしたので、**箱の作りが変わる**。
   * 折り返し止めを箱ごとに掛けたままだと、写真の下の説明が 1 行に伸びて溢れる。
   */
  it("**折り返し止めは文字の行だけに掛ける**（写真の下の説明が溢れないように）", () => {
    expect(css).toContain(".mmj-popup-text");
    const contentRule = css.split("}").find((r) => r.includes("maplibregl-popup-content"));
    expect(contentRule).not.toContain("white-space");
  });

  it("**写真の大きさを抑える。**原寸のまま出すと画面が埋まる", () => {
    expect(css).toContain(".mmj-popup-body img");
    expect(css).toContain("max-width");
  });
});

describe("parsePitch", () => {
  it("読めれば、その角度", () => {
    expect(parsePitch("60", 0)).toBe(60);
  });

  it("読めなければ既定値（黙って 0 へ倒すと、3D にしたのに真上から見た絵になる）", () => {
    expect(parsePitch("ななめ", 45)).toBe(45);
    expect(parsePitch(null, 45)).toBe(45);
  });

  it("MapLibre の範囲（0〜85）へ収める", () => {
    expect(parsePitch("120", 0)).toBe(85);
    expect(parsePitch("-10", 0)).toBe(0);
  });
});

describe("hashOverridesPitch", () => {
  // **`hash` を付けると pitch 属性が無視される。**
  // MapLibre の hash は `#zoom/lat/lng/bearing/pitch` の 5 要素で、
  // 3 要素しか書かれていない URL を開くと bearing と pitch が 0 に戻される。
  // 実測: `3d.html#16/34.7024/135.4959` で建物が立たなかった（2026-09-20・撮って気づいた）。

  it("**3 要素の hash は pitch を持たない**（0 に戻される側）", () => {
    expect(hashOverridesPitch("#16/34.7024/135.4959")).toBe(false);
  });

  it("5 要素の hash は pitch を持つ（利用者が指定した角度を尊重する）", () => {
    expect(hashOverridesPitch("#16/34.7024/135.4959/0/60")).toBe(true);
  });

  it("4 要素（bearing まで）も pitch は持たない", () => {
    expect(hashOverridesPitch("#16/34.7024/135.4959/30")).toBe(false);
  });

  it("hash が無い・空なら持たない", () => {
    expect(hashOverridesPitch("")).toBe(false);
    expect(hashOverridesPitch("#")).toBe(false);
    expect(hashOverridesPitch(null)).toBe(false);
  });

  it("**数でない要素を pitch と数えない**（`#foo/bar/baz/qux/quux` を信じない）", () => {
    expect(hashOverridesPitch("#a/b/c/d/e")).toBe(false);
  });

  it("MapLibre の名前つき hash（`#map=...`）は対象外", () => {
    expect(hashOverridesPitch("#map=16/34.7/135.5")).toBe(false);
  });
});

/**
 * **1 ページに地図を何枚も置くと、指で送れなくなる。**
 *
 * 地図は 1 本指のなぞりを自分の移動として受け取るので、画面いっぱいの地図が
 * 縦に並ぶと、触れた指では**ページが下へ送れない**（themes.html で実際に詰まる）。
 * MapLibre の `cooperativeGestures` は 1 本指をページへ返し、2 本指だけを地図が取る。
 *
 * **既定では入れない。**地図が 1 枚だけのページで 2 本指を要求すると、
 * 今度はそちらが使いにくくなる。置く側が選ぶ。
 */
describe("buildMapOptions の cooperative", () => {
  const base = { container: {}, style: {}, center: /** @type {[number, number]} */ ([135, 34]), zoom: 12, hash: false };

  it("既定では cooperativeGestures を付けない", () => {
    expect(buildMapOptions(base).cooperativeGestures).toBe(false);
  });

  it("cooperative: true で有効にする", () => {
    expect(buildMapOptions({ ...base, cooperative: true }).cooperativeGestures).toBe(true);
  });

  it("他の設定を壊さない（帰属表示と CJK は残る）", () => {
    const options = buildMapOptions({ ...base, cooperative: true });
    expect(options.attributionControl).toEqual({ compact: false });
    expect(options.localIdeographFontFamily).toContain("Noto Sans JP");
  });
});

/**
 * **ポップアップの色を焼き込まない。**
 *
 * 以前は `modern-dark.json` から借りた暗い色を固定で持っていた。
 * 配色が 6 枚になり、**明るいスタイルの上では暗い箱が 1 枚浮く**ようになった
 * （D-019 で light / ink / sand / candy が入った）。
 * 借りる先を、読み込んだスタイルへ移す。
 */
describe("buildPopupStyle に色を渡す", () => {
  const light = { background: "#EDF0F3", text: "#2B3138", border: "#D4D9DF" };

  it("渡した色を使う", () => {
    const css = buildPopupStyle(light);
    expect(css).toContain("#EDF0F3");
    expect(css).toContain("#2B3138");
    expect(css).toContain("#D4D9DF");
  });

  it("渡さなければ、これまでと同じ既定（暗い側）", () => {
    expect(buildPopupStyle()).toContain(POPUP_COLORS.background);
  });

  it("**三角も渡した色で塗る**（箱だけ変えると、明るい地図に暗い三角が残る）", () => {
    const css = buildPopupStyle(light);
    for (const anchor of ["top", "bottom", "left", "right"]) {
      expect(css).toContain(`maplibregl-popup-anchor-${anchor} `);
    }
    expect(css).not.toContain(POPUP_COLORS.background);
  });

  it("クラス名を変えると、そのクラスの中だけを変える", () => {
    const css = buildPopupStyle(light, "mmj-popup-abc");
    for (const rule of css.split("}").filter((r) => r.trim() !== "")) {
      expect(rule).toContain(".mmj-popup-abc");
    }
  });
});

/**
 * **本番でだけ壊れた実例**（2026-09-27）。
 *
 * スタイルの `glyphs` を `../glyphs/{fontstack}/{range}.pbf` にしたところ、
 * **MapLibre は「スタイルの位置」ではなく「頁の位置」で相対 URL を解決した**。
 *
 *   スタイル: https://example.com/mmj-map/styles/modern-dark.json
 *   頁      : https://example.com/mmj-map/venue.html
 *   期待    : https://example.com/mmj-map/glyphs/...
 *   実際    : https://example.com/glyphs/...        ← 404
 *
 * **手元では通っていた。**開発サーバーが `/glyphs` を root に配っていたため。
 * だから**こちらでスタイル URL から解いて、絶対 URL にしてから渡す**。
 */
describe("resolveStyleUrls", () => {
  const styleUrl = "https://example.com/mmj-map/styles/modern-dark.json";

  it("`glyphs` の相対 URL を、**スタイルの位置**から解く", () => {
    const style = resolveStyleUrls({ glyphs: "../glyphs/{fontstack}/{range}.pbf" }, styleUrl);
    expect(style.glyphs).toBe("https://example.com/mmj-map/glyphs/{fontstack}/{range}.pbf");
  });

  it("**`{fontstack}` と `{range}` を壊さない**（URL として解くと壊れる書き方がある）", () => {
    const style = resolveStyleUrls({ glyphs: "../glyphs/{fontstack}/{range}.pbf" }, styleUrl);
    expect(style.glyphs).toContain("{fontstack}");
    expect(style.glyphs).toContain("{range}");
  });

  it("絶対 URL はそのまま（**外を指しているものを書き換えない**）", () => {
    const abs = "https://other.example/fonts/{fontstack}/{range}.pbf";
    expect(resolveStyleUrls({ glyphs: abs }, styleUrl).glyphs).toBe(abs);
  });

  it("`sprite` も同じ扱い", () => {
    expect(resolveStyleUrls({ sprite: "../sprite" }, styleUrl).sprite).toBe(
      "https://example.com/mmj-map/sprite",
    );
  });

  it("**元のスタイルを書き換えない**（ECC coding-style の不変性）", () => {
    const original = { glyphs: "../glyphs/{fontstack}/{range}.pbf" };
    resolveStyleUrls(original, styleUrl);
    expect(original.glyphs).toBe("../glyphs/{fontstack}/{range}.pbf");
  });

  it("`glyphs` が無ければ何もしない", () => {
    expect(resolveStyleUrls({ layers: [] }, styleUrl)).toEqual({ layers: [] });
  });

  it("スタイル URL が読めなければ、そのまま返す（**地図を殺さない**）", () => {
    const style = { glyphs: "../glyphs/{fontstack}/{range}.pbf" };
    expect(resolveStyleUrls(style, "")).toEqual(style);
  });
});

/**
 * **避難で本当に要るのは「地図」より「いま自分がどこで、どっちを向いているか」。**
 *
 * **GPS は通信が無くても動く**（測位は衛星からで、通信ではない）。
 * つまり**地図さえ手元にあれば、停電・輻輳でも現在地つきで動ける**。
 * 欠けていた唯一のピースは、地図がネット越しだったことだけ。
 *
 * ただし**通信が無いと初回の測位が数十秒かかる**（普段は軌道情報を通信で
 * 先取りしている＝A-GPS）。ここを短い timeout で切ると、**まさに効いてほしい
 * 場面で自分から諦める**ことになる。
 */
describe("buildLocateOptions", () => {
  it("**属性が無ければ null。**勝手に位置情報を要求しない", () => {
    expect(buildLocateOptions(null)).toBeNull();
    expect(buildLocateOptions(undefined)).toBeNull();
  });

  it("属性があれば設定を返す（値は空でよい＝ただ付けるだけ）", () => {
    expect(buildLocateOptions("")).not.toBeNull();
  });

  it("**衛星を優先する。**通信に頼る測位は、通信が無いところで効かない", () => {
    expect(buildLocateOptions("")?.positionOptions?.enableHighAccuracy).toBe(true);
  });

  it("**時間で打ち切らない。**通信が無いときの初回測位を、自分から諦めない", () => {
    // `timeout` を入れた時点で、数十秒かかる正常な測位が「失敗」になる
    expect(buildLocateOptions("")?.positionOptions).not.toHaveProperty("timeout");
  });

  it("**向きも出す。**避難では「どっちへ走るか」が要る", () => {
    expect(buildLocateOptions("")?.showUserHeading).toBe(true);
  });

  it("動いたら追う（止まった点だけ出しても、歩いている人には使えない）", () => {
    expect(buildLocateOptions("")?.trackUserLocation).toBe(true);
  });
});

/**
 * **帰属表示と縮尺も、白い箱のまま暗い地図に乗っていた。**
 *
 * 吹き出しは D-019 で直したが、**地図の部品（attribution / scale）は残っていた**。
 * 公開デモ 10 枚すべてで、暗い地図の隅に紙が 2 枚浮いて見える（2026-09-25・人が指摘）。
 *
 * **帰属表示は消さない・薄くしない。**ODbL の条件であって体裁ではない（`LICENSES.md`）。
 * 変えるのは「読める形で地図に馴染ませる」ところまで。
 */
describe("buildControlStyle", () => {
  const light = { background: "#EDF0F3", text: "#2B3138", border: "#D4D9DF" };

  it("渡した色を使う", () => {
    const css = buildControlStyle(light, "mmj-ctrl-abc");
    expect(css).toContain("#EDF0F3");
    expect(css).toContain("#2B3138");
  });

  it("独自クラスの中だけを変える（**MapLibre 全体の見た目を書き換えない**）", () => {
    const css = buildControlStyle(light, "mmj-ctrl-abc");
    for (const rule of css.split("}").filter((r) => r.trim() !== "")) {
      expect(rule).toContain(".mmj-ctrl-abc");
    }
  });

  it("**リンクの色も変える。**既定の青が残ると、暗い面で読めない", () => {
    expect(buildControlStyle(light, "mmj-ctrl-abc")).toContain("maplibregl-ctrl-attrib a");
  });

  it("**縮尺も同じ面に合わせる。**箱が 2 枚あるので、片方だけ直すともう片方が浮く", () => {
    expect(buildControlStyle(light, "mmj-ctrl-abc")).toContain("maplibregl-ctrl-scale");
  });

  it("**帰属表示を消さない・薄くしない**（ODbL の条件であって体裁ではない）", () => {
    const css = buildControlStyle(light, "mmj-ctrl-abc");
    expect(css).not.toMatch(/display\s*:\s*none/);
    expect(css).not.toMatch(/visibility\s*:\s*hidden/);
    expect(css).not.toMatch(/opacity\s*:/);
    expect(css).not.toMatch(/font-size\s*:\s*0/);
  });

  /**
   * **箱は 3 つある。**帰属表示・縮尺・操作ボタン（＋ − 方位）。
   * 2 つだけ直すと、残った 1 つが前より目立つ（実測: 直後に撮った `themes.html` で
   * Modern Dark と Neon の右上に白い列が残った・2026-09-25）。
   */
  it("**操作ボタンも同じ面に合わせる。**2 つだけ直すと、残った 1 つが前より目立つ", () => {
    expect(buildControlStyle(light, "mmj-ctrl-abc")).toContain("maplibregl-ctrl-group");
  });

  it("**暗い面では絵記号を反転する。**黒い ＋ − を暗い面へ置くと消える", () => {
    const dark = { background: "#1B1F24", text: "#D8DCE1", border: "#2E343B" };
    expect(buildControlStyle(dark, "mmj-ctrl-abc")).toContain("invert");
  });

  it("明るい面では反転しない（**反転すると今度は明るい地図で消える**）", () => {
    expect(buildControlStyle(light, "mmj-ctrl-abc")).not.toContain("invert");
  });

  it("配色ごとにクラスを分けられる（**同じだと 6 枚並べたとき色が混ざる**）", () => {
    const css = buildControlStyle(light, "mmj-ctrl-xyz");
    for (const rule of css.split("}").filter((r) => r.trim() !== "")) {
      expect(rule).toContain(".mmj-ctrl-xyz");
    }
  });
});

describe("buildPopupOptions のクラス名", () => {
  it("既定は mmj-popup（これまでと同じ）", () => {
    expect(buildPopupOptions().className).toBe("mmj-popup");
  });

  it("**配色ごとに別のクラスを付けられる。**同じだと 6 枚並べたとき色が混ざる", () => {
    expect(buildPopupOptions("mmj-popup-abc").className).toBe("mmj-popup-abc");
  });
});

/**
 * **CJK のグリフは配っていない**ので、漢字かなは閲覧側のフォントで描く。
 * 既定は日本語向けだが、**中国語や韓国語の地図では字形が合わない**
 * （同じ符号でも国ごとに字体が違う）。置く側が差し替えられるようにする。
 */
describe("buildMapOptions の ideographFonts", () => {
  const base = { container: {}, style: {}, center: /** @type {[number, number]} */ ([135, 34]), zoom: 12, hash: false };

  it("渡さなければ、これまでと同じ既定（日本語向け）", () => {
    expect(buildMapOptions(base).localIdeographFontFamily).toContain("Noto Sans JP");
  });

  it("渡せば差し替わる（繁体中文なら Noto Sans TC など）", () => {
    const options = buildMapOptions({ ...base, ideographFonts: "'Noto Sans TC', sans-serif" });
    expect(options.localIdeographFontFamily).toBe("'Noto Sans TC', sans-serif");
  });

  it("空文字は既定のまま（**空のフォント指定で字を消さない**）", () => {
    expect(buildMapOptions({ ...base, ideographFonts: "" }).localIdeographFontFamily).toContain("Noto Sans JP");
  });
});

/**
 * **カードは、短い吹き出しより広い。**
 *
 * MapLibre の既定は 240px。タブを 4 枚並べると**2 段に折れて、
 * 中身が下で切れた**（実測・2026-09-28。撮って気づいた）。
 * 広げるのはカードのときだけで、「大阪城」だけの箱は今までどおり。
 */
describe("buildPopupOptions の幅", () => {
  it("既定では指定しない（**短い吹き出しの見た目を変えない**）", () => {
    expect(buildPopupOptions().maxWidth).toBeUndefined();
  });

  it("渡されたら、その幅を使う", () => {
    expect(buildPopupOptions("mmj-popup-abc", "20rem").maxWidth).toBe("20rem");
  });
});

/**
 * **地図は全画面で見る。**地図は全画面で見たいもの、という指摘（2026-09-29）。
 *
 * 頁の一部に置かれた地図は、**周りの文字より小さいことが多い**。
 * 広げる手段が無いと、**指で動かすたびに周りの文字が邪魔をする**。
 *
 * **勝手には出さない。**`locate` と同じで、置く側が決める
 * （地図を並べた頁では、1 枚ずつに全画面ボタンが並ぶと騒がしい）。
 */
describe("wantsFullscreen", () => {
  it("属性があれば出す（空文字でよい）", () => {
    expect(wantsFullscreen("")).toBe(true);
    expect(wantsFullscreen("true")).toBe(true);
  });

  it("**無ければ出さない**（既定の見た目を変えない）", () => {
    expect(wantsFullscreen(null)).toBe(false);
    expect(wantsFullscreen(undefined)).toBe(false);
  });
});
