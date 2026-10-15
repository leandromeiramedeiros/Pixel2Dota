// Voxel Rubick, a chibi of his Dota 2 model (hand-authored): a silver face mask with a central ridge and two green-glowing eye slits on a dark
// helmet, a tall thin topknot spike; green skin (neck, hands); a huge dark slate cloak with a high standing collar (lavender rim, green inside)
// falling to the floor and flaring into a green hem; orange-gold spiked shoulder trim; a green tunic with a gold centre strip and a brown belt;
// brown boots; a long dark staff held diagonally across the body, its green forked tip (the only glow besides the eyes) up to his right.
// Signature reads: silver mask + topknot spike, dark cloak bell with standing collar and green hem, the long diagonal staff with the green fork.
// Grid 56 x 46 x 56 (room for the staff), ~44 voxels tall to the spike, faces -y. Forked from Crystal Maiden (staff + cape).
import { Vox } from '../vox.js';
import { useMat } from '../mats.js';
import { solve, xfApply, norm3, cross3, add3, mul3, sub3 } from '../rig.js';
import { limb, band, hand, feet, torso, skirt, collar, pauldron, ell, cap, vol, decal } from '../parts.js';

export const META = { rig: 'biped', grid: [56, 46, 56], cx: 30, cy: 23 };
const cx = 30, cy = 23;
const U = 3;   // leg length over the base chibi
export const PROP = {
  cx, cy, hipZ: 8 + U, hipX: 2.3, footX: 2.8, ankleY: -0.3, ankleZ: 3.5, thigh: 3.8, shin: 3.4,
  chestZ: 16 + U, shX: 4.8, shY: 0.3, shZ: 18.6 + U, upper: 4.4, fore: 4.4, neckY: 0.3, neckZ: 20.6 + U, headY: -0.4, headZ: 28.4 + U, headTopZ: 35 + U, hairZ: 22 + U,
};
const HZ = PROP.headZ, SKULL = [5.4, 5.4, 6.2];
const HOLD_R = [-2.4, -3.6, -4.6];   // right hand in front of the belly, gripping the staff
const HOLD_L = [[-50, 30], [-20, 50]];   // left hand open, out in front (the reference idle)

/** Staff direction: pitch = top tilts forward (-y), roll = top tilts out to his right (-x); degrees. */
const staffDir = (pitch, roll) => { const p = pitch * Math.PI / 180, r = roll * Math.PI / 180; return norm3([-Math.sin(r), -Math.sin(p), Math.cos(p) * Math.cos(r)]); };

/** Pose p: a biped rig pose (rig.js) + staff [pitch, roll, below, above] (the shaft through the right hand), trail (cloak swept back 0..1), eyes. */
export const rigOf = p => solve('biped', PROP, p).J;

