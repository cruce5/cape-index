// Zip reconcilers/ into dist/reconcilers.zip so the site can hand the team out. A minimal
// ZIP writer (deflate via zlib) rather than a dependency or a platform tar: the weekly
// rebuild runs on Windows, and GNU tar cannot write zip.
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { deflateRawSync } from "node:zlib";
import { ROOT } from "./lib-bom.mjs";

const SRC = join(ROOT, "reconcilers");
const OUT = join(ROOT, "dist/reconcilers.zip");

const CRC = new Int32Array(256);
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c; }
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

// a fixed timestamp keeps the zip byte-identical between builds with no content change
const dosTime = 0x0000, dosDate = ((2026 - 1980) << 9) | (9 << 5) | 8;
const files = walk(SRC);
const locals = [], centrals = [];
let offset = 0;
for (const p of files) {
  const name = Buffer.from("reconcilers/" + relative(SRC, p).split(sep).join("/"), "utf8");
  const data = readFileSync(p);
  const comp = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(8, 8);
  head.writeUInt16LE(dosTime, 10); head.writeUInt16LE(dosDate, 12); head.writeUInt32LE(crc, 14);
  head.writeUInt32LE(comp.length, 18); head.writeUInt32LE(data.length, 22); head.writeUInt16LE(name.length, 26); head.writeUInt16LE(0, 28);
  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(8, 10);
  cen.writeUInt16LE(dosTime, 12); cen.writeUInt16LE(dosDate, 14); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(data.length, 24);
  cen.writeUInt16LE(name.length, 28); cen.writeUInt16LE(0, 30); cen.writeUInt16LE(0, 32); cen.writeUInt16LE(0, 34); cen.writeUInt16LE(0, 36);
  cen.writeUInt32LE(0, 38); cen.writeUInt32LE(offset, 42);
  locals.push(head, name, comp);
  centrals.push(cen, name);
  offset += head.length + name.length + comp.length;
}
const cdir = Buffer.concat(centrals);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cdir.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
mkdirSync(join(ROOT, "dist"), { recursive: true });
const zip = Buffer.concat([...locals, cdir, end]);
writeFileSync(OUT, zip);
console.log(`dist/reconcilers.zip — ${files.length} files, ${(zip.length / 1024).toFixed(0)} KB`);
