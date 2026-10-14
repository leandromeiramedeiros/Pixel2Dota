// Generates client/src/art/sheets/trees.js  (node tools/art/world/trees.mjs)
import path from 'node:path';
import { Cv, rng, writeSheet, SHEETS, ell, rect, line, union, diff, paint, shEdge, shEll, K, pt, trim, ring, poly } from './lib.mjs';

const pal = {
  // Radiant pine: deep, dark, mid, light, highlight ; outline ; trunk dark/mid/light
  '1': '#0d2616', '2': '#1a4824', '3': '#2a6832', '4': '#3f8a40', '5': '#68b258', 'O': '#0a140c',
  t: '#3a2416', u: '#5a3a22', v: '#7e5632',
  // Dire dead wood: deep, dark, mid, light, highlight ; outline ; dead leaves
  '6': '#1a1315', '7': '#2b2023', '8': '#443439', '9': '#66504f', '0': '#8c746a', P: '#0e090b', r: '#4e1a1a', R: '#843024', y: '#b05a34',
  // stump wood rings
  w: '#c9a06a', W: '#e6c690', z: '#9b7248',
};
const P_R = ['5', '4', '3', '2'], P_D = ['0', '9', '8', '7'];
const frames = {}, anchors = {};
function emitFrame(key, cv, ax, ay) { const t = trim(cv, ax, ay, 0); frames[key] = t.rows; anchors[key] = [Math.floor(t.anchor[0]), Math.round(t.anchor[1])]; }

// ---------- Radiant pine ----------
function pine(seed, o) {
  const W = 34, H = 52, cx = 16.5, r = rng(seed), cv = new Cv(W, H);
  const baseY = H - 2;                    // last trunk row
  // trunk
  const tw = o.trunkW, tx0 = Math.round(cx - tw / 2 + 0.5);
  const trunk = rect(tx0, baseY - o.trunkH, tx0 + tw - 1, baseY);
  paint(cv, trunk, (x, y) => (x === tx0 ? 'v' : x === tx0 + tw - 1 ? 't' : 'u'), 'O');
  cv.set(tx0 - 1, baseY, 'O'); cv.set(tx0 + tw, baseY, 'O'); cv.set(tx0 - 1, baseY - 1, 'u'); cv.set(tx0 + tw, baseY - 1, 't'); // root flare
  cv.set(tx0 - 1, baseY - 1, 'u'); cv.set(tx0 + tw, baseY - 1, 't');
  // tiers: draw bottom first so upper boughs overlap
  const n = o.tiers, top0 = baseY - o.trunkH - o.canopyH + 4, bot = baseY - o.trunkH + 3;
  const tierH = o.tierH, step = (bot - top0 - tierH) / (n - 1);
  for (let i = n - 1; i >= 0; i--) {
    const top = Math.round(top0 + i * step), bottom = top + tierH, hwMax = o.hwTop + (o.hwBot - o.hwTop) * (i / (n - 1));
    const m = new Set();
    for (let y = top; y <= bottom; y++) {
      const t = (y - top) / (bottom - top);
      const half = Math.max(0.5, hwMax * (0.1 + 0.9 * Math.pow(t, 0.85)));
      let l = Math.round(cx - half + (r() < 0.3 ? 0.6 : 0)), rr = Math.round(cx + half - (r() < 0.3 ? 0.6 : 0));
      if (y >= bottom - 1) { l += 1; rr -= 1; }
      for (let x = l; x <= rr; x++) { if (y === bottom && ((x + i * 2) % 3 === 0)) continue; m.add(K(x, y)); }
    }
    // scalloped drip below the bottom row
    for (const k of [...m]) { const [x, y] = pt(k); if (y === bottom - 1 && ((x + seed) % 4 === 0)) m.add(K(x, y + 1)); }
    const hw = hwMax;
    paint(cv, m, (x, y) => {
      const u = (x - cx) / hw, t = (y - top) / (bottom - top);
      let v = -0.95 * u + (0.5 - t) * 1.05;
      if (!m.has(K(x, y + 1))) return '1';                   // underside shadow
      if (!m.has(K(x, y + 2)) && v < 0.9) return '2';
      const th = [0.75, 0.15, -0.5];
      let lv = v > th[0] ? 0 : v > th[1] ? 1 : v > th[2] ? 2 : 3;
      for (let k = 0; k < 3; k++) if (Math.abs(v - th[k]) < 0.14) { lv = ((x + y) & 1) ? k + 1 : k; break; }
      return P_R[lv];
    }, 'O', true);
  }
  // sprinkle highlights / speckles on the lit side
  for (let k = 0; k < 10; k++) { const x = Math.round(cx - 8 * r()), y = Math.round(top0 + 3 + r() * (bot - top0 - 8)); if (['4', '3'].includes(cv.get(x, y))) cv.set(x, y, '5'); }
  return cv;
}
const pineCfg = [
  { trunkW: 4, trunkH: 7, canopyH: 38, tiers: 4, tierH: 14, hwTop: 5.5, hwBot: 12 },
  { trunkW: 5, trunkH: 6, canopyH: 32, tiers: 3, tierH: 16, hwTop: 7, hwBot: 13.5 },
  { trunkW: 4, trunkH: 6, canopyH: 42, tiers: 5, tierH: 13, hwTop: 4.5, hwBot: 10 },
];
for (let i = 0; i < 3; i++) { const cv = pine(10 + i, pineCfg[i]); emitFrame('tree_r_' + i, cv, 16.5, 50); }

