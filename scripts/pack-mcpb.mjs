#!/usr/bin/env node
/**
 * Zero-dependency cross-platform `.mcpb` (ZIP archive) builder using Node built-in `node:zlib`.
 * Produces `dist/claude-multi-provider.mcpb` ready for 1-click installation in Official Claude Desktop.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIST_DIR = path.join(ROOT, "dist");
const OUT_FILE = path.join(DIST_DIR, "claude-multi-provider.mcpb");

const INCLUDE_PATHS = [
  "manifest.json",
  ".claude-plugin/icon.png",
  "assets/icon.svg",
  "package.json",
  "README.md",
  "LICENSE",
  "CHANGELOG.md",
  "hooks",
  "bin",
  "src"
];

// Precompute standard CRC-32 lookup table
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function collectFiles(targetRel, acc = []) {
  const full = path.join(ROOT, targetRel);
  if (!fs.existsSync(full)) return acc;
  const st = fs.statSync(full);
  if (st.isDirectory()) {
    for (const entry of fs.readdirSync(full)) {
      collectFiles(path.join(targetRel, entry), acc);
    }
  } else if (st.isFile()) {
    acc.push({
      zipName: targetRel.split(path.sep).join("/"),
      fullPath: full
    });
  }
  return acc;
}

function buildZipBuffer(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const item of entries) {
    const rawData = fs.readFileSync(item.fullPath);
    const compressed = zlib.deflateRawSync(rawData, { level: 9 });
    const nameBuf = Buffer.from(item.zipName, "utf8");
    const crc = crc32(rawData);

    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
    localHeader.writeUInt16LE(20, 4);         // Version needed (2.0)
    localHeader.writeUInt16LE(0x0800, 6);     // UTF-8 filename flag
    localHeader.writeUInt16LE(8, 8);          // Method: Deflate (8)
    localHeader.writeUInt16LE(0, 10);         // Mod time
    localHeader.writeUInt16LE(0x5421, 12);    // Mod date
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(rawData.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);
    nameBuf.copy(localHeader, 30);

    localParts.push(localHeader, compressed);

    const centralHeader = Buffer.alloc(46 + nameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Central directory signature
    centralHeader.writeUInt16LE(20, 4);         // Version made by
    centralHeader.writeUInt16LE(20, 6);         // Version needed
    centralHeader.writeUInt16LE(0x0800, 8);     // UTF-8 flag
    centralHeader.writeUInt16LE(8, 10);         // Deflate
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0x5421, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(rawData.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    nameBuf.copy(centralHeader, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + compressed.length;
  }

  const centralSize = centralParts.reduce((s, b) => s + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

const files = [];
for (const p of INCLUDE_PATHS) {
  collectFiles(p, files);
}

fs.mkdirSync(DIST_DIR, { recursive: true });
const zipBuf = buildZipBuffer(files);
fs.writeFileSync(OUT_FILE, zipBuf);
console.log(`Built ${path.relative(ROOT, OUT_FILE)} (${files.length} files, ${(zipBuf.length / 1024).toFixed(1)} KB)`);
