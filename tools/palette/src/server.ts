/**
 * MCP の道具立てと、要求の割り振り。**ここは入出力を持たない**（stdio は `mcp.ts`）。
 *
 * **SDK を入れていない。**MCP の stdio は JSON-RPC 2.0 を改行区切りで流すだけで、
 * ここで必要なのは `initialize` / `tools/list` / `tools/call` の 3 つ。
 * 公式 SDK（`@modelcontextprotocol/sdk` 1.30.0・MIT）は express / hono / cors / jose /
 * express-rate-limit まで引いてきて **99 パッケージ増える**（実測・2026-09-21）。
 * HTTP と SSE の輸送のためのもので、**stdio 1 本には釣り合わない**（baseline §1 / §12）。
 *
 * 代わりに、**実際に喋れることをテストで縛る**（`test/mcp.test.ts` がプロセスを起動して
 * 本物の JSON-RPC を流す）。仕様が動いたらそこが落ちる。
 */
import { ROLE_ORDER, deriveRoles, type Anchors } from "./derive.js";
import { buildStyle } from "./style.js";

/** 応えるプロトコル版。**相手の言い値をそのまま返さない**（対応していない版を認めない） */
export const PROTOCOL_VERSION = "2025-06-18";

/** 役割が何を変えるか。**名前だけ返しても、相手はどれを指定すべきか分からない** */
const ROLE_MEANING: Readonly<Record<string, string>> = {
  background: "地図の下地",
  earth: "陸の面",
  landcover: "広域の土地被覆（低倍率のみ）",
  green: "公園・森・緑地",
  built: "学校・病院などの敷地",
  paved: "歩行者空間・駅のホーム・桟橋",
  water: "水域の面（海・川・湖）",
  waterway: "水路の線（川・小川）",
  buildings: "建物の面",
  path: "歩道・小道",
  "road-minor": "細街路",
  "road-medium": "中位の道路",
  "road-major": "幹線道路",
  "highway-casing": "高速道路の縁取り",
  highway: "高速道路の本体（テーマカラーが乗る場所）",
  rail: "鉄道",
  boundary: "行政境界",
  station: "駅の丸の縁（テーマカラーが乗る場所）",
  "station-fill": "駅の丸の中",
  "label-city": "市区町村名",
  "label-station": "駅名",
  "label-neighbourhood": "町丁名",
  "label-water": "水域の名前",
  halo: "ラベルの縁取り（地色にすること）",
};

const ANCHOR_SCHEMA = {
  land: { type: "string", description: "陸・背景の色（#rrggbb）" },
  water: { type: "string", description: "水域の色（#rrggbb）。陸の系列から独立させる" },
  ink: { type: "string", description: "文字の色（#rrggbb）。ラベルの一番濃い側" },
  accent: { type: "string", description: "テーマカラー（#rrggbb）。高速道路と駅の縁に乗る" },
  green: { type: "string", description: "公園・森の色（#rrggbb）。省くと陸から導く" },
  overrides: {
    type: "object",
    description: "役割ごとに手で決めた色。ここが最後に勝つ",
    additionalProperties: { type: "string" },
  },
};

const ANCHOR_REQUIRED = ["land", "water", "ink", "accent"];

export interface Tool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: { readonly type: "object"; readonly [key: string]: unknown };
}

