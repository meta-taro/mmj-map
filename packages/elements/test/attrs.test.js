import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  applyTilesUrl,
  parsePitch,
  buildMapOptions,
  buildPopupOptions,
  buildPopupStyle,
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

describe("buildPopupOptions のクラス名", () => {
  it("既定は mmj-popup（これまでと同じ）", () => {
    expect(buildPopupOptions().className).toBe("mmj-popup");
  });

  it("**配色ごとに別のクラスを付けられる。**同じだと 6 枚並べたとき色が混ざる", () => {
    expect(buildPopupOptions("mmj-popup-abc").className).toBe("mmj-popup-abc");
  });
});
