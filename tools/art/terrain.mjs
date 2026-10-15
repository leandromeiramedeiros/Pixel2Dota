// Swappable voxel terrain patch for hero showcase renders (tools/art/vox.mjs). A thin round diorama slab: a dithered top layer, two
// dirt layers on the sides, a few raised tufts away from the feet, and a soft 3-level Bayer-dithered contact shadow baked into the top.
// Look taken from the vox-preview grass patch. To add a new ground, add an entry to TERRAINS with the same keys; nothing else changes.
//   const { v: scene, dz } = withTerrain(buildLina(), { terrain: 'grass', R: 13 });   // model feet must be on z = 0
import { Vox, mix, hex } from './vox.mjs';
import { TERRAINS, hsh, topIndex } from '../../shared/vox/terrain.js';
export { TERRAINS };

const toHex = c => '#' + c.map(x => x.toString(16).padStart(2, '0')).join('');

const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

/**
 * Copy model v into a new Vox with room for the terrain under it and lay the patch at the model's (cx, cy).
 * opts: { terrain = 'grass' (key or TERRAINS-shaped object), R = 12 (radius), cx, cy (patch centre, default grid centre),
 *         shadowAt = [1.6, 1.2] (blob offset in x / y, pushed away from the key light), shadowR = [9, 6.6], blob = true }
 * Returns { v, dz }: the model is shifted up by dz, so pass center z + dz to renderVox.
 */
export function withTerrain(v, opts = {}) {
  const T = typeof opts.terrain === 'object' ? opts.terrain : TERRAINS[opts.terrain || 'grass'];
  const R = opts.R ?? 12, dz = 3, pad = Math.max(0, Math.ceil(R + 2 - Math.min(v.X, v.Y) / 2));
  const out = new Vox(v.X + pad * 2, v.Y + pad * 2, v.Z + dz);
  for (const m of v.mats.slice(1)) out.mat(m.name, m);
  for (let z = 0; z < v.Z; z++) for (let y = 0; y < v.Y; y++) for (let x = 0; x < v.X; x++) {
    const m = v.get(x, y, z); if (m) out.set(x + pad, y + pad, z + dz, out.ids.get(v.mats[m].name));
  }
  const cx = (opts.cx ?? v.X / 2) + pad, cy = (opts.cy ?? v.Y / 2) + pad;
  const [sox, soy] = opts.shadowAt || [1.6, 1.2], [srx, sry] = opts.shadowR || [9, 6.6];
  const sh = hex(T.shadow), li = hex(T.light);
  // one material per (colour, shadow level); terrain takes no ray shadows so the baked blob is the only one
  const mat = (c, lvl) => {
    const b = mix(hex(c), sh, [0, 0.28, 0.5, 0.64][lvl]);
    return out.mat(`ter_${c}_${lvl}`, { ramp: [mix(b, sh, 0.45), mix(b, sh, 0.18), b, mix(b, li, 0.18)].map(toHex), noShadow: true });
  };
  const rr = a => R + 1.1 * Math.sin(a * 5 + 1) + 0.8 * Math.sin(a * 9);
  for (let ix = -R - 2; ix <= R + 2; ix++) for (let iy = -R - 2; iy <= R + 2; iy++) {
    const r = Math.hypot(ix, iy), edgeR = rr(Math.atan2(iy, ix)); if (r > edgeR) continue;
    const x = Math.floor(cx) + ix, y = Math.floor(cy) + iy, n = hsh(ix, -iy);
    let c = T.top[topIndex(n)];
    if (((ix + iy) & 1) === 0 && n > 0.3 && n < 0.5) c = T.top[2];
    let lvl = 0;
    if (opts.blob !== false) {
      const d = Math.hypot((ix - sox) / srx, (iy - soy) / sry);
      const t = Math.max(0, 1 - d) * 3.2, th = (BAYER[((iy % 4) + 4) % 4][((ix % 4) + 4) % 4] + 0.5) / 16;
      lvl = Math.max(0, Math.min(3, Math.floor(t + (th - 0.5) * 0.9 + 0.5)));
    }
    const edge = r > edgeR - 1.5;
    out.set(x, y, dz - 1, edge && n < 0.3 ? mat(T.side[0], 0) : mat(c, lvl));
    out.set(x, y, dz - 2, mat(T.side[(n * 3) | 0], 0));
    out.set(x, y, dz - 3, mat(T.side[1], 0));
    if (n > 0.945 && r > 7.5 && !out.get(x, y, dz)) out.set(x, y, dz, mat(T.top[n > 0.97 ? 4 : 3], 0));   // sparse tufts, never under the feet
  }
  return { v: out, dz, pad };
}
