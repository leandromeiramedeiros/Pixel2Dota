// Lina the Slayer (8-direction, 2x pixel density, 3D-rendered paper doll): tall slim fire mage, ~5 heads high, planted stance,
// flame-hair swept up and back, red/orange bodice with gold trim, split flame-hem skirt, bare arms, dark red boots.
// Layout: materials -> geometry g -> model(J, ctx) -> pose tweaks -> buildSheet8.
// Procedural only: every shape below is an SDF primitive; nothing is traced from any external art.
import { Pal, buildSheet8, writeSheet, headUV } from './rig.mjs';
import { ellipsoid, sphere, cone, custom, add3, sub3, mul3, norm3, rotY, ik2 } from '../lib3d.mjs';

const PL = new Pal();
const skin = PL.mat('#ffe8d2', '#fbc8a4', '#dc9074', '#9a5654');
const hairR = PL.mat('#ff9040', '#ee5420', '#bc2c1c', '#701a1c'), hairM = PL.mat('#ffb850', '#ff8030', '#e04a1c', '#982a1a'), hairT = PL.mat('#fff0a0', '#ffcc58', '#ff9430', '#c8501c');
const dress = PL.mat('#ff8858', '#e63c2c', '#a21e30', '#5c1228'), dressO = PL.mat('#ffc460', '#ff8c30', '#e0521c', '#8a2a1c'), dressD = PL.mat('#c8483c', '#8c2630', '#561828', '#32101f');
const trim = PL.mat('#fff0a8', '#ffc040', '#c27a1c', '#6a4016');
const boots = PL.mat('#b04a3c', '#7e2a2e', '#501a26', '#2e1020');
const fA = PL.c('#fff4b0', 1), fB = PL.c('#ffb038', 0.85), fC = PL.c('#f0501a', 0.6);
const browM = PL.flat('#8a2418');
const flameM = { ramp: [fA, fB, fC, fC], unlit: true, noOutline: true }, coreM = { ramp: [fA, fA, fB, fB], unlit: true, noOutline: true };
const starM = { ramp: ['Y', 'Y', 'Z', 'Z'], unlit: true, noOutline: true };
const eyeI = PL.flat('#f07a14'), E = PL.flat('#3a1020'), lip = PL.flat('#c8505a');

// tall slim proportions (model units = sprite px, feet at y = 0): head ~10.8 tall -> ~4.9 heads to the crown of the skull
const g = { hipY: 25, legX: 4.0, thigh: 12, shin: 12, ankleY: 2.1, torsoY: 33, shX: 4.7, shY: 38.4, upper: 6.6, fore: 6.4, handOut: 3.0, armDrop: 12.3, handZ: 1.6, headY: 46.6, headZ: 0.5 };
const HR = [4.5, 5.4, 4.7];   // head radii
const HIP_X = 2.9, SK = { yTop: 30.4, yHem: 19.0, rTop: 4.2, rHem: 9.2, zk: 0.82, n: 9 };

const tri = f => { f -= Math.floor(f); return 1 - Math.abs(2 * f - 1); };

// ---------- skirt: flared lathe, flame-tongue hem (front hem rides high, back hangs low), open front slit ----------
function skirt(cx, dy, k, sw) {
  const { yTop, yHem, rTop, rHem, zk, n } = SK;
  const ang = (x, z) => Math.atan2(z / zk, x), fr = th => th * n / (2 * Math.PI);
  const hemY = th => {
    const f = fr(th), idx = Math.floor(f), s = Math.sin(th);
    const depth = 5.2 * (0.78 + 0.22 * Math.sin(idx * 2.7 + 1)), base = yHem + dy + 2.6 * Math.max(0, s) - 2.0 * Math.max(0, -s);
    return base - depth * Math.pow(tri(f), 1.45) + 0.5 * Math.sin(k * 1.7 + idx * 2.1) * sw;
  };
  const slit = y => 0.9 + Math.max(0, yTop + dy - 1.5 - y) * 0.2;
  const sd = (x0, y, z) => {
    const x = x0 - cx, th = ang(x, z), rho = Math.hypot(x, z / zk), u = Math.min(1, Math.max(0, (yTop + dy - y) / (yTop - yHem)));
    const r = (rTop + (rHem - rTop) * Math.pow(u, 0.8)) * (1 + 0.05 * Math.sin(th * n + 0.6));
    const body = Math.max((rho - r) * 0.85, (hemY(th) - y) * 0.8, y - (yTop + dy));
    const cut = Math.min((slit(y) - Math.abs(x)) * 0.8, z + 1.6);          // front wedge, open down to a back wall at z = -1.6
    return Math.max(body, Math.min(cut, 3));
  };
  const alt = (x0, y, z) => {
    const x = x0 - cx, th = ang(x, z), v = y - hemY(th);
    if (y > yTop + dy - 1.7) return trim;                                  // gold belt
    if (z < -1.2 && Math.abs(x) < slit(y) + 0.5 && z < 0.5) return dressD; // inner back wall seen through the slit
    if (v < 0.9) return trim;                                              // gold ember tip
    { const fq = fr(th) - Math.floor(fr(th)); if (v > 4.5 && (fq < 0.05 || fq > 0.95) && z < 1.5) return dressD; }   // panel seams
    if (v < 4.2 - 0.3 * Math.sin(th * 3)) return dressO;                   // orange flame tongues
    return undefined;
  };
  return custom(sd, [cx, 23 + dy, 0], 15, { mat: dress, alt, grp: 2 });
}

