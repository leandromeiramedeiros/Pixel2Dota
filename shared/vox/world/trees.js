// Voxel map trees (docs/VOXEL.md, batch 5): hand-authored chibi reads of the Dota 2 trees, world density (8.4 u / voxel). Browser-safe, no three.
// Radiant = leafy (spruce pines, round oaks, bamboo); Dire = dead, gnarly, bare (spiky, moss-hung, tall hooked). One stump per side for cut trees.
// Each model = { META { rig: 'static', grid, cx, cy }, build() -> Vox, ANIMS { idle: [{}] }, side } (the registry contract, not registered: props are not units);
// drawn by client/src/render/trees3d.js (greedy-meshed, instanced, two LODs). treeModel(name, side, hash) picks the model of a map tree.
// Material flags: leaf (foliage: trees3d.js shades it per voxel in the shader, sky-lit tops brighter), thin (kept by the LOD downsample).
import { Vox } from '../vox.js';
import { ramp } from '../mats.js';

const H = (x, y, z) => { let h = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791); h = Math.imul(h ^ (h >>> 13), 0x5bd1e995); return ((h ^ (h >>> 15)) >>> 0) / 4294967296; };
const M = (base, o = {}) => ({ ramp: ramp(base), ...o });

/** Tree palette: lit materials, the game uses ramp[1] (base) as albedo. */
export const TREE_MATS = {
  // Radiant
  bark: M('#7a5638', { thin: true }), barkD: M('#5a3e28', { thin: true }),
  oakBark: M('#847a68', { thin: true }), oakBarkD: M('#625a4c', { thin: true }),
  pineD: M('#2a6448', { leaf: true }), pine: M('#3a845a', { leaf: true }), pineL: M('#4a9466', { leaf: true }),
  oakD: M('#3e7a40', { leaf: true }), oak: M('#58a04a', { leaf: true }),
  bamD: M('#5e7e2e', { leaf: true }), bam: M('#7ea23a', { leaf: true }),
  stalk: M('#9a9a52', { thin: true }), stalkN: M('#6e7038', { thin: true }),
  cut: M('#b0946a'), cutD: M('#8a6e4c'),
  // Dire
  dBark: M('#6e6250', { thin: true }), dBarkD: M('#52483a', { thin: true }), dTip: M('#3c342c', { thin: true }), dBase: M('#8e8a70', { thin: true }),
  moss: M('#727a40', { thin: true }), mossD: M('#566030', { thin: true }),
  dead: M('#8e8a82', { thin: true }), deadD: M('#66625c', { thin: true }), deadL: M('#b4b0a6', { thin: true }),
};

function make(X, Y, Z) {
  const v = new Vox(X, Y, Z), m = {};
  for (const k in TREE_MATS) m[k] = v.mat(k, TREE_MATS[k]);
  return { v, m };
}

/** Root flare: n short roots radiating at the foot (cx, cy). */
function roots(v, cx, cy, n, len, r, mat, a0 = 0.4) {
  for (let k = 0; k < n; k++) {
    const a = a0 + k * Math.PI * 2 / n;
    v.capsule([cx, cy, 1.2], [cx + Math.cos(a) * len, cy + Math.sin(a) * len, 0.5], r, mat, r * 0.45);
  }
}

/** Stacked drooping skirts of a spruce: tiers [zBase, height, radius]; star-notched outline (needle clumps). */
function spruce(v, m, cx, cy, tiers, notch = 0.13) {
  tiers.forEach(([zb, h, r], k) => {
    v.each(cx - r - 1, cy - r - 1, zb, cx + r + 1, cy + r + 1, zb + h, (px, py, pz) => {
      const t = (pz - zb) / h; if (t < 0 || t > 1) return;
      const dx = px - cx, dy = py - cy, a = Math.atan2(dy, dx), d = Math.hypot(dx, dy);
      const rr = r * Math.pow(1 - t, 0.9) * (1 + notch * Math.cos(6 * a + k * 1.7)) + 0.35;
      if (d > rr) return;
      return pz - zb < 1 ? m.pineD : t > 0.55 && d < 2 ? m.pineL : m.pine;
    });
  });
}

