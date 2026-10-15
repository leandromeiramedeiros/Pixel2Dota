// Voxel Dire melee lane creep, after the Dota 2 model (hand-authored chibi): a hunched dark creature in a red-orange beaked skull mask (long snout
// pointing down-forward, a black spike on the crown, one glowing yellow-green eye per side), a fan of pale pink bone spines sprouting from the
// shoulders and upper back, a tan leathery chest, long red-brown forearms with big hands, dark digitigrade legs with clawed feet, a short tail,
// and a long rusty broad blade held forward in the right hand. Signature reads: red beak mask, bone spine fan, dark hunch, long rusty blade.
// No team tint (Radiant is a different model). Grid 36 x 36 x 32, ~29 voxels tall to the spine tips, faces -y. Built on the kit + the biped
// library (the hunch is composed onto every pose in build).
import { Vox } from '../vox.js';
import { useMat } from '../mats.js';
import { solve, add3, sub3, mul3, norm3, dot3 } from '../rig.js';
import { bipedAnims, withPoses } from '../poses.js';
import { limb, hand, torso, ell, cap, obox, gripDir } from '../parts.js';

export const META = { rig: 'biped', grid: [36, 36, 32], cx: 18, cy: 21 };
const cx = 18, cy = 21;
export const PROP = {
  cx, cy, hipZ: 9, hipX: 2.1, footX: 2.6, ankleY: 1.8, ankleZ: 3.8, thigh: 3.8, shin: 3.9,
  chestZ: 13.5, chestD: 3, backD: 3.2, shX: 4.5, shY: 0.4, shZ: 15, upper: 4.4, fore: 4.6,
  neckY: -0.4, neckZ: 17, headY: -1.2, headZ: 20.2, headTopZ: 24, hairZ: 19,
};
const HUNCH = 40, HEAD_UP = -24;   // spine pitch forward; the head counter-pitches so the beak points ahead, not at the floor
const HOLD_R = [[-10, 50], [28, 72]];   // blade arm: forward at chest height (held still while walking)
const BLADE_REST = [44, 34];       // in the hunched body frame (40 deg forward): forward, out, a little up
// bone spines: rest-space root offset [dx, dz] on the upper back, direction [dx, dy, dz], length (two segments, the second curls back)
const SPINES = [[-1, 1.6, [-0.3, 0.9, 1.6], 9.5], [1, 1.6, [0.3, 0.9, 1.6], 9.5], [-2.6, 1, [-1, 0.8, 1.5], 9], [2.6, 1, [1, 0.8, 1.5], 9],
  [-4, 0, [-1.7, 0.7, 1.2], 8], [4, 0, [1.7, 0.7, 1.2], 8], [-4.6, -1.4, [-1.9, 0.2, 0.8], 6.4], [4.6, -1.4, [1.9, 0.2, 0.8], 6.4], [0, 0.4, [0, 1.6, 1], 7.4]];

