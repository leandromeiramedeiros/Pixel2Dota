// Lina figure: one function per view. Part layout (vector) -> shading -> outline -> hand-pixel detail rows.
import { W, H, R, Cv, poly, ell, cap, rect, or, sub, and, shift, tongue, I } from './lina2d_kit.mjs';

export const views = {};
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const mkm = () => new Uint8Array(W * H);

// flame-hair shader: dark root, hot tips, hot rim on the lit (left) edge
export const hairLv = (bias = 0) => (t, s) => {
  let L = s < -0.8 ? 0 : s < -0.4 ? 1 : s < 0.2 ? 2 : s < 0.62 ? 3 : 4;
  if (s < -0.8 && (t < 0.22 || t > 0.9)) L = 1;
  if (t < 0.2) L += 1; else if (t < 0.34) L += 0.0; else if (t > 0.82) L -= 1;
  return Math.max(0, Math.round(L)) + bias;
};
// banded fire hair (Huskar-streamer style): hard-edged bands ALONG the length, dark red roots -> red-orange -> orange -> yellow -> hot tip;
// the lit (left) edge steps one band hotter, the far edge one band darker
export const fireLv = (bias = 0) => (t, s) => {
  let L = t < 0.15 ? 4 : t < 0.32 ? 3 : t < 0.54 ? 2 : t < 0.78 ? 1 : 0;
  if (s > 0.5) L += 1; else if (s < -0.55) L -= 1;
  return Math.max(0, Math.min(4, L)) + bias;
};
// flame-band hair for the swept crown: bands along the length (dark red root -> red-orange -> orange -> yellow -> pale tip), lit upper-left rim one band hotter, far rim one darker, a hotter core stripe
export const flameLv = (bias = 0) => (t, s) => {
  let L = t < 0.15 ? 4 : t < 0.33 ? 3 : t < 0.55 ? 2 : t < 0.8 ? 1 : 0;
  if (s < -0.55) L -= 1; else if (s > 0.5) L += 1; else if (Math.abs(s) < 0.22 && t > 0.3 && L > 1) L -= 1;
  return Math.max(0, Math.min(4, L)) + bias;
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
export const FACE = { D: '#3c1830', L: ['skin', 0], l: ['skin', 1], s: ['skin', 2], d: ['skin', 3], Z: ['skin', 4], k: '#3c1830', B: '#8a2a34', a: '#ff9a28', A: '#e06a18', w: '#fff0d4', n: ['skin', 3], m: '#8c2c46', p: '#f27a78', c: '#f08e80', g: '#ffe268', G: '#c47c26', r: { hex: '#ff5a38', em: 0.5 } };

export const FACE2 = { ...FACE, P: '#2a0e24', b: '#5a1428', B: '#9a2630', h: '#ffffff', a: '#ffb030', A: '#f07a1c', q: '#f8907c', n: ['skin', 3] };
// two overlapping gold plates over a shoulder (dir -1 = viewer-left, +1 = right), dark line between, tiny gem
function layeredShoulder(cv, x, y, dir) {
  const over = (m) => onlyOn(cv, m, 'skin');
  goldPlate(cv, over(ell(x, y - 1.4, 4.7, 2.7)));
  goldPlate(cv, over(ell(x + dir * 1.8, y + 1.2, 3.1, 1.9)));
}
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
export function spineAt(pts, t) {
  const P = [pts[0], ...pts, pts[pts.length - 1]], segs = pts.length - 1, u = Math.min(segs - 1e-6, t * segs), k = Math.floor(u), f = u - k;
  const [a, b, c, d] = [P[k], P[k + 1], P[k + 2], P[k + 3]];
  return [0, 1].map(q => 0.5 * ((2 * b[q]) + (-a[q] + c[q]) * f + (2 * a[q] - 5 * b[q] + 4 * c[q] - d[q]) * f * f + (-a[q] + 3 * b[q] - 3 * c[q] + d[q]) * f * f * f));
}
// a hair ribbon with flame forks splitting off its length: forks = [[t, angleDeg, len, width]]
export function ribbon(cv, X, pts, w, b, forks = [], o = {}) {
  cv.paintT(tongue(X(pts), w, { pow: o.pow ?? 0.75, bulge: 0.15, lit: !!o.flame }), 'hair', (o.flame ? flameLv : o.lv || hairLv)(b), { line: 4 });
  for (const [t, ang, len, fw] of forks) {
    const p0 = spineAt(pts, t), p1 = spineAt(pts, Math.min(1, t + 0.04)), dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dx, dy) || 1;
    const a = ang * Math.PI / 180, ux = (dx * Math.cos(a) - dy * Math.sin(a)) / L, uy = (dx * Math.sin(a) + dy * Math.cos(a)) / L;
    const q1 = [p0[0] + ux * len * 0.5, p0[1] + uy * len * 0.5], q2 = [p0[0] + ux * len + (ang < 0 ? -0.5 : 0.5), p0[1] + uy * len - 0.12 * len];
    cv.paintT(tongue(X([p0, q1, q2]), fw, { pow: 0.85, lit: !!o.flame }), 'hair', (o.flame ? flameLv : o.lv || hairLv)(o.flame ? b - 2 : b), { line: o.flame ? null : 4 });
  }
}
// hot hair pixels glow a little (emit); everything else stays dark
export function hairGlow(cv) { for (const p of cv.px) if (p && p.ramp === R.hair && p.lv === 0) p.em = 0.35; }
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
export const sparkles = (cv, list) => { for (const [x, y, c, em] of list) cv.dot(x, y, c, em ?? 0); };
export const cross = (cv, x, y, c = '#fff6b8') => { for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) cv.dot(x + dx, y + dy, c, dx || dy ? 0.3 : 0.8); };
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
// cloth panel + gold hem trim: a continuous 1px staircase along the lower edge (both edges of the lowest tip, o.px px each way), orphans dropped
function pan(cv, pts, ramp, fold, o = {}) {
  const m = panel(cv, pts, ramp, fold, o);
  let lo = 0; pts.forEach((p, i) => { if (p[1] > pts[lo][1]) lo = i; });
  const tipY = pts[lo][1], reach = o.px ?? 10, n = pts.length;
  const edge = mkm();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[I(x, y)] && !(y + 1 < H && m[I(x, y + 1)]) && Math.abs(x - pts[lo][0]) + (tipY - y) * 0.6 <= reach && y >= tipY - reach * 0.9) edge[I(x, y)] = 1;
  // drop orphans (no 8-neighbour in the trim)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (edge[I(x, y)]) { let c = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && edge[I(x + dx, y + dy)]) c++; if (!c) edge[I(x, y)] = 0; }
  cv.paint(edge, 'gold', { mode: (x, y, a2, b2) => (x < pts[lo][0] ? 1 : 2) });
  cv.ao(m, 2, 1, 1, p => p.ramp === R.red || p.ramp === R.orange || p.ramp === R.skin);
  return m;
}
// bevelled gold plate: lit top-left, shade bottom-right, 1px dark separation line against whatever lies beneath
function goldPlate(cv, m, o = {}) {
  const prev = mkm(); for (let i = 0; i < W * H; i++) if (cv.px[i] && cv.px[i].ramp === R.gold) prev[i] = 1;
  cv.paint(m, 'gold', { line: null, mode: (x, y, a, b) => (a === 1 ? 1 : b === 1 ? 3 : 2), ...o });
  let best = null; // specular pixel at the top-left corner
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[I(x, y)]) { if (!best || x + y < best[0] + best[1]) best = [x, y]; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[I(x, y)]) {
    let touch = false; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H && !m[I(X, Y)] && prev[I(X, Y)]) touch = true; }
    if (touch) cv.px[I(x, y)] = { ...cv.px[I(x, y)], lv: 5, hex: R.gold[5] };
  }
  if (best) { const p = cv.px[I(best[0], best[1])]; if (p && p.lv !== 5) cv.px[I(best[0], best[1])] = { ...p, lv: 0, hex: R.gold[0] }; }
}
const plate = (cv, pts, o = {}) => goldPlate(cv, poly(pts), o);
// hand-placed highlight / shade streak along a limb axis a->b, offset perpendicular toward (off>0) the upper-left light; skin only
function streak(cv, a, b, off, lv, t0 = 0, t1 = 1) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; let nx = -dy / L, ny = dx / L; if (nx + ny > 0) { nx = -nx; ny = -ny; }
  const seen = new Set();
  for (let t = t0; t <= t1; t += 0.5 / L) { const x = Math.floor(a[0] + dx * t + nx * off), y = Math.floor(a[1] + dy * t + ny * off), key = x + ',' + y; if (seen.has(key)) continue; seen.add(key); const p = cv.at(x, y); if (p && p.ramp === R.skin && !p.ol) cv.px[I(x, y)] = { ...p, lv, hex: R.skin[lv] }; }
}
// 2x2 gem
const GEM = { a: '#ffc0a8', b: { hex: '#ff4a40', em: 0.5 }, c: '#a81c3c' };
const gem = (cv, x, y, kind = 0) => cv.stamp(Math.round(x), Math.round(y), ['ab', 'bc'], kind ? { a: '#fff6b8', b: { hex: '#ffc43c', em: 0.5 }, c: '#c47c26' } : GEM);
// hand-placed skin clusters: list of [x, y, level]; only over skin pixels
const hl = (cv, list) => { for (const [x, y, lv] of list) { const p = cv.at(x, y); if (p && p.ramp === R.skin) cv.px[I(x, y)] = { ...p, lv, hex: R.skin[lv] }; } };
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
  const dir = toeX < top[0] ? -1 : 1;
  goldPlate(cv, and(rect(sx - 1, cuffY + 3, sx + 1, cuffY + 4), m));                              // strap buckle
  cv.stamp(sx, cuffY + 4, ['p'], { p: R.boot[5] }, { only: true });                               // buckle pin
  cv.stamp(sx - dir, cuffY + 7, ['g.g'], { g: G_.g }, { only: true }); cv.stamp(sx - dir, cuffY + 9, ['g.g'], { g: G_.g }, { only: true });   // lacing studs
  for (const [ox, oy, l2] of [[3, 96, 0], [4, 96, 1], [3, 97, 1], [5, 97, 2]]) { const q = cv.at(Math.round(toeX) - dir * ox, oy); if (q && q.ramp === R.boot) cv.px[I(Math.round(toeX) - dir * ox, oy)] = { ...q, lv: Math.max(0, l2 + bi), hex: R.boot[Math.max(0, l2 + bi)] }; }   // toe highlight
  cv.stamp(Math.round(toeX) - dir * 1, 100, ['g'], { g: G_.g }, { only: true });                // toe-cap rivet
  { const hx = Math.round(toeX) - dir * 9; for (let yy = 96; yy <= 99; yy++) { const q = cv.at(hx, yy); if (q && q.ramp === R.boot) cv.px[I(hx, yy)] = { ...q, lv: 4 + bi > 5 ? 5 : 4 + bi, hex: R.boot[Math.min(5, 4 + bi)] }; } }   // heel seam
  // flared cuff: 1px wider than the shaft (gold) + shade line below
  cv.ao(cuff, 0, 1, 1, p => p.ramp === R.boot);
  return m;
}

