// Voxel Drow Ranger, a chibi of her Dota 2 model (hand-authored): a tall pointed dark indigo hood leaning back over long silver-white hair that
// falls in two sheets to the chest; pale lilac skin; dark navy leather armour (bodice with a skin V at the neck, layered steel-blue pauldrons,
// bracers, tall boots); a deep blue cape from the shoulders to the floor; a big dark recurve bow held low across the front in her left hand,
// its recurved tips glowing cyan; a quiver on the back. Signature reads: pointed hood + silver hair sheets framing a pale face, one dark navy
// scheme with the blue cape, the bow across the front with cyan tips (the only glow besides the eyes).
// Grid 40 x 42 x 52, ~42 voxels tall to the hood point, faces -y. Built on the kit (sample: crystal_maiden.js).
import { Vox } from '../vox.js';
import { useMat, useIris } from '../mats.js';
import { solve, xfApply, norm3, add3, mul3, sub3 } from '../rig.js';
import { limb, band, hand, feet, torso, skirt, pauldron, ell, cap, vol, faceWindow, hairShell, decal, stripes, bow } from '../parts.js';

export const META = { rig: 'biped', grid: [40, 42, 52], cx: 20, cy: 20 };
const cx = 20, cy = 20;
const U = 2;   // leg length over the base chibi (as Lina / Crystal Maiden)
export const PROP = {
  cx, cy, hipZ: 8 + U, hipX: 2.1, footX: 2.6, ankleY: -0.3, ankleZ: 3.5, thigh: 3.8, shin: 3.4,
  chestZ: 16 + U, shX: 4.2, shY: 0.3, shZ: 18.4 + U, upper: 4.4, fore: 4.4, neckY: 0.3, neckZ: 20.4 + U, headY: -0.4, headZ: 28.4 + U, headTopZ: 35 + U, hairZ: 22 + U,
};
const HZ = PROP.headZ, SKULL = [5.4, 5.1, 6];
// hair fringe bottom per column dx -6..6: parted in the middle, sweeping down past the temples
const FRINGE = [26, 28, 31.6, 33, 33.8, 34.6, 34.6, 33.8, 33, 31.6, 28, 26, 25].map(z => z + (HZ - 30.4));
const HOLD_L = [-2.6, -5, -7.2];   // left hand low in front of the hip, gripping the bow (reach from the left shoulder, torso frame)
const HOLD_R = [2.8, -3.6, -7.6];  // right hand near the string

/** Bow pose [tilt, yaw, len]: tilt 0 = limbs across the front (her right tip slightly down), 90 = upright; yaw turns the bow face (degrees). */
const bowAxes = (tilt, yaw) => {
  const t = tilt * Math.PI / 180, w = yaw * Math.PI / 180;
  const d = norm3([-Math.cos(t) * Math.cos(w), -Math.cos(t) * Math.sin(w), Math.sin(t)]);   // from the grip toward her right / up
  const n = norm3([-Math.sin(w) * 0.6, Math.cos(w) * 0.6, 0.8 * Math.cos(t)]);                       // string side: toward her and up (limbs curve up)
  return [d, n];
};

/** Pose p: a biped rig pose (rig.js) + bow [tilt, yaw] (gripped in the left hand), trail (cape swept back 0..1), eyes. */
export const rigOf = p => solve('biped', PROP, p).J;

