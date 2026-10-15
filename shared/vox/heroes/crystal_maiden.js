// Voxel Crystal Maiden, a chibi of her Dota 2 model (hand-authored): a tall pointed ice-blue hood lined in purple over honey-brown hair parted in
// the middle, falling in two locks to the chest; a white fur mantle whose two lapels curl up beside the hood; a navy bodice with a gold chain
// between two blue gems; long ice-blue conical cuffs with thin gold bands; a short blue skirt with a fur hem over a teal tabard; purple leggings in
// big white fur boots; a blue cape to the floor (purple borders, navy outer edge, fur hem); a dark staff in her right hand with an ice crystal
// head. Signature reads: pointed blue hood + fur lapels framing the face, white fur boots, blue cape bell, the ice crystal (the only glow).
// Grid 40 x 42 x 52 (room for the raised staff), ~42 voxels tall to the hood point, faces -y. Built on the kit.
import { Vox } from '../vox.js';
import { useMat, useIris } from '../mats.js';
import { solve, xfApply, norm3, cross3, add3, mul3, sub3 } from '../rig.js';
import { limb, band, hand, feet, torso, skirt, collar, pauldron, ell, cap, vol, faceWindow, hairShell, decal, stripes } from '../parts.js';

export const META = { rig: 'biped', grid: [40, 42, 52], cx: 20, cy: 20 };
const cx = 20, cy = 20;
const U = 2;   // leg length over the base chibi (as Lina / Invoker)
export const PROP = {
  cx, cy, hipZ: 8 + U, hipX: 2.2, footX: 2.8, ankleY: -0.3, ankleZ: 3.5, thigh: 3.8, shin: 3.4,
  chestZ: 16 + U, shX: 4.4, shY: 0.3, shZ: 18.4 + U, upper: 4.4, fore: 4.4, neckY: 0.3, neckZ: 20.4 + U, headY: -0.4, headZ: 28.4 + U, headTopZ: 35 + U, hairZ: 22 + U,
};
const HZ = PROP.headZ, SKULL = [5.6, 5.2, 6];
// hair fringe bottom per column dx -6..6: parted in the middle (high), sweeping down past the temples; above the eye rows in the eye columns
const FRINGE = [27, 29, 32.4, 33.2, 33.8, 34.4, 34.4, 33.8, 33.2, 32.4, 29, 27, 26].map(z => z + (HZ - 30.4));
const HOLD_R = [-2.8, -2.4, -7.4];   // right hand at her side, gripping the staff upright (reach from the shoulder, torso frame)
const HOLD_L = [[-58, 14], [-34, 36]];

/** Staff direction: pitch = top tilts forward (-y), roll = top tilts out to her right (-x); degrees. */
const staffDir = (pitch, roll) => { const p = pitch * Math.PI / 180, r = roll * Math.PI / 180; return norm3([-Math.sin(r), -Math.sin(p), Math.cos(p) * Math.cos(r)]); };

/** Pose p: a biped rig pose (rig.js) + staff [pitch, roll, below, above] (the shaft through the right hand), trail (cape swept back 0..1), eyes. */
export const rigOf = p => solve('biped', PROP, p).J;

