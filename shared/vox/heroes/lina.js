// Voxel Lina on the parts kit (chibi, after the v3 chibi pilot docs/shots/v3-lina-sheet.png): big round head with large amber eyes, long straight
// red-orange hair with a fringe and a flame crown, small crimson dress with gold V trim + flame emblem, gold hem, short legs, brown boots, one hand
// raised holding a flame. Grid 34 x 30 x 48, ~44 voxels tall, faces -y. A params file (proportions, materials, fringe, pinned arm table) plus
// Lina-only parts (bodice, emblem). Bit-identical to the hand-built original (tools/art/heroes/vox_kit_check.mjs).
import { Vox } from '../vox.js';
import { useMat, useIris, useFlame } from '../mats.js';
import { solve } from '../rig.js';
import { limb, band, hand, feet, torso, skirt, ell, cap, decal, faceWindow, hairShell, stripes, eyes, mouth, flame } from '../parts.js';

export const META = { rig: 'biped', grid: [34, 30, 48], cx: 17, cy: 15 };
const cx = 17, cy = 15;
/** Biped proportions (shoulders/arms are pinned per pose below; the rest drives hips, feet and the sockets). */
export const PROP = { cx, cy, hipZ: 8, hipX: 2.6, footX: 3, ankleY: -0.3, ankleZ: 3.5, shZ: 16.8, neckZ: 20, headY: -0.3, headZ: 28, headTopZ: 34.6 };
/** Hand-tuned arm table: elbow, hand for her raised (+x, left) arm; 'cast' raises both. Rest-space pins. */
const ARMS = {
  raise: [[cx + 8.6, cy - 1.6, 15.6], [cx + 11, cy - 3, 20]],
  back: [[cx + 8.4, cy + 1.6, 15], [cx + 10, cy + 3.5, 19.5]],
  thrust: [[cx + 7.6, cy - 4, 16.4], [cx + 9, cy - 8.5, 17.5]],
  cast: [[cx + 8.2, cy - 1, 19.5], [cx + 7.5, cy - 2.5, 25]],
  down: [[cx + 7.4, cy + 0.6, 13.6], [cx + 5.2, cy - 0.4, 12.2]],
};
const ARM_R_HIP = [[cx - 4.6, cy, 16.6], [cx - 7.4, cy + 0.6, 13.6], [cx - 5.2, cy - 0.4, 12.2]];   // right (-x) hand on the hip
const ARM_R_CAST = [[cx - 4.6, cy, 16.8], [cx - 8.2, cy - 1, 19.5], [cx - 7.5, cy - 2.5, 25]];
const FRINGE = [27.2, 28.6, 29.8, 28.8, 30.2, 29.2, 30.1, 29.6, 30.3, 29, 30, 28.6, 27.4];   // fringe bottom per column, dx -6..6 (the likeness lever)
const HAND_TONGUES = [[0, 0, 7.5, 2.1], [-1.1, 0.4, 5, 1.3], [1.2, -0.2, 4.4, 1.2]];
const CROWN_TONGUES = [[-4, 0.5, 5.5, 1.7, -0.25], [-1.6, -0.6, 8.5, 2.1, -0.1], [1.4, 0.2, 7, 1.9, 0.12], [3.9, 1, 5, 1.6, 0.28], [0, 2.8, 5.5, 2, 0]];
const HAND_FLAME = { pow: 0.75, r0: 0.35, bend: 0.6, core: 0.45, coreAdd: 0.3 };
const CROWN_FLAME = { pow: 0.8, r0: 0.3, drift: 0.22, gk: 0.9, gb: 0.12, core: 0.5, coreAdd: 0.18, box: [-7, -5, 7, 9] };