/** A lumpy leaf clump (ellipsoid with a hashed bumpy surface). */
function clump(v, c, r, mat, seed = 0) {
  v.each(c[0] - r[0] - 1, c[1] - r[1] - 1, c[2] - r[2] - 1, c[0] + r[0] + 1, c[1] + r[1] + 1, c[2] + r[2] + 1, (px, py, pz, x, y, z) => {
    const d = ((px - c[0]) / r[0]) ** 2 + ((py - c[1]) / r[1]) ** 2 + ((pz - c[2]) / r[2]) ** 2;
    const bump = 0.84 + 0.3 * H(x >> 1, y >> 1, (z >> 1) + seed);
    if (d <= bump) return mat;
  });
}

/** Gnarled limb: capsule chain through pts, radius r0 -> r1 along the chain, material by fraction (base, mid, tip). */
function limb(v, pts, r0, r1, mats) {
  const n = pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = r0 + (r1 - r0) * i / n, b = r0 + (r1 - r0) * (i + 1) / n, f = (i + 0.5) / n;
    v.capsule(pts[i], pts[i + 1], a, f > 0.75 && mats[2] ? mats[2] : f > 0.35 && mats[1] ? mats[1] : mats[0], b);
  }
}
/** Moss drapes: hang strands of length len below each point (only into empty cells). */
function drape(v, pts, mat, matD) {
  for (const [x, y, z, len] of pts) for (let k = 1; k <= len; k++) { const zz = Math.round(z) - k; if (zz < 2) break; if (!v.get(Math.round(x), Math.round(y), zz)) v.set(Math.round(x), Math.round(y), zz, k > len * 0.6 ? matD : mat); }
}

const model = (grid, cx, cy, side, fn) => ({ META: { rig: 'static', grid, cx, cy }, build: fn, ANIMS: { idle: [{}] }, side });

