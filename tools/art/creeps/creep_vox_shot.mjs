// Voxel creep showcase: front / 3-4 / side / back for Radiant and Dire (team voxels recoloured with mats.js teamTint), then every ANIMS pose
// at 3/4, one row per team.   node tools/art/creeps/creep_vox_shot.mjs [melee]   -> docs/voxel-chibi/creep_<name>_vox.png
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderVox, Canvas } from '../vox.mjs';
import { encodePng } from '../png.mjs';
import { teamTint } from '../../../shared/vox/mats.js';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'voxel-chibi');
const name = process.argv[2] || 'melee';
const { build, ANIMS, META } = await import(`../../../shared/vox/creeps/${name}.js`);
const TEAMS = ['radiant', 'dire'], VIEWS = [0, 45, 90, 180], VW = 70, VH = 80, PW = 64, PH = 72;
const center = [META.cx, META.cy, META.grid[2] * 0.45];
const poses = Object.values(ANIMS).flat();
const C = new Canvas(Math.max(VIEWS.length * TEAMS.length * VW * 2, poses.length * PW) + 20, VH * 2 + TEAMS.length * PH + 40, '#1c2030');
TEAMS.forEach((t, ti) => VIEWS.forEach((yaw, k) => C.blit(renderVox(teamTint(build(), t), { yaw, pitch: 30, scale: 2.2, W: VW, H: VH, center, ss: 3 }), 10 + (ti * VIEWS.length + k) * VW * 2, 10, 2)));
TEAMS.forEach((t, ti) => poses.forEach((p, k) => C.blit(renderVox(teamTint(build(p), t), { yaw: 28, pitch: 30, scale: 2, W: PW, H: PH, center, ss: 3 }), 10 + k * PW, VH * 2 + 20 + ti * PH, 1)));
fs.mkdirSync(OUT, { recursive: true });
const out = path.join(OUT, `creep_${name}_vox.png`), png = encodePng(C.W, C.H, C.px);
fs.writeFileSync(out, png);
console.log(out, (png.length / 1024).toFixed(1) + ' KB', Object.entries(ANIMS).map(([k, f]) => k + ':' + f.length).join(' '));