// ---------- hair: a flame spike = tapered chain, hot-yellow tips, red-orange roots ----------
function spike(root, d1, d2, L, rad, o, jit = [0, 0, 0]) {
  const a = norm3(d1), b = norm3(d2), P = [root];
  P.push(add3(P[0], mul3(a, L * 0.38)));
  P.push(add3(P[1], mul3(norm3([a[0] * 0.5 + b[0] * 0.5, a[1] * 0.5 + b[1] * 0.5, a[2] * 0.5 + b[2] * 0.5]), L * 0.34)));
  P.push(add3(add3(P[2], mul3(b, L * 0.3)), jit));
  const r = [rad, rad * 0.8, rad * 0.52, 0.15], mats = [hairR, hairM, hairT], out = [];
  for (let i = 0; i < 3; i++) out.push(cone(P[i], P[i + 1], r[i], r[i + 1], { ...o, mat: mats[i] }));
  return out;
}

function eyes(P, cx, cy, cz) {
  // tiny face texture in arc coordinates (U across, V up) so it foreshortens with yaw
  return (x, y, z) => {
    const q = headUV(x - cx, y - cy, z - cz, HR);
    if (q.w < 0.3) return undefined;
    const { U, V } = q, x0 = P.p.eyes === 'x';
    for (const sd of [-1, 1]) {
      const dU = U - sd * 2.15, dV = V + 0.5, e2 = (dU / 1.05) ** 2 + (dV / 1.55) ** 2;
      if (e2 < 1) { if (x0) return Math.abs(Math.abs(dU / 1.05) - Math.abs(dV / 1.55)) < 0.5 ? E : undefined; return dV > 0.3 ? E : eyeI; }
      if (!x0 && Math.abs(dU) < 1.5 && Math.abs(dV - 2.1 - 0.25 * dU * sd) < 0.5) return browM;
    }
    if (Math.abs(U) < 0.9 && Math.abs(V + 3.0 - 0.1 * U * U) < 0.55) return x0 ? E : lip;                  // mouth
    return undefined;
  };
}

function flameChain(base, dir, len, r0, k, mat = flameM, o = {}) {
  const out = [], n = 4; let prev = base;
  for (let i = 1; i <= n; i++) {
    const t = i / n, w = Math.sin(k * 1.9 + i * 1.3) * 1.1 * t * (len / 12);
    const q = [base[0] + dir[0] * len * t + w, base[1] + dir[1] * len * t, base[2] + dir[2] * len * t + w * 0.4];
    out.push(cone(prev, q, r0 * (1 - (i - 1) / n * 0.85) + 0.2, r0 * (1 - i / n * 0.9) + 0.15, { mat, grp: 50, ...o }));
    prev = q;
  }
  return out;
}

