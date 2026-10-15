// Voxel Zeus, a chibi of his Dota 2 model (hand-authored): a bronze old man with white hair swept back from a high forehead and a big full white
// beard + moustache; a bare chest with a green gem under an open royal-blue vest (pale trim, tall shoulder flares); bare bronze arms in huge blue
// gauntlets with a cyan glow band; a pale blue tabard (front and back flaps, pointed) over baggy dark navy trousers and dark boots; two long blue
// streamers trailing back from the nape. Signature reads: white beard + swept-back hair on a bronze face, the green chest gem, blue gauntlets with
// a cyan glow, the trailing blue streamers. Grid 40 x 46 x 52 (room for the streamers and raised arms), ~41 voxels tall, faces -y.
import { Vox } from '../vox.js';
import { useMat } from '../mats.js';
import { solve } from '../rig.js';
import { LIBRARY, withPoses } from '../poses.js';
import { limb, band, hand, feet, torso, skirt, pauldron, ell, cap, eyes, mouth, decal } from '../parts.js';

export const META = { rig: 'biped', grid: [40, 46, 52], cx: 20, cy: 16 };
const cx = 20, cy = 16;
const U = 2;   // leg length over the base chibi (as Lina / Invoker)
export const PROP = {
  cx, cy, hipZ: 8 + U, hipX: 2.6, footX: 3.2, ankleY: -0.3, ankleZ: 3.5, thigh: 3.8, shin: 3.4,
  chestZ: 16 + U, shX: 6, shY: 0.4, shZ: 19 + U, upper: 4.6, fore: 4.8, neckY: 0.3, neckZ: 21 + U, headY: -0.6, headZ: 28.6 + U, headTopZ: 35.4 + U, hairZ: 22 + U,
};
const SKULL = [5.6, 5.4, 6.2];
const HOLD = { R: [[-70, 6], [-52, 34]], L: [[-70, 6], [-52, 34]] };   // arms out a little at the sides, fists forward (the ready idle)

/** Pose p: a biped rig pose (rig.js) + trail (streamers swept back 0..1), eyes. */
export const rigOf = p => solve('biped', PROP, p).J;

