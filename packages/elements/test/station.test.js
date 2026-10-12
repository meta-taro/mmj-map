import { describe, expect, it } from "vitest";

import { STATION_ICON_LAYER, withStationIcon } from "../src/station.js";

/**
 * **駅の印の差し替え。**
 *
 * 既定（円）は誰にでも効き、差し替えは書いた地図だけに効く。
 * **円の層を消さない**ことが肝で、消すと色の役割の宛先が無くなる。
 */

/** 円を 1 つ持つ、最小のスタイル */
const base = () => ({
  layers: [
    { id: "rail", type: "line" },
    {
      id: "station-dot",
      type: "circle",
      source: "basemap",
      "source-layer": "pois",
      minzoom: 11,
      filter: ["==", ["get", "kind"], "station"],
      paint: { "circle-radius": 5, "circle-color": "#111", "circle-stroke-color": "#eee" },
    },
    { id: "label-station", type: "symbol" },
  ],
});

describe("withStationIcon", () => {
  it("記号の層を、円のすぐ後ろへ足す", () => {
    const result = withStationIcon(base(), "mmj-station");
    expect(result.layers.map((/** @type {any} */ l) => l.id)).toEqual([
      "rail",
      "station-dot",
      STATION_ICON_LAYER,
      "label-station",
    ]);
  });

  /** **消さない。**消すと palette の station / station-fill が当たらなくなる */
  it("円の層は残り、描かれないだけ", () => {
    const result = withStationIcon(base(), "mmj-station");
    const dot = result.layers.find((/** @type {any} */ l) => l.id === "station-dot");
    expect(dot.paint["circle-opacity"]).toBe(0);
    expect(dot.paint["circle-stroke-opacity"]).toBe(0);
    // 色はそのまま（役割の宛先が生きている）
    expect(dot.paint["circle-stroke-color"]).toBe("#eee");
  });

  it("出す条件は円と同じ（駅以外に印が出ない）", () => {
    const result = withStationIcon(base(), "mmj-station");
    const icon = result.layers.find((/** @type {any} */ l) => l.id === STATION_ICON_LAYER);
    expect(icon.filter).toEqual(["==", ["get", "kind"], "station"]);
    expect(icon.minzoom).toBe(11);
    expect(icon["source-layer"]).toBe("pois");
    expect(icon.layout["icon-image"]).toBe("mmj-station");
  });

  it("大きさを渡せる", () => {
    const result = withStationIcon(base(), "mmj-station", 0.6);
    const icon = result.layers.find((/** @type {any} */ l) => l.id === STATION_ICON_LAYER);
    expect(icon.layout["icon-size"]).toBe(0.6);
  });

  /** **元を書き換えない**（ECC coding-style） */
  it("渡したスタイルは変わらない", () => {
    const style = base();
    const before = JSON.stringify(style);
    withStationIcon(style, "mmj-station");
    expect(JSON.stringify(style)).toBe(before);
  });

  /** **知らないスタイルを壊さない。**自前のスタイルに円が無いこともある */
  it("円の層が無ければ、何もしない", () => {
    const style = { layers: [{ id: "rail", type: "line" }] };
    expect(withStationIcon(style, "mmj-station")).toBe(style);
  });

  it("画像の名前が空なら、何もしない", () => {
    const style = base();
    expect(withStationIcon(style, "")).toBe(style);
  });
});
