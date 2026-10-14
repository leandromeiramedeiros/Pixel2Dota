// Lina figure: one function per view. Part layout (vector) -> shading -> outline -> hand-pixel detail rows.
import { W, H, R, Cv, poly, ell, cap, rect, or, sub, and, shift, tongue, I } from './lina2d_kit.mjs';

export const views = {};
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const mkm = () => new Uint8Array(W * H);

// flame-hair shader: dark root, hot tips, hot rim on the lit (left) edge
const hairLv = (bias = 0) => (t, s) => {
  let L = s < -0.8 ? 0 : s < -0.4 ? 1 : s < 0.2 ? 2 : s < 0.62 ? 3 : 4;
  if (s < -0.8 && (t < 0.22 || t > 0.9)) L = 1;
  if (t < 0.2) L += 1; else if (t < 0.34) L += 0.0; else if (t > 0.82) L -= 1;
  return Math.max(0, Math.round(L)) + bias;
};
// pixels of mask m currently painted with ramp r
const onlyOn = (cv, m, ramp) => { const o = mkm(); for (let i = 0; i < W * H; i++) if (m[i] && cv.px[i] && cv.px[i].ramp === R[ramp]) o[i] = 1; return o; };
// pixels whose lower neighbour is empty (hem edges)
function lowerEdge(m, y0 = 0) { const o = mkm(); for (let y = y0; y < H; y++) for (let x = 0; x < W; x++) if (m[I(x, y)] && !(y + 1 < H && m[I(x, y + 1)])) o[I(x, y)] = 1; return o; }
// gold hem trim: pixels of m (below y0) that touch empty space on their lower/side edges
function hemTrim(m, y0) { const o = mkm(); const e = (x, y) => x < 0 || y < 0 || x >= W || y >= H || !m[I(x, y)];
  for (let y = y0; y < H; y++) for (let x = 0; x < W; x++) if (m[I(x, y)] && (e(x, y + 1) || e(x - 1, y + 1) || e(x + 1, y + 1) || e(x - 1, y) || e(x + 1, y))) o[I(x, y)] = 1; return o; }
// flat gold-ish band: lit rim / body / shade rim
const band = (cv, ramp, m, o = {}) => cv.paint(m, ramp, { mode: (x, y, a, b) => (a === 1 ? 1 : b === 1 ? 3 : 2), ...o });
// slab across a limb (skin pixels with axis position in [t0,t1] px from a)
function slab(cv, a, b, d0, d1) {
  const o = mkm(), dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = cv.px[I(x, y)]; if (!p || p.ramp !== R.skin) continue; const u = ((x + 0.5 - a[0]) * dx + (y + 0.5 - a[1]) * dy) / L, v = Math.abs(((x + 0.5 - a[0]) * dy - (y + 0.5 - a[1]) * dx) / L); if (u >= d0 && u <= d1 && v < 4.6) o[I(x, y)] = 1; }
  return o;
}
const FACE = { D: '#3c1830', L: ['skin', 0], l: ['skin', 1], s: ['skin', 2], d: ['skin', 3], Z: ['skin', 4], k: '#3c1830', B: '#8a2a34', a: '#ff9a28', A: '#e06a18', w: '#fff0d4', n: ['skin', 3], m: '#8c2c46', p: '#f27a78', c: '#f08e80', g: '#ffe268', G: '#c47c26', r: { hex: '#ff5a38', em: 0.5 } };

