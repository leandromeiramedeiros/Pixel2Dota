// Voxel Sven, a chibi of his Dota 2 model (hand-authored): a silver full helm with a dark visor slit, two white horns curving out
// sideways and back from the helm sides; a bare, broad blue torso, back and upper arms (lighter blue muscle bands); huge layered silver
// pauldrons; dark gauntlets with silver cuffs; a dark belt with a silver plate, grey tassets, grey armoured legs with silver knees and
// greaves; the Outcast Blade: a body-height greatsword, 2 voxels thick, wide steel edge around a gold-orange inlay, crossguard, dark grip,
// squared hooked tip, held low in the right hand and swept up and out to his right. Signature reads: blue torso between big silver
// pauldrons, silver helm with white side horns, body-height gold-and-steel greatsword. Grid 72 x 72 x 72 (room for the blade in every pose), ~44 voxels tall, faces -y.
import { Vox } from '../vox.js';
import { useMat } from '../mats.js';
import { solve, add3, mul3, norm3, cross3, dot3, sub3, apM } from '../rig.js';
import { limb, band, hand, feet, torso, skirt, pauldron, ell, cap, vol, obox, gripDir } from '../parts.js';

export const META = { rig: 'biped', grid: [72, 72, 72], cx: 36, cy: 36 };
const cx = 36, cy = 36;
export const PROP = {
  cx, cy, hipZ: 11, hipX: 3, footX: 4.4, ankleY: -0.2, ankleZ: 3.6, thigh: 4.5, shin: 4,
  chestZ: 19, shX: 6.4, shY: 0.6, shZ: 22.4, upper: 4.4, fore: 4.4, neckY: 0.2, neckZ: 24.4, headY: -0.4, headZ: 32.6, headTopZ: 40, hairZ: 25,
};
const HOLD = { R: [[-58, 24], [-30, 70]], L: [[-66, 12], [-40, 50]] };   // sword hand low and forward at the right hip, left fist loose
const BLADE = [54, 14];                                                  // idle blade: up and out to his right, a little forward

/** Pose p: a biped rig pose (rig.js) + bladeR (greatsword aim [el, hd], body frame). */
export const rigOf = p => solve('biped', PROP, p).J;