// ================================================================= FRONT (s)
views.s = () => {
  const cv = new Cv();
  const P = (m, r, o) => cv.paint(m, r, o);
  // contrapposto: shoulders cant (cast-side shoulder up) and untwist toward the hips; the head tips the other way, weight on the hip-hand leg
  const TH = -0.085, pvx = 43, pvy = 58;
  const ang = y => (y <= 54 ? TH : y >= 64 ? 0 : TH * (1 - (y - 54) / 10));
  const U = ([x, y]) => { const a = ang(y), c = Math.cos(a), s = Math.sin(a); return [pvx + (x - pvx) * c - (y - pvy) * s, pvy + (x - pvx) * s + (y - pvy) * c]; };
  const Up = pts => pts.map(U);
  const uc = (a, ra, b, rb) => cap(...U(a), ra, ...U(b), rb);
  const ue = (x, y, rx, ry, rot = 0) => ell(...U([x, y]), rx, ry, rot + ang(y));
  const HT = 0.2, nx = 44.5, ny = 38;                                   // head tilt (top leans toward the cast side)
  const Hd = ([x, y]) => [nx + (x - nx) * Math.cos(HT) - (y - ny) * Math.sin(HT), ny + (x - nx) * Math.sin(HT) + (y - ny) * Math.cos(HT)];
  const HU = pts => pts.map(p => U(Hd(p)));
  const FR = { flame: true };

  // ---- hair, back layers: swept flame crown (tips lean toward the cast side, long streamer trails out-left), gaps between the tongues
  cv.paint(ell(...U(Hd([45, 28])), 9, 7, 0), 'hair', { bias: 1, line: null });
  ribbon(cv, HU, [[39, 29], [31, 27], [23, 29], [18, 36]], 4.6, 1, [[0.5, -40, 6, 2]], FR);
  ribbon(cv, HU, [[40, 27], [34, 20], [31, 13], [24, 8]], 5.2, 1, [[0.55, 36, 6, 2.2]], FR);
  ribbon(cv, HU, [[52, 28], [58, 24], [63, 21], [69, 22]], 3.8, 1, [], FR);
  ribbon(cv, HU, [[51, 26], [57, 19], [61, 12], [67, 7]], 5.2, 1, [[0.5, -38, 6, 2.2]], FR);
  ribbon(cv, HU, [[43, 26], [39, 18], [41, 10], [36, 3]], 4.8, 0, [], FR);
  ribbon(cv, HU, [[47, 26], [47, 17], [52, 10], [51, 1]], 5.4, 0, [[0.4, 38, 6, 2]], FR);

  // ---- skirt back layer (deep plum interior), legs, boots, panels
  P(poly([[35, 60], [52, 60], [59, 70], [64, 78], [59, 79], [56, 84], [47, 80], [40, 85], [32, 81], [26, 84], [28, 70]]), 'red', { bias: 3, line: null });
  P(cap(38, 64, 4.9, 37, 78, 3.9), 'skin'); P(cap(37, 78, 3.7, 36, 92, 3.1), 'skin');          // weight leg: straight under the hip
  P(cap(50, 64, 4.9, 58, 77, 3.9), 'skin'); P(cap(58, 77, 3.7, 63, 92, 3.1), 'skin');          // free leg: knee out, foot turned out
  { const T1 = [[38, 64], [37, 78], [36, 92]], T2 = [[50, 64], [58, 77], [63, 92]];
    cv.__legs = [T1, T2]; }
  boot(cv, [35.4, 85], [35.2, 94], [[27, 95], [32, 94], [39, 95], [42, 99], [41, 102], [25, 102], [24, 98]]);
  boot(cv, [63.2, 85], [64.2, 94], [[71, 95], [66, 94], [59, 95], [56, 99], [57, 102], [73, 102], [74, 98]]);
  pan(cv, [[36, 60], [43, 60], [41, 69], [36, 75], [28, 82], [27, 75], [31, 67]], 'red', [[39, 60], [29, 80]], { bias: 1 });
  pan(cv, [[51, 60], [45, 60], [47, 68], [53, 73], [62, 78], [62, 71], [58, 65]], 'red', [[49, 60], [60, 76]], { sh: 2.2, bias: 1 });
  pan(cv, [[40, 60], [45, 60], [44, 72], [38, 81], [36, 73]], 'red', [[43, 60], [38, 81]], { bias: 2 });
  pan(cv, [[48, 60], [43, 60], [44, 72], [51, 80], [54, 72]], 'red', [[44, 60], [51, 80]], { bias: 2, sh: 1.2 });
  pan(cv, [[41, 60], [47, 60], [47, 73], [45, 85], [44, 88], [43, 85], [41, 73]], 'orange', [[44, 60], [44, 88]]);

  for (const T of cv.__legs) { streak(cv, T[0], T[1], 2.0, 0, 0.25, 0.8); streak(cv, T[1], T[2], 1.6, 0, 0.05, 0.6); streak(cv, T[0], T[1], -2.6, 4, 0.2, 1); streak(cv, T[1], T[2], -2.3, 4, 0.0, 0.9); }
  // ---- torso (narrow waist, bust, hips)
  P(poly(Up([[31, 44], [35, 41], [53, 41], [58, 43], [54, 49], [51, 53], [49, 57], [52, 63], [36, 63], [39, 57], [37, 53], [34, 49]])), 'skin', { line: 4 });
  // bodice: two cups, dark plum crease, layered gold plates (neckline, under-bust band in three plates), halter straps, gem
  const cupL = poly(Up([[35.5, 46], [43.2, 45.4], [43.6, 50], [41, 53.4], [37.4, 52.2], [35.6, 49]]));
  const cupR = poly(Up([[44.8, 45.4], [52.4, 46], [52.4, 49], [50.6, 52.2], [47.4, 53.4], [44.4, 50]]));
  P(cupL, 'red', { line: 4, mode: (x, y, a, b) => (a === 1 ? 0 : b === 1 ? 3 : b < 3 ? 2 : 1) }); P(cupR, 'red', { line: 4, mode: (x, y, a, b) => (a === 1 ? 1 : b === 1 ? 4 : b < 3 ? 3 : 2) });
  cv.ao(or(cupL, cupR), 0, 1, 1, p => p.ramp === R.skin);
  band(cv, 'gold', and(or(cupL, cupR), poly(Up([[33, 43], [55, 43], [55, 46.6], [47, 46.6], [44, 49.6], [41, 46.6], [33, 46.6]]))));   // neckline trim
  plate(cv, Up([[36.4, 52.6], [41.4, 54.4], [41.2, 56.4], [36.8, 54.8]]));                           // under-bust band: three plates
  plate(cv, Up([[51.6, 52.6], [46.6, 54.4], [46.8, 56.4], [51.2, 54.8]]));
  plate(cv, Up([[41.4, 53.8], [44, 53.2], [46.6, 53.8], [47, 56.6], [44, 57.8], [41, 56.6]]));
  { const c = U([43.5, 49]); gem(cv, c[0] - 0.5, c[1] - 1); }
  // belt: leather band, layered hip plates, central buckle plate + gem, dark plate lines
  const belt = poly([[36, 56.2], [52, 57.6], [53.6, 62], [34.4, 60.6]]);
  P(belt, 'boot', { line: 4, bias: 0, mode: (x, y, a, b) => (a === 1 ? 2 : b === 1 ? 4 : 3) });
  plate(cv, [[34, 57.4], [37.6, 57.6], [37.4, 61.8], [34.4, 61.2]]);
  plate(cv, [[36.6, 56.8], [40.6, 57.1], [40.4, 61.6], [37, 61.4]]);
  plate(cv, [[52.2, 58.4], [48.4, 58], [48.6, 62.4], [52.4, 62.4]]);
  plate(cv, [[49.6, 57.6], [46.4, 57.3], [46.6, 62], [49.8, 62]]);
  plate(cv, [[41, 56.4], [47, 57], [47.8, 61], [44.2, 63.4], [40.6, 61]]);
  gem(cv, 43, 58.4);
  // sash end hanging from the left hip + front tabard strip
  P(poly([[35, 61], [39.6, 61.4], [38.8, 71], [36.4, 80], [35.4, 76], [33.6, 72]]), 'orange', { line: 4, mode: (x, y, a, b) => (a === 1 ? 1 : b === 1 ? 3 : 2) });
  plate(cv, [[34.6, 76.8], [36.4, 80.6], [37.6, 76.4], [36.6, 75.4]], { });

  // ---- neck + head (tilted)
  P(poly(Up([[42, 36], [47, 36], [47, 42], [42, 42]])), 'skin');
  const headM = ell(...U(Hd([45, 31])), 6.2, 7.7, ang(31) + HT); P(headM, 'skin', { line: 4 }); cv.ao(headM, 0, 2, 1, p => p.ramp === R.skin);
  const HC = U(Hd([45, 31]));

  // ---- arms
  const A1 = [[31, 45], [22, 54], [31, 61]], A2 = [[57, 44], [66, 50], [69, 40]];
  P(ue(31, 45, 4.2, 4.2), 'skin', { line: 4 }); P(ue(57, 44, 4.2, 4.2), 'skin', { line: 4 });
  limb(cv, U(A1[0]), U(A1[1]), U(A1[2]), 3.6, 3.0, 2.5); limb(cv, U(A2[0]), U(A2[1]), U(A2[2]), 3.6, 3.0, 2.6);
  P(ue(31, 61.5, 3.0, 2.7), 'skin', { line: 4 });                 // fist on hip
  P(ue(69, 39.5, 3.2, 3.0), 'skin', { line: 4 });                 // open hand
  gold(cv, U(A1[0]), U(A1[1]), U(A1[2])); gold(cv, U(A2[0]), U(A2[1]), U(A2[2]));
  layeredShoulder(cv, ...U([31, 44]), -1); layeredShoulder(cv, ...U([57, 43]), 1);
  { const A = A1.map(U), B = A2.map(U);
    streak(cv, A[0], A[1], 1.6, 0, 0.35, 0.8); streak(cv, A[1], A[2], 1.5, 0, 0.1, 0.4); streak(cv, A[0], A[1], -1.9, 4, 0.3, 0.9); streak(cv, A[1], A[2], -1.7, 4, 0.3, 0.8);
    streak(cv, B[0], B[1], 1.6, 0, 0.3, 0.8); streak(cv, B[1], B[2], 1.5, 0, 0.1, 0.5); streak(cv, B[0], B[1], -1.9, 4, 0.3, 0.9); streak(cv, B[1], B[2], -1.7, 4, 0.2, 0.8);
    streak(cv, U([36, 43]), U([52, 43]), 0.5, 0, 0.2, 0.45); }
  { const st = U([44, 58.4]); }

  // ---- hair front: side-swept fringe, locks framing the face
  for (const [pts, w, b] of [
    [[[37, 24], [34, 32], [33, 40], [35, 48]], 3.0, 0],
    [[[53, 24], [55, 32], [56, 39]], 2.8, 0],
    [[[39, 18], [43, 20], [48, 23.5]], 3.0, 0],
  ]) cv.paintT(tongue(HU(pts), w, { pow: 0.7, lit: true }), 'hair', flameLv(b), { line: 4 });

  // ---- face (hand-placed 13x16 grid, open eyes, raised far brow, smirk), sheared by the head tilt
  const FG = [
    '.............',
    '..LLllllllss.',
    '.LLlllllllsss',
    '.lllllllBBBss',
    '.lBBBBlBlllBs',
    '.lllllllkkkks',
    '.bkkkkllwAPws',
    '.lwAPwllsaass',
    '.lsaasLdlllls',
    '.lccllLdllcls',
    '.lllllnnllsss',
    '.llllllllllms',
    '.lllmmmmmmmss',
    '.llllpqpllsss',
    '..lllllllddss',
    '...llllllldss.',
  ];
  FG[15] = '...lllllldss.'; 
  FG.forEach((row, j) => { const sh = -Math.round((j - 7.5) * 0.12 * 1.0); cv.stamp(Math.round(HC[0]) - 6 + sh, Math.round(HC[1]) - 8 + j, [row], FACE2, { onlySkin: true }); });
  { const nk = U([44, 42]); cv.stamp(Math.round(nk[0]) - 3, Math.round(nk[1]) - 1, ['gggggg', '.g..g.', '..rr..'], FACE, { only: true }); }

  const w0 = U([69, 36]);
  wisp(cv, Math.round(w0[0]), Math.round(w0[1]), 1, 0);
  { const hh = U([69, 39.5]); fingers(cv, hh[0], hh[1]); const fs_ = U([31, 61.5]); knuckles(cv, fs_[0], fs_[1]); }
  cross(cv, Math.round(w0[0]) + 6, Math.round(w0[1]) - 12); sparkles(cv, [[62, 28, '#ffc43c'], [71, 19, '#ff8a26'], [65, 21, '#fff0a0'], [75, 33, '#ff8a26'], [24, 16, '#ff8a26'], [14, 28, '#ffc43c']]);

  hairGlow(cv);
  cv.fillHoles();
  cv.outline();
  return cv;
};

