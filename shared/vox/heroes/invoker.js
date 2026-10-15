// Voxel Invoker, a chibi of his Dota 2 model (hand-authored): a bald, pointed-eared head framed by a tall spiky crimson-magenta collar that flares
// up and back above the head; gold spiked pauldrons; orange-gold sleeves, open hands held in front (conjuring); a cream plastron with gold bands
// and a gold button strip; a huge cream coat-cape from the shoulders to the floor, open in front over a dark purple-black robe, gold trim on every
// edge; black boots. Signature reads: crimson collar fan around a bald head, cream cape bell silhouette, gold + orange arms in front, dark robe
// split. The orbs are FX (client/src/render/fx/status.js), not voxels. Grid 40 x 40 x 48, ~44 voxels tall to the collar points, faces -y.
import { Vox } from '../vox.js';
import { useMat } from '../mats.js';
import { solve } from '../rig.js';
import { limb, band, hand, feet, torso, skirt, collar, pauldron, ell, cap, vol, eyes, mouth, decal } from '../parts.js';

export const META = { rig: 'biped', grid: [40, 40, 48], cx: 20, cy: 17 };
const cx = 20, cy = 17;
const U = 2;   // leg length over the base chibi (as Lina)
export const PROP = {
  cx, cy, hipZ: 8 + U, hipX: 2.4, footX: 2.8, ankleY: -0.3, ankleZ: 3.5, thigh: 3.8, shin: 3.4,
  chestZ: 16 + U, shX: 4.8, shY: 0.4, shZ: 18.6 + U, upper: 4.6, fore: 4.8, neckY: 0.3, neckZ: 20.6 + U, headY: -0.6, headZ: 28.4 + U, headTopZ: 35.6 + U, hairZ: 22 + U,
};
const SKULL = [5.8, 5.8, 6.8];
const HOLD = { R: [[-58, 34], [14, 70]], L: [[-66, 24], [-4, 76]] };   // both hands in front of the chest, open (the conjuring idle)

/** Pose p: a biped rig pose (rig.js) + trail (coat swept back 0..1), eyes. */
export const rigOf = p => solve('biped', PROP, p).J;

