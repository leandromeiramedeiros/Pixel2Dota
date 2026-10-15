// Voxel Juggernaut, a chibi of his Dota 2 model (hand-authored): a tall cream tribal mask IS the face (slanted dark eye slits, a red stripe up
// the forehead and the crest, red cheek marks, a barred mouth), framed by a big shaggy brown mane that spills over the shoulders and down the
// back; bare orange-gold arms and chest, a leather strap across it, dark bracers banded red; a dark layered skirt with red-orange aprons front and
// back, wrapped shins, dark boots; a dark red cloth over the left shoulder, a small orange banner on a pole at his back; a slim katana with a
// glowing red edge held low in the right hand; a wide, crouched stance. Signature reads: cream mask in a brown mane, bare orange torso, red-edged
// katana low, wide stance. Grid 48 x 48 x 48 (room for the Blade Fury sweep), ~43 voxels tall to the banner, faces -y.
import { Vox } from '../vox.js';
import { useMat } from '../mats.js';
import { solve } from '../rig.js';
import { limb, band, hand, feet, torso, skirt, pauldron, ell, cap, vol, weapon } from '../parts.js';

export const META = { rig: 'biped', grid: [48, 48, 48], cx: 24, cy: 24 };
const cx = 24, cy = 24;
export const PROP = {
  cx, cy, hipZ: 10, hipX: 2.8, footX: 4.4, ankleY: -0.3, ankleZ: 3.5, thigh: 4.2, shin: 3.6,
  chestZ: 18, shX: 5.4, shY: 0.6, shZ: 20.6, upper: 4.6, fore: 4.6, neckY: 0.4, neckZ: 22, headY: -0.6, headZ: 29.6, headTopZ: 37, hairZ: 23,
};
const HOLD = { R: [[-62, 30], [-40, 70]], L: [[-62, 14], [-42, 52]] };   // sword hand low at the right hip, left hand loose in front
const BLADE = [-36, 80];                                                   // idle blade: low, down and forward past the right foot (reads from the camera)
const hash = (x, y, z) => { const s = Math.sin(x * 12.99 + y * 78.23 + z * 37.71) * 43758.55; return s - Math.floor(s); };

/** Pose p: a biped rig pose (rig.js) + bladeR (katana aim [el, hd], body frame), flag (banner flutter phase). */
export const rigOf = p => solve('biped', PROP, p).J;