export function build(p = {}) {
  const v = new Vox(40, 46, 52), rig = solve('biped', PROP, p), J = rig.J, T = rig.T, trail = p.trail || 0;
  const M = {
    skin: useMat(v, 'skin', { ramp: ['#5a3a2e', '#94705a', '#b89478', '#dcbc9c'] }),
    skinD: useMat(v, 'skinD', { ramp: ['#3e261e', '#6e4e3e', '#8e6c56', '#b08e74'] }),
    hair: useMat(v, 'hair', { ramp: ['#3a4654', '#7a8894', '#a8b4ba', '#d4dcde'] }),
    hairL: useMat(v, 'hairL', { ramp: ['#4a5868', '#98a6ae', '#c4ced2', '#eaf0f0'] }),
    hairD: useMat(v, 'hairD', { ramp: ['#2c3644', '#5a6876', '#84929c', '#aebcc2'] }),
    vest: useMat(v, 'vest', { ramp: ['#04102e', '#0c3a8c', '#1a5cc4', '#4a8ae4'] }),
    trim: useMat(v, 'trim', { ramp: ['#284e66', '#6c9cb0', '#a8cede', '#e0f2f8'] }),
    tabard: useMat(v, 'tabard', { ramp: ['#16344e', '#36749c', '#5898bc', '#88c2dc'] }),
    navy: useMat(v, 'navy', { ramp: ['#02060e', '#061428', '#0c2240', '#1a3858'] }),
    boot: useMat(v, 'boot', { ramp: ['#04060c', '#0c1424', '#18263a', '#2c4058'] }),
    glove: useMat(v, 'glove', { ramp: ['#020a24', '#062a78', '#0c44a8', '#2a6cd0'] }),
    glow: useMat(v, 'glow', { emit: '#5cd2ff', tier: 'signature', gain: 1 }),
    gem: useMat(v, 'gem', { emit: '#54e05a', tier: 'signature' }),
    lash: useMat(v, 'lash'),
    pupil: useMat(v, 'pupil', { emit: '#b8ecff', tier: 'eye', gain: 0.8 }),
    shine: useMat(v, 'shine', { gain: 0.9 }),
    mouth: useMat(v, 'mouth', { emit: '#4a2a2a', tier: 'eye' }),
  };

  // ---- legs: baggy dark navy trousers, dark boots with a blue cuff
  for (const k of ['R', 'L']) {
    const f = J['foot' + k];
    feet(v, f, 'boot', M.boot, { hw: 2, front: 3.6, back: 1.8, h: 3.6 });   // feet() takes a plain id (a function is not resolved)
    limb(v, [J['ankle' + k], J['knee' + k], J['hip' + k]], [1.7, 2, 2.1], M.navy);
    band(v, J['ankle' + k], J['knee' + k], 0.05, 0.3, 1.9, M.boot);
  }
  // ---- tabard: pale blue flaps from the belt, long pointed front and back, short at the sides (the trousers show); dark blue hem
  const W = 11.4 + U;
  skirt(v, T.torso, {
    c: [cx, cy + 0.4], z0: 3, z1: W, zr: W, h: W - 3, r0: 4.6, dr: -0.4, sy: 0.82, shell: 1.4, hollow: true, hemH: 0.9,
    floor: phi => { const u = phi / Math.PI, s = Math.abs(u - 0.5) * 2; return 9.6 - s * 6 + (u < 0.5 ? 0 : 0.6); },
  }, M.tabard, M.vest);
  // ---- torso: bare bronze chest in a V, the green gem, open blue vest with pale lapel trim, a dark belt
  torso(v, T.torso, { c: [cx, cy], z0: 9.6 + U, z1: 21.6 + U, r: 7 }, (dx, dy, z, px, py, pz) => {
    const rx = 4.6 + Math.min(1, z / 7) * 1.8, ry = 3.8 + (z > 4 ? 0.6 : 0);
    if ((dx / rx) ** 2 + (dy / ry) ** 2 > 1) return;
    if (z < 1.6) return M.navy;                                                   // belt
    const vw = 0.6 + Math.max(0, z - 2) * 0.32;                                    // the V widens toward the collar
    if (dy < -0.6) {
      if (Math.abs(dx) < vw) return z > 4.4 && z < 6.6 && Math.abs(dx) < 1.1 ? M.gem : M.skin;
      if (Math.abs(dx) < vw + 1) return M.trim;
    }
    return M.vest;
  });
  // neck
  cap(v, T.torso, [cx, cy + 0.3, 21 + U], [cx, cy + 0.3, 23 + U], 1.8, M.skin);

  // ---- arms: bare bronze upper arms, huge blue gauntlets on the forearms with a cyan glow band, blue gloved fists; vest shoulder flares
  for (const [k, s] of [['R', -1], ['L', 1]]) {
    const sh = J['shoulder' + k], el = J['elbow' + k], hd = J['hand' + k];
    limb(v, [sh, el], [1.6, 1.4], M.skin);
    v.capsule(el, hd, 1.5, M.glove, 2.1);
    band(v, el, hd, 0.7, 0.72, 1.95, M.glow);   // a thin cyan ring near the wrist (restraint)
    band(v, el, hd, 0.02, 0.12, 1.7, M.trim);
    hand(v, hd, [1.6, 1.6, 1.5], M.glove);
    pauldron(v, sh, [2.6, 2.6, 2.4], M.vest, M.trim, 0.8);
    v.capsule([sh[0], sh[1] + 0.2, sh[2] + 1.6], [sh[0] + s * 1.6, sh[1] + 0.6, sh[2] + 4.2], 1.1, M.trim, 0.4);   // tall flare
  }

  // ---- head: bronze skull, white hair swept straight back from a high forehead into a short mane, a big full beard and moustache
  const Th = T.head, [hx, hy, hz] = [cx, cy + PROP.headY, PROP.headZ];
  ell(v, Th, [hx, hy, hz], SKULL, M.skin);
  const strand = (px) => [M.hair, M.hairL, M.hair, M.hairD][((Math.floor((px - hx + 0.5) / 1.5) % 4) + 4) % 4];
  const line = px => hz + 4.8 - Math.min(2.4, Math.abs(px - hx) * 0.5);           // hairline: high forehead, receding at the temples
  const face = (px, py, pz) => py < hy - 1 + Math.max(0, hz - pz) * 0.5 && pz < line(px);
  ell(v, Th, [hx, hy + 1, hz + 0.6], [5.9, 6, 6.6], strand, (px, py, pz) => !face(px, py, pz) && pz > hz - 1.6 && py > hy - 3.6);
  ell(v, Th, [hx, hy + 3.6, hz - 1.6], [5.6, 4, 5.6], strand, (px, py, pz) => py > hy + 1.6);        // the mane behind, to the nape
  for (const s of [-3.4, -1.2, 1.2, 3.4]) {                                                          // swept-back locks, tips flaring back
    cap(v, Th, [hx + s * 0.8, hy - 2.4, hz + 5 - Math.abs(s) * 0.3], [hx + s * 1.25, hy + 7.4, hz - 1.4 - Math.abs(s) * 0.4], 1.9, strand, 0.6);
  }
  // beard: a full white beard from the cheeks to the chest, pointed at the bottom; moustache over the mouth
  const beard = (px, py, pz) => { const k = Math.floor((px - hx + 0.5) / 2); return [M.hair, M.hairL, M.hairD][((k % 3) + 3) % 3]; };
  ell(v, Th, [hx, hy - 1.6, hz - 4.4], [5, 4, 4.4], beard, (px, py, pz) => py < hy + 1.6 && pz < hz - 3.8 + Math.abs(px - hx) * 0.55);
  ell(v, Th, [hx, hy - 2.6, hz - 7.2], [3.4, 2.8, 3.2], beard, (px, py, pz) => pz > hz - 10.2 + Math.abs(px - hx) * 0.9);   // the point
  for (const s of [-1, 1]) cap(v, Th, [hx + s * 4.8, hy + 0.2, hz - 0.2], [hx + s * 5.6, hy + 0.6, hz - 2.4], 1.2, M.hairD);   // sideburns

  // ---- face, painted on the front-most voxels (follows the posed head): heavy white brows, pale glowing eyes, nose, moustache
  const hc = J.head, ox = Math.round(hc[0] - cx), oz = Math.round(hc[2] - hz), ez = Math.round(hz - 1) + oz;
  decal(v, [-4, -3, -2, 1, 2, 3].map(x => [cx + x + ox, ez + 2]), M.hairL);                  // brows
  eyes(v, { at: [[cx - 4 + ox], [cx + 2 + ox]], z: ez, style: 'dot', state: p.eyes }, M);
  decal(v, [[cx + ox - 1, ez - 1], [cx + ox, ez - 1], [cx + ox - 1, ez - 2], [cx + ox, ez - 2]], M.skin);   // nose
  decal(v, [[cx + ox - 1, ez - 3], [cx + ox, ez - 3]], M.skinD);
  decal(v, [-3, -2, -1, 0, 1, 2].map(x => [cx + x + ox, ez - 4]), M.hairL);                   // moustache
  mouth(v, [[cx - 1 + ox, ez - 5], [cx + ox, ez - 5]], M.mouth);

  // ---- streamers: two long blue ribbons from the nape trailing back near level (they must not read as antennae from the front), swept further back in motion
  const n = J.neck;
  for (const s of [-1, 1]) {
    const a = [n[0] + s * 1.4, n[1] + 2.6, n[2] + 2], b = [n[0] + s * (2.4 + trail), n[1] + 15 + trail * 4, n[2] + 1.4 + trail];
    const c = [n[0] + s * (3 + trail), n[1] + 25 + trail * 2, n[2] + 2.4 - trail];
    v.capsule(a, b, 0.95, M.vest, 0.8);
    v.capsule(b, c, 0.8, M.glove, 0.7);
  }
  return v;
}

/** Anims: ready idle with the fists forward; walk with the streamers trailing; attack = right hand drawn back then flung forward (the bolt);
 * cast = both hands raised then thrust forward; stunned slump. */
export const ANIMS = withPoses(LIBRARY.biped({ hold: HOLD, swing: 20, stride: 1.6, lift: 0.4 }), {
  walk: { trail: 1 },
  attack: [
    { spine: [-4, -16, 0], armR: [[30, -20], [60, 10]], armL: HOLD.L, trail: 0.3 },
    { trail: 0.8 },
    { trail: 0.4 },
  ],
  cast: [{ trail: 0.2 }, { trail: 0.3 }, { trail: 0.8 }],
});

/** HUD portrait framing (tools/vox/portrait.mjs): idle, face + beard in the upper part, blue backdrop glow. */
export const PORTRAIT = { pose: ANIMS.idle[0], center: [cx, cy, 27.6], scale: 1.3, fov: 24, sig: '#5cd2ff', face: [4, 11, 24, 24] };
