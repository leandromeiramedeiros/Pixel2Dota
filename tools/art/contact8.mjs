// 8-direction contact sheet (nearest-neighbour). Rows = s se e ne n nw w sw (west side mirrored like the runtime), columns = anim frames.
//   node tools/art/contact8.mjs <hero> [--scale 4] [--anims idle,walk] [--frames 4] [--dirs s,se,e] [--old <path to a 1x sheet .js>] [--out docs/shots/v3-<hero>-sheet.png]
// --old adds the old 1x sheet (s,e,n + mirrored w) at the same on-screen size (scale*px) to the right for comparison.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './png.mjs';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : process.argv[i + 1]; };
const hero = process.argv[2], scale = +arg('scale', 4), anims = arg('anims', 'idle,walk').split(','), nf = +arg('frames', 4);
const load = f => new Function(fs.readFileSync(f, 'utf8').replace(/export\s+default/, 'return'))();
const S = load(path.join(ROOT, 'client/src/art/sheets', hero + '.js')), old = arg('old') ? load(arg('old')) : null;
const out = path.resolve(ROOT, arg('out', `docs/shots/v3-${hero}-sheet.png`));
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const DIRS = arg('dirs', 's,se,e,ne,n,nw,w,sw').split(','), MIR = { nw: 'ne', w: 'e', sw: 'se' };
const px = S.px || 1, fw = S.frames.idle_s_0[0].length, fh = S.frames.idle_s_0.length;
const cols = anims.length * nf, gap = 2;
const oldW = old ? old.frames.idle_s_0[0].length * scale * px / (old.px || 1) : 0, oldH = old ? old.frames.idle_s_0.length * scale * px / (old.px || 1) : 0;
const cw = fw * scale + gap, ch = fh * scale + gap;
const W = cols * cw + (old ? 24 + anims.length * nf * (oldW + gap) : 0) + 8, H = DIRS.length * ch + 8;
const img = new Uint8Array(W * H * 4); const bg = hex('#2a3040');
for (let i = 0; i < W * H; i++) { img.set(bg, i * 4); img[i * 4 + 3] = 255; }
function blit(sheet, rows, flip, x0, y0, s) {
  const c = {}; for (const [k, v] of Object.entries(sheet.pal)) c[k] = hex(v);
  rows.forEach((r, y) => { const row = flip ? [...r].reverse() : [...r]; row.forEach((chr, x) => { if (chr === '.') return; const col = c[chr]; if (!col) return;
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) { const X = x0 + x * s + dx, Y = y0 + y * s + dy, i = (Y * W + X) * 4; if (X < W && Y < H) img.set(col, i); } }); });
}
DIRS.forEach((d, r) => {
  let ci = 0;
  for (const a of anims) for (let i = 0; i < nf; i++, ci++) {
    const m = MIR[d], rows = S.frames[`${a}_${m || d}_${i}`]; if (rows) blit(S, rows, !!m, 4 + ci * cw, 4 + r * ch, scale);
  }
  if (old) {
    const od = { s: 's', se: 'e', e: 'e', ne: 'e', n: 'n', nw: 'e', w: 'e', sw: 'e' }[d], flip = ['nw', 'w', 'sw'].includes(d), os = Math.round(scale * px / (old.px || 1));
    let oi = 0; for (const a of anims) for (let i = 0; i < nf; i++, oi++) { const rows = old.frames[`${a}_${od}_${i}`]; if (rows) blit(old, rows, flip, 4 + cols * cw + 24 + oi * (oldW + gap), 4 + r * ch + (fh * scale - rows.length * os), os); }
  }
});
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, encodePng(W, H, img));
console.log(out, W + 'x' + H);
