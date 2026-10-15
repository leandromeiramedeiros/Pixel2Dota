// Voxel Radiant melee lane creep, after the Dota 2 model (hand-authored chibi): a lanky treant of orange-brown grained bark under a hood of lime
// leaves with a hollow black face and two pale horns; leaf tufts on the shoulders and the left forearm, a big leafy claw for a left hand, a
// lavender belt with a glowing blue gem plaque over a maroon loincloth, root feet, and a short glowing jade sword with a gold guard in the right
// hand. Signature reads: leaf hood + black face, bark body, green sword. No team tint (Dire is a different model). Grid 30 x 30 x 34, ~30 voxels
// tall to the horn tips (a hero is ~44), faces -y. Built on the kit + the biped library.
import { Vox } from '../vox.js';
import { useMat } from '../mats.js';
import { solve, add3, mul3, norm3 } from '../rig.js';
import { bipedAnims, withPoses } from '../poses.js';
import { limb, hand, torso, skirt, ell, cap, obox, weapon } from '../parts.js';

export const META = { rig: 'biped', grid: [30, 30, 34], cx: 15, cy: 16 };
const cx = 15, cy = 16;
export const PROP = {
  cx, cy, hipZ: 7.6, hipX: 1.9, footX: 2.5, ankleY: 0, ankleZ: 1.8, thigh: 3.2, shin: 2.8,
  chestZ: 12.6, chestD: 3, backD: 3, shX: 4.7, shY: 0.4, shZ: 14, upper: 4, fore: 3.9,
  neckY: 0.4, neckZ: 15.8, headY: -0.4, headZ: 20.6, headTopZ: 26, hairZ: 19,
};
const HOOD_R = [5.6, 5.3, 5.8];
const SWORD_REST = [-12, 45];   // jade sword forward and out, a little down (the reference stance)

