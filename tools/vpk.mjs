// Minimal Valve VPK v1/v2 reader (directory + numbered archives). Read-only, local install.
//   import { openVpk, DOTA_DIR } from './vpk.mjs';
//   const v = openVpk(`${DOTA_DIR}/game/dota/pak01_dir.vpk`); v.list(/scripts\/npc\//); v.read('scripts/npc/items.txt')
import fs from 'node:fs';
import path from 'node:path';

export const DOTA_DIR = process.env.DOTA_DIR || 'C:/Program Files (x86)/Steam/steamapps/common/dota 2 beta';

export function openVpk(dirFile) {
  const b = fs.readFileSync(dirFile);
  let p = 0;
  const sig = b.readUInt32LE(0), ver = b.readUInt32LE(4), tree = b.readUInt32LE(8);
  if (sig !== 0x55aa1234) throw new Error('not a vpk: ' + dirFile);
  p = ver === 2 ? 28 : 12;
  const hdr = p, dataStart = hdr + tree;
  const s = () => { const e = b.indexOf(0, p); const r = b.toString('utf8', p, e); p = e + 1; return r; };
  const entries = new Map();
  for (;;) {
    const ext = s(); if (!ext) break;
    for (;;) {
      const dir = s(); if (!dir) break;
      for (;;) {
        const name = s(); if (!name) break;
        const pre = b.readUInt16LE(p + 4), arc = b.readUInt16LE(p + 6), off = b.readUInt32LE(p + 8), len = b.readUInt32LE(p + 12);
        const preload = b.subarray(p + 18, p + 18 + pre);
        p += 18 + pre;
        const full = (dir === ' ' ? '' : dir + '/') + name + '.' + ext;
        entries.set(full, { arc, off, len, preload });
      }
    }
  }
  const base = dirFile.replace(/_dir\.vpk$/, '');
  return {
    entries,
    list(re) { return [...entries.keys()].filter((k) => re.test(k)); },
    read(name) {
      const e = entries.get(name);
      if (!e) throw new Error('vpk: missing ' + name);
      let data;
      if (e.len === 0) data = Buffer.alloc(0);
      else if (e.arc === 0x7fff) data = b.subarray(dataStart + e.off, dataStart + e.off + e.len);
      else {
        const fn = `${base}_${String(e.arc).padStart(3, '0')}.vpk`;
        const fd = fs.openSync(fn, 'r'); data = Buffer.alloc(e.len);
        fs.readSync(fd, data, 0, e.len, e.off); fs.closeSync(fd);
      }
      return Buffer.concat([e.preload, data]);
    },
    readText(name) { return this.read(name).toString('utf8'); },
  };
}

export const dotaPak = () => openVpk(path.join(DOTA_DIR, 'game/dota/pak01_dir.vpk'));
