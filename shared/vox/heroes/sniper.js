// Voxel Sniper (Kardel Sharpeye), a chibi of his Dota 2 model (hand-authored): a squat keen with a big bald pink head, long pointed ears flaring
// out to the sides, a big nose and a long white beard falling over his chest; brass goggles across the brow with a green lens over his right
// eye; a red shirt, dark riveted shoulder pads, a brown belt with yellow pouches, dark brown trousers and bare pink feet; a bright orange-yellow
// tattered cape over the back; a huge long dark rifle (wood stock, scope, muzzle brake, a steel ring) held level at the hip, pointing forward.
// Signature reads: pink bald head + wide pointed ears + white beard; the long rifle at the hip; the orange cape behind; squat stance.
// Grid 48 x 56 x 48 (the barrel reaches far forward), ~38 voxels tall to the crown (ears wider than the shoulders), faces -y.
import { Vox } from '../vox.js';
import { useMat } from '../mats.js';
import { solve, add3, sub3, mul3, norm3, cross3, dot3, apM, aimDir } from '../rig.js';
import { limb, band, hand, feet, torso, pauldron, ell, cap, vol, obox, disc, eyes, decal } from '../parts.js';

export const META = { rig: 'biped', grid: [48, 56, 48], cx: 24, cy: 34 };
const cx = 24, cy = 34;
/** Biped proportions: stubby legs, a round squat body, the big head low on the shoulders. */
export const PROP = {
  cx, cy, hipZ: 10.4, hipX: 3.8, footX: 5.2, ankleY: -0.3, ankleZ: 3.4, thigh: 4, shin: 3.8,
  chestZ: 20, shX: 7, shY: 0.8, shZ: 22, upper: 4.8, fore: 4.6, neckY: -0.8, neckZ: 24, headY: -2, headZ: 31.6, headTopZ: 39, hairZ: 26,
};
const SKULL = [6.6, 6.4, 6.6];
const HOLD = { R: [[-62, 30], [-14, 82]], L: [[-34, 64], [-8, 88]] };   // right hand on the grip at the hip, left hand forward under the barrel
const GUN = [6, 90];                                                   // rifle aim (body frame): level, straight ahead
const hash = (x, y, z) => { const s = Math.sin(x * 12.99 + y * 78.23 + z * 37.71) * 43758.55; return s - Math.floor(s); };

/** Pose p: a biped rig pose (rig.js) + gun ([el, hd] rifle aim, body frame), cape (swept back 0..1), eyes. */
export const rigOf = p => solve('biped', PROP, p).J;

/** The rifle on hand R along d: stock behind the hand, receiver, long barrel, muzzle brake, scope on top, a steel ring on the side. */
function rifle(v, rig, d, M) {
  const h = rig.J.handR, Rt = rig.T.torso && rig.T.torso.R;
  const upW = apM(Rt, [0, 0, 1]), up = norm3(sub3(upW, mul3(d, dot3(upW, d)))), side = norm3(cross3(d, up));
  const at = (t, u = 0, s = 0) => add3(add3(add3(h, mul3(d, t)), mul3(up, u)), mul3(side, s));
  obox(v, at(-5.8, -0.8), at(-0.2, 0.3), side, 1.2, t => 1.9 - t * 0.6, M.wood);              // stock (deep at the butt)
  obox(v, at(-0.6, 0.5), at(4.4, 0.5), side, 1.6, 1.7, M.gunD);                                 // receiver
  v.capsule(at(0.6, -0.8), at(1.4, -2.6), 0.8, M.wood);                                         // pistol grip under the hand
  obox(v, at(4, 0.2), at(9, 0.2), side, 1.8, 1.8, M.wood);                                      // fore-end
  v.capsule(at(4, 0.6), at(16, 0.6), 1.7, M.wood);                                               // barrel
  for (const t of [9.6, 13.2]) band(v, at(t, 0.6), at(t + 0.9, 0.6), 0, 1, 2.1, M.gunD);       // barrel bands
  v.capsule(at(15.4, 0.6), at(17.6, 0.6), 2.3, M.gunD);                                         // muzzle brake
  v.capsule(at(0.4, 3.2), at(5.6, 3.2), 0.9, M.gunD, 1.1);                                      // scope + mounts
  for (const t of [1.4, 4.4]) v.capsule(at(t, 1.8), at(t, 2.6), 0.5, M.brass);
  disc(v, at(5.7, 3.2), d, 1.2, 0.6, M.brass);                                                  // scope rim
  disc(v, at(2.2, -0.8, 2.4), side, 2.2, 0.7, (px, py, pz, r) => (r > 0.5 ? M.steel : undefined));   // the ring on the side
}