// round leafy variant (bushy broadleaf), tree_r_3
{
  const W = 34, H = 52, cx = 16.5, r = rng(77), cv = new Cv(W, H), baseY = H - 2;
  const trunk = union(rect(14, baseY - 14, 18, baseY), rect(15, baseY - 20, 17, baseY - 13));
  paint(cv, trunk, (x, y) => (x === 14 || (y < baseY - 13 && x === 15) ? 'v' : x >= 17 ? 't' : 'u'), 'O');
  cv.set(13, baseY, 'O'); cv.set(19, baseY, 'O'); cv.set(13, baseY - 1, 'u'); cv.set(19, baseY - 1, 't');
  const blobs = [[16.5, 16, 9.5, 8], [9.5, 22, 7.5, 6.5], [23.5, 22, 7.5, 6.5], [16.5, 26, 9.5, 6.5], [12, 12, 6, 5.5], [21.5, 13, 6, 5.5]];
  const all = new Set();
  for (const [bx, by, rx, ry] of blobs) for (const k of ell(bx, by, rx, ry)) all.add(k);
  // draw back-to-front by blob so each lobe keeps its own shading + outline
  for (const [bx, by, rx, ry] of blobs.slice().sort((a, b) => b[1] - a[1])) {
    const m = ell(bx, by, rx, ry);
    paint(cv, m, (x, y) => { const f = shEll(bx, by, rx, ry, P_R, 0.18)(x, y); return f; }, 'O', true);
  }
  for (let k = 0; k < 14; k++) { const x = Math.round(6 + r() * 22), y = Math.round(8 + r() * 24); if (cv.get(x, y) === '4') cv.set(x, y, '5'); if (cv.get(x, y) === '3' && r() < 0.5) cv.set(x, y, '2'); }
  emitFrame('tree_r_3', cv, 16.5, 50);
}

