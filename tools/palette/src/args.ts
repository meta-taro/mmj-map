/**
 * CLI の引数。**ここは純粋関数**（読み書きは `cli.ts`）。
 *
 * **知らない引数は投げる。**黙って無視すると「指定したのに効かない」になり、
 * 綴り間違いに気づけない。
 */
import type { Anchors, Role } from "./derive.js";
import { ROLE_ORDER } from "./derive.js";

const ANCHOR_KEYS = ["land", "water", "ink", "accent"] as const;
const KNOWN = new Set(["land", "water", "ink", "accent", "green", "base", "name", "out", "set"]);

/** `--base` を付けなかったときの土台 */
const DEFAULT_BASE = "modern-light";
/** `--name` を付けなかったときの名前 */
const DEFAULT_NAME = "Custom";

export interface ParsedArgs {
  readonly anchors: Anchors;
  readonly overrides: Record<string, string>;
  /** `palette` なら 24 役割の JSON、`style` ならスタイルごと */
  readonly mode: "palette" | "style";
  readonly base: string;
  readonly name: string;
  /** 書き出し先。`null` なら標準出力 */
  readonly out: string | null;
}

/**
 * @param argv `process.argv.slice(2)` 相当
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const values: Record<string, string> = {};
  const overrides: Record<string, string> = {};
  let mode: "palette" | "style" = "palette";

  for (const arg of argv) {
    // `pnpm palette -- --land=...` の `--` はそのまま渡ってくる。**読み飛ばす**
    if (arg === "--") continue;
    if (arg === "--style") {
      mode = "style";
      continue;
    }
    const match = /^--([A-Za-z-]+)=(.*)$/.exec(arg);
    if (!match) throw new Error(`読めない引数です: ${arg}`);

    const [, key = "", value = ""] = match;
    if (!KNOWN.has(key)) {
      throw new Error(
        `知らない引数です: --${key}（使えるのは ${[...KNOWN].map((k) => `--${k}`).join(" ")}）`,
      );
    }

    if (key === "set") {
      const at = value.indexOf("=");
      if (at <= 0) throw new Error(`--set は 役割=色 の形で書きます: --set=${value}`);
      const role = value.slice(0, at);
      if (!(ROLE_ORDER as readonly string[]).includes(role)) {
        throw new Error(`知らない役割です: ${role}（使えるのは ${ROLE_ORDER.join(" ")}）`);
      }
      overrides[role as Role] = value.slice(at + 1);
      continue;
    }
    values[key] = value;
  }

  const missing = ANCHOR_KEYS.filter((key) => values[key] === undefined || values[key] === "");
  if (missing.length > 0) {
    // 足りない色を勝手に作らない（baseline §11）
    throw new Error(`指し値が足りません: ${missing.map((k) => `--${k}`).join(" ")}`);
  }

  return {
    anchors: {
      land: values["land"]!,
      water: values["water"]!,
      ink: values["ink"]!,
      accent: values["accent"]!,
      ...(values["green"] === undefined ? {} : { green: values["green"] }),
    },
    overrides,
    mode,
    base: values["base"] ?? DEFAULT_BASE,
    name: values["name"] ?? DEFAULT_NAME,
    out: values["out"] ?? null,
  };
}
