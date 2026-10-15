// Voxel Lina showcase: big 3/4 close-up + front / 3/4 / side / back at 2x, on a terrain patch.
//   node tools/art/heroes/lina_vox_shot.mjs [terrain=grass] [pitch=30]   -> docs/voxel-chibi/lina_vox[_<terrain>].png
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderVox, Canvas } from '../vox.mjs';
import { withTerrain } from '../terrain.mjs';
import { encodePng } from '../png.mjs';
import { buildLina, META } from './lina_vox.mjs';

export const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'voxel-chibi');

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ter = process.argv[2] || 'grass', pitch = +(process.argv[3] || 30);
  const { v, dz, pad } = withTerrain(buildLina(), { terrain: ter, R: 13, cx: META.cx, cy: META.cy });
  const view = yaw => renderVox(v, { yaw, pitch, scale: 2, W: 110, H: 124, center: [META.cx + pad, META.cy + pad, 19 + dz], ss: 3 });
  const C = new Canvas(1280, 720, '#1c2030');
  C.blit(view(28), 20, 10, 5);
  [0, 45, 90, 180].forEach((y, k) => C.blit(view(y), 590 + (k % 2) * 330, 20 + Math.floor(k / 2) * 250, 2));
  fs.mkdirSync(OUT, { recursive: true });
  const out = path.join(OUT, 'lina_vox' + (ter === 'grass' ? '' : '_' + ter) + '.png');
  fs.writeFileSync(out, encodePng(C.W, C.H, C.px));
  console.log(out);
}
