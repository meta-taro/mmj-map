import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  buildAgentBrief,
  buildMarker,
  buildSnippet,
  detailPlaces,
  extractBbox,
  markerAttributes,
  pickPreviewTiles,
  pinLink,
} from "../src/snippet.js";
import {
  DEMO_DETAIL_BBOX,
  MAPLIBRE_FILES,
  MAPLIBRE_VERSION,
  MAP_STYLES,
  PMTILES_VERSION,
  PUBLISHED_REGIONS,
} from "../src/constants.js";
import { findRemoteCode } from "./remote-code.js";

const osaka = { lng: 135.5023, lat: 34.6937, zoom: 14 };

describe("extractBbox", () => {
  it("中心を囲む", () => {
    const [west, south, east, north] = extractBbox(osaka);
    expect(west).toBeLessThan(osaka.lng);
    expect(east).toBeGreaterThan(osaka.lng);
    expect(south).toBeLessThan(osaka.lat);
    expect(north).toBeGreaterThan(osaka.lat);
  });

  /** **PC 幅の画面 1 枚より少し広く切る。**ぴったりだと、少し動かしただけで縁に当たる */
  it("PC 幅（1280px）の画面より広い", () => {
    const [west, , east] = extractBbox(osaka);
    // z14 の 1px は 360 / (512 * 2^14) 度
    const screenDegrees = (1280 * 360) / (512 * 2 ** 14);
    expect(east - west).toBeGreaterThan(screenDegrees);
    expect(east - west).toBeLessThan(screenDegrees * 2);
  });

  /** 値で固定する。**余白・画面の大きさ・cos の項のどれを変えても落ちる** */
  it("大阪 z14 の範囲", () => {
    expect(extractBbox(osaka)).toEqual([135.4611, 34.6725, 135.5435, 34.7149]);
  });

  /** メルカトルでは高緯度ほど緯度 1 度が長い。北緯 60 度では赤道の半分の幅で同じ高さになる */
  it("縦の幅は cos(緯度) で縮む", () => {
    const equator = extractBbox({ lng: 10, lat: 0, zoom: 10 });
    const north = extractBbox({ lng: 10, lat: 60, zoom: 10 });
    expect((north[3] - north[1]) / (equator[3] - equator[1])).toBeCloseTo(0.5, 6);
  });

  it("寄るほど狭くなる", () => {
    const wide = extractBbox({ ...osaka, zoom: 12 });
    const narrow = extractBbox({ ...osaka, zoom: 15 });
    expect(narrow[2] - narrow[0]).toBeLessThan(wide[2] - wide[0]);
  });

  it("地球の外へはみ出さない", () => {
    const [west, south, east, north] = extractBbox({ lng: 179.9, lat: 84.9, zoom: 3 });
    expect(west).toBeGreaterThanOrEqual(-180);
    expect(east).toBeLessThanOrEqual(180);
    expect(south).toBeGreaterThanOrEqual(-85);
    expect(north).toBeLessThanOrEqual(85);
  });
});

describe("buildSnippet", () => {
  const html = buildSnippet(osaka);

  it("中心と縮尺を入れる（経度,緯度の順）", () => {
    expect(html).toContain('center="135.5023,34.6937"');
    expect(html).toContain('zoom="14"');
  });

  it("切り出しのコマンドを、貼るものの中に書いておく", () => {
    expect(html).toContain(`npx @mmj-map/tiles extract map --bbox=${extractBbox(osaka).join(",")}`);
  });

  it("MapLibre は ESM で読み、window に置く", () => {
    expect(html).toContain('import * as maplibregl from "./vendor/maplibre-gl/maplibre-gl.mjs"');
    expect(html).toContain("window.maplibregl = maplibregl");
    expect(html).toContain('<script src="./vendor/pmtiles/pmtiles.js"></script>');
    expect(html).toContain('<link rel="stylesheet" href="./vendor/maplibre-gl/maplibre-gl.css">');
  });

  /**
   * **CDN から読む形を書かない。**拡張が実行しない文面でも、ストアの審査は中の文字列で落とす
   * （2026-11-05、Blue Argon で拒否された）。MapLibre と pmtiles は頁の隣へ置いてもらう
   */
  it("外からコードを読む書き方を入れない", () => {
    expect(findRemoteCode(html)).toEqual([]);
    expect(findRemoteCode(buildAgentBrief(osaka))).toEqual([]);
  });

  /** 置き方を書かないと、`./vendor/` が 404 になって地図が出ない */
  it("MapLibre と pmtiles を頁の隣へ置く手順を、貼るものの中に書いておく", () => {
    expect(html).toContain(`npm i maplibre-gl@${MAPLIBRE_VERSION} pmtiles@${PMTILES_VERSION}`);
    for (const name of MAPLIBRE_FILES) expect(html).toContain(name);
    expect(html).toContain("node_modules/pmtiles/dist/pmtiles.js");
  });

  /** **Google の地点のデータを持ち出さない**（D-034）。目印は置き手が自分で置く */
  it("ピンを置かなければ、目印は入れない", () => {
    expect(html).not.toContain("<mmj-marker");
  });

  it("地図の配色を選べる（既定は明るい地図。会社の頁は白地が多い）", () => {
    expect(html).toContain('style-url="./styles/modern-light.json"');
    expect(buildSnippet(osaka, { style: "modern-dark" })).toContain('style-url="./styles/modern-dark.json"');
  });

  /** **知らない名前をそのまま書かない。**属性値へ入るので、壊れた値は既定へ戻す */
  it("知らない配色の名前は、既定に戻す", () => {
    expect(buildSnippet(osaka, { style: '"><script>' })).toContain('style-url="./styles/modern-light.json"');
  });
});

