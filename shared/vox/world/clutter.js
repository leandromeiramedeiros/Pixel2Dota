// Voxel world clutter (docs/VOXEL.md, batch 5): every ground prop is a hand-authored chibi read of its Dota 2 counterpart, Radiant and Dire sets differ.
// Rocks live in rocks.js. Builders: (side 0 Radiant / 1 Dire, shape) -> Vox, feet on z = 0, foot centre (X / 2, Y / 2).
// Materials may carry sway (0..1, wind weight of that voxel, scaled by height over spec.swayH by the mesher) and night (faint glow after dusk, mushroom caps).
import { palette, grid, chunk, blob, lathe, speckle, hh } from './clutterprim.js';
import { ROCKS } from './rocks.js';

const bay = (v, ...a) => v.capsule(...a);   // v.capsule(a, b, r0, m, r1)

// ---------------------------------------------------------------------------------------------------------------------------------
// bush: Radiant = low dark-green leafy rosette, Dire = dry ochre scrub with bare twigs
const BUSH_PAL = [
  { leaf: { c: '#3a6e3e', sway: 0.6 }, leafD: { c: '#2a5535', sway: 0.5 }, leafL: { c: '#5f9a4e', sway: 0.7 }, vine: { c: '#a3b34c', sway: 0.7 }, twig: '#4a3a28' },
  { leaf: { c: '#8a7436', sway: 0.6 }, leafD: { c: '#5e4a28', sway: 0.5 }, leafL: { c: '#b79a44', sway: 0.7 }, vine: { c: '#c9703a', sway: 0.7 }, twig: '#4a3524' },
];
function bush(side, k) {
  const v = grid(16, 16, 10), M = palette(v, BUSH_PAL[side]);
  const shade = (px, py, pz, x, y, z) => (z <= 1 ? M.leafD : z >= 4 && hh(x, y, z, 2) < 0.45 ? M.leafL : hh(x, y, z, 9) < 0.2 ? M.leafD : M.leaf);
  if (!side) {
    if (k === 0) { blob(v, 8, 8, 2.6, 6.2, 6, 3.4, shade, 0.35, 1); blob(v, 12.6, 10.2, 1.6, 3.4, 3.2, 2.2, shade, 0.3, 2); }
    else { blob(v, 6, 8, 1.7, 4.8, 4.8, 2.2, shade, 0.3, 3); blob(v, 11, 6.6, 1.7, 4, 3.8, 2.2, shade, 0.3, 4); blob(v, 8.6, 11.2, 2, 4, 3.8, 2.4, shade, 0.3, 5); }
    for (let i = 0; i < 6; i++) { const x = 3 + ((hh(i, 1, 0, 8) * 10) | 0), y = 3 + ((hh(i, 2, 0, 8) * 10) | 0); for (let z = 6; z >= 0; z--) if (v.get(x, y, z)) { v.set(x, y, z, M.vine); break; } }
  } else if (k === 0) {
    blob(v, 8, 8, 2.8, 6, 5.8, 3.2, shade, 0.75, 6);
    [[5, 6, 8.5], [11, 6, 9], [8, 11, 7]].forEach(([x, y, h], i) => bay(v, [8, 8, 2], [x + (i - 1) * 1.5, y + 1, h], 0.55, M.twig, 0.3));
  } else {
    blob(v, 8, 8, 1.6, 5.6, 5.4, 2.2, shade, 0.7, 7);
    for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.3, r = 4 + (i % 2) * 1.2; bay(v, [8, 8, 1.5], [8 + Math.cos(a) * r, 8 + Math.sin(a) * r, 5 + (i % 3)], 0.5, M.twig, 0.3); v.set(Math.round(8 + Math.cos(a) * r), Math.round(8 + Math.sin(a) * r), 5 + (i % 3), M.vine); }
  }
  return v;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// shroom: Radiant = tall pale cream caps on grey stems (wild mushroom cluster + a bud), Dire = pitted brown morel cones on tan stems
