// Voxel Pudge, a chibi of his Dota 2 model (hand-authored): a hunched pear of pale pink flesh; sloped shoulder domes and an upper-back hump with
// a small head sunk low and forward in front of it; a vast round belly with one long stitched scar ripped open into a bleeding wound; dark
// green trousers under the overhang, a ragged bloodied cloth flap in front, bare feet; the right (-x) forearm bare with a chain spiralled
// round it, holding the meat hook on a short chain; the left arm in brown leather (pauldron + bracer) holding a cleaver. Small head: dark
// green tuft, bandage across the crown and down one cheek, small mean yellow eyes under a frowning brow, an underbite with two tusks.
// Signature reads: pear silhouette (belly widest, low) with the head low in front of the hump; belly scar + red wound; the J hook hanging at
// his right; the cleaver at his left. Grid 64 x 60 x 52, ~45 voxels tall (Lina 39), faces -y.
import { Vox } from '../vox.js';
import { useMat } from '../mats.js';
import { solve, add3, sub3, mul3, norm3, cross3, dot3, lerp3, apM, aimDir } from '../rig.js';
import { limb, band, hand, ell, cap, vol, obox, pauldron } from '../parts.js';

export const META = { rig: 'biped', grid: [64, 60, 52], cx: 32, cy: 33 };
const cx = 32, cy = 33;
/** Biped proportions: stubby legs, a low hunched chest, shoulder joints level with the jaw, the head low and forward. */
export const PROP = {
  cx, cy, hipZ: 11, hipX: 4.6, footX: 6, ankleY: -0.3, ankleZ: 3, thigh: 4.6, shin: 4.2,
  chestZ: 26, chestD: 7, backD: 7, shX: 11, shY: 0.5, shZ: 30.5, upper: 7, fore: 6.5, neckY: -3.5, neckZ: 32, headY: -6, headZ: 37, headTopZ: 42, hairZ: 39,
};
const HY = cy + PROP.headY, HZ = PROP.headZ;
const HOLD = { R: [[-58, 6], [-62, 56]], L: [[-58, 8], [-58, 60]] };   // arms bowed out round the belly, forearms forward

/** Pose p: a biped rig pose (rig.js) + hook ([el, hd] body-frame aim of the hanging hook; default straight down), chain (links before the
 * shank), cleaver ([el, hd] blade aim, left hand), eyes ('open' | 'shut'). */
export const rigOf = p => solve('biped', PROP, p).J;

// ---- local props (Pudge only): a chain of links and a J hook
/** Chain along a -> b: a thin core with fat links every other step (reads as links at 4.2 u). */
function chain(v, a, b, r, m) {
  const L = Math.hypot(...sub3(b, a)), n = Math.max(1, Math.round(L / 1.5));
  v.capsule(a, b, r * 0.55, m);
  for (let j = 0; j < n; j += 2) { const q = lerp3(a, b, (j + 0.5) / n); v.ellipsoid(q[0], q[1], q[2], r, r, r, m); }
}
/** J hook: shank from a along d (unit) for len, then an arc of radius R curling toward n (unit, normal to d) over sweep degrees, radius r0 -> r1
 * at the point; m(px, py, pz, t) with t 0..1 along the whole hook. */
function jhook(v, a, d, n, o, m) {
  const sw = o.sweep * Math.PI / 180, L = o.len + o.R * sw, s1 = add3(a, mul3(d, o.len)), c = add3(s1, mul3(n, o.R));
  const pts = [a, s1], ts = [0, o.len / L];
  for (let i = 1; i <= 9; i++) { const th = sw * i / 9; pts.push(add3(c, add3(mul3(n, -o.R * Math.cos(th)), mul3(d, o.R * Math.sin(th))))); ts.push((o.len + o.R * th) / L); }
  const rad = t => o.r0 + (o.r1 - o.r0) * t ** 1.5;
  for (let i = 0; i + 1 < pts.length; i++) { const t0 = ts[i], t1 = ts[i + 1]; v.capsule(pts[i], pts[i + 1], rad(t0), (px, py, pz, t) => m(px, py, pz, t0 + (t1 - t0) * t), rad(t1)); }
}
/** Unit vector normal to a (prefers the horizontal one). */
const perp = a => { const c = cross3(a, [0, 0, 1]); return Math.hypot(...c) > 0.2 ? norm3(c) : norm3(cross3(a, [1, 0, 0])); };

