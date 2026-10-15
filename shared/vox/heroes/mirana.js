// Voxel Mirana, a chibi of her Dota 2 model (hand-authored): Princess of the Moon riding Sagan, her big white cat. The mount is the model's body
// (quad rig: chunky white cat, heavy shoulders, lilac mane ruff, big round head, long curling tail); the rider is a biped solved on its back
// (hips on the saddle cloth, legs straddling, feet pinned to the flanks). Rider: long dark-brown hair under a small silver crescent tiara, navy armour
// with silver trim and pauldrons, a leather quiver on the back, a big blue recurve bow in her left (+x) hand; a navy saddle cloth with a silver hem
// drapes over the cat's flanks. Signature reads: long white-cat silhouette with the rider on top, silver crescent over brown hair, navy + silver,
// the blue bow. Grid 36 x 50 x 52, ~44 voxels to the rider's crown, faces -y. Built on the kit. No rigOf: the ragdoll wants a lone biped,
// so Mirana dies with the voxel break-apart only.
import { Vox } from '../vox.js';
import { useMat, useIris } from '../mats.js';
import { solve, xfApply } from '../rig.js';
import { LIBRARY } from '../poses.js';
import { limb, band, hand, feet, torso, pauldron, ell, cap, vol, faceWindow, hairShell, stripes, eyes, mouth, decal, bowInHand } from '../parts.js';

export const META = { rig: 'quad', grid: [36, 50, 52], cx: 18, cy: 25 };
const cx = 18, cy = 24;   // rider centre (a little ahead of the cat's middle)
/** Sagan (quad): cF = 16.5 (chest), cB = 35.5 (pelvis). The cat is the bigger half of the silhouette (back at z ~20). */
const CAT = {
  cx, cy: 26, len: 19, shZ: 12.5, hipZ: 12, legX: 4.4, footX: 4.6, upper: 6.6, lower: 6.4,
  neckY: 1, neckZ: 16, headY: -6, headZ: 15, headTopZ: 21.5, jawLen: 3, tail: [4.2, 3.8, 3.4], tailRest: [[-20, -90], [-55, -90], [10, -90]],
};
/** Rider (biped) proportions: a smaller chibi (head ~0.8 Lina) on the saddle (hips at z 19.5). Exported for the portrait defaults. */
export const PROP = {
  cx, cy, hipZ: 19.5, hipX: 2.2, footX: 2.8, ankleY: -0.3, ankleZ: 2.4, thigh: 3.8, shin: 3.6,
  chestZ: 25.5, shX: 3.6, shY: 0.2, shZ: 27, upper: 3.8, fore: 3.8, neckY: 0.3, neckZ: 28.5, headY: -0.3, headZ: 34.4, headTopZ: 40, hairZ: 30,
};
const HZ = PROP.headZ;
// fringe bottom per column dx -6..6: centre part, bangs swept down to the temples
const FRINGE = [-3.6, -2.2, -0.8, 0.2, 1, 1.8, 2.6, 1.8, 1, 0.2, -0.8, -2.2, -3.6].map(z => z * 0.8 + HZ);