const SHROOM_PAL = [
  { stem: '#b3b4c0', stemD: '#8a8a9c', cap: { c: '#eee0bc', night: 1 }, capD: { c: '#cdb88c', night: 1 } },
  { stem: '#c8b48e', stemD: '#9c8662', cap: { c: '#8e5a34', night: 1 }, capD: { c: '#5e3a22', night: 1 } },
];
function shroom(side, k) {
  const v = grid(16, 16, 16), M = palette(v, SHROOM_PAL[side]);
  const stem = (x, y, h, lean, r = 1.2) => bay(v, [x, y, 0], [x + lean, y, h], r, (px, py, pz) => (pz < 1.5 ? M.stemD : M.stem), r * 0.7);
  const capF = (x, y, z, rx, rz) => blob(v, x, y, z, rx, rx, rz, (px, py, pz, cx, cy, cz) => (hh(cx, cy, cz, 4) < 0.22 ? M.capD : M.cap), 0, 0);
  const capM = (x, y, z, rx, rz) => blob(v, x, y, z, rx, rx, rz, (px, py, pz, cx, cy, cz) => (hh(cx, cy, cz, 6) < 0.3 ? M.capD : M.cap), 0.15, 1);
  if (!side) {
    if (k === 0) { stem(6, 8, 11, -0.5); capF(5.5, 8, 11.6, 3.6, 1.7); stem(10.5, 7, 7, 0.5, 1); capF(11, 7, 7.7, 3, 1.5); stem(11.6, 11.4, 3, 1.2, 0.9); blob(v, 12.8, 11.4, 4, 1.5, 1.5, 1.5, M.stem, 0, 0); }
    else { stem(8, 8, 9, 0.4); capF(8.4, 8, 9.6, 3.4, 1.6); stem(4, 10, 5, -0.4, 0.9); capF(3.8, 10, 5.6, 2.2, 1.2); }
  } else if (k === 0) { stem(7, 8, 8, 0, 1.2); capM(7, 8, 10.5, 2.6, 4.4); stem(11.5, 7, 5, 0.3, 1); capM(11.8, 7, 7, 2, 3.2); stem(4.5, 11.5, 3, 0, 0.9); capM(4.5, 11.5, 4.6, 1.5, 2.4); }
  else { stem(8, 8, 9, 0.5, 1.3); capM(8.5, 8, 11.6, 2.8, 4.8); stem(11.5, 10.5, 4, 0, 0.9); capM(11.5, 10.5, 5.8, 1.7, 2.6); }
  return v;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// fallen log: long bark log with a branch stub and a hollow cut end (Dire = pale bleached, Radiant also carries moss)
const LOG_PAL = [
  { bark: '#5a5046', barkD: '#3e362f', barkL: '#76695a', inner: '#2a231f', cut: '#8a7a60', moss: '#587044' },
  { bark: '#b4aa96', barkD: '#8a8070', barkL: '#cfc6b0', inner: '#3a342c', cut: '#d8cfb4', moss: '#9a9a78' },
];
function logTube(v, M, x0, x1, yc, zc, r) {
  v.each(x0, yc - r, 0, x1, yc + r, zc + r, (px, py, pz, x, y, z) => {
    const d = Math.hypot(py - yc, pz - zc); if (d > r) return;
    const e = x >= x1 - 1;   // cut end: pale ring, hollow dark core
    if (e) return d < r - 1.1 ? M.inner : M.cut;
    if (x <= x0 + 1 && d < r - 1.3) return M.inner;
    return pz < zc - r * 0.4 ? M.barkD : hh(x >> 1, y, z, 3) < 0.2 ? M.barkL : M.bark;
  });
}
function log(side, k) {
  const v = grid(28, 12, 9), M = palette(v, LOG_PAL[side]);
  if (k === 0) {
    logTube(v, M, 3, 25, 6, 2.6, 2.6); bay(v, [10, 6, 4.5], [11.6, 6.6, 7.6], 0.9, M.bark, 0.45); bay(v, [18, 4.6, 1.8], [18.6, 2.4, 1.2], 0.7, M.barkD, 0.5);
    for (let x = 6; x < 22; x++) if (hh(x, 1, 1, 12) < (side ? 0.1 : 0.34)) for (let z = 8; z >= 0; z--) if (v.get(x, 6, z) && v.get(x, 6, z) !== M.inner) { v.set(x, 6, z, M.moss); break; }
  } else {
    logTube(v, M, 2, 13, 5.4, 2.6, 2.6); logTube(v, M, 15, 26, 6.6, 2.6, 2.6);
    [[13, 5, 5], [14, 6, 6], [13, 7, 5.5], [14, 5, 4.5]].forEach(([x, y, h]) => { if (!v.get(x, y, 0)) bay(v, [x, y, 1.5], [x, y, h], 0.5, M.barkL, 0.3); });
    bay(v, [20, 6.6, 4.5], [21.4, 6.6, 7.4], 0.8, M.bark, 0.4);
    for (let x = 5; x < 24; x++) if (hh(x, 2, 1, 12) < (side ? 0.1 : 0.3)) for (let z = 8; z >= 0; z--) if (v.get(x, 6, z) && v.get(x, 6, z) !== M.inner) { v.set(x, 6, z, M.moss); break; }
  }
  return v;
}

// twigs: a litter of dry sticks
const TWIG_PAL = [{ stick: '#6a5238', stickD: '#4a3826' }, { stick: '#5e5046', stickD: '#3c3028' }];
function twigs(side, k) {
  const v = grid(20, 20, 4), M = palette(v, TWIG_PAL[side]), s = (a, b, r = 0.55, m = M.stick) => bay(v, a, b, r, m, r);
  if (k === 0) { s([2.5, 9.5, 0.6], [17, 10.5, 0.6]); s([7.5, 3, 0.6], [8.5, 13, 1.3], 0.55, M.stickD); s([10, 5, 0.6], [16, 8.6, 0.6]); s([14, 10.5, 0.8], [17.5, 14.5, 0.8], 0.5); }
  else { s([3, 7.5, 0.6], [15, 7.5, 0.6]); s([9, 4, 0.6], [10, 15.5, 1.3], 0.55, M.stickD); s([4, 13, 0.6], [11, 13.5, 0.6]); s([12, 9, 0.6], [16.5, 12.6, 0.6], 0.5); s([5, 3, 0.6], [7, 5.4, 0.6], 0.5); }
  return v;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// bones: Radiant = skull + long bones + a rib arch in the grass; Dire = a seated skeleton in a spiked bronze helm behind a round shield, or a bone pile
const BONE_PAL = [
  { bone: '#d9cfb4', boneD: '#a89c80', dark: '#2a2018', helm: '#8a6a3a' },
  { bone: '#cfc6a8', boneD: '#9c906e', dark: '#2a2018', helm: '#a0702e', helmD: '#6a4a24', shield: '#8e7e58', boot: '#4a3226' },
];
const ring = (v, cx, cy, z, rx, ry, m) => v.each(cx - rx, cy - ry, z, cx + rx, cy + ry, z, (px, py) => { const d = ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2; if (d <= 1 && d > 0.38) return m; });
function skull(v, M, cx, cy, z, s = 1, helm = false) {
  blob(v, cx, cy, z + 2 * s, 2.4 * s, 2.2 * s, 2 * s, M.bone, 0.1, 3);
  blob(v, cx, cy - 1.2 * s, z + 0.6 * s, 1.5 * s, 1.5 * s, 1.1 * s, M.bone, 0, 0);   // jaw
  v.set(Math.round(cx - 1 * s), Math.round(cy - 2 * s), Math.round(z + 2 * s), M.dark); v.set(Math.round(cx + 1 * s), Math.round(cy - 2 * s), Math.round(z + 2 * s), M.dark);
  if (helm) { blob(v, cx, cy, z + 3 * s, 2.8 * s, 2.6 * s, 2.1 * s, (px, py, pz) => (pz > z + 3 * s ? M.helm : 0), 0, 0); bay(v, [cx, cy, z + 4.6 * s], [cx, cy, z + 7 * s], 0.6, M.helmD || M.helm, 0.2); }
}
function boneLong(v, M, a, b) { bay(v, a, b, 0.75, M.bone, 0.75); blob(v, a[0], a[1], a[2], 1.2, 1.2, 1, M.bone); blob(v, b[0], b[1], b[2], 1.2, 1.2, 1, M.bone); }
function bones(side, k) {
  const v = grid(24, 24, 18), M = palette(v, BONE_PAL[side]);
  if (!side) {   // skull, two long bones, shape 0 also a rib arch
    skull(v, M, 9, 12, 0.5, 1);
    boneLong(v, M, [11, 5, 1], [20, 9, 1]); boneLong(v, M, [13, 16, 1], [19, 20, 1]);
    if (k === 0) for (let i = 0; i < 3; i++) bay(v, [15 + i * 1.3, 12, 1], [15 + i * 1.3, 12.3, 3.4 - i * 0.4], 0.55, M.bone, 0.5);
  } else if (k === 1) {   // a dropped round shield
    v.each(14, 6, 0, 21, 9, 8, (px, py, pz) => { const d = Math.hypot(px - 17.5, pz - 3.6 - (py - 6) * 0.4); if (d <= 3.6) return d > 2.7 ? M.helmD : M.shield; });
  } else {   // seated skeleton (Dire)
    const J = (x, y, z, rx, ry, rz, m) => blob(v, x, y, z, rx, ry, rz, m, 0, 0);
    J(12, 12.5, 2.4, 3, 2.2, 1.8, M.bone);
    bay(v, [10.4, 11, 1.8], [8.8, 2.8, 1.2], 1, M.bone, 0.9); bay(v, [13.6, 11, 1.8], [15.2, 2.8, 1.2], 1, M.bone, 0.9);
    J(8.6, 2, 1, 1.4, 2.1, 1, M.boot); J(15.4, 2, 1, 1.4, 2.1, 1, M.boot);
    v.each(8, 10, 4, 16, 15, 10, (px, py, pz, x, y, z) => { const d = ((px - 12) / 3.3) ** 2 + ((py - 12.5) / 2.4) ** 2 + ((pz - 7) / 3.4) ** 2; if (d <= 1 && ((z & 1) === 0 || d < 0.2 || (x === 12 && y === 12))) return M.bone; });
    J(12, 12.5, 11.6, 2.5, 2.3, 2.1, M.bone); J(12, 12.5, 12.8, 3, 2.7, 1.7, (px, py, pz) => (pz > 12.2 ? M.helm : M.bone));
    bay(v, [12, 12.5, 14], [12, 12.5, 17], 0.6, M.helmD, 0.2);
    v.set(11, 10, 11, M.dark); v.set(13, 10, 11, M.dark);
    J(8.2, 12.4, 9, 1.9, 1.7, 1.4, M.helm); J(15.8, 12.4, 9, 1.9, 1.7, 1.4, M.helm);
    v.each(7, 8, 3, 17, 9, 11, (px, py, pz) => { const d = Math.hypot(px - 12, pz - 7); if (d <= 4.7) return d > 3.5 ? M.helmD : d < 1.2 ? M.helm : M.shield; });
  }
  return v;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// pillar: Radiant = fluted sandstone column on a stepped plinth with a flared stone capital (whole or broken); Dire = pale slab stack crowned by a dark bone-spine with spikes
const PILLAR_PAL = [
  { shaft: '#b3935f', plinth: '#a1824f', cap: '#a9a99c', chip: '#6e5a3a' },
  { slab: '#bab5a5', slabD: '#8a8576', spine: '#5e5648', spineL: '#8a7c64' },
];
function pillar(side, k) {
  const v = grid(16, 16, 22), M = palette(v, PILLAR_PAL[side]);
  if (!side) {
    chunk(v, { c: [8, 8, 2], h: [3.6, 3.6, 2], cut: 2.9, m: M.plinth }); chunk(v, { c: [8, 8, 4.4], h: [3.1, 3.1, 0.6], cut: 3, m: M.cap });
    if (k === 0) {
      chunk(v, { c: [8, 8, 11], h: [2.2, 2.2, 6.6], cut: 3, m: (px, py, pz, lx, ly) => (Math.abs(lx) > 0.6 && Math.abs(ly) > 0.6 ? M.plinth : M.shaft) });
      lathe(v, 8, 8, 17, [2.4, 4, 4, 3.6], M.cap);
    } else {
      v.each(5, 5, 5, 11, 11, 11, (px, py, pz, x, y, z) => { if (Math.abs(px - 8) <= 2.2 && Math.abs(py - 8) <= 2.2 && z <= 6 + Math.floor(hh(x, y, 0, 3) * 4)) return M.shaft; });
      bay(v, [11.4, 11.6, 1.9], [14.8, 11.4, 1.9], 1.8, M.shaft, 1.8); lathe(v, 3.5, 12, 0, [2, 2.4, 2], M.cap);
    }
    speckle(v, M.chip, 0.08, M.shaft, 5);
  } else {
    chunk(v, { c: [6, 8, 5.5], h: [2, 3, 5.5], cut: 2.7, lean: -0.1, m: M.slab }); chunk(v, { c: [10.5, 8, 4.5], h: [2.2, 3, 4.5], cut: 2.7, lean: 0.1, m: M.slabD }); chunk(v, { c: [8, 5, 2.5], h: [2.4, 1.8, 2.5], cut: 2.5, m: M.slab });
    const top = k === 0 ? 15 : 9;
    bay(v, [8, 8.5, 3], [8, 8.5, top], 1.1, M.spine, 0.9);
    for (let z = 6; z <= top - 1; z += 3) ring(v, 8, 8.5, z, 3.2, 1.8, M.spine);
    const sp = k === 0 ? [[6, 20], [8.5, 21.5], [11, 19]] : [[6.5, 12.5], [10, 11.5]];
    sp.forEach(([x, h]) => bay(v, [8, 8.5, top - 1], [x, 8.5, h], 0.8, M.spineL, 0.2));
    speckle(v, M.slabD, 0.1, M.slab, 4);
  }
  return v;
}

// reed: green blades with brown cattail heads on the tallest (Dire = dry olive)
const REED_PAL = [
  { blade: { c: '#58763a', sway: 1 }, bladeD: { c: '#3f5a2d', sway: 1 }, head: { c: '#6b4020', sway: 0.8 } },
  { blade: { c: '#8a7c3c', sway: 1 }, bladeD: { c: '#665a2c', sway: 1 }, head: { c: '#6a4a26', sway: 0.8 } },
];
const REEDS = [
  [[8, 8, 18, 0, 0], [6, 9, 15, -1, 0], [10, 7, 13, 1, 0.2], [8, 11, 16, 0, 1], [5, 6, 11, -1, -1]],
  [[7, 8, 17, 0.6, 0], [10, 9, 14, 1, 0], [6, 6, 12, -1, -0.4], [9, 6, 15, 0.4, -1], [8, 11, 11, 0, 1]],
];
function reed(side, k) {
  const v = grid(16, 16, 28), M = palette(v, REED_PAL[side]);
  REEDS[k].forEach(([x, y, h, dx, dy], i) => {
    for (let z = 0; z < h; z++) { const f = z / h, ox = Math.round(dx * f * f * 3), oy = Math.round(dy * f * f * 3); v.set(x + ox, y + oy, z, z < 3 ? M.bladeD : M.blade); }
    if (i < 2) { const hx = x + Math.round(dx * 3), hy = y + Math.round(dy * 3), t = h + 4 + i * 2; for (let z = h; z < t; z++) v.set(hx, hy, z, M.bladeD); for (let z = t - 3; z < t; z++) v.set(hx, hy, z + 3 < 28 ? z : 27, M.head); v.set(hx, hy, Math.min(27, t), M.blade); }
  });
  return v;
}

// lily pads (flat discs with a wedge notch) and a flower
const LILY_PAL = [{ pad: '#2f6a44', padL: '#4a8a52', flower: '#d8a0bc', heart: '#f0d070' }, { pad: '#5e6a30', padL: '#7e8a3c', flower: '#c88a58', heart: '#e8c060' }];
function lily(side, k) {
  const v = grid(24, 24, 3), M = palette(v, LILY_PAL[side]);
  const pad = (cx, cy, r, a) => v.each(cx - r, cy - r, 0, cx + r, cy + r, 0, (px, py, pz, x, y) => {
    const dx = px - cx, dy = py - cy, d = Math.hypot(dx, dy); if (d > r) return;
    const an = Math.atan2(dy, dx), da = Math.abs(((an - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI); if (da < 0.3 && d > 0.8) return;
    return hh(x, y, 0, 4) < 0.25 ? M.padL : M.pad;
  });
  if (k === 0) { pad(9, 10, 4.2, 0.8); pad(15.5, 13.5, 3.2, 3.9); blob(v, 15.5, 13.5, 1.3, 1.2, 1.2, 1, M.flower, 0, 0); v.set(15, 13, 2, M.heart); }
  else { pad(11, 12, 3.6, 2.2); pad(16.5, 7.5, 2.6, 5.2); pad(6.5, 16.5, 2.6, 0.3); }
  return v;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// cargo: base props (barrels, crates, wicker baskets, sacks, clay pots)
const CARGO_PAL = [
  { wood: '#7a5a38', woodD: '#4e3a28', iron: '#4a4c54', wick: '#9a7a4e', wickD: '#7a5c38', sack: '#b2a07a', dark: '#2a2018', cloth: '#6a7a8a' },
  { wood: '#5a3e30', woodD: '#3a281e', iron: '#3c3438', wick: '#7e5e40', wickD: '#5e4430', sack: '#8a6e54', dark: '#241812', cloth: '#8a2c28', clay: '#b86f48', clayD: '#8a4c30', clayL: '#d49068' },
];
function barrel(v, M, cx, cy, z0) {
  lathe(v, cx, cy, z0, [2.3, 2.9, 3.2, 3.2, 3.2, 2.9, 2.3], (k, x, y) => (k === 6 && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < 1.5 ? 0 : k === 5 && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < 1.5 ? M.dark : k === 1 || k === 5 ? M.iron : (x + y + k) % 3 === 0 ? M.woodD : M.wood));
}
function crate(v, M, cx, cy, z0, n = 5, top) {
  const h = n / 2;
  v.each(cx - h, cy - h, z0, cx + h, cy + h, z0 + n - 1, (px, py, pz, x, y, z) => {
    if (Math.abs(px - cx) > h || Math.abs(py - cy) > h) return;
    const ex = (Math.abs(px - cx) > h - 1) + (Math.abs(py - cy) > h - 1) + (z === z0 || z === z0 + n - 1);
    return top && z === z0 + n - 1 ? top : ex >= 2 ? M.woodD : M.wood;
  });
}
function pot(v, M, cx, cy, z0, s = 1) {
  const P = [1.6, 2.6, 3.4, 3.8, 3.8, 3.2, 2.2, 1.6, 1.6, 2.4].map(r => r * s);
  lathe(v, cx, cy, z0, P, (k, x, y) => (k === P.length - 1 && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < 1.2 * s ? 0 : k < 2 ? M.clayD : (x + k) % 4 === 0 ? M.clayL : M.clay));
}
function basket(v, M, cx, cy, z0, s = 1) {
  lathe(v, cx, cy, z0, [3.4, 3.8, 4.1, 4.4, 4.5, 4.6].map(r => r * s), (k, x, y) => (k === 5 && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < 3.2 * s ? 0 : k === 4 && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < 3.2 * s ? M.dark : (x + y + k) & 1 ? M.wick : M.wickD));
  for (const sx of [-1, 1]) bay(v, [cx + sx * 4.2 * s, cy, z0 + 4], [cx + sx * 3.8 * s, cy, z0 + 7.4], 0.55, M.wick, 0.55);
}
function sack(v, M, cx, cy, z0) { blob(v, cx, cy, z0 + 2.6, 2.6, 2.4, 3, M.sack, 0.15, 2); v.set(Math.round(cx), Math.round(cy), z0 + 5, M.woodD); v.set(Math.round(cx), Math.round(cy), z0 + 6, M.woodD); }
function cargo(side, k) {
  const v = grid(24, 24, 14), M = palette(v, CARGO_PAL[side]);
  if (!side) {
    if (k === 0) { barrel(v, M, 8.5, 9.5, 0); crate(v, M, 15.5, 13.5, 0, 5); }
    else if (k === 1) { basket(v, M, 9, 10, 0); sack(v, M, 16, 14.5, 0); basket(v, M, 15.5, 5.5, 0, 0.7); }
    else { barrel(v, M, 8, 8, 0); barrel(v, M, 15.5, 11, 0); crate(v, M, 7, 15, 0, 4); }
  } else if (k === 0) { pot(v, M, 8.5, 9.5, 0); pot(v, M, 15.5, 12.5, 0, 0.7); pot(v, M, 15.5, 5.5, 0, 0.55); }
  else if (k === 1) { barrel(v, M, 8.5, 9.5, 0); crate(v, M, 15.5, 13.5, 0, 5, M.cloth); }
  else { pot(v, M, 8, 8.5, 0, 0.8); basket(v, M, 15, 12.5, 0, 0.8); sack(v, M, 7.5, 16, 0); }
  return v;
}

// banner: a standard on a pole (cloth sways)
const BANNER_PAL = [
  { pole: '#3b3029', cloth: { c: '#2a8f84', sway: 1 }, trim: { c: '#d8b850', sway: 1 }, top: '#d8c060' },
  { pole: '#2e241f', cloth: { c: '#a8322a', sway: 1 }, trim: { c: '#2a1814', sway: 1 }, top: '#6a6a6e' },
];
function banner(side, k) {
  const v = grid(16, 16, 36), M = palette(v, BANNER_PAL[side]);
  bay(v, [8, 8, 0], [8, 8, 30], 0.8, M.pole, 0.8);
  if (!side) blob(v, 8, 8, 31.4, 1.6, 1.6, 1.6, M.top, 0, 0); else bay(v, [8, 8, 29], [8, 8, 35], 1, M.top, 0.2);
  const cloth = (x0, x1, z0, z1, tail) => v.each(x0, 8, z0, x1, 8, z1, (px, py, pz, x, y, z) => {   // swallow-tail cloth; Dire edges are ragged
    const f = (x - x0) / Math.max(1, x1 - x0 - 1), dz = z - z0;
    if (tail && dz < tail * (1 - Math.abs(f - 0.5) * 2) * 0.9 + (side && hh(x, z, 0, 6) < 0.3 ? 1 : 0)) return;
    if (side && dz < 2 && hh(x, z, 0, 5) < 0.4) return;
    return z === z1 || (dz > 4 && dz < 6 && x > x0 && x < x1 - 1) ? M.trim : M.cloth;
  });
  if (k === 0) { cloth(9, 15, 13, 27, 4); if (!side) v.set(12, 8, 21, M.trim); else v.set(12, 8, 20, M.trim); }
  else { bay(v, [3, 8, 27], [13, 8, 27], 0.6, M.pole, 0.6); cloth(3, 6, 15, 26, 3); cloth(10, 13, 15, 26, 3); }
  return v;
}

// ---------------------------------------------------------------------------------------------------------------------------------
/** Spec per voxelised variant: unit = world units per voxel, shapes = number of shape variants, swayH = height (world units) at which wind sway reaches full weight, build(side, shape). */
export const SPECS = {
  ...ROCKS,
  BUSH: { unit: 5, shapes: 2, swayH: 36, build: bush },
  SHROOM: { unit: 3.5, shapes: 2, build: shroom },
  LOG: { unit: 6, shapes: 2, build: log },
  TWIGS: { unit: 3.5, shapes: 2, build: twigs },
  BONES: { unit: 3.5, shapes: 2, build: bones },
  PILLAR: { unit: 5, shapes: 2, build: pillar },
  REED: { unit: 3.5, shapes: 2, swayH: 50, lodMin: 1, build: reed },
  LILY: { unit: 4, shapes: 2, build: lily },
  CARGO: { unit: 4.5, shapes: 3, build: cargo },
  BANNER: { unit: 4, shapes: 2, swayH: 70, build: banner },
};
export const PROP_NAMES = Object.keys(SPECS);

const cache = new Map();
/** Cached Vox of (name, side 0 Radiant / 1 Dire, shape). */
export function buildProp(name, side, shape) {
  const key = name + side + ':' + shape; let v = cache.get(key);
  if (!v) { v = SPECS[name].build(side, shape); cache.set(key, v); }
  return v;
}
/** Shape of an instance from its phase field (ph in 0..2pi, already a uniform random). */
export const shapeOf = (name, ph) => Math.min(SPECS[name].shapes - 1, Math.max(0, Math.floor(ph / 6.2831853 * SPECS[name].shapes)));
/** Instance slot of (name, side, shape): side * shapes + shape. */
export const slotOf = (name, side, shape) => (side ? SPECS[name].shapes : 0) + shape;