// cloth panel: two flat planes split by a fold line (lit left, shade right), coloured outline, waist shadow
function panel(cv, pts, ramp, fold, o = {}) {
  const m = poly(pts), [a0, b0] = fold, dx = b0[0] - a0[0], dy = b0[1] - a0[1], len = Math.hypot(dx, dy), top = Math.min(...pts.map(p => p[1]));
  const fl = o.flip ? -1 : 1;
  cv.paint(m, ramp, { line: o.line ?? 4, bias: o.bias || 0, mode: (x, y, a, b) => {
    const d = fl * ((x + 0.5 - a0[0]) * dy - (y + 0.5 - a0[1]) * dx) / len - (o.sh || 0);
    let L = d < -1.4 ? 1 : d < 0.9 ? 2 : 3; if (y < top + 2) L += 1; if (a === 1 && b > 3 && y > top + 2 && d < 0.9) L = Math.max(0, L - 1); return L; } });
  return m;
}
// catmull-rom point + tangent along a spine at parameter t (0..1)
function spineAt(pts, t) {
  const P = [pts[0], ...pts, pts[pts.length - 1]], segs = pts.length - 1, u = Math.min(segs - 1e-6, t * segs), k = Math.floor(u), f = u - k;
  const [a, b, c, d] = [P[k], P[k + 1], P[k + 2], P[k + 3]];
  return [0, 1].map(q => 0.5 * ((2 * b[q]) + (-a[q] + c[q]) * f + (2 * a[q] - 5 * b[q] + 4 * c[q] - d[q]) * f * f + (-a[q] + 3 * b[q] - 3 * c[q] + d[q]) * f * f * f));
}
// a hair ribbon with flame forks splitting off its length: forks = [[t, angleDeg, len, width]]
function ribbon(cv, X, pts, w, b, forks = [], o = {}) {
  cv.paintT(tongue(X(pts), w, { pow: o.pow ?? 0.75, bulge: 0.15 }), 'hair', hairLv(b), { line: 4 });
  for (const [t, ang, len, fw] of forks) {
    const p0 = spineAt(pts, t), p1 = spineAt(pts, Math.min(1, t + 0.04)), dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dx, dy) || 1;
    const a = ang * Math.PI / 180, ux = (dx * Math.cos(a) - dy * Math.sin(a)) / L, uy = (dx * Math.sin(a) + dy * Math.cos(a)) / L;
    const q1 = [p0[0] + ux * len * 0.5, p0[1] + uy * len * 0.5], q2 = [p0[0] + ux * len + (ang < 0 ? -0.5 : 0.5), p0[1] + uy * len - 0.12 * len];
    cv.paintT(tongue(X([p0, q1, q2]), fw, { pow: 0.85 }), 'hair', hairLv(b), { line: 4 });
  }
}
// hot hair pixels glow a little (emit); everything else stays dark
function hairGlow(cv) { for (const p of cv.px) if (p && p.ramp === R.hair && p.lv === 0) p.em = 0.35; }
// angular, hard-edged flame (polygon, nested core), base centre (x,y); lean shifts the tip
function wisp(cv, x, y, k = 1, lean = 0) {
  const P = (pts, f) => pts.map(([px, py]) => [x + px * k + lean * Math.max(0, -py) / 12, y + py * k]);
  const outer = [[-3, 0], [-4, -3], [-2, -6], [-3, -10], [0, -7], [1, -14], [3, -8], [4, -4], [3, 0]];
  const mid = [[-2, 0], [-2.5, -3], [-1, -6], [0, -9], [1, -6], [2.5, -3], [2, 0]];
  const core = [[-1.2, 0], [-1.4, -2.5], [0, -5], [1.4, -2.5], [1.2, 0]];
  const mO = poly(P(outer)), mM = poly(P(mid)), mC = poly(P(core));
  cv.paint(mO, 'fire', { mode: 3 }); cv.paint(mM, 'fire', { mode: 2 }); cv.paint(mC, 'fire', { mode: 0 });
  for (let i = 0; i < W * H; i++) { const p = cv.px[i]; if (!p) continue; if (mC[i]) p.em = 1; else if (mM[i]) p.em = 0.6; else if (mO[i]) p.em = 0.3; }
}
const sparkles = (cv, list) => { for (const [x, y, c, em] of list) cv.dot(x, y, c, em ?? 0); };
const cross = (cv, x, y, c = '#fff6b8') => { for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) cv.dot(x + dx, y + dy, c, dx || dy ? 0.3 : 0.8); };
// three curled fingers + thumb over the base of the flame
function fingers(cv, hx, hy, bias = 0) {
  const m = or(cap(hx - 1.6, hy - 1.6, 1.15, hx - 1.7, hy - 4.1, 0.95), cap(hx + 0.2, hy - 2.1, 1.15, hx + 0.2, hy - 4.8, 0.95), cap(hx + 1.9, hy - 1.8, 1.1, hx + 2.2, hy - 4.0, 0.9));
  cv.paint(m, 'skin', { line: 4, bias, mode: (x, y, a, b) => (a === 1 ? 1 : 2) });
  cv.paint(cap(hx - 3.1, hy - 0.4, 1.0, hx - 3.4, hy - 2.8, 0.8), 'skin', { line: 4, bias, mode: 2 });
}
// gold shoulder cap over the top of a deltoid
const spaulder = (cv, x, y, r = 4.4) => band(cv, 'gold', onlyOn(cv, ell(x, y - 1.2, r, 2.7), 'skin'));
// knuckle marks on a fist
const knuckles = (cv, x, y) => cv.stamp(Math.round(x) - 1, Math.round(y), ['d.d', '...'], { d: ['skin', 3] }, { onlySkin: true });