/** Pose: a biped rig pose (rig.js) + bladeR (blade aim, body frame). */
export function build(p = {}) {
  const v = new Vox(36, 36, 32), rig = solve('biped', PROP, { ...p, ...hunch(p) }), J = rig.J, T = rig.T;
  const M = {
    hide: useMat(v, 'hide', { ramp: ['#120a14', '#2a1a1e', '#44292a', '#664036'] }),
    leather: useMat(v, 'chest', { ramp: ['#4a2a2e', '#8c6448', '#b88c66', '#dcb48a'] }),
    arm: useMat(v, 'arm', { ramp: ['#2a0e18', '#6a2a20', '#96462c', '#c0703e'] }),
    claw: useMat(v, 'claw', { from: 'bone' }),
    mask: useMat(v, 'mask', { ramp: ['#561020', '#c4361c', '#f2682a', '#ffa856'] }),
    maskD: useMat(v, 'maskD', { ramp: ['#3e0c1c', '#8e2418', '#c04420', '#e8743a'] }),
    spike: useMat(v, 'spike', { from: 'iron' }),
    spine: useMat(v, 'spine', { ramp: ['#7a3a54', '#e09a98', '#ffc0b4', '#ffe4d8'] }),
    rust: useMat(v, 'rust', { ramp: ['#3a1014', '#8e3a22', '#bc5c32', '#e08c50'] }),
    rustL: useMat(v, 'rustL', { ramp: ['#5a2a26', '#b06a42', '#d89262', '#f6c290'] }),
    rustD: useMat(v, 'rustD', { ramp: ['#200a12', '#4e2018', '#743826', '#985434'] }),
    grip: useMat(v, 'grip', { from: 'leather' }),
    eye: useMat(v, 'eyeGlow', { emit: '#d6ff3c', tier: 'eye' }),
  };

  // ---- digitigrade legs: thigh forward, shin back to a raised hock, metatarsus forward to the clawed foot
  for (const k of ['R', 'L']) {
    const f = J['foot' + k], ball = [f[0], f[1] - 0.6, f[2] + 1];
    limb(v, [ball, J['ankle' + k], J['knee' + k], J['hip' + k]], [1, 1.05, 1.35, 1.7], M.hide);
    v.ellipsoid(f[0], f[1] - 0.8, f[2] + 0.9, 1.6, 1.8, 1, M.hide);
    for (const dx of [-1.1, 0, 1.1]) v.capsule([f[0] + dx, f[1] - 1.6, f[2] + 0.8], [f[0] + dx * 1.3, f[1] - 3.3, f[2] + 0.5], 0.6, M.claw, 0.4);
  }
  // ---- tail: from the rump back and down, off the floor
  const hp = J.hips;
  limb(v, [[hp[0], hp[1] + 2.4, hp[2] + 0.4], [hp[0] + 0.4, hp[1] + 5.6, hp[2] - 1.8], [hp[0] + 1.4, hp[1] + 8.2, hp[2] - 4.4]], [1.5, 1, 0.55], M.hide);

  // ---- hunched body: dark belly and back, tan leathery chest + shoulders
  torso(v, T.torso, { c: [cx, cy], z0: 7.8, z1: 18.4, r: 7 }, (dx, dy, z) => {
    const rx = 2.9 + Math.min(z, 7) * 0.32, ry = 2.7 + Math.min(z, 7) * 0.14;
    if ((dx / rx) ** 2 + (dy / ry) ** 2 > 1) return;
    if (z < 2.6 || dy > 1.4 + (z - 3) * 0.1) return M.hide;
    return M.leather;
  });
  cap(v, T.torso, [cx, cy + 0.4, 16.8], [cx, cy - 0.2, 19], 2, M.hide);   // thick neck under the mask
  // ---- long arms: tan upper arm, red-brown forearm, big hands
  for (const k of ['R', 'L']) {
    const sh = J['shoulder' + k], el = J['elbow' + k], hd = J['hand' + k];
    ell(v, null, sh, [2.2, 2.2, 2], M.leather);
    limb(v, [sh, el], [1.5, 1.3], M.leather);
    limb(v, [el, hd], [1.4, 1.7], M.arm);
    hand(v, hd, [1.8, 1.8, 1.7], M.arm);
  }
  for (const dx of [-1, 0.2, 1.4]) { const h = J.handL; v.capsule([h[0] + dx, h[1] - 0.8, h[2] - 0.6], [h[0] + dx * 1.2, h[1] - 1.8, h[2] - 2.2], 0.6, M.claw, 0.35); }

  // ---- bone spine fan on the upper back (rest space, hunched with the torso), the second segment curls back
  for (const [dx, dz, d0, len] of SPINES) {
    const r0 = [cx + dx, cy + 1.8, PROP.shZ + dz], d = norm3(d0), a = add3(r0, mul3(d, len * 0.55)), b = add3(a, mul3(norm3(add3(d, [0, 0.7, -0.2])), len * 0.45));
    cap(v, T.torso, r0, a, 1.35, M.spine, 0.9);
    cap(v, T.torso, a, b, 0.9, M.spine, 0.45);
  }

  // ---- long rusty broad blade, flat vertical, edge down, held forward (right hand)
  {
    const h = J.handR, d = gripDir(rig, 'R', p.bladeR ?? BLADE_REST), up = [0, 0, 1], side = norm3(sub3(up, mul3(d, dot3(up, d))));
    v.capsule(add3(h, mul3(d, -1.6)), add3(h, mul3(d, 1.2)), 0.6, M.grip);
    const c = add3(add3(h, mul3(d, 1.4)), mul3(side, -0.3));
    obox(v, c, add3(c, mul3(d, 10)), side, t => (t > 0.86 ? 1.9 - (t - 0.86) * 8 : 1.9), 0.8, (px, py, pz) => { const u = dot3(sub3([px, py, pz], c), side); return u > 0.8 ? M.rustD : u < -0.9 ? M.rustL : M.rust; });
  }

  // ---- head (rest space, posed by T.head): red skull mask with a long beak down-forward, crest ridge, crown spike, glowing eyes
  const Th = T.head, [hx, hy, hz] = [cx, cy + PROP.headY, PROP.headZ];
  ell(v, Th, [hx, hy + 1.2, hz - 0.2], [3.4, 3.4, 3.2], M.hide);                       // dark hood behind the mask
  ell(v, Th, [hx, hy - 0.6, hz + 0.2], [3.5, 3.6, 3.5], M.mask);                         // skull
  cap(v, Th, [hx, hy - 1.8, hz - 0.2], [hx, hy - 8.6, hz - 6.4], 2.9, M.mask, 0.5);          // beak
  cap(v, Th, [hx, hy + 1.4, hz + 3.4], [hx, hy - 5.8, hz - 1], 1.1, M.maskD, 0.6);      // crest ridge along the top of the beak
  for (const s of [-1, 1]) cap(v, Th, [hx + s * 3.2, hy - 0.2, hz + 1.8], [hx + s * 3, hy - 2.6, hz - 2.6], 0.9, M.maskD, 0.7);   // cheek flanges
  cap(v, Th, [hx, hy + 0.6, hz + 3.2], [hx, hy + 2, hz + 7], 1.2, M.spike, 0.3);         // crown spike
  for (const s of [-1, 1]) ell(v, Th, [hx + s * 3.1, hy - 1.6, hz + 0.9], [0.6, 0.9, 0.7], M.eye);
  return v;
}

const hunch = p => ({ spine: [(p.spine?.[0] ?? 0) + HUNCH, p.spine?.[1] ?? 0, p.spine?.[2] ?? 0], head: [(p.head?.[0] ?? 0) + HEAD_UP, p.head?.[1] ?? 0, p.head?.[2] ?? 0] });
/** Biped library (build adds the hunch): blade forward (R), the left arm hanging long; the chop raises the blade over the shoulder and cuts down-forward. */
export const ANIMS = (() => {
  const a = bipedAnims({ stride: 1.4, lift: 0.4, bob: 0.4, swing: 7, hold: { R: HOLD_R, L: [[-66, 22], [-78, 40]] }, guard: [[-66, 22], [-78, 40]], blade: [[70, 30], [-5, 75], [32, 50]] });
  const b = withPoses(a, { walk: { armR: HOLD_R }, attack: [{}, { armR: [[-15, 55], [-20, 80]] }, {}], stunned: [{ bladeR: [15, 40] }, { bladeR: [15, 40] }] });
  return { idle: b.idle, walk: b.walk, attack: b.attack, stunned: b.stunned };
})();