describe("ピン（置き手が自分で入れる名前・住所・位置）", () => {
  const pin = { lng: 135.49568, lat: 34.67414, name: "株式会社サンプル", note: "大阪市西区1-2-3", url: "" };

  /**
   * **名前・住所・ホームページを行に分ける。**1 行に詰めていたころは、
   * 長い住所で吹き出しが携帯の地図から外へ伸びた（2026-11-04、人が見つけた）。
   */
  it("地図の中にピンを入れ、名前と住所を行に分けて、最初から吹き出しを開く", () => {
    const html = buildSnippet(osaka, { pin });
    expect(html).toContain(
      '<mmj-marker lnglat="135.49568,34.67414" popup="株式会社サンプル" popup-body="大阪市西区1-2-3" popup-open></mmj-marker>',
    );
    expect(html.indexOf("<mmj-marker")).toBeGreaterThan(html.indexOf("<mmj-map"));
    expect(html.indexOf("<mmj-marker")).toBeLessThan(html.indexOf("</mmj-map>"));
  });

  /**
   * **会社の頁の地図は、ピンが真ん中に来るほうがよい。**見ていた場所の中心のままだと、
   * 携帯幅でピンが端に寄って切れた（2026-11-04、見本の 390 幅で撮って気づいた）。
   */
  it("ピンを置いたら、地図の中心と切り出す範囲もピンに合わせる", () => {
    const html = buildSnippet(osaka, { pin });
    expect(html).toContain('center="135.49568,34.67414"');
    expect(html).toContain(`--bbox=${extractBbox({ ...pin, zoom: osaka.zoom }).join(",")}`);
  });

  /**
   * **住所は名前が無くても、折り返す行（`popup-body`）に置く。**1 行目（`popup`）は折り返さないので、
   * 名前を空にして長い住所を入れると、吹き出しが 1 行で伸びた（2026-11-04、人の画面で見つけた）。
   */
  it("名前だけ・住所だけでも置ける（住所はいつも折り返す行に置く）", () => {
    expect(buildMarker({ ...pin, note: "" })).toBe(
      '<mmj-marker lnglat="135.49568,34.67414" popup="株式会社サンプル" popup-open></mmj-marker>',
    );
    expect(buildMarker({ ...pin, name: "  " })).toBe(
      '<mmj-marker lnglat="135.49568,34.67414" popup-body="大阪市西区1-2-3" popup-open></mmj-marker>',
    );
  });

  it("ホームページを入れたら、吹き出しにリンクを足す", () => {
    expect(buildMarker({ ...pin, url: "https://example.com/" })).toBe(
      '<mmj-marker lnglat="135.49568,34.67414" popup="株式会社サンプル" popup-body="大阪市西区1-2-3"' +
        ' popup-href="https://example.com/" popup-href-label="ホームページ" popup-open></mmj-marker>',
    );
  });

  /** 見本の頁も同じ並びで属性を置く。**写すものと見本で中身を変えない** */
  it("見本の頁が置く属性と、写すものの属性は同じ", () => {
    const withUrl = { ...pin, url: "https://example.com/" };
    const html = buildMarker(withUrl);
    for (const [name, value] of markerAttributes(withUrl)) {
      expect(html).toContain(value === "" ? ` ${name}` : `${name}="`);
    }
  });

  /** 文字が無ければ、押しても何も出ない目印だけを置く（空の吹き出しを出さない） */
  it("文字が無ければ、吹き出しを付けない", () => {
    expect(buildMarker({ ...pin, name: "", note: "" })).toBe('<mmj-marker lnglat="135.49568,34.67414"></mmj-marker>');
  });

  /** **人が打った文字を、そのまま HTML へ入れない。**`"` 1 つで属性が閉じ、続きが HTML になる */
  it("属性を閉じる文字・タグの文字を逃がす", () => {
    const marker = buildMarker({ ...pin, name: '"><script>alert(1)</script>', note: "A&B 'x'" });
    expect(marker).not.toContain("<script>");
    expect(marker).toContain('popup="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"');
    expect(marker).toContain('popup-body="A&amp;B &#39;x&#39;"');
  });

  it("エージェントへ渡すものにも入る", () => {
    expect(buildAgentBrief(osaka, { pin })).toContain(buildMarker(pin));
  });
});