export function build(p = {}) {
  const v = new Vox(40, 42, 52), rig = solve('biped', PROP, { reachR: HOLD_R, armL: HOLD_L, ...p }), J = rig.J, T = rig.T, trail = p.trail || 0;
  const M = {
    skin: useMat(v, 'skin', { ramp: ['#a26a6a', '#e2b09e', '#f8d8c6', '#fff0e4'] }),
    hair: useMat(v, 'hair', { ramp: ['#4a2414', '#8a5428', '#b87c3c', '#e2aa60'] }),
    hairD: useMat(v, 'hairD', { ramp: ['#3a1c10', '#6e4020', '#965e30', '#c0884a'] }),
    blue: useMat(v, 'blue', { ramp: ['#1a2a58', '#28609a', '#3c94c4', '#86ccec'] }),
    lining: useMat(v, 'lining', { ramp: ['#16122c', '#28224a', '#3a3462', '#625c8e'] }),
    border: useMat(v, 'border', { ramp: ['#1e1a38', '#36325a', '#504c76', '#7a76a0'] }),
    navy: useMat(v, 'navy', { ramp: ['#0a0c18', '#121a2a', '#1e2a40', '#384a66'] }),
    teal: useMat(v, 'teal', { ramp: ['#0c1e32', '#184060', '#266489', '#4a90b4'] }),
    legs: useMat(v, 'legs', { ramp: ['#1a1230', '#2c2450', '#3e346a', '#665a96'] }),
    fur: useMat(v, 'fur', { ramp: ['#5a6482', '#a4aec4', '#d4dce8', '#f4f8ff'] }),
    furD: useMat(v, 'furD', { ramp: ['#48506e', '#7e88a4', '#a8b2c8', '#d0d8e8'] }),
    gold: useMat(v, 'gold', { ramp: ['#6a3412', '#b8681a', '#e8a02a', '#ffd270'] }),
    gem: useMat(v, 'gem', { ramp: ['#0c2464', '#1450b0', '#2a8ae6', '#8cd0ff'] }),
    shaft: useMat(v, 'shaft', { ramp: ['#100e1a', '#201e2c', '#343242', '#54525e'] }),
    crys: useMat(v, 'crys', { emit: '#3a8ef0', tier: 'signature', gain: 1 }),
    crysD: useMat(v, 'crysD', { emit: '#1a5ac8', tier: 'signature', gain: 0.9 }),
    crysL: useMat(v, 'crysL', { emit: '#b4ecff', tier: 'signature', gain: 1.1 }),
    lash: useMat(v, 'lash'),
    ...useIris(v, 'ice'),
    pupil: useMat(v, 'pupil', { emit: '#14284a', tier: 'eye' }),
    shine: useMat(v, 'shine', { gain: 0.9 }),
    mouth: useMat(v, 'mouth', { emit: '#9a4050', tier: 'eye' }),
  };

  // ---- cape: one blue bell from the shoulders to the floor behind her (front half open); purple borders, navy outer edges, fur hem.
  // Drawn first: the body overwrites what it covers. Solid behind the body (fewer faces than a thin shell).
  const CZ = 21 + U, lean = 0.06 + trail * 0.26, cc = [cx, cy + 1.4];
  skirt(v, T.torso, {
    c: cc, z0: 0, z1: CZ, zr: CZ, h: CZ, r0: 4.8, dr: 3.6 + trail * 0.6, sy: 0.82, shell: 2, open: 112 - trail * 8, lean, hemH: 1.4,
    floor: phi => 0.6 + trail * 1.6 + (phi < 2 ? (2 - phi) * 1.4 : 0),
  }, M.blue, M.fur);
  vol(v, T.torso, cx - 10, cy - 8, 0, cx + 10, cy + 20, CZ, (px, py, pz, x, y, z) => {
    if (v.get(x, y, z) !== M.blue) return;
    const dx = px - cc[0], dy = (py - cc[1] - lean * (CZ - pz)) / 0.82, phi = Math.acos(Math.max(-1, Math.min(1, -dy / (Math.hypot(dx, dy) || 1))));
    return phi < 1.85 ? M.navy : phi < 2.45 ? M.border : undefined;
  });

  // ---- legs: purple leggings, big white fur boots to the knee (two-tone strands), a blue band + thin gold rim at the top, a pale pointed toe
  for (const k of ['R', 'L']) {
    const f = J['foot' + k], kn = J['knee' + k], hip = J['hip' + k];
    feet(v, f, 'boot', M.fur, { hw: 1.7, front: 3.6, back: 1.4, h: 2.4, tipW: 1 });
    const top = add3(kn, [0, -0.2, 0.4]);
    limb(v, [[f[0], f[1] - 0.3, f[2] + 1.2], top], [2.2, 2.7], (px, py, pz) => (Math.floor(px * 1.3 + pz * 0.25) % 3 === 0 ? M.furD : M.fur));
    v.capsule(top, add3(top, [0, 0, 0.6]), 2.2, M.blue);
    limb(v, [kn, hip], [1.55, 1.7], M.legs);
  }

  // ---- teal tabard down the front between the legs (behind the skirt), then the short blue skirt with a fur hem
  vol(v, T.torso, cx - 2, cy - 4, 2.4, cx + 2, cy - 1.4, 10 + U, (px, py, pz) => {
    const w = 1.5 + (10 + U - pz) * 0.04; if (Math.abs(px - cx) > w || py > cy - 1.8) return;
    return pz < 3.4 ? M.fur : M.teal;
  });
  skirt(v, T.torso, { c: [cx, cy + 0.2], z0: 8 + U - 1.4, z1: 11 + U, zr: 11 + U, h: 4, r0: 3.8, dr: 1.2, sy: 0.82, shell: 1.2, hemH: 1, floor: () => 8 + U - 1.4 }, M.blue, M.fur);

  // ---- bodice: navy, pinched waist, a navy belt with a blue gem buckle in a small gold rim
  torso(v, T.torso, { c: [cx, cy], z0: 10.6 + U, z1: 20.8 + U, r: 6 }, (dx, dy, z) => {
    const rx = 3.1 - Math.max(0, 2.6 - z) * 0.1 + Math.max(0, z - 4) * 0.16, ry = 2.4 + (dy < 0 && z > 5 && z < 8.6 ? 0.5 : 0);
    if ((dx / rx) ** 2 + (dy / ry) ** 2 > 1) return;
    if (z < 1.4 && dy < -1.6 && Math.abs(dx) < 1.4) return Math.abs(dx) < 0.7 && z > 0.3 ? M.gem : M.gold;   // buckle
    return M.navy;
  });
  cap(v, T.torso, [cx, cy + 0.3, 20 + U], [cx, cy + 0.3, 22 + U], 1.4, M.skin);   // neck

  // ---- mantle: navy shoulder cape with blue pauldrons; white fur lapels curling up on both sides of the hood (open in front)
  ell(v, T.torso, [cx, cy + 0.6, 19.6 + U], [6, 4, 2.4], M.navy, (px, py, pz) => pz > 19 + U);
  for (const k of ['R', 'L']) pauldron(v, J['shoulder' + k], [2.5, 2.6, 1.9], M.blue, M.navy, 0.5);
  collar(v, T.torso, {
    c: [cx, cy + 0.8], z0: 19.4 + U, z1: 28 + U, r0: 4.8, r1: 7.2, flare: 0.7, sy: 0.8, th: 1.8, lean: 0.08, open0: 46, open1: 66, spikes: 1, spike: 4.2, phase: 0.5, dip: 2.4,
    fill: (dx, dy) => dy > 2.6,
  }, (px, py, pz, f, inner) => (inner && f < 0.75 ? M.blue : M.fur));
  // gold chain across the chest between two blue gems
  const cz = 20.2 + U;
  for (const s of [-1, 1]) ell(v, T.torso, [cx + s * 3, cy - 2.4, cz], [0.9, 0.7, 0.9], M.gem);
  cap(v, T.torso, [cx - 2.2, cy - 2.6, cz - 0.4], [cx + 2.2, cy - 2.6, cz - 0.4], 0.5, M.gold);

  // ---- arms: navy upper sleeves; ice-blue conical cuffs from the wrist flaring to a point past the elbow, two thin gold bands; pale hands
  for (const k of ['R', 'L']) {
    const sh = J['shoulder' + k], el = J['elbow' + k], hd = J['hand' + k], e = norm3(sub3(el, hd));
    limb(v, [sh, el], [1.15, 1], M.navy);
    const a = add3(hd, mul3(e, 0.7)), b = add3(el, mul3(e, 0.4));
    v.capsule(a, b, 1.15, M.blue, 1.75);
    v.capsule(b, add3(b, mul3(e, 2)), 1.5, M.blue, 0.4);
    for (const t of [0.12, 0.6]) band(v, a, b, t, t + 0.06, 1.3 + t * 0.6, M.gold);
    hand(v, hd, [1.1, 1.1, 1.05], M.skin);
  }

  // ---- head: hair shell parted in the middle + two locks framing the face to the chest; skin carved back into the face window; then the hood
  // (a taller shell with a wider window, purple lining at the rim, a point at the back of the crown) covers everything but the window
  const Th = T.head, [hx, hy, hz] = [cx, cy + PROP.headY, HZ];
  const win = faceWindow({ cx, yCut: hy - 1.4, halfW: 5, fringe: FRINGE });
  const hair = (px, pz) => (pz > hz + 4 ? M.hair : stripes(M.hair, M.hairD, 3, hz + 4)(px, pz));
  hairShell(v, Th, {
    c: [hx, hy + 0.5, hz + 0.5], r: [SKULL[0] + 0.9, SKULL[1] + 0.9, SKULL[2] + 0.8], win, face: { c: [hx, hy, hz], r: SKULL, m: M.skin }, head: [cx, cy],
    curtains: { inner: 4.4, outer: 5.8, outerK: -0.06, zRef: hz, front: -5.6, frontK: -0.08, back: -1, tip: hz - 8.4, tipStep: 0.8, tipX: 4.4, tipK: 1.2, box: [-9, -8, hz - 12, 9, 4, hz + 4] },
  }, hair);
  // hood opening: the front slab above the cheeks, cut deeper toward the chin so the hood never closes in front of the jaw
  const hoodWin = (px, py, pz) => Math.abs(px - cx) < 6.6 && pz < hz + 5.6 && py < hy - 2.6 + Math.max(0, hz - 1 - pz) * 1.4;
  ell(v, Th, [hx, hy + 1.2, hz + 1], [7.3, 7.2, 7.6], (px, py, pz) => (py < hy - 3.4 || (py < hy - 1.6 && pz > hz + 4.6) ? M.lining : M.blue), (px, py, pz) => !hoodWin(px, py, pz));
  cap(v, Th, [hx, hy + 2.4, hz + 6], [hx, hy + 4.6, hz + 10.6], 3.4, M.blue, 0.6);   // hood point, leaning back
  ell(v, Th, [hx, hy - 6.4, hz + 5.8], [0.8, 0.6, 0.8], M.gem);                      // brow gem on the hood rim
  // white fur lapels: from the mantle's front edge curling up and out beside the chin, in front of the hood
  for (const s of [-1, 1]) {
    const P = [[4.4, -3, 19.6 + U], [6.6, -4.4, 23.4 + U], [7.8, -4, 26.8 + U], [8.4, -2.8, 29.2 + U]].map(([x, y, z]) => [cx + s * x, cy + y, z]);
    for (let i = 0; i < 3; i++) cap(v, T.torso, P[i], P[i + 1], [1.9, 1.6, 1.1][i], (px, py, pz) => (Math.floor(pz + px * 0.5) % 3 === 0 ? M.furD : M.fur), [1.6, 1.1, 0.5][i]);
  }

  // ---- face, painted on the front-most voxels (follows the posed head; integer rows: paintFront indexes cells)
  // the rest eye-row centre on the face surface, carried by the head transform (pitch moves the face up / down, not only the head joint)
  const ez0 = Math.round(hz - 3.6), ec = xfApply(Th, [cx, hy - SKULL[1], ez0 + 2]), ox = Math.round(ec[0] - cx), ez = ez0 + Math.round(ec[2] - (ez0 + 2));
  const st = p.eyes || 'open';
  for (const x0 of [cx - 4 + ox, cx + 1 + ox]) {
    if (st === 'open') {
      const rows = [[M.irisL, M.iris, M.irisL], [M.irisD, M.pupil, M.iris], [M.shine, M.pupil, M.irisD], [M.lash, M.lash, M.lash]];
      rows.forEach((row, dz) => row.forEach((m, k) => v.paintFront(x0 + k, ez + dz, m)));
    } else {
      const pts = st === 'x' ? [[0, 3], [2, 3], [1, 2], [0, 1], [2, 1]] : [[0, 2], [1, 1], [2, 2]];
      for (let dz = 0; dz < 4; dz++) for (let k = 0; k < 3; k++) v.paintFront(x0 + k, ez + dz, pts.some(([a, b]) => a === k && b === dz) ? M.lash : M.skin);
    }
  }
  decal(v, [[cx - 1 + ox, ez - 2], [cx + ox, ez - 2]], M.mouth);

  // ---- staff in the right hand (after the face so it never takes the eye paint): dark shaft, gold ferrule + butt knob, ice crystal cluster
  const [sp, sr, lo, hi] = p.staff || [0, 4, 12, 22], d = staffDir(sp, sr), h = J.handR;
  const bot = add3(h, mul3(d, -lo)), top = add3(h, mul3(d, hi));
  v.capsule(bot, top, 0.6, M.shaft);
  v.ellipsoid(...bot, 0.9, 0.9, 0.9, M.gold);
  v.capsule(add3(top, mul3(d, -1.6)), add3(top, mul3(d, 0.2)), 1.1, M.gold);
  const s1 = norm3(Math.abs(d[1]) < 0.9 ? cross3(d, [0, 1, 0]) : cross3(d, [1, 0, 0])), s2 = cross3(d, s1);
  const shard = (dir, len, r) => { const a = add3(top, mul3(dir, 0.6)), b = add3(top, mul3(dir, len)); v.capsule(a, b, r, (px, py, pz, t) => (t > 0.72 ? M.crysL : t < 0.25 ? M.crysD : M.crys), 0.3); };
  for (const [u, w, len, r] of [[0.8, 0.5, 4.4, 1.2], [-0.7, 0.6, 4, 1.15], [0.1, -0.9, 3.8, 1.1], [-0.4, -0.3, 3, 1]]) shard(norm3(add3(add3(d, mul3(s1, u)), mul3(s2, w))), len, r);
  shard(d, 7.4, 1.7);
  return v;
}