// ---------- Dire dead trees ----------
function limb(m, x0, y0, x1, y1, w) { for (const k of line(x0, y0, x1, y1, w)) m.add(k); }
function dead(seed, spec) {
  const W = 36, H = 54, r = rng(seed), cv = new Cv(W, H), baseY = H - 2, cx = 18;
  const m = new Set(); const tips = [];
  // trunk as a wobbling polyline from base up
  let x = cx, y = baseY; const segs = spec.trunk; let w = spec.w0;
  for (let i = 0; i < segs.length; i++) { const [dx, dy] = segs[i]; const nx = x + dx, ny = y - dy; limb(m, x, y, nx, ny, Math.max(1, w)); x = nx; y = ny; w = Math.max(1, w - spec.taper); }
  // flared base
  limb(m, cx - 3, baseY, cx - 1, baseY - 3, 2); limb(m, cx + 3, baseY, cx + 1, baseY - 3, 2); for (const k of rect(cx - 2, baseY - 2, cx + 2, baseY)) m.add(k);
  // branches: [fromSeg, dx, dy, w, [sub branches [t, dx, dy]]]
  const pts = [[cx, baseY]]; { let px = cx, py = baseY; for (const [dx, dy] of segs) { px += dx; py -= dy; pts.push([px, py]); } }
  for (const [si, dx, dy, bw, subs] of spec.branches) {
    const [bx, by] = pts[Math.min(si, pts.length - 1)]; const ex = bx + dx, ey = by - dy;
    limb(m, bx, by, ex, ey, bw); tips.push([ex, ey]);
    for (const [t, sdx, sdy] of subs || []) { const sx = Math.round(bx + dx * t), sy = Math.round(by - dy * t); limb(m, sx, sy, sx + sdx, sy - sdy, 1); tips.push([sx + sdx, sy - sdy]); }
  }
  tips.push(pts[pts.length - 1]);
  const lit = shEdge(P_D);
  paint(cv, m, (px, py, mm) => {
    let c = lit(px, py, mm);
    if (c === '8' && ((px * 3 + py * 5) % 7 === 0)) c = '7';          // bark grain
    return c;
  }, 'P');
  // knotholes / cracks
  for (let k = 0; k < 5; k++) { const kx = cx - 2 + Math.floor(r() * 5), ky = baseY - 6 - Math.floor(r() * 14); if (cv.get(kx, ky) === '8' || cv.get(kx, ky) === '9') { cv.set(kx, ky, '6'); cv.set(kx, ky + 1, '6'); } }
  // foliage clumps (dead leaves)
  if (spec.leaves) for (const [lx, ly, rx, ry] of spec.leaves) {
    const lm = new Set(); for (const k of ell(lx, ly, rx, ry, 1.25)) { const [px, py] = pt(k); const d = ((px - lx) / rx) ** 2 + ((py - ly) / ry) ** 2; if (d < 0.7 || r() < 0.55) lm.add(k); }
    paint(cv, lm, (px, py) => { const v = r(); return py < ly - 0.5 && v < 0.2 ? 'y' : v < 0.45 ? 'r' : 'R'; }, 'P', true);
  }
  // hanging tatters under the clumps
  if (spec.hang) for (const [hx, hy, hl] of spec.hang) for (let i = 0; i < hl; i++) cv.set(hx, hy + i, i === hl - 1 ? 'r' : '9');
  return cv;
}
const deadSpecs = [
  // tall forked
  { w0: 5, taper: 1, trunk: [[0, 8], [-1, 8], [0, 8], [1, 7], [0, 6]], branches: [[2, -9, 8, 3, [[0.6, -4, 4]]], [2, 8, 9, 3, [[0.55, 4, 5], [1, 2, 4]]], [3, -7, 4, 2, []], [4, 6, 4, 2, []], [5, -3, 6, 1, []]] },
  // gnarled, leaning, with leaf clumps
  { w0: 6, taper: 1, trunk: [[1, 7], [2, 7], [1, 7], [-1, 6], [-2, 7]], branches: [[1, -9, 6, 3, [[0.7, -3, 5]]], [3, 10, 5, 3, [[0.5, 3, 5], [1, 2, 5]]], [4, -8, 7, 2, [[1, -2, 4]]], [5, 5, 5, 2, []]], leaves: [[10, 24, 4.5, 3.5], [29, 21, 4, 3]], hang: [[8, 27, 4], [31, 24, 3]] },
  // broken stub with two arms
  { w0: 7, taper: 1, trunk: [[0, 8], [1, 8], [0, 7], [-1, 6]], branches: [[2, -10, 5, 3, [[0.7, -4, 6]]], [2, 9, 8, 3, [[0.6, 4, 3], [1, 0, 5]]], [3, -4, 9, 2, []]] },
  // wide splayed, vine-like
  { w0: 5, taper: 1, trunk: [[-1, 9], [1, 9], [0, 9], [0, 8]], branches: [[1, -10, 4, 3, [[0.6, -3, 5], [1, -1, 5]]], [2, 11, 5, 3, [[0.6, 3, 5], [1, 1, 6]]], [3, -9, 9, 2, [[1, -3, 4]]], [3, 8, 9, 2, [[1, 3, 4]]], [4, 0, 6, 2, []]], leaves: [[10, 36, 3.5, 3], [28, 35, 3.5, 3]] },
];
for (let i = 0; i < 4; i++) emitFrame('tree_d_' + i, dead(30 + i, deadSpecs[i]), 18, 52);

