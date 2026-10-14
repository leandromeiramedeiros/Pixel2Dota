// Preview PNGs of an extraction: world_types.png (type shaded by elev, ramps tan) and world_height.png (real ground z, hypsometric + 64u contours).
//   node tools/world/extract.mjs --preview <dir>
import fs from 'node:fs';
import path from 'node:path';
import { encodePng } from '../art/png.mjs';
import { GRID_NONE } from '../../shared/worldcodec.js';

const PAL = [[56, 94, 56], [20, 44, 28], [96, 92, 108], [40, 88, 150], [110, 88, 58], [70, 140, 214], [70, 66, 80]];
const SHADE = [0.7, 1, 1.3];
// hypsometric stops: z -> rgb
const STOPS = [[-128, [20, 40, 110]], [0, [40, 110, 150]], [64, [60, 150, 90]], [128, [120, 170, 70]], [256, [210, 200, 90]], [384, [200, 130, 60]], [512, [250, 250, 250]]];
function hypso(z) {
  if (z <= STOPS[0][0]) return STOPS[0][1];
  for (let i = 1; i < STOPS.length; i++) if (z <= STOPS[i][0]) {
    const [z0, a] = STOPS[i - 1], [z1, b] = STOPS[i], t = (z - z0) / (z1 - z0);
    return a.map((v, k) => v + (b[k] - v) * t);
  }
  return STOPS[STOPS.length - 1][1];
}

export function preview(r, dir, S = 3) {
  const { data: { w, h }, typ, elev, ramp, zr } = r;
  fs.mkdirSync(dir, { recursive: true });
  const W = w * S, H = h * S;
  const mk = (px) => {
    const img = new Uint8Array(W * H * 4);
    for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
      const c = px(ty * w + tx, tx, ty);
      for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) { const o = ((ty * S + dy) * W + tx * S + dx) * 4; img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2]; img[o + 3] = 255; }
    }
    return img;
  };
  const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const types = mk((i) => {
    if (ramp[i] && typ[i] !== 2 && typ[i] !== 6) return [190, 170, 120];
    return PAL[typ[i]].map((v) => cl(v * SHADE[elev[i]]));
  });
  const height = mk((i, tx, ty) => {
    const z = zr[i];
    if (z === GRID_NONE) return [20, 20, 24];
    const c = hypso(z).map(cl), band = (v) => Math.floor(v / 64);
    const edge = (tx + 1 < w && zr[i + 1] !== GRID_NONE && band(zr[i + 1]) !== band(z)) || (ty + 1 < h && zr[i + w] !== GRID_NONE && band(zr[i + w]) !== band(z));
    return edge ? c.map((v) => cl(v * 0.55)) : c;
  });
  fs.writeFileSync(path.join(dir, 'world_types.png'), encodePng(W, H, types));
  fs.writeFileSync(path.join(dir, 'world_height.png'), encodePng(W, H, height));
}
