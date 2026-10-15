// Voxel Lina, a chibi of her Dota 2 model (hand-authored): copper-orange hair parted in the middle, swept back to the shoulders with flame-like
// flicks; deep crimson corset with gold trim and a gold flame motif, bare shoulders, a gold choker; crimson forearm sleeves with gold cuffs;
// a long crimson gown split open in front whose two pointed tails flare out and back to the ground; thigh-high crimson boots; arms held out
// wide, palms up, a flame in her left (+x) hand. Signature reads: wide triangle silhouette (arms out + flaring tails), swept orange hair,
// crimson + gold (orange only in the hair and the fire), fire in the palm. Grid 40 x 34 x 48, ~44 voxels tall, faces -y. Built on the kit.
import { Vox } from '../vox.js';
import { useMat, useIris, useFlame } from '../mats.js';
import { solve, xfApply } from '../rig.js';
import { limb, band, hand, feet, torso, skirt, ell, cap, vol, faceWindow, hairShell, stripes, eyes, mouth, decal, flame } from '../parts.js';

export const META = { rig: 'biped', grid: [40, 38, 48], cx: 20, cy: 18 };
const cx = 20, cy = 18;
/** Biped proportions: chibi (head ~ 40% of the height), short legs, shoulders high (bare shoulders above the corset). */
const U = 2;   // leg length over the base chibi (every body height below is + U)
export const PROP = {
  cx, cy, hipZ: 8 + U, hipX: 2.4, footX: 2.8, ankleY: -0.3, ankleZ: 3.5, thigh: 3.8, shin: 3.4,
  chestZ: 16 + U, shX: 4.4, shY: 0.2, shZ: 18 + U, upper: 4.8, fore: 5, neckY: 0.3, neckZ: 20 + U, headY: -0.3, headZ: 28 + U, headTopZ: 34.6 + U, hairZ: 22 + U,
};
// fringe bottom per column dx -6..6: parted in the middle (high), swept down to the temples (the likeness lever)
const FRINGE = [26.6, 28, 29.4, 30.4, 31.2, 31.8, 32.6, 31.8, 31.2, 30.4, 29.4, 28, 26.6].map(z => z + U);
// hair flicks in head rest space, offsets from the head centre: [from, to, r0, r1] (s = side); flame-like tips swept back and out
const FLICKS = s => [
  [[s * 7, 2, -2], [s * 11.2, 3.6, -6.4], 2.6, 1.2], [[s * 11.2, 3.6, -6.4], [s * 12.8, 4.6, -3.6], 1.2, 0.4],     // shoulder flick, curling up
  [[s * 5.4, 4.6, -4], [s * 7.6, 8.4, -9.6], 1.9, 0.5],                                                    // back lock to the shoulder blade
  [[s * 3.6, 4, 5.8], [s * 5.6, 10.2, 4.4], 2.1, 0.5],                                                     // swept-back crown tongue
];
const CROWN = [[[0, 4.6, 6.6], [0, 11, 3.4], 2.3, 0.5]];
const HAND_TONGUES = [[0, 0, 6, 1.8], [-0.9, 0.4, 4, 1.1], [1, -0.2, 3.6, 1]];
const HAND_FLAME = { pow: 0.75, r0: 0.35, bend: 0.6, core: 0.45, coreAdd: 0.3 };
const HOLD = [[-22, 14], [2, 34]];   // arms out wide, forearms level, palms up (the idle silhouette)

/** Pose p: a biped rig pose (rig.js) + flameL / flameR (hand flame size, 0 = none), trail (gown tails swept back 0..1), flick, sway, eyes. */
export const rigOf = p => solve('biped', PROP, p).J;