// ================================================================= shared figure pieces
// cloth panel + gold hem trim (trim = rows from the lowest tip upward)
function pan(cv, pts, ramp, fold, o = {}) {
  const m = panel(cv, pts, ramp, fold, o);
  let lo = 0; pts.forEach((p, i) => { if (p[1] > pts[lo][1]) lo = i; });
  const n = pts.length, A = pts[(lo + n - 1) % n], B = pts[lo], C = pts[(lo + 1) % n], t = o.trim ?? 0.8;
  const mk2 = (p, q) => cap(p[0], p[1], t, q[0], q[1], t);
  const lerpP = (p, q, f) => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
  const fr = (P, Q) => Math.min(o.len ?? 0.8, (o.px ?? 9) / (Math.hypot(P[0] - Q[0], P[1] - Q[1]) || 1));
  const trim = and(or(mk2(lerpP(B, A, fr(B, A)), B), mk2(B, lerpP(B, C, fr(B, C)))), m);
  band(cv, 'gold', trim);
  cv.ao(m, 2, 1, 1, p => p.ramp === R.red || p.ramp === R.orange || p.ramp === R.skin);
  return m;
}
// limb = two capsules; bracer/armlet slabs painted afterwards (gold)
function limb(cv, a, b, c, ra, rb, rc, o = {}) {
  cv.paint(cap(a[0], a[1], ra, b[0], b[1], rb), 'skin', { line: 4, ...o }); cv.paint(cap(b[0], b[1], rb, c[0], c[1], rc), 'skin', { line: 4, ...o });
}
function gold(cv, a, b, c, o = {}) {
  const L1 = Math.hypot(b[0] - a[0], b[1] - a[1]), L2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
  band(cv, 'gold', slab(cv, a, b, (o.t1 ?? 0.42) * L1, (o.t1 ?? 0.42) * L1 + 2.4));
  band(cv, 'gold', slab(cv, b, c, (o.t2 ?? 0.48) * L2, (o.t2 ?? 0.48) * L2 + 4.2));
}
// boot (shin cap + foot polygon) with gold cuff
function boot(cv, top, bot, foot, o = {}) {
  const bi = o.bias || 0, cuffY = Math.round(top[1]);
  const mf = poly(foot), shaft = sub(cap(top[0], top[1] + 2, 4.5, bot[0], bot[1], 3.8), rect(0, 0, W, cuffY - 1)), m = or(shaft, mf);
  cv.paint(m, 'boot', { line: 4, bias: bi });
  const xs = foot.map(p => p[0]), toeX = (top[0] - Math.min(...xs)) > (Math.max(...xs) - top[0]) ? Math.min(...xs) : Math.max(...xs);
  cv.tint(m, (lv, x, y) => {
    if (y >= 100) return Math.max(lv, 4 + bi);                                               // sole
    if (!m[I(x - 1, y)] && y < 95 && lv > 1) return lv - 1;                                  // lit edge of the shaft
    if (mf[I(x, y)] && y >= 95 && y <= 98 && Math.abs(x - toeX) <= 5 && lv > 1) return lv - 1; // toe cap
    if (y === cuffY + 5 && lv < 4) return lv + 1;                                             // strap line
    return lv;
  });
  const cuff = and(rect(0, cuffY, W, cuffY + 1), m);
  band(cv, 'gold', cuff, { bias: bi });
  const sx = Math.round(top[0] + (bot[0] - top[0]) * 0.35), G_ = { g: R.gold[bi ? 3 : 2], h: R.gold[bi ? 4 : 1] };
  cv.stamp(sx - 1, cuffY + 3, ['h', 'g', 'g', 'h'].map(c => c), { g: G_.g, h: G_.h }, { only: true });
  cv.stamp(Math.round(toeX) + (toeX < top[0] ? 1 : -1), 99, ['g'], { g: G_.g }, { only: true });
  // flared cuff: 1px wider than the shaft (gold) + shade line below
  cv.ao(cuff, 0, 1, 1, p => p.ramp === R.boot);
  return m;
}