export function build(p = {}) {
  const v = new Vox(56, 46, 56), rig = solve('biped', PROP, { reachR: HOLD_R, armL: HOLD_L, ...p }), J = rig.J, T = rig.T, trail = p.trail || 0;
  const M = {
    skin: useMat(v, 'skin', { ramp: ['#1a3410', '#34621e', '#52882c', '#80b850'] }),
    mask: useMat(v, 'mask', { ramp: ['#3a3a4c', '#72728a', '#a2a2b4', '#d0d0dc'] }),
    helm: useMat(v, 'helm', { ramp: ['#0e0e14', '#1c1c26', '#2e2e3a', '#4a4a5a'] }),
    cloak: useMat(v, 'cloak', { ramp: ['#101016', '#20202a', '#343442', '#525264'] }),
    trim: useMat(v, 'trim', { ramp: ['#46405a', '#766c8e', '#a498ba', '#d2c6e2'] }),
    lining: useMat(v, 'lining', { ramp: ['#022a04', '#06600a', '#109414', '#46c840'] }),
    tunic: useMat(v, 'tunic', { ramp: ['#08260a', '#164a16', '#246e24', '#469a40'] }),
    gold: useMat(v, 'gold', { ramp: ['#5a2a10', '#a8601e', '#d89a3a', '#ffd278'] }),
    leather: useMat(v, 'leather', { ramp: ['#24140a', '#482a16', '#6a4024', '#906038'] }),
    pants: useMat(v, 'pants', { ramp: ['#0c0c10', '#1a1a20', '#2a2a32', '#44444e'] }),
    shaft: useMat(v, 'shaft', { ramp: ['#0e0c10', '#1e1a20', '#302a32', '#4a4248'] }),
    tip: useMat(v, 'tip', { emit: '#58d838', tier: 'signature', gain: 1 }),
    tipD: useMat(v, 'tipD', { emit: '#249018', tier: 'signature', gain: 0.9 }),
    eye: useMat(v, 'eye', { emit: '#86ff5a', tier: 'eye' }),
    slit: useMat(v, 'eyeSlit', { ramp: ['#060608', '#0c0c10', '#16161c', '#22222a'] }),
  };

  // ---- cloak: one dark bell from the shoulders to the floor, open in front over the tunic, green inside and a green flared hem.
  const CZ = 21 + U, lean = 0.08 + trail * 0.26, cc = [cx, cy + 1];
  skirt(v, T.torso, {
    c: cc, z0: 0, z1: CZ, zr: CZ, h: CZ, r0: 6, dr: 6 + trail * 0.6, sy: 0.78, shell: 3.2, open: pz => (pz < 6 ? 46 : 32), edge: 3, lean, hemH: 2.2,
    inner: M.lining, floor: phi => 0.4 + trail * 1.6 + (phi < 1.2 ? (1.2 - phi) * 1.2 : 0),
  }, M.cloak, M.lining);

  // ---- legs: dark trousers, brown boots
  for (const k of ['R', 'L']) {
    const f = J['foot' + k];
    feet(v, f, 'boot', M.leather, { hw: 1.7, front: 3.4, back: 1.4, h: 3 });
    limb(v, [J['ankle' + k], J['knee' + k], J['hip' + k]], [1.6, 1.6, 1.7], M.pants);
  }
  // green tabard down the front between the legs, gold edge at the bottom
  vol(v, T.torso, cx - 3, cy - 4, 3, cx + 3, cy - 1.2, 10 + U, (px, py, pz) => {
    const w = 2 + (10 + U - pz) * 0.06; if (Math.abs(px - cx) > w || py > cy - 1.6) return;
    return pz < 4 ? M.gold : M.tunic;
  });

  // ---- tunic: green, a gold strip down the middle, brown belt with a gold buckle
  torso(v, T.torso, { c: [cx, cy], z0: 10.4 + U, z1: 21 + U, r: 6 }, (dx, dy, z) => {
    const rx = 3.3 + Math.min(1, z / 6) * 1.1, ry = 2.6 + (dy < 0 && z > 4 && z < 8 ? 0.3 : 0);
    if ((dx / rx) ** 2 + (dy / ry) ** 2 > 1) return;
    if (z < 1.6) return Math.abs(dx) < 1 && dy < 0 ? M.gold : M.leather;
    if (dy < -1 && Math.abs(dx) < 0.8) return M.gold;
    return M.tunic;
  });
  cap(v, T.torso, [cx, cy + 0.3, 20.4 + U], [cx, cy + 0.3, 22.6 + U], 1.5, M.skin);   // neck

  // ---- standing collar: tall slate fan behind the head, green inside, lavender rim
  collar(v, T.torso, {
    c: [cx, cy + 1.6], z0: 20 + U, z1: 32 + U, r0: 4.8, r1: 8.4, flare: 0.75, sy: 0.8, th: 2, lean: 0.1, open0: 56, open1: 72, spikes: 1, spike: 3, phase: 0.5, dip: 1.6,
    fill: (dx, dy) => dy > 3,
  }, (px, py, pz, f, inner) => (f > 0.88 ? M.trim : inner ? M.lining : M.cloak));

  // ---- arms: green sleeves, dark slate forearm cuffs with a lavender rim, green hands; orange-gold spiked pauldrons
  for (const k of ['R', 'L']) {
    const sh = J['shoulder' + k], el = J['elbow' + k], hd = J['hand' + k], e = norm3(sub3(el, hd));
    limb(v, [sh, el], [1.4, 1.2], M.tunic);
    const a = add3(hd, mul3(e, 0.8));
    v.capsule(a, el, 1.25, M.cloak, 1.55);
    band(v, a, el, 0, 0.14, 1.4, M.trim);
    hand(v, hd, [1.25, 1.25, 1.15], M.skin);
  }
  for (const [k, s] of [['R', -1], ['L', 1]]) {
    const sh = J['shoulder' + k], c = [sh[0], sh[1], sh[2] + 0.5];
    pauldron(v, sh, [2.7, 2.7, 2], M.gold, M.leather, 0.5);
    for (const [ox, oy, oz] of [[2.2, -1, 2.6], [3.4, 0.6, 1.2]]) v.capsule(c, [c[0] + s * ox, c[1] + oy, c[2] + oz], 0.9, M.gold, 0.3);
  }

  // ---- head: dark helmet shell, a silver face mask in front (narrowing to a pointed chin), a silver ridge over the crown, the topknot spike
  const Th = T.head, [hx, hy, hz] = [cx, cy + PROP.headY, HZ];
  ell(v, Th, [hx, hy + 0.4, hz + 0.4], SKULL, (px, py, pz) => (py < hy - 1 && pz < hz + 4.8 ? M.mask : M.helm));
  ell(v, Th, [hx, hy - 0.6, hz - 4.6], [3.4, 4, 3.2], M.mask);                                   // long chin of the mask
  cap(v, Th, [hx, hy - 5.6, hz + 1], [hx, hy - 2, hz + 6.2], 1, M.mask, 0.8);                     // forehead ridge
  cap(v, Th, [hx, hy - 2, hz + 6.2], [hx, hy + 4, hz + 5], 0.9, M.mask, 0.7);                       // over the crown
  cap(v, Th, [hx, hy + 0.6, hz + 5.4], [hx, hy + 1.8, hz + 13.4], 1.3, M.helm, 0.6);                // topknot spike
  ell(v, Th, [hx, hy + 1.1, hz + 8.6], [1.2, 1.2, 0.8], M.mask);                                      // silver ring on the spike
  for (const s of [-1, 1]) cap(v, Th, [hx + s * 4.6, hy + 1, hz + 1], [hx + s * 6.8, hy + 2.6, hz + 3.6], 1, M.helm, 0.3);   // helmet fins

  // ---- face, painted on the mask: two slanted dark slits with green-glowing eyes, a dark mouth line
  const ez0 = Math.round(hz - 1), ec = xfApply(Th, [cx, hy - SKULL[1], ez0]), ox = Math.round(ec[0] - cx), ez = ez0 + Math.round(ec[2] - ez0);
  const st = p.eyes || 'open';
  for (const [x0, s] of [[cx - 4 + ox, 1], [cx + 1 + ox, -1]]) {
    const xs = s > 0 ? [x0, x0 + 1, x0 + 2] : [x0 + 2, x0 + 1, x0];
    if (st === 'x') { decal(v, [[x0, ez + 1], [x0 + 2, ez + 1], [x0 + 1, ez], [x0, ez - 1], [x0 + 2, ez - 1]], M.slit); continue; }
    decal(v, [[xs[0], ez + 1], [xs[1], ez + 1], [xs[2], ez]], M.slit);
    if (st === 'open') decal(v, [[xs[1], ez], [xs[2], ez + 1]], M.eye);
    else decal(v, [[xs[1], ez], [xs[2], ez + 1]], M.slit);
  }
  decal(v, [[cx - 1 + ox, ez - 4], [cx + ox, ez - 4]], M.slit);

  // ---- staff in the right hand: long dark shaft, gold ferrule at the head, the green fork (three prongs)
  const [sp, sr, lo, hi] = p.staff || [10, 50, 6, 22], d = staffDir(sp, sr), h = J.handR;
  const bot = add3(h, mul3(d, -lo)), top = add3(h, mul3(d, hi));
  v.capsule(bot, top, 0.6, M.shaft);
  v.capsule(add3(top, mul3(d, -1.4)), top, 0.95, M.gold);
  const s1 = norm3(Math.abs(d[1]) < 0.9 ? cross3(d, [0, 1, 0]) : cross3(d, [1, 0, 0])), s2 = cross3(d, s1);
  v.capsule(top, add3(top, mul3(d, 2.4)), 1.2, M.tip, 1);
  const prong = (dir, len, r) => { const a = add3(top, mul3(d, 2)), b = add3(a, mul3(dir, len)); v.capsule(a, b, r, (px, py, pz, t) => (t > 0.6 ? M.tip : M.tipD), 0.35); };
  for (const [u, w, len] of [[0.7, 0.2, 3.6], [-0.7, 0.2, 3.6], [0, -0.6, 3]]) prong(norm3(add3(add3(d, mul3(s1, u)), mul3(s2, w))), len, 0.8);
  prong(d, 4.4, 0.9);
  return v;
}

