// Grid contact-sheet renderer (labels printed to stdout, row-major). Reuses tools/art/png.mjs.
//   node tools/art/icons/grid.mjs <sheet> [scale=6] [cols=12] [regex] [bg]  -> tools/art/out/<sheet>_grid.png
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSheet, encodePng } from '../png.mjs';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const hex = h => { h = h.replace('#', ''); if (h.length === 6) h += 'ff'; return [0, 2, 4, 6].map(i => parseInt(h.slice(i, i + 2), 16)); };
export function grid(S, { scale = 6, cols = 12, re = null, bg = '#1c2230', out, checker = false }) {
  let keys = Object.keys(S.frames); if (re) keys = keys.filter(k => new RegExp(re).test(k));
  const fw = Math.max(...keys.map(k => [...S.frames[k][0]].length)), fh = Math.max(...keys.map(k => S.frames[k].length));
  const cw = fw + 2, ch = fh + 2, rows = Math.ceil(keys.length / cols), W = cols * cw * scale + 4, H = rows * ch * scale + 4;
  const img = new Uint8Array(W * H * 4); const B = hex(bg);
  for (let i = 0; i < W * H; i++) { img.set(B, i * 4); img[i * 4 + 3] = 255; }
  const put = (x, y, c) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4, a = c[3] / 255; for (let k = 0; k < 3; k++) img[i + k] = Math.round(img[i + k] * (1 - a) + c[k] * a); };
  const add = (x, y, c, a) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; for (let k = 0; k < 3; k++) img[i + k] = Math.min(255, img[i + k] + c[k] * a); };
  const emit = S.emit || {};
  keys.forEach((k, n) => {
    const ox = (n % cols) * cw * scale + 2 + scale, oy = Math.floor(n / cols) * ch * scale + 2 + scale;
    if (checker) for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) if ((x + y) & 1) for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) put(ox + x * scale + dx, oy + y * scale + dy, [255, 255, 255, 14]);
    const em = [];
    S.frames[k].forEach((r, y) => [...r].forEach((c, x) => {
      if (c === '.') return; const col = hex(S.pal[c]);
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) put(ox + x * scale + dx, oy + y * scale + dy, col);
      if (emit[c]) em.push([x, y, col, emit[c]]);
    }));
    for (const [x, y, c, st] of em) for (let dy = -2 * scale; dy < 3 * scale; dy++) for (let dx = -2 * scale; dx < 3 * scale; dx++) { const d = Math.hypot(dx, dy) / scale; if (d > 0.8 && d < 2.6) add(ox + x * scale + (scale >> 1) + dx, oy + y * scale + (scale >> 1) + dy, c, 0.10 * st * (2.6 - d)); }
  });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, encodePng(W, H, img));
  const lines = []; for (let r = 0; r < rows; r++) lines.push(`row${r}: ` + keys.slice(r * cols, (r + 1) * cols).join(' '));
  return { out, W, H, lines };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [name, sc = '6', cols = '12', re, bg] = process.argv.slice(2);
  const S = loadSheet(name);
  const r = grid(S, { scale: +sc, cols: +cols, re, bg: bg || '#1c2230', out: path.join(ROOT, 'tools/art/out', name + '_grid.png'), checker: name === 'fx' });
  console.log(r.out, r.W + 'x' + r.H); console.log(r.lines.join('\n'));
}