export function build(p = {}) {
  const v = new Vox(64, 60, 52), rig = solve('biped', PROP, p), J = rig.J, T = rig.T, Rt = T.torso && T.torso.R;
  const FLESH = ['#5a3040', '#b07a76', '#cc9a8e', '#e6bcaa'], FLESHD = ['#4a2234', '#8a5660', '#a6726e', '#c48e84'];
  const M = {
    flesh: useMat(v, 'flesh', { ramp: FLESH }),
    fleshD: useMat(v, 'fleshD', { ramp: FLESHD }),
    skin: useMat(v, 'skin', { ramp: FLESH, noShadow: true }),
    skinD: useMat(v, 'skinD', { ramp: FLESHD, noShadow: true }),
    stitch: useMat(v, 'stitch', { ramp: ['#1a0c14', '#36161e', '#4a2026', '#622e30'] }),
    blood: useMat(v, 'blood', { ramp: ['#2a0410', '#660c16', '#8e161c', '#b02a26'] }),
    gore: useMat(v, 'gore', { ramp: ['#4a0a1e', '#9a2438', '#c24a56', '#e27a80'] }),
    pants: useMat(v, 'pants', { ramp: ['#101816', '#26382e', '#3a5242', '#54705a'] }),
    rag: useMat(v, 'rag', { ramp: ['#3e3230', '#867a64', '#a89c80', '#c8bc9c'] }),
    bandage: useMat(v, 'bandage', { ramp: ['#5a4c48', '#b4a890', '#d6ccb0', '#f0e8cc'], noShadow: true }),
    leather: useMat(v, 'leather', { ramp: ['#1c100e', '#4a2a1c', '#704628', '#966438'] }),
    iron: useMat(v, 'iron', { ramp: ['#16141a', '#3e3c44', '#64626a', '#908c8a'] }),
    steel: useMat(v, 'steel', { ramp: ['#2a2a34', '#6a6c76', '#9a9ca2', '#c8c8c4'] }),
    hair: useMat(v, 'hair', { ramp: ['#0c160e', '#203a24', '#33583e', '#4e7a58'] }),
    bone: useMat(v, 'bone'),
    lash: useMat(v, 'lash'),
    eyeW: useMat(v, 'eyeW', { emit: '#e8c860', tier: 'eye', gain: 0.85 }),
    pupil: useMat(v, 'pupil', { emit: '#240808', tier: 'eye' }),
    mouth: useMat(v, 'mouth', { emit: '#3a0a10', tier: 'eye' }),
  };

  // ---- legs: dark green trousers, rag wraps at the ankles, broad bare feet
  for (const k of ['R', 'L']) {
    const f = J['foot' + k], hip = J['hip' + k], kn = J['knee' + k], an = J['ankle' + k];
    v.ellipsoid(f[0], f[1] - 1.2, f[2] + 1.2, 2.5, 3.4, 1.7, M.flesh);
    for (const dx of [-1.5, 0, 1.5]) v.ellipsoid(f[0] + dx, f[1] - 4.1, f[2] + 0.9, 0.8, 0.9, 0.9, M.flesh);
    limb(v, [an, kn], [2.8, 3.4], M.pants);
    limb(v, [kn, hip], [3.6, 4.1], M.pants);
    v.capsule([an[0], an[1], an[2] - 0.4], [an[0], an[1], an[2] + 1], 2.9, M.rag);
  }

  // ---- trunk (rest space, posed by the spine): trouser seat + belt, chest, upper-back hump, shoulder domes, then the belly over all of it.
  // Decoration lives in the material: the belly scar (stitched, ripped open into the wound) + drips in front, seams down the back and over the hump.
  const trunk = (px, py, pz) => {
    const dx = px - cx;
    if (py < cy - 8) {
      const e = ((dx + 3) / 3) ** 2 + ((pz - 20) / 2.4) ** 2;
      if (e < 0.42) return M.gore;
      if (e < 1) return M.blood;
      const sp = ((dx + 2.5) / 5.6) ** 2 + ((pz - 19) / 4.4) ** 2 + 0.35 * Math.sin(px * 1.7 + pz * 2.3);
      if (sp < 1) return M.blood;
      const sz = 18 - 0.667 * dx;
      if (Math.abs(dx) < 9.5 && (Math.abs(pz - sz) < 0.6 || (Math.floor(px) % 2 === 0 && Math.abs(pz - sz) < 1.7))) return M.stitch;
      const drip = { [-6]: 15.4, [-5]: 17.2, [-3]: 14, [-2]: 16.6, [0]: 17.6 }[Math.floor(px) - cx];
      if (drip !== undefined && pz < 19 && pz > drip) return M.blood;
    }
    if (py > cy + 6) {
      if (pz > 17 && pz < 37 && (Math.abs(dx) < 0.5 || (Math.floor(pz) % 2 === 0 && Math.abs(dx) < 1.5))) return M.stitch;
      const hz = 33.5 - 0.05 * dx * dx;
      if (Math.abs(dx) > 2 && Math.abs(dx) < 9 && (Math.abs(pz - hz) < 0.5 || (Math.floor(px) % 2 === 0 && Math.abs(pz - hz) < 1.5))) return M.stitch;
    }
    return M.flesh;
  };
  ell(v, T.torso, [cx, cy + 1, 11], [9.5, 8, 4.8], M.pants);
  vol(v, T.torso, cx - 11, cy - 10, 12.4, cx + 11, cy + 10, 14.2, (px, py) => (((px - cx) / 10.2) ** 2 + ((py - cy - 1) / 8.6) ** 2 <= 1 ? M.leather : undefined));
  ell(v, T.torso, [cx, cy + 1, 26], [11.5, 9.5, 9], trunk);
  ell(v, T.torso, [cx, cy + 4.5, 32.5], [8.5, 6.5, 6], trunk);
  for (const s of [-1, 1]) ell(v, T.torso, [cx + s * 9, cy + 1.5, 31], [5.6, 6.2, 5.2], trunk);
  ell(v, T.torso, [cx, cy - 3, 32], [5, 4.5, 3.5], M.flesh);   // neck fill under the jaw
  ell(v, T.torso, [cx, cy - 3.5, 17.5], [12.8, 11, 10], trunk);
  // ragged cloth flap hanging in front from under the belly, blood-soaked
  vol(v, T.torso, cx - 7, cy - 11, 3, cx + 7, cy - 4, 12, (px, py, pz) => {
    const dx = px - cx, w = 5 - (12 - pz) * 0.12; if (Math.abs(dx) > w) return;
    const yf = cy - 8 - (12 - pz) * 0.06; if (py < yf - 1.2 || py > yf + 2) return;
    if (pz < 3.6 + ((Math.floor(px) * 7) % 3) * 0.9) return;
    return Math.sin(px * 1.3) * Math.cos(pz * 0.9) > 0.4 || pz > 10.5 ? M.blood : M.rag;
  });

  // ---- head: small skull + wide jowly jaw, tiny ears, dark green tuft, bandage over the crown and down the left cheek, tusks; posed by the head
  const Th = T.head, hx = cx, hy = HY, hz = HZ;
  const wrap = (px, py, pz) => {
    const dx = px - hx, dz = pz - hz;
    if (Math.abs(dz - 3.2 + 0.35 * dx) < 0.75) return M.bandage;                          // crown band, tilted
    if (dx > 2.6 && dx < 4.4 && dz < 0.6 && dz > -4.4 && py < hy + 1) return M.bandage;    // cheek strap down the left jaw
    return M.skin;
  };
  ell(v, Th, [hx, hy, hz], [4.5, 4.3, 4.6], wrap);
  ell(v, Th, [hx, hy - 0.8, hz - 2.6], [4.8, 4.1, 2.8], wrap);
  for (const s of [-1, 1]) cap(v, Th, [hx + s * 4.2, hy + 0.8, hz + 0.4], [hx + s * 5.2, hy + 1.2, hz + 0.9], 1, M.skin);
  cap(v, Th, [hx, hy - 2.4, hz + 4.1], [hx, hy + 2.6, hz + 4.2], 1.5, M.hair);
  cap(v, Th, [hx, hy - 2, hz + 4.4], [hx + 0.5, hy - 3.2, hz + 6.2], 1.3, M.hair, 0.6);
  for (const s of [-1, 1]) cap(v, Th, [hx + s * 1.6, hy - 4.6, hz - 3.4], [hx + s * 1.8, hy - 5, hz - 1.6], 0.6, M.bone);

  // ---- face, painted on the front-most head voxels only (never on a belly, hand or weapon in front): frowning unibrow, small yellow eyes,
  // nose shadow, a frown. Integer rows from the posed head (paintFront indexes cells).
  const HEAD = new Set([M.skin, M.bandage, M.hair]);
  const paint = (x, z, m) => { const y = v.front(x, z); if (y >= 0 && HEAD.has(v.get(x, y, z))) v.set(x, y, z, m); };
  const ox = Math.round(J.head[0] - hx), ez = HZ + 1 + Math.round(J.head[2] - hz), X = d => cx + ox + d;
  for (const [d, dz] of [[-4, 2], [-3, 1], [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1], [3, 2]]) paint(X(d), ez + dz, M.lash);
  const shut = p.eyes === 'shut';
  for (const [d, m] of [[-3, M.eyeW], [-2, M.pupil], [1, M.pupil], [2, M.eyeW]]) paint(X(d), ez, shut ? M.lash : m);
  for (const d of [-1, 0]) paint(X(d), ez - 1, M.skinD);
  for (const d of [-2, -1, 0, 1]) paint(X(d), ez - 4, M.mouth);
  for (const d of [-3, 2]) paint(X(d), ez - 5, M.mouth);

  // ---- arms: massive bare upper arms; right forearm with a chain spiralled round it; left arm in leather (pauldron, strap, bracer, iron bands)
  for (const k of ['R', 'L']) {
    const sh = J['shoulder' + k], el = J['elbow' + k], hd = J['hand' + k];
    limb(v, [sh, el], [3.7, 3.2], M.flesh);
    limb(v, [el, hd], [3.1, 2.6], M.flesh);
    hand(v, hd, [2.6, 2.6, 2.4], M.flesh);
    if (k === 'R') {
      const ax = sub3(hd, el), u = perp(norm3(ax)), w = norm3(cross3(norm3(ax), u));
      for (let t = 0.1; t < 0.9; t += 0.05) {
        const a = t * 2.4 * 2 * Math.PI, r = 2.9 - t * 0.4, q = add3(add3(el, mul3(ax, t)), add3(mul3(u, r * Math.cos(a)), mul3(w, r * Math.sin(a))));
        v.ellipsoid(q[0], q[1], q[2], 0.8, 0.8, 0.8, M.iron);
      }
    } else {
      band(v, el, hd, 0.08, 0.86, 3.4, M.leather);
      for (const t of [0.14, 0.8]) band(v, el, hd, t - 0.02, t + 0.02, 3.7, M.iron);
      band(v, sh, el, 0.45, 0.7, 3.9, M.leather);
      pauldron(v, sh, [4.4, 4.4, 3.2], M.leather, M.iron, 1.4);
    }
  }

  // ---- the meat hook: chain from the right fist, iron eye, iron shank, the curl and the point bloodied; curls forward and out
  const hR = J.handR, dH = norm3(apM(Rt, p.hook ? aimDir(p.hook, -1) : [-0.55, -0.2, -0.8]));
  const eH = apM(Rt, [-0.3, -0.5, 1]), nH0 = sub3(eH, mul3(dH, dot3(eH, dH)));
  const nH = Math.hypot(...nH0) > 0.3 ? norm3(nH0) : norm3(sub3([0, 0, 1], mul3(dH, dH[2])));
  const c0 = add3(hR, mul3(dH, 1.8)), c1 = add3(c0, mul3(dH, p.chain ?? 1.6));
  chain(v, c0, c1, 0.95, M.iron);
  v.ellipsoid(c1[0], c1[1], c1[2], 1.3, 1.3, 1.3, M.iron);
  jhook(v, add3(c1, mul3(dH, 0.9)), dH, nH, { len: 4.6, R: 3.6, sweep: 215, r0: 1.5, r1: 0.5 }, (px, py, pz, t) => (t > 0.55 ? M.blood : t > 0.22 ? M.steel : M.iron));

  // ---- the cleaver in the left fist: leather grip, broad dark blade beside the grip line (edge forward-out), bright edge
  const hL = J.handL, dC = norm3(apM(Rt, aimDir(p.cleaver || [-78, 40], 1))), eC = apM(Rt, [1, -0.45, 0]);
  const sC = norm3(sub3(eC, mul3(dC, dot3(eC, dC))));
  v.capsule(add3(hL, mul3(dC, -1.4)), add3(hL, mul3(dC, 2)), 0.7, M.leather);
  const b0 = add3(hL, mul3(dC, 1.6)), b1 = add3(hL, mul3(dC, 9.5)), off = mul3(sC, 2.3);
  obox(v, add3(b0, off), add3(b1, off), sC, 2.6, 0.6, (px, py, pz) => (dot3(sub3([px, py, pz], b0), sC) > 3.8 ? M.steel : M.iron));
  return v;
}

