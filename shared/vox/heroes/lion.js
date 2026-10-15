// Voxel Lion, a chibi of his Dota 2 model (hand-authored): a hunched lavender-grey demon; big head pushed forward with long pointed bat ears,
// a wide toothy grin, small yellow eyes and an orange gem on the brow; a tall red-orange hood flaring up behind the head; glowing orange orb
// pauldrons; a dark plum cape down the back; a red loincloth on a dark belt; digitigrade-ish bare legs. Right (-x) hand: a short dark staff
// with a glowing orange orb head. Left (+x) arm: the huge black demon claw with orange glowing cracks and talons.
// Signature reads: red hood fan behind the pointed-eared head; the oversized black-and-orange claw at his left; the orange orb staff at his
// right. Grid 52 x 50 x 48, ~44 voxels tall, faces -y.
import { Vox } from '../vox.js';
import { useMat } from '../mats.js';
import { solve, add3, sub3, mul3, norm3, cross3, apM, aimDir } from '../rig.js';
import { limb, band, hand, ell, cap, vol, collar, pauldron } from '../parts.js';

export const META = { rig: 'biped', grid: [52, 50, 48], cx: 26, cy: 25 };
const cx = 26, cy = 25;
/** Biped proportions: short legs, a hunched chest, the head big and forward. */
export const PROP = {
  cx, cy, hipZ: 10, hipX: 3, footX: 3.6, ankleY: -0.3, ankleZ: 3, thigh: 4, shin: 3.8,
  chestZ: 20, chestD: 4, backD: 4, shX: 6.6, shY: 0.6, shZ: 24, upper: 5, fore: 5, neckY: -1.6, neckZ: 26, headY: -3, headZ: 32, headTopZ: 38, hairZ: 30,
};
const HY = cy + PROP.headY, HZ = PROP.headZ;
const HOLD = { R: [[-62, 20], [-30, 50]], L: [[-56, 14], [-40, 46]] };   // staff held low at his right, the claw hanging forward at his left
const STAFF = [-10, 84];   // staff aim (body frame): forward and down

/** Pose p: a biped rig pose (rig.js) + staff ([el, hd] body-frame aim of the staff), eyes ('open' | 'shut'). */
export const rigOf = p => solve('biped', PROP, p).J;