// ================================================================= FRONT (s)
views.s = () => {
  const cv = new Cv();
  const P = (m, r, o) => cv.paint(m, r, o);
  // upper body is tilted about the waist: shoulders cant (raised-arm side up), head tilts the other way
  const TH = -0.075, cx0 = 43, cy0 = 60, cs = Math.cos(TH), sn = Math.sin(TH);
  const U = ([x, y]) => [cx0 + (x - cx0) * cs - (y - cy0) * sn, cy0 + (x - cx0) * sn + (y - cy0) * cs];
  const Up = pts => pts.map(U);
  const uc = (a, ra, b, rb) => cap(...U(a), ra, ...U(b), rb);
  const ue = (x, y, rx, ry, rot = 0) => ell(...U([x, y]), rx, ry, rot + TH);

  // ---- hair, back layers: lyre crown of big swept ribbons
  P(ue(45, 27, 10, 8), 'hair', { bias: 2, line: null });
  ribbon(cv, Up, [[41, 28], [33, 24], [27, 16], [28, 8], [34, 2]], 6.4, 1);
  ribbon(cv, Up, [[49, 28], [57, 24], [62, 17], [60, 10], [55, 5]], 5.8, 1);
  ribbon(cv, Up, [[43, 26], [38, 19], [37, 11], [41, 4]], 4.4, 0);
  ribbon(cv, Up, [[47, 26], [51, 19], [52, 12], [49, 7]], 4.0, 0);
  ribbon(cv, Up, [[45, 26], [43, 17], [47, 8], [45, 0]], 5.6, 0);

  // ---- skirt back layer, legs, boots, panels
  P(poly([[35, 60], [52, 60], [60, 72], [66, 82], [60, 83], [57, 88], [47, 84], [40, 88], [32, 84], [25, 86], [27, 72]]), 'red', { bias: 2, line: null });
  P(cap(38, 64, 4.9, 33, 80, 3.9), 'skin'); P(cap(33, 80, 3.7, 30, 92, 3.1), 'skin');
  P(cap(49, 64, 4.9, 60, 77, 3.9), 'skin'); P(cap(60, 77, 3.7, 61, 92, 3.1), 'skin');
  boot(cv, [31.4, 86], [30.2, 94], [[23, 95], [28, 94], [35, 95], [38, 99], [37, 102], [21, 102], [20, 98]]);
  boot(cv, [60.6, 86], [61.2, 94], [[68, 95], [63, 94], [56, 95], [53, 99], [54, 102], [70, 102], [71, 98]]);
  pan(cv, [[36, 60], [43, 60], [41, 70], [35, 77], [27, 84], [27, 76], [31, 68]], 'red', [[39, 60], [29, 80]]);
  pan(cv, [[51, 60], [45, 60], [47, 70], [53, 76], [64, 83], [63, 74], [58, 66]], 'red', [[49, 60], [60, 79]], { sh: 2.2 });
  pan(cv, [[40, 60], [45, 60], [44, 74], [38, 85], [36, 75]], 'red', [[43, 60], [38, 85]], { bias: 1 });
  pan(cv, [[48, 60], [43, 60], [44, 74], [52, 84], [54, 74]], 'red', [[44, 60], [52, 84]], { bias: 1, sh: 1.2 });
  pan(cv, [[41, 60], [47, 60], [47, 76], [45, 90], [44, 93], [43, 90], [41, 76]], 'orange', [[44, 60], [44, 93]]);

  // ---- torso (narrow waist, bust, hips)
  P(poly(Up([[31, 44], [35, 41], [53, 41], [58, 43], [54, 49], [51, 53], [49, 57], [52, 63], [36, 63], [39, 57], [37, 53], [34, 49]])), 'skin', { line: 4 });
  const bod = poly(Up([[35, 46], [41, 45], [44, 48], [47, 45], [53, 46], [52, 51], [48, 54], [44, 52], [40, 54], [36, 51]]));
  P(bod, 'red', { line: 4 }); cv.ao(bod, 0, 1, 1, p => p.ramp === R.skin);
  band(cv, 'gold', and(bod, poly(Up([[33, 43], [55, 43], [55, 46.5], [47, 46.5], [44, 49.5], [41, 46.5], [33, 46.5]]))));
  const belt = poly(Up([[37, 56], [51, 56], [53, 61], [35, 61]]));
  P(belt, 'orange', { line: 4 });
  band(cv, 'gold', and(poly(Up([[36, 56], [52, 56], [52, 57.2], [36, 57.2]])), belt));
  P(poly(Up([[41, 55], [47, 55], [48, 61], [40, 61]])), 'gold', { line: 4 });
  P(poly(Up([[36, 60], [40, 60], [38, 72], [35, 83], [34, 72]])), 'orange', { line: 4 });

  // ---- neck + head
  P(poly(Up([[42, 36], [47, 36], [47, 42], [42, 42]])), 'skin');
  const headM = ue(45, 31, 6.2, 7.7, 0); P(headM, 'skin', { line: 4 }); cv.ao(headM, 0, 2, 1, p => p.ramp === R.skin);
  const HC = U([45, 31]);

  // ---- arms
  const A1 = [[31, 45], [22, 54], [31, 61]], A2 = [[57, 44], [66, 50], [69, 40]];
  P(ue(31, 45, 4.2, 4.2), 'skin', { line: 4 }); P(ue(57, 44, 4.2, 4.2), 'skin', { line: 4 });
  limb(cv, U(A1[0]), U(A1[1]), U(A1[2]), 3.6, 3.0, 2.5); limb(cv, U(A2[0]), U(A2[1]), U(A2[2]), 3.6, 3.0, 2.6);
  P(ue(31, 61.5, 3.0, 2.7), 'skin', { line: 4 });                 // fist on hip
  P(ue(69, 39.5, 3.2, 3.0), 'skin', { line: 4 });                 // open hand
  gold(cv, U(A1[0]), U(A1[1]), U(A1[2])); gold(cv, U(A2[0]), U(A2[1]), U(A2[2]));
  spaulder(cv, ...U([31, 44])); spaulder(cv, ...U([57, 43]));
  { const bc = U([44, 49]); cv.stamp(Math.round(bc[0]) - 1, Math.round(bc[1]) - 1, ['.g.', 'grg', '.g.'], FACE, { only: true }); const st = U([44, 58.4]); cv.stamp(Math.round(st[0]) - 6, Math.round(st[1]), ['g.g......g.g'], FACE, { only: true }); }

  // ---- hair front: side locks + bangs
  for (const [pts, w, b] of [
    [[[37, 24], [34, 32], [33, 40], [35, 48]], 3.0, 0],
    [[[53, 24], [55, 32], [56, 39]], 2.8, 0],
    [[[39, 20], [43, 22], [48, 26]], 3.2, 0],
  ]) cv.paintT(tongue(Up(pts), w, { pow: 0.7 }), 'hair', hairLv(b), { line: 4 });

  // ---- face (hand-placed, 13x15 block over the head)
  cv.stamp(Math.round(HC[0]) - 6, Math.round(HC[1]) - 8, [
    '.............',
    '..llllllllss.',
    '.llllllllllss',
    '.lllllllllBBs',
    '.llBBBllBBlss',
    '.lllllllllsss',
    '.kkkklllkkkks',
    '.lwAalllwAals',
    '.lllllllllsss',
    '.llllllldllss',
    '.lllllnnllsss',
    '.lccllllllmss',
    '..lllmmmmmlss',
    '..llllpplllss',
    '...lllllldss.',
  ], FACE, { onlySkin: true });
  const nk = U([44, 42]); cv.stamp(Math.round(nk[0]) - 3, Math.round(nk[1]) - 1, ['gggggg', '.g..g.', '..rr..'], FACE, { only: true });

  const w0 = U([69, 36]);
  wisp(cv, Math.round(w0[0]), Math.round(w0[1]), 1, 0);
  { const hh = U([69, 39.5]); fingers(cv, hh[0], hh[1]); const fs_ = U([31, 61.5]); knuckles(cv, fs_[0], fs_[1]); }
  cross(cv, Math.round(w0[0]) + 6, Math.round(w0[1]) - 12); sparkles(cv, [[62, 28, '#ffc43c'], [71, 19, '#ff8a26'], [65, 21, '#fff0a0'], [75, 33, '#ff8a26']]);

  hairGlow(cv);
  cv.outline();
  return cv;
};

