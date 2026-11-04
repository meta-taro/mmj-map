import { describe, expect, it } from "vitest";

import { readGoogleView, readPreviewQuery, toMmjZoom, toPreviewQuery } from "../src/view.js";

describe("readGoogleView", () => {
  it("表示位置の URL から中心と縮尺を読む", () => {
    expect(readGoogleView("https://www.google.com/maps/@34.6937,135.5023,15z")).toEqual({
      ok: true,
      lng: 135.5023,
      lat: 34.6937,
      zoom: 14,
    });
  });

  /**
   * **店の頁でも、読むのは表示位置だけ。**`/place/<名前>/` と `!3d…!4d…`（ピン）は
   * Google が持つ地点のデータで、写すと規約 2.2（写さない）に触れる（D-034）。
   */
  it("店の頁でも、表示位置だけを読み、ピンは読まない", () => {
    const url =
      "https://www.google.co.jp/maps/place/%E5%A4%A7%E9%98%AA%E5%9F%8E/@34.6873153,135.5236908,16z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d34.6872571!4d135.5258546";
    const view = readGoogleView(url);
    expect(view).toEqual({ ok: true, lng: 135.52369, lat: 34.68732, zoom: 15 });
    expect(Object.keys(view)).not.toContain("name");
  });

  it("小数の縮尺も読む", () => {
    expect(readGoogleView("https://www.google.com/maps/@35.681236,139.767125,14.25z")).toMatchObject({
      zoom: 13.25,
    });
  });

  it("西経・南緯（負の値）も読む", () => {
    expect(readGoogleView("https://www.google.com/maps/@-33.8688,151.2093,12z")).toMatchObject({
      lat: -33.8688,
      lng: 151.2093,
    });
    expect(readGoogleView("https://www.google.com/maps/@40.7484,-73.9857,13z")).toMatchObject({
      lat: 40.7484,
      lng: -73.9857,
    });
  });

  /** 航空写真・3D・ストリートビューは、縮尺が `z` でなく高さで書かれている */
  it("地図表示でなければ、そう返す", () => {
    expect(readGoogleView("https://www.google.com/maps/@34.69,135.50,1234m/data=!3m1!1e3")).toEqual({
      ok: false,
      reason: "not-map-view",
    });
    expect(readGoogleView("https://www.google.com/maps/@34.69,135.50,3a,75y,90t/data=!3m6!1e1")).toEqual({
      ok: false,
      reason: "not-map-view",
    });
  });

  it("Google マップでなければ、そう返す", () => {
    expect(readGoogleView("https://example.com/maps/@34.69,135.50,15z")).toEqual({
      ok: false,
      reason: "not-google-maps",
    });
    // 名前に google を含むだけの別のサイト
    expect(readGoogleView("https://google.com.evil.example/maps/@34.69,135.50,15z")).toMatchObject({
      reason: "not-google-maps",
    });
    expect(readGoogleView("https://www.google.com/search?q=maps")).toMatchObject({ reason: "not-google-maps" });
    expect(readGoogleView("https://www.google.com/mapsfoo/@34.69,135.50,15z")).toMatchObject({
      reason: "not-google-maps",
    });
    expect(readGoogleView("https://notgoogle.com/maps/@34.69,135.50,15z")).toMatchObject({
      reason: "not-google-maps",
    });
    expect(readGoogleView("http://www.google.com/maps/@34.69,135.50,15z")).toMatchObject({
      reason: "not-google-maps",
    });
  });

  it("国ごとの Google と maps. の頁も読む", () => {
    expect(readGoogleView("https://www.google.com.au/maps/@-33.8688,151.2093,12z")).toMatchObject({ ok: true });
    expect(readGoogleView("https://maps.google.com/maps/@34.69,135.50,15z")).toMatchObject({ ok: true });
  });

  /** 短縮リンクは開くと本来の URL へ移る。**移る前に押された**ときだけ、ここへ来る */
  it("短縮リンクは、そう返す", () => {
    expect(readGoogleView("https://maps.app.goo.gl/abc123")).toEqual({ ok: false, reason: "short-link" });
    expect(readGoogleView("https://goo.gl/maps/abc123")).toEqual({ ok: false, reason: "short-link" });
  });

  it("Google マップでも、表示位置が URL に無ければ、そう返す", () => {
    expect(readGoogleView("https://www.google.com/maps")).toEqual({ ok: false, reason: "no-view" });
  });

  it("あり得ない座標は通さない", () => {
    expect(readGoogleView("https://www.google.com/maps/@91,135.50,15z")).toMatchObject({ reason: "no-view" });
    expect(readGoogleView("https://www.google.com/maps/@34.69,181,15z")).toMatchObject({ reason: "no-view" });
  });

  it("**壊れた値で落とさない**", () => {
    expect(readGoogleView("")).toMatchObject({ ok: false });
    expect(readGoogleView(/** @type {any} */ (undefined))).toMatchObject({ ok: false });
    expect(readGoogleView("chrome://newtab/")).toMatchObject({ ok: false });
  });
});

describe("toMmjZoom", () => {
  /**
   * Google は 256px の区画で縮尺を数え、MapLibre は 512px で数える。
   * **同じ範囲を出すには 1 引く。**引かないと、貼った地図が 2 倍に寄って見える。
   */
  it("Google の縮尺から 1 引く", () => {
    expect(toMmjZoom(15)).toBe(14);
    expect(toMmjZoom(14.25)).toBe(13.25);
  });

  it("0 より下にはしない", () => {
    expect(toMmjZoom(0.5)).toBe(0);
  });
});

describe("見本の頁へ渡す場所", () => {
  const place = { lng: 135.5023, lat: 34.6937, zoom: 14 };

  it("書いたものを、そのまま読み戻せる", () => {
    expect(readPreviewQuery(toPreviewQuery(place))).toEqual(place);
  });

  it("**手で書き換えられた URL でも落とさない**", () => {
    expect(readPreviewQuery("")).toBeNull();
    expect(readPreviewQuery("?c=135.5&z=14")).toBeNull();
    expect(readPreviewQuery("?c=,34.6&z=14")).toBeNull();
    expect(readPreviewQuery("?c=abc,34.6&z=14")).toBeNull();
    expect(readPreviewQuery("?c=135.5,34.6")).toBeNull();
    // `Number("")` は 0。空の縮尺を 0 として通さない
    expect(readPreviewQuery("?c=135.5,34.6&z=")).toBeNull();
    expect(readPreviewQuery("?c=135.5,34.6&z=%20")).toBeNull();
    expect(readPreviewQuery("?c=200,34.6&z=14")).toBeNull();
    expect(readPreviewQuery("?c=135.5,34.6&z=30")).toBeNull();
  });
});
