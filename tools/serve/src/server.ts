/**
 * 手元用の静的配信。**本番の配信ではない。**
 *
 * 目的は 2 つだけ。
 *  1. デモが、手元で切り出した PMTiles を読んで地図を 1 枚描けるようにする
 *  2. `pnpm tiles:check-range` に、応答を確かめる相手を用意する
 *
 * 本番は静的配信（D-003・サーバーを立てない）。ここで動くからといって、
 * 配信先が Range に応えるとは限らない。**配信先は配信先で check-range を通すこと。**
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { parseRangeHeader } from "@modern-map-japan/http-range";

export interface Mount {
  /** URL の先頭（"/" で始まる）。長いものから順に照合する */
  readonly prefix: string;
  readonly dir: string;
}

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".pmtiles": "application/octet-stream",
  ".pbf": "application/x-protobuf",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

/** URL を、mount の外へ出られない実ファイルパスへ解く。解けなければ null */
export function resolveUnderMount(urlPath: string, mounts: readonly Mount[]): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null; // 壊れたパーセント符号化
  }
  if (decoded.includes("\0")) return null;

  // **正規化は mount を決めたあと**に行う。先に normalize すると
  // `/tiles/../../x` が `/x` へ潰れ、別の mount へ吸われる（mount 跨ぎ）。
  const path = decoded.replaceAll("\\", "/");
  const candidates = [...mounts].sort((a, b) => b.prefix.length - a.prefix.length);

  for (const mount of candidates) {
    const prefix = mount.prefix.replace(/\/$/, "");
    if (path !== mount.prefix && path !== prefix && !path.startsWith(prefix + "/")) continue;

    const rest = path.slice(prefix.length).replace(/^\//, "");
    const root = resolve(mount.dir);
    const target = resolve(join(root, rest === "" ? "index.html" : rest));
    // `..` で mount の外へ出る要求を弾く（§21: ユーザー入力を信用しない）
    if (target !== root && !target.startsWith(root + sep)) return null;
    return target;
  }
  return null;
}

/** 実ファイルより優先して返す内容。開発用の config.js を差し込むために使う */
export type Overrides = Readonly<Record<string, { readonly type: string; readonly body: string }>>;

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  mounts: readonly Mount[],
  overrides: Overrides,
): Promise<void> {
  const urlPath = (req.url ?? "/").split("?")[0] ?? "/";

  const override = overrides[urlPath];
  if (override !== undefined) {
    const body = Buffer.from(override.body, "utf8");
    res.writeHead(200, {
      "content-type": override.type,
      "content-length": String(body.byteLength),
      "accept-ranges": "bytes",
      "cache-control": "no-store",
    });
    return void res.end(req.method === "HEAD" ? undefined : body);
  }

  const file = resolveUnderMount(urlPath, mounts);
  if (file === null) return send(res, 404, "not found");

  let size: number;
  try {
    const info = await stat(file);
    if (!info.isFile()) return send(res, 404, "not found");
    size = info.size;
  } catch {
    return send(res, 404, "not found");
  }

  const type = TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
  const range = parseRangeHeader(req.headers.range, size);

  if (range.kind === "unsatisfiable") {
    res.writeHead(416, { "content-range": `bytes */${size}`, "accept-ranges": "bytes" });
    return void res.end();
  }

  // Accept-Ranges はどの応答にも付ける。クライアントはこれを見て部分取得を決める。
  // no-store は開発用だからこそ要る。**古い HTML を掴んだまま「直っていない」と誤診する**
  // のを防ぐ（実際にこれで 1 往復溶かした）。
  const headers: Record<string, string> = {
    "content-type": type,
    "accept-ranges": "bytes",
    "cache-control": "no-store",
  };

  if (range.kind === "full") {
    res.writeHead(200, { ...headers, "content-length": String(size) });
    if (req.method === "HEAD") return void res.end();
    createReadStream(file).pipe(res);
    return;
  }

  const length = range.end - range.start + 1;
  res.writeHead(206, {
    ...headers,
    "content-length": String(length),
    "content-range": `bytes ${range.start}-${range.end}/${size}`,
  });
  if (req.method === "HEAD") return void res.end();
  createReadStream(file, { start: range.start, end: range.end }).pipe(res);
}

function send(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(body);
}

export function createStaticServer(mounts: readonly Mount[], overrides: Overrides = {}) {
  return createServer((req, res) => {
    handle(req, res, mounts, overrides).catch((error: unknown) => {
      // 握り潰さない（§8）。手元用なので原因をそのまま出す
      console.error("[serve]", error);
      if (!res.headersSent) send(res, 500, "internal error");
      else res.end();
    });
  });
}
