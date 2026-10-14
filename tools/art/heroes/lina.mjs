// Lina the Slayer (8-direction, 2x pixel density, 3D-rendered paper doll): slim fire mage, long flowing red-orange hair, red flame dress.
// Layout: materials -> geometry g -> model(J, ctx) -> pose tweaks -> buildSheet8.
import { Pal, buildSheet8, writeSheet, headUV } from './rig.mjs';
import { ellipsoid, sphere, cone, custom, add3, rotY } from '../lib3d.mjs';

const PL = new Pal();
const skin = PL.mat('#fff0e2', '#ffd8bc', '#e8a888', '#a8665e'), hair = PL.mat('#ffd488', '#ff9a3a', '#ee5a22', '#a8301c');
const dress = PL.mat('#ff9a74', '#f04e3a', '#b82c32', '#701c30'), trim = PL.mat('#fff0a8', '#ffc040', '#c27a1c', '#6a4016');
const boots = PL.mat('#a8483a', '#7a2a2c', '#4e1a24', '#2e1020'), sleeve = PL.mat('#ff9a6a', '#e8502e', '#a82424', '#5c1226');
const pants = PL.mat('#c25a48', '#8e3434', '#5a2028', '#34121f');
const fA = PL.c('#fff4b0', 1), fB = PL.c('#ffb038', 0.85), fC = PL.c('#f0501a', 0.6);
const browM = PL.flat('#a8301c');
const flameM = { ramp: [fA, fB, fC, fC], unlit: true, noOutline: true }, coreM = { ramp: [fA, fA, fB, fB], unlit: true, noOutline: true };
const starM = { ramp: ['Y', 'Y', 'Z', 'Z'], unlit: true, noOutline: true };
const eyeI = PL.flat('#f0700c', 0.25), eyeL = PL.flat('#ffa83c', 0.3), E = PL.flat('#3a1020'), lip = PL.flat('#c8505a'), WH = PL.flat('#ffffff'), emblem = PL.flat('#ffb038', 0.7), emblemHot = PL.flat('#fff4b0', 0.9);

const g = { hipY: 13, legX: 3.6, thigh: 5.6, shin: 5.6, ankleY: 2.4, torsoY: 21.5, shX: 6.6, shY: 25.5, upper: 5.2, fore: 5, handOut: 1.6, armDrop: 9.5, handZ: 1.5, headY: 35, headZ: 0.6 };
const HR = [12.4, 10.8, 10.4];   // head radii
const SK = { yTop: 18.6, yHem: 11.4, rTop: 5.8, rHem: 10.6, zk: 0.86, n: 8 };   // skirt lathe

const tri = f => { f -= Math.floor(f); return 1 - Math.abs(2 * f - 1); };

function skirt() {
  const { yTop, yHem, rTop, rHem, zk, n } = SK;
  const ang = (x, z) => Math.atan2(z / zk, x), fr = th => th * n / (2 * Math.PI);
  const hemY = th => yHem - 2.6 * (1 - tri(fr(th)));
  const sd = (x, y, z) => {
    const th = ang(x, z), rho = Math.hypot(x, z / zk), u = Math.min(1, Math.max(0, (yTop - y) / (yTop - yHem)));
    const r = (rTop + (rHem - rTop) * Math.pow(u, 0.75)) * (1 + 0.04 * Math.sin(th * n));
    return Math.max((rho - r) * 0.85, (hemY(th) - y) * 0.8, y - yTop);
  };
  const alt = (x, y, z) => {
    const th = ang(x, z), f = fr(th), v = y - hemY(th);
    if (v < 1.5) return trim;                                  // golden hem
    const s = (f - Math.floor(f) - 0.5) * 8.4, h = y - yHem;   // flame tongues rising from the hem (arc units)
    const fl = ((f + 0.5) - Math.floor(f + 0.5) - 0.5) * 8.4;
    if (h > -1 && Math.abs(fl) < 2.3 * Math.pow(Math.max(0, 1 - (h + 1) / 6.6), 0.9)) return trim;
    void s;
    return undefined;
  };
  return custom(sd, [0, 15, 0], 15, { mat: dress, alt, grp: 2 });
}

function hairStrand(pts, rad, o) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) out.push(cone(pts[i], pts[i + 1], rad[i], rad[i + 1], o));
  return out;
}