const range = n => [...Array(n).keys()];
/** Anims: idle with the staff held diagonally across the body, the left hand open in front; walk with the staff carried forward and the cloak
 * trailing; attack = staff drawn back then thrust forward fork-first; cast = left hand raised, staff lifted, then both driven forward; stunned slump. */
export const ANIMS = {
  idle: range(4).map(i => {
    const b = [0, 1, 2, 1][i];
    return { bob: -b * 0.2, head: [b * 1.2, 0, 0], armL: [[-50 + b * 3, 30], [-20 + b * 3, 50]] };
  }),
  walk: range(4).map(i => {
    const st = [1, 0, -1, 0][i];
    return {
      bob: [-0.4, 0, -0.4, 0][i], spine: [12, st * 4, 0], head: [-8, -st * 3, 0], footR: [0, -st * 1.6, i === 3 ? 0.4 : 0], footL: [0, st * 1.6, i === 1 ? 0.4 : 0],
      reachR: [-2.4, -3.4 - st, -5], armL: [[-56, -10 - st * 12], [-34, 20 - st * 12]], staff: [30, 40, 5, 18], trail: 1,
    };
  }),
  attack: [
    { spine: [-4, -14, 0], head: [0, 8, 0], reachR: [-2.4, 1.6, 0.8], staff: [-20, 40, 5, 18], armL: [[-30, 50], [-10, 70]], footR: [0, 1, 0], trail: 0.2 },
    { bob: -0.5, spine: [12, 10, 0], head: [-8, -6, 0], reachR: [-1.2, -4, -1], staff: [40, 20, 8, 13], armL: [[-62, -20], [-40, 0]], footR: [0, -2, 0], footL: [0, 1.4, 0.3], trail: 0.7 },
    { spine: [6, 4, 0], head: [-4, 0, 0], reachR: [-2.6, -3.6, -4], staff: [24, 40, 5, 18], armL: HOLD_L, footR: [0, -0.8, 0], trail: 0.3 },
  ],
  cast: [
    { spine: [-4, 0, 0], head: [-2, 0, 0], reachR: [-2.2, -2, 1], staff: [0, 30, 6, 17], armL: [[10, 40], [30, 50]], trail: 0.1 },
    { spine: [-5, 0, 0], head: [-3, 0, 0], reachR: [-1.8, -2.4, 3.4], staff: [-4, 20, 6, 16], armL: [[50, 30], [70, 30]], footL: [0, -0.8, 0], trail: 0.2 },
    { bob: -0.5, spine: [16, 0, 0], head: [-10, 0, 0], reachR: [-1.6, -5, -1.6], staff: [40, 20, 8, 13], armL: [[-10, 70], [-4, 86]], footL: [0, -2, 0], footR: [0, 1.4, 0.3], trail: 0.8 },
  ],
  stunned: range(2).map(i => ({
    bob: -0.6, spine: [6, [3, -3][i], 0], head: [8, [6, -6][i], [4, -4][i]], reachR: [-1.6, -1.6, -7], staff: [-6, 30, 8, 16], armL: [[-80, 8], [-84, 14]], eyes: 'x',
  })),
};

/** HUD portrait framing (tools/vox/portrait.mjs): idle, the mask in the upper third with the standing collar behind it. */
export const PORTRAIT = { pose: ANIMS.idle[0], center: [cx, cy, 30.6], scale: 1.2, fov: 24, sig: '#58d838', face: [4, 11, 24, 24] };