// ================================================================= 3/4 FRONT (se): turned to screen-right, raised arm is the far one
views.se = () => {
  const cv = new Cv();
  const P = (m, r, o) => cv.paint(m, r, o);
  const TH = -0.05, cx0 = 44, cy0 = 60, cs = Math.cos(TH), sn = Math.sin(TH);
  const U = ([x, y]) => [cx0 + (x - cx0) * cs - (y - cy0) * sn, cy0 + (x - cx0) * sn + (y - cy0) * cs];
  const Up = pts => pts.map(U);
  const ue = (x, y, rx, ry, rot = 0) => ell(...U([x, y]), rx, ry, rot + TH);

  // hair: crown sweeping up/back-left, long streamer hanging back-left
  P(ue(45, 27, 9, 8), 'hair', { bias: 2, line: null });
  ribbon(cv, Up, [[40, 31], [32, 33], [24, 39], [21, 48]], 4.6, 1, [[0.5, 38, 7, 2.2]]);
  ribbon(cv, Up, [[41, 28], [33, 23], [26, 15], [25, 7], [30, 1]], 6.2, 1);
  ribbon(cv, Up, [[49, 28], [55, 23], [59, 16], [57, 9]], 5.0, 1);
  ribbon(cv, Up, [[44, 26], [41, 17], [44, 9], [43, 1]], 5.6, 0);
  ribbon(cv, Up, [[46, 26], [49, 19], [51, 13], [49, 8]], 3.8, 0);

  // far (raised) arm first, so the torso overlaps its shoulder
  const A2 = [[53, 45], [62, 49], [66, 40]];
  limb(cv, U(A2[0]), U(A2[1]), U(A2[2]), 3.5, 3.0, 2.6, { bias: 0 });
  P(ue(66, 39.5, 3.2, 3.0), 'skin', { line: 4 });
  gold(cv, U(A2[0]), U(A2[1]), U(A2[2]));

  // skirt back layer + legs + boots
  P(poly([[36, 60], [52, 60], [60, 72], [64, 82], [58, 83], [55, 88], [46, 84], [39, 88], [30, 84], [22, 88], [27, 72]]), 'red', { bias: 2, line: null });
  P(cap(39, 64, 4.9, 34, 80, 3.9), 'skin'); P(cap(34, 80, 3.7, 31, 92, 3.1), 'skin');
  P(cap(49, 64, 4.9, 58, 77, 3.9), 'skin'); P(cap(58, 77, 3.7, 58, 92, 3.1), 'skin');
  boot(cv, [32.4, 86], [31.4, 94], [[24, 95], [29, 94], [37, 95], [40, 99], [39, 102], [22, 102], [21, 98]]);
  boot(cv, [58.2, 86], [58.4, 94], [[52, 95], [60, 94], [66, 96], [70, 100], [69, 102], [51, 102], [50, 99]]);
  pan(cv, [[37, 60], [44, 60], [42, 70], [36, 77], [25, 87], [26, 77], [31, 68]], 'red', [[41, 60], [25, 87]]);
  pan(cv, [[41, 60], [46, 60], [45, 74], [38, 86], [37, 75]], 'red', [[44, 60], [38, 86]], { bias: 1 });
  pan(cv, [[48, 60], [43, 60], [45, 74], [54, 84], [56, 74]], 'red', [[46, 60], [54, 84]], { bias: 1 });
  pan(cv, [[50, 60], [45, 60], [48, 70], [56, 75], [64, 82], [62, 72], [57, 65]], 'red', [[48, 60], [64, 82]]);
  pan(cv, [[43, 60], [49, 60], [50, 76], [49, 89], [48, 92], [46, 89], [44, 76]], 'orange', [[47, 60], [47, 92]]);

  // torso (3/4): narrower, bust pointing right
  P(poly(Up([[34, 44], [38, 41], [52, 41], [55, 43], [53, 49], [51, 53], [50, 57], [52, 63], [38, 63], [40, 57], [38, 53], [36, 49]])), 'skin', { line: 4 });
  const bod = poly(Up([[37, 46], [42, 45], [46, 48], [49, 45], [54, 46], [53, 51], [50, 54], [46, 52], [42, 54], [38, 51]]));
  P(bod, 'red', { line: 4 });
  band(cv, 'gold', and(bod, poly(Up([[35, 43], [56, 43], [56, 46.5], [49, 46.5], [46, 49.5], [42, 46.5], [35, 46.5]]))));
  const belt = poly(Up([[39, 56], [52, 56], [54, 61], [37, 61]]));
  P(belt, 'orange', { line: 4 });
  band(cv, 'gold', and(poly(Up([[38, 56], [53, 56], [53, 57.2], [38, 57.2]])), belt));
  P(poly(Up([[44, 55], [50, 55], [51, 61], [43, 61]])), 'gold', { line: 4 });
  P(poly(Up([[38, 60], [42, 60], [38, 72], [33, 82], [34, 72]])), 'orange', { line: 4 });

  P(poly(Up([[42, 36], [48, 36], [48, 42], [42, 42]])), 'skin');
  P(or(ue(46, 31, 6.2, 7.7, 0), poly(Up([[50.5, 32], [53.2, 34.4], [50.6, 35.8]]))), 'skin', { line: 4 });
  const HC = U([46, 31]);

  // near (hip) arm
  const A1 = [[35, 45], [25, 53], [34, 61]];
  P(ue(35, 45, 4.2, 4.2), 'skin', { line: 4 });
  limb(cv, U(A1[0]), U(A1[1]), U(A1[2]), 3.6, 3.0, 2.5);
  P(ue(34, 61.5, 3.0, 2.7), 'skin', { line: 4 });
  gold(cv, U(A1[0]), U(A1[1]), U(A1[2]));
  spaulder(cv, ...U([35, 44])); spaulder(cv, ...U([54, 44]));
  { const bc = U([46, 49]); cv.stamp(Math.round(bc[0]) - 1, Math.round(bc[1]) - 1, ['.g.', 'grg', '.g.'], FACE, { only: true }); }

  for (const [pts, w, b] of [
    [[[40, 25], [36, 34], [34, 42], [35, 50]], 3.4, 0],
    [[[42, 21], [45, 24], [49, 28]], 3.0, 0],
    [[[51, 25], [53, 31], [53, 36]], 2.4, 0],
  ]) cv.paintT(tongue(Up(pts), w, { pow: 0.7 }), 'hair', hairLv(b), { line: 4 });

  cv.stamp(Math.round(HC[0]) - 6, Math.round(HC[1]) - 8, [
    '.............',
    '..lllllllss..',
    '.llllllllllss',
    '.lllllllllBBs',
    '.llBBBllBBlss',
    '.lllllllllsss',
    '.kkkkllllkkks',
    '.lwAallllAals',
    '.lllllllllsss',
    '.lllllllldlss',
    '.llllllnnlsss',
    '.lccllllllmss',
    '..llllmmmmmss',
    '..lllllpplsss',
    '...llllllldss',
  ], FACE, { onlySkin: true });
  const nk = U([45, 42]); cv.stamp(Math.round(nk[0]) - 3, Math.round(nk[1]) - 1, ['gggggg', '.g..g.', '..rr..'], FACE, { only: true });

  const w0 = U([66, 36]);
  wisp(cv, Math.round(w0[0]), Math.round(w0[1]), 1, 0);
  { const hh = U([66, 39.5]); fingers(cv, hh[0], hh[1]); const fs_ = U([34, 61.5]); knuckles(cv, fs_[0], fs_[1]); }
  cross(cv, Math.round(w0[0]) + 6, Math.round(w0[1]) - 12); sparkles(cv, [[60, 27, '#ffc43c'], [68, 19, '#ff8a26'], [62, 20, '#fff0a0'], [72, 33, '#ff8a26']]);

  hairGlow(cv);
  cv.outline();
  return cv;
};