function eyes(P, cx, cy, cz) {
  // face texture on the head surface in arc coordinates (U across, V up), so it foreshortens correctly with yaw
  return (x, y, z) => {
    const q = headUV(x - cx, y - cy, z - cz, HR);
    if (q.w < 0.2) return undefined;
    const { U, V } = q, x0 = P.p.eyes === 'x';
    for (const sd of [-1, 1]) {
      const dU = U - sd * 6.3, dV = V + 1.2, e2 = (dU / 2.9) ** 2 + (dV / 3.6) ** 2;
      if (e2 < 1) {
        if (x0) { const a = Math.abs(dU / 2.9), b = Math.abs(dV / 3.6); return Math.abs(a - b) < 0.34 ? E : undefined; }
        if (dV > 1.6) return E;                                              // lash
        if (dV > 0.2 && dU * sd < -1.3) return WH;                          // catchlight (inner-top)
        if (dV > -0.9 && dU * sd < -1.3) return WH;
        return dV < -1.6 ? eyeL : eyeI;
      }
      if (dU * sd > 2.2 && dU * sd < 3.5 && dV > 1.4 && dV < 2.8 && e2 < 1.7) return E;   // outer lash flick
      if (Math.abs(dU) < 2.5 && dV > 4.4 && dV < 5.4) return browM;
    }
    if (Math.abs(U) < 1.9 && Math.abs(V + 7.6 - 0.07 * U * U) < 0.8) return x0 ? E : lip;                // mouth
    if (Math.abs(U) < 0.8 && Math.abs(V + 4.3) < 0.6) return [skin, 2];                                   // nose
    for (const sd of [-1, 1]) if ((U - sd * 9.4) ** 2 / 3.5 + (V + 4.6) ** 2 / 1.7 < 1) return [skin, 2];  // blush
    return undefined;
  };
}

