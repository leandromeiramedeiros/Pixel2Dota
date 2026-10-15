// Voxel ground rocks: ROCK, BOULDER, SCREE. Hand-authored chibi reads of the Dota 2 rocks (docs/VOXEL.md):
// Radiant = pale sage-grey angular blocks with flat tops and a chipped step; Dire = dark charcoal slate slabs with slanted tops, stacked shards and pale crack lines.
// Builders: (side 0 Radiant / 1 Dire, shape) -> Vox, feet on z = 0, foot centre (X / 2, Y / 2).
import { palette, grid, chunk, speckle, hh } from './clutterprim.js';

const PAL = [
  { base: '#74796f', dark: '#585c56', light: '#8f9487', moss: '#5e7a48' },   // Radiant: sage grey, a touch of moss
  { base: '#4c443f', dark: '#2f2926', light: '#6a6058', crack: '#a39a88' },   // Dire: charcoal slate, pale cracks
];

/** strata: the lowest third a shade darker (ground contact), hash-picked lighter patches */
const strata = (M, h) => (px, py, pz, lx, ly, lz) => (lz < -0.35 ? M.dark : hh(px * 2 | 0, py * 2 | 0, pz * 2 | 0, 3) < 0.14 ? M.light : M.base);

function rock(side, k) {
  const v = grid(16, 16, 12), M = palette(v, PAL[side]), s = strata(M);
  if (!side) {
    if (k === 0) { chunk(v, { c: [8, 8, 3.5], h: [4, 3.5, 3.5], cut: 2.6, m: s }); chunk(v, { c: [12.5, 6, 1.5], h: [1.8, 1.8, 1.5], cut: 2.6, m: M.base }); chunk(v, { c: [4, 11.5, 1], h: [1.3, 1.3, 1], cut: 2.4, m: M.dark }); }
    else if (k === 1) { chunk(v, { c: [7, 8, 4.5], h: [3, 3, 4.5], cut: 2.7, lean: 0.1, m: s }); chunk(v, { c: [10.5, 8, 1.5], h: [1.6, 2.6, 1.5], cut: 2.8, m: M.dark }); chunk(v, { c: [4, 5, 1], h: [1.2, 1.2, 1], cut: 2.4, m: M.base }); }
    else { chunk(v, { c: [8, 8, 2.5], h: [5.5, 3.5, 2.5], cut: 2.5, tilt: 0.25, m: s }); chunk(v, { c: [3, 11.5, 1], h: [1.5, 1.5, 1], cut: 2.4, m: M.base }); chunk(v, { c: [13, 4.5, 1], h: [1.5, 1.2, 1], cut: 2.4, m: M.dark }); }
    // a little moss on the flat tops
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) for (let z = 11; z >= 0; z--) if (v.get(x, y, z)) { if (v.get(x, y, z) !== M.dark && hh(x, y, z, 5) < 0.16 && !v.get(x, y, z + 1)) v.set(x, y, z, M.moss); break; }
  } else {
    if (k === 0) { chunk(v, { c: [7, 8, 5.5], h: [2.5, 4, 5.5], cut: 2.7, tilt: 0.8, lean: 0.15, m: s }); chunk(v, { c: [10.5, 7, 2], h: [2.2, 2.6, 2], cut: 2.5, tilt: -0.5, m: M.base }); chunk(v, { c: [4, 11, 1], h: [1.5, 1.5, 1], cut: 2.4, m: M.dark }); }
    else if (k === 1) { chunk(v, { c: [8, 8, 2], h: [5, 3.5, 2], cut: 2.4, m: M.dark }); chunk(v, { c: [6, 8, 5.5], h: [1.3, 1.8, 4.5], cut: 2.8, tilt: 1, m: s }); chunk(v, { c: [9.5, 7.5, 5], h: [1.5, 1.7, 4], cut: 2.8, tilt: -1, m: s }); chunk(v, { c: [8, 10.5, 4], h: [1.1, 1.3, 3.2], cut: 2.8, tilt: 0.6, m: M.base }); }
    else { chunk(v, { c: [8, 8, 3], h: [5.5, 3.5, 3], cut: 2.5, tilt: 0.6, m: s }); chunk(v, { c: [3.5, 11, 1.5], h: [1.8, 1.8, 1.5], cut: 2.4, tilt: -0.4, m: M.base }); chunk(v, { c: [13, 5, 1], h: [1.4, 1.4, 1], cut: 2.4, m: M.dark }); }
    speckle(v, M.crack, 0.1, M.base, 11);
  }
  return v;
}

