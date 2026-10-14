// Pose library sheet: every ANIMS pose of the voxel Lina at 3/4, one row per animation (no terrain).
//   node tools/art/heroes/lina_vox_poses.mjs   -> docs/voxel-chibi/lina_vox_poses.png
import fs from 'node:fs';
import path from 'node:path';
import { renderVox, Canvas } from '../vox.mjs';
import { encodePng } from '../png.mjs';
import { buildLina, ANIMS } from './lina_vox.mjs';
import { OUT } from './lina_vox_shot.mjs';

const rows = Object.entries(ANIMS), cols = Math.max(...rows.map(([, f]) => f.length)), cw = 92 * 2, ch = 100 * 2;
const C = new Canvas(cols * cw + 20, rows.length * ch + 20, '#1c2030');
rows.forEach(([, frames], r) => frames.forEach((p, c) => {
  C.blit(renderVox(buildLina(p), { yaw: 28, pitch: 30, scale: 1.6, W: 92, H: 100, center: [17, 15, 20], ss: 3 }), 10 + c * cw, 10 + r * ch, 2);
}));
fs.mkdirSync(OUT, { recursive: true });
const out = path.join(OUT, 'lina_vox_poses.png');
fs.writeFileSync(out, encodePng(C.W, C.H, C.px));
console.log(out, rows.map(([k, f]) => k + ':' + f.length).join(' '));