export function build(p = {}) {
  const v = new Vox(40, 42, 52), rig = solve('biped', PROP, { reachL: HOLD_L, reachR: HOLD_R, ...p }), J = rig.J, T = rig.T, trail = p.trail || 0;
  const M = {
    skin: useMat(v, 'skin', { ramp: ['#4e4680', '#8a84bc', '#b4aedc', '#dcd8f4'] }),
    hair: useMat(v, 'hair', { ramp: ['#5e5c94', '#a4a8d2', '#d0d4ee', '#f2f4ff'] }),
    hairD: useMat(v, 'hairD', { ramp: ['#46447a', '#8082b6', '#aaaed4', '#ccd0ea'] }),
    hood: useMat(v, 'hood', { ramp: ['#120e24', '#262246', '#3a3666', '#5c5890'] }),
    lining: useMat(v, 'lining', { ramp: ['#0a0a16', '#141428', '#22223c', '#3c3c5e'] }),
    cape: useMat(v, 'cape', { ramp: ['#0a1430', '#163064', '#22489a', '#4070c0'] }),
    capeD: useMat(v, 'capeD', { ramp: ['#080e22', '#0e1e40', '#183064', '#2c4c8a'] }),
    navy: useMat(v, 'navy', { ramp: ['#0a0e1c', '#18243c', '#283a58', '#40567c'] }),
    steel: useMat(v, 'steel', { ramp: ['#141c2e', '#2a3a54', '#465a78', '#7890b0'] }),
    legs: useMat(v, 'legs', { ramp: ['#06080e', '#10141e', '#1c2232', '#343c52'] }),
    wood: useMat(v, 'wood', { ramp: ['#101a30', '#22385c', '#34507c', '#5878a4'] }),
    string: useMat(v, 'string', { ramp: ['#4a5470', '#7c88a8', '#a8b4cc', '#d0d8e8'] }),
    tip: useMat(v, 'tip', { emit: '#2ab8e6', tier: 'signature', gain: 1 }),
    tipL: useMat(v, 'tipL', { emit: '#9ae8ff', tier: 'signature', gain: 1 }),
    lash: useMat(v, 'lash'),
    ...useIris(v, 'ice'),
    pupil: useMat(v, 'pupil', { emit: '#14284a', tier: 'eye' }),
    shine: useMat(v, 'shine', { gain: 0.9 }),
    mouth: useMat(v, 'mouth', { emit: '#6a3a6a', tier: 'eye' }),
  };

  // ---- cape: one deep blue bell from the shoulders to the floor behind her (front open), darker outer edges. Drawn first: the body overwrites it.
  const CZ = 21 + U, lean = 0.06 + trail * 0.26, cc = [cx, cy + 1.4];
  skirt(v, T.torso, {
    c: cc, z0: 0, z1: CZ, zr: CZ, h: CZ, r0: 4.6, dr: 3.4 + trail * 0.6, sy: 0.82, shell: 2, open: 118 - trail * 8, lean, hemH: 1.2,
    floor: phi => 0.8 + trail * 1.6 + (phi < 2 ? (2 - phi) * 1.4 : 0),
  }, M.cape, M.capeD);
  vol(v, T.torso, cx - 10, cy - 8, 0, cx + 10, cy + 20, CZ, (px, py, pz, x, y, z) => {
    if (v.get(x, y, z) !== M.cape) return;
    const dx = px - cc[0], dy = (py - cc[1] - lean * (CZ - pz)) / 0.82, phi = Math.acos(Math.max(-1, Math.min(1, -dy / (Math.hypot(dx, dy) || 1))));
    return phi < 1.9 ? M.capeD : undefined;
  });

  // ---- quiver on the back, slanted over her right shoulder, cyan-tipped fletching
  const q0 = [cx + 2.6, cy + 4.2, 11 + U], q1 = [cx - 2.4, cy + 4, 21.6 + U];
  cap(v, T.torso, q0, q1, 1.5, M.navy, 1.7);
  band(v, xfApply(T.torso, q0), xfApply(T.torso, q1), 0.86, 0.94, 1.9, M.steel);
  for (const [ox, oy] of [[-0.6, -0.3], [0.7, 0.4], [0, 0.9]]) cap(v, T.torso, [q1[0] + ox, q1[1] + oy, q1[2]], [q1[0] - 1.2 + ox, q1[1] + oy, q1[2] + 2.6], 0.5, M.tip);

  // ---- legs: dark leggings, tall dark boots to the knee with a steel cuff and knee plate
  for (const k of ['R', 'L']) {
    const f = J['foot' + k], kn = J['knee' + k], hip = J['hip' + k];
    feet(v, f, 'boot', M.navy, { hw: 1.5, front: 3.2, back: 1.3, h: 2.2, tipW: 0.8 });
    const top = add3(kn, [0, -0.2, 0.4]);
    limb(v, [[f[0], f[1] - 0.3, f[2] + 1.2], top], [1.8, 2.1], M.navy);
    v.capsule(top, add3(top, [0, 0, 0.4]), 2.1, M.steel);
    limb(v, [kn, hip], [1.45, 1.65], M.legs);
  }

  // ---- bodice: dark navy leather, pinched waist, a steel belt; short tassets over the hips; a pale skin V at the neckline
  torso(v, T.torso, { c: [cx, cy], z0: 9.6 + U, z1: 20.8 + U, r: 6 }, (dx, dy, z) => {
    const rx = 3 - Math.max(0, 3.6 - z) * 0.05 + Math.max(0, z - 5) * 0.16, ry = 2.3 + (dy < 0 && z > 6 && z < 9.4 ? 0.5 : 0);
    if ((dx / rx) ** 2 + (dy / ry) ** 2 > 1) return;
    if (z > 1.6 && z < 2.6) return M.steel;
    if (dy < -1.2 && z > 5.4 && Math.abs(dx) < (z - 5.4) * 0.8) return M.skin;
    return M.navy;
  });
  skirt(v, T.torso, { c: [cx, cy + 0.2], z0: 7.4 + U, z1: 10.6 + U, zr: 10.6 + U, h: 3.6, r0: 3.6, dr: 1, sy: 0.82, shell: 1, open: 40, hemH: 0.8, floor: () => 7.4 + U }, M.navy, M.steel);

  // ---- shoulders: navy mantle, layered steel-blue pauldrons (two tiers)
  ell(v, T.torso, [cx, cy + 0.6, 19.6 + U], [5.6, 3.8, 2.2], M.navy, (px, py, pz) => pz > 19 + U && (Math.abs(px - cx) > 2.6 || py > cy + 0.4));
  cap(v, T.torso, [cx, cy + 0.3, 20 + U], [cx, cy + 0.3, 22 + U], 1.5, M.skin);   // neck

  for (const k of ['R', 'L']) {
    const sh = J['shoulder' + k];
    pauldron(v, sh, [2.6, 2.6, 2], M.steel, M.navy, 0.6);
    pauldron(v, add3(sh, [0, 0, -1.4]), [2.2, 2.3, 1.4], M.navy, M.steel, 0.2);
  }

  // ---- arms: dark sleeves, steel-banded bracers, pale hands
  for (const k of ['R', 'L']) {
    const sh = J['shoulder' + k], el = J['elbow' + k], hd = J['hand' + k], e = norm3(sub3(el, hd));
    limb(v, [sh, el], [1.1, 1], M.navy);
    const a = add3(hd, mul3(e, 0.7)), b = add3(el, mul3(e, 0.2));
    v.capsule(a, b, 1.1, M.navy, 1.4);
    for (const t of [0.15, 0.7]) band(v, a, b, t, t + 0.08, 1.25 + t * 0.3, M.steel);
    hand(v, hd, [1, 1, 1], M.skin);
  }

  // ---- head: silver hair shell parted in the middle + two long sheets to the chest; skin carved back into the face window; then the pointed hood
  const Th = T.head, [hx, hy, hz] = [cx, cy + PROP.headY, HZ];
  const win = faceWindow({ cx, yCut: hy - 1.4, halfW: 5, fringe: FRINGE });
  const hair = (px, pz) => (pz > hz + 4 ? M.hair : stripes(M.hair, M.hairD, 3, hz + 4)(px, pz));
  hairShell(v, Th, {
    c: [hx, hy + 0.5, hz + 0.5], r: [SKULL[0] + 0.9, SKULL[1] + 0.9, SKULL[2] + 0.8], win, face: { c: [hx, hy, hz], r: SKULL, m: M.skin }, head: [cx, cy],
    curtains: { inner: 4.2, outer: 6, outerK: -0.04, zRef: hz, front: -5.6, frontK: -0.08, back: -0.6, tip: hz - 10.6, tipStep: 0.8, tipX: 4.4, tipK: 1.2, box: [-9, -8, hz - 13, 9, 4, hz + 4] },
  }, hair);
  // hood: dark indigo shell with a dark lining at the rim, open in front of the face, a tall point leaning back off the crown
  const hoodWin = (px, py, pz) => (Math.abs(px - cx) < 6.4 && pz < hz + 5.4 && py < hy - 2.4 + Math.max(0, hz - 1 - pz) * 1.4) || (pz < hz - 2.6 && py < hy + 3.4);
  ell(v, Th, [hx, hy + 1.2, hz + 1], [7.1, 7, 7.4], (px, py, pz) => (py < hy - 3.6 || (py < hy - 1.8 && pz > hz + 4.4) ? M.lining : M.hood), (px, py, pz) => !hoodWin(px, py, pz));
  cap(v, Th, [hx, hy + 2.2, hz + 6], [hx, hy + 5.4, hz + 11.6], 3.2, M.hood, 0.5);

  // ---- face, painted on the front-most voxels (follows the posed head)
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

  // ---- bow in the left hand (after the face so it never takes the eye paint): dark limbs, glowing cyan recurve tips, pale string
  const [tilt, yaw, len] = p.bow || [-8, 6, 13], [d, n] = bowAxes(tilt, yaw);
  bow(v, J.handL, d, n, { len, bend: 4.8, recurve: 1.3, r: 0.85 }, { limb: M.wood, tip: (px, py, pz) => (Math.floor(px + py + pz) % 3 === 0 ? M.tipL : M.tip), grip: M.navy, string: M.string });
  return v;
}

