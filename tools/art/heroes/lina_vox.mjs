// Voxel Lina (chibi, after the v3 chibi pilot docs/shots/v3-lina-sheet.png): big round head with large amber eyes, long straight red-orange
// hair with a fringe and a flame tuft on top, small crimson dress with gold V trim + flame emblem, gold hem, short legs, brown boots, one hand
// raised holding a flame. Built from primitives with tools/art/vox.mjs; the model faces -y. Grid 34 x 30 x 48, ~44 voxels tall.
// How it is made: docs/VOXEL-CHIBI.md. Renders: lina_vox_shot.mjs, lina_vox_terrains.mjs, lina_vox_poses.mjs, lina_vox_portrait.mjs.
import { Vox } from '../vox.mjs';

/**
 * Pose p (all optional): { flick 0..3 flame flicker phase, sway 0..1 hair tip phase, legs [dyR, dyL] foot swing (+ = back),
 *   arm 'raise' | 'back' | 'thrust' | 'cast' | 'down', flameK hand flame size (0 = none), eyes 'open' | 'shut' | 'x', crownK crown height }
 */
export function buildLina(p = {}) {
  const flick = p.flick || 0, sway = p.sway || 0, legs = p.legs || [0, 0], armPose = p.arm || 'raise', flameK = p.flameK ?? 1, crownK = p.crownK ?? 1;
  const fj = k => 1 + 0.12 * Math.sin((flick + k * 1.7) * Math.PI / 2);   // per-tongue flicker scale
  const v = new Vox(34, 30, 48);
  const cx = 17, cy = 15;
  const M = {
    skin: v.mat('skin', { ramp: ['#c4706a', '#eea88c', '#ffd6b8', '#fff2e0'], noShadow: true }),
    hair: v.mat('hair', { ramp: ['#7c1a24', '#c8381e', '#f06a22', '#ffa244'] }),
    hairD: v.mat('hairD', { ramp: ['#641428', '#a82a1e', '#d8521e', '#f68a38'] }),
    dress: v.mat('dress', { ramp: ['#4a1032', '#8c1a2c', '#c8303a', '#ee5a4a'] }),
    sleeve: v.mat('sleeve', { ramp: ['#8a2a16', '#d0561e', '#f2902e', '#ffc060'] }),
    gold: v.mat('gold', { ramp: ['#7a4416', '#c8861e', '#f2c444', '#fff2a8'] }),
    boot: v.mat('boot', { ramp: ['#2c1218', '#56261e', '#86442e', '#b06a44'] }),
    lash: v.mat('lash', { emit: '#2a0e1e' }),
    irisD: v.mat('irisD', { emit: '#b8401a' }),
    iris: v.mat('iris', { emit: '#f07a1e' }),
    irisL: v.mat('irisL', { emit: '#ffc040' }),
    pupil: v.mat('pupil', { emit: '#5a1414' }),
    shine: v.mat('shine', { emit: '#ffffff' }),
    blush: v.mat('blush', { ramp: ['#c86060', '#f08a7a', '#ffaa98', '#ffc4b0'] }),
    mouth: v.mat('mouth', { emit: '#a83444' }),
    f1: v.mat('f1', { emit: '#e2441a' }), f2: v.mat('f2', { emit: '#ff7a22' }), f3: v.mat('f3', { emit: '#ffb83c' }), f4: v.mat('f4', { emit: '#fff1a6' }),
  };
  const flame = f => (f < 0.3 ? M.f1 : f < 0.55 ? M.f2 : f < 0.8 ? M.f3 : M.f4);

  // ---- boots + legs
  for (const s of [-1, 1]) {
    const fx = cx + s * 3, ly = legs[s < 0 ? 0 : 1];
    const by = cy + ly, bz = Math.abs(ly) * 0.35;
    v.each(fx - 2, by - 4, bz, fx + 2, by + 2, bz + 3, (px, py, pz) => {
      const qz = pz - bz;
      if (px < fx - 2 || px > fx + 2 || py < by - 4 || py > by + 2 || qz < 0 || qz > 3.6) return;
      if (py < by - 2.5 && qz > 2.4) return;                 // rounded toe
      if (py < by - 3.2 && Math.abs(px - fx) > 1.4) return;
      return M.boot;
    });
    v.capsule([fx, by - 0.3, bz + 3.5], [fx - s * 0.4, cy, 8], 1.45, M.skin);
    v.capsule([fx, by - 0.5, bz + 3.6], [fx, by - 0.5, bz + 4.2], 2.05, M.gold);   // boot cuff
  }

  // ---- skirt (flared cone), gold hem with flame scallops
  v.each(cx - 8, cy - 8, 5, cx + 8, cy + 8, 12.9, (px, py, pz) => {
    const t = (pz - 5.5) / 7, r = 7 - 2.9 * t, dx = px - cx, dy = (py - cy) / 0.88;
    const d = Math.hypot(dx, dy); if (d > r) return;
    const shell = d > r - 1.2, ang = Math.atan2(dy, dx);
    if (pz < 6.5) return shell ? M.gold : M.dress;
    if (pz < 7.5 && shell && Math.cos(ang * 9) > 0.35) return M.gold;
    if (pz < 8.5 && shell && Math.cos(ang * 9) > 0.85) return M.gold;
    return M.dress;
  });
  // ---- torso
  v.each(cx - 6, cy - 6, 12, cx + 6, cy + 6, 19.5, (px, py, pz) => {
    const z = pz - 12, rx = 3.5 + (z > 3.5 ? (z - 3.5) * 0.3 : 0), ry = z > 2 && z < 5.8 ? 3.1 : 2.7;
    const dx = px - cx, dy = py - cy + (z > 2.5 && z < 5.5 ? 0.25 : 0);
    if ((dx / rx) ** 2 + (dy / ry) ** 2 > 1) return;
    if (pz < 13) return M.gold;   // belt
    const front = dy < 0 && (dx / rx) ** 2 + ((dy - 0.9) / ry) ** 2 > 1;
    if (front && Math.abs(Math.abs(dx) - (z - 0.8) * 0.75) < 0.55 && z < 6.8) return M.gold;   // V trim
    return M.dress;
  });
  // flame emblem on the chest
  for (const [x, z, m] of [[16, 14, M.f2], [17, 14, M.f2], [16, 15, M.f3], [17, 15, M.f3], [17, 16, M.f4]]) v.paintFront(x, z, m);
  // puffy sleeves + neck
  for (const s of [-1, 1]) v.ellipsoid(cx + s * 4.3, cy, 17.6, 2.3, 2.1, 1.9, M.sleeve);
  v.capsule([cx, cy + 0.3, 19], [cx, cy + 0.3, 21], 1.5, M.skin);

  // ---- arms: left (our left, -x) on the hip, right raised holding a flame
  const arm = (sh, el, hd) => {
    v.capsule(sh, el, 1.25, M.skin, 1.15); v.capsule(el, hd, 1.15, M.skin, 1.05);
    const p = t => el.map((e, k) => e + (hd[k] - e) * t);
    v.capsule(p(0.35), p(0.72), 1.65, M.gold);
    v.ellipsoid(hd[0], hd[1], hd[2], 1.5, 1.4, 1.5, M.skin);
  };
  const ARMS = {
    raise: [[cx + 8.6, cy - 1.6, 15.6], [cx + 11, cy - 3, 20]],
    back: [[cx + 8.4, cy + 1.6, 15], [cx + 10, cy + 3.5, 19.5]],
    thrust: [[cx + 7.6, cy - 4, 16.4], [cx + 9, cy - 8.5, 17.5]],
    cast: [[cx + 8.2, cy - 1, 19.5], [cx + 7.5, cy - 2.5, 25]],
    down: [[cx + 7.4, cy + 0.6, 13.6], [cx + 5.2, cy - 0.4, 12.2]],
  };
  const [elR, hdR] = ARMS[armPose];
  if (armPose === 'cast') arm([cx - 4.6, cy, 16.8], [cx - 8.2, cy - 1, 19.5], [cx - 7.5, cy - 2.5, 25]);
  else arm([cx - 4.6, cy, 16.6], [cx - 7.4, cy + 0.6, 13.6], [cx - 5.2, cy - 0.4, 12.2]);
  arm([cx + 4.6, cy, 16.8], elR, hdR);
  // hand flame (cast: one big flame between both raised hands)
  const hx = armPose === 'cast' ? cx : hdR[0], hy = hdR[1], hz = hdR[2] + 1.2;
  if (flameK > 0) for (const [ox, oy, h0, w0, k] of [[0, 0, 7.5, 2.1, 0], [-1.1, 0.4, 5, 1.3, 1], [1.2, -0.2, 4.4, 1.2, 2]]) {
    const h = h0 * flameK * fj(k), w = w0 * Math.sqrt(flameK);
    v.each(hx - 3 * flameK, hy - 3 * flameK, hz, hx + 3 * flameK, hy + 3 * flameK, hz + h, (px, py, pz) => {
      const f = (pz - hz) / h; if (f < 0 || f > 1) return;
      const r = w * Math.pow(1 - f, 0.75) + 0.35, sx = hx + ox + Math.sin(f * 3.2) * 0.6 * f;
      if (Math.hypot(px - sx, py - hy - oy) > r) return;
      return flame(Math.min(1, f + (Math.hypot(px - sx, py - hy - oy) < r * 0.45 ? 0.3 : 0)));
    });
  }

  // ---- head: skin ellipsoid, hair shell everywhere except the face window, fringe with strands
  const hcx = cx, hcy = cy - 0.3, hcz = 28;
  const bang = [27.2, 28.6, 29.8, 28.8, 30.2, 29.2, 30.1, 29.6, 30.3, 29, 30, 28.6, 27.4];   // fringe bottom per column, dx -6..6
  const fringe = px => { const k = Math.round(px - cx - 0.5) + 6; return k < 0 || k > 12 ? 0 : bang[k]; };
  const faceWin = (px, py, pz) => py < hcy - 1.6 && Math.abs(px - cx) < 6.6 && pz < fringe(px);
  const strand = (px, pz = 0) => (pz < 31 && (Math.floor(px) % 3) === 0 ? M.hairD : M.hair);
  v.ellipsoid(hcx, hcy + 0.5, hcz + 0.6, 9.1, 8.3, 8.7, (px, py, pz) => strand(px, pz), (px, py, pz) => !faceWin(px, py, pz));
  v.ellipsoid(hcx, hcy, hcz, 8.1, 7.3, 7.7, M.skin, (px, py, pz) => faceWin(px, py, pz));
  // long side curtains, falling in front of the shoulders, pointed tips
  for (const s of [-1, 1]) {
    v.each(cx - 10, cy - 6, 12, cx + 10, cy + 7, 31, (px, py, pz) => {
      const ax = (px - cx) * s; if (ax < 6.4) return;
      const outer = 8.9 + (30 - pz) * 0.02; if (ax > outer) return;
      if (py < cy - 3.8 + (30 - pz) * 0.08 || py > cy + 6) return;
      const tip = 13.5 + ((Math.floor(py) * 5 + (s > 0 ? 2 : 0) + sway) % 3) * 1.3 + (ax - 6.3) * 0.5;
      if (pz < tip) return;
      return strand(px + py, pz);
    });
  }
  // back mass to the waist with a jagged hem
  v.each(cx - 10, cy + 1, 11, cx + 10, cy + 9, 31, (px, py, pz) => {
    const ax = Math.abs(px - cx), w = 9.2 - Math.max(0, 20 - pz) * 0.12;
    if (ax > w) return;
    const back = cy + 8.4 - Math.max(0, 22 - pz) * 0.12 - (ax / w) ** 2 * 2.2; if (py > back) return;
    const tip = 11.6 + Math.abs(((px - cx) * 0.9 + sway) % 3 - 1.5) * 1.6 + ax * 0.12; if (pz < tip) return;
    return strand(px);
  });
  // flame tuft / crown on top (glowing)
  [[-4, 0.5, 5.5, 1.7, -0.25], [-1.6, -0.6, 8.5, 2.1, -0.1], [1.4, 0.2, 7, 1.9, 0.12], [3.9, 1, 5, 1.6, 0.28], [0, 2.8, 5.5, 2, 0]].forEach(([ox, oy, h0, w, lean], k) => {
    const bz = 34.6, h = h0 * crownK * fj(k + 3);
    v.each(cx - 7, cy - 5, bz, cx + 7, cy + 9, bz + h, (px, py, pz) => {
      const f = (pz - bz) / h; if (f < 0 || f > 1) return;
      const r = w * Math.pow(1 - f, 0.8) + 0.3, sx = cx + ox + lean * (pz - bz), sy = cy + oy + 0.22 * (pz - bz);
      const dd = Math.hypot(px - sx, py - sy); if (dd > r) return;
      return flame(Math.min(1, f * 0.9 + 0.12 + (dd < r * 0.5 ? 0.18 : 0)));
    });
  });

  // ---- face details painted on the front-most voxels
  // eyes: 3 wide x 4 tall, lash row on top with an outer wing
  const eye = (x0, wingX) => {
    if (p.eyes === 'shut' || p.eyes === 'x') {   // closed: lash arc; x: crossed
      const pts = p.eyes === 'x' ? [[0, 26], [2, 26], [1, 25], [0, 24], [2, 24]] : [[0, 25], [1, 24], [2, 25]];
      for (const [dx, z] of pts) v.paintFront(x0 + dx, z, M.lash);
      for (const z of [23, 24, 25, 26, 27]) for (let k = 0; k < 3; k++) if (!pts.some(([dx, zz]) => dx === k && zz === z)) v.paintFront(x0 + k, z, M.skin);
      return;
    }
    const rows = { 27: [M.lash, M.lash, M.lash], 26: [M.shine, M.irisD, M.irisD], 25: [M.irisD, M.pupil, M.iris], 24: [M.iris, M.pupil, M.iris], 23: [M.irisL, M.irisL, M.irisL] };
    for (const [z, row] of Object.entries(rows)) row.forEach((m, k) => v.paintFront(x0 + k, +z, m));
    v.paintFront(wingX, 27, M.lash); v.paintFront(wingX, 26, M.lash);
  };
  eye(12, 11); eye(19, 22);
  for (const x of [11, 12]) v.paintFront(x, 22, M.blush);
  for (const x of [21, 22]) v.paintFront(x, 22, M.blush);
  v.paintFront(17, 21, M.mouth); v.paintFront(16, 21, M.mouth);
  return v;
}

/** Pose library, one pose per frame (fields: see buildLina). Rendered by lina_vox_poses.mjs. */
export const ANIMS = {
  idle: [0, 1, 2, 3].map(i => ({ flick: i, sway: [0, 1, 1, 0][i] })),
  walk: [0, 1, 2, 3].map(i => ({ flick: i, sway: i % 3, legs: [[1.5, -1.5], [0, 0], [-1.5, 1.5], [0, 0]][i], flameK: 0.9 })),
  attack: [{ arm: 'back', flameK: 0.8 }, { arm: 'thrust', flameK: 1.5, flick: 1 }, { arm: 'raise', flameK: 1, flick: 2 }],
  cast: [{ arm: 'raise', flameK: 1.1 }, { arm: 'cast', flameK: 1.6, crownK: 1.15, flick: 1 }, { arm: 'cast', flameK: 1.9, crownK: 1.25, flick: 2 }],
  stunned: [0, 1].map(i => ({ arm: 'down', flameK: 0, crownK: 0.7, eyes: 'x', sway: i, flick: i * 2 })),
};
