// Voxel Invoker, a chibi of his Dota 2 model (hand-authored): pointed-eared head with long golden-blond hair swept back from a high widow's peak
// into a mane over the cape; a low crimson-magenta collar fan that frames the head at the sides and dips under the hair at the back; gold spiked
// pauldrons; orange-gold sleeves, open hands held in front (conjuring); a cream plastron with gold bands and a gold button strip; a huge cream
// coat-cape from the shoulders to the floor, open in front over a dark purple-black robe, gold trim on every edge; black boots. Signature reads:
// blond swept-back mane, crimson collar fan, cream cape bell silhouette, gold + orange arms in front, dark robe split. The orbs are FX
// (client/src/render/fx/status.js), not voxels. Grid 40 x 40 x 48, ~38 voxels tall, faces -y.
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
    coat: useMat(v, 'coat', { ramp: ['#6a3e22', '#b88a4a', '#e8c27a', '#fbe2a6'] }),
    coatD: useMat(v, 'coatD', { ramp: ['#4a2a1e', '#8a6038', '#c09a62', '#e2c48a'] }),
    robe: useMat(v, 'robe', { ramp: ['#100816', '#22142a', '#36223a', '#523a54'] }),
    collar: useMat(v, 'collar', { ramp: ['#2e0420', '#740a3e', '#a01c54', '#c84478'] }),
    collarL: useMat(v, 'collarL', { ramp: ['#3a0626', '#8a1448', '#b82c62', '#e05a88'] }),
    hair: useMat(v, 'hair', { ramp: ['#6a3e1e', '#b08038', '#d8aa58', '#f2d488'] }),
    hairL: useMat(v, 'hairL', { ramp: ['#7a4a22', '#c49444', '#e8c070', '#fce4a0'] }),
    hairD: useMat(v, 'hairD', { ramp: ['#4e2c16', '#8a5e2c', '#b08444', '#d4ac68'] }),
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
    c: [cx, cy + 2.2], z0: 20.4 + U, z1: 34 + U, r0: 4.4, r1: 11, flare: 0.8, sy: 0.8, th: 3, lean: 0.12,
    open0: 62, open1: 70, spikes: 1, phase: -0.5, spike: 6, fill: (dx, dy) => dy > 3.4,
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

  // ---- head: skull + long narrow jaw, then the hair: golden blond, parted high in the middle and swept straight back over the crown into a full
  // mane behind the head that falls to the nape (into the collar); strands run front -> back (streaks by x). Pointed elf ears poke through it.
  const Th = T.head, [hx, hy, hz] = [cx, cy + PROP.headY, PROP.headZ];
  ell(v, Th, [hx, hy, hz], SKULL, M.skin);
  ell(v, Th, [hx, hy + 0.2, hz - 4.6], [3.8, 4.4, 3.4], M.skin);   // long narrow jaw
  const strand = (px, py, pz) => { const k = Math.floor((px - hx + 0.5 + Math.max(0, py - hy) * 0.18 * Math.sign(px - hx)) / 2); return [M.hair, M.hairL, M.hair, M.hairD][((k % 4) + 4) % 4]; };
  const line = px => hz + 4.4 - Math.min(3, Math.abs(px - hx) * 0.55);   // hairline: high widow's peak, lower at the temples
  const face = (px, py, pz) => py < hy - 1.2 + Math.max(0, hz - pz) * 0.5 && pz < line(px);   // skin window (forehead, face, in front of the ears)
  const free = (px, py, pz, x, y, z) => { const m = v.get(x, y, z); return !m || m === M.skin; };   // never over the collar: the mane sinks into it
  ell(v, Th, [hx, hy + 0.7, hz + 0.4], [6.3, 6.5, 7.1], strand, (px, py, pz, x, y, z) => !face(px, py, pz) && pz > hz - 3.4 && free(px, py, pz, x, y, z));
  ell(v, Th, [hx, hy + 4, hz - 1.6], [6, 4.2, 6.4], strand, (px, py, pz, x, y, z) => py > hy + 1.5 && free(px, py, pz, x, y, z));   // the mane behind
  // swept-back locks: thick at the crown, tapering to points that flare back past the skull and fall over the collar's back rim (long hair)
  for (const s of [-4.6, -2.3, 0, 2.3, 4.6]) {
    const a = [hx + s * 0.8, hy - 2.6, hz + 5.4 - Math.abs(s) * 0.4], b = [hx + s * 1.2, hy + 9.6 - Math.abs(s) * 0.25, hz - 2.6 - Math.abs(s) * 0.5];
    cap(v, Th, a, b, 2.1, strand, 0.6);
  }
  // the fall: the mane lies over the collar's back rim down to the shoulder blades, pointed tips
  ell(v, Th, [hx, hy + 6.8, hz - 0.6], [5.6, 3.8, 8.2], strand, (px, py, pz) => pz > hz - 7.4 + Math.abs(((px - hx + 40) % 2.4) - 1.2) * 1.6 + Math.abs(px - hx) * 0.35);
  for (const s of [-1, 1]) cap(v, Th, [hx + s * 5.6, hy + 0.8, hz - 0.8], [hx + s * 8.2, hy + 2.2, hz + 2], 1.15, M.skin, 0.35);

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
export const PORTRAIT = { pose: ANIMS.idle[0], center: [cx, cy, 28], scale: 1.3, fov: 24, sig: '#c8285e', face: [4, 11, 24, 24] };