// ================================================================= 3/4 FRONT (se): turned to screen-right, raised arm is the far one
views.se = () => {
  const cv = new Cv();
  const P = (m, r, o) => cv.paint(m, r, o);
  const TH = -0.075, pvx = 44, pvy = 58;
  const ang = y => (y <= 54 ? TH : y >= 64 ? 0 : TH * (1 - (y - 54) / 10));
  const Sx = ([x, y]) => [46 + (x - 46) * 0.9, y];                         // 3/4 turn: the torso is narrower
  const U0 = ([x, y]) => { const a = ang(y), c = Math.cos(a), s = Math.sin(a); return [pvx + (x - pvx) * c - (y - pvy) * s, pvy + (x - pvx) * s + (y - pvy) * c]; };
  const U = p => U0(Sx(p));
  const Up = pts => pts.map(U);
  const ue = (x, y, rx, ry, rot = 0) => ell(...U([x, y]), rx, ry, rot + ang(y));
  const HT = 0.13, nx = 45.5, ny = 38;
  const Hd = ([x, y]) => [nx + (x - nx) * Math.cos(HT) - (y - ny) * Math.sin(HT), ny + (x - nx) * Math.sin(HT) + (y - ny) * Math.cos(HT)];
  const HU = pts => pts.map(p => U0(Hd(p)));
  const FR = { flame: true };

  // hair: crown sweeping up/back-left in tongues, a long streamer trailing back-left, flicks toward the cast side (right)
  cv.paint(ell(...U0(Hd([45, 28])), 9, 7, 0), 'hair', { bias: 1, line: null });
  ribbon(cv, HU, [[40, 31], [32, 34], [24, 39], [18, 48]], 4.6, 1, [[0.5, 38, 7, 2.2]], FR);
  ribbon(cv, HU, [[41, 27], [34, 21], [28, 13], [21, 9]], 5.2, 1, [[0.55, 36, 6, 2.2]], FR);
  ribbon(cv, HU, [[50, 27], [57, 23], [62, 18], [68, 16]], 3.8, 1, [], FR);
  ribbon(cv, HU, [[44, 26], [41, 17], [43, 9], [38, 2]], 5.0, 0, [], FR);
  ribbon(cv, HU, [[47, 25], [50, 17], [55, 10], [54, 1]], 5.2, 0, [[0.4, 38, 6, 2]], FR);

  // far (raised) arm first, so the torso overlaps its shoulder
  const A2 = [[53, 45], [62, 49], [66, 40]];
  limb(cv, U(A2[0]), U(A2[1]), U(A2[2]), 3.5, 3.0, 2.6, { bias: 0 });
  P(ue(66, 39.5, 3.2, 3.0), 'skin', { line: 4 });
  gold(cv, U(A2[0]), U(A2[1]), U(A2[2]));

  // skirt back layer (deep plum) + legs + boots + panels
  P(poly([[36, 60], [52, 60], [60, 70], [65, 79], [59, 80], [56, 85], [47, 81], [40, 86], [31, 82], [24, 86], [27, 70]]), 'red', { bias: 3, line: null });
  const T1 = [[39, 64], [37, 78], [36, 92]], T2 = [[49, 64], [57, 77], [60, 92]];
  P(cap(39, 64, 4.9, 37, 78, 3.9), 'skin'); P(cap(37, 78, 3.7, 36, 92, 3.1), 'skin');
  P(cap(49, 64, 4.9, 57, 77, 3.9), 'skin'); P(cap(57, 77, 3.7, 60, 92, 3.1), 'skin');
  for (const T of [T1, T2]) { streak(cv, T[0], T[1], 2.0, 0, 0.25, 0.8); streak(cv, T[1], T[2], 1.6, 0, 0.05, 0.6); streak(cv, T[0], T[1], -2.6, 4, 0.2, 1); streak(cv, T[1], T[2], -2.3, 4, 0, 0.9); }
  boot(cv, [36.4, 85], [36, 94], [[28, 95], [33, 94], [41, 95], [44, 99], [43, 102], [26, 102], [25, 98]]);
  boot(cv, [59.2, 85], [60.2, 94], [[53, 95], [61, 94], [67, 96], [71, 100], [70, 102], [52, 102], [51, 99]]);
  pan(cv, [[37, 60], [44, 60], [42, 69], [36, 75], [26, 84], [26, 76], [31, 67]], 'red', [[41, 60], [26, 84]], { bias: 1 });
  pan(cv, [[50, 60], [45, 60], [47, 68], [54, 73], [63, 79], [62, 71], [57, 65]], 'red', [[48, 60], [62, 78]], { bias: 1 });
  pan(cv, [[41, 60], [46, 60], [45, 72], [39, 82], [37, 73]], 'red', [[44, 60], [39, 82]], { bias: 2 });
  pan(cv, [[48, 60], [43, 60], [45, 72], [53, 81], [55, 72]], 'red', [[46, 60], [53, 81]], { bias: 2 });
  pan(cv, [[43, 60], [49, 60], [50, 73], [48, 86], [47, 89], [46, 86], [44, 73]], 'orange', [[47, 60], [47, 89]]);

  // torso (3/4): narrower, bust pointing right
  P(poly(Up([[34, 44], [38, 41], [52, 41], [55, 43], [53, 49], [51, 53], [50, 57], [52, 63], [38, 63], [40, 57], [38, 53], [36, 49]])), 'skin', { line: 4 });
  const cupL = poly(Up([[37.2, 46], [44.2, 45.4], [44.6, 50], [42, 53.4], [38.8, 52.2], [37.2, 49]]));
  const cupR = poly(Up([[45.8, 45.4], [53.2, 46], [53.2, 49], [51.4, 52.2], [48.4, 53.4], [45.4, 50]]));
  P(cupL, 'red', { line: 4, mode: (x, y, a, b) => (a === 1 ? 0 : b === 1 ? 3 : b < 3 ? 2 : 1) }); P(cupR, 'red', { line: 4, mode: (x, y, a, b) => (a === 1 ? 1 : b === 1 ? 4 : b < 3 ? 3 : 2) });
  cv.ao(or(cupL, cupR), 0, 1, 1, p => p.ramp === R.skin);
  band(cv, 'gold', and(or(cupL, cupR), poly(Up([[35, 43], [56, 43], [56, 46.6], [48, 46.6], [45, 49.6], [42, 46.6], [35, 46.6]]))));
  plate(cv, Up([[37.6, 52.6], [42.4, 54.4], [42.2, 56.4], [37.8, 54.8]]));
  plate(cv, Up([[52.6, 52.6], [47.6, 54.4], [47.8, 56.4], [52.2, 54.8]]));
  plate(cv, Up([[42.4, 53.8], [45, 53.2], [47.6, 53.8], [48, 56.6], [45, 57.8], [42, 56.6]]));
  { const c = U([44.6, 49]); gem(cv, c[0] - 0.5, c[1] - 1); }
  const belt = poly([[38, 56.2], [53, 57.6], [54.6, 62], [36.4, 60.6]]);
  P(belt, 'boot', { line: 4, mode: (x, y, a, b) => (a === 1 ? 2 : b === 1 ? 4 : 3) });
  plate(cv, [[36, 57.4], [39.6, 57.6], [39.4, 61.8], [36.4, 61.2]]);
  plate(cv, [[38.6, 56.8], [42.6, 57.1], [42.4, 61.6], [39, 61.4]]);
  plate(cv, [[53.2, 58.4], [49.8, 58], [50, 62.4], [53.4, 62.4]]);
  plate(cv, [[50.8, 57.6], [47.8, 57.3], [48, 62], [51, 62]]);
  plate(cv, [[43, 56.4], [49, 57], [49.8, 61], [46.2, 63.4], [42.6, 61]]);
  gem(cv, 45, 58.4);
  P(poly([[37, 61], [41.6, 61.4], [40.8, 71], [38.4, 80], [37.4, 76], [35.6, 72]]), 'orange', { line: 4, mode: (x, y, a, b) => (a === 1 ? 1 : b === 1 ? 3 : 2) });
  plate(cv, [[36.6, 76.8], [38.4, 80.6], [39.6, 76.4], [38.6, 75.4]]);

  P(poly(Up([[42, 36], [48, 36], [48, 42], [42, 42]])), 'skin');
  const skull = or(ell(...U0(Hd([46, 31])), 6.2, 7.7, ang(31) + HT), poly([[50.5, 32], [53.4, 34.4], [50.6, 36]].map(p => U0(Hd(p)))));
  P(skull, 'skin', { line: 4 }); cv.ao(skull, 0, 2, 1, p => p.ramp === R.skin);
  const HC = U0(Hd([46, 31]));

  // near (hip) arm
  const A1 = [[35, 45], [25, 53], [34, 61]];
  P(ue(35, 45, 4.2, 4.2), 'skin', { line: 4 });
  limb(cv, U(A1[0]), U(A1[1]), U(A1[2]), 3.6, 3.0, 2.5);
  P(ue(34, 61.5, 3.0, 2.7), 'skin', { line: 4 });
  gold(cv, U(A1[0]), U(A1[1]), U(A1[2]));
  layeredShoulder(cv, ...U([35, 44]), -1); layeredShoulder(cv, ...U([54, 44]), 1);
  { const A = A1.map(U), B = A2.map(U);
    streak(cv, A[0], A[1], 1.6, 0, 0.35, 0.8); streak(cv, A[1], A[2], 1.5, 0, 0.1, 0.4); streak(cv, A[0], A[1], -1.9, 4, 0.3, 0.9); streak(cv, A[1], A[2], -1.7, 4, 0.3, 0.8);
    streak(cv, B[0], B[1], 1.6, 0, 0.3, 0.8); streak(cv, B[1], B[2], 1.5, 0, 0.1, 0.5); streak(cv, B[0], B[1], -1.9, 4, 0.3, 0.9); streak(cv, B[1], B[2], -1.7, 4, 0.2, 0.8); }

  for (const [pts, w, b] of [
    [[[40, 25], [36, 34], [34, 42], [35, 50]], 3.4, 0],
    [[[42, 19], [46, 22], [50, 27]], 3.2, 0],
    [[[51, 25], [53, 31], [53, 36]], 2.4, 0],
  ]) cv.paintT(tongue(HU(pts), w, { pow: 0.7, lit: true }), 'hair', flameLv(b), { line: 4 });

  const FG = [
    '.............',
    '..LLllllllss.',
    '.LLlllllllsss',
    '.lllllllBBBss',
    '.lBBBBlllllss',
    '.lllllllkkkss',
    '.bkkkkllwAPss',
    '.lwAPwllsaass',
    '.lsaasllLdlls',
    '.lccllllLdlcs',
    '.lllllllnnlss',
    '.llllllllllms',
    '.llllmmmmmmss',
    '.lllllpqplsss',
    '..lllllllddss',
    '...llllllldss.',
  ];
  FG.forEach((row, j) => { const sh = -Math.round((j - 7.5) * 0.12); cv.stamp(Math.round(HC[0]) - 6 + sh, Math.round(HC[1]) - 8 + j, [row], FACE2, { onlySkin: true }); });
  { const nk = U([45, 42]); cv.stamp(Math.round(nk[0]) - 3, Math.round(nk[1]) - 1, ['gggggg', '.g..g.', '..rr..'], FACE, { only: true }); }

  const w0 = U([66, 36]);
  wisp(cv, Math.round(w0[0]), Math.round(w0[1]), 1, 0);
  { const hh = U([66, 39.5]); fingers(cv, hh[0], hh[1]); const fs_ = U([34, 61.5]); knuckles(cv, fs_[0], fs_[1]); }
  cross(cv, Math.round(w0[0]) + 6, Math.round(w0[1]) - 12); sparkles(cv, [[60, 27, '#ffc43c'], [68, 19, '#ff8a26'], [62, 20, '#fff0a0'], [72, 33, '#ff8a26'], [16, 22, '#ff8a26'], [12, 40, '#ffc43c']]);

  hairGlow(cv);
  cv.fillHoles();
  cv.outline();
  return cv;
};