export function build(p = {}) {
  const v = new Vox(36, 50, 52), r = p.r || {}, bob = p.bob || 0, trail = r.trail || 0, sway = p.sway || 0;
  const cat = solve('quad', CAT, p), C = cat.J, Tb = cat.T.body, Th = cat.T.head;
  const rp = { ...r, bob: bob + (r.bob || 0), pin: {} };
  for (const [k, s] of [['R', -1], ['L', 1]]) {   // rider feet on the cat's flanks, knees forward (IK)
    rp.pin['ankle' + k] = [cx + s * 7.3, cy - 2.4, 14 + rp.bob];
    rp.pin['foot' + k] = [cx + s * 7.5, cy - 2.8, 11.6 + rp.bob];
  }
  const rig = solve('biped', PROP, rp), J = rig.J, T = rig.T;
  const M = {
    fur: useMat(v, 'fur', { ramp: ['#6c6a8a', '#a4aec0', '#d4dae4', '#f4f6fa'] }),
    furL: useMat(v, 'furL', { ramp: ['#7a7896', '#b8c0d0', '#e4e8f0', '#ffffff'] }),
    furD: useMat(v, 'furD', { ramp: ['#4c4a66', '#7e8498', '#a6aebc', '#c8ced8'] }),
    furP: useMat(v, 'furP', { ramp: ['#2c2458', '#4e4892', '#7a76c0', '#a8a6e0'] }),
    claw: useMat(v, 'claw', { ramp: ['#1a1622', '#38343e', '#58545e', '#7a7680'] }),
    maw: useMat(v, 'maw', { ramp: ['#1e0810', '#4a1420', '#6e2230', '#8e3a44'] }),
    nose: useMat(v, 'nose', { ramp: ['#2a1e2a', '#5a4450', '#7e6470', '#a08894'] }),
    skin: useMat(v, 'skin', { ramp: ['#a8604e', '#dc9682', '#f2b8a0', '#ffd8c0'] }),
    hair: useMat(v, 'hair', { ramp: ['#1e100a', '#3e2414', '#5e3820', '#80522e'] }),
    hairD: useMat(v, 'hairD', { ramp: ['#160a08', '#30180e', '#4a2a18', '#6a4024'] }),
    navy: useMat(v, 'navy', { ramp: ['#0c0e24', '#1a2450', '#2c3c78', '#4a5ea0'] }),
    navyD: useMat(v, 'navyD', { ramp: ['#080a1a', '#121a3a', '#1e2a5a', '#34467e'] }),
    sky: useMat(v, 'sky', { ramp: ['#24407e', '#4a7cd0', '#7eb0f4', '#c4e0ff'] }),
    blue: useMat(v, 'blue', { ramp: ['#1a2456', '#34509a', '#5a7ccc', '#9ab8ee'] }),
    silver: useMat(v, 'silver', { ramp: ['#3a3e5a', '#7e8aa6', '#b4bed4', '#e8eef8'] }),
    leather: useMat(v, 'leather', { ramp: ['#3a1608', '#6e3014', '#a0521e', '#c8783a'] }),
    string: useMat(v, 'string', { ramp: ['#5a6080', '#9ca4bc', '#c8d0e0', '#eef2fa'] }),
    gem: useMat(v, 'gem', { emit: '#9ad8ff', tier: 'signature', gain: 0.9 }),
    lash: useMat(v, 'lash'),
    ...useIris(v, 'ice'),
    pupil: useMat(v, 'pupil'),
    shine: useMat(v, 'shine', { gain: 0.95 }),
    blush: useMat(v, 'blush'),
    mouth: useMat(v, 'mouth'),
  };

  // ================= Sagan =================
  // ---- legs: thick front legs, haunches behind, round paws with dark claws
  for (const k of ['R', 'L']) {
    const s = k === 'R' ? -1 : 1;
    const fs = C['shoulderF' + k], fk = C['kneeF' + k], ff = C['footF' + k];
    limb(v, [fs, fk, [ff[0], ff[1], ff[2] + 1.2]], [3.3, 2.4, 2.1], M.fur);
    feet(v, ff, 'paw', M.furL, { hw: 2.4, len: 2.6, toe: M.claw });
    const bh = C['hipB' + k], bk = C['kneeB' + k], bf = C['footB' + k];
    ell(v, Tb, [cx + s * 4, 33, 12], [2.9, 4.4, 4.8], M.fur);   // haunch
    limb(v, [bh, bk, [bf[0], bf[1], bf[2] + 1.2]], [3, 2.2, 1.9], M.fur);
    feet(v, bf, 'paw', M.furL, { hw: 2.1, len: 2.4, toe: M.claw });
  }
  // ---- body: heavy chest, leaner rear, grey belly; lilac over the shoulders
  const bodyMat = (px, py, pz) => (pz < 9.2 ? M.furD : pz > 18.4 && Math.abs(px - cx) < 2.2 && py < 22 ? M.furP : M.fur);
  ell(v, Tb, [cx, 19.5, 13.5], [7, 6.6, 6.6], bodyMat);
  cap(v, Tb, [cx, 20, 13.4], [cx, 31, 13], 6.2, bodyMat, 5.6);
  ell(v, Tb, [cx, 32, 13], [6, 6, 5.8], bodyMat);
  // ---- tail: long, rising, curling up, lilac tip
  limb(v, [C.pelvis, C.tail1, C.tail2, C.tail3], [1.7, 1.5, 1.4, 1.6], (px, py, pz) => (pz > C.tail2[2] + 1 ? M.furP : M.fur));
  // ---- saddle cloth: navy shell hugging the back and flanks, silver hem
  vol(v, Tb, cx - 9, 19, 8, cx + 9, 32, 21, (px, py, pz) => {
    const d = ((px - cx) / 7.9) ** 2 + ((py - 25.5) / 6.6) ** 2 + ((pz - 14) / 6.8) ** 2;
    if (d > 1 || d < 0.72) return;
    return pz < 9.8 || Math.abs(py - 25.5) > 5.4 ? M.silver : Math.abs(py - 25.5) > 4.4 ? M.blue : M.navy;
  });
  // ---- head: mane ruff, big round skull, cheek ruffs, muzzle, nose, jaw, small round ears
  ell(v, Tb, [cx, 15.2, 17.4], [6.2, 3.8, 5.2], (px, py, pz) => (pz > 19.6 && Math.abs(px - cx) < 2.8 ? M.furP : M.fur));
  const hc = [cx, CAT.cy - CAT.len / 2 + CAT.headY, CAT.headZ];   // rest head centre (18, 13, 14.5)
  ell(v, Th, hc, [6.4, 5.6, 5.6], (px, py, pz) => (pz > hc[2] + 2.6 && Math.abs(px - cx) < 2.4 && py > hc[1] - 3 ? M.furP : M.fur));
  for (const s of [-1, 1]) {
    ell(v, Th, [cx + s * 5, hc[1] + 0.4, hc[2] - 2], [2.6, 3, 3.2], M.furL);
    ell(v, Th, [cx + s * 4.2, hc[1] + 1.6, hc[2] + 4.8], [1.6, 1, 1.7], M.furP);
  }
  const jw = (p.jaw || 0) / 40;
  ell(v, Th, [cx, hc[1] - 3.6, hc[2] - 3.4 + jw * 0.4], [2.2, 1.8, 1], M.maw);
  cap(v, Th, [cx, hc[1] - 1.4, hc[2] - 3.6], [cx, hc[1] - 4.2 + jw * 0.6, hc[2] - 3.8 - jw * 1.6], 1.6, M.furL, 1.3);   // lower jaw
  ell(v, Th, [cx, hc[1] - 4.4, hc[2] - 1.8], [3.6, 2.4, 2.3], M.furL);   // muzzle
  ell(v, Th, [cx, hc[1] - 6.6, hc[2] - 0.7], [1.3, 0.8, 0.8], M.nose);
  // cat eyes: painted on the front-most voxels at the posed eye spots
  const cs = p.eyes || 'open';
  for (const s of [-1, 1]) {
    const e = xfApply(Th, [cx + s * 2.6, hc[1] - 4, hc[2] + 1.4]), ex = Math.round(e[0] - 0.5), ez = Math.round(e[2] - 0.5);
    if (cs === 'x') { decal(v, [[ex, ez], [ex + 1, ez + 1], [ex, ez + 1], [ex + 1, ez]], M.lash); continue; }
    decal(v, [[ex, ez + 1], [ex + 1, ez + 1]], M.lash);
    decal(v, [[ex, ez], [ex + 1, ez]], M.iris);
    decal(v, [[s > 0 ? ex : ex + 1, ez], [s > 0 ? ex : ex + 1, ez]], M.pupil);
  }

  // ================= Mirana =================
  // ---- legs: dark boots + greaves, bare thighs, silver knee guards
  for (const k of ['R', 'L']) {
    const f = J['foot' + k], hip = J['hip' + k], kn = J['knee' + k], an = J['ankle' + k];
    feet(v, f, 'boot', M.navyD, { hw: 1.2, front: 2.2, back: 1, h: 2.6, toeY: 1.5, toeZ: 1.7, tipY: 1.9, tipW: 1 });
    limb(v, [an, kn], [1.15, 1.2], M.navy);
    limb(v, [kn, hip], [1.25, 1.5], M.skin);
    v.ellipsoid(kn[0], kn[1] - 0.4, kn[2], 1.3, 1.1, 1.1, M.silver);
  }
  // ---- hips on the saddle, armoured torso (navy, silver belt + neckline, leather quiver strap), bare shoulders
  ell(v, T.torso, [cx, cy + 0.4, PROP.hipZ + 0.6], [3.2, 2.8, 1.8], M.navy);
  torso(v, T.torso, { c: [cx, cy], z0: PROP.hipZ - 0.5, z1: PROP.neckZ + 0.6, r: 5 }, (dx, dy, z) => {
    const rx = z < 2.6 ? 3 : z < 4.2 ? 2.5 : 2.8 + Math.min(1, (z - 4.2) / 2.4) * 0.4 - Math.max(0, z - 8.2) * 0.6;
    const ry = 2.2 + (dy < 0 && z > 4.6 && z < 7.8 ? 0.6 : 0);
    if ((dx / rx) ** 2 + (dy / ry) ** 2 > 1) return;
    const neck = 7.9 - (dy < 0 ? 0.8 * Math.max(0, 1 - Math.abs(Math.abs(dx) - 1.4) / 1.4) : -0.4);
    if (z > neck + 0.9) return M.skin;
    if (z > neck) return M.silver;
    if (z > 1.8 && z < 2.7) return M.silver;   // belt
    if (dy < -1 && z > 2.7 && z < 7.8 && Math.abs(dx + (z - 5.4) * 0.6) < 0.6) return M.leather;   // quiver strap
    return z < 4.6 ? M.navyD : M.navy;
  });
  // quiver on the back (right shoulder up), arrows with blue fletching
  cap(v, T.torso, [cx - 5, cy + 3.4, PROP.hipZ + 0.6], [cx - 2, cy + 4.8, PROP.hipZ + 10], 2, (px, py, pz, t) => (t > 0.86 || (t > 0.28 && t < 0.38) ? M.silver : M.leather), 2.3);
  for (const [dx, dy] of [[0, 0], [1.2, 0.6], [-1, 0.8]]) cap(v, T.torso, [cx - 1.8 + dx, cy + 4.9 + dy, PROP.hipZ + 10.4], [cx - 1.2 + dx, cy + 5.2 + dy, PROP.hipZ + 13], 0.7, M.blue);
  cap(v, T.torso, [cx, cy + 0.3, PROP.neckZ - 0.6], [cx, cy + 0.3, PROP.neckZ + 1.6], 1.4, M.skin);
  // ---- arms: silver pauldrons, bare upper arms, navy bracers with silver cuffs, dark gloves
  for (const k of ['R', 'L']) {
    const sh = J['shoulder' + k], el = J['elbow' + k], hd = J['hand' + k];
    limb(v, [sh, el], [1.1, 0.95], M.skin);
    v.capsule(el, hd, 1, (px, py, pz, t) => (t > 0.75 ? M.silver : M.navy), 1.2);
    hand(v, hd, [1.1, 1.1, 1], M.navyD);
    pauldron(v, sh, [1.9, 1.9, 1.4], M.blue, M.silver, 0.6);
  }
  // ---- head: brown hair shell, face window, long back mass + a flowing lock, silver crescent tiara with a moon gem
  const Rh = T.head, [hx, hy, hz] = [cx, cy + PROP.headY, HZ], hcen = J.head;
  const win = faceWindow({ cx, yCut: hy - 1.4, halfW: 5.4, fringe: FRINGE });
  const hair = (px, pz) => stripes(M.hair, M.hairD, 3, HZ + 3)(px, pz);
  hairShell(v, Rh, { c: [hx, hy + 0.5, hz + 0.4], r: [6.8, 6.4, 6.6], win, face: { c: [hx, hy, hz], r: [6.2, 5.8, 6], m: M.skin }, head: [cx, cy], sway,
    back: { w: 6.6, wZ: HZ - 5, wK: 0.1, depth: 6.2, dZ: HZ - 3, dK: 0.1, tip: HZ - 9.6, tipJag: 1.4, box: [-8, 1, HZ - 11, 8, 8, HZ + 1] } }, hair);
  const sw = Math.sin(sway * Math.PI / 2) * 0.6;
  limb(v, [[hx, hy + 5.2, hz - 2.5], [hx + sw, hy + 7 + trail * 2, hz - 7.5 + trail], [hx + sw * 1.6, hy + 7.8 + trail * 4, hz - 12.5 + trail * 3]].map(q => xfApply(Rh, q)),
    [2.1, 1.8, 1], (px, py, pz) => hair(px, pz));
  const tiara = [[-4.8, -3.4, 2.4], [-2.6, -5.2, 3.6], [0, -5.9, 4.1], [2.6, -5.2, 3.6], [4.8, -3.4, 2.4]].map(([a, b, c]) => xfApply(Rh, [hx + a, hy + b, hz + c]));
  limb(v, tiara, [0.5, 0.5, 0.5, 0.5, 0.5], M.silver);
  for (const s of [-1, 1]) {   // crescent horns curling up and in
    limb(v, [[s * 0.8, -5.9, 4.2], [s * 1.7, -5.6, 5.6], [s * 1.1, -5.3, 6.6]].map(([a, b, c]) => xfApply(Rh, [hx + a, hy + b, hz + c])), [0.6, 0.5, 0.4], M.silver);
  }
  const g = xfApply(Rh, [hx, hy - 6, hz + 4.3]); v.ellipsoid(g[0], g[1], g[2], 0.6, 0.6, 0.6, M.gem);
  // ---- face, painted on the front-most voxels (follows the posed head)
  const ox = Math.round(hcen[0] - cx), oz = Math.round(hcen[2] - HZ), ez = Math.round(HZ - 4) + oz;
  eyes(v, { at: [[cx - 3 + ox], [cx + 2 + ox]], z: ez, style: 'dot', state: r.eyes }, M);   // small dark eyes on skin
  decal(v, [[cx - 5 + ox, ez - 1], [cx + 4 + ox, ez - 1]], M.blush);
  mouth(v, [[cx + ox, ez - 2], [cx - 1 + ox, ez - 2]], M.mouth);
  // ---- bow in the left hand (after the face so a raised bow never takes the eye paint)
  const B = r.bow || {};
  bowInHand(v, rig, 'L', { up: B.up || [0.4, -0.45, 1], fwd: B.fwd || [1, 0.2, 0], len: 8, bend: 2.6, recurve: 1.2, r: 1.1, draw: B.draw ? J.handR : null },
    { limb: M.sky, grip: M.leather, string: M.string, tip: M.silver });
  return v;
}