export function build(p = {}) {
  const v = new Vox(72, 72, 72), rig = solve('biped', PROP, p), J = rig.J, T = rig.T;
  const M = {
    skin: useMat(v, 'skin', { ramp: ['#011a5c', '#0236a4', '#0560d8', '#3a92f4'] }),
    skinL: useMat(v, 'skinL', { ramp: ['#02307e', '#0a56c4', '#2a84ec', '#6ab4ff'] }),
    steel: useMat(v, 'steel', { ramp: ['#46445a', '#76758c', '#a6a7c0', '#d4d6ea'] }),
    steelD: useMat(v, 'steelD', { ramp: ['#2c2a38', '#4e4b5e', '#6a6880', '#8a8aa0'] }),
    horn: useMat(v, 'horn', { ramp: ['#7a7a8c', '#b4b6c8', '#dcdeea', '#f6f6fc'] }),
    dark: useMat(v, 'dark', { ramp: ['#0c080e', '#1e1824', '#312a36', '#4a4456'] }),
    visor: useMat(v, 'visor', { ramp: ['#040304', '#0a070b', '#120e14', '#1c161e'] }),
    eye: useMat(v, 'eye', { emit: '#9ad0ff', tier: 'eye', gain: 0.6 }),
    gold: useMat(v, 'gold', { ramp: ['#4a2600', '#7f4802', '#b8720e', '#e6a43a'] }),
    grip: useMat(v, 'grip', { ramp: ['#120a06', '#2a1a0e', '#402a18', '#5a3e26'] }),
  };

  // ---- legs: dark armour, silver knee plates and greave fronts, dark boots
  for (const k of ['R', 'L']) {
    const f = J['foot' + k], an = J['ankle' + k], kn = J['knee' + k], hp = J['hip' + k];
    feet(v, f, 'boot', M.dark, { hw: 2.2, front: 3.8, back: 1.8, h: 3.2 });
    limb(v, [an, kn], [1.8, 1.9], M.steelD);
    band(v, an, kn, 0.2, 0.75, 1.95, M.steel);
    limb(v, [kn, hp], [2, 2.3], M.steelD);
    v.ellipsoid(kn[0], kn[1] - 0.9, kn[2], 1.6, 1.3, 1.5, M.steel);
  }
  // ---- tassets: short silver plate skirt over the hips, dark hem
  skirt(v, T.torso, { c: [cx, cy + 0.2], z0: 7.6, z1: 12.6, zr: 12.6, h: 5, r0: 4.4, dr: 1.2, sy: 0.82, shell: 1.2, hemH: 0.9 }, M.steelD, M.dark);

  // ---- torso: bare broad blue chest + belly with lighter muscle bands; dark belt with a silver plate
  torso(v, T.torso, { c: [cx, cy], z0: 11.6, z1: 24.6, r: 8 }, (dx, dy, z) => {
    const rx = 4.4 + Math.min(1, z / 7) * 2.2 - Math.max(0, z - 10.4) * 0.6, ry = 3 + (z > 6 && z < 10.4 ? 0.5 : 0);
    if ((dx / rx) ** 2 + (dy / ry) ** 2 > 1) return;
    if (z < 2.4) return dy < -2 && Math.abs(dx) < 1.6 ? M.steel : M.dark;                // belt + buckle plate
    if (dy < -1.4 && (Math.abs(z - 7.4) < 0.5 || Math.abs(z - 4.8) < 0.5) && Math.abs(dx) > 0.7) return M.skinL;   // pec + ab bands
    if (dy < -1.4 && Math.abs(dx) < 0.5 && z < 9) return M.skinL;
    return M.skin;
  });
  cap(v, T.torso, [cx, cy + 0.4, 23], [cx, cy + 0.4, 26.4], 2.2, M.skin);                  // thick neck

  // ---- arms: bare blue upper arms, dark gauntlets with silver cuffs, dark fists
  for (const k of ['R', 'L']) {
    const sh = J['shoulder' + k], el = J['elbow' + k], hd = J['hand' + k];
    limb(v, [sh, el], [2.1, 1.8], M.skin);
    v.capsule(el, hd, 1.9, (px, py, pz, t) => (t > 0.18 && t < 0.42 ? M.steel : M.dark), 1.7);
    hand(v, hd, [1.6, 1.6, 1.5], M.dark);
  }
  // ---- pauldrons: huge layered silver domes, a dark trim, a second plate below
  for (const k of ['R', 'L']) {
    const sh = J['shoulder' + k], s = k === 'R' ? -1 : 1;
    pauldron(v, [sh[0] - s * 0.8, sh[1] + 0.3, sh[2] - 2.6], [4.2, 4.2, 2.8], M.steelD, M.dark, 0.4);
    pauldron(v, [sh[0] + s * 0.2, sh[1] + 0.2, sh[2]], [5, 4.8, 3.8], (px, py, pz) => (Math.abs(px - sh[0] - s * 1.8) < 0.5 && pz > sh[2] + 1.8 ? M.steelD : M.steel), M.steelD, 0.8);
  }

  // ---- helm (head space): silver full helm, dark T visor, a row of curved fins up the crest, two horns sweeping back
  const Th = T.head, [hx, hy, hz] = [cx, cy + PROP.headY, PROP.headZ];
  ell(v, Th, [hx, hy, hz], [5.6, 5.6, 6.4], (px, py, pz) => {
    const dx = px - hx, zz = pz - hz;
    if (py < hy - 3.2) {
      if (Math.abs(zz - 0.4) < 0.6 && Math.abs(dx) < 3.6) return Math.abs(dx) > 1 && Math.abs(dx) < 2.6 ? M.eye : M.visor;   // eye slit
      if (Math.abs(dx) < 0.55 && zz < 0 && zz > -4) return M.visor;                                                        // nose slit
      if (Math.abs(dx) < 0.6 && zz > 1) return M.steelD;                                                                 // centre ridge
    }
    if (zz < -4.6) return M.steelD;                                                                                      // chin rim
    return M.steel;
  });
  // two white horns from the upper helm sides: out sideways, then curving back and a little up to a point; a low ridge down the crown
  for (const s of [-1, 1]) {
    const pts = [[hx + s * 3.6, hy + 0.2, hz + 4.2], [hx + s * 6.6, hy + 0.6, hz + 5], [hx + s * 8.8, hy + 2, hz + 5.8], [hx + s * 10, hy + 4.4, hz + 6.8]];
    const rr = [1.5, 1.2, 0.85, 0.4];
    for (let i = 0; i + 1 < pts.length; i++) cap(v, Th, pts[i], pts[i + 1], rr[i], M.horn, rr[i + 1]);
  }
  cap(v, Th, [hx, hy - 3.6, hz + 5.2], [hx, hy + 3, hz + 6.4], 0.8, M.steelD, 0.6);

  // ---- the Outcast Blade in the right hand: grip + pommel, broad crossguard, gold channel in a silver rim, flared cleaver tip
  // flat of the blade faces the body's front (it reads broad from the camera, as in the game), width across it
  const h = J.handR, d = gripDir(rig, 'R', p.bladeR ?? BLADE), fwd = apM(T.torso && T.torso.R, [0, -1, 0]), cr = cross3(d, fwd);
  const side = Math.hypot(...cr) > 1e-3 ? norm3(cr) : apM(T.torso && T.torso.R, [1, 0, 0]);
  v.capsule(add3(h, mul3(d, -3.4)), add3(h, mul3(d, 1.6)), 0.85, M.grip);
  v.ellipsoid(...add3(h, mul3(d, -3.8)), 1.2, 1.2, 1.2, M.steelD);
  obox(v, add3(h, mul3(d, 1.6)), add3(h, mul3(d, 3)), side, 4.6, 1.3, M.steelD);   // crossguard
  // body-height blade, 2 voxels thick: a wide grey steel edge around a gold-orange inlay, flaring to a squared tip with a hooked corner
  const L = 34, b0 = add3(h, mul3(d, 3)), wAt = t => (t < 0.78 ? 2.8 + t * 3.6 : 5.6);
  obox(v, b0, add3(b0, mul3(d, L)), side, wAt, 1, (px, py, pz, t) => {
    const off = dot3(sub3([px, py, pz], b0), side);
    if (t > 0.9 && off < -1.4 - (t - 0.9) * 40) return;                                   // hooked tip: cut one corner back
    return t > 0.04 && t < 0.86 && Math.abs(off) < wAt(t) - 1.6 ? M.gold : M.steel;
  });
  return v;
}

