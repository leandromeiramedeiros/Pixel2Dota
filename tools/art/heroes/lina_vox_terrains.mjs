// Terrain swap check: the same 3/4 voxel Lina on every TERRAINS entry of tools/art/terrain.mjs.
//   node tools/art/heroes/lina_vox_terrains.mjs   -> docs/voxel-chibi/lina_vox_terrains.png
import fs from 'node:fs';
import path from 'node:path';
import { renderVox, Canvas } from '../vox.mjs';
import { withTerrain, TERRAINS } from '../terrain.mjs';
import { encodePng } from '../png.mjs';
import { buildLina, META } from './lina_vox.mjs';
import { OUT } from './lina_vox_shot.mjs';

const lina = buildLina(), keys = Object.keys(TERRAINS);
const C = new Canvas(keys.length * 260 + 20, 300, '#1c2030');
keys.forEach((t, k) => {
  const { v, dz, pad } = withTerrain(lina, { terrain: t, R: 13, cx: META.cx, cy: META.cy });
  C.blit(renderVox(v, { yaw: 28, pitch: 30, scale: 2, W: 110, H: 124, center: [META.cx + pad, META.cy + pad, 19 + dz], ss: 3 }), 20 + k * 260, 24, 2);
});
fs.mkdirSync(OUT, { recursive: true });
const out = path.join(OUT, 'lina_vox_terrains.png');
fs.writeFileSync(out, encodePng(C.W, C.H, C.px));
console.log(out, keys.join(' '));
