// Voxel Forged Spirit (Invoker's summon), after the Dota 2 model (hand-authored chibi): no legs. A flame body (bright yellow under the shoulders,
// orange, then dark red) tapering to a point that trails back above the ground; a hunched crust of dark rock over the shoulders and the head,
// cracked with glowing seams and studded with red rock; the head thrust forward and down, a glowing mouth and eyes; two very long bowed arms of
// fire reaching to the ground on dark claws. Signature reads: dark cracked rock hump on a yellow flame, long arms to the ground, no legs.
// One colour scheme (a summon, no team tint). Grid 36 x 36 x 32, ~28 voxels tall, faces -y. The arms are two-bone IK (claws planted).
import { Vox } from '../vox.js';
import { useMat } from '../mats.js';
import { solve, ik2, xfApply, add3 } from '../rig.js';
import { vol, ell, cap, limb } from '../parts.js';

export const META = { rig: 'biped', grid: [36, 36, 32], cx: 18, cy: 18 };
const cx = 18, cy = 18;
export const PROP = { cx, cy, hipZ: 10, shX: 6.6, shY: 0.6, shZ: 21, neckY: -2, neckZ: 21, headY: -3, headZ: -1, headTopZ: 3 };
const ARM = [11.2, 11.6];                          // upper, fore: longer than the reach, so the elbows bow out
const HAND = [8.4, -1.6, 2.8];                     // rest hand target (x out from cx, y, z), the claws reach the floor from here

// cheap 3D cell noise: jittered seed per cell, crack = near the border of two Voronoi cells
const hash = (x, y, z, k) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + k * 19.3) * 43758.5453; return s - Math.floor(s); };
function crack(px, py, pz, sc = 0.15) {
  const X = px * sc, Y = py * sc, Z = pz * sc, ix = Math.floor(X), iy = Math.floor(Y), iz = Math.floor(Z);
  let d1 = 9, d2 = 9;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
    const gx = ix + a, gy = iy + b, gz = iz + c, d = Math.hypot(gx + hash(gx, gy, gz, 1) - X, gy + hash(gx, gy, gz, 2) - Y, gz + hash(gx, gy, gz, 3) - Z);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return d2 - d1;
}