export function build(p = {}) {
  const v = new Vox(48, 56, 48), rig = solve('biped', PROP, p), J = rig.J, T = rig.T, cape = p.cape || 0;
  const M = {
    skin: useMat(v, 'skin', { ramp: ['#8a3a4e', '#d07a8c', '#eea0aa', '#ffc8c8'], noShadow: true }),
    skinD: useMat(v, 'skinD', { ramp: ['#6a2a3e', '#a85468', '#c47282', '#e094a0'] }),
    beard: useMat(v, 'beard', { ramp: ['#7a7488', '#bcb8c0', '#dedad8', '#f6f2ea'] }),
    shirt: useMat(v, 'shirt', { ramp: ['#5a0c08', '#a01e10', '#c8341a', '#ec5a32'] }),
    pants: useMat(v, 'pants', { ramp: ['#120c08', '#2c1f16', '#43301f', '#5e4630'] }),
    pad: useMat(v, 'pad', { ramp: ['#100b08', '#2a1f17', '#3f3024', '#5a4636'] }),
    belt: useMat(v, 'belt', { ramp: ['#24140a', '#5a3a1c', '#7e5428', '#a2723a'] }),
    pouch: useMat(v, 'pouch', { ramp: ['#5a3008', '#a8701a', '#d29a26', '#f4c650'] }),
    cape: useMat(v, 'cape', { ramp: ['#6a2a06', '#c0640e', '#e48a14', '#fcb83a'] }),
    capeL: useMat(v, 'capeL', { ramp: ['#7a4008', '#d6921a', '#f6b424', '#ffd860'] }),
    capeD: useMat(v, 'capeD', { ramp: ['#4a1a06', '#8c3e10', '#a85418', '#c87226'] }),
    brass: useMat(v, 'brass', { ramp: ['#4a2e0c', '#8a6420', '#b88e30', '#e2c060'] }),
    steel: useMat(v, 'steel', { ramp: ['#3a3640', '#6a6870', '#9a989e', '#c8c6c8'] }),
    wood: useMat(v, 'wood', { ramp: ['#1e0e06', '#4a2a14', '#6a401e', '#8e5c2e'] }),
    gun: useMat(v, 'gun', { ramp: ['#141016', '#2c2628', '#423a3a', '#5e5450'] }),
    gunD: useMat(v, 'gunD', { ramp: ['#0e0a0c', '#201a1a', '#322a28', '#4a3e3a'] }),
    lens: useMat(v, 'lens', { emit: '#7ed23a', tier: 'eye', gain: 0.85 }),
    lash: useMat(v, 'lash'),
    pupil: useMat(v, 'pupil', { emit: '#2a1a14', tier: 'eye' }),
    shine: useMat(v, 'shine', { gain: 0.9 }),
  };

  // ---- legs: short thick dark trousers, big bare pink feet
  for (const k of ['R', 'L']) {
    feet(v, J['foot' + k], 'bare', M.skin, { hw: 2.4, len: 3.4, front: 1.6 });
    limb(v, [J['ankle' + k], J['knee' + k], J['hip' + k]], [2.4, 2.6, 2.8], M.pants);
  }
  // ---- cape: one orange-yellow sheet from the shoulders down the back to the calves, flaring out, tattered hem, lighter patches; drawn first
  // so the body and arms win where they meet
  const C0 = 4 - cape * 1.2, CT = 23.4;
  vol(v, T.torso, cx - 12, cy + 2, C0 - 1, cx + 12, cy + 14, CT + 0.6, (px, py, pz) => {
    const dz = CT - pz, dx = px - cx, w = 7.4 + dz * 0.18; if (Math.abs(dx) > w) return;
    const back = cy + 4.6 + dz * (0.16 + cape * 0.3) - (dx / w) ** 2 * 2; if (py < cy + 2.4 || py > back + 1.2) return;
    const hem = C0 + hash(Math.floor(px * 0.7), 0, 0) * 2.4; if (pz < hem) return;
    if (pz < hem + 0.9 || Math.abs(dx) > w - 0.7) return M.capeD;
    const pt = hash(Math.floor((px - cx) / 3), 1, Math.floor(pz / 4)); return pt > 0.78 ? M.capeL : M.cape;
  });
  // ---- body: round red shirt, belt with yellow pouches at the hips
  torso(v, T.torso, { c: [cx, cy], z0: 9.6, z1: 23.6, r: 9 }, (dx, dy, z) => {
    const rx = 6 + Math.min(1, z / 4) * 1 - Math.max(0, z - 10) * 0.6, ry = 4.4 + (dy < 0 ? 0.9 * Math.max(0, 1 - Math.abs(z - 5) / 5) : 0);
    if ((dx / rx) ** 2 + (dy / ry) ** 2 > 1) return;
    if (z < 1.6) return z < 1.5 && z > 0.3 && Math.abs(Math.abs(dx) - 4.2) < 1.2 && dy < 0.5 ? M.pouch : M.belt;
    return M.shirt;
  });
  for (const s of [-1, 1]) ell(v, T.torso, [cx + s * 6.2, cy - 0.4, 10.4], [1.6, 1.9, 1.9], M.pouch);   // hip pouches
  // ---- arms: red sleeves, dark leather bracers, pink hands; dark riveted shoulder pads (steel studs)
  for (const k of ['R', 'L']) {
    const sh = J['shoulder' + k], el = J['elbow' + k], hd = J['hand' + k];
    limb(v, [sh, el], [2.1, 1.9], M.shirt);
    v.capsule(el, hd, 1.9, (px, py, pz, t) => (t < 0.55 ? M.shirt : t > 0.86 ? M.brass : M.pad), 1.8);
    hand(v, hd, [1.8, 1.8, 1.6], M.skin);
  }
  for (const [k, s] of [['R', -1], ['L', 1]]) {
    const sh = J['shoulder' + k];
    pauldron(v, sh, [3.2, 3.3, 2.4], M.pad, M.pad, 1.2);
    for (const [ox, oy] of [[0, -2.8], [s * 2.6, -1.6], [s * 3.4, 0.8]]) v.ellipsoid(sh[0] + ox, sh[1] + oy, sh[2] + 2.6, 0.6, 0.6, 0.6, M.steel);
  }
  // cape collar over the shoulders (bunched folds behind the neck)
  cap(v, T.torso, [cx - 5.6, cy + 3.8, 23.2], [cx + 5.6, cy + 3.8, 23.2], 2, M.cape);

  // ---- head: bald pink dome, big nose, long pointed ears flaring out and up, brass goggles across the brow, white brows + moustache + beard
  const Th = T.head, [hx, hy, hz] = [cx, cy + PROP.headY, PROP.headZ];
  ell(v, Th, [hx, hy, hz], SKULL, M.skin);
  ell(v, Th, [hx, hy - 0.5, hz - 4.2], [5.2, 5, 3.6], M.skin);   // cheeks / jaw
  for (const s of [-1, 1]) {   // ears: root at the temple, a long flat point out to the side, tilted up and back; darker inner
    cap(v, Th, [hx + s * 5.6, hy + 0.8, hz - 0.2], [hx + s * 10.2, hy + 2.8, hz + 4.2], 1.9, M.skin, 0.4);
    cap(v, Th, [hx + s * 6.4, hy - 0.4, hz + 0.2], [hx + s * 8.8, hy + 1.4, hz + 2.8], 0.9, M.skinD, 0.3);
  }
  // goggles: brass band round the head at the brow, two round lenses on the forehead (green), the right one pulled down over the right eye
  ell(v, Th, [hx, hy, hz + 2], [SKULL[0] + 0.3, SKULL[1] + 0.3, 1.1], M.brass, (px, py, pz) => py > hy - SKULL[1] * 0.3 || Math.abs(px - hx) > 5);
  const hc = J.head, ox = Math.round(hc[0] - cx), oz = Math.round(hc[2] - hz), ez = Math.round(hz - 1.6) + oz;   // integer rows (paintFront indexes cells)
  eyes(v, { at: [[cx + 2 + ox]], z: ez, style: 'dot', state: p.eyes }, M);
  decal(v, [[cx + 1 + ox, ez + 2], [cx + 2 + ox, ez + 2], [cx + 3 + ox, ez + 2], [cx + 4 + ox, ez + 2]], M.beard);   // left brow (white)
  ell(v, Th, [hx - 3, hy - 6.2, hz - 0.8], [2.2, 1.4, 2.2], M.brass);           // right goggle cup over the eye
  ell(v, Th, [hx - 3, hy - 7.4, hz - 0.8], [1.5, 0.6, 1.5], M.lens);            // green lens
  ell(v, Th, [hx + 2.6, hy - 5, hz + 3.8], [1.9, 1.2, 1.6], M.brass);           // left goggle pushed up on the forehead
  ell(v, Th, [hx + 2.6, hy - 5.9, hz + 3.8], [1.2, 0.5, 1], M.lens);
  ell(v, Th, [hx, hy - 7, hz - 2.8], [1.6, 1.8, 1.5], M.skin);                  // big nose
  // beard: moustache wings, then the long white beard down over the chest to a point
  for (const s of [-1, 1]) cap(v, Th, [hx + s * 0.7, hy - 6.6, hz - 4.2], [hx + s * 4.2, hy - 5.4, hz - 5.6], 1.2, M.beard, 0.7);
  ell(v, Th, [hx, hy - 3.8, hz - 6.6], [5.4, 3.4, 4.4], M.beard, (px, py, pz) => py < hy - 1.2 || pz < hz - 6);
  cap(v, Th, [hx, hy - 4.2, hz - 8.2], [hx, hy - 4.2, hz - 16.4], 4, M.beard, 1.2);
  for (const s of [-1, 1]) cap(v, Th, [hx + s * 2.4, hy - 3.8, hz - 7.6], [hx + s * 1.8, hy - 3.8, hz - 14], 2.2, M.beard, 0.8);

  // ---- the rifle, last (it reads over the beard and the arms)
  rifle(v, rig, norm3(apM(T.torso && T.torso.R, aimDir(p.gun || GUN, -1))), M);
  return v;
}