export function build(p = {}) {
  const v = new Vox(48, 48, 48), rig = solve('biped', PROP, p), J = rig.J, T = rig.T, flag = p.flag || 0;
  const M = {
    skin: useMat(v, 'skin', { ramp: ['#6a2c08', '#a8600e', '#d68c1e', '#f4b850'] }),
    skinD: useMat(v, 'skinD', { ramp: ['#4e1e08', '#80440c', '#a8681a', '#c88a34'] }),
    mask: useMat(v, 'mask', { ramp: ['#6a5a4c', '#a89a86', '#d0c6b4', '#ece4d4'] }),
    maskR: useMat(v, 'maskR', { ramp: ['#4a0c06', '#8a1e08', '#b8340c', '#dc5a26'] }),
    eyeSlit: useMat(v, 'eyeSlit', { ramp: ['#0a0606', '#181010', '#24180f', '#342418'] }),
    fur: useMat(v, 'fur', { ramp: ['#1e0e06', '#4a240e', '#6e3c18', '#965e34'] }),
    furD: useMat(v, 'furD', { ramp: ['#140804', '#2e160a', '#462410', '#663a1e'] }),
    furL: useMat(v, 'furL', { ramp: ['#2a1608', '#6a4024', '#8e603a', '#b48656'] }),
    pants: useMat(v, 'pants', { ramp: ['#100a06', '#22170f', '#342418', '#4a3828'] }),
    cloth: useMat(v, 'cloth', { ramp: ['#2a0602', '#5c1a04', '#882a08', '#b4460e'] }),
    clothO: useMat(v, 'clothO', { ramp: ['#4a1404', '#943006', '#c44c10', '#ec7a2a'] }),
    wrap: useMat(v, 'wrap', { ramp: ['#241e1a', '#463c32', '#62564a', '#827464'] }),
    leather: useMat(v, 'leather', { ramp: ['#120a06', '#2c1a10', '#442a1a', '#62422c'] }),
    bracer: useMat(v, 'bracer', { ramp: ['#0c0a08', '#1e1a16', '#2e2a24', '#46403a'] }),
    wood: useMat(v, 'wood', { ramp: ['#1a0c06', '#3a2010', '#56341c', '#76502e'] }),
    blade: useMat(v, 'blade', { ramp: ['#0c0808', '#1c1310', '#2e221a', '#4a382c'] }),
    guard: useMat(v, 'guard', { ramp: ['#1a1008', '#3a2a14', '#5a4220', '#7e6034'] }),
    edge: useMat(v, 'edge', { emit: '#e2440e', tier: 'signature', gain: 0.95 }),
  };
  const furAt = (px, py, pz) => { const h = hash(Math.floor(px * 0.8), Math.floor(py * 0.5), Math.floor(pz * 0.34)); return h < 0.3 ? M.furD : h > 0.82 ? M.furL : M.fur; };

  // ---- legs: wide crouched stance; wrapped grey shins, dark boots, dark trousers (mostly under the skirt)
  for (const k of ['R', 'L']) {
    const f = J['foot' + k];
    feet(v, f, 'boot', M.pants, { hw: 2, front: 3.6, back: 1.8, h: 3 });
    limb(v, [J['ankle' + k], J['knee' + k]], [1.55, 1.7], M.wrap);
    limb(v, [J['knee' + k], J['hip' + k]], [1.8, 1.9], M.pants);
  }
  // ---- skirt: dark layered armour skirt, red hem; red apron in front, a bigger orange-red apron at the back (both dark-edged)
  const SK = { z0: 5.2, z1: 12.4, r0: 4.8, dr: 1.4, sy: 0.86 };
  skirt(v, T.torso, { c: [cx, cy + 0.4], z0: SK.z0, z1: SK.z1, zr: SK.z1, h: SK.z1 - SK.z0, r0: SK.r0, dr: SK.dr, sy: SK.sy, shell: 1.6, hemH: 1.1 }, M.pants, M.cloth);
  const skR = pz => SK.r0 + SK.dr * (SK.z1 - pz) / (SK.z1 - SK.z0);
  for (const [s, hw, zb, m] of [[-1, 2.4, 3.8, M.cloth], [1, 3.4, 4.2, M.clothO]]) {
    vol(v, T.torso, cx - 4, cy - 9, zb, cx + 4, cy + 9, SK.z1, (px, py, pz) => {
      const yS = cy + 0.4 + s * skR(pz) * SK.sy, d = (py - yS) * s; if (d < -0.4 || d > 0.8) return;
      const w = hw + (SK.z1 - pz) * 0.08, ax = Math.abs(px - cx); if (ax > w) return;
      return ax > w - 0.7 || pz < zb + 0.8 ? M.leather : m;
    });
  }
  // ---- torso: bare broad chest, pecs, a dark line down the belly; a leather strap from the left shoulder to the right hip; belt + red sash
  torso(v, T.torso, { c: [cx, cy], z0: 11, z1: 22.4, r: 7 }, (dx, dy, z) => {
    const rx = 3.9 + Math.min(1, z / 7) * 1.5 - Math.max(0, z - 9.6) * 0.5, ry = 2.9 + (dy < 0 && z > 5 && z < 9.6 ? 0.6 : 0);
    if ((dx / rx) ** 2 + (dy / ry) ** 2 > 1) return;
    if (z < 2.6) return z < 0.9 ? M.cloth : M.leather;                                   // sash + belt
    if (Math.abs(z - (6.6 + dx * 0.62)) < 0.8) return M.leather;                         // strap
    if (dy < -1.6 && ((z > 4.8 && z < 5.6 && Math.abs(dx) > 0.6) || (Math.abs(dx) < 0.5 && z < 7.6))) return M.skinD;   // pec line, belly line
    return M.skin;
  });
  cap(v, T.torso, [cx, cy + 0.4, 21], [cx, cy + 0.4, 23.6], 1.8, M.skin);               // neck

  // ---- arms: bare thick upper arms, dark bracers with a red band, bare hands
  for (const k of ['R', 'L']) {
    const sh = J['shoulder' + k], el = J['elbow' + k], hd = J['hand' + k];
    limb(v, [sh, el], [1.8, 1.5], M.skin);
    v.capsule(el, hd, 1.5, (px, py, pz, t) => (t > 0.3 && t < 0.48 ? M.cloth : t < 0.86 ? M.bracer : M.skin), 1.45);
    hand(v, hd, [1.4, 1.4, 1.3], M.skin);
  }
  // shoulder cloth: dark red drape over the left shoulder, leather rim, a flap hanging down the outer arm
  { const sh = J.shoulderL; pauldron(v, sh, [3, 3.1, 2.4], M.cloth, M.leather, 0.7); cap(v, null, [sh[0] + 1.6, sh[1], sh[2] + 0.6], [sh[0] + 2.4, sh[1] + 0.2, sh[2] - 2.4], 1.3, M.cloth, 0.9); }

  // ---- banner on a pole at the back (left side), flag hung from the top bar beside it: orange-red, dark trim
  const pb = [cx + 2.4, cy + 4.6, 13], pt = [cx + 3.6, cy + 6.6, 42.6];
  cap(v, T.torso, pb, pt, 0.6, M.wood);
  cap(v, T.torso, [pt[0] - 0.2, pt[1], pt[2] - 0.4], [pt[0] + 5.4, pt[1], pt[2] - 0.4], 0.5, M.wood);
  vol(v, T.torso, pt[0], pt[1] - 2, 32, pt[0] + 5.6, pt[1] + 2, pt[2] - 0.8, (px, py, pz) => {
    const u = px - pt[0], yw = pt[1] + Math.sin(u * 1.1 + flag * 1.6) * 0.45 + (pt[2] - pz) * 0.04; if (u < 0.6 || u > 5.2 || Math.abs(py - yw) > 0.55) return;
    const bot = 33.4 + Math.abs(u - 2.9) * 0.6; if (pz < bot) return;
    return u > 4.4 || pz < bot + 0.9 ? M.leather : Math.abs(u - 2.9) < 0.6 && pz > 36 && pz < 40 ? M.cloth : M.clothO;
  });

  // ---- mane: shaggy brown mass down the back (torso space) and over the shoulders
  vol(v, T.torso, cx - 8, cy, 14, cx + 8, cy + 9, 30, (px, py, pz) => {
    const dx = px - cx, w = 6.6 - Math.max(0, 22 - pz) * 0.28; if (Math.abs(dx) > w) return;
    const back = cy + 6.4 - Math.max(0, 22 - pz) * 0.16 - (dx / w) ** 2 * 2; if (py > back || py < cy + 1.4) return;
    const tip = 15.4 + Math.abs(((dx * 0.9) % 2.4) - 1.2) * 1.8 + Math.abs(dx) * 0.3; if (pz < tip) return;
    return furAt(px, py, pz);
  });
  for (const s of [-1, 1]) ell(v, T.torso, [cx + s * 3.2, cy + 2.8, 23.4], [2.6, 3, 2], furAt);

  // ---- head (head space): mane around and behind the mask, then the mask on top (it IS the face)
  const Th = T.head, [hx, hy, hz] = [cx, cy + PROP.headY, PROP.headZ], yF = hy - 4.4;
  ell(v, Th, [hx, hy + 2.2, hz + 0.2], [8, 6.4, 8], (px, py, pz) => (pz > hz + 5.6 ? M.furL : furAt(px, py, pz)), (px, py, pz) => py > yF + 1.4 + Math.max(0, 7 - Math.abs(px - hx)) * 0.12);
  for (const s of [-1, 1]) ell(v, Th, [hx + s * 6.2, hy + 1.2, hz - 4], [2.6, 3.2, 3.6], furAt);   // side locks beside the jaw, down to the shoulders
  for (const s of [-1, 1]) cap(v, Th, [hx + s * 5, hy + 2, hz + 4], [hx + s * 7.8, hy + 4.2, hz + 7.6], 1.8, furAt, 0.6);   // tufts flicking up
  const halfW = zz => (zz > 6.2 ? 3.1 + (zz - 6.2) * 0.2 : zz > -2 ? 4.9 : 4.9 - (-2 - zz) * 0.62);
  vol(v, Th, hx - 6, yF - 0.5, hz - 6.8, hx + 6, hy + 1.2, hz + 9.8, (px, py, pz) => {
    const dx = px - hx, ax = Math.abs(dx), zz = pz - hz, hw = halfW(zz); if (zz < -6.6 || zz > 9.6 || ax > hw) return;
    const f = yF + (ax / hw) ** 2 * 1.6 + Math.max(0, zz - 6.2) * 0.3 + Math.max(0, -3 - zz) * 0.3; if (py < f) return;
    if (py > f + 1.1) return M.mask;                                                       // body of the mask (front layer below)
    const ez = 0.9 + (ax - 1.2) * 0.4;
    if (ax > 1.2 && ax < 3.8 && Math.abs(zz - ez) < 1) return M.eyeSlit;                   // slanted eye slits
    if (zz > -4.6 && zz < -3.2 && ax < 2.6) return Math.floor(px) % 2 ? M.eyeSlit : M.mask;   // barred mouth
    if (ax < 0.75 && zz > 2.2) return M.maskR;                                             // forehead + crest stripe
    if (zz > 8.8) return M.maskR;                                                          // crest rim
    if (ax > 2.2 && ax < 3.2 && zz > -2.6 && zz < -0.4) return M.maskR;                    // cheek marks
    return M.mask;
  });

  // ---- katana in the right hand: dark blade, glowing red edge, round guard (drawn after the body, before nothing else covers the mask)
  weapon(v, rig, 'R', 'katana', { len: 12.5, w: 1.4, curve: 1.2, edgeOff: 0.95, aim: p.bladeR ?? BLADE, mats: { blade: M.blade, edge: M.edge, guard: M.guard, grip: M.leather } });
  return v;
}