function boulder(side, k) {
  const v = grid(20, 18, 14), M = palette(v, PAL[side]), s = strata(M);
  if (!side) {
    if (k === 0) { chunk(v, { c: [9, 9, 5], h: [6, 5, 5], cut: 2.6, tilt: 0.12, m: s }); chunk(v, { c: [16, 5, 2.5], h: [2.6, 2.6, 2.5], cut: 2.5, m: M.base }); chunk(v, { c: [4, 14, 1.5], h: [2, 2, 1.5], cut: 2.4, m: M.dark }); }
    else { chunk(v, { c: [8, 9, 6], h: [4.5, 4.5, 6], cut: 2.7, lean: 0.08, m: s }); chunk(v, { c: [14, 8, 3.5], h: [3, 4, 3.5], cut: 2.5, m: M.base }); chunk(v, { c: [11, 14, 1.5], h: [2, 2, 1.5], cut: 2.4, m: M.dark }); }
    for (let y = 0; y < 18; y++) for (let x = 0; x < 20; x++) for (let z = 13; z >= 0; z--) if (v.get(x, y, z)) { if (v.get(x, y, z) !== M.dark && hh(x, y, z, 5) < 0.2 && !v.get(x, y, z + 1)) v.set(x, y, z, M.moss); break; }
  } else {
    if (k === 0) { chunk(v, { c: [8, 9, 6.5], h: [3.2, 5.2, 6.5], cut: 2.7, tilt: 0.9, lean: 0.15, m: s }); chunk(v, { c: [12.5, 9, 4], h: [2.6, 4.5, 4], cut: 2.6, tilt: 0.7, m: M.base }); chunk(v, { c: [10, 4, 2.5], h: [4.5, 2.5, 2.5], cut: 2.5, m: M.dark }); chunk(v, { c: [5, 13, 2], h: [2, 2, 2], cut: 2.4, m: M.dark }); }
    else { chunk(v, { c: [9, 9, 3], h: [7, 5, 3], cut: 2.5, m: M.dark }); chunk(v, { c: [7, 9, 8], h: [2, 4, 5.5], cut: 2.8, tilt: 1, lean: 0.12, m: s }); chunk(v, { c: [11.5, 9, 7], h: [2.2, 3.6, 4.5], cut: 2.8, tilt: -0.9, m: s }); chunk(v, { c: [15, 8, 3.5], h: [2, 3, 3.5], cut: 2.5, tilt: -0.5, m: M.base }); }
    speckle(v, M.crack, 0.09, M.base, 13);
  }
  return v;
}

/** pebbles: a loose spread of small chamfered stones */
const PEBBLES = [
  [[0, 0, 1.5, 1.1, 1], [3.4, 1.2, 1.2, 1, 0.9], [-3, 2.2, 1.3, 1.1, 1], [1, -3.2, 1.1, 0.9, 0.8], [-3.6, -1.2, 0.9, 0.8, 0.7], [4, -2.6, 0.8, 0.8, 0.7]],
  [[0, 0, 1.4, 1.4, 1.1], [-3.4, 0.6, 1.2, 1, 0.9], [2.6, 3, 1.1, 1, 0.9], [3.8, -1.8, 1.2, 1, 0.8], [-1.4, -3.4, 0.9, 0.9, 0.7], [-4.4, -3.2, 0.7, 0.7, 0.6]],
];
function scree(side, k) {
  const v = grid(16, 16, 4), M = palette(v, PAL[side]);
  PEBBLES[k].forEach(([x, y, hx, hy, hz], i) => chunk(v, { c: [8 + x, 8 + y, hz], h: [hx, hy, hz], cut: 2.3, tilt: side ? (i % 2 ? 0.4 : -0.4) : 0, m: i % 3 === 0 ? M.dark : i % 3 === 1 ? M.base : M.light }));
  return v;
}

export const ROCKS = {
  ROCK: { unit: 6, shapes: 3, build: rock },
  BOULDER: { unit: 7, shapes: 2, build: boulder },
  SCREE: { unit: 4.5, shapes: 2, build: scree },
};
