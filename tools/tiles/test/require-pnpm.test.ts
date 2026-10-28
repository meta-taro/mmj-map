import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "require-pnpm.mjs");

function run(agent: string | undefined) {
  // Windows の環境変数は大文字小文字を区別しない。綴り違いの同名が残ると子がそちらを読む
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "npm_config_user_agent"),
  );
  if (agent !== undefined) env.npm_config_user_agent = agent;
  return spawnSync(process.execPath, [script], { env, encoding: "utf8" });
}

describe("require-pnpm（publish の経路）", () => {
  it("pnpm publish なら通す", () => {
    expect(run("pnpm/10.18.0 npm/? node/v24.0.0 win32 x64").status).toBe(0);
  });

  it("npm publish は止める（workspace:* がそのまま出るため）", () => {
    const result = run("npm/11.0.0 node/v24.0.0 win32 x64 workspaces/false");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("pnpm publish");
  });

  it("経路が分からないときも止める", () => {
    expect(run(undefined).status).toBe(1);
  });
});