export function build(p = {}) {
  const v = new Vox(40, 40, 48), rig = solve('biped', PROP, p), J = rig.J, T = rig.T, trail = p.trail || 0;
  const M = {
    skin: useMat(v, 'skin', { ramp: ['#9a5a4c', '#d29a7e', '#f0c2a2', '#ffe2c8'] }),
    skinD: useMat(v, 'skinD', { ramp: ['#7a3e3a', '#a8664e', '#c8866a', '#e8aa88'] }),
    coat: useMat(v, 'coat', { ramp: ['#4c4240', '#8e8668', '#b6b08e', '#dedabc'] }),
    coatD: useMat(v, 'coatD', { ramp: ['#3a3036', '#6e6650', '#948c6c', '#bcb692'] }),
    robe: useMat(v, 'robe', { ramp: ['#100816', '#22142a', '#36223a', '#523a54'] }),
    collar: useMat(v, 'collar', { ramp: ['#2e0420', '#740a3e', '#a01c54', '#c84478'] }),
    collarL: useMat(v, 'collarL', { ramp: ['#3a0626', '#8a1448', '#b82c62', '#e05a88'] }),
    hair: useMat(v, 'hair', { ramp: ['#4a2a1c', '#8a6034', '#b48a4e', '#dcb874'] }),
    hairD: useMat(v, 'hairD', { ramp: ['#3a2018', '#6e4828', '#94703e', '#bc9a5e'] }),
    gold: useMat(v, 'gold', { ramp: ['#5e2c10', '#b06c18', '#e09e2a', '#ffd470'] }),
    sleeve: useMat(v, 'sleeve', { ramp: ['#5a2410', '#b4600e', '#e08c1c', '#ffc056'] }),
    boot: useMat(v, 'boot', { ramp: ['#0c0810', '#1e1420', '#32242e', '#4e3a42'] }),
    lash: useMat(v, 'lash'),
    pupil: useMat(v, 'pupil', { emit: '#3a1a10', tier: 'eye' }),
    shine: useMat(v, 'shine', { gain: 0.9 }),
    mouth: useMat(v, 'mouth', { emit: '#7a2a30', tier: 'eye' }),
  };

  // ---- legs: dark trousers, black boots with a gold sole edge (mostly under the robe; the boots show at the hem)
  for (const k of ['R', 'L']) {
    const f = J['foot' + k];
    feet(v, f, 'boot', (px, py, pz) => (pz < f[2] + 1 ? M.gold : M.boot), { hw: 1.8, front: 3.4, back: 1.6, h: 3.4 });
    limb(v, [J['ankle' + k], J['knee' + k], J['hip' + k]], [1.5, 1.6, 1.7], M.robe);
  }
  // ---- coat: one cream cape-coat from the shoulders to the floor; closed below the waist except a front split over the dark robe, opening
  // wide over the chest (lapels, arms free); gold hem + split edges, the back trailing. First the robe that fills the split (flat front, a gold
  // strip down the middle; the coat overwrites the rest), then the coat, then the chest inside the lapels.
  // the coat hangs: it takes only a fraction of the spine pitch (no yaw / roll), so a lunge or stoop never tilts the whole bell (and its stairs)
  const lean = 0.16 + trail * 0.2, W = 13 + U, SH = 21 + U;
  vol(v, T.torso, cx - 7, cy - 5, 1.2, cx + 7, cy + 3, W, (px, py, pz) => {
    const dz = W - pz; if (Math.abs(px - cx) > 3.4 + dz * 0.22 || py < cy - 3.2 + lean * dz) return;
    return Math.abs(px - cx) < 0.7 ? M.gold : M.robe;
  });
  skirt(v, T.torso, {
    c: [cx, cy + 0.8], z0: 0, z1: SH, zr: SH, h: SH, r0: 7.6, dr: 3 + trail * 0.6, sy: 0.72 + trail * 0.1, shell: 3.4,
    open: pz => (pz < W - 1 ? 32 - trail * 6 : Math.min(96, 32 - trail * 6 + (pz - W + 1) * 14)), edge: 4, lean, hemH: 1.2, inner: M.robe,
    floor: phi => { const u = phi / Math.PI; return u < 0.3 ? 2.2 - u * 4 : 0.2 + trail * 1.4 + (u > 0.85 ? 0.8 : 0); },
  }, M.coat, M.gold);
  v.each(0, 0, W + 0.5, v.X, v.Y, v.Z, (px, py, pz, x, y, z) => (v.get(x, y, z) === M.robe ? M.coatD : undefined));   // lapel lining above the waist
  // ---- chest: cream plastron with gold bands, a gold strip down the middle, dark sash at the waist with a gold buckle
  torso(v, T.torso, { c: [cx, cy], z0: 11.6 + U, z1: 21.4 + U, r: 6 }, (dx, dy, z, px, py, pz) => {
    const rx = 3.4 + Math.min(1, z / 6) * 1.2, ry = 2.7 + (dy < 0 && z > 3 && z < 8 ? 0.4 : 0);
    if ((dx / rx) ** 2 + (dy / ry) ** 2 > 1) return;
    if (z < 1.6) return Math.abs(dx) < 1.1 && dy < 0 ? M.gold : M.robe;     // sash + buckle
    if (dy < -1) {
      if (Math.abs(dx) < 0.7) return M.gold;                                        // centre strip
      if (z > 2.6 && Math.floor(z - 2.6) % 4 === 0) return M.gold;                  // plastron bands
    }
    return M.coat;
  });
  // neck: skin with a gold gorget ring under the collar
  cap(v, T.torso, [cx, cy + 0.3, 20.6 + U], [cx, cy + 0.3, 22.6 + U], 1.6, M.skin);
  cap(v, T.torso, [cx, cy + 0.3, 20.8 + U], [cx, cy + 0.3, 21.6 + U], 2.4, M.gold);

  // ---- the collar: a tall fan flaring up and back around the head, spiky points; crimson-magenta inside (the front read), cream + gold outside
  collar(v, T.torso, {
    c: [cx, cy + 2.2], z0: 20.4 + U, z1: 39 + U, r0: 4.4, r1: 12.6, flare: 0.95, sy: 0.8, th: 4, lean: 0.12,
    open0: 62, open1: 86, spikes: 2, spike: 4.2, fill: (dx, dy) => dy > 3.4,
  }, (px, py, pz, f, inner) => (inner ? (f > 0.88 ? M.collarL : M.collar) : f > 0.86 ? M.gold : M.coat));

  // ---- arms: orange-gold sleeves with gold cuffs, open hands; gold spiked pauldrons on top
  for (const k of ['R', 'L']) {
    const sh = J['shoulder' + k], el = J['elbow' + k], hd = J['hand' + k];
    limb(v, [sh, el], [1.45, 1.25], M.sleeve);
    v.capsule(el, hd, 1.2, (px, py, pz, t) => (t > 0.68 ? M.gold : M.sleeve), 1.3);
    band(v, el, hd, 0.0, 0.1, 1.35, M.gold);
    hand(v, hd, [1.35, 1.35, 1.2], M.skin);
  }
  for (const [k, s] of [['R', -1], ['L', 1]]) {
    const sh = J['shoulder' + k], c = [sh[0], sh[1], sh[2] + 0.6];
    pauldron(v, sh, [2.9, 2.9, 2.3], M.gold, M.gold, 0.6);
    for (const [ox, oy, oz] of [[2.4, -0.8, 3.4], [3.6, 1, 1.6]]) v.capsule(c, [c[0] + s * ox, c[1] + oy, c[2] + oz], 1, M.gold, 0.35);
  }

  // ---- head: high bald forehead, light-brown hair slicked back from a receding line over the crown, small pointed elf ears; posed by the head
  const Th = T.head, [hx, hy, hz] = [cx, cy + PROP.headY, PROP.headZ];
  ell(v, Th, [hx, hy, hz], SKULL, (px, py, pz) => (py > hy + 2.2 - (pz - hz) * 0.62 ? (Math.floor(px) % 3 === 0 ? M.hairD : M.hair) : M.skin));
  ell(v, Th, [hx, hy + 0.2, hz - 4.6], [3.8, 4.4, 3.4], M.skin);   // long narrow jaw
  for (const s of [-1, 1]) cap(v, Th, [hx + s * 5.6, hy + 0.8, hz - 0.8], [hx + s * 7.8, hy + 2, hz + 1.8], 1.1, M.skin, 0.35);

  // ---- face, painted on the front-most voxels (follows the posed head): stern brow, small dark eyes, a thin mouth
  const hc = J.head, ox = Math.round(hc[0] - cx), oz = Math.round(hc[2] - hz), ez = Math.round(hz - 2) + oz;   // integer rows (paintFront indexes cells)
  decal(v, [[cx - 4 + ox, ez + 2], [cx - 3 + ox, ez + 2], [cx - 2 + ox, ez + 2], [cx + 1 + ox, ez + 2], [cx + 2 + ox, ez + 2], [cx + 3 + ox, ez + 2]], M.skinD);
  eyes(v, { at: [[cx - 4 + ox], [cx + 2 + ox]], z: ez, style: 'dot', state: p.eyes }, M);
  decal(v, [[cx + ox - 1, ez - 3], [cx + ox, ez - 3]], M.skinD);   // nose shadow
  mouth(v, [[cx - 1 + ox, ez - 5], [cx + ox, ez - 5]], M.mouth);
  return v;
}