const range = n => [...Array(n).keys()];
const sw = (a, d) => a.map(([el, hd]) => [el + d, hd]);
/** Anims: idle = crouched, wide stance, katana low (breathing bob); walk = leaning run, katana trailing back level; attack = katana raised
 * up and back, then a diagonal cut across the front; cast (Blade Fury wind-up, the reference has no cast frames of its own) = deep crouch
 * twisted right with the blade held level behind, the uncoil, then the spin with the blade swept out wide; stunned slump, blade drooping. */
export const ANIMS = {
  idle: range(4).map(i => {
    const b = [0, 1, 2, 1][i];
    return { bob: -0.6 - b * 0.2, armR: sw(HOLD.R, b * 2), armL: sw(HOLD.L, -b * 2), head: [b * 1, 0, 0], flag: b };
  }),
  walk: range(4).map(i => {
    const st = [1, 0, -1, 0][i];
    return {
      bob: [-0.8, -0.3, -0.8, -0.3][i], spine: [16, st * 5, 0], head: [-10, -st * 3, 0], footR: [0, -st * 1.8, i === 3 ? 0.5 : 0], footL: [0, st * 1.8, i === 1 ? 0.5 : 0],
      armR: [[-40, -36 + st * 6], [-30, -56]], armL: sw([[-50, 30], [-10, 70]], -st * 8), bladeR: [8, -86], flag: i,
    };
  }),
  attack: [
    { bob: -0.4, spine: [-4, -22, 0], head: [-2, 12, 0], armR: [[52, -26], [80, -10]], armL: [[-40, 40], [-10, 70]], bladeR: [56, -40], footR: [0, 1, 0], flag: 0 },
    { bob: -1.2, spine: [16, 20, 0], head: [-12, -10, 0], armR: [[-4, 72], [-24, 96]], armL: [[-60, 10], [-50, 30]], bladeR: [-30, 120], footR: [0, -2, 0], footL: [0, 1.2, 0.3], flag: 2 },
    { bob: -0.8, spine: [8, 8, 0], head: [-6, -4, 0], armR: [[-50, 40], [-50, 70]], armL: HOLD.L, bladeR: [-40, 40], footR: [0, -0.8, 0], flag: 1 },
  ],
  cast: [
    { bob: -1.4, spine: [10, -30, 0], head: [-8, 26, 0], armR: [[-20, -10], [0, -10]], armL: [[-10, 50], [10, 60]], bladeR: [-4, -14], footR: [0, 1, 0], footL: [0, -1, 0], flag: 0 },
    { bob: -1.2, spine: [6, 10, 0], head: [-6, -6, 0], armR: [[-14, 40], [-4, 60]], armL: [[-10, 40], [0, 20]], bladeR: [2, 70], flag: 2 },
    { bob: -1, spine: [4, 28, 0], head: [-4, -24, 0], armR: [[-10, 24], [-2, 30]], armL: [[-6, -30], [-4, -10]], bladeR: [0, -6], footR: [0, -0.6, 0], footL: [0, 0.6, 0], flag: 1 },
  ],
  stunned: range(2).map(i => ({
    bob: -1.4, spine: [10, [4, -4][i], [3, -3][i]], head: [10, [6, -6][i], [4, -4][i]], armR: [[-80, 14], [-76, 30]], armL: [[-80, 8], [-84, 14]], bladeR: [-58, 30], flag: i,
  })),
};

/** HUD portrait framing (tools/vox/portrait.mjs): idle, the mask in the upper third, mane around it. */
export const PORTRAIT = { pose: ANIMS.idle[0], center: [cx, cy, 29], scale: 1.15, fov: 24, sig: '#d68c1e', face: [4, 11, 24, 24] };