// ================================================================= SIDE (e), facing right: near arm = hip arm, far arm raised in front
views.e = () => {
  const cv = new Cv();
  const P = (m, r, o) => cv.paint(m, r, o);
  const I_ = p => p;
  ribbon(cv, I_, [[42, 27], [34, 18], [25, 11], [17, 8]], 6.0, 0, [[0.55, 36, 9, 2.6], [0.8, -32, 6, 2.2]]);
  ribbon(cv, I_, [[43, 25], [37, 14], [31, 6], [25, 1]], 5.4, 1, [[0.6, -34, 7, 2.2]]);
  ribbon(cv, I_, [[41, 30], [31, 28], [21, 30], [13, 37]], 4.4, 1, [[0.55, -38, 7, 2.2]]);
  ribbon(cv, I_, [[41, 32], [34, 38], [28, 46], [26, 55]], 4.0, 1);
  ribbon(cv, I_, [[44, 24], [42, 14], [40, 6], [36, 1]], 4.6, 0, [[0.6, 30, 6, 2]]);
  P(ell(43, 27, 7, 7), 'hair', { bias: 1, line: null });

  // far arm (raised, forward) behind torso
  const AF = [[44, 45], [53, 50], [60, 43]];
  limb(cv, AF[0], AF[1], AF[2], 3.3, 2.9, 2.5, { bias: 1 });
  P(ell(60, 42.5, 3.1, 2.9), 'skin', { line: 4, bias: 1 });
  gold(cv, AF[0], AF[1], AF[2], { bias: 1 });

  // far leg + boot (back leg, straight), back skirt panels flowing back
  P(poly([[38, 60], [48, 60], [44, 72], [30, 80], [18, 86], [22, 76], [30, 66]]), 'red', { bias: 2, line: null });
  P(cap(41, 64, 4.6, 34, 80, 3.8), 'skin', { bias: 1 }); P(cap(34, 80, 3.6, 29, 92, 3.1), 'skin', { bias: 1 });
  boot(cv, [30.4, 86], [29, 94], [[24, 95], [30, 94], [36, 96], [39, 100], [38, 102], [23, 102], [22, 99]], { bias: 1 });
  pan(cv, [[40, 60], [48, 60], [45, 70], [36, 82], [24, 90], [28, 78]], 'red', [[44, 60], [24, 90]], { bias: 1 });

  // near... front leg bent
  P(cap(47, 64, 5, 58, 76, 4), 'skin'); P(cap(58, 76, 3.8, 58, 92, 3.1), 'skin');
  boot(cv, [58, 86], [58, 94], [[52, 95], [59, 94], [65, 96], [68, 100], [67, 102], [51, 102], [49, 99]]);

  P(poly([[42, 36], [46, 36], [46, 42], [42, 42]]), 'skin');
  P(poly([[39, 43], [44, 41], [48, 42], [51, 46], [53, 50], [50, 54], [48, 58], [51, 63], [37, 63], [41, 56], [39, 50], [37, 46]]), 'skin', { line: 4 });
  const bod = poly([[39, 46], [46, 45], [52, 48], [53.5, 51], [48, 54], [42, 53], [39, 52]]);
  P(bod, 'red', { line: 4 }); band(cv, 'gold', and(bod, rect(38, 44, 53, 46)));
  P(poly([[40, 59], [44, 59], [34, 66], [23, 73], [25, 67]]), 'orange', { line: 4 });
  P(poly([[40, 56], [49, 56], [50, 60], [39, 60]]), 'orange', { line: 4 });
  P(rect(47, 55, 50, 60), 'gold', { line: 4 });
  pan(cv, [[43, 60], [50, 60], [50, 76], [46, 90], [42, 76]], 'red', [[46, 60], [46, 90]], { bias: 1 });
  pan(cv, [[47, 60], [53, 60], [56, 70], [57, 82], [54, 79], [51, 85], [49, 74]], 'orange', [[50, 60], [55, 83]]);

  // head (profile): skull + face profile polygon, hair cap over the back
  P(poly([[39, 29], [40, 24], [43, 22], [47, 22.5], [50, 25], [50.5, 28], [50, 30], [52.6, 32.6], [50.6, 34], [51.2, 35.6], [50.2, 37], [50.6, 38.6], [48, 40], [44.5, 40], [42.5, 37], [39.5, 33]]), 'skin', { line: 4 });
  P(poly([[38, 30], [38, 24], [41, 20], [47, 20], [50.6, 23.4], [50.6, 26.4], [47, 25.4], [45.4, 27.4], [43.6, 29.6], [42.6, 33.6], [39, 33]]), 'hair', { line: 4 });
  // near arm: hand on hip, elbow back
  const AN = [[41, 45], [33, 53], [41, 60]];
  limb(cv, AN[0], AN[1], AN[2], 3.5, 3.0, 2.5);
  P(ell(41, 60.5, 3.0, 2.7), 'skin', { line: 4 });
  gold(cv, AN[0], AN[1], AN[2]);
  spaulder(cv, 41, 44.5);
  cv.paintT(tongue([[43, 25], [40, 33], [37, 40], [34, 46]], 3.2, { pow: 0.7 }), 'hair', hairLv(0), { line: 4 });
  // profile face details (x 44..53, y 25..39)
  cv.stamp(44, 25, [
    '..........',
    '..........',
    '...BBBB...',
    '..........',
    '...kkkk...',
    '...wAa....',
    '..cc......',
    '......ll..',
    '......dd..',
    '.....mm...',
    '.....pp...',
    '..........',
  ], FACE, { onlySkin: true });
  cv.stamp(41, 29, ['.d.', 'dd.', '.d.'], FACE, { onlySkin: true });
  wisp(cv, 60, 38, 1, 0);
  fingers(cv, 60, 42.5, 1); knuckles(cv, 41, 60.5);
  cross(cv, 66, 26); sparkles(cv, [[56, 29, '#ffc43c'], [63, 22, '#ff8a26'], [58, 21, '#fff0a0'], [67, 34, '#ff8a26']]);

  hairGlow(cv);
  cv.outline();
  return cv;
};