// ---------------------------------------------------------------- Radiant
/** Tall slim spruce (tree_pine_01): six drooping skirts, short bare trunk. */
const pineA = model([24, 24, 38], 12, 12, 0, () => {
  const { v, m } = make(24, 24, 38), cx = 12, cy = 12;
  v.capsule([cx, cy, 0], [cx, cy, 30], 1.9, m.bark, 1.1);
  roots(v, cx, cy, 4, 3.4, 1.2, m.barkD);
  spruce(v, m, cx, cy, [[5, 11, 8.6], [10, 10, 7.2], [15, 9, 6], [20, 8, 4.8], [25, 7, 3.4], [29, 7, 2.1]]);
  return v;
});
/** Fuller, shorter spruce (tree_pine_02 / 03): four wide skirts. */
const pineB = model([26, 26, 34], 13, 13, 0, () => {
  const { v, m } = make(26, 26, 34), cx = 13, cy = 13;
  v.capsule([cx, cy, 0], [cx, cy, 24], 2.1, m.bark, 1.2);
  roots(v, cx, cy, 5, 3.6, 1.2, m.barkD, 1.1);
  spruce(v, m, cx, cy, [[4, 11, 9.8], [10, 10, 8], [16, 9, 6], [22, 9, 3.8]], 0.16);
  return v;
});
/** Round oak (tree_oak_01 / 01b): grey root-flared trunk, a leafy knot on the trunk, a big lumpy crown of five clumps. */
const oakA = model([30, 30, 32], 15, 15, 0, () => {
  const { v, m } = make(30, 30, 32), cx = 15, cy = 15;
  v.capsule([cx, cy, 0], [cx, cy + 0.5, 15], 2.8, m.oakBark, 2);
  roots(v, cx, cy, 4, 4.6, 1.5, m.oakBarkD, 0.8);
  limb(v, [[cx, cy, 12], [cx - 4, cy - 1, 17]], 1.4, 1, [m.oakBark]);
  limb(v, [[cx, cy, 12], [cx + 4, cy + 2, 18]], 1.4, 1, [m.oakBark]);
  clump(v, [cx, cy + 0.5, 22], [10.5, 10, 7], m.oak, 1);
  clump(v, [cx - 6, cy - 2, 19], [6, 6, 4.5], m.oak, 2);
  clump(v, [cx + 6, cy + 3, 20], [6, 5.5, 4.5], m.oak, 3);
  clump(v, [cx + 1, cy - 5, 25], [6, 5, 4.5], m.oak, 4);
  clump(v, [cx - 2, cy + 5, 26], [5, 5, 4], m.oak, 5);
  clump(v, [cx + 1, cy - 2.5, 8], [3, 2.4, 2.2], m.oak, 6);
  return v;
});
/** Taller oak (tree_oak_02): longer trunk, a two-lobed crown leaning one way. */
const oakB = model([28, 28, 34], 14, 14, 0, () => {
  const { v, m } = make(28, 28, 34), cx = 14, cy = 14;
  v.capsule([cx, cy, 0], [cx + 1, cy, 19], 2.5, m.oakBark, 1.7);
  roots(v, cx, cy, 3, 4.2, 1.4, m.oakBarkD, 0.2);
  limb(v, [[cx + 1, cy, 16], [cx - 4, cy + 1, 22]], 1.3, 0.9, [m.oakBark]);
  clump(v, [cx + 2, cy, 25], [8.5, 8.5, 6.5], m.oak, 7);
  clump(v, [cx - 5, cy + 1, 22], [6, 6.5, 5], m.oak, 8);
  clump(v, [cx + 3, cy - 3, 29], [5, 5, 3.6], m.oak, 9);
  return v;
});
/** Bamboo clump (tree_bamboo_01 / 02): four jointed stalks under a tall fluffy column of yellow-green leaves. */
const bamboo = model([20, 20, 38], 10, 10, 0, () => {
  const { v, m } = make(20, 20, 38), cx = 10, cy = 10;
  const st = [[-2, -1, 34], [2, 0, 36], [0, 2.5, 31], [-1, -3, 28]];
  for (const [dx, dy, top] of st) v.capsule([cx + dx, cy + dy, 0], [cx + dx * 1.4, cy + dy * 1.4, top], 0.75, (px, py, pz) => (Math.floor(pz) % 6 === 5 ? m.stalkN : m.stalk));
  clump(v, [cx, cy, 22], [6, 6, 10], m.bam, 11);
  clump(v, [cx + 1.5, cy, 31], [4.5, 4.5, 5.5], m.bam, 12);
  clump(v, [cx - 2, cy - 1, 13], [4, 4, 4], m.bam, 13);
  clump(v, [cx + 2, cy + 2, 15], [3.5, 3.5, 3.5], m.bam, 14);
  return v;
});
/** Cut Radiant tree: wide root-flared stump, pale cut ring around a rotten hollow, jagged rim. */
const stumpR = model([14, 14, 8], 7, 7, 0, () => {
  const { v, m } = make(14, 14, 8), cx = 7, cy = 7;
  v.each(1, 1, 0, 13, 13, 6, (px, py, pz, x, y, z) => {
    const d = Math.hypot(px - cx, py - cy), r = 3.6 + (pz < 1 ? 1 : 0), top = 3.5 + (H(x, y, 3) > 0.7 ? 1 : 0);
    if (d > r || pz > top + 0.5) return;
    if (d < 1.6 && pz > 2.5) return;   // hollow
    return pz > top - 0.5 ? (d < 2.4 ? m.cutD : m.cut) : H(x, y, z) > 0.75 ? m.barkD : m.bark;
  });
  roots(v, cx, cy, 3, 5, 1.1, m.barkD, 0.9);
  return v;
});