// ================================================================= SIDE (e), facing right: near arm = hip arm, far arm raised in front
views.e = () => {
  const cv = new Cv();
  const P = (m, r, o) => cv.paint(m, r, o);
  const I_ = p => p;
  const FR = { flame: true };
  ribbon(cv, I_, [[41, 30], [33, 33], [25, 38], [18, 48]], 4.6, 1, [[0.5, 38, 7, 2.2]], FR);
  ribbon(cv, I_, [[41, 33], [34, 41], [29, 49], [28, 58]], 4.0, 1, [], FR);
  ribbon(cv, I_, [[42, 26], [35, 19], [28, 11], [19, 6]], 5.2, 1, [[0.55, 36, 6, 2.2]], FR);
  ribbon(cv, I_, [[48, 23], [55, 20], [60, 15]], 3.4, 1, [], FR);
  ribbon(cv, I_, [[43, 25], [39, 16], [40, 8], [34, 2]], 5.0, 0, [], FR);
  ribbon(cv, I_, [[46, 23], [48, 15], [53, 9], [52, 1]], 5.0, 0, [[0.4, 38, 6, 2]], FR);
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
  P(poly([[40, 59], [44, 59], [34, 66], [23, 73], [25, 67]]), 'orange', { line: 4, mode: (x, y, a2, b2) => (a2 === 1 ? 1 : b2 === 1 ? 3 : 2) });
  plate(cv, [[22.4, 73.4], [26.2, 69.6], [27.2, 72.6], [24, 75]]);                          // sash tip plate
  P(poly([[40, 56], [49, 56.4], [50, 61], [39, 60.6]]), 'boot', { line: 4, mode: (x, y, a2, b2) => (a2 === 1 ? 2 : b2 === 1 ? 4 : 3) });
  plate(cv, [[38.6, 57], [42.2, 57], [42.4, 61.6], [39, 61.6]]);                            // belt plates, layered
  plate(cv, [[41.4, 56.4], [45.6, 56.6], [45.8, 62], [42, 62]]);
  plate(cv, [[45, 56], [50, 56.6], [50.8, 61.2], [46.4, 62.2]]);
  gem(cv, 47, 58);
  plate(cv, [[40, 52.4], [44.2, 54], [44.4, 56], [40.4, 54.6]]);                            // under-bust plates
  plate(cv, [[44, 54], [49.6, 53.4], [49, 56], [44.4, 56.2]]);
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
  layeredShoulder(cv, 41, 44.5, -1);
  { const T = [[[47, 64], [58, 76], [58, 92]], [[41, 64], [34, 80], [29, 92]]];
    for (const L of T) { streak(cv, L[0], L[1], 2.0, 0, 0.25, 0.8); streak(cv, L[1], L[2], 1.6, 0, 0.05, 0.6); streak(cv, L[0], L[1], -2.6, 4, 0.2, 1); streak(cv, L[1], L[2], -2.3, 4, 0, 0.9); }
    streak(cv, AN[0], AN[1], 1.6, 0, 0.35, 0.8); streak(cv, AN[1], AN[2], 1.5, 0, 0.1, 0.4); streak(cv, AN[0], AN[1], -1.9, 4, 0.3, 0.9); streak(cv, AN[1], AN[2], -1.7, 4, 0.3, 0.8);
    streak(cv, AF[0], AF[1], 1.6, 0, 0.3, 0.8); streak(cv, AF[1], AF[2], 1.5, 0, 0.1, 0.5); streak(cv, AF[0], AF[1], -1.9, 4, 0.3, 0.9); streak(cv, AF[1], AF[2], -1.7, 4, 0.2, 0.8); }
  cv.paintT(tongue([[43, 25], [40, 33], [37, 40], [34, 46]], 3.2, { pow: 0.7, lit: true }), 'hair', flameLv(0), { line: 4 });
  // profile face details (x 44..53, y 25..39)
  cv.stamp(44, 25, [
    '..........',
    '..........',
    '...BBBB...',
    '..........',
    '...kkkk...',
    '...wAP....',
    '..cc......',
    '......ll..',
    '......dd..',
    '.....mm...',
    '.....pp...',
    '..........',
  ], FACE2, { onlySkin: true });
  cv.stamp(41, 29, ['.d.', 'dd.', '.d.'], FACE, { onlySkin: true });
  wisp(cv, 60, 38, 1, 0);
  fingers(cv, 60, 42.5, 1); knuckles(cv, 41, 60.5);
  cross(cv, 66, 26); sparkles(cv, [[56, 29, '#ffc43c'], [63, 22, '#ff8a26'], [58, 21, '#fff0a0'], [67, 34, '#ff8a26']]);

  hairGlow(cv);
  cv.fillHoles();
  cv.outline();
  return cv;
};