export function build(p = {}) {
  const v = new Vox(40, 38, 48), rig = solve('biped', PROP, p), J = rig.J, T = rig.T, trail = p.trail || 0, flick = p.flick || 0, sway = p.sway || 0;
  const fj = k => 1 + 0.12 * Math.sin((flick + k * 1.7) * Math.PI / 2);
  const M = {
    skin: useMat(v, 'skin', { ramp: ['#b0604e', '#e49a7c', '#f6bc98', '#ffdcbe'] }),
    hair: useMat(v, 'hair', { ramp: ['#6a1e1e', '#b8481e', '#e8742a', '#ffae52'] }),
    hairD: useMat(v, 'hairD', { ramp: ['#561622', '#963618', '#c85a22', '#f08a3a'] }),
    hairL: useMat(v, 'hairL', { ramp: ['#7a2a1c', '#d0661e', '#f8963a', '#ffcc70'] }),
    dress: useMat(v, 'dress', { ramp: ['#2a0614', '#5e1020', '#8e1c26', '#bc3634'] }),
    sleeve: useMat(v, 'sleeve', { ramp: ['#2a0614', '#5e1020', '#8e1c26', '#bc3634'] }),
    dressD: useMat(v, 'dressD', { ramp: ['#1e0410', '#4a0c18', '#6e1420', '#962a2a'] }),
    inner: useMat(v, 'inner', { ramp: ['#3a0c14', '#6e1e16', '#943418', '#c05a28'] }),
    gold: useMat(v, 'gold', { ramp: ['#5e2810', '#b0621a', '#e0961e', '#ffd066'] }),
    boot: useMat(v, 'boot', { ramp: ['#1e0410', '#480c16', '#6a1620', '#92282a'] }),
    lash: useMat(v, 'lash'),
    ...useIris(v, 'amber'),
    pupil: useMat(v, 'pupil'),
    shine: useMat(v, 'shine', { gain: 0.95 }),
    blush: useMat(v, 'blush'),
    mouth: useMat(v, 'mouth'),
  };
  const F = useFlame(v, 'fire', 'f', [1, 1.15, 1.5, 1.7]);

  // ---- thigh-high crimson boots (gold rim + toe), a little bare thigh under the gown
  for (const k of ['R', 'L']) {
    const f = J['foot' + k], hip = J['hip' + k], kn = J['knee' + k], an = J['ankle' + k];
    feet(v, f, 'boot', M.boot, { hw: 1.8, front: 3.4, back: 1.6, h: 3.4 });
    limb(v, [an, kn], [1.5, 1.55], M.boot);
    limb(v, [kn, hip], [1.55, 1.6], (px, py, pz) => (pz < kn[2] + 1.6 ? M.boot : M.skin));
    v.capsule([kn[0], kn[1], kn[2] + 1.2], [kn[0], kn[1], kn[2] + 1.4], 1.7, M.gold);   // boot rim
  }
  // ---- gown: split open in front, two pointed tails flaring out and back to the ground, gold hem + split edges, orange-red lining
  skirt(v, T.torso, {
    c: [cx, cy + 0.6], z0: 0, z1: 12.6 + U, zr: 12.6 + U, h: 12.6 + U, r0: 4.2, dr: 7.2 + trail * 1.4, sy: 0.85 + trail * 0.25, shell: 1.2, hollow: (dx, dy) => dy < -0.5 && Math.abs(dx) < 4.2,
    open: 50 - trail * 10, lean: 0.24 + trail * 0.42, hemH: 1.1, inner: M.inner,
    floor: phi => { const u = (phi - 0.8) / (Math.PI - 0.8), f = u < 0.35 ? (0.35 - u) / 0.35 : (u - 0.35) / 0.65 * 0.6; return 0.4 + trail * 2.6 + 6 * f ** 0.9; },
  }, M.dress, M.gold);
  // ---- corset: crimson, pinched waist, sweetheart neckline in gold, gold flame motif down the front, gold belt; bare skin above
  torso(v, T.torso, { c: [cx, cy], z0: 9 + U, z1: 20.6 + U, r: 6 }, (dx, dy, z, px, py, pz) => {
    const rx = z < 3.4 ? 3.3 - z * 0.12 : 2.9 + Math.min(1, (z - 3.4) / 4) * 1.2 - Math.max(0, z - 10) * 0.5;
    const ry = z < 3.4 ? 2.7 : 2.5 + (dy < 0 && z > 5.5 && z < 9.6 ? 0.7 : 0);
    if ((dx / rx) ** 2 + (dy / ry) ** 2 > 1) return;
    const neck = 9.9 - (dy < 0 ? 0.9 * Math.max(0, 1 - Math.abs(Math.abs(dx) - 1.7) / 1.7) + (Math.abs(dx) < 0.6 ? 0.8 : 0) : -0.3);
    if (z > neck + 0.9) return M.skin;
    if (z > neck) return M.gold;
    if (z < 3.6 && z > 2.6) return M.gold;                                                      // belt
    if (dy < -1.2 && Math.abs(Math.abs(dx) - (6.4 - z) * 0.32) < 0.5 && z > 3.6 && z < 7.8) return M.gold;   // flame V motif
    return M.dress;
  });
  // front flap: a short pointed crimson tab with gold edges under the belt
  vol(v, T.torso, cx - 2.6, cy - 4, 6.4 + U, cx + 2.6, cy - 1.8, 12 + U, (px, py, pz) => {
    const z = pz - U, w = 2.2 * (z - 6.4) / 5.6; if (Math.abs(px - cx) > w || py > cy - 2.2 - (12 - z) * 0.08) return;
    return Math.abs(px - cx) > w - 0.5 ? M.gold : M.dressD;
  });
  // neck + gold choker with a crimson jewel band
  cap(v, T.torso, [cx, cy + 0.3, 19.6 + U], [cx, cy + 0.3, 21.6 + U], 1.5, M.skin);
  cap(v, T.torso, [cx, cy + 0.3, 20.4 + U], [cx, cy + 0.3, 21 + U], 1.75, (px, py, pz) => (pz > 20.75 + U ? M.gold : M.dress));

  // ---- arms: bare shoulders + upper arms, crimson forearm sleeves flaring to gold cuffs, open hands
  for (const k of ['R', 'L']) {
    const sh = J['shoulder' + k], el = J['elbow' + k], hd = J['hand' + k];
    limb(v, [sh, el], [1.3, 1.05], M.skin);
    v.capsule(el, hd, 1.15, (px, py, pz, t) => (t > 0.72 ? M.gold : M.sleeve), 1.45);
    band(v, el, hd, 0.02, 0.12, 1.25, M.gold);
    hand(v, hd, [1.3, 1.3, 1.1], M.skin);
  }
  // ---- head: tight hair shell parted in the middle, skin carved back into the face window, back mass to the shoulders, flicks swept back
  const Th = T.head, hc = J.head, [hx, hy, hz] = [cx, cy + PROP.headY, PROP.headZ];
  const win = faceWindow({ cx, yCut: hy - 1.6, halfW: 6.6, fringe: FRINGE });
  const hair = (px, pz) => (pz > 33 + U ? M.hairL : stripes(M.hair, M.hairD, 3, 31 + U)(px, pz));
  hairShell(v, Th, { c: [hx, hy + 0.7, hz + 0.6], r: [8.7, 8.1, 8.4], win, face: { c: [hx, hy, hz], r: [8.1, 7.3, 7.7], m: M.skin }, head: [cx, cy], sway,
    back: { w: 8.4, wZ: 22 + U, wK: 0.1, depth: 7.8, dZ: 24 + U, dK: 0.1, tip: 18.6 + U, tipJag: 1.8, box: [-10, 1, 18 + U, 10, 9, 31 + U] } }, hair);
  const tipK = 1 + 0.08 * Math.sin(sway * Math.PI / 2);
  for (const [a, b, r0, r1] of [...FLICKS(-1), ...FLICKS(1), ...CROWN]) {
    const bb = [b[0] * tipK, b[1] * tipK + trail * 1.4, b[2] + trail * 0.8];
    cap(v, Th, [hx + a[0], hy + a[1], hz + a[2]], [hx + bb[0], hy + bb[1], hz + bb[2]], r0, (px, py, pz, t) => (t > 0.6 ? M.hairL : M.hair), r1);
  }

  // ---- face, painted on the front-most voxels (follows the posed head)
  const ox = Math.round(hc[0] - cx), oz = Math.round(hc[2] - (hz - 0.3)), ez = hz - 5 + oz;
  eyes(v, { at: [[cx - 5 + ox, cx - 6 + ox], [cx + 2 + ox, cx + 5 + ox]], z: ez, style: 'big', state: p.eyes }, M);
  decal(v, [[cx - 6 + ox, ez - 1], [cx - 5 + ox, ez - 1], [cx + 4 + ox, ez - 1], [cx + 5 + ox, ez - 1]], M.blush);
  mouth(v, [[cx + ox, ez - 2], [cx - 1 + ox, ez - 2]], M.mouth);

  // ---- fire in the palms (after the face so a raised hand never takes the eye paint)
  for (const k of ['L', 'R']) {
    const s = p['flame' + k] ?? (k === 'L' ? 0.8 : 0); if (!(s > 0)) continue;
    const h = J['hand' + k], b = [h[0], h[1], h[2] + 0.9];
    flame(v, null, b, HAND_TONGUES.map(([ox2, oy, h0, w0], i) => [ox2, oy, h0 * s * fj(i + (k === 'R' ? 2 : 0)), w0 * Math.sqrt(s)]),
      { ...HAND_FLAME, box: [-3 * s, -3 * s, 3 * s, 3 * s] }, F);
  }
  return v;
}
export const buildLina = build;

