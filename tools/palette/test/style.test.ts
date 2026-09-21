/**
 * 完成したスタイルを組み立てる。
 *
 * **「独自で完全につくれる」ようにするための最後の 1 段。**
 * 24 の役割だけを渡す道（`palette-url`）と、スタイルごと持つ道（`style-url`）の両方が要る。
 * 配布物に自分のスタイルを同梱したい導入者は、後者しか選べない。
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildStyle } from "../src/style.js";
import { deriveRoles } from "../src/derive.js";

const ANCHORS = { land: "#f7f9fb", water: "#bfd7e8", ink: "#16202b", accent: "#0a5fff" };

function base(name = "modern-light") {
  return JSON.parse(readFileSync(new URL(`../../../styles/${name}.json`, import.meta.url), "utf8"));
}

describe("buildStyle", () => {
  it("色が当たっている", () => {
    const style = buildStyle(base(), deriveRoles(ANCHORS), { name: "Acme", anchors: ANCHORS });
    const layer = style.layers.find((l: any) => l.id === "background");
    expect(layer.paint["background-color"]).toBe(ANCHORS.land);
  });

  it("**生成物だと分かる印を残す。**手書きの 6 枚と見分けが付かなくなるのを防ぐ", () => {
    const style = buildStyle(base(), deriveRoles(ANCHORS), { name: "Acme", anchors: ANCHORS });
    expect(style.metadata["mmj:generated"]).toBe(true);
    expect(style.metadata["mmj:anchors"]).toEqual(ANCHORS);
    expect(style.metadata["mmj:base"]).toBe("Modern Light");
  });

  it("名前を付ける（**どのスタイルを見ているのか分からなくなるため**）", () => {
    expect(buildStyle(base(), deriveRoles(ANCHORS), { name: "Acme" }).name).toBe("Acme");
  });

  it("**`__TILES_URL__` を残す。**焼き込むと配信先を変えられなくなる", () => {
    const style = buildStyle(base(), deriveRoles(ANCHORS), { name: "Acme" });
    expect(JSON.stringify(style)).toContain("__TILES_URL__");
  });

  it("**帰属表示を残す**（ODbL・消した状態で配らない）", () => {
    const style = buildStyle(base(), deriveRoles(ANCHORS), { name: "Acme" });
    expect(style.sources.basemap.attribution).toBe("© OpenStreetMap contributors");
  });

  it("レイヤ構成は土台のまま（**色だけが違う**）", () => {
    const source = base();
    const style = buildStyle(source, deriveRoles(ANCHORS), { name: "Acme" });
    expect(style.layers.map((l: any) => l.id)).toEqual(source.layers.map((l: any) => l.id));
  });

  it("**元の土台を書き換えない**（不変・ECC coding-style）", () => {
    const source = base();
    const before = source.layers.find((l: any) => l.id === "background").paint["background-color"];
    buildStyle(source, deriveRoles(ANCHORS), { name: "Acme" });
    expect(source.layers.find((l: any) => l.id === "background").paint["background-color"]).toBe(
      before,
    );
  });

  it("**1 つも当たらなかったら投げる。**色を渡したのに変わらないスタイルを出さない", () => {
    expect(() => buildStyle({ layers: [] }, deriveRoles(ANCHORS), { name: "Acme" })).toThrow();
  });

  it("土台を変えても同じ色が当たる（土台は構成、色は指し値）", () => {
    const roles = deriveRoles(ANCHORS);
    for (const name of ["modern-dark", "modern-ink", "modern-neon"]) {
      const style = buildStyle(base(name), roles, { name: "Acme" });
      expect(style.layers.find((l: any) => l.id === "water").paint["fill-color"]).toBe(ANCHORS.water);
    }
  });
});