const range = n => [...Array(n).keys()];
/** Anims: idle with the staff planted upright at her side, the left hand open; walk with the staff carried tilted forward and the cape trailing;
 * attack = staff swung up and back, then thrust forward crystal-first; cast (Crystal Nova) = staff raised high, then driven forward-down with the
 * left hand out; stunned slump with the staff drooping. */
export const ANIMS = {
  idle: range(4).map(i => {
    const b = [0, 1, 2, 1][i];
    return { bob: -b * 0.2, head: [b * 1.2, 0, 0], armL: [[-58 + b * 3, 14], [-34 + b * 3, 36]] };
  }),
  walk: range(4).map(i => {
    const st = [1, 0, -1, 0][i];
    return {
      bob: [-0.4, 0, -0.4, 0][i], spine: [12, st * 4, 0], head: [-8, -st * 3, 0], footR: [0, -st * 1.6, i === 3 ? 0.4 : 0], footL: [0, st * 1.6, i === 1 ? 0.4 : 0],
      reachR: [-2.4, -2.6 - st, -6.8], armL: [[-56, -10 - st * 12], [-34, 20 - st * 12]], staff: [24, 6, 9, 20], trail: 1,
    };
  }),
  attack: [
    { spine: [-4, -14, 0], head: [0, 8, 0], reachR: [-2.4, 1.6, 0.8], staff: [-26, 10, 9, 18], armL: [[-30, 50], [-10, 70]], footR: [0, 1, 0], trail: 0.2 },
    { bob: -0.5, spine: [12, 10, 0], head: [-8, -6, 0], reachR: [-1.2, -3.6, -1], staff: [38, 4, 13, 11], armL: [[-62, -20], [-40, 0]], footR: [0, -2, 0], footL: [0, 1.4, 0.3], trail: 0.7 },
    { spine: [6, 4, 0], head: [-4, 0, 0], reachR: [-2.6, -3.4, -5], staff: [26, 4, 10, 17], armL: HOLD_L, footR: [0, -0.8, 0], trail: 0.3 },
  ],
  cast: [
    { spine: [-4, 0, 0], head: [-2, 0, 0], reachR: [-2.2, -1, 3.6], staff: [-4, 6, 8, 16], armL: [[10, 40], [30, 50]], trail: 0.1 },
    { spine: [-5, 0, 0], head: [-3, 0, 0], reachR: [-1.6, -1.6, 6.6], staff: [0, 2, 6, 16], armL: [[40, 30], [64, 30]], footL: [0, -0.8, 0], trail: 0.2 },
    { bob: -0.5, spine: [16, 0, 0], head: [-10, 0, 0], reachR: [-1.6, -5, -1.6], staff: [40, 2, 14, 10], armL: [[-10, 70], [-4, 86]], footL: [0, -2, 0], footR: [0, 1.4, 0.3], trail: 0.8 },
  ],
  stunned: range(2).map(i => ({
    bob: -0.6, spine: [6, [3, -3][i], 0], head: [8, [6, -6][i], [4, -4][i]], reachR: [-1.6, -1, -8.2], staff: [-8, 8, 10, 20], armL: [[-80, 8], [-84, 14]], eyes: 'x',
  })),
};

/** HUD portrait framing (tools/vox/portrait.mjs): idle, the face under the hood in the upper third. */
export const PORTRAIT = { pose: ANIMS.idle[0], center: [cx, cy, 30.6], scale: 1.15, fov: 24, sig: '#5ab0f0', face: [4, 11, 24, 24] };