function model(J, ctx) {
  const { p } = J, g = J.g, dy = J.dy, sw = p.sway || 0, k = p.t || 0, tx = p.tx || 0, prims = [];
  const walk = p.anim === 'walk', idleish = !walk;
  const st = p.stance ?? (idleish ? 1 : 0);                      // contrapposto weight on the left leg (screen right from the front)
  const ph = k * 1.3;

  // ---- joints (re-solved here so the hips can be narrower than the planted feet) ----
  const legs = [];
  for (const [S, sd, i] of [[J.R, -1, 0], [J.L, 1, 1]]) {
    const free = sd < 0, spread = g.legX + (walk ? -0.7 : 0);
    const hip = [sd * HIP_X + tx * 0.5 + st * 0.7, g.hipY + dy + st * (free ? -0.5 : 0.4), 0];
    const ank = [sd * spread + tx * 0.2 + st * (free ? -0.9 : 0.1), g.ankleY + (p.fl?.[i] || 0), (p.fz?.[i] || 0) + st * (free ? 2.4 : -1.2)];
    const leg = ik2(hip, ank, g.thigh, g.shin, [sd * 0.1, 0.1, 1]);
    legs.push({ sd, hip, knee: leg.mid, ank: leg.end, toeLift: p.tl?.[i] || 0 });
    void S;
  }
  const pelX = tx + st * 0.8, chX = tx - st * 0.5;
  // ---- hair behind everything: long flame tails streaming back (thin, never a curtain) ----
  const H = J.head;
  const hairBase = [H[0], H[1], H[2]];
  const flick = (i) => [Math.sin(ph + i * 1.7) * (0.8 + sw * 0.7), Math.sin(ph * 1.3 + i) * 0.6, Math.cos(ph + i * 1.1) * 0.6];
  const SP = [   // [azimuth from front (deg, 180 = straight back), elevation, length, base radius, outward fan, back sweep]
    [180, 48, 14, 2.2, 0.0, 1.0], [152, 52, 13, 2.0, 0.7, 0.8], [-152, 52, 12, 2.0, 0.7, 0.8], [120, 56, 12, 1.9, 1.0, 0.6], [-120, 56, 11, 1.9, 1.0, 0.6],
    [86, 60, 10, 1.7, 1.3, 0.4], [-86, 60, 9.5, 1.7, 1.3, 0.4], [44, 66, 8, 1.5, 1.3, 0.3], [-44, 66, 7.5, 1.5, 1.3, 0.3],
    [132, 22, 12, 1.6, 1.1, 1.1], [-132, 22, 11, 1.6, 1.1, 1.1],
  ];
  const spikes = [];
  SP.forEach(([az, el, L, rad, out, back], i) => {
    const a = az * Math.PI / 180, e = el * Math.PI / 180, sA = Math.sin(a), cA = Math.cos(a), cE = Math.cos(e), sE = Math.sin(e);
    const root = [H[0] + 4.0 * sA * cE, H[1] + 0.8 + 5.0 * sE, H[2] - 1.0 + 4.3 * cA * cE];
    const sgn = sA >= 0 ? 1 : -1, ow = Math.abs(sA) < 0.01 ? 0 : sgn;
    const d1 = [out * 0.55 * ow * Math.abs(sA) ** 0.5, 0.5 + 0.7 * sE, -0.12 - back * 0.2];
    const d2 = [out * 0.9 * ow * Math.abs(sA) ** 0.5 + (i % 2 ? 0.35 : -0.35), 0.55 + 0.25 * sE, -back];
    spikes.push({ az, i, parts: spike(root, d1, d2, L, rad, { grp: 10 + i, bias: (i % 3) - 1 }, flick(i)) });
  });

  // ---- legs & boots ----
  for (const l of legs) {
    prims.push(cone(l.hip, l.knee, 2.7, 2.1, { mat: skin, grp: 20 }), cone(l.knee, l.ank, 2.1, 1.55, { mat: skin, grp: 20 }));
    const a = l.ank, dirK = norm3(sub3(l.knee, a)), top = add3(a, mul3(dirK, 8.2));
    const ty = Math.max(1.5, a[1] - 0.6 + l.toeLift * 0.4), toe = add3([a[0] + l.sd * 0.9, ty + (l.toeLift > 0 ? l.toeLift * 0.6 : 0), a[2] + 5.3], [0, 0, 0]);
    prims.push(cone(add3(a, [0, 0.4, -0.3]), top, 2.0, 2.3, { mat: boots, grp: 21, alt: (x, y, z) => Math.hypot(x - top[0], y - top[1], z - top[2]) < 1.5 ? trim : undefined }));
    prims.push(cone([a[0], a[1], a[2] + 0.2], toe, 2.0, 1.45, { mat: boots, grp: 21 }));
  }

  // ---- torso: slim hips, narrow waist, bodice with a bare neckline ----
  prims.push(ellipsoid([pelX, g.hipY + 1.2 + dy, 0], [4.5, 3.6, 3.4], { mat: dressD, grp: 1 }));
  prims.push(ellipsoid([pelX * 0.6 + chX * 0.4, 30.2 + dy, 0], [3.6, 3.4, 2.8], { mat: dress, grp: 1 }));
  const cy0 = 35.6 + dy, cx0 = chX;
  prims.push(ellipsoid([cx0, cy0, 0.3], [4.4, 4.5, 3.3], {
    mat: dress, grp: 1, alt: (x, y, z, nx, ny, nz) => {
      const dx = Math.abs(x - cx0), top = z > 0.5 ? cy0 + 1.7 - 1.7 * Math.max(0, 1 - dx / 2.1) : cy0 + 2.3;
      if (y > top) return skin;
      if (y > top - 0.95) return trim;
      if (nz > 0.5 && z > 2 && dx < 0.7 && y < top - 2 && y > top - 4.4) return trim;       // small gold flame emblem
      return undefined;
    },
  }));
  prims.push(cone([cx0, 39.4 + dy, 0], [tx * 0.5 + (p.hx || 0) * 0.5, 43.4 + dy, 0.3], 1.55, 1.3, { mat: skin, grp: 3 }));   // neck
  prims.push(skirt(pelX * 0.8, dy, k, sw));

  // ---- arms (bare, gold bracers) ----
  for (const [S, sd, main] of [[J.R, -1, true], [J.L, 1, false]]) {
    const sh = [S.sh[0], S.sh[1] + (main ? 0.45 : -0.4) * st, S.sh[2]], hand = [S.hand[0], S.hand[1] + (main ? 0.3 : -0.2) * st, S.hand[2]];
    const arm = ik2(sh, hand, g.upper, g.fore, [sd * 0.5, -0.3, -0.5]), gi = main ? 0 : 5, h = arm.end;
    prims.push(sphere(sh, 2.0, { mat: skin, grp: 30 + gi }));
    prims.push(cone(sh, arm.mid, 1.85, 1.5, { mat: skin, grp: 31 + gi }));
    prims.push(cone(arm.mid, h, 1.5, 1.2, { mat: skin, grp: 32 + gi, alt: (x, y, z) => { const d = Math.hypot(x - h[0], y - h[1], z - h[2]); return d > 1.6 && d < 4.2 ? trim : undefined; } }));
    prims.push(sphere(add3(h, [0, -0.7, 0.2]), 1.55, { mat: skin, grp: 33 + gi }));
    S.h2 = h;
  }

  // ---- head (turned toward the camera on side views so the face stays readable) ----
  const head0 = prims.length;
  prims.push(ellipsoid(H, HR, { mat: skin, grp: 3, alt: eyes(ctx, H[0], H[1], H[2]) }));
  prims.push(ellipsoid([H[0], H[1] + 1.5, H[2] - 1.3], [4.8, 4.8, 4.8], { mat: hairM, grp: 4 }));   // skull cap (hairline well above the brows)
  // fringe: short swept flame locks across the forehead, and two cheek locks
  [[-3.2, -1], [0.3, 0.5], [3.4, 1]].forEach(([x, s], i) => {
    prims.push(cone([H[0] + x * 0.8, H[1] + 4.5, H[2] + 2.8], [H[0] + x * 1.45 + s * 0.6, H[1] + 2.9 - Math.abs(x) * 0.15, H[2] + 4.6 - Math.abs(x) * 0.25], 1.7, 0.4, { mat: hairM, grp: 40 + i, bias: 1 }));
  });
  for (const sd of [-1, 1]) prims.push(cone([H[0] + sd * 4.3, H[1] + 1.8, H[2] + 0.3], [H[0] + sd * 5.0, H[1] - 3.2, H[2] + 1.2 + sw * 0.4], 1.35, 0.3, { mat: hairM, grp: 43 + (sd > 0 ? 1 : 0) }));
  for (const s of spikes) prims.push(...s.parts);
  { const yw = ctx.yaw, turn = -0.3 * Math.min(yw, 180 - yw); if (turn) rotY(prims.slice(head0), H, turn); }

  // ---- fx: a tiny held flame at idle, a bigger one when casting / attacking ----
  const R = legsHand(J, p, g, st, -1), L = legsHand(J, p, g, st, 1);
  if (!p.portrait) {
    if (p.anim === 'cast' && p.i > 0) {
      prims.push(...flameChain(add3(R, [0, 1.6, 0.4]), [0, 1, 0], p.i === 1 ? 9 : 12, 3.7, k));
      prims.push(...flameChain(add3(R, [0, 1.8, 0.5]), [0, 1, 0], p.i === 1 ? 5.5 : 7.5, 2.1, k + 2, coreM));
      prims.push(...flameChain(add3(L, [0, 1.6, 0.4]), [0, 1, 0], 5, 1.8, k + 1));
    } else if (p.anim === 'attack') {
      if (p.i === 0) prims.push(...flameChain(add3(R, [0, 1.6, 0.4]), [0, 1, 0], 5, 2.0, k));
      if (p.i === 1) {
        const o = add3(R, [0, 1.2, 4.6]);
        prims.push(sphere(o, 3.8, { mat: flameM, grp: 50 }), sphere(o, 2.1, { mat: coreM, grp: 51 }));
        prims.push(...flameChain(add3(o, [0, 0, -1.6]), [0, 0.2, -1], 7, 2.8, k));
      }
      if (p.i === 2) { const o = add3(R, [0, 1.6, 9]); prims.push(sphere(o, 1.5, { mat: coreM, grp: 50 }), sphere(add3(o, [2, 1, 1]), 1.05, { mat: flameM, grp: 50 }), sphere(add3(o, [-1.8, -1.4, 1.6]), 0.95, { mat: flameM, grp: 50 })); }
    } else if (p.anim !== 'stunned') {
      prims.push(...flameChain(add3(R, [0, 1.3, 0.3]), [0, 1, 0], 5 + 0.6 * Math.sin(ph), 1.7, k));   // small idle flame in the main hand
    }
    if (p.stars !== undefined) for (let i = 0; i < 3; i++) { const a = p.stars * Math.PI + i * 2.094; prims.push(sphere([H[0] + Math.cos(a) * 9, H[1] + 15 + Math.sin(a * 2) * 1.2, H[2] + Math.sin(a) * 7], 1.8, { mat: starM, grp: 60 + i })); }
  }
  return prims;
}

