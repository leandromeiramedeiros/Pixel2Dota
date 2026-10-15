// Voxel Axe, a chibi of his Dota 2 model (hand-authored): a hulking red-skinned brute, a huge bare red chest and arms on short legs; a black
// mane swept back into a topknot and a full black beard round a scowling red face (heavy brow, small pale eyes, a bared grimace); dark iron
// pauldrons on both shoulders, dark bracers, a brown belt with a strap across the chest; dark brown trousers, grey greaves, dark boots. Both
// fists hold the double-bladed great axe across the front, the head out to his right (-x), the long haft running down past his left hip.
// Signature reads: red bulk with a black topknot + beard; the double-bit axe held across the body; dark iron shoulders on red arms.
// Grid 64 x 64 x 56, ~45 voxels tall to the topknot (Pudge 45), faces -y.
import { Vox } from '../vox.js';
import { useMat } from '../mats.js';
import { solve, sub3, norm3, apM } from '../rig.js';
import { limb, band, hand, feet, pauldron, ell, cap, vol, greatAxe } from '../parts.js';

export const META = { rig: 'biped', grid: [64, 64, 56], cx: 32, cy: 32 };
const cx = 32, cy = 32;
/** Biped proportions: short legs, a broad chest, shoulders wide and high, the head set forward on a thick neck. */
export const PROP = {
  cx, cy, hipZ: 11, hipX: 3.6, footX: 6.2, ankleY: -0.3, ankleZ: 3.4, thigh: 4.6, shin: 4.2,
  chestZ: 22, chestD: 5, backD: 5, shX: 8.6, shY: 0.4, shZ: 26, upper: 6.6, fore: 6.6, neckY: -1.2, neckZ: 28, headY: -2.6, headZ: 33.4, headTopZ: 40, hairZ: 33,
};
const HY = cy + PROP.headY, HZ = PROP.headZ;
const HOLD = { R: [2.6, -9.4, -4.6], L: [-4.4, -9, -10.4] };   // reach targets (rest space, from each shoulder): axe across the belly, head out right

/** Pose p: a biped rig pose (rig.js; arms by reachR / reachL so both fists stay on the haft) + eyes ('open' | 'shut'). */
export const rigOf = p => solve('biped', PROP, p).J;