const range = n => [...Array(n).keys()];
const sw = (a, d) => a.map(([el, hd]) => [el + d, hd]);
/** Anims: idle = wide stance, greatsword up and out to the right (breathing bob); walk = leaning run, blade carried upright; attack = blade
 * raised high over the head, then a heavy downward chop in front; cast (Storm Hammer) = left fist thrown forward, blade held back; stunned
 * = slumped, blade drooping out to the side. */
export const ANIMS = {
  idle: range(4).map(i => {
    const b = [0, 1, 2, 1][i];
    return { bob: -0.4 - b * 0.2, armR: sw(HOLD.R, b * 2), armL: sw(HOLD.L, -b * 2), head: [b, 0, 0], bladeR: [BLADE[0] + b * 2, BLADE[1]] };
  }),
  walk: range(4).map(i => {
    const st = [1, 0, -1, 0][i];
    return {
      bob: [-0.8, -0.3, -0.8, -0.3][i], spine: [12, st * 5, 0], head: [-8, -st * 3, 0], footR: [0, -st * 1.8, i === 3 ? 0.5 : 0], footL: [0, st * 1.8, i === 1 ? 0.5 : 0],
      armR: [[-50, 30 + st * 6], [-20, 70]], armL: sw([[-60, 20], [-30, 60]], -st * 8), bladeR: [66, 30],
    };
  }),
  attack: [
    { bob: -0.2, spine: [-8, -10, 0], head: [-4, 6, 0], armR: [[60, 10], [84, 20]], armL: [[40, 40], [70, 40]], bladeR: [70, -40] },
    { bob: -1.2, spine: [18, 8, 0], head: [-14, -4, 0], armR: [[-20, 80], [-30, 90]], armL: [[-30, 70], [-30, 90]], bladeR: [-40, 90], footR: [0, -1.6, 0] },
    { bob: -0.8, spine: [8, 4, 0], head: [-6, -2, 0], armR: [[-44, 50], [-30, 70]], armL: HOLD.L, bladeR: [60, 20], footR: [0, -0.6, 0] },
  ],
  cast: [
    { bob: -0.6, spine: [-4, 20, 0], head: [0, -12, 0], armR: HOLD.R, armL: [[-10, -40], [20, -20]], bladeR: [64, 30] },
    { bob: -1, spine: [10, -16, 0], head: [-6, 12, 0], armR: HOLD.R, armL: [[0, 90], [6, 90]], bladeR: [64, 30], footL: [0, -1.4, 0] },
    { bob: -0.6, spine: [4, -4, 0], head: [-2, 2, 0], armR: HOLD.R, armL: [[-30, 60], [-10, 70]], bladeR: BLADE },
  ],
  stunned: range(2).map(i => ({
    bob: -1.4, spine: [12, [4, -4][i], [3, -3][i]], head: [12, [6, -6][i], [4, -4][i]], armR: [[-76, 10], [-70, 20]], armL: [[-80, 8], [-84, 14]], bladeR: [[34, 28][i], [40, 52][i]],
  })),
};

/** HUD portrait framing (tools/vox/portrait.mjs): idle, the finned helm in the upper third, pauldrons below. */
export const PORTRAIT = { pose: ANIMS.idle[0], center: [cx, cy, 31], scale: 1.1, fov: 24, sig: '#0560d8', face: [4, 11, 24, 24] };
