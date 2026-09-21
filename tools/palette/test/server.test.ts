/**
 * MCP の口。**エージェントから配色を作れるようにする。**
 *
 * プロトコルは JSON-RPC 2.0 を改行区切りで流すだけなので、**SDK を入れていない**。
 * 公式 SDK は express / hono / cors / jose / rate-limit まで引いてきて 99 パッケージ増え、
 * **stdio 1 本のために公開リポへ載せる量として釣り合わない**（baseline §1 / §12）。
 *
 * その代わり、**実際に喋れることをテストで縛る**（`mcp.test.ts` がプロセスを起動する）。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { PROTOCOL_VERSION, TOOLS, handle } from "../src/server.js";

const deps = {
  listBases: () => ["modern-dark", "modern-light"],
  loadBase: (name: string) =>
    JSON.parse(readFileSync(new URL(`../../../styles/${name}.json`, import.meta.url), "utf8")),
};

function call(name: string, args: unknown) {
  return handle(
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
    deps,
  );
}

/** 道具の返り値は文字列で来る。中身が JSON のものはここで開く */
function payload(response: any) {
  return JSON.parse(response.result.content[0].text);
}

describe("initialize", () => {
  it("道具を持っていることを伝える", () => {
    const res: any = handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, deps);
    expect(res.result.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(res.result.capabilities.tools).toBeDefined();
    expect(res.result.serverInfo.name).toContain("mmj");
  });
});

describe("notifications", () => {
  it("**通知には応えない。**id の無い要求に応答を返すと、相手側が壊れる", () => {
    expect(handle({ jsonrpc: "2.0", method: "notifications/initialized" }, deps)).toBeNull();
  });
});

describe("tools/list", () => {
  it("4 つの道具を返す", () => {
    const res: any = handle({ jsonrpc: "2.0", id: 1, method: "tools/list" }, deps);
    expect(res.result.tools.map((t: any) => t.name)).toEqual([
      "mmj_list_roles",
      "mmj_list_bases",
      "mmj_derive_palette",
      "mmj_build_style",
    ]);
  });

  it("どの道具にも説明と入力の形がある（**無いと相手が使えない**）", () => {
    for (const tool of TOOLS) {
      expect(tool.description.length, tool.name).toBeGreaterThan(20);
      expect(tool.inputSchema.type, tool.name).toBe("object");
    }
  });
});

describe("mmj_list_roles", () => {
  it("24 の役割と、それが何を変えるかを返す", () => {
    const roles = payload(call("mmj_list_roles", {}));
    expect(Object.keys(roles)).toHaveLength(24);
    expect(roles["water"]).toContain("水");
  });
});

describe("mmj_list_bases", () => {
  it("土台にできるスタイルを返す", () => {
    expect(payload(call("mmj_list_bases", {}))).toEqual(["modern-dark", "modern-light"]);
  });
});

describe("mmj_derive_palette", () => {
  const anchors = { land: "#f7f9fb", water: "#bfd7e8", ink: "#16202b", accent: "#0a5fff" };

  it("指し値から 24 色を返す", () => {
    const palette = payload(call("mmj_derive_palette", anchors));
    expect(Object.keys(palette)).toHaveLength(24);
    expect(palette["background"]).toBe(anchors.land);
  });

  it("手で決めた色が勝つ", () => {
    const palette = payload(
      call("mmj_derive_palette", { ...anchors, overrides: { water: "#001122" } }),
    );
    expect(palette["water"]).toBe("#001122");
  });

  it("**指し値が足りなければエラーを返す。**黙って既定を作らない", () => {
    const res: any = call("mmj_derive_palette", { land: "#fff" });
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toContain("water");
  });

  it("**読めない色はエラーを返す**（例外で落とさず、相手に伝える）", () => {
    const res: any = call("mmj_derive_palette", { ...anchors, land: "みずいろ" });
    expect(res.result.isError).toBe(true);
  });
});

describe("mmj_build_style", () => {
  const args = {
    base: "modern-light",
    name: "Acme Maps",
    land: "#f7f9fb",
    water: "#bfd7e8",
    ink: "#16202b",
    accent: "#0a5fff",
  };

  it("そのまま配れるスタイルを返す", () => {
    const style = payload(call("mmj_build_style", args));
    expect(style.name).toBe("Acme Maps");
    expect(style.metadata["mmj:generated"]).toBe(true);
    expect(JSON.stringify(style)).toContain("__TILES_URL__");
    expect(style.sources.basemap.attribution).toBe("© OpenStreetMap contributors");
  });

  it("**知らない土台はエラー**（配っていない名前を黙って受けない）", () => {
    const res: any = call("mmj_build_style", { ...args, base: "no-such-base" });
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toContain("modern-light");
  });
});

describe("知らない要求", () => {
  it("道具の名前が違えばエラーを返す", () => {
    const res: any = call("mmj_nope", {});
    expect(res.result.isError).toBe(true);
  });

  it("メソッドが違えば JSON-RPC のエラーを返す", () => {
    const res: any = handle({ jsonrpc: "2.0", id: 9, method: "nope/nope" }, deps);
    expect(res.error.code).toBe(-32601);
    expect(res.id).toBe(9);
  });
});
