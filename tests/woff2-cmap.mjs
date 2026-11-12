// Reads the character map (cmap) straight out of a WOFF2 file, with no dependencies:
// WOFF2 is a table directory plus one Brotli stream, and Node's zlib has Brotli built in.
// cmap is never transformed in WOFF2, so it can be parsed as plain OpenType data.
import { readFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';

const KNOWN = ('cmap head hhea hmtx maxp name OS/2 post cvt  fpgm glyf loca prep CFF  VORG EBDT EBLC gasp hdmx kern LTSH PCLT VDMX vhea vmtx ' +
  'BASE GDEF GPOS GSUB EBSC JSTF MATH CBDT CBLC COLR CPAL SVG  sbix acnt avar bdat bloc bsln cvar fdsc feat fmtx fvar gvar hsty just ' +
  'lcar mort morx opbd prop trak Zapf Silf Glat Gloc Feat Sill').match(/.{4}\s?/g).map((t) => t.slice(0, 4));

export function woff2Tables(buf) {
  if (buf.toString('latin1', 0, 4) !== 'wOF2') throw new Error('not a WOFF2 file');
  const numTables = buf.readUInt16BE(12);
  const compressed = buf.readUInt32BE(20);
  let p = 48;
  const base128 = () => {
    let v = 0;
    for (let i = 0; i < 5; i++) { const b = buf[p++]; v = v * 128 + (b & 0x7f); if (!(b & 0x80)) return v; }
    throw new Error('bad UIntBase128');
  };
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buf[p++];
    let tag = KNOWN[flags & 0x3f];
    if ((flags & 0x3f) === 63) { tag = buf.toString('latin1', p, p + 4); p += 4; }
    const version = flags >> 6;
    const origLength = base128();
    const transformed = (tag === 'glyf' || tag === 'loca') ? version === 0 : version !== 0;
    const length = transformed ? base128() : origLength;
    tables.push({ tag, length, transformed });
  }
  const data = brotliDecompressSync(buf.subarray(p, p + compressed));
  let off = 0;
  const out = {};
  for (const t of tables) { out[t.tag] = { ...t, data: data.subarray(off, off + t.length) }; off += t.length; }
  if (off !== data.length) throw new Error(`table lengths ${off} != stream ${data.length}`);
  return out;
}

export function cmapCodepoints(file) {
  const c = woff2Tables(readFileSync(file)).cmap.data;
  const n = c.readUInt16BE(2);
  const subs = [];
  for (let i = 0; i < n; i++) subs.push({ pid: c.readUInt16BE(4 + i * 8), eid: c.readUInt16BE(6 + i * 8), off: c.readUInt32BE(8 + i * 8) });
  const pick = subs.find((s) => c.readUInt16BE(s.off) === 12) || subs.find((s) => c.readUInt16BE(s.off) === 4);
  if (!pick) throw new Error('no format 4 or 12 cmap subtable');
  const cps = new Set();
  const o = pick.off;
  if (c.readUInt16BE(o) === 12) {
    const groups = c.readUInt32BE(o + 12);
    for (let g = 0; g < groups; g++) {
      const s = c.readUInt32BE(o + 16 + g * 12), e = c.readUInt32BE(o + 20 + g * 12), gid = c.readUInt32BE(o + 24 + g * 12);
      for (let cp = s; cp <= e; cp++) if (gid + cp - s) cps.add(cp);
    }
  } else {
    const segX2 = c.readUInt16BE(o + 6);
    const ends = o + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
    for (let i = 0; i < segX2 / 2; i++) {
      const end = c.readUInt16BE(ends + i * 2), start = c.readUInt16BE(starts + i * 2);
      const delta = c.readInt16BE(deltas + i * 2), ro = c.readUInt16BE(ranges + i * 2);
      for (let cp = start; cp <= end && cp !== 0xffff; cp++) {
        let gid;
        if (!ro) gid = (cp + delta) & 0xffff;
        else { const gi = c.readUInt16BE(ranges + i * 2 + ro + (cp - start) * 2); gid = gi ? (gi + delta) & 0xffff : 0; }
        if (gid) cps.add(cp);
      }
    }
  }
  return cps;
}
