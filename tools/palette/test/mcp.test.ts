/**
 * **本物のプロセスを起動して、本物の JSON-RPC を流す。**
 *
 * SDK を入れていない以上（`server.ts` の頭に理由）、
 * 「MCP として喋れている」ことを**単体テストでは保証できない**。
 * ここが落ちたら、クライアントから繋がらなくなっているということ。
 */
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * MCP サーバーを起動し、要求を順に流して応答を集める。
 * @param requests 送る JSON-RPC
 */
async function talk(requests: object[]): Promise<any[]> {
  const child = spawn("node", ["--import", "tsx", "src/mcp.ts"], {
    cwd: packageRoot,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const responses: any[] = [];
  let buffer = "";
  let stderr = "";

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buffer += chunk;
    let index = buffer.indexOf("\n");
    while (index >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line !== "") responses.push(JSON.parse(line));
      index = buffer.indexOf("\n");
    }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => (stderr += chunk));

  for (const request of requests) child.stdin.write(`${JSON.stringify(request)}\n`);
  child.stdin.end();

  await new Promise<void>((done, fail) => {
    child.on("close", () => done());
    child.on("error", fail);
  });

  if (responses.length === 0) throw new Error(`応答がありません。stderr:\n${stderr}`);
  return responses;
}

describe("stdio で喋る", () => {
  it("initialize → tools/list → tools/call が通る", async () => {
    const [init, list, called] = await talk([
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "mmj_build_style",
          arguments: {
            base: "modern-light",
            name: "Acme Maps",
            land: "#f7f9fb",
            water: "#bfd7e8",
            ink: "#16202b",
            accent: "#0a5fff",
          },
        },
      },
    ]);

    expect(init.result.serverInfo.name).toBe("mmj-palette");
    expect(list.result.tools).toHaveLength(4);

    const style = JSON.parse(called.result.content[0].text);
    expect(style.name).toBe("Acme Maps");
    expect(style.metadata["mmj:generated"]).toBe(true);
    expect(style.layers.find((l: any) => l.id === "water").paint["fill-color"]).toBe("#bfd7e8");
  }, 60_000);

  it("**通知には応えない**（3 つ送って応答は 2 つ）", async () => {
    const responses = await talk([
      { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
    ]);
    expect(responses).toHaveLength(2);
  }, 60_000);

  it("**壊れた行が来ても落ちない**（後続の要求に応え続ける）", async () => {
    const child = spawn("node", ["--import", "tsx", "src/mcp.ts"], {
      cwd: packageRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const lines: string[] = [];
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => lines.push(chunk));

    child.stdin.write("これは JSON ではありません\n");
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/list" })}\n`);
    child.stdin.end();

    await new Promise<void>((done) => child.on("close", () => done()));
    const parsed = JSON.parse(lines.join("").trim());
    expect(parsed.id).toBe(7);
  }, 60_000);
});