/** The treant stoops slightly in every frame (composed onto the pose's spine / head). */
const stoop = p => ({ spine: [(p.spine?.[0] ?? 0) + 8, p.spine?.[1] ?? 0, p.spine?.[2] ?? 0], head: [(p.head?.[0] ?? 0) - 6, p.head?.[1] ?? 0, p.head?.[2] ?? 0] });
/** Pose: a biped rig pose (rig.js) + bladeR (sword aim). */
export function build(p = {}) {
  const v = new Vox(30, 30, 34), rig = solve('biped', PROP, { ...p, ...stoop(p) }), J = rig.J, T = rig.T;
  const M = {
    bark: useMat(v, 'bark', { ramp: ['#4a1c1e', '#9a5226', '#cc7c36', '#f0ac58'] }),
    barkD: useMat(v, 'barkD', { ramp: ['#30121a', '#6a321e', '#94562a', '#bc7c40'] }),
    leaf: useMat(v, 'leaf', { ramp: ['#1e4a2a', '#5aa82a', '#9ad834', '#e0ff7a'] }),
    leafD: useMat(v, 'leafD', { ramp: ['#16362a', '#3a7a26', '#6aac2c', '#b0e05a'] }),
    horn: useMat(v, 'horn', { from: 'bone' }),
    belt: useMat(v, 'belt', { ramp: ['#2e2a52', '#6a6a9e', '#9c9ccc', '#d4d6f0'] }),
    cloth: useMat(v, 'loin', { ramp: ['#2a0c1e', '#5e1a24', '#842a30', '#a8463e'] }),
    gold: useMat(v, 'gold'),
    grip: useMat(v, 'grip', { from: 'leather' }),
    gem: useMat(v, 'gem', { emit: '#4ab8ff', tier: 'signature' }),
    jade: useMat(v, 'jade', { emit: '#58d040', tier: 'signature' }),
    jadeL: useMat(v, 'jadeL', { emit: '#b4ff7a', tier: 'signature' }),
    void: useMat(v, 'eyeVoid', { emit: '#0c0812', tier: 'eye' }),
  };
  // bark with wavy vertical grain; leaves in offset shingle rows
  const bark = (px, py, pz) => ((Math.floor(px * 0.9 + py * 0.4 + Math.sin(pz * 0.9) * 1.1) % 3 + 3) % 3 === 0 ? M.barkD : M.bark);
  const leaf = (px, py, pz) => { const r = Math.floor(pz / 2); return (Math.floor(pz) % 2 === 0 && (Math.floor(px + py * 0.5) + r) % 4 === 0) ? M.leafD : M.leaf; };

  // ---- root feet + legs (bark): three splayed toes forward, a heel root back
  for (const k of ['R', 'L']) {
    const f = J['foot' + k], s = k === 'R' ? -1 : 1, base = [f[0], f[1], f[2] + 1.1];
    for (const [ox, oy] of [[-1.3, -2.6], [0.2, -3], [1.6, -2.3], [0.3, 1.6]]) v.capsule(base, [f[0] + ox * 1.1 + s * 0.3, f[1] + oy, f[2] + 0.7], 1.1, bark, 0.7);
    limb(v, [J['ankle' + k], J['knee' + k], J['hip' + k]], [1.25, 1.35, 1.5], bark);
  }
  // ---- maroon loincloth, lavender belt, gem plaque hanging in front
  skirt(v, T.torso, { c: [cx, cy], z0: 3.8, z1: 8.2, zr: 3.8, h: 4.2, r0: 3.9, dr: 0.6, sy: 0.9, shell: 1, scallops: 1, hem: [] }, M.cloth, M.cloth);
  torso(v, T.torso, { c: [cx, cy], z0: 7.6, z1: 15.2, r: 6.5 }, (dx, dy, z, px, py, pz) => {
    const rx = 3.1 + Math.max(0, z - 2) * 0.32, ry = 2.6 + Math.max(0, z - 3) * 0.12;
    if ((dx / rx) ** 2 + ((dy + (z > 4 ? 0.3 : 0)) / ry) ** 2 > 1) return;
    if (z < 1.6) return M.belt;
    return bark(px, py, pz);
  });
  const plate = (px, py, pz) => (Math.abs(px - cx) < 0.9 && pz > 5.2 && pz < 8 ? M.gem : M.belt);
  ell(v, T.torso, [cx, cy - 3.2, 6.9], [1.8, 0.9, 2.9], plate);
  ell(v, T.torso, [cx, cy + 0.6, 15.8], [5, 3.6, 1.8], leaf);   // leaf mantle over the collar (the hood sits on it)

  // ---- arms: long bark limbs, thick forearms; right fist, left leafy claw
  for (const k of ['R', 'L']) {
    const sh = J['shoulder' + k], el = J['elbow' + k], hd = J['hand' + k];
    limb(v, [sh, el, hd], [1.5, 1.3, 1.45], bark);
  }
  hand(v, J.handR, [1.4, 1.4, 1.4], bark);
  {   // left: leaf-wrapped forearm, a big leaf hand with four claw fingers hanging down-forward
    const el = J.elbowL, hd = J.handL, d = norm3([hd[0] - el[0], hd[1] - el[1], hd[2] - el[2]]);
    for (let i = 0; i < 4; i++) {
      const b = add3(el, mul3(d, 1 + i * 0.8)), out = [1.6 + (i % 2) * 0.5, -0.4 + i * 0.3, 1.4 - i * 0.5];
      v.capsule(b, add3(b, out), 0.9, leaf, 0.35);
    }
    v.ellipsoid(hd[0], hd[1], hd[2] - 0.3, 2, 2, 1.8, leaf);
    for (const [ox, oy] of [[-1.4, -1.2], [-0.4, -1.8], [0.8, -1.6], [1.6, -0.6]]) {
      const b = [hd[0] + ox, hd[1] + oy * 0.6, hd[2] - 1];
      v.capsule(b, [b[0] + ox * 0.5, b[1] + oy * 0.9, b[2] - 2.8], 0.85, M.leaf, 0.4);
    }
  }
  // ---- shoulder leaf tufts: spiky leaves fanning out and up
  for (const s of [-1, 1]) {
    const sh = J[s < 0 ? 'shoulderR' : 'shoulderL'];
    ell(v, null, [sh[0], sh[1], sh[2] + 0.6], [2.4, 2.4, 1.8], leaf);
    for (const [ox, oy, oz] of [[3.4, -0.8, 2.6], [2.6, 1.4, 3.6], [3.8, 0.6, 0.8], [1.4, -1.6, 3.8], [1, 1.8, 4]])
      v.capsule([sh[0], sh[1], sh[2] + 0.8], [sh[0] + s * ox, sh[1] + oy, sh[2] + 0.8 + oz], 1.2, leaf, 0.4);
  }
  // ---- jade sword (right hand): glowing crystal blade, gold guard
  weapon(v, rig, 'R', 'sword', { len: 6.5, w: 1.25, aim: p.bladeR ?? SWORD_REST, mats: { blade: M.jade, edge: M.jadeL, guard: M.gold, grip: M.grip } });

  // ---- head: hood of leaves, a pointed peak and a hollow black face (recessed pointed arch), pale horns
  const Th = T.head, [hx, hy, hz] = [cx, cy + PROP.headY, PROP.headZ];   // rest space (posed by Th)
  const arch = (px, pz) => { const u = pz - (hz - 4.8); if (u < 0 || u > 8.2) return false; return Math.abs(px - hx) < 3.4 * Math.sqrt(1 - u / 8.4) + 0.3; };
  ell(v, Th, [hx, hy + 0.4, hz + 0.4], HOOD_R, (px, py, pz) => {
    if (arch(px, pz) && py < hy + 0.6) { if (py < hy - 2.6) return; return M.void; }   // carved recess, void-lined
    return leaf(px, py, pz);
  });
  ell(v, Th, [hx, hy + 1.4, hz + 0.2], [4.6, 4.2, 4.6], M.void, (px, py, pz) => arch(px, pz) && py < hy);   // back wall of the face hollow
  // hood peak: leaf point up and slightly forward; jagged leaf fringe over the cheeks and nape
  cap(v, Th, [hx, hy - 0.2, hz + 4.2], [hx, hy - 1.6, hz + 8.2], 2.2, leaf, 0.4);
  for (const s of [-1, 1]) {
    cap(v, Th, [hx + s * 3.6, hy - 1.4, hz - 2.6], [hx + s * 5.6, hy - 2.4, hz - 5], 1.3, leaf, 0.4);
    cap(v, Th, [hx + s * 4.2, hy + 1.8, hz - 2], [hx + s * 6, hy + 3, hz - 4.6], 1.3, leaf, 0.4);
    cap(v, Th, [hx + s * 4.4, hy + 0.4, hz + 2.4], [hx + s * 6.6, hy + 0.6, hz + 3.4], 1.2, leaf, 0.4);
    // horns: pale bone, out from the hood top, curling up
    cap(v, Th, [hx + s * 2.8, hy + 0.6, hz + 4.4], [hx + s * 4.2, hy + 0.8, hz + 6.6], 1.2, M.horn, 0.9);
    cap(v, Th, [hx + s * 4.2, hy + 0.8, hz + 6.6], [hx + s * 4.4, hy + 1.2, hz + 8.4], 0.9, M.horn, 0.45);
  }
  cap(v, Th, [hx, hy + 3.8, hz - 1], [hx, hy + 5.4, hz - 4.6], 1.6, leaf, 0.5);
  return v;
}

/** Biped library: sword forward and out (R), leafy claw hanging long (L); the strike is a low forward thrust that stays in the grid. */
export const ANIMS = (() => {
  const a = bipedAnims({ stride: 1.4, lift: 0.4, bob: 0.4, swing: 14, hold: { R: [[-62, 22], [-28, 62]], L: [[-74, 14], [-80, 40]] }, blade: [[55, -20], [-12, 58], [-25, 45]] });
  const b = withPoses(a, {
    walk: p => ({ armR: [[-62, 22 + (p.armR[0][1] - 22) * 0.4], [-28, 62]] }),
    attack: [{}, { armR: [[-22, 50], [-18, 68]] }, {}],
    stunned: [{ bladeR: [-55, 30] }, { bladeR: [-55, 30] }],
  });
  return { idle: b.idle, walk: b.walk, attack: b.attack, stunned: b.stunned };
})();