export function build(p = {}) {
  const v = new Vox(52, 50, 48), rig = solve('biped', PROP, p), J = rig.J, T = rig.T, Rt = T.torso && T.torso.R;
  const SKIN = ['#2e2638', '#6a6080', '#8e86a6', '#b4acc8'];
  const M = {
    flesh: useMat(v, 'flesh', { ramp: SKIN }),
    skin: useMat(v, 'skin', { ramp: SKIN, noShadow: true }),
    skinD: useMat(v, 'skinD', { ramp: ['#221c2c', '#4e4760', '#6a6280', '#8a82a0'], noShadow: true }),
    hood: useMat(v, 'hood', { ramp: ['#3a0806', '#96230e', '#c43c16', '#e2662a'] }),
    hoodD: useMat(v, 'hoodD', { ramp: ['#200404', '#5a110a', '#7e1a0c', '#a02c14'] }),
    cape: useMat(v, 'cape', { ramp: ['#120a0e', '#2f2226', '#46343e', '#5e4a56'] }),
    cloth: useMat(v, 'cloth', { ramp: ['#2a0806', '#5a110a', '#96230e', '#b8401e'] }),
    belt: useMat(v, 'belt', { ramp: ['#100806', '#2a1a12', '#44301e', '#64452c'] }),
    claw: useMat(v, 'claw', { ramp: ['#080506', '#1a1214', '#2c2224', '#463636'] }),
    wood: useMat(v, 'wood', { ramp: ['#0c0806', '#24170e', '#3a2616', '#563a22'] }),
    glow: useMat(v, 'glow', { emit: '#d64607', tier: 'signature', gain: 0.9 }),
    glowL: useMat(v, 'glowL', { emit: '#f79a16', tier: 'signature', gain: 0.9 }),
    tooth: useMat(v, 'tooth', { ramp: ['#6a6058', '#c8c0b0', '#e4dccc', '#fff8e8'], noShadow: true }),
    lash: useMat(v, 'lash'),
    eyeW: useMat(v, 'eyeW', { emit: '#f0c040', tier: 'eye', gain: 0.85 }),
    mouth: useMat(v, 'mouth', { emit: '#2a0608', tier: 'eye' }),
  };

  // ---- legs: lavender bare legs, wide clawed feet
  for (const k of ['R', 'L']) {
    const f = J['foot' + k], hip = J['hip' + k], kn = J['knee' + k], an = J['ankle' + k];
    v.ellipsoid(f[0], f[1] - 1, f[2] + 1, 2, 2.8, 1.4, M.flesh);
    for (const dx of [-1.2, 0.2, 1.4]) v.ellipsoid(f[0] + dx, f[1] - 3.4, f[2] + 0.7, 0.7, 0.9, 0.7, M.claw);
    limb(v, [an, kn], [1.7, 2.1], M.flesh);
    limb(v, [kn, hip], [2.3, 2.8], M.flesh);
  }

  // ---- trunk (rest space, posed by the spine): hips, a broad muscled chest, dark belt + red loincloth flaps front and back
  ell(v, T.torso, [cx, cy + 0.5, 11.5], [5, 4, 3.4], M.flesh);
  ell(v, T.torso, [cx, cy, 15.5], [4.6, 3.6, 3.6], M.flesh);
  ell(v, T.torso, [cx, cy, 20.5], [6.4, 4.6, 4.6], (px, py, pz) => (py < cy - 3.6 && Math.abs(px - cx) < 0.5 && pz < 21.5 ? M.skinD : M.flesh));
  vol(v, T.torso, cx - 7, cy - 6, 11.6, cx + 7, cy + 6, 13.4, (px, py) => (((px - cx) / 5.3) ** 2 + ((py - cy - 0.5) / 4.3) ** 2 <= 1 ? M.belt : undefined));
  for (const s of [-1, 1]) {   // flaps: front (s = -1) and back
    vol(v, T.torso, cx - 5, cy - 7, 4, cx + 5, cy + 7, 12, (px, py, pz) => {
      const dx = px - cx, w = 3.6 - (12 - pz) * 0.08; if (Math.abs(dx) > w) return;
      const yf = cy + s * (4.2 + (12 - pz) * 0.1); if (Math.abs(py - yf) > 0.8) return;
      if (pz < 4.6 + ((Math.floor(px) * 5) % 3) * 0.8) return;
      return pz > 10.6 ? M.hoodD : M.cloth;
    });
  }

  // ---- cape: dark plum cloak hanging down the back from the shoulders to the calves, ragged hem
  vol(v, T.torso, cx - 9, cy + 2, 5, cx + 9, cy + 9, 25, (px, py, pz) => {
    const dx = px - cx, w = 6.4 + (25 - pz) * 0.1; if (Math.abs(dx) > w) return;
    const yb = cy + 3.8 + (25 - pz) * 0.12 + 0.02 * dx * dx; if (py < yb || py > yb + 1.2) return;
    if (pz < 5.4 + Math.abs(((px + 40) % 3) - 1.5) * 1.6) return;
    return M.cape;
  });

  // ---- cape collar: a low dark plum rim round the back of the neck (the mane falls onto it)
  collar(v, T.torso, {
    c: [cx, cy + 0.6], z0: 23, z1: 28, r0: 5.6, r1: 7, sy: 0.8, th: 1.6, open0: 110, open1: 110,
  }, (px, py, pz, f) => (f > 0.75 ? M.hoodD : M.cape));

  // ---- arms. Right: lavender arm, small fist on the staff. Left: lavender upper arm into the huge black demon forearm + claw, orange cracks.
  const crack = (px, py, pz) => (Math.sin(px * 1.9 + pz * 1.3) * Math.cos(py * 1.7 - pz * 0.9) > 0.62 ? M.glow : M.claw);
  for (const k of ['R', 'L']) {
    const sh = J['shoulder' + k], el = J['elbow' + k], hd = J['hand' + k];
    if (k === 'R') {
      limb(v, [sh, el], [2.1, 1.8], M.flesh);
      limb(v, [el, hd], [1.7, 1.5], M.flesh);
      band(v, el, hd, 0.55, 0.85, 1.9, M.belt);
      hand(v, hd, [1.6, 1.6, 1.5], M.flesh);
    } else {
      limb(v, [sh, el], [2.3, 2.2], M.flesh);
      limb(v, [el, hd], [2.6, 3.6], crack);
      hand(v, hd, [4, 3.8, 3.6], crack);
      // talons: four fingers fanned out of the fist along the forearm direction, orange-hot tips
      const d = norm3(sub3(hd, el)), sd = norm3(cross3(d, [0, 0, 1])), up = norm3(cross3(sd, d));
      for (const [sx, su] of [[-1.6, 0.4], [-0.5, 0.8], [0.6, 0.6], [1.6, 0]]) {
        const a = add3(hd, add3(mul3(sd, sx * 1.3), mul3(up, su))), b = add3(add3(a, mul3(d, 4.6)), add3(mul3(sd, sx * 1.1), mul3(up, -2)));
        v.capsule(a, b, 1.2, (px, py, pz, t) => (t > 0.68 ? M.glowL : M.claw), 0.45);
      }
    }
  }
  for (const k of ['R', 'L']) {   // glowing orange orb pauldrons with a dark rim
    const sh = J['shoulder' + k];
    pauldron(v, sh, [2.8, 2.8, 2.4], M.glow, M.claw, 0.8);
  }

  // ---- the staff in the right fist: dark rod, a crossbar near the head, the glowing orange orb head with dark ribs
  const hR = J.handR, dS = norm3(apM(Rt, aimDir(p.staff || STAFF, -1)));
  v.capsule(add3(hR, mul3(dS, -2.6)), add3(hR, mul3(dS, 8.4)), 0.65, M.wood);
  v.ellipsoid(...add3(hR, mul3(dS, -2.8)), 0.9, 0.9, 0.9, M.wood);
  const side = norm3(cross3(dS, [0, 0, 1]).map((x, i) => (Math.hypot(...cross3(dS, [0, 0, 1])) > 0.2 ? x : [1, 0, 0][i])));
  const xb = add3(hR, mul3(dS, 7));
  v.capsule(add3(xb, mul3(side, -2.2)), add3(xb, mul3(side, 2.2)), 0.6, M.wood);
  const o = add3(hR, mul3(dS, 9.6));
  v.ellipsoid(o[0], o[1], o[2], 2.3, 2.3, 2.3, (px, py, pz) => (Math.abs((px - o[0]) * dS[0] + (py - o[1]) * dS[1] + (pz - o[2]) * dS[2]) < 0.45 ? M.wood : M.glow));

  // ---- head: big skull, wide jaw jutting forward, long pointed bat ears sweeping up and out, a brow ridge; posed by the head
  const Th = T.head, hx = cx, hy = HY, hz = HZ;
  ell(v, Th, [hx, hy, hz], [5, 4.6, 5], M.skin);
  ell(v, Th, [hx, hy - 1, hz - 3], [5.2, 4.2, 2.8], M.skin);
  ell(v, Th, [hx, hy - 3.4, hz + 1.2], [4.4, 1.4, 1.2], M.skinD);   // heavy brow
  for (const s of [-1, 1]) {   // pointed bat ears, swept out and back below the horns
    cap(v, Th, [hx + s * 4, hy + 0.8, hz + 0.4], [hx + s * 7.2, hy + 2.4, hz + 2], 1.4, M.skin, 0.8);
    cap(v, Th, [hx + s * 7.2, hy + 2.4, hz + 2], [hx + s * 8.8, hy + 3.6, hz + 3.6], 0.8, M.skin, 0.3);
  }
  // the mane: red-orange locks swept up and back from the brow over the crown, tips flaring high behind the head, then falling to the nape
  const lock = (px, py, pz) => (pz > hz + 8 ? M.hood : py > hy + 4 ? M.hoodD : M.hood);
  for (const s of [-3, -1, 1, 3]) {
    const a = [hx + s * 1.1, hy - 0.4, hz + 4.2], m = [hx + s * 1.5, hy + 3.2, hz + 7 - Math.abs(s) * 0.4], b = [hx + s * 2, hy + 7.6, hz + 9.6 - Math.abs(s) * 0.7];
    cap(v, Th, a, m, 1.7, lock, 1.4);
    cap(v, Th, m, b, 1.4, lock, 0.4);
  }
  for (const s of [-2, 0, 2]) cap(v, Th, [hx + s, hy + 3, hz + 4], [hx + s * 1.3, hy + 6.4, hz - 3.4], 1.8, M.hoodD, 0.6);   // fall down the nape
  // horns: two dark curved horns from the temples, out and up, hooking back at the tips
  for (const s of [-1, 1]) {
    const P = [[hx + s * 3.2, hy - 1.2, hz + 3.4], [hx + s * 5.6, hy - 1, hz + 5.6], [hx + s * 7.2, hy, hz + 8.2], [hx + s * 7.4, hy + 2, hz + 10.4], [hx + s * 6.6, hy + 4, hz + 11.4]];
    const R = [1.4, 1.15, 0.9, 0.6, 0.35];
    for (let i = 0; i + 1 < P.length; i++) cap(v, Th, P[i], P[i + 1], R[i], i < 2 ? M.claw : M.wood, R[i + 1]);
  }

  // ---- face, painted on the front-most head voxels only (never on the claw or staff in front): brow gem, small yellow eyes under the brow,
  // a wide grin with a row of teeth. Integer rows from the posed head (paintFront indexes cells).
  const HEAD = new Set([M.skin, M.skinD]);
  const paint = (x, z, m) => { const y = v.front(x, z); if (y >= 0 && HEAD.has(v.get(x, y, z))) v.set(x, y, z, m); };
  const ox = Math.round(J.head[0] - hx), ez = HZ + Math.round(J.head[2] - hz), X = d => cx + ox + d;
  for (const d of [-1, 0]) { paint(X(d), ez + 3, M.glow); paint(X(d), ez + 4, M.glowL); }
  const shut = p.eyes === 'shut';
  for (const [d, m] of [[-3, M.eyeW], [-2, M.lash], [1, M.lash], [2, M.eyeW]]) paint(X(d), ez, shut ? M.lash : m);
  for (const d of [-1, 0]) paint(X(d), ez - 1, M.skinD);
  for (const d of [-4, -3, -2, -1, 0, 1, 2, 3]) { paint(X(d), ez - 3, M.tooth); paint(X(d), ez - 4, Math.abs(d + 0.5) < 3 ? M.mouth : M.tooth); }
  for (const d of [-3, -1, 0, 2]) paint(X(d), ez - 5, M.tooth);
  return v;
}

