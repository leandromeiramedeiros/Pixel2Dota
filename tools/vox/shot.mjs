// Voxel review sheet:   node tools/vox/shot.mjs <short|all> [--small] [--out <dir>]     (npm run vox:shot -- melee_radiant --small)
//   full   -> docs/voxel-chibi/<short>_vox.png: front / 3/4 / side / back (2x), one row per ANIMS entry (every pose at 3/4), then the true in-game size
//             next to Lina (1 render px = 3 world units, a character voxel = 4.2 u = 1.4 px, pitch 30 like the in-game lean; no bloom / grade) at 1x and 4x.
//   --small -> tools/art/out/<short>_vox_small.png (gitignored): the 4 views at 1x, for fast look-and-fix rounds.
// Only our own voxels are drawn: the private Dota 2 reference (tools/vox/ref.mjs) never goes onto a sheet.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderVox, Canvas } from '../art/vox.mjs';
import { encodePng } from '../art/png.mjs';
import { VOX } from '../../shared/vox/index.js';
import { drawText } from './lib/font.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2), small = args.includes('--small'), oi = args.indexOf('--out');
const outDir = oi >= 0 ? path.resolve(args[oi + 1]) : path.join(ROOT, small ? 'tools/art/out' : 'docs/voxel-chibi');
const arg = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');
if (!arg || (arg !== 'all' && !VOX[arg])) { console.error(`usage: node tools/vox/shot.mjs <all|${Object.keys(VOX).join('|')}> [--small] [--out dir]`); process.exit(2); }

const PITCH = 30, GAME = 1.4, BG = '#1c2030', LABEL = '#8892b0';
/** Idle frame size of a model: [height, voxel count]. */
function stats(mod) {
  const v = mod.build(mod.ANIMS.idle[0]); let h = 0, n = 0;
  for (let k = 0; k < v.g.length; k++) if (v.g[k]) { n++; h = Math.max(h, Math.floor(k / (v.X * v.Y)) + 1); }
  return { h, n };
}
/** Cell size + camera centre for a model rendered at `scale` (feet-to-top height h centred; room for any pose in the grid). */
function cell(mod, scale, h) {
  const [gx, gy, gz] = mod.META.grid;
  return { W: Math.ceil(Math.hypot(gx, gy) * scale) + 8, H: Math.ceil((Math.max(h, gz * 0.75) * Math.cos(PITCH * Math.PI / 180) + gy * 0.5) * scale) + 10, center: [mod.META.cx, mod.META.cy, h / 2] };
}
const view = (mod, pose, yaw, scale, c, ss) => renderVox(mod.build(pose), { yaw, pitch: PITCH, scale, W: c.W, H: c.H, center: c.center, ss });

function sheet(name) {
  const { mod, kind } = VOX[name], M = mod.META, { h, n } = stats(mod), t0 = performance.now(), YAWS = [0, 45, 90, 180];
  if (small) {
    const sc = 1.6, c = cell(mod, sc, h), C = new Canvas(10 + YAWS.length * (c.W + 6), c.H + 28, BG);
    YAWS.forEach((yaw, k) => C.blit(view(mod, mod.ANIMS.idle[0], yaw, sc, c, 2), 10 + k * (c.W + 6), 18, 1));
    drawText(C, 10, 6, `${name} ${kind} ${M.grid.join('X')} H${h} V${n}  FRONT 3/4 SIDE BACK`, LABEL, 1);
    return { C, ms: performance.now() - t0 };
  }
  const rows = Object.entries(mod.ANIMS), big = cell(mod, 2.2, h), pc = cell(mod, 1.6, h);
  const lina = VOX.lina?.mod, lh = lina ? stats(lina).h : 0;
  const gh = Math.max(h, lh), gc = cell(mod, GAME, gh), gcl = lina ? cell(lina, GAME, gh) : gc, GW = Math.max(gc.W, gcl.W), GH = Math.max(gc.H, gcl.H);
  const strip = [...(lina && lina !== mod ? [[lina, 'LINA']] : []), [mod, name]];
  const gcount = strip.length * 2;
  const W = Math.max(YAWS.length * (big.W * 2 + 6), ...rows.map(([, f]) => f.length * (pc.W + 4)), gcount * GW * 4 + 10) + 20;
  const Hh = 18 + big.H * 2 + 8 + rows.length * (pc.H + 14) + 14 + GH + 8 + GH * 4 + 20;
  const C = new Canvas(W, Hh, BG);
  let y = 6;
  drawText(C, 10, y, `${name} ${kind}  grid ${M.grid.join('X')}  height ${h}  voxels ${n}  rig ${M.rig}`, '#e0e6ff', 1); y += 12;
  YAWS.forEach((yaw, k) => C.blit(view(mod, mod.ANIMS.idle[0], yaw, 2.2, big, 3), 10 + k * (big.W * 2 + 6), y, 2));
  y += big.H * 2 + 8;
  for (const [anim, frames] of rows) {
    drawText(C, 10, y, anim, LABEL, 1); y += 8;
    frames.forEach((p, k) => C.blit(view(mod, p, 28, 1.6, pc, 3), 10 + k * (pc.W + 4), y, 1));
    y += pc.H + 6;
  }
  drawText(C, 10, y, 'TRUE GAME SIZE (1X AND 4X) ' + strip.map(s => s[1]).join(' + '), LABEL, 1); y += 10;
  let x = 10;
  for (const [m] of strip) for (const yaw of [0, 28]) {
    const r = renderVox(m.build(m.ANIMS.idle[0]), { yaw, pitch: PITCH, scale: GAME, W: GW, H: GH, center: [m.META.cx, m.META.cy, gh / 2], ss: 3 });
    C.blit(r, x, y, 1); C.blit(r, 10 + (x - 10) * 4, y + GH + 8, 4); x += GW;
  }
  return { C, ms: performance.now() - t0 };
}

fs.mkdirSync(outDir, { recursive: true });
const names = arg === 'all' ? Object.keys(VOX) : [arg];
let total = 0;
for (const name of names) {
  const { C, ms } = sheet(name), png = encodePng(C.W, C.H, C.px), out = path.join(outDir, `${name}_vox${small ? '_small' : ''}.png`);
  fs.writeFileSync(out, png); total += ms;
  console.log(`${name.padEnd(16)} ${String(Math.round(ms)).padStart(5)} ms  ${C.W}x${C.H}  ${(png.length / 1024).toFixed(1)} KB  ${path.relative(ROOT, out)}`);
}
if (names.length > 1) console.log(`${names.length} sheets, ${(total / 1000).toFixed(1)} s`);