// ---------- stumps ----------
{
  const cv = new Cv(20, 16), cx = 9.5;
  const body = union(rect(5, 6, 14, 12), ell(cx, 12, 5, 2.2));
  paint(cv, rect(5, 6, 14, 12), (x, y) => (x < 7 ? 'v' : x > 12 ? 't' : 'u'), 'O');
  paint(cv, ell(cx, 12, 5, 2.2), (x, y) => (x < 7 ? 'v' : x > 12 ? 't' : 'u'), 'O');
  paint(cv, ell(cx, 6, 5, 2.4), (x, y, m) => { const d = Math.hypot((x - cx) / 5, (y - 6) / 2.4); return d < 0.35 ? 'z' : d < 0.7 ? 'W' : d < 0.95 ? 'w' : 'z'; }, 'O', true);
  cv.set(4, 12, 'O'); cv.set(15, 12, 'O'); cv.set(5, 13, 'u'); cv.set(14, 13, 't'); cv.set(3, 13, 'O'); cv.set(16, 13, 'O');
  cv.set(4, 13, 'v'); cv.set(15, 13, 't'); cv.set(4, 14, 'O'); cv.set(15, 14, 'O'); for (let x = 5; x <= 14; x++) cv.set(x, 14, 'O');
  emitFrame('stump_r', cv, 9.5, 14);
  const d = new Cv(20, 16);
  const tops = [9, 7, 5, 8, 4, 7, 6, 8, 5, 9]; // jagged broken top per column x=5..14
  const sm = new Set(); tops.forEach((t, i) => { for (let y = t; y <= 12; y++) sm.add(K(5 + i, y)); });
  for (const k of ell(cx, 12, 5.2, 2.2)) sm.add(k);
  paint(d, sm, (x, y, m) => { const c = x < 7 ? '9' : x > 12 ? '7' : '8'; if (!m.has(K(x, y - 1))) return x > 11 ? '8' : '0'; return c; }, 'P');
  for (const [x, y] of [[8, 9], [8, 10], [11, 8], [11, 9], [10, 11]]) d.set(x, y, '6'); // grain cracks
  for (let x = 5; x <= 14; x++) d.set(x, 14, 'P'); d.set(4, 13, 'P'); d.set(15, 13, 'P');
  emitFrame('stump_d', d, 9.5, 14);
}

const header = {
  gen: 'tools/art/world/trees.mjs',
  doc: [
    'Trees: tree_r_0..3 (Radiant: 0-2 pines, 3 broadleaf bush), tree_d_0..3 (Dire dead/twisted), stump_r / stump_d (felled tree).',
    'Frames are cropped to their bounding box, so sizes differ: use anchors[key] = [x,y] = trunk base centre (feet). `anchor` is only a fallback.',
    'Pick a variant per tree index: hash(i) % 4 (side from sideOf(x,y)). No emissive pixels. Outline chars: O (Radiant) / P (Dire).',
  ],
};
const bytes = writeSheet(path.join(SHEETS, 'trees.js'), header, { pal, anchor: [16, 40], anchors, frames });
console.log('trees.js', bytes, 'bytes');
for (const k of Object.keys(frames)) console.log(k, frames[k][0].length + 'x' + frames[k].length, anchors[k].join(','));