// final hand position (same IK as the arm so flames sit exactly on the palm)
function legsHand(J, p, g, st, sd) {
  const S = sd < 0 ? J.R : J.L, main = sd < 0;
  const sh = [S.sh[0], S.sh[1] + (main ? 0.45 : -0.4) * st, S.sh[2]], hand = [S.hand[0], S.hand[1] + (main ? 0.3 : -0.2) * st, S.hand[2]];
  const h = ik2(sh, hand, g.upper, g.fore, [sd * 0.5, -0.3, -0.5]).end;
  return add3(h, [0, -0.7, 0.2]);
}

const cfg = {
  W: 60, H: 70, px: 2, pitch: 12, g, model, chinY: 41, bustW: 32, bustBelow: 10,
  pose(anim, i, p) {
    if (anim === 'idle') {
      p.dy = [0.1, -0.4, 0.1, -0.4][i]; p.tx = [-0.5, 0, 0.5, 0][i]; p.hy = [0, -0.2, 0, -0.2][i];
      p.am = [-1.8, 3.4 + [0, 0.5, 0, 0.5][i], 4.2]; p.ao = [0.3, 0.2, 0];
    } else if (anim === 'walk') {
      const s = [1, 0, -1, 0][i];
      p.dy = [-0.9, 0.4, -0.9, 0.4][i]; p.stance = 0;
      p.fz = [s * 6.2, -s * 6.2]; p.fl = [[0, 0, 1.8, 3.4][i], [1.8, 3.4, 0, 0][i]];
      p.tl = [[1.6, 0, 0, 1.2][i], [0, 1.2, 1.6, 0][i]];                // heel strike on the front foot, toe-off on the rear
      p.am = [-1.2, 3 + (i & 1 ? 0.8 : 0), -s * 4.2]; p.ao = [0.6, 0.6, s * 4.2];
      p.tx = 0;
    } else if (anim === 'attack') {
      p.stance = 0.6;
      if (i === 0) { p.am = [-1.2, 5, -4]; p.ao = [0.5, 1, 1]; p.dy = 0; }
      else if (i === 1) { p.am = [2.2, 9.5, 8.5]; p.ao = [0, 2, 1]; p.dy = -1; p.tx = 0; p.hz = 1.0; p.fz = [3, -2]; }
      else { p.am = [1, 5, 4.5]; p.ao = [0, 0.5, 0.5]; p.dy = -0.3; p.fz = [1.5, -1]; }
    } else if (anim === 'cast') {
      p.stance = 1;
      p.am = [[-1, -2, -3][i], [11, 22, 24][i], [2, 3.5, 3.5][i]]; p.ao = [0.5, [2, 6, 7][i], [1, 3, 3.5][i]]; if (i) p.hy = -0.8;
    } else if (anim === 'stunned') {
      p.stance = 0.6; p.am = [0, 0, 0]; p.dy = -1.2;
    }
    return p;
  },
};
const sheet = buildSheet8(cfg, PL);
console.log(writeSheet('lina', sheet));