describe("pinLink", () => {
  it("https と http の URL はそのまま通す（前後の空白は落とす）", () => {
    expect(pinLink(" https://example.com/about ")).toBe("https://example.com/about");
    expect(pinLink("http://example.com/")).toBe("http://example.com/");
  });

  it("空なら空（入れていない）", () => {
    expect(pinLink("")).toBe("");
    expect(pinLink("   ")).toBe("");
  });

  /** **押した瞬間に、貼った先の頁で走る。**部品も弾くが、写すものにも入れない */
  it("javascript: や data: は通さない", () => {
    expect(pinLink("javascript:alert(1)")).toBeNull();
    expect(pinLink("java\tscript:alert(1)")).toBeNull();
    expect(pinLink("data:text/html,x")).toBeNull();
  });

  /** 「example.com」とだけ打つ人は多い。**直して通すと、違う所へ飛ぶことがある**ので通さず知らせる */
  it("https:// の無いものは通さない（null で知らせる）", () => {
    expect(pinLink("example.com")).toBeNull();
  });

  it("通らない URL は、写すものに入れない", () => {
    const pin = { lng: 135.5, lat: 34.7, name: "店", note: "", url: "javascript:alert(1)" };
    expect(buildMarker(pin)).not.toContain("popup-href");
  });
});

describe("buildAgentBrief", () => {
  const brief = buildAgentBrief(osaka);

  it("貼るものをそのまま含む", () => {
    expect(brief).toContain(buildSnippet(osaka));
  });

  it("属性の全文の在りかを書く（エージェントが続きを組めるように）", () => {
    expect(brief).toContain("https://meta-taro.github.io/mmj-map/llms-full.txt");
  });

  it("守ることを書く", () => {
    expect(brief).toContain("© OpenStreetMap contributors");
    expect(brief).toContain("Google マップから店名やピンを写さない");
  });
});