// ================================================================= PORTRAIT (HUD, 32x42): head only, 3/4 turn, chin up, tilted
// rows are written as "<char><count>" tokens so every row is length-checked (20 wide)
const rowsOf = (w, list) => list.map((r, i) => { let out = ''; for (const t of r.trim().split(/\s+/)) out += t[0].repeat(+t.slice(1)); if (out.length !== w) throw new Error(`face row ${i} is ${out.length}, want ${w}: ${r}`); return out; });
const PFACE = (() => ({ ...FACE, a: { hex: '#ffa830', em: 0.25 } }))();
views.portrait = () => {
  const cv = new Cv(); cv.crop = [28, 30, 32, 42];
  const P = (m, r, o) => cv.paint(m, r, o);
  // hair back: big swept ribbons (up/left), tips cropped by the box top except the outer two
  P(ell(45, 49, 13, 9), 'hair', { bias: 2, line: null });
  ribbon(cv, p => p, [[38, 51], [33, 56], [31, 63], [33, 70]], 4.2, 1);
  ribbon(cv, p => p, [[44, 50], [37, 44], [32, 37], [31, 31]], 6.4, 1);
  ribbon(cv, p => p, [[52, 49], [56, 43], [58, 37], [56, 31]], 5.2, 1);
  ribbon(cv, p => p, [[46, 48], [43, 40], [46, 33], [48, 28]], 6.0, 0);
  ribbon(cv, p => p, [[53, 50], [58, 55], [58.5, 62]], 3.0, 2);                       // far-side lock behind the cheek
  P(ell(38.5, 58, 5.5, 9), 'hair', { bias: 2, line: null });
  // neck sliver + gold collar
  P(poly([[44, 63], [52, 63], [53.5, 72], [42.5, 72]]), 'skin', { line: 4, bias: 1 });
  // face: hand-drawn rows (this IS the head silhouette); 3/4 turn to the right, brow raised on the far side
  const faceRows = rowsOf(20, [
    '.3 l12 .5',
    '.2 l13 s1 .4',
    '.1 l14 s2 .3',
    '.1 l14 s3 .2',
    '.1 l13 B3 s1 .2',
    '.1 l2 B6 l2 B3 l2 s2 .2',
    '.1 l14 s3 .2',
    '.1 l10 k4 s3 .2',
    '.1 k6 l4 w1 A1 a1 w1 s3 .2',
    '.1 l1 w1 A1 a1 a1 w1 l4 d4 l1 s2 .2',
    '.1 l1 d5 l9 s2 .2',
    '.1 l14 s3 .2',
    '.1 l11 d2 l1 s3 .2',
    '.1 l11 d1 l1 L1 s2 l1 s1 .1',
    '.1 l11 d1 l1 L1 s1 L1 l1 s1 .1',
    '.1 l11 d1 l1 L1 s1 L1 L1 l1 s1',
    '.1 l2 c3 l5 d1 n2 l1 s1 l1 d1 .2',
    '.1 l11 d3 s2 d1 .2',
    '.1 l13 s3 .3',
    '.2 l11 m1 l1 s2 .3',
    '.2 l5 m6 l2 s1 .4',
    '.3 l5 p4 l2 s1 .5',
    '.4 l6 d3 s1 .6',
    '.5 l6 s2 .7',
    '.6 d1 Z4 d1 .8',
  ]);
  // jaw taper on the near side: the face narrows toward the chin
  const taper = faceRows.map((r, i) => { const k = Math.max(0, Math.min(5, Math.floor((i - 11) / 2) + 1)); const c = [...r]; let n = 0; for (let j = 0; j < c.length && n < k; j++) if (c[j] !== '.') { c[j] = '.'; n++; } return c.join(''); });
  cv.stamp(39, 45, taper, PFACE);
  band(cv, 'gold', and(poly([[40, 68.4], [46, 70.8], [55, 68.4], [55, 71.6], [46, 74], [40, 71.6]]), poly([[41, 64], [54, 64], [54.5, 73], [41, 73]])));
  // hair front: left lock framing the face + bangs sweeping across the forehead
  ribbon(cv, p => p, [[37, 47], [33, 54], [32, 62], [34, 69]], 3.8, 0);
  ribbon(cv, p => p, [[39, 46], [45, 48], [52, 52]], 4.6, 0);
  ribbon(cv, p => p, [[48, 44], [54, 47], [57, 52]], 3.4, 1);
  cv.stamp(45, 70, ['.rr.'], FACE, { only: true });
  cross(cv, 55, 33, '#fff6b8'); sparkles(cv, [[30, 40, '#ffc43c'], [57, 40, '#ff8a26'], [35, 31, '#fff0a0']]);
  hairGlow(cv);
  cv.outline();
  return cv;
};
