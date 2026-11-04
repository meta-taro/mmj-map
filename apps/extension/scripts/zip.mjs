/**
 * ストアへ出す zip を組む。**ここは純粋関数**（読み書きは `pack.mjs`）。
 *
 * 依存を足さずに node の zlib だけで書く。**道具が無い機体で止まらないように**
 * （Windows の PowerShell の Compress-Archive は区切りを `\` で書く版があり、ストアで名前が崩れる）。
 */
import { crc32, deflateRawSync } from "node:zlib";

/** 1980-01-01 00:00。**時刻を入れない**ので、同じ中身から同じ zip ができる */
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
const DOS_TIME = 0;
/** 名前を UTF-8 で書いた印（汎用フラグの bit 11） */
const UTF8_FLAG = 0x0800;
const DEFLATE = 8;
const STORE = 0;

/**
 * @param {Array<{ name: string, data: Buffer }>} entries 並びのまま入れる
 * @returns {Buffer}
 */
export function buildZip(entries) {
  /** @type {Buffer[]} */
  const locals = [];
  /** @type {Buffer[]} */
  const centrals = [];
  let offset = 0;

  for (const { name, data } of entries) {
    if (name.includes("\\")) throw new Error(`zip の名前に \\ は使えません: ${name}`);
    const nameBytes = Buffer.from(name, "utf8");
    const deflated = deflateRawSync(data);
    // 縮まないものはそのまま入れる（空のファイルや PNG）
    const [method, body] = deflated.length < data.length ? [DEFLATE, deflated] : [STORE, data];
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8_FLAG, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(UTF8_FLAG, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);

    offset += local.length + nameBytes.length + body.length;
  }

  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