export function build(p = {}) {
  const v = new Vox(64, 64, 56), rig = solve('biped', PROP, p), J = rig.J, T = rig.T, Rt = T.torso && T.torso.R;
  const SKIN = ['#3a0808', '#7c1614', '#a82420', '#cc4636'];
  const M = {
    skin: useMat(v, 'skin', { ramp: SKIN }),
    skinD: useMat(v, 'skinD', { ramp: ['#2a0606', '#5a0e0e', '#7c1614', '#9c2a22'] }),
    face: useMat(v, 'face', { ramp: SKIN, noShadow: true }),
    hair: useMat(v, 'hair', { ramp: ['#050304', '#120e0e', '#201818', '#342828'] }),
    iron: useMat(v, 'iron', { ramp: ['#141218', '#302c36', '#4c4754', '#6c6676'] }),
    ironL: useMat(v, 'ironL', { ramp: ['#24222a', '#4a4652', '#6c6876', '#928c9a'] }),
    leather: useMat(v, 'leather', { ramp: ['#140c08', '#2e1e14', '#46301e', '#644630'] }),
    pants: useMat(v, 'pants', { ramp: ['#100c0a', '#261e1a', '#3a2e28', '#524238'] }),
    wood: useMat(v, 'wood', { ramp: ['#1a0c06', '#3e2412', '#5a3a1e', '#7a5430'] }),
    blade: useMat(v, 'blade', { ramp: ['#1a181e', '#3e3c44', '#625e68', '#8a8690'] }),
    edge: useMat(v, 'edge', { ramp: ['#4a4850', '#8c8a92', '#b8b6bc', '#e2e0e0'] }),
    lash: useMat(v, 'lash'),
    eyeW: useMat(v, 'eyeW', { emit: '#f0d890', tier: 'eye', gain: 0.8 }),
    teeth: useMat(v, 'teeth', { ramp: ['#6a6050', '#b4aa94', '#d4ccb4', '#eee8d4'], noShadow: true }),
    mouth: useMat(v, 'mouth', { emit: '#2a0606', tier: 'eye' }),
  };

  // ---- legs: dark trousers, grey greaves over the shins, dark boots
  for (const k of ['R', 'L']) {
    const f = J['foot' + k], hip = J['hip' + k], kn = J['knee' + k], an = J['ankle' + k];
    feet(v, f, 'boot', M.leather, { hw: 2.4, front: 3.8, back: 2, h: 3 });
    limb(v, [an, kn], [2.4, 2.8], M.iron);
    band(v, an, kn, 0.45, 0.6, 2.9, M.ironL);
    limb(v, [kn, hip], [3.1, 3.5], M.pants);
  }

  // ---- trunk (rest space, posed by the spine): trouser seat, belt + buckle, belly, huge chest, traps; a strap from the left shoulder down
  // to the right hip; pec and belly shading lines on the front
  const chest = (px, py, pz) => {
    const dx = px - cx;
    if (Math.abs(pz - (17 + dx * 0.72)) < 0.75 && pz > 13) return M.leather;                                   // strap across the chest
    if (py < cy - 3) {
      if (pz > 20.2 && pz < 21.2 && Math.abs(dx) > 0.8 && Math.abs(dx) < 7) return M.skinD;                   // under the pecs
      if (Math.abs(dx) < 0.6 && pz > 14 && pz < 24) return M.skinD;                                           // centre line
    }
    return M.skin;
  };
  ell(v, T.torso, [cx, cy + 0.5, 10.4], [7, 5.8, 3.6], M.pants);
  ell(v, T.torso, [cx, cy - 0.2, 16], [7, 5.6, 4.8], chest);
  ell(v, T.torso, [cx, cy - 0.4, 22.4], [9.6, 6.6, 6], chest);
  ell(v, T.torso, [cx, cy + 1.2, 26.4], [7.4, 5, 3.4], M.skin);
  vol(v, T.torso, cx - 9, cy - 8, 11.6, cx + 9, cy + 8, 13.8, (px, py, pz) => {
    const dx = px - cx, dy = py - cy - 0.2; if ((dx / 7.4) ** 2 + (dy / 6.1) ** 2 > 1) return;
    return dy < -4 && Math.abs(dx) < 1.4 ? M.ironL : M.leather;                                               // belt, iron buckle
  });
  // loincloth flap in front of the belt
  vol(v, T.torso, cx - 3, cy - 8, 6, cx + 3, cy - 4, 12, (px, py, pz) => {
    const dx = px - cx, w = 2.4 - (12 - pz) * 0.08; if (Math.abs(dx) > w) return;
    const yf = cy - 5.8 - (12 - pz) * 0.05; if (py < yf - 0.7 || py > yf + 0.8) return;
    return pz < 7 ? M.pants : M.leather;
  });

  // ---- arms: massive bare red arms, dark bracers banded light, red fists; iron pauldrons on both shoulders (the left one bigger)
  for (const k of ['R', 'L']) {
    const sh = J['shoulder' + k], el = J['elbow' + k], hd = J['hand' + k];
    v.ellipsoid(sh[0], sh[1], sh[2] - 0.6, 3.6, 3.6, 3.4, M.skin);
    limb(v, [sh, el], [3.2, 2.8], M.skin);
    limb(v, [el, hd], [2.7, 2.4], M.skin);
    band(v, el, hd, 0.3, 0.85, 2.8, M.iron);
    band(v, el, hd, 0.52, 0.6, 3, M.ironL);
    hand(v, hd, [2.3, 2.3, 2.1], M.skin);
    pauldron(v, sh, k === 'L' ? [4.6, 4.6, 3.4] : [4, 4, 3], M.iron, M.ironL, 1.2);
  }

  // ---- neck + head (head space): red skull, black mane swept back into a topknot, black beard round the jaw, small ears
  ell(v, T.torso, [cx, cy - 0.6, 28.2], [4.2, 3.6, 2.6], M.skin);
  const Th = T.head, hx = cx, hy = HY, hz = HZ;
  ell(v, Th, [hx, hy + 1.6, hz + 0.6], [5.6, 5.2, 5.4], M.hair, (px, py, pz) => py > hy - 0.4 || pz > hz + 3.2);   // mane shell, face open
  ell(v, Th, [hx, hy, hz], [4.8, 4.4, 5], M.face, (px, py, pz) => !(pz > hz + 3.2 && py > hy - 2.4));            // face + skull
  for (const [dx, up, back] of [[-2, 3, 3.6], [0, 4.6, 3], [2, 3, 3.6]])                                        // spiky topknot, swept back
    cap(v, Th, [hx + dx * 0.7, hy + 1.2, hz + 4.4], [hx + dx * 1.3, hy + 1.2 + back, hz + 4.6 + up], 1.7, M.hair, 0.5);
  cap(v, Th, [hx, hy + 4.4, hz + 2], [hx, hy + 6.4, hz - 3], 2.8, M.hair, 1.6);                                 // mane down the nape
  for (const s of [-1, 1]) cap(v, Th, [hx + s * 4.6, hy + 0.4, hz + 0.4], [hx + s * 5.6, hy + 0.8, hz + 1.6], 0.9, M.face);   // ears
  ell(v, Th, [hx, hy - 1.4, hz - 3.4], [5, 4, 3.8], M.hair, (px, py, pz) => pz < hz - 1.6 + Math.abs(px - hx) * 0.1);   // beard
  for (const s of [-1, 1]) cap(v, Th, [hx + s * 4.4, hy - 0.4, hz + 0.4], [hx + s * 4.2, hy - 1, hz - 2.8], 1.1, M.hair);  // sideburns

  // ---- face, painted on the front-most head voxels only: heavy brow, small pale eyes, nose shadow, a bared grimace in the beard
  const HEAD = new Set([M.face, M.hair]);
  const paint = (x, z, m) => { const y = v.front(x, z); if (y >= 0 && HEAD.has(v.get(x, y, z))) v.set(x, y, z, m); };
  const ox = Math.round(J.head[0] - hx), ez = Math.round(HZ + 1 + J.head[2] - hz), X = d => cx + ox + d;
  for (const [d, dz] of [[-4, 2], [-3, 2], [-2, 1], [-1, 1], [0, 0], [1, 1], [2, 1], [3, 2]]) paint(X(d), ez + dz, M.lash);
  const shut = p.eyes === 'shut';
  for (const d of [-3, -2, 1, 2]) paint(X(d), ez, shut ? M.lash : (d === -2 || d === 1 ? M.eyeW : M.lash));
  for (const d of [-1, 0]) paint(X(d), ez - 1, M.skinD);
  for (const d of [-2, -1, 0, 1]) paint(X(d), ez - 3, M.teeth);
  for (const d of [-2, -1, 0, 1]) paint(X(d), ez - 4, M.mouth);

  // ---- the great axe across both fists: haft from below the left fist through the right, the double-bit head out past the right fist
  const hR = J.handR, hL = J.handL, d = norm3(sub3(hR, hL)), fwd = apM(Rt, [0, -1, 0]);
  const lift = 1.1;                                                                                           // haft just in front of the fists so it reads
  const butt = [hL[0] - d[0] * 6 + fwd[0] * lift, hL[1] - d[1] * 6 + fwd[1] * lift, hL[2] - d[2] * 6 + fwd[2] * lift];
  const span = Math.hypot(...sub3(hR, hL)) + 6;
  greatAxe(v, butt, d, Math.abs(d[1]) > 0.8 ? apM(Rt, [1, 0, 0]) : fwd,
    { len: span + 16, head: span + 13, r: 0.9, bits: 2, reach: 7.4, l0: 2.4, l1: 6.4, th: 0.8, edge: 1.2, spike: 1.6, bands: [0.06, (span - 6) / (span + 16), 0.6] },
    { haft: M.wood, band: M.iron, blade: M.blade, edge: M.edge });
  v.ellipsoid(butt[0], butt[1], butt[2], 1.1, 1.1, 1.1, M.iron);                                              // pommel
  return v;
}

