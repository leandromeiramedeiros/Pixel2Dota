// Voxel melee lane creep (chibi footsoldier after the Dota melee creep): round helmet with a plume, short sword in the right hand, round shield
// on the left, steel cuirass over a tabard, pauldrons, boots. Team colour lives on the plume, tabard, pauldron rims and shield face (team: true,
// tinted per instance at runtime). Grid 24 x 22 x 32, ~29 voxels tall (a hero is ~44), faces -y. Built only from the kit + the biped library.
import { Vox } from '../vox.js';
import { useMat } from '../mats.js';
import { solve } from '../rig.js';
import { bipedAnims, withPoses } from '../poses.js';
import { limb, band, hand, feet, torso, skirt, ell, cap, faceWindow, head, helmet, pauldron, eyes, mouth, weapon, shield } from '../parts.js';

export const META = { rig: 'biped', grid: [24, 22, 32], cx: 12, cy: 11 };
const cx = 12, cy = 11;
export const PROP = {
  cx, cy, hipZ: 7, hipX: 1.8, footX: 2.1, ankleY: -0.2, ankleZ: 2.2, thigh: 2.7, shin: 2.4,
  chestZ: 11.5, chestD: 3, backD: 3.2, shX: 4.1, shY: 0.2, shZ: 12.4, upper: 3.1, fore: 2.9,
  neckY: 0.2, neckZ: 14, headY: -0.4, headZ: 19.4, headTopZ: 25.2, hairZ: 18,
};
const HEAD_R = [5.4, 5, 5.1];
const BLADE_REST = [68, 25];   // sword up, forward and out when not swinging

/** Pose: a biped rig pose (rig.js) + eyes 'open' | 'shut' | 'x'. */
export function build(p = {}) {
  const v = new Vox(24, 22, 32), rig = solve('biped', PROP, p), J = rig.J, T = rig.T;
  const M = {
    skin: useMat(v, 'skin', { from: 'skinTan' }),
    steel: useMat(v, 'steel'),
    iron: useMat(v, 'iron'),
    silver: useMat(v, 'silver'),
    leather: useMat(v, 'leather'),
    trousers: useMat(v, 'trousers', { from: 'clothBlack' }),
    gold: useMat(v, 'gold'),
    team: useMat(v, 'teamCloth'),
    teamM: useMat(v, 'teamMetal'),
    lash: useMat(v, 'lash'), pupil: useMat(v, 'pupil', { from: 'eyeDot' }), shine: useMat(v, 'shine'), mouth: useMat(v, 'mouth'),
  };

  // ---- feet + legs
  for (const k of ['R', 'L']) {
    const f = J['foot' + k];
    feet(v, f, 'boot', M.leather, { hw: 1.6, front: 3.2, back: 1.6, h: 2.6, toeY: 1.8, toeZ: 1.7, tipY: 2.6, tipW: 1 });
    limb(v, [J['ankle' + k], J['knee' + k], J['hip' + k]], [1.15, 1.2, 1.35], M.trousers);
    band(v, J['ankle' + k], J['knee' + k], 0, 0.45, 1.45, M.leather);   // boot shaft
  }
  // ---- tabard skirt (team) with a leather hem, cuirass with belt + team stripe down the front
  skirt(v, T.torso, { c: [cx, cy], z0: 4.5, z1: 9, zr: 4.5, h: 4.5, r0: 4.6, dr: 1, sy: 0.85, shell: 1, scallops: 6, hem: [[5.5, null], [6.5, 0.6]] }, M.team, M.leather);
  torso(v, T.torso, { c: [cx, cy], z0: 8.4, z1: 14.2, r: 5 }, (dx, dy, z) => {
    const rx = 3.4 + Math.min(z, 3) * 0.2, ry = 2.8 + (z > 1.5 && z < 4.5 ? 0.3 : 0);
    if ((dx / rx) ** 2 + (dy / ry) ** 2 > 1) return;
    if (z < 1.2) return Math.abs(dx) < 0.6 && dy < 0 ? M.gold : M.leather;   // belt + buckle
    if (dy < 0 && Math.abs(dx) < 1 && z < 4.6) return M.team;                // tabard stripe
    return z > 4.9 ? M.iron : M.steel;                                          // gorget rim
  });
  cap(v, T.torso, [cx, cy + 0.2, 13.6], [cx, cy + 0.2, 15], 1.3, M.skin);    // neck
  // ---- arms: chain sleeve, leather bracer, fist; pauldrons over the shoulders (team rim)
  for (const k of ['R', 'L']) {
    const sh = J['shoulder' + k], el = J['elbow' + k], hd = J['hand' + k];
    limb(v, [sh, el, hd], [1.2, 1.05, 0.95], M.iron);
    band(v, el, hd, 0.3, 0.85, 1.3, M.leather);
    hand(v, hd, [1.25, 1.2, 1.25], M.skin);
    pauldron(v, sh, [2.3, 2.3, 1.8], M.steel, M.teamM, 0.5);
  }
  // ---- weapons at the hand sockets
  weapon(v, rig, 'R', 'sword', { len: 7.5, w: 1.2, aim: p.bladeR ?? BLADE_REST, mats: { blade: M.steel, edge: M.silver, guard: M.gold, grip: M.leather } });
  shield(v, rig, 'L', { r: 4, th: 1.3, aim: p.shieldL }, { face: M.team, rim: M.steel, boss: M.gold });

  // ---- head: skull, helmet shell minus the face window (brim band), team plume ridge, painted face
  const hc = J.head, win = faceWindow({ cx, yCut: hc[1] - 1.8, halfW: 4.4, top: hc[2] + 1.6, chin: hc[2] - 4.4 });
  head(v, T.head, hc, HEAD_R, M.skin);
  helmet(v, T.head, {
    c: [hc[0], hc[1] + 0.4, hc[2] + 0.5], r: [HEAD_R[0] + 0.9, HEAD_R[1] + 0.9, HEAD_R[2] + 0.8], win, brimZ: hc[2] + 1.6, brimH: 1,
    crest: { c: [cx, hc[1] + 1.2, hc[2] + 4.6], r: [1, 5.2, 2.8], from: hc[2] + 4.2, m: M.team },
  }, M.steel, M.iron);
  const ez = Math.round(hc[2] - 1.9);
  eyes(v, { at: [[9], [13]], z: ez, style: 'dot', state: p.eyes }, M);
  mouth(v, [[11, ez - 2], [12, ez - 2]], M.mouth);
  return v;
}

/** Biped library (idle, walk, attack, stunned): sword held low and forward (R), shield up and forward (L); the slash keeps the shield guard and
 * strikes lower and wider than the hero default so the blade stays inside the creep's 22-deep grid. */
export const ANIMS = (() => {
  const a = bipedAnims({ stride: 1.3, lift: 0.6, bob: 0.4, swing: 14, hold: { R: [[-62, 20], [-20, 70]], L: [[-50, 40], [-8, 85]] }, guard: [[-45, 50], [0, 88]], blade: [[75, -30], [50, 0], [-45, 60]] });
  const b = withPoses(a, { attack: [{}, { armR: [[-25, 45], [-30, 65]] }, {}] });
  return { idle: b.idle, walk: b.walk, attack: b.attack, stunned: b.stunned };
})();