const range = n => [...Array(n).keys()];
const Q = LIBRARY.quad({ stride: 2.2, lift: 1, bob: 0.4, wag: 14 });
const IDLE_R = [[-62, 30], [-36, 74]], IDLE_L = [[-24, -6], [-46, 14]];
const tw = (a, d) => a.map(([el, hd]) => [el + d, hd]);
const AIM = { up: [0, 0, 1], fwd: [0, -1, 0] }, OVER = { up: [1, 0, 0.1], fwd: [0, 0, 1] };
const calm = (i, o = {}) => ({ ...Q.idle[i % 4], ...o });
/** Anims: Sagan carries the quad library (idle breathing, walk, stunned slump); Mirana rides it. Attack = nock, full draw (string to the chest),
 * release; cast (Starfall) = bow lifted overhead, flat; stunned = rider slumped, both x-eyed. */
export const ANIMS = {
  idle: [0, 2, 2, 0].map(i => ({ ...Q.idle[i], sway: i / 2, r: { armR: tw(IDLE_R, i), armL: tw(IDLE_L, -i), head: [i, 0, 0], spine: [2, 0, 0] } })),
  walk: [0, 1, 2, 1].map(i => Q.walk[i]).map((q, i) => { const st = [1, 0, -1, 0][i]; return { ...q, r: { bob: [0.3, 0, 0.3, 0][i], spine: [12, st * 3, 0], head: [-10, 0, 0], armR: [[-40, 60], [-24, 84]], armL: tw([[-62, -10], [-50, 10]], st * 4), trail: 1 } }; }),
  attack: [
    calm(0, { r: { spine: [4, 0, 0], armL: [[-20, 70], [-10, 82]], reachR: [3, -3.4, -1], bow: { ...AIM, draw: true } } }),
    calm(1, { r: { spine: [6, 0, 0], head: [-4, 0, 0], armL: [[2, 86], [0, 90]], reachR: [3.4, -1.4, 0.6], bow: { ...AIM, draw: true } } }),
    calm(2, { r: { spine: [8, 0, 0], head: [-4, 0, 0], armL: [[2, 86], [0, 90]], armR: [[8, -30], [4, -50]], bow: AIM, trail: 0.4 } }),
  ],
  cast: [
    calm(0, { head: [-6, 0, 0], r: { spine: [-2, 0, 0], armL: [[20, 50], [40, 40]], armR: [[10, 50], [30, 40]], bow: OVER } }),
    calm(1, { head: [-14, 0, 0], r: { spine: [-6, 0, 0], head: [-12, 0, 0], armL: [[62, 30], [76, 20]], armR: [[62, 30], [76, 20]], bow: OVER } }),
    null,
  ],
  stunned: Q.stunned.map((q, i) => ({ ...q, r: { spine: [10, [4, -4][i], [4, -4][i]], head: [8, [6, -6][i], [4, -4][i]], armR: [[-80, 10], [-84, 20]], armL: [[-78, 8], [-82, 16]], eyes: 'x' } })),
};
ANIMS.cast[2] = ANIMS.cast[1];   // hold the overhead bow; idle / walk share frames too (GPU budget < 3 MB with two bodies per frame)

/** HUD portrait framing (tools/vox/portrait.mjs): the rider's face in the upper third. */
export const PORTRAIT = { pose: ANIMS.idle[0], center: [cx + 0.4, cy, HZ - 1.6], scale: 1.2, fov: 24, sig: '#9ab8ff', face: [4, 11, 24, 24] };