const swH = (a, d) => a.map(([el, hd]) => [el, hd + d]);
const IDLE = [0, 1, 2].map(b => ({ bob: -b * 0.2, spine: [8, 0, 0], head: [-6 + b * 1.2, 0, 0], armR: HOLD.R.map(([el, hd]) => [el - b, hd]), armL: HOLD.L.map(([el, hd]) => [el - b * 1.5, hd]) }));
const step = st => ({
  bob: st ? -0.5 : 0, spine: [14, st * 4, 0], head: [-10, -st * 3, 0], footR: [0, -st * 2, 0], footL: [0, st * 2, 0],
  armR: swH(HOLD.R, st * 10), armL: swH(HOLD.L, -st * 10),
});
const WALK = [step(1), IDLE[0], step(-1)];
const SLUMP = { bob: -0.7, spine: [14, 4, 5], head: [12, 8, 6], armR: [[-84, 6], [-86, 20]], armL: [[-84, 6], [-86, 20]], staff: [-80, 20], eyes: 'shut' };
/** Anims: idle = hunched breathing; walk = a stooped lope; attack = the staff drawn back then flicked forward (the ranged bolt); cast = Earth
 * Spike: the claw raised high, then slammed down to the ground in front; stunned = slumped, eyes shut. */
export const ANIMS = {
  idle: [IDLE[0], IDLE[1], IDLE[2], IDLE[1]],
  walk: [WALK[0], WALK[1], WALK[2], WALK[1]],
  attack: [
    { spine: [2, -14, 0], head: [-4, 8, 0], armR: [[20, -10], [50, 10]], staff: [40, -20], armL: HOLD.L, footR: [0, 1, 0] },
    { bob: -0.4, spine: [14, 12, 0], head: [-10, -6, 0], armR: [[-10, 70], [-6, 80]], staff: [-36, 76], armL: HOLD.L, footR: [0, -1.6, 0], footL: [0, 1, 0] },
    IDLE[0],
  ],
  cast: [
    { spine: [-6, 10, 0], head: [-8, -4, 0], armL: [[60, 20], [80, 10]], armR: HOLD.R, footL: [0, 1, 0] },
    { bob: -0.8, spine: [22, -10, 0], head: [-14, 6, 0], armL: [[-20, 70], [-60, 80]], armR: HOLD.R, footL: [0, -2, 0], footR: [0, 1, 0] },
    IDLE[0],
  ],
  stunned: [SLUMP, SLUMP],
};

/** HUD portrait framing (tools/vox/portrait.mjs): idle, the grinning head in the upper third with the red hood fanned behind it. */
export const PORTRAIT = { pose: ANIMS.idle[0], center: [cx, HY, 32.5], scale: 1.2, fov: 24, sig: '#d64607', ambient: 0.42, levels: [0.6, 0.85, 1], falloff: 0.1, face: [4, 11, 24, 24] };