// ---------------------------------------------------------------- Dire
/** Dead spiky tree (dire_tree004 / 004b): tapering pale-footed trunk forking into thin up-reaching spikes. */
const dire004 = model([22, 22, 36], 11, 11, 1, () => {
  const { v, m } = make(22, 22, 36), cx = 11, cy = 11;
  limb(v, [[cx, cy, 0], [cx + 0.5, cy, 8], [cx - 0.4, cy + 0.4, 16], [cx, cy, 21]], 2.9, 1.3, [m.dBark, m.dBark, m.dBarkD]);
  v.each(cx - 5, cy - 5, 0, cx + 5, cy + 5, 3, (px, py, pz, x, y, z) => (v.get(x, y, z) ? m.dBase : undefined));
  roots(v, cx, cy, 4, 4.2, 1.3, m.dBase, 0.3);
  const br = [[[cx, cy, 17], [cx - 3, cy - 1, 24], [cx - 4, cy - 2, 33]], [[cx, cy, 19], [cx + 3, cy + 1, 26], [cx + 5, cy + 1, 32]], [[cx, cy, 21], [cx, cy + 2, 28], [cx + 1, cy + 3, 34]],
    [[cx, cy, 14], [cx + 4, cy - 2, 19], [cx + 6, cy - 3, 25]], [[cx - 3, cy - 1, 24], [cx - 7, cy + 1, 28]]];
  for (const p of br) limb(v, p, 1.1, 0.55, [m.dBarkD, m.dBarkD, m.dTip]);
  return v;
});
/** Moss-hung dead tree (dire_tree007): thick leaning trunk, crooked arms, ragged moss hanging from them. */
const dire007 = model([28, 28, 36], 14, 14, 1, () => {
  const { v, m } = make(28, 28, 36), cx = 14, cy = 14;
  limb(v, [[cx, cy, 0], [cx + 1, cy, 9], [cx + 0.5, cy + 1, 18], [cx - 0.5, cy + 1, 24]], 3.4, 1.8, [m.dBark, m.dBark, m.dBarkD]);
  v.each(cx - 6, cy - 6, 0, cx + 6, cy + 6, 3, (px, py, pz, x, y, z) => (v.get(x, y, z) ? m.dBase : undefined));
  roots(v, cx, cy, 5, 5, 1.5, m.dBase, 0.7);
  const arms = [[[cx + 1, cy, 15], [cx + 6, cy - 1, 19], [cx + 10, cy - 2, 22], [cx + 11, cy - 3, 26]], [[cx, cy + 1, 19], [cx - 5, cy + 2, 23], [cx - 9, cy + 1, 25], [cx - 11, cy, 29]],
    [[cx - 0.5, cy + 1, 23], [cx + 1, cy + 6, 28], [cx + 2, cy + 8, 33]], [[cx, cy, 22], [cx - 2, cy - 5, 27], [cx - 3, cy - 8, 30]]];
  for (const p of arms) limb(v, p, 1.4, 0.6, [m.dBarkD, m.dBarkD, m.dTip]);
  drape(v, [[cx + 6, cy - 1, 19, 6], [cx + 9, cy - 2, 21, 7], [cx + 7, cy - 1, 20, 4], [cx - 5, cy + 2, 23, 7], [cx - 8, cy + 1, 24, 6], [cx - 6, cy + 2, 23, 4],
    [cx + 1, cy + 5, 27, 6], [cx + 2, cy + 6, 29, 5], [cx - 2, cy - 5, 26, 7], [cx - 1, cy - 4, 26, 4], [cx + 2, cy, 17, 5], [cx - 1, cy + 2, 21, 5]], m.moss, m.mossD);
  return v;
});
/** Tall dead tree (dire_tree008): long leaning trunk, side branches that hook down at the tips, broken stubs. */
const dire008 = model([28, 28, 40], 14, 14, 1, () => {
  const { v, m } = make(28, 28, 40), cx = 14, cy = 14;
  limb(v, [[cx, cy, 0], [cx, cy, 10], [cx + 1, cy + 0.5, 22], [cx + 2, cy + 1, 31], [cx + 2.5, cy + 1, 37]], 3, 0.8, [m.dBark, m.dBark, m.dBarkD]);
  v.each(cx - 6, cy - 6, 0, cx + 6, cy + 6, 3, (px, py, pz, x, y, z) => (v.get(x, y, z) ? m.dBase : undefined));
  roots(v, cx, cy, 4, 4.6, 1.4, m.dBase, 0);
  const br = [[[cx, cy, 14], [cx - 6, cy - 1, 17], [cx - 10, cy - 1, 18], [cx - 11, cy, 15]], [[cx + 1, cy, 20], [cx + 7, cy + 2, 23], [cx + 11, cy + 3, 22], [cx + 12, cy + 3, 19]],
    [[cx + 1.5, cy + 1, 27], [cx - 3, cy + 5, 30], [cx - 6, cy + 7, 29]], [[cx + 2, cy + 1, 31], [cx + 6, cy - 3, 34], [cx + 8, cy - 5, 33], [cx + 9, cy - 5, 30]]];
  for (const p of br) limb(v, p, 1.2, 0.55, [m.dBarkD, m.dBarkD, m.dTip]);
  for (const [z, dx, dy] of [[9, 1, 0], [24, 0, -1], [17, -1, 1]]) v.capsule([cx + dx * 1.5, cy + dy * 1.5, z], [cx + dx * 4, cy + dy * 4, z + 1], 0.8, m.dBarkD, 0.6);
  return v;
});
/** Cut Dire tree: pale splintered stump with a tall jagged spike and a dark fallen branch. */
const stumpD = model([14, 14, 10], 7, 7, 1, () => {
  const { v, m } = make(14, 14, 10), cx = 7, cy = 7;
  v.each(2, 2, 0, 12, 12, 8, (px, py, pz, x, y, z) => {
    const dx = px - cx, dy = py - cy, d = Math.hypot(dx, dy), r = 3.1 + (pz < 1 ? 0.9 : 0);
    const top = 2.5 + Math.max(0, (dx + dy * 0.6) * 1.2) + (H(x, y, 9) > 0.6 ? 1 : 0);   // splinters rise toward +x
    if (d > r - (pz > 3 ? (pz - 3) * 0.35 : 0) || pz > top) return;
    return pz > top - 1 ? m.deadL : H(x, y, z >> 1) > 0.6 ? m.deadD : m.dead;
  });
  v.capsule([1.5, 3, 0.6], [11, 11.5, 1.2], 0.8, m.dTip, 0.6);
  v.capsule([5, 6.5, 0.8], [3, 9.5, 1.8], 0.6, m.dTip, 0.5);
  return v;
});