const range = n => [...Array(n).keys()];
const sw = (a, d) => a.map(([el, hd]) => [el + d, hd]);
/** Anims: idle with both hands conjuring in front; walk leaning in, coat trailing; attack = right hand drawn back then flung forward (the orb
 * bolt); cast = both hands raised together, then thrust forward (Invoke); stunned slump. */
export const ANIMS = {
  idle: range(4).map(i => {
    const b = [0, 1, 2, 1][i];
    return { bob: -b * 0.2, armR: sw(HOLD.R, b * 3), armL: sw(HOLD.L, -b * 2), head: [b * 1.2, 0, 0] };
  }),
  walk: range(4).map(i => {
    const st = [1, 0, -1, 0][i], R = [[-58, -10], [-30, 30]], L = [[-58, -10], [-30, 30]];
    return {
      bob: [-0.4, 0, -0.4, 0][i], spine: [12, st * 4, 0], head: [-8, -st * 3, 0], footR: [0, -st * 1.6, i === 3 ? 0.4 : 0], footL: [0, st * 1.6, i === 1 ? 0.4 : 0],
      armR: sw(R, st * 6), armL: sw(L, -st * 6), trail: 1,
    };
  }),
  attack: [
    { spine: [-4, -16, 0], head: [-2, 8, 0], armR: [[20, -20], [50, 10]], armL: HOLD.L, footR: [0, 1, 0], trail: 0.2 },
    { bob: -0.5, spine: [14, 12, 0], head: [-10, -6, 0], armR: [[6, 78], [4, 88]], armL: [[-60, 10], [-30, 40]], footR: [0, -2, 0], footL: [0, 1.4, 0.3], trail: 0.7 },
    { spine: [6, 4, 0], head: [-4, 0, 0], armR: [[-30, 50], [-6, 70]], armL: HOLD.L, footR: [0, -0.8, 0], trail: 0.3 },
  ],
  cast: [
    { spine: [-6, 0, 0], head: [-6, 0, 0], armR: [[30, 50], [60, 70]], armL: [[30, 50], [60, 70]], trail: 0.1 },
    { spine: [-10, 0, 0], head: [-12, 0, 0], armR: [[56, 30], [76, 40]], armL: [[56, 30], [76, 40]], footL: [0, -0.8, 0], trail: 0.2 },
    { bob: -0.5, spine: [16, 0, 0], head: [-10, 0, 0], armR: [[8, 70], [2, 86]], armL: [[8, 70], [2, 86]], footL: [0, -2, 0], footR: [0, 1.4, 0.3], trail: 0.8 },
  ],
  stunned: range(2).map(i => ({
    bob: -0.6, spine: [6, [3, -3][i], 0], head: [8, [6, -6][i], [4, -4][i]], armR: [[-80, 8], [-84, 14]], armL: [[-80, 8], [-84, 14]], eyes: 'x',
  })),
};

/** HUD portrait framing (tools/vox/portrait.mjs): idle, face in the upper third with the collar fan behind it. */
export const PORTRAIT = { pose: ANIMS.idle[0], center: [cx, cy, 30.4], scale: 1.15, fov: 24, sig: '#c8285e', face: [4, 11, 24, 24] };
