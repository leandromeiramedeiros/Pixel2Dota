// Contact sheet for world sheets (tiles/trees/buildings/creeps): one row per key group (key minus trailing _<n>), wraps wide groups.
//   node tools/art/world/view.mjs <sheet> [scale=4] [maxWidthPx=1500] [groupFilter]  -> tools/art/out/<sheet>_sheet.png
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { encodePng, loadSheet } from '../png.mjs';
import { ROOT } from './lib.mjs';

const hex = h => { h = h.replace('#', ''); if (h.length === 6) h += 'ff'; return [0, 2, 4, 6].map(i => parseInt(h.slice(i, i + 2), 16)); };

export function view(name, scale = 4, maxW = 1500, filter = null, bgHex = '#2a3324') {
  const S = loadSheet(name);
  const groups = new Map();
  for (const k of Object.keys(S.frames)) { const g = k.replace(/_\d+$/, '').replace(/(_e)\d+$/, '$1'); if (filter && !g.includes(filter)) continue; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(k); }
  const pad = 3, rowsL = [];
  for (const [, ks] of groups) {
    const cw = Math.max(...ks.map(k => S.frames[k][0].length)) + pad, ch = Math.max(...ks.map(k => S.frames[k].length)) + pad;
    const per = Math.max(1, Math.floor((maxW - 8) / (cw * scale)));
    for (let i = 0; i < ks.length; i += per) rowsL.push({ ks: ks.slice(i, i + per), cw, ch });
  }
  const W = Math.max(...rowsL.map(r => r.ks.length * r.cw * scale)) + 8, H = rowsL.reduce((a, r) => a + r.ch * scale, 8);
  const img = new Uint8Array(W * H * 4); const bg = hex(bgHex);
  for (let i = 0; i < W * H; i++) img.set(bg, i * 4);
  const put = (x, y, c) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; for (let k = 0; k < 3; k++) img[i + k] = c[k]; img[i + 3] = 255; };
  const add = (x, y, c, a) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; for (let k = 0; k < 3; k++) img[i + k] = Math.min(255, img[i + k] + c[k] * a); };
  const emit = S.emit || {}; let y0 = 4;
  for (const r of rowsL) {
    r.ks.forEach((k, ci) => {
      const rows = S.frames[k], x0 = 4 + ci * r.cw * scale, yy = y0 + (r.ch - 1 - rows.length) * scale;
      const em = [];
      rows.forEach((row, y) => [...row].forEach((c, x) => { if (c === '.') return; const col = hex(S.pal[c]); for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) put(x0 + x * scale + dx, yy + y * scale + dy, col); if (emit[c]) em.push([x, y, col, emit[c]]); }));
      for (const [x, y, c, st] of em) for (let dy = -2 * scale; dy < 3 * scale; dy++) for (let dx = -2 * scale; dx < 3 * scale; dx++) { const d = Math.hypot(dx, dy) / scale; if (d > 0.8 && d < 2.6) add(x0 + x * scale + (scale >> 1) + dx, yy + y * scale + (scale >> 1) + dy, c, 0.10 * st * (2.6 - d)); }
      const a = (S.anchors && S.anchors[k]) || S.anchor;
      if (a && scale >= 3) put(x0 + a[0] * scale + (scale >> 1), yy + a[1] * scale + (scale >> 1), [255, 0, 255, 255]);
    });
    y0 += r.ch * scale;
  }
  const out = path.join(ROOT, 'tools/art/out', name + '_sheet.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, encodePng(W, H, img));
  return `${out} ${W}x${H}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [name, sc, mw, f] = process.argv.slice(2);
  console.log(view(name, +(sc || 4), +(mw || 1500), f || null));
}