/** Every tree model; the order is the trees3d.js variant index. */
export const TREES = { pineA, pineB, oakA, oakB, bamboo, stumpR, dire004, dire007, dire008, stumpD };
export const TREE_KEYS = Object.keys(TREES);
/** The Dota reference each model reads as (tools/vox ref short names). */
export const TREE_REF = { pineA: 'prop_tree_pine01_radiant', pineB: 'prop_tree_pine02_radiant', oakA: 'prop_tree_oak01_radiant', oakB: 'prop_tree_oak02_radiant', bamboo: 'prop_tree_bamboo01_radiant',
  stumpR: 'prop_tree_stump_radiant', dire004: 'prop_tree_dire004_dire', dire007: 'prop_tree_dire007_dire', dire008: 'prop_tree_dire008_dire', stumpD: 'prop_tree_stump01_dire' };
export const STUMPS = ['stumpR', 'stumpD'];

// Dota map tree name -> family; each side has its own models per family, so a tree keeps its silhouette class when the art side flips it.
const FAMILY = [[/pine_0?1|cine/, 0], [/pine/, 1], [/oak_0?1/, 2], [/oak/, 3], [/bamboo/, 4], [/dire_tree004/, 5], [/dire_tree007/, 6], [/dire_tree008/, 7]];
const BY_SIDE = [
  ['pineA', 'pineB', 'oakA', 'oakB', 'bamboo', 'pineA', 'oakA', 'pineB'],          // Radiant: dire names map to the nearest leafy silhouette
  ['dire008', 'dire004', 'dire007', 'dire004', 'dire008', 'dire004', 'dire007', 'dire008'],   // Dire: tall pines -> tall dead, oaks -> moss-hung
];
/** Model key of a map tree: Dota model name (t[3]), art side (0 Radiant / 1 Dire, terrainGeo tileSide), hash 0..1 for unnamed trees. */
export function treeModel(name, side, h = 0) {
  const s = side ? 1 : 0;
  for (const [re, f] of FAMILY) if (re.test(name || '')) return BY_SIDE[s][f];
  return BY_SIDE[s][Math.floor(h * 5) % 5];
}