/** Lina pose (her own format) -> biped rig pose: legs [dyR, dyL] (+ = back) slide + lift the feet; arm names pick pinned elbow / hand rows. */
const rigPose = p => {
  const arm = p.arm || 'raise', legs = p.legs || [0, 0], R = arm === 'cast' ? ARM_R_CAST : ARM_R_HIP;
  return {
    footR: [0, legs[0], Math.abs(legs[0]) * 0.35], footL: [0, legs[1], Math.abs(legs[1]) * 0.35],
    pin: { shoulderR: R[0], elbowR: R[1], handR: R[2], shoulderL: [cx + 4.6, cy, 16.8], elbowL: ARMS[arm][0], handL: ARMS[arm][1] },
  };
};

/**
 * Pose p (all optional): { flick 0..3 flame flicker phase, sway 0..1 hair tip phase, legs [dyR, dyL] foot swing (+ = back),
 *   arm 'raise' | 'back' | 'thrust' | 'cast' | 'down', flameK hand flame size (0 = none), eyes 'open' | 'shut' | 'x', crownK crown height }
 */
export function build(p = {}) {
  const flick = p.flick || 0, sway = p.sway || 0, armPose = p.arm || 'raise', flameK = p.flameK ?? 1, crownK = p.crownK ?? 1;
  const fj = k => 1 + 0.12 * Math.sin((flick + k * 1.7) * Math.PI / 2);   // per-tongue flicker scale
  const v = new Vox(34, 30, 48), rig = solve('biped', PROP, rigPose(p)), J = rig.J, T = rig.T;
  const M = {
    skin: useMat(v, 'skin'),
    hair: useMat(v, 'hair', { ramp: ['#7c1a24', '#c8381e', '#f06a22', '#ffa244'] }),
    hairD: useMat(v, 'hairD', { ramp: ['#641428', '#a82a1e', '#d8521e', '#f68a38'] }),
    dress: useMat(v, 'dress', { from: 'clothRed' }),
    sleeve: useMat(v, 'sleeve', { from: 'clothOrange' }),
    gold: useMat(v, 'gold'),
    boot: useMat(v, 'boot', { from: 'leather' }),
    lash: useMat(v, 'lash'),
    ...useIris(v, 'amber'),
    pupil: useMat(v, 'pupil'),
    shine: useMat(v, 'shine'),
    blush: useMat(v, 'blush'),
    mouth: useMat(v, 'mouth'),
  };
  const F = useFlame(v, 'fire');

  // ---- boots + legs (per side: boot, leg, gold cuff)
  for (const k of ['R', 'L']) {
    const f = J['foot' + k];
    feet(v, f, 'boot', M.boot);
    limb(v, [J['ankle' + k], J['hip' + k]], [1.45, 1.45], M.skin);
    v.capsule([f[0], f[1] - 0.5, f[2] + 3.6], [f[0], f[1] - 0.5, f[2] + 4.2], 2.05, M.gold);   // boot cuff
  }
  // ---- skirt (flared cone), gold hem with flame scallops
  skirt(v, T.torso, { c: [cx, cy], z0: 5, z1: 12.9, zr: 5.5, h: 7, r0: 7, dr: 2.9, sy: 0.88, shell: 1.2, scallops: 9, hem: [[6.5, null], [7.5, 0.35], [8.5, 0.85]] }, M.dress, M.gold);
  // ---- bodice: belt, elliptic cross-section with a waist pinch, gold V trim (Lina-only)
  torso(v, T.torso, { c: [cx, cy], z0: 12, z1: 19.5, r: 6 }, (dx, dy0, z, px, py, pz) => {
    const rx = 3.5 + (z > 3.5 ? (z - 3.5) * 0.3 : 0), ry = z > 2 && z < 5.8 ? 3.1 : 2.7;
    const dy = dy0 + (z > 2.5 && z < 5.5 ? 0.25 : 0);
    if ((dx / rx) ** 2 + (dy / ry) ** 2 > 1) return;
    if (pz < 13) return M.gold;   // belt
    const front = dy < 0 && (dx / rx) ** 2 + ((dy - 0.9) / ry) ** 2 > 1;
    if (front && Math.abs(Math.abs(dx) - (z - 0.8) * 0.75) < 0.55 && z < 6.8) return M.gold;   // V trim
    return M.dress;
  });
  decal(v, [[16, 14, F[1]], [17, 14, F[1]], [16, 15, F[2]], [17, 15, F[2]], [17, 16, F[3]]]);   // flame emblem
  for (const s of [-1, 1]) ell(v, T.torso, [cx + s * 4.3, cy, 17.6], [2.3, 2.1, 1.9], M.sleeve);   // puffy sleeves
  cap(v, T.torso, [cx, cy + 0.3, 19], [cx, cy + 0.3, 21], 1.5, M.skin);                              // neck

  // ---- arms: right (-x) on the hip, left (+x) raised holding a flame; skin chain, gold bracer, hand
  for (const k of ['R', 'L']) {
    const sh = J['shoulder' + k], el = J['elbow' + k], hd = J['hand' + k];
    limb(v, [sh, el, hd], [1.25, 1.15, 1.05], M.skin);
    band(v, el, hd, 0.35, 0.72, 1.65, M.gold);
    hand(v, hd, [1.5, 1.4, 1.5], M.skin);
  }
  // hand flame (cast: one big flame between both raised hands)
  const hL = J.handL, hb = [armPose === 'cast' ? cx : hL[0], hL[1], hL[2] + 1.2];
  if (flameK > 0) flame(v, null, hb, HAND_TONGUES.map(([ox, oy, h0, w0], k) => [ox, oy, h0 * flameK * fj(k), w0 * Math.sqrt(flameK)]),
    { ...HAND_FLAME, box: [-3 * flameK, -3 * flameK, 3 * flameK, 3 * flameK] }, F);

  // ---- head: hair shell everywhere except the face window, skin carved back into the window, side curtains + back mass to the waist
  const hc = J.head, win = faceWindow({ cx, yCut: hc[1] - 1.6, halfW: 6.6, fringe: FRINGE });
  const hair = stripes(M.hair, M.hairD, 3, 31);
  hairShell(v, T.head, { c: [hc[0], hc[1] + 0.5, hc[2] + 0.6], r: [9.1, 8.3, 8.7], win, face: { c: hc, r: [8.1, 7.3, 7.7], m: M.skin }, head: [cx, cy], sway, curtains: {}, back: {} }, hair);
  // flame crown on top (headTop socket)
  flame(v, T.head, J.headTop, CROWN_TONGUES.map(([ox, oy, h0, w, lean], k) => [ox, oy, h0 * crownK * fj(k + 3), w, lean]), CROWN_FLAME, F);

  // ---- face, painted on the front-most voxels
  eyes(v, { at: [[12, 11], [19, 22]], z: 23, style: 'big', state: p.eyes }, M);
  decal(v, [[11, 22], [12, 22], [21, 22], [22, 22]], M.blush);
  mouth(v, [[17, 21], [16, 21]], M.mouth);
  return v;
}
export const buildLina = build;

/** Pose library, one pose per frame (fields: see build). Lina keeps her own frames (the class library is exercised by the creeps). */
export const ANIMS = {
  idle: [0, 1, 2, 3].map(i => ({ flick: i, sway: [0, 1, 1, 0][i] })),
  walk: [0, 1, 2, 3].map(i => ({ flick: i, sway: i % 3, legs: [[1.5, -1.5], [0, 0], [-1.5, 1.5], [0, 0]][i], flameK: 0.9 })),
  attack: [{ arm: 'back', flameK: 0.8 }, { arm: 'thrust', flameK: 1.5, flick: 1 }, { arm: 'raise', flameK: 1, flick: 2 }],
  cast: [{ arm: 'raise', flameK: 1.1 }, { arm: 'cast', flameK: 1.6, crownK: 1.15, flick: 1 }, { arm: 'cast', flameK: 1.9, crownK: 1.25, flick: 2 }],
  stunned: [0, 1].map(i => ({ arm: 'down', flameK: 0, crownK: 0.7, eyes: 'x', sway: i, flick: i * 2 })),
};