function flameChain(base, dir, len, r0, k, mat = flameM, o = {}) {
  // wobbling chain of round cones from `base` along unit-ish `dir`
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
  const { p } = J, H = J.head, T = J.torso, sw = p.sway || 0, k = p.t || 0, prims = [];
  const lean = (p.anim === 'attack' && p.i === 1) ? 1.5 : 0;
  // ---- long hair (behind everything) ----
  const phis = [-70, -52, -35, -17, 0, 17, 35, 52, 70], tipY = [19.5, 22.5, 17.5, 21, 15.5, 21.5, 17.5, 22.5, 19];
  phis.forEach((ph, i) => {
    const a = ph * Math.PI / 180, s = Math.sin(a), c = Math.cos(a), side = Math.abs(ph) / 70;
    const wob = (sw * 1.1 + (p.anim === 'cast' ? 1 : 0)) * (i & 1 ? 1 : -1) * (0.4 + 0.6 * side) + (p.anim === 'walk' ? Math.sin(k * 1.6 + i) * 0.8 : 0);
    const pts = [
      [H[0] + s * 11.5, H[1] + 3.5, H[2] - c * 8.5 + 0.2],
      [H[0] + s * 12.6, H[1] - 8.5, H[2] - c * 8.8 - 1.0],
      [T[0] + s * 12.2 + wob * 0.6, T[1] - 2, T[2] - c * 7.4 - 1.5],
      [T[0] + s * (12 + side * 1.2) + wob, tipY[i], T[2] - c * 7 - 2],
    ];
    prims.push(...hairStrand(pts, [3.6, 3.3, 2.7, 0.9], { mat: hair, grp: 10 + i, bias: (i % 3) - 1 }));
  });
  // ---- legs & boots ----
  for (const S of [J.R, J.L]) {
    prims.push(cone(S.hip, S.knee, 2.6, 2.1, { mat: pants, grp: 20 }), cone(S.knee, S.ankle, 2.1, 1.8, { mat: pants, grp: 20 }));
    const a = S.ankle, top = [a[0], a[1] + 5.2, a[2] - 0.3];
    prims.push(cone(a, top, 2.5, 2.7, { mat: boots, grp: 21, alt: (x, y) => y > a[1] + 3.9 ? trim : undefined }));
    prims.push(ellipsoid([a[0], a[1] + 0.2, a[2] + 2.3], [3.3, 2.6, 5.2], { mat: boots, grp: 21 }));
  }
  // ---- torso, skirt, belt, chest flame ----
  prims.push(ellipsoid(T, [6.6, 7, 5.1], {
    mat: dress, grp: 1, alt: (x, y, z, nx, ny, nz) => {
      if (y > T[1] - 3.9 && y < T[1] - 2.2) return trim;                                          // belt
      if (nz > 0.45 && z > 2) { const v = y - (T[1] + 0.5); if (v > -2.6 && v < 4.4 && Math.abs(x - T[0]) < 2.1 * Math.pow(Math.max(0, 1 - (v + 2.6) / 7), 0.8)) return Math.abs(x - T[0]) < 0.7 && v < 1.5 ? emblemHot : emblem; }
      return undefined;
    },
  }));
  prims.push(skirt());
  // ---- arms ----
  for (const [S, main] of [[J.R, true], [J.L, false]]) {
    prims.push(sphere(S.sh, 3.1, { mat: sleeve, grp: 30 + (main ? 0 : 5) }));
    prims.push(cone(S.sh, S.elbow, 2.5, 2.1, { mat: sleeve, grp: 31 + (main ? 0 : 5) }));
    const h = S.hand;
    prims.push(cone(S.elbow, h, 2.1, 1.9, { mat: sleeve, grp: 32 + (main ? 0 : 5), alt: (x, y, z) => Math.hypot(x - h[0], y - h[1], z - h[2]) < 3.4 ? trim : undefined }));
    prims.push(sphere(add3(h, [0, -1.2, 0.3]), 2.5, { mat: skin, grp: 33 + (main ? 0 : 5) }));
  }
  // ---- head (turned toward the camera on side views so the face stays readable) ----
  const head0 = prims.length;
  prims.push(ellipsoid(H, HR, { mat: skin, grp: 3, alt: eyes(ctx, H[0], H[1], H[2]) }));
  // hair cap + fringe + flame tufts
  prims.push(ellipsoid([H[0], H[1] + 2.4, H[2] - 2.6], [13.1, 11.2, 11.6], { mat: hair, grp: 4 }));
  const fr = [[-8.5, -1, 0], [-4.2, 0, 1], [0.2, 0, -1], [4.4, -0.5, 1], [8.6, -2.5, 0]];
  fr.forEach(([x, dl, b], i) => {
    const long = Math.abs(x) > 7 ? 7 : 3.6 + dl;
    prims.push(cone([H[0] + x, H[1] + 9.2, H[2] + 5.2 - Math.abs(x) * 0.12], [H[0] + x * 1.12 + (x < 0 ? -0.5 : 0.8), H[1] + 9.2 - long, H[2] + 7.6 - Math.abs(x) * 0.28], 2.7, 1.0, { mat: hair, grp: 40 + i, bias: b }));
  });
  [[-5.5, 0], [0.5, 1], [6, 0]].forEach(([x, up], i) => {
    const bend = (k & 1 ? 1 : -1) * 0.8 * (sw + 0.5);
    prims.push(cone([H[0] + x, H[1] + 9.5, H[2] - 1.5], [H[0] + x * 1.35 + bend, H[1] + 14.8 + up * 1.4, H[2] - 3.2], 2.8, 0.3, { mat: hair, grp: 45 + i, bias: 1 }));
  });
  { const yw = ctx.yaw, turn = -0.3 * Math.min(yw, 180 - yw); if (turn) rotY(prims.slice(head0), H, turn); }
  // ---- fx ----
  const R = J.R.hand, L = J.L.hand;
  if (!p.portrait) {
    if (p.anim === 'cast' && p.i > 0) {
      prims.push(...flameChain(add3(R, [0, 2.2, 0.4]), [0, 1, 0], p.i === 1 ? 12 : 17, 3.6, k));
      prims.push(...flameChain(add3(R, [0, 2.4, 0.5]), [0, 1, 0], p.i === 1 ? 7 : 10, 1.9, k + 2, coreM));
      prims.push(...flameChain(add3(L, [0, 2.2, 0.4]), [0, 1, 0], 6, 2.0, k + 1));
    }
    if (p.anim === 'attack') {
      if (p.i === 0) prims.push(...flameChain(add3(R, [0, 2.2, 0.4]), [0, 1, 0], 6, 2.4, k));
      if (p.i === 1) {
        const o = add3(R, [0, 1.5, 5.2]);
        prims.push(sphere(o, 4.6, { mat: flameM, grp: 50 }), sphere(o, 2.6, { mat: coreM, grp: 51 }));
        prims.push(...flameChain(add3(o, [0, 0, -2]), [0, 0.2, -1], 8, 3.4, k));
      }
      if (p.i === 2) { const o = add3(R, [0, 2, 11]); prims.push(sphere(o, 1.7, { mat: coreM, grp: 50 }), sphere(add3(o, [2.4, 1.2, 1]), 1.2, { mat: flameM, grp: 50 }), sphere(add3(o, [-2, -1.6, 2]), 1.1, { mat: flameM, grp: 50 })); }
    }
    if (p.stars !== undefined) for (let i = 0; i < 3; i++) { const a = p.stars * Math.PI + i * 2.094; prims.push(sphere([H[0] + Math.cos(a) * 9.5, H[1] + 13.5 + Math.sin(a * 2) * 1.2, H[2] + Math.sin(a) * 8], 1.6, { mat: starM, grp: 60 + i })); }
  }
  void lean;
  return prims;
}

const cfg = {
  W: 56, H: 60, px: 2, pitch: 12, g, model, chinY: 24, bustW: 32, bustBelow: 3,
  pose(anim, i, p) {
    if (anim === 'attack') {
      if (i === 0) { p.am = [-0.5, 9, -4]; p.ao = [1, 2, 2]; p.dy = 0; }
      else if (i === 1) { p.am = [2.5, 8, 9]; p.ao = [0, 1, 1]; p.dy = -1; p.tx = 0; p.hz = 1.2; }
      else { p.am = [1, 3, 4]; p.ao = [0, 0, 0]; p.dy = 0; }
    } else if (anim === 'cast') {
      p.am = [[0, 1, 1][i], [6, 13, 13][i], 2.5]; p.ao = [0, [2, 4, 4][i], 2.5]; if (i) p.hy = -1.5;
    }
    return p;
  },
};
const sheet = buildSheet8(cfg, PL);
console.log(writeSheet('lina', sheet));