const range = n => [...Array(n).keys()];
const sw = (a, d) => a.map(([el, hd]) => [el + d, hd]);
/** Anims: idle = squat, rifle level at the hip (breathing bob); walk = waddle, rifle carried angled down; attack = rifle shouldered a touch
 * higher, the recoil kick up and back, settle; cast (Shrapnel / grenade) = left arm thrown up and over, rifle held low in the right; stunned
 * slump with the rifle drooping. */
export const ANIMS = {
  idle: range(4).map(i => {
    const b = [0, 1, 2, 1][i];
    return { bob: -b * 0.2, armR: sw(HOLD.R, b), armL: sw(HOLD.L, b), head: [b * 1, 0, 0], gun: [GUN[0] + b * 0.6, GUN[1]] };
  }),
  walk: range(4).map(i => {
    const st = [1, 0, -1, 0][i];
    return {
      bob: [-0.5, 0, -0.5, 0][i], spine: [10, st * 4, 0], head: [-6, -st * 3, 0], footR: [0, -st * 1.6, i === 3 ? 0.5 : 0], footL: [0, st * 1.6, i === 1 ? 0.5 : 0],
      armR: sw(HOLD.R, st * 3), armL: sw(HOLD.L, st * 3), gun: [2 + st * 2, 88], cape: 0.8,
    };
  }),
  attack: [
    { spine: [-2, 0, 0], head: [2, 0, 0], armR: [[-56, 30], [-4, 84]], armL: [[-26, 64], [2, 88]], gun: [8, 90] },
    { bob: 0.2, spine: [-10, 0, 0], head: [6, 0, 0], armR: [[-46, 26], [10, 76]], armL: [[-14, 60], [16, 86]], gun: [18, 90], footR: [0, 0.8, 0], cape: 0.3 },
    { spine: [-4, 0, 0], head: [2, 0, 0], armR: sw(HOLD.R, 2), armL: sw(HOLD.L, 2), gun: [7, 90] },
  ],
  cast: [
    { spine: [-6, -14, 0], head: [-4, 10, 0], armR: HOLD.R, armL: [[20, -30], [40, -40]], gun: [2, 86], footL: [0, 1, 0] },
    { spine: [-10, -6, 0], head: [-10, 4, 0], armR: HOLD.R, armL: [[56, -6], [76, 4]], gun: [2, 86] },
    { bob: -0.4, spine: [10, 10, 0], head: [-6, -6, 0], armR: HOLD.R, armL: [[10, 80], [0, 96]], gun: [2, 86], footL: [0, -1.6, 0], cape: 0.4 },
  ],
  stunned: range(2).map(i => ({
    bob: -0.6, spine: [8, [3, -3][i], 0], head: [10, [6, -6][i], [4, -4][i]], armR: [[-80, 20], [-60, 60]], armL: [[-80, 8], [-84, 14]], gun: [-30, 86], eyes: 'x',
  })),
};

/** HUD portrait framing (tools/vox/portrait.mjs): idle, the head with the ears and the beard filling the frame. */
export const PORTRAIT = { pose: ANIMS.idle[0], center: [cx, cy, 30], scale: 1.1, fov: 24, sig: '#e48a14', face: [4, 11, 24, 24] };