const range = n => [...Array(n).keys()];
const sw = (a, d) => a.map(([el, hd]) => [el + d, hd]);
/** Anims: idle sway with open palms; run leaning in with the arms swept back like wings and the tails trailing; attack = flame raised high
 * then a lunging throw; cast (Dragon Slave) = one arm straight up with a big flame, then both arms sweeping forward; stunned slump. */
export const ANIMS = {
  idle: range(4).map(i => {
    const b = [0, 1, 2, 1][i];
    return { bob: -b * 0.2, armR: sw(HOLD, b * 2), armL: sw(HOLD, -b * 2), head: [b * 1.2, 0, 0], flick: i, sway: [0, 1, 1, 0][i], flameL: 0.8 };
  }),
  walk: range(4).map(i => {
    const st = [1, 0, -1, 0][i], back = [[-28, -32], [-12, -40]];
    return {
      bob: [-0.4, 0, -0.4, 0][i], spine: [20, st * 5, 0], head: [-14, -st * 3, 0], footR: [0, -st * 1.6, i === 3 ? 0.4 : 0], footL: [0, st * 1.6, i === 1 ? 0.4 : 0],
      armR: sw(back, st * 4), armL: sw(back, -st * 4), trail: 1, flick: i, sway: i % 3, flameL: 0.7,
    };
  }),
  attack: [
    { spine: [-6, 18, 0], head: [-4, -8, 0], armL: [[48, 10], [66, 0]], armR: [[-30, -20], [-6, -30]], footR: [0, 1, 0], flameL: 1.3, trail: 0.2, flick: 0 },
    { bob: -0.6, spine: [22, -14, 0], head: [-16, 8, 0], armL: [[2, 72], [-4, 88]], armR: [[-20, -50], [-8, -70]], footL: [0, -2.4, 0], footR: [0, 1.8, 0.4], flameL: 1.6, trail: 0.8, flick: 1 },
    { spine: [8, -4, 0], head: [-6, 0, 0], armL: [[-20, 50], [-6, 64]], armR: [[-34, 0], [-6, 20]], footL: [0, -1, 0], flameL: 0.9, trail: 0.3, flick: 2 },
  ],
  cast: [
    { spine: [-4, 0, 0], armL: [[-48, 58], [-8, 78]], armR: [[-48, 58], [-8, 78]], flameL: 1, flameR: 0.6, flick: 0 },
    { spine: [-8, 6, 0], head: [-8, 0, 0], armL: [[56, 4], [74, 0]], armR: [[-26, -10], [-4, -10]], footL: [0, -0.8, 0], flameL: 1.8, flick: 1 },
    { bob: -0.6, spine: [22, 0, 0], head: [-16, 0, 0], armL: [[4, 66], [0, 84]], armR: [[4, 66], [0, 84]], footL: [0, -2, 0], footR: [0, 1.6, 0.4], flameL: 1.4, flameR: 1.4, trail: 0.9, flick: 2 },
  ],
  stunned: range(2).map(i => ({
    bob: -0.6, spine: [4, [3, -3][i], [3, -3][i]], head: [6, [6, -6][i], [4, -4][i]], armR: [[-78, 8], [-84, 14]], armL: [[-78, 8], [-84, 14]],
    eyes: 'x', flameL: 0, flick: i * 2, sway: i,
  })),
};

/** HUD portrait framing (tools/vox/portrait.mjs): idle without the flame, face in the upper third. */
export const PORTRAIT = { pose: { ...ANIMS.idle[0], flameL: 0 }, center: [cx + 0.4, cy, 27.8], scale: 1.3, fov: 24, sig: '#ff9326', face: [4, 11, 24, 24] };