const range = n => [...Array(n).keys()];
/** Anims: idle with the bow held low across the front; walk with the bow carried at her left side and the cape trailing; attack = bow raised
 * upright in front, string drawn to the cheek, release; cast (Gust) = bow swept out to the side, right hand thrust forward; stunned slump. */
export const ANIMS = {
  idle: range(4).map(i => {
    const b = [0, 1, 2, 1][i];
    return { bob: -b * 0.2, head: [b * 1.2, 0, 0], reachL: [-2.6, -5, -7.2 + b * 0.2], bow: [-8 + b, 6, 13] };
  }),
  walk: range(4).map(i => {
    const st = [1, 0, -1, 0][i];
    return {
      bob: [-0.4, 0, -0.4, 0][i], spine: [12, st * 4, 0], head: [-8, -st * 3, 0], footR: [0, -st * 1.6, i === 3 ? 0.4 : 0], footL: [0, st * 1.6, i === 1 ? 0.4 : 0],
      reachL: [-0.4, -2.6 + st, -7.4], reachR: [1, -1 - st * 1.6, -7.4], bow: [-60, 80, 12], trail: 1,
    };
  }),
  attack: [
    { spine: [0, -10, 0], head: [0, 6, 0], reachL: [-3.2, -6.6, -1.6], reachR: [1.6, -5.4, -1.6], bow: [80, 10, 10], trail: 0.2 },
    { spine: [0, -16, 0], head: [-2, 12, 0], reachL: [-3.4, -7.4, -0.8], reachR: [2.6, 0.4, 0.6], bow: [84, 14, 10], footL: [0, -1, 0], trail: 0.3 },
    { bob: -0.3, spine: [4, -8, 0], head: [-2, 6, 0], reachL: [-3, -7, -1.4], reachR: [3.6, -1, -3.6], bow: [76, 10, 10], trail: 0.5 },
  ],
  cast: [
    { spine: [-4, 6, 0], head: [-2, 0, 0], reachL: [1.4, -3, -5], reachR: [-1, -3, -1], bow: [-30, 50, 10], trail: 0.1 },
    { bob: -0.4, spine: [10, -4, 0], head: [-6, 0, 0], reachL: [1.6, -2, -6], reachR: [1.2, -7.4, -2], bow: [-30, 50, 10], footR: [0, -1.6, 0], trail: 0.6 },
  ],
  stunned: range(2).map(i => ({
    bob: -0.6, spine: [6, [3, -3][i], 0], head: [8, [6, -6][i], [4, -4][i]], reachL: [-1, -2, -8.4], reachR: [1, -1.4, -8.4], bow: [-50, 70, 10], eyes: 'x',
  })),
};

/** HUD portrait framing (tools/vox/portrait.mjs): idle, the face under the hood in the upper third. */
export const PORTRAIT = { pose: ANIMS.idle[0], center: [cx, cy, 30.6], scale: 1.15, fov: 24, sig: '#2ab8e6', face: [4, 11, 24, 24] };