describe("pickPreviewTiles", () => {
  it("都市のタイルがあれば、それを使う", () => {
    expect(pickPreviewTiles({ lng: -73.9857, lat: 40.7484, zoom: 13 })).toMatchObject({ file: "newyork" });
    expect(pickPreviewTiles({ lng: 139.885, lat: 35.63, zoom: 15 })).toMatchObject({ file: "maihama" });
  });

  it("大阪中心部はデモで、そのままの縮尺で出す", () => {
    expect(pickPreviewTiles(osaka)).toEqual({ file: "demo", label: "大阪中心部", zoom: 14, zoomed: false, detail: true });
  });

  /** **どこなら街路まで出るのかを、見本の頁に出す**（「どこにタイルがあるか分からない」と言われた） */
  it("街路まで出る場所かどうかを返す", () => {
    expect(pickPreviewTiles({ lng: -73.9857, lat: 40.7484, zoom: 15 }).detail).toBe(true);
    expect(pickPreviewTiles({ lng: 139.767, lat: 35.681, zoom: 14 }).detail).toBe(false);
  });

  /**
   * **デモは大阪中心部の外を z9 までしか持たない。**東京駅を z14 で開くと、
   * 黒い四角に「入っていない範囲です」だけが出た（2026-11-04）。
   */
  it("大阪の外は、z9 まで引いて出し、引いたことを知らせる", () => {
    expect(pickPreviewTiles({ lng: 139.767, lat: 35.681, zoom: 14 })).toMatchObject({
      file: "demo",
      zoom: 9,
      zoomed: true,
    });
    expect(pickPreviewTiles({ lng: 139.767, lat: 35.681, zoom: 7 })).toMatchObject({ zoom: 7, zoomed: false });
  });

  it("都市のタイルに画面が収まるなら、縮尺を変えない", () => {
    expect(pickPreviewTiles({ lng: -73.9857, lat: 40.7484, zoom: 15 })).toMatchObject({ zoom: 15, zoomed: false });
  });

  /**
   * **都市のタイルは都市しか持たない。**引いた縮尺のまま出すと、
   * 真ん中に都市があるだけの黒い四角になる。画面がタイルに収まるまで寄せる。
   */
  it("都市のタイルより画面が広いなら、収まるまで寄せる", () => {
    const taipei = pickPreviewTiles({ lng: 121.517, lat: 25.0478, zoom: 10 });
    expect(taipei).toMatchObject({ file: "taipei", zoomed: true });
    expect(taipei.zoom).toBeGreaterThan(10);
    const maihama = pickPreviewTiles({ lng: 139.885, lat: 35.63, zoom: 13 });
    expect(maihama).toMatchObject({ file: "maihama", zoomed: true });
    expect(maihama.zoom).toBeGreaterThan(15);
  });
});

describe("detailPlaces", () => {
  it("見本で街路まで出る場所を、大阪中心部と都市の名前で並べる", () => {
    expect(detailPlaces()).toEqual(["大阪中心部", ...PUBLISHED_REGIONS.map((region) => region.label)]);
  });
});

describe("constants", () => {
  /** **公開先に無いスタイルを指さない。**見本が真っ白になる */
  it("選べる配色は、どれもリポのスタイルにある", () => {
    for (const { id } of MAP_STYLES) {
      expect(() => readFileSync(new URL(`../../../styles/${id}.json`, import.meta.url))).not.toThrow();
    }
  });

  const root = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8"));

  /** **版は 1 か所で決める。**ずれると、見本で動いたものが貼った先で動かない */
  it("MapLibre と pmtiles の版は、リポが使っているものと同じ", () => {
    expect(MAPLIBRE_VERSION).toBe(root.devDependencies["maplibre-gl"]);
    expect(PMTILES_VERSION).toBe(root.devDependencies.pmtiles);
  });

  const manifest = JSON.parse(readFileSync(new URL("../../../tools/tiles/manifest.json", import.meta.url), "utf8"));
  const deploy = readFileSync(new URL("../../../.github/workflows/deploy.yml", import.meta.url), "utf8");

  it("デモが街路まで持つ範囲は、切り出しに使う大阪の範囲を囲む", () => {
    const osakaRegion = JSON.parse(
      readFileSync(new URL("../../../tools/tiles/regions/demo-osaka.geojson", import.meta.url), "utf8"),
    );
    const points = JSON.stringify(osakaRegion.coordinates ?? osakaRegion)
      .match(/-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?/g)
      ?.map((pair) => pair.split(",").map(Number));
    expect(points?.length).toBeGreaterThan(0);
    const [west, south, east, north] = DEMO_DETAIL_BBOX;
    expect(Math.min(...(points ?? []).map(([x]) => x ?? 0))).toBe(west);
    expect(Math.min(...(points ?? []).map(([, y]) => y ?? 0))).toBe(south);
    expect(Math.max(...(points ?? []).map(([x]) => x ?? 0))).toBe(east);
    expect(Math.max(...(points ?? []).map(([, y]) => y ?? 0))).toBe(north);
  });

  it("見本に使う都市の範囲は、切り出しの正本と同じ", () => {
    for (const region of PUBLISHED_REGIONS) {
      expect(manifest.regions[region.file]?.bbox, region.file).toEqual(region.bbox);
    }
  });

  /** **公開先に無いタイルを指さない。**指すと見本が 404 で真っ白になる */
  it("見本に使う都市は、どれも公開先へ出している", () => {
    const loop = deploy.match(/for region in ([a-z ]+); do/);
    expect(loop).not.toBeNull();
    const published = new Set(["demo", ...(loop?.[1] ?? "").trim().split(/\s+/)]);
    for (const region of PUBLISHED_REGIONS) expect(published.has(region.file), region.file).toBe(true);
  });
});
