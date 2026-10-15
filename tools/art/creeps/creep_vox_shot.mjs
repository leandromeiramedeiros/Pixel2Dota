// Voxel melee creep sheet (Radiant and Dire are two different models, no team tint):
//   rows 1-2: Radiant front / 3-4 / side / back (2x), then every ANIMS pose at 3/4;
//   rows 3-4: the same for Dire;
//   last row: approx. true in-game size next to Lina at the same scale (1 render-target px = 3 world units, a character voxel = 4.2 u -> 1.4 px
//   per voxel, pitch 30 like the in-game lean; no bloom / grade), shown at 1x, then the same strip at 4x nearest.
//   node tools/art/creeps/creep_vox_shot.mjs   -> docs/voxel-chibi/creep_melee_vox.png
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderVox, Canvas } from '../vox.mjs';
import { encodePng } from '../png.mjs';
import * as radiant from '../../../shared/vox/creeps/melee_radiant.js';
import * as dire from '../../../shared/vox/creeps/melee_dire.js';
import * as lina from '../../../shared/vox/heroes/lina.js';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'voxel-chibi');
const MODS = [radiant, dire], VIEWS = [0, 45, 90, 180], VW = 92, VH = 92, PW = 76, PH = 80, GAME = 1.4;
const ctr = m => [m.META.cx, m.META.cy, 14];
const rows = MODS.map(m => Object.values(m.ANIMS).flat());
const GW = 44, GH = 72, NG = 6, GZ = 19;
const W = Math.max(VIEWS.length * VW * 2, ...rows.map(r => r.length * PW), NG * GW * 4) + 20;
const C = new Canvas(W, MODS.length * (VH * 2 + PH + 20) + GH * 5 + 40, '#1c2030');
let y = 10;
MODS.forEach((m, mi) => {
  VIEWS.forEach((yaw, k) => C.blit(renderVox(m.build(m.ANIMS.idle[0]), { yaw, pitch: 30, scale: 2.2, W: VW, H: VH, center: ctr(m), ss: 3 }), 10 + k * VW * 2, y, 2));
  y += VH * 2 + 4;
  rows[mi].forEach((p, k) => C.blit(renderVox(m.build(p), { yaw: 28, pitch: 30, scale: 2, W: PW, H: PH, center: ctr(m), ss: 3 }), 10 + k * PW, y, 1));
  y += PH + 16;
});
// true size: Lina, Radiant, Dire (3/4 and front), same scale + same centre height so the feet line up
const at = (m, c) => [m.build(m.ANIMS.idle[0]), c];
const G = [0, 28].flatMap(yaw => [[...at(lina, [17, 15, GZ]), yaw], [...at(radiant, [radiant.META.cx, radiant.META.cy, GZ]), yaw], [...at(dire, [dire.META.cx, dire.META.cy, GZ]), yaw]]);
G.forEach(([v, center, yaw], k) => {
  const r = renderVox(v, { yaw, pitch: 30, scale: GAME, W: GW, H: GH, center, ss: 3 });
  C.blit(r, 10 + k * GW, y, 1);
  C.blit(r, 10 + k * GW * 4, y + GH + 8, 4);
});
fs.mkdirSync(OUT, { recursive: true });
const out = path.join(OUT, 'creep_melee_vox.png'), png = encodePng(C.W, C.H, C.px);
fs.writeFileSync(out, png);
console.log(out, (png.length / 1024).toFixed(1) + ' KB', MODS.map((m, i) => ['radiant', 'dire'][i] + ' ' + Object.entries(m.ANIMS).map(([k, f]) => k + ':' + f.length).join(' ')).join(' | '));