const swH = (a, d) => a.map(([el, hd]) => [el, hd + d]);
// Frames are budgeted (a big body is ~5k quads a frame against the 3 MB mesh cap): the mesher shares identical poses, so repeats are the
// same object: idle 0-1-2-1, walk A-pass-B-pass, the attack recovers into idle[0], the cast holds its throw, stunned is one slumped pose.
const IDLE = [0, 1, 2].map(b => ({ bob: -b * 0.25, head: [b * 1.5, 0, 0], armR: HOLD.R.map(([el, hd]) => [el - b, hd]), armL: HOLD.L.map(([el, hd]) => [el - b, hd]) }));
const step = st => ({
  bob: st ? -0.6 : 0, spine: [6, st * 4, st * 4], head: [-4, -st * 3, -st * 3], footR: [0, -st * 2.2, 0], footL: [0, st * 2.2, 0],
  armR: swH(HOLD.R, st * 12), armL: swH(HOLD.L, -st * 12), cleaver: [-72, 20],
});
const WALK = [step(1), IDLE[0], step(-1)];   // the passing pose is idle[0] (one frame fewer)
const THROW = { bob: -0.5, spine: [10, 14, 0], head: [-8, -6, 0], armR: [[10, 80], [24, 86]], armL: HOLD.L, hook: [70, 90], chain: 2, footR: [0, -2.2, 0], footL: [0, 1, 0] };
const SLUMP = { bob: -0.8, spine: [10, 4, 5], head: [12, 8, 6], armR: [[-84, 6], [-86, 20]], armL: [[-84, 6], [-86, 20]], eyes: 'shut' };
/** Anims: idle = slow heavy breathing; walk = a waddle (the trunk rolls over the planted foot), hook trailing; attack = the left cleaver raised
 * high, then chopped down in front; cast = Meat Hook: wound back to the right, then flung forward and held; stunned = slumped, eyes shut. */