/** Pose: biped spine / head / bob + handR / handL: hand target offsets [dx, dy, dz] from the planted rest (dz > 0 lifts the claws). */
export function build(p = {}) {
  const v = new Vox(36, 36, 32), T = solve('biped', PROP, p).T;
  const M = {
    fY: useMat(v, 'flameY', { ramp: ['#c8701a', '#f8a81e', '#ffd236', '#fff26a'] }),
    fO: useMat(v, 'flameO', { ramp: ['#7a2408', '#d0600a', '#f08a1e', '#ffb43c'] }),
    fR: useMat(v, 'flameR', { ramp: ['#2a0a0c', '#5a1608', '#94300a', '#c45016'] }),
    rock: useMat(v, 'rock', { ramp: ['#120a10', '#26140f', '#3e231c', '#5e3a2c'] }),
    rockR: useMat(v, 'rockR', { ramp: ['#300a0c', '#6c1a0b', '#a8281a', '#d4502a'] }),
    claw: useMat(v, 'claw', { ramp: ['#120608', '#2e0c08', '#541a0c', '#7a3016'] }),
    seam: useMat(v, 'seam', { emit: '#ffc23a', tier: 'signature' }),
    maw: useMat(v, 'maw', { emit: '#ff7a1e', tier: 'signature' }),
    eye: useMat(v, 'eyeGlow', { emit: '#fff07a', tier: 'eye' }),
  };
  const flameAt = (pz, px, py) => { const n = Math.sin(px * 0.7) * 0.9 + Math.sin(py * 0.9 + 1) * 0.5; return pz + n > 14 ? M.fY : pz + n > 8 ? M.fO : M.fR; };

  // ---- flame body (torso space): widest under the shoulders, tapering to a point that trails back, ~2 above the ground
  vol(v, T.torso, cx - 8, cy - 7, 1.6, cx + 8, cy + 9, 24, (px, py, pz) => {
    const z = pz, back = z < 18 ? (18 - z) * 0.22 : 0, r = z > 18 ? 7.2 - (z - 18) * 0.3 : 0.7 + (z - 1.6) / 16.4 * 6.5;
    const dx = px - cx, dy = (py - cy - back) / 0.8;
    if (dx * dx + dy * dy > r * r) return;
    return flameAt(pz, px, py);
  });

  // ---- rock crust over the shoulders and upper back (torso space): a hunched dome, glowing seams, red rocks on the crown
  const crust = (px, py, pz) => (crack(px, py, pz) < 0.07 ? M.seam : M.rock);
  ell(v, T.torso, [cx, cy + 1, 21.6], [7.6, 6.2, 4.8], crust, (px, py, pz) => pz > 20.4 - (py - cy) * 0.3);
  for (const [x, y, z, r] of [[-3.6, 0.2, 25.2, 1.7], [2.6, -0.8, 25.6, 1.8], [-0.4, 2.6, 26, 1.6], [4.8, 2, 24.2, 1.5], [-5.4, 2.6, 23.6, 1.4], [0.8, -2.8, 24.4, 1.3]])
    ell(v, T.torso, [cx + x, cy + y, z], [r, r, r * 1.2], (px, py, pz) => (pz > z + r * 0.4 ? M.rockR : crust(px, py, pz)));

  // ---- head (head space): a rock skull thrust forward and down, brow ridge, a glowing maw under a heavy jaw, two burning eyes
  const Th = T.head, h = [cx, cy + PROP.neckY + PROP.headY, PROP.neckZ + PROP.headZ];
  ell(v, Th, h, [3.4, 3.4, 3], crust);
  ell(v, Th, [h[0], h[1] - 0.6, h[2] - 2.8], [2.6, 2.6, 1.3], M.rock);                         // jaw
  ell(v, Th, [h[0], h[1] - 1.6, h[2] - 1.5], [2, 2.2, 0.8], M.maw);                            // the maw glow between skull and jaw
  cap(v, Th, [h[0] - 3, h[1] - 2.4, h[2] + 1.4], [h[0] + 3, h[1] - 2.4, h[2] + 1.4], 1, M.rock); // brow ridge
  for (const s of [-1, 1]) ell(v, Th, [h[0] + s * 1.5, h[1] - 3.1, h[2] + 0.3], [0.7, 0.6, 0.6], M.eye);

  // ---- arms: two-bone IK from the shoulders to planted hands, elbows bowed out; yellow at the shoulder -> orange -> dark red, dark claws
  for (const [k, s] of [['R', -1], ['L', 1]]) {
    const off = p['hand' + k] || [0, 0, 0];
    const sh = xfApply(T.torso, [cx + s * PROP.shX, cy + PROP.shY, PROP.shZ]);
    const hd = [cx + s * HAND[0] + s * off[0], cy + HAND[1] + off[1], HAND[2] + off[2]];
    const { mid: el, end } = ik2(sh, hd, ARM[0], ARM[1], [s, 0.2, 0.25]);
    ell(v, null, sh, [2.2, 2.2, 2], crust);                                                    // rock shoulder cap
    v.capsule(sh, el, 1.7, (px, py, pz, t) => (t < 0.55 ? M.fY : M.fO), 1.25);
    v.capsule(el, end, 1.25, (px, py, pz, t) => (t < 0.45 ? M.fO : M.fR), 1.15);
    ell(v, null, end, [1.5, 1.6, 1.3], M.fR);
    for (const c of [-1, 0, 1]) {                                                                // three long hooked claws, reaching z 0
      const a = add3(end, [c * 0.9, -0.6, -0.4]), tip = [end[0] + c * 1.9 - s * 0.5, end[1] - 2.8 + Math.abs(c) * 0.6, end[2] - 3.2];
      limb(v, [a, tip], [0.7, 0.35], M.claw);
    }
  }
  return v;
}

const range = n => [...Array(n).keys()];
/** Anims: idle = the flame breathing (bob), claws planted; walk = a knuckle-loping gait (claws swing alternately, the body leans in);
 * attack = rear back, then lunge forward (it spits the bolt); stunned = slumped forward. No cast (the summon has no spells of its own). */
export const ANIMS = {
  idle: range(4).map(i => { const b = [0, 1, 2, 1][i]; return { bob: b * 0.3, spine: [b * 1.5, 0, 0], head: [b * 2, 0, 0] }; }),
  walk: range(4).map(i => {
    const st = [1, 0, -1, 0][i];
    return { bob: [0.4, 0.8, 0.4, 0.8][i], spine: [12, st * 5, 0], head: [-6, -st * 4, 0], handR: [0, -st * 3, 0], handL: [0, st * 3, 0] };
  }),
  attack: [
    { bob: 0.6, spine: [-8, 0, 0], head: [-2, 0, 0], handR: [-1, 1.4, 2.4], handL: [-1, 1.4, 2.4] },
    { bob: 0.2, spine: [22, 0, 0], head: [6, 0, 0], handR: [-1, -3.2, 0.4], handL: [-1, -3.2, 0.4] },
    { bob: 0.2, spine: [8, 0, 0], head: [0, 0, 0], handR: [0, -1.4, 0], handL: [0, -1.4, 0] },
  ],
  stunned: range(2).map(i => ({ bob: -0.2, spine: [16, [3, -3][i], 0], head: [16, [8, -8][i], 0], handR: [-1.2, -0.6, 0], handL: [-1.2, -0.6, 0] })),
};