export const TOOLS: readonly Tool[] = [
  {
    name: "mmj_list_roles",
    description:
      "配色の役割を 24 個すべて返す。それぞれが地図の何を変えるかの説明つき。" +
      "色を決める前にこれを読むと、どの役割を指定すべきか分かる。",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "mmj_list_bases",
    description:
      "土台にできるスタイルの名前を返す。土台はレイヤ構成（何をどの倍率で描くか）を決め、" +
      "色は指し値が決める。",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "mmj_derive_palette",
    description:
      "4〜5 色の指し値から、24 役割の配色を作る。返るのは役割 → 色の JSON で、" +
      "<mmj-map palette-url> にそのまま渡せる。手で直す前提の形。",
    inputSchema: { type: "object", properties: ANCHOR_SCHEMA, required: ANCHOR_REQUIRED },
  },
  {
    name: "mmj_build_style",
    description:
      "指し値から、そのまま配れるスタイル JSON を作る。<mmj-map style-url> に渡すか、" +
      "自分の配布物へ同梱する。生成物の印（mmj:generated）と帰属表示が入る。",
    inputSchema: {
      type: "object",
      properties: {
        ...ANCHOR_SCHEMA,
        base: { type: "string", description: "土台のスタイル名（mmj_list_bases で取れる）" },
        name: { type: "string", description: "作るスタイルの名前" },
      },
      required: [...ANCHOR_REQUIRED, "base", "name"],
    },
  },
];

/** 外の世界。**ここを差し替えればテストがファイルを読まずに済む**（baseline §9） */
export interface Deps {
  readonly listBases: () => string[];
  readonly loadBase: (name: string) => unknown;
}

interface Request {
  readonly jsonrpc?: string;
  readonly id?: number | string;
  readonly method?: string;
  readonly params?: any;
}

/** 道具の返り値。文字を 1 つ返すだけ */
function text(value: unknown): { content: { type: "text"; text: string }[] } {
  return {
    content: [
      { type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) },
    ],
  };
}

/** **失敗は例外で落とさず、相手へ返す。**落とすと接続ごと切れて理由が残らない */
function failure(message: string) {
  return { ...text(message), isError: true };
}

function readAnchors(args: any): Anchors {
  const missing = ANCHOR_REQUIRED.filter((key) => typeof args?.[key] !== "string");
  if (missing.length > 0) {
    // 足りない指し値を勝手に作らない（baseline §11）。何が足りないかを名指しで返す
    throw new Error(`指し値が足りません: ${missing.join(", ")}`);
  }
  return {
    land: args.land,
    water: args.water,
    ink: args.ink,
    accent: args.accent,
    ...(typeof args.green === "string" ? { green: args.green } : {}),
  };
}

function callTool(name: string, args: any, deps: Deps) {
  try {
    if (name === "mmj_list_roles") {
      return text(Object.fromEntries(ROLE_ORDER.map((role) => [role, ROLE_MEANING[role] ?? ""])));
    }
    if (name === "mmj_list_bases") return text(deps.listBases());

    if (name === "mmj_derive_palette") {
      return text(deriveRoles(readAnchors(args), args?.overrides ?? {}));
    }

    if (name === "mmj_build_style") {
      const bases = deps.listBases();
      if (!bases.includes(args?.base)) {
        return failure(`知らない土台です: ${args?.base}（使えるのは ${bases.join(" ")}）`);
      }
      if (typeof args?.name !== "string" || args.name === "") {
        return failure("name が要ります（どのスタイルを見ているのか分からなくなるため）");
      }
      const anchors = readAnchors(args);
      const roles = deriveRoles(anchors, args?.overrides ?? {});
      return text(buildStyle(deps.loadBase(args.base), roles, { name: args.name, anchors }));
    }

    return failure(`知らない道具です: ${name}（使えるのは ${TOOLS.map((t) => t.name).join(" ")}）`);
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  }
}

/**
 * JSON-RPC の要求を 1 つ処理する。
 * @returns 応答。**通知（id の無い要求）には `null`**（応答を返すと相手が壊れる）
 */
export function handle(request: Request, deps: Deps): object | null {
  const { id, method } = request;
  if (id === undefined || id === null) return null;

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "mmj-palette", version: "0.0.0" },
      },
    };
  }

  if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: TOOLS } };

  if (method === "tools/call") {
    return {
      jsonrpc: "2.0",
      id,
      result: callTool(request.params?.name, request.params?.arguments ?? {}, deps),
    };
  }

  // 知らないメソッドは JSON-RPC の作法どおりに返す。**黙って無視しない**
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
}