export const ANIMS = {
  idle: [IDLE[0], IDLE[1], IDLE[2], IDLE[1]],
  walk: [WALK[0], WALK[1], WALK[2], WALK[1]],
  attack: [
    { spine: [-8, 14, 0], head: [-4, -8, 0], armL: [[40, 20], [60, 0]], armR: HOLD.R, cleaver: [62, 0], footL: [0, 1, 0] },
    { bob: -0.6, spine: [16, -14, 0], head: [-10, 6, 0], armL: [[-10, 70], [-40, 80]], armR: HOLD.R, cleaver: [-76, 80], footL: [0, -2, 0], footR: [0, 1, 0] },
    IDLE[0],
  ],
  cast: [
    { spine: [-6, -18, 0], head: [-2, 10, 0], armR: [[16, -40], [24, -60]], armL: HOLD.L, hook: [-72, -90], footR: [0, 1.2, 0] },
    THROW, THROW,
  ],
  stunned: [SLUMP, SLUMP],
};

/** HUD portrait framing (tools/vox/portrait.mjs): idle, the small head in the upper third with the shoulder domes around it. */
export const PORTRAIT = { pose: ANIMS.idle[0], center: [cx, cy - 4, 34.5], scale: 1.05, fov: 24, sig: '#a8302a', face: [4, 11, 24, 24] };