const sh = (r, d) => [r[0] + d[0], r[1] + d[1], r[2] + d[2]];
const IDLE = [0, 1, 2].map(b => ({ bob: -b * 0.25, head: [b * 1.5, 0, 0], reachR: sh(HOLD.R, [0, 0, -b * 0.3]), reachL: sh(HOLD.L, [0, 0, -b * 0.3]) }));
const step = st => ({
  bob: st ? -0.6 : 0, spine: [10, st * 4, 0], head: [-8, -st * 3, 0], footR: [0, -st * 2.4, 0], footL: [0, st * 2.4, 0],
  reachR: sh(HOLD.R, [0, st * 0.8, 0.8]), reachL: sh(HOLD.L, [0, st * 0.8, 0.8]),
});
const ROAR = { bob: 0.2, spine: [-10, 0, 0], head: [-16, 0, 0], reachR: [0.4, -1.2, 8.6], reachL: [-2, -4.6, -6.4], footR: [0, 0.6, 0], footL: [0, -0.6, 0] };
const SLUMP = { bob: -0.8, spine: [12, 4, 5], head: [14, 8, 6], reachR: [3, -5, -11], reachL: [-3, -5, -11.4], eyes: 'shut' };
/** Anims: idle = slow heavy breathing, axe across the belly; walk = a heavy stride, axe carried; attack = the axe wound up over the right
 * shoulder, then a diagonal chop across the front; cast = Berserker's Call: leans back, axe thrust up, roaring; stunned = slumped, eyes shut. */
export const ANIMS = {
  idle: [IDLE[0], IDLE[1], IDLE[2], IDLE[1]],
  walk: [step(1), IDLE[0], step(-1), IDLE[0]],
  attack: [
    { spine: [-6, -16, 0], head: [-4, 10, 0], reachR: [1, -1.6, 4], reachL: [-8, -4.4, 0], footR: [0, 1, 0] },
    { bob: -0.8, spine: [16, 20, 0], head: [-10, -10, 0], reachR: [6, -10, -5], reachL: [-6, -5, -7], footR: [0, -2, 0], footL: [0, 1, 0] },
    IDLE[0],
  ],
  cast: [
    { bob: -0.6, spine: [12, -10, 0], head: [-4, 6, 0], reachR: [3, -3, -9], reachL: [-4, -6, -9.6], footR: [0, 1, 0] },
    ROAR, ROAR,
  ],
  stunned: [SLUMP, { ...SLUMP, spine: [12, -4, -5], head: [14, -8, -6] }],
};

/** HUD portrait framing (tools/vox/portrait.mjs): idle, the bearded red head in the upper third, the pauldrons either side. */
export const PORTRAIT = { pose: ANIMS.idle[0], center: [cx, HY, 34], scale: 1.6, fov: 24, sig: '#a82420', face: [4, 11, 24, 24] };
