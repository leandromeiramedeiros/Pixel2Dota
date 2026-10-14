// Swappable voxel terrain patch for hero showcase renders (tools/art/vox.mjs). A thin round diorama slab: a dithered top layer, two
// dirt layers on the sides, a few raised tufts away from the feet, and a soft 3-level Bayer-dithered contact shadow baked into the top.
// Look taken from the vox-preview grass patch. To add a new ground, add an entry to TERRAINS with the same keys; nothing else changes.
//   const { v: scene, dz } = withTerrain(buildLina(), { terrain: 'grass', R: 13 });   // model feet must be on z = 0
import { Vox, mix } from './vox.mjs';

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const toHex = c => '#' + c.map(x => x.toString(16).padStart(2, '0')).join('');

/**
 * top:  5 colours, picked by hash noise as [shadowed, base, mid, light, highlight]; base dominates.
 * side: 3 colours for the slab sides (side[1] is the bottom layer).
 * shadow: colour the contact shadow blends towards; light: colour the ramp highlights blend towards.
 */
export const TERRAINS = {
  grass: { top: ['#2f6a40', '#3f7a3a', '#4e9244', '#5fa64c', '#6db455'], side: ['#6a4630', '#573826', '#7a5438'], shadow: '#1c1a3c', light: '#f6f0b0' },
  dirt: { top: ['#5a3c2a', '#6e4a32', '#80583a', '#946a44', '#a87e52'], side: ['#4a3022', '#3a2418', '#5a3a28'], shadow: '#1c1428', light: '#ffe2b0' },
  snow: { top: ['#9aa8c8', '#c6d0e4', '#d8e0ee', '#e8eef6', '#ffffff'], side: ['#6a7088', '#525870', '#7c829a'], shadow: '#3a3c6a', light: '#ffffff' },
  dire: { top: ['#2a2420', '#3a302a', '#4a3a30', '#5c4636', '#7a3a24'], side: ['#2c201c', '#201614', '#3a2a22'], shadow: '#100c18', light: '#ff9a5a' },
};

const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const hsh = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

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
    let c = T.top[n < 0.1 ? 0 : n < 0.62 ? 1 : n < 0.84 ? 2 : n < 0.95 ? 3 : 4];
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
