import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildZip } from "../scripts/zip.mjs";

const manifest = JSON.parse(readFileSync(new URL("../src/manifest.json", import.meta.url), "utf8"));
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

/** PNG の IHDR から幅と高さを読む */
function pngSize(/** @type {Buffer} */ bytes) {
  expect(bytes.subarray(1, 4).toString("latin1")).toBe("PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/**
 * zip を中央ディレクトリから読み戻す。**作った側の関数を使わずに読む**（作りの誤りを写さない）。
 * @param {Buffer} zip
 */
function readZip(zip) {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  /** @type {Map<string, Buffer>} */
  const files = new Map();
  for (let i = 0; i < count; i += 1) {
    expect(zip.readUInt32LE(at)).toBe(0x02014b50);
    const method = zip.readUInt16LE(at + 10);
    const compressed = zip.readUInt32LE(at + 20);
    const size = zip.readUInt32LE(at + 24);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    expect(zip.readUInt32LE(local), name).toBe(0x04034b50);
    const dataAt = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(dataAt, dataAt + compressed);
    const body = method === 8 ? inflateRawSync(raw) : raw;
    expect(body.length, name).toBe(size);
    files.set(name, body);
    at += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

describe("ストアへ出す形", () => {
  /** **版は 1 か所。**ストアは manifest の版を見るので、package.json とずれると何を出したか追えない */
  it("manifest の版は package.json の版と同じ", () => {
    expect(manifest.version).toBe(pkg.version);
  });

  /** ストアは 128px のアイコンを必須にしている。**書いた大きさと絵の大きさを揃える** */
  it("manifest に書いたアイコンは、どれも書いた大きさの PNG としてある", () => {
    expect(Object.keys(manifest.icons ?? {})).toContain("128");
    // **2 つを混ぜて 1 つにしない。**同じ大きさの鍵が上書きし合い、片方の誤りが見えなくなった
    const icons = [...Object.entries(manifest.icons ?? {}), ...Object.entries(manifest.action?.default_icon ?? {})];
    for (const [size, path] of icons) {
      const bytes = readFileSync(new URL(`../src/${path}`, import.meta.url));
      expect(pngSize(bytes), path).toEqual({ width: Number(size), height: Number(size) });
    }
  });
});

describe("buildZip", () => {
  const entries = [
    { name: "manifest.json", data: Buffer.from('{"name":"x"}') },
    { name: "vendor/a.js", data: Buffer.from("const 地図 = 1;\n".repeat(50)) },
    { name: "icons/empty.txt", data: Buffer.alloc(0) },
  ];

  it("入れたものを、同じ名前と同じ中身で読み戻せる", () => {
    const files = readZip(buildZip(entries));
    expect([...files.keys()]).toEqual(entries.map((entry) => entry.name));
    for (const entry of entries) expect(files.get(entry.name)?.equals(entry.data), entry.name).toBe(true);
  });

  /** Windows の区切りが混ざると、ストアでは別の名前のファイルになる */
  it("名前の区切りに \\ を通さない", () => {
    expect(() => buildZip([{ name: "vendor\\a.js", data: Buffer.alloc(1) }])).toThrow();
  });

  /** 同じ中身から同じ zip ができる（出したものを後で作り直して突き合わせられる） */
  it("同じ入力から同じバイト列を作る", () => {
    expect(buildZip(entries).equals(buildZip(entries))).toBe(true);
  });
});
