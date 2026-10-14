// Generates client/src/art/sheets/buildings.js  (node tools/art/world/buildings.mjs)
import path from 'node:path';
import { Cv, rng, writeSheet, SHEETS, ell, rect, line, poly, union, diff, inter, shift, paint, K, pt, ring, shEll, shX, bbox, outlineAll } from './lib.mjs';

// ---------------- palette ----------------
const pal = {
  // Radiant stone (hi..dark), outline
  W: '#f6f2e6', w: '#dcd6c4', x: '#b3ac96', y: '#857e6e', z: '#5a5548', O: '#231e1a',
  // gold trim
  g: '#fbe08a', G: '#dcae48', h: '#96721f',
  // green crystal body: dark, mid, light ; core pulse levels 0..3 + flash
  c: '#1c6a48', d: '#2ea866', e: '#6ee0a4', '0': '#9af2c0', '1': '#c4fbd8', '2': '#e6fff0', '3': '#fbfff6', '4': '#ffffff',
  // roofs (green tile) and wood
  r: '#2b7a4a', R: '#44a465', s: '#1b5234', b: '#5e4026', B: '#8a6238', n: '#3a2616',
  // Dire rock (hi..deep), outline
  I: '#7a6270', D: '#54424e', E: '#3a2d38', F: '#271e2a', H: '#171220', o: '#09060d',
  // Dire reds: dark, mid ; ember levels 5..9 ; window glow
  a: '#5e1612', A: '#b03020', '5': '#f05a24', '6': '#ff8a30', '7': '#ffb84a', '8': '#ffe08a', '9': '#fff6d0', l: '#ff5a2c',
  // fountain water Radiant (dark, mid, light, glow) / Dire lava (dark, mid, light, glow)
  q: '#10506a', Q: '#1a90a8', T: '#58d4dc', U: '#c0fff8', m: '#7a1c10', M: '#d04018', N: '#ff7a28', V: '#ffd070',
  // misc: shadows / banners / lanterns
  k: '#000000b0', p: '#d8dcff', t: '#6a4a8a', u: '#ffcf5a',
};
const emit = { '0': 1.1, '1': 1.6, '2': 2.2, '3': 2.8, '4': 3.4, e: 0.35, d: 0.12, '5': 1.0, '6': 1.5, '7': 2.0, '8': 2.6, '9': 3.2, l: 1.1, U: 1.5, T: 0.45, N: 1.1, V: 1.8, u: 1.2 };

const frames = {}, anchors = {};
/** register a set of equally-sized frames, cropping to the union bbox so every frame keeps the same anchor */
function reg(name, set, ax, ay) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (const cv of Object.values(set)) for (let y = 0; y < cv.h; y++) for (let x = 0; x < cv.w; x++) if (cv.g[y][x] !== '.') { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  for (const [suffix, cv] of Object.entries(set)) {
    const key = name + '_' + suffix; const rows = [];
    for (let y = y0; y <= y1; y++) { let r = ''; for (let x = x0; x <= x1; x++) r += cv.g[y]?.[x] ?? '.'; rows.push(r); }
    frames[key] = rows; anchors[key] = [ax - x0, ay - y0];
  }
}
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------- shading helpers ----------------
/** stone block shade: left lit -> right dark by x across [xa,xb], brick lines, top-edge highlight. ramp = [hi, light, mid, dark] */
function stone(ramp, xa, xb, seed = 1, brick = true) {
  const r = rng(seed);
  return (x, y, m) => {
    const t = (x - xa) / Math.max(1, xb - xa);
    let i = t < 0.18 ? 0 : t < 0.5 ? 1 : t < 0.82 ? 2 : 3;
    if (brick) {
      if (y % 4 === 3) i = Math.min(3, i + 1);
      else if (((x + (((y >> 2) & 1) * 3)) % 6) === 0) i = Math.min(3, i + 1);
    }
    if (!m.has(K(x, y - 1))) i = Math.max(0, i - 1);
    if (!m.has(K(x, y + 1)) && i < 3) i++;
    const h = ((x * 73856093) ^ (y * 19349663)) >>> 0; if (h % 17 === 0) i = Math.min(3, i + 1); else if (h % 19 === 0) i = Math.max(0, i - 1);
    return ramp[i];
  };
}
const RS = ['W', 'w', 'x', 'y'];      // Radiant stone ramp, 'z' = deepest
const DS = ['I', 'D', 'E', 'F'];      // Dire rock ramp, 'H' deepest
const GOLD = ['g', 'G', 'h', 'h'];

// ---------------- crystals ----------------
/** vertical gem centred at cx, spans cy-hh..cy+hh2; level 0..4 pulses the core. returns nothing, paints into cv */
function gem(cv, cx, cy, hw, hhUp, hhDn, level, o = {}) {
  const pts = [[cx, cy - hhUp], [cx + hw, cy - hhUp * 0.25], [cx + hw * 0.7, cy + hhDn * 0.6], [cx, cy + hhDn], [cx - hw * 0.7, cy + hhDn * 0.6], [cx - hw, cy - hhUp * 0.25]];
  const m = poly(pts);
  const core = (o.cores || ['0', '1', '2', '3', '4'])[level];
  const [cB, cM, cL] = o.body || ['c', 'd', 'e'];
  paint(cv, m, (x, y) => {
    const u = (x - cx) / hw;
    if (u > 0.3) return cB;
    if (u < -0.35) return y < cy - hhUp * 0.2 ? cL : cM;
    return y < cy - hhUp * 0.25 ? cL : cM;
  }, o.outline || 'O');
  // inner core (facet seam), pulses
  const ch = Math.max(2, Math.round(hhUp * 0.6)), cw = hw >= 5 ? 1 : 0;
  for (let y = Math.round(cy - ch * 0.8); y <= Math.round(cy + ch * 0.9); y++) { const f = (y - cy) / ch; const ww = Math.abs(f) < 0.4 ? cw : 0; for (let x = Math.round(cx - ww - 0); x <= Math.round(cx + ww); x++) cv.set(x, y, core); }
  if (level >= 2) { cv.set(cx - 1, cy - ch, cv.get(cx - 1, cy - ch) !== '.' ? core : '.'); }
}
function sparkles(cv, cx, cy, level, ch = '3', seed = 1) {
  const r = rng(seed * 31 + level);
  const n = [0, 2, 4, 6, 8][level];
  for (let i = 0; i < n; i++) { const a = r() * 6.28, d = 8 + r() * 6; const x = Math.round(cx + Math.cos(a) * d), y = Math.round(cy + Math.sin(a) * d * 1.2); if (cv.get(x, y) === '.') cv.set(x, y, ch); }
}

// ---------------- Radiant tower ----------------
function towerR(level, bob = 0, attack = 0) {
  const W = 33, H = 66, cv = new Cv(W, H), cx = 16, by = 62;
  // plinth (two steps)
  paint(cv, rect(cx - 12, by - 3, cx + 12, by), stone(RS, cx - 12, cx + 12, 3, false), 'O');
  paint(cv, rect(cx - 10, by - 6, cx + 10, by - 4), stone(RS, cx - 10, cx + 10, 4, false), 'O');
  // shaft: tapered
  const shaft = poly([[cx - 8, by - 6], [cx - 6.5, 27], [cx + 6.5, 27], [cx + 8, by - 6]]);
  paint(cv, shaft, stone(RS, cx - 8, cx + 8, 5), 'O');
  // gold band + window slits
  for (let x = cx - 8; x <= cx + 8; x++) { const yy = 44; if (shaft.has(K(x, yy))) { cv.set(x, yy, x < cx - 2 ? 'g' : x < cx + 3 ? 'G' : 'h'); cv.set(x, yy + 1, x < cx - 2 ? 'G' : 'h'); } }
  for (const wy of [34, 52]) { cv.set(cx, wy, 'z'); cv.set(cx, wy + 1, 'O'); cv.set(cx, wy + 2, 'O'); cv.set(cx + 1, wy, 'z'); cv.set(cx + 1, wy + 1, 'z'); }
  cv.set(cx, 34, 'O'); cv.set(cx + 1, 34, 'O');
  // arched door
  for (let y = by - 12; y <= by - 7; y++) for (let x = cx - 2; x <= cx + 2; x++) cv.set(x, y, y === by - 12 && (x === cx - 2 || x === cx + 2) ? 'y' : 'O');
  cv.set(cx - 2, by - 12, 'y'); cv.set(cx + 2, by - 12, 'y');
  // capital / platform with battlements
  const cap = rect(cx - 11, 22, cx + 11, 27);
  paint(cv, cap, stone(RS, cx - 11, cx + 11, 6, false), 'O');
  for (let x = cx - 11; x <= cx + 11; x++) { cv.set(x, 23, x < cx - 3 ? 'g' : x < cx + 4 ? 'G' : 'h'); }
  for (const tx of [cx - 11, cx - 5, cx + 2, cx + 8]) { paint(cv, rect(tx, 19, tx + 3, 21), stone(RS, tx, tx + 3, 7 + tx, false), 'O'); }
  // brazier ring (gold) cradling the crystal
  paint(cv, rect(cx - 5, 17, cx + 5, 19), shX(cx - 5, cx + 5, GOLD), 'O');
  // crystal
  const lv = attack ? 4 : level;
  const cy = 8 + bob - (attack ? 0 : 0);
  gem(cv, cx, cy, attack ? 6 : 5, attack ? 9 : 8, 7, lv);
  if (attack) { for (const [dx, dy] of [[-8, -4], [8, -3], [-6, 8], [6, 7], [0, -13]]) { cv.set(cx + dx, cy + dy, '4'); cv.set(cx + dx + (dx < 0 ? -1 : 1), cy + dy, '2'); } }
  else sparkles(cv, cx, cy, level, '2', 1);
  return cv;
}
function rubble(dire, w = 30, h = 14, seed = 5) {
  const cv = new Cv(w, h), r = rng(seed), cx = w / 2;
  const ramp = dire ? DS : RS, deep = dire ? 'H' : 'z', ol = dire ? 'o' : 'O';
  const blocks = [];
  for (let i = 0; i < 9; i++) { const bx = cx + (r() - 0.5) * (w - 8) * (1 - i * 0.04), bw = 3 + Math.floor(r() * 4), bh = 2 + Math.floor(r() * 4); const by = h - 2 - Math.floor(Math.abs(bx - cx) < 6 ? r() * 5 : r() * 2); blocks.push([Math.round(bx), by, bw, bh]); }
  blocks.sort((a, b) => a[1] - b[1]);
  for (const [bx, by, bw, bh] of blocks) paint(cv, rect(bx - (bw >> 1), by - bh, bx - (bw >> 1) + bw, by), (x, y, m) => { const t = (x - (bx - (bw >> 1))) / bw; return !m.has(K(x, y - 1)) ? ramp[0] : t < 0.4 ? ramp[1] : t < 0.8 ? ramp[2] : ramp[3]; }, ol);
  for (let x = 2; x < w - 2; x++) if (cv.get(x, h - 1) === '.' && r() < 0.6) cv.set(x, h - 1, deep);
  if (dire) { for (let i = 0; i < 4; i++) { const x = Math.round(cx - 8 + r() * 16), y = h - 3 - Math.floor(r() * 4); if (cv.get(x, y) !== '.') cv.set(x, y, i & 1 ? '5' : 'a'); } }
  else { for (let i = 0; i < 3; i++) { const x = Math.round(cx - 7 + r() * 14), y = h - 3 - Math.floor(r() * 4); if (cv.get(x, y) !== '.') cv.set(x, y, i & 1 ? 'c' : 'd'); } }
  return cv;
}

// ---------------- Dire tower ----------------
function spikeCol(cv, x, yBase, h, w, ramp, ol = 'o') { // slanted spike (lean = sign of w)
  const lean = w; const m = poly([[x - 2, yBase], [x - 1 + lean * h * 0.18, yBase - h], [x + 2, yBase]]); paint(cv, m, (px, py, mm) => (!mm.has(K(px - 1, py)) ? ramp[1] : mm.has(K(px + 1, py)) ? ramp[2] : ramp[3]), ol);
}
function towerD(level, flick = 0, attack = 0) {
  const W = 35, H = 66, cv = new Cv(W, H), cx = 17, by = 62, r = rng(91);
  // jagged base mound
  const base = poly([[cx - 14, by], [cx - 10, by - 5], [cx - 8, by - 4], [cx + 8, by - 4], [cx + 11, by - 6], [cx + 14, by]]);
  paint(cv, base, (x, y, m) => ((x + y * 3) % 7 === 0 ? 'E' : x < cx - 4 ? 'D' : x < cx + 6 ? 'E' : 'F'), 'o');
  // main column: rows with jittered half-width
  const col = new Set();
  for (let y = 24; y <= by - 3; y++) { const t = (y - 24) / (by - 3 - 24); const hw = 4.5 + t * 4.5 + ((y * 7 + 3) % 5 === 0 ? 1 : 0) + (y % 9 === 0 ? -1 : 0); for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) col.add(K(x, y)); }
  paint(cv, col, (x, y, m) => { const t = (x - (cx - 9)) / 18; let i = t < 0.25 ? 1 : t < 0.55 ? 2 : t < 0.85 ? 3 : 3; if (!m.has(K(x - 1, y))) i = 0; if (((x * 5 + y * 11) % 13) === 0) i = Math.min(4, i + 1); return ['I', 'D', 'E', 'F', 'H'][i]; }, 'o');
  // lava cracks (glow)
  for (const [x, y, l] of [[cx - 1, 54, 2], [cx - 2, 50, 2], [cx, 46, 2], [cx - 1, 42, 3], [cx + 2, 38, 2], [cx + 1, 34, 2], [cx - 3, 36, 1]]) { for (let i = 0; i < l; i++) cv.set(x + (i & 1), y + i, i === 0 ? 'A' : 'l'); }
  // side spikes
  spikeCol(cv, cx - 10, by - 5, 22, -1, ['I', 'D', 'E', 'F']); spikeCol(cv, cx + 10, by - 5, 18, 1, ['I', 'D', 'E', 'F']);
  spikeCol(cv, cx - 7, by - 4, 30, -1, ['I', 'D', 'E', 'F']);
  // claws holding the ember
  for (const [dx, dir] of [[-6, -1], [6, 1], [0, 0]]) { const m = poly([[cx + dx - 1, 26], [cx + dx + dir * 1.5, 14 + (dx === 0 ? 2 : 0)], [cx + dx + 2, 26]]); paint(cv, m, (x, y, mm) => (!mm.has(K(x - 1, y)) ? 'D' : 'F'), 'o'); }
  paint(cv, rect(cx - 7, 24, cx + 7, 27), (x, y, m) => (!m.has(K(x, y - 1)) ? 'I' : x > cx + 3 ? 'F' : 'E'), 'o');
  // ember
  const cy = 12 + (flick === 2 ? -1 : 0);
  const lv = attack ? 4 : level;
  const cores = ['5', '6', '7', '8', '9'];
  gem(cv, cx, cy, 5, 8, 6, lv, { cores, body: ['a', 'A', '5'], outline: 'o' });
  // flame tongues
  const flames = [[[cx - 2, cy - 11, 2], [cx + 1, cy - 12, 3]], [[cx - 1, cy - 12, 3], [cx + 2, cy - 11, 2]], [[cx - 2, cy - 13, 3], [cx + 1, cy - 11, 2]], [[cx - 1, cy - 11, 2], [cx + 2, cy - 13, 3]]][flick % 4];
  for (const [fx, fy, fl] of flames) for (let i = 0; i < fl; i++) cv.set(fx, fy - fl + i + 1, i === fl - 1 ? '6' : i === 0 && fl === 3 ? '5' : '6');
  if (attack) { for (const [dx, dy] of [[-8, -3], [8, -2], [-6, 9], [6, 8], [0, -16]]) { cv.set(cx + dx, cy + dy, '9'); cv.set(cx + dx + (dx < 0 ? -1 : 1), cy + dy, '7'); } }
  else if (level >= 2) for (const [dx, dy] of [[-8, -6], [8, 0]]) cv.set(cx + dx, cy + dy + (flick & 1), '7');
  return cv;
}

// ---- build towers ----
for (const [side, fn] of [['r', towerR], ['d', towerD]]) {
  const set = {};
  const lev = [0, 1, 2, 1], bob = [0, 0, -1, 0];
  for (let i = 0; i < 4; i++) set['idle_' + i] = side === 'r' ? towerR(lev[i], bob[i]) : towerD(lev[i], i);
  for (let i = 0; i < 2; i++) set['attack_' + i] = side === 'r' ? towerR(i ? 4 : 3, 0, 1 + i) : towerD(i ? 4 : 3, i + 1, 1 + i);
  reg('tower_' + side, set, side === 'r' ? 16 : 17, 62);
  reg('tower_' + side, { destroyed_0: rubble(side === 'd', 30, 14, side === 'd' ? 8 : 5) }, 15, 11);
}

// ---------------- barracks ----------------
function roofTiles(cv, pts, light, ridge) { // light = [lit, mid, dark, line]
  const m = poly(pts);
  const bx = bbox(m);
  paint(cv, m, (x, y, mm) => {
    const t = (x - bx.x0) / Math.max(1, bx.x1 - bx.x0);
    let i = t < 0.3 ? 0 : t < 0.7 ? 1 : 2;
    const row = (y - bx.y0);
    if (row % 3 === 2) return light[3];
    if (((x + ((row / 3 | 0) & 1) * 2) % 4) === 0 && i < 2) i++;
    if (!mm.has(K(x, y - 1))) i = 0;
    return light[i];
  }, 'O');
  return m;
}
function raxR(kind, lv, flick) {
  const W = 56, H = 48, cx = 28, by = 44, cv = new Cv(W, H);
  const rr = [ 'R', 'r', 's', 's' ];
  paint(cv, rect(cx - 24, by - 3, cx + 24, by), stone(RS, cx - 24, cx + 24, 11, false), 'O');
  // body
  paint(cv, rect(cx - 21, by - 20, cx + 21, by - 4), stone(RS, cx - 21, cx + 21, 12), 'O');
  // central tower for ranged
  if (kind === 'ranged') {
    paint(cv, rect(cx - 7, by - 38, cx + 7, by - 20), stone(RS, cx - 7, cx + 7, 13), 'O');
    for (let x = cx - 7; x <= cx + 7; x++) cv.set(x, by - 37, x < cx - 2 ? 'g' : x < cx + 3 ? 'G' : 'h');
    for (let y = by - 33; y <= by - 28; y++) for (let x = cx - 1; x <= cx + 1; x++) cv.set(x, y, y === by - 33 && x !== cx ? 'z' : 'O');
    cv.set(cx, by - 33, 'O');
    paint(cv, rect(cx - 5, by - 40, cx + 5, by - 38), shX(cx - 5, cx + 5, GOLD), 'O');
    gem(cv, cx, by - 46 + 6, 3, 6, 4, lv);
  }
  // roof (green tiles) with gold ridge
  roofTiles(cv, [[cx - 25, by - 19], [cx - 17, by - 31], [cx + 17, by - 31], [cx + 25, by - 19]], rr);
  if (kind === 'ranged') { /* tower rises through the roof */ paint(cv, rect(cx - 7, by - 38, cx + 7, by - 26), stone(RS, cx - 7, cx + 7, 13), null); for (let x = cx - 7; x <= cx + 7; x++) cv.set(x, by - 37, x < cx - 2 ? 'g' : x < cx + 3 ? 'G' : 'h'); for (let y = by - 33; y <= by - 28; y++) for (let x = cx - 1; x <= cx + 1; x++) cv.set(x, y, 'O'); }
  for (let x = cx - 25; x <= cx + 25; x++) { const y = by - 19; const eave = Math.abs(x - cx) > 17; if (!eave) continue; }
  for (let x = cx - 17; x <= cx + 17; x++) if (kind === 'melee') cv.set(x, by - 31, x < cx - 6 ? 'g' : x < cx + 8 ? 'G' : 'h');
  for (let t = 0; t <= 8; t++) { cv.set(cx - 25 + t, by - 19 - Math.round(t * 1.5), 'G'); cv.set(cx + 25 - t, by - 19 - Math.round(t * 1.5), 'h'); }
  // roof gems pulse
  if (kind === 'melee') { gem(cv, cx - 16, by - 36, 2, 4, 2, lv); gem(cv, cx + 16, by - 36, 2, 4, 2, lv); }
  // door
  paint(cv, rect(cx - 4, by - 13, cx + 4, by - 4), (x, y) => (x === cx - 4 || x === cx + 4 || y === by - 13 ? 'G' : 'O'), 'h');
  cv.set(cx - 4, by - 13, 'h'); cv.set(cx + 4, by - 13, 'h');
  for (let y = by - 12; y <= by - 4; y++) { cv.set(cx, y, 'n'); }
  // pillars
  for (const px of [cx - 21, cx + 18]) paint(cv, rect(px, by - 20, px + 3, by - 4), shX(px, px + 3, ['W', 'w', 'x', 'y'], false), 'O');
  // banners
  for (const bx of [cx - 11, cx + 9]) { paint(cv, rect(bx, by - 17, bx + 2, by - 9), (x, y) => (x === bx ? 'd' : x === bx + 1 ? 'c' : 'c'), 'O'); cv.set(bx + 1, by - 9 + (flick & 1), 'G'); cv.set(bx, by - 11, 'g'); }
  // emblem
  if (kind === 'melee') { for (let i = 0; i < 5; i++) { cv.set(cx - 8 + i * 4 / 4 * 1, by - 7, '.'); } for (const bx of [cx - 17, cx + 15]) { cv.set(bx, by - 14, 'x'); cv.set(bx + 1, by - 13, 'x'); cv.set(bx + 2, by - 12, 'y'); cv.set(bx + 2, by - 14, 'x'); cv.set(bx + 1, by - 13, 'g'); cv.set(bx, by - 12, 'y'); } }
  else { for (const bx of [cx - 17, cx + 15]) { cv.set(bx + 1, by - 15, 'g'); cv.set(bx, by - 14, 'g'); cv.set(bx, by - 13, 'g'); cv.set(bx + 1, by - 12, 'g'); cv.set(bx + 2, by - 14, 'y'); cv.set(bx + 2, by - 13, 'y'); } }
  return cv;
}
function raxD(kind, lv, flick) {
  const W = 56, H = 52, cx = 28, by = 48, cv = new Cv(W, H), r = rng(kind === 'melee' ? 21 : 22);
  // base mound
  paint(cv, poly([[cx - 25, by], [cx - 22, by - 5], [cx + 22, by - 5], [cx + 25, by]]), (x, y) => (((x * 3 + y) % 7 === 0) ? 'E' : x < cx - 8 ? 'D' : x < cx + 8 ? 'E' : 'F'), 'o');
  // body w/ jagged top
  const body = new Set(); for (let x = cx - 21; x <= cx + 21; x++) { const top = by - 21 - ((x * 5) % 4 === 0 ? 2 : 0) - (Math.abs(x - cx) < 6 ? 2 : 0); for (let y = top; y <= by - 5; y++) body.add(K(x, y)); }
  paint(cv, body, (x, y, m) => { const t = (x - (cx - 21)) / 42; let i = t < 0.2 ? 1 : t < 0.55 ? 2 : 3; if (!m.has(K(x, y - 1))) i = 0; else if (y % 5 === 4) i = Math.min(4, i + 1); else if (((x + (y / 5 | 0) * 3) % 7) === 0) i = Math.min(4, i + 1); return ['I', 'D', 'E', 'F', 'H'][i]; }, 'o');
  // spikes on the roofline
  const sp = kind === 'melee' ? [[-18, 14, -1], [-10, 18, -1], [0, 24, 0], [10, 18, 1], [18, 14, 1]] : [[-19, 12, -1], [-13, 16, -1], [13, 16, 1], [19, 12, 1]];
  for (const [dx, h, d] of sp) spikeCol(cv, cx + dx, by - 22, h, d, ['I', 'D', 'E', 'F']);
  if (kind === 'ranged') { // central spire with ember
    const sp2 = poly([[cx - 8, by - 20], [cx - 5, by - 36], [cx - 1, by - 42], [cx + 3, by - 36], [cx + 8, by - 20]]);
    paint(cv, sp2, (x, y, m) => (!m.has(K(x - 1, y)) ? 'D' : x < cx + 2 ? 'E' : 'F'), 'o');
    gem(cv, cx, by - 46, 3, 6, 4, lv, { cores: ['5', '6', '7', '8', '9'], body: ['a', 'A', '5'], outline: 'o' });
  }
  // glowing doorway
  paint(cv, rect(cx - 5, by - 15, cx + 5, by - 5), (x, y) => { const d = Math.abs(x - cx); return y === by - 15 ? 'A' : d > 3 ? 'a' : d > 1 ? (lv > 1 ? '6' : '5') : (lv > 1 ? '7' : '6'); }, 'o');
  for (let y = by - 14; y <= by - 5; y++) { cv.set(cx - 5, y, 'F'); cv.set(cx + 5, y, 'F'); }
  for (let x = cx - 5; x <= cx + 5; x++) cv.set(x, by - 16, 'I');
  // glowing slits
  for (const wx of [cx - 16, cx - 11, cx + 11, cx + 16]) { cv.set(wx, by - 13, 'l'); cv.set(wx, by - 12, 'l'); cv.set(wx, by - 11, lv > 1 ? '7' : 'l'); }
  // horns at the corners
  for (const [hx, d] of [[cx - 22, -1], [cx + 22, 1]]) { for (let i = 0; i < 9; i++) { const x = hx + d * Math.round(i * 0.55), y = by - 8 - i; paint(cv, new Set([K(x, y), K(x + d, y)]), 'x', 'o'); } for (let i = 0; i < 9; i++) { const x = hx + d * Math.round(i * 0.55), y = by - 8 - i; cv.set(x, y, i > 5 ? 'I' : 'D'); cv.set(x + d, y, 'E'); } }
  // red banners
  for (const bx of [cx - 9, cx + 7]) { for (let i = 0; i < 7; i++) { cv.set(bx, by - 21 + i, 'A'); cv.set(bx + 1, by - 21 + i, i > 4 && (flick & 1) ? '.' : 'a'); } cv.set(bx, by - 14, 'a'); }
  // brazier flame
  return cv;
}
for (const side of ['r', 'd']) for (const kind of ['melee', 'ranged']) {
  const set = {}; for (let i = 0; i < 2; i++) set['idle_' + i] = side === 'r' ? raxR(kind, i ? 2 : 0, i) : raxD(kind, i ? 2 : 0, i);
  reg(`rax_${kind}_${side}`, set, 28, side === 'r' ? 44 : 48);
  reg(`rax_${kind}_${side}`, { destroyed_0: rubble(side === 'd', 46, 16, kind === 'melee' ? 31 : 32) }, 23, 14);
}

// ---------------- ancients ----------------
const PULSE = [0, 1, 3, 1];
function ancientR(lv, ph) {
  const W = 72, H = 86, cx = 36, by = 82, cv = new Cv(W, H), r = rng(41);
  // stone platform
  paint(cv, poly([[cx - 30, by], [cx - 26, by - 7], [cx + 26, by - 7], [cx + 30, by]]), stone(RS, cx - 30, cx + 30, 3), 'O');
  for (let x = cx - 26; x <= cx + 26; x++) cv.set(x, by - 7, x < cx ? 'W' : 'w');
  // roots
  for (const [d, l] of [[-1, 15], [1, 15], [-1, 9], [1, 9]]) paint(cv, poly([[cx + d * 5, by - 9], [cx + d * (5 + l), by - 6], [cx + d * (7 + l), by - 8], [cx + d * 12, by - 17]]), (x, y, m) => (!m.has(K(x, y - 1)) ? 'W' : x * d > cx * d + 8 * 1 ? 'y' : 'x'), 'O');
  // trunk
  const trunk = poly([[cx - 12, by - 8], [cx - 9, by - 26], [cx - 7, by - 40], [cx - 9, by - 50], [cx + 9, by - 50], [cx + 7, by - 40], [cx + 9, by - 26], [cx + 12, by - 8]]);
  paint(cv, trunk, (x, y, m) => { const t = (x - (cx - 12)) / 24; let i = t < 0.25 ? 0 : t < 0.55 ? 1 : t < 0.8 ? 2 : 3; if (((x * 7 + (y >> 2) * 5) % 9) === 0 && i < 3) i++; if (((x + y * 2) % 11) === 0 && i > 0) i--; return RS[i]; }, 'O');
  // carved rune bands (gold)
  for (const yy of [by - 20, by - 33]) for (let x = cx - 8; x <= cx + 8; x++) { if (cv.get(x, yy) !== '.' && cv.get(x, yy) !== 'O') cv.set(x, yy, x < cx - 2 ? 'g' : x < cx + 3 ? 'G' : 'h'); }
  for (const yy of [by - 26, by - 38]) { cv.set(cx, yy, 'G'); cv.set(cx - 1, yy + 1, 'g'); cv.set(cx + 1, yy + 1, 'g'); }
  // leaf clumps below crown
  for (const [lx, ly, rad] of [[-12, -50, 5], [12, -50, 5], [0, -52, 4], [-17, -45, 3], [17, -45, 3]]) paint(cv, ell(cx + lx, by + ly, rad, rad * 0.7), (x, y, m) => (!m.has(K(x, y - 1)) ? 'R' : x < cx + lx ? 'r' : 's'), 'O');
  // gold cradle
  paint(cv, poly([[cx - 12, by - 51], [cx - 8, by - 56], [cx + 8, by - 56], [cx + 12, by - 51]]), shX(cx - 12, cx + 12, GOLD), 'O');
  // crystal crown
  const L = PULSE[ph] , Ls = PULSE[(ph + 2) & 3];
  gem(cv, cx - 14, by - 62, 4, 11, 7, Ls);
  gem(cv, cx + 14, by - 62, 4, 11, 7, Ls);
  gem(cv, cx - 7, by - 66, 5, 14, 8, L);
  gem(cv, cx + 7, by - 66, 5, 14, 8, L);
  gem(cv, cx, by - 72, 7, 19, 11, Math.min(4, L + 1));
  for (let i = 0; i < 3; i++) cv.set(cx - 1 + i, by - 56, 'G');
  sparkles(cv, cx, by - 68, [0, 1, 3, 1][ph], '3', 4 + ph);
  return cv;
}
function ancientD(lv, ph) {
  const W = 72, H = 90, cx = 36, by = 86, cv = new Cv(W, H), r = rng(51);
  const E5 = ['5', '6', '7', '8', '9'], L = PULSE[ph];
  // jagged base
  paint(cv, poly([[cx - 31, by], [cx - 27, by - 6], [cx - 20, by - 9], [cx + 20, by - 9], [cx + 27, by - 6], [cx + 31, by]]), (x, y, m) => (!m.has(K(x, y - 1)) ? 'I' : ((x * 3 + y) % 7 === 0 ? 'E' : x < cx ? 'D' : 'E')), 'o');
  // spire body
  const body = poly([[cx - 18, by - 8], [cx - 14, by - 28], [cx - 10, by - 48], [cx - 6, by - 66], [cx - 2, by - 78], [cx, by - 82], [cx + 2, by - 78], [cx + 6, by - 66], [cx + 10, by - 48], [cx + 14, by - 28], [cx + 18, by - 8]]);
  paint(cv, body, (x, y, m) => { const t = (x - (cx - 18)) / 36; let i = t < 0.22 ? 1 : t < 0.55 ? 2 : 3; if (!m.has(K(x - 1, y))) i = 0; if (((x * 5 + y * 3) % 8) === 0 && i < 3) i++; if (((x + y) % 13) === 0 && i > 0) i--; return DS[i]; }, 'o');
  // lava cracks
  const crack = (pts, w) => { for (let i = 0; i < pts.length - 1; i++) for (const k of line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 1)) { const [x, y] = pt(k); if (cv.get(x, y) !== '.' && cv.get(x, y) !== 'o') cv.set(x, y, (x + y + ph) % 5 === 0 ? E5[Math.min(4, L + 2)] : E5[Math.min(4, 1 + (L > 1 ? 1 : 0))]); } };
  crack([[cx - 3, by - 12], [cx - 6, by - 20], [cx - 3, by - 28], [cx - 7, by - 38], [cx - 4, by - 48], [cx - 6, by - 58]]);
  crack([[cx + 4, by - 14], [cx + 8, by - 24], [cx + 4, by - 34], [cx + 7, by - 44]]);
  crack([[cx - 3, by - 28], [cx - 12, by - 32]]); crack([[cx + 4, by - 34], [cx + 12, by - 38]]);
  // side spikes
  for (const [dx, h, d] of [[-24, 30, -1], [-19, 38, -1], [19, 38, 1], [24, 30, 1], [-29, 18, -1], [29, 18, 1]]) spikeCol(cv, cx + dx, by - 5, h, d, DS);
  // big ember gem at the apex
  gem(cv, cx, by - 74, 6, 14, 9, Math.min(4, L + 1), { cores: E5, body: ['a', 'A', '5'], outline: 'o' });
  // flames licking from the sides of the gem
  for (const d of [-1, 1]) for (let i = 0; i < 6; i++) { const fy = by - 78 + i * 2 - ((ph + (d > 0 ? 1 : 0) + i) & 1), fx = cx + d * (7 + (i % 3)); if (cv.get(fx, fy) === '.') cv.set(fx, fy, i < 2 ? 'V' : i < 4 ? 'N' : 'A'); }
  // glowing eyes/slits
  for (const dx of [-5, 5]) { cv.set(cx + dx, by - 54, 'l'); cv.set(cx + dx, by - 53, E5[Math.min(4, L + 1)]); }
  return cv;
}
for (const side of ['r', 'd']) {
  const set = {}; for (let i = 0; i < 4; i++) set['idle_' + i] = side === 'r' ? ancientR(0, i) : ancientD(0, i);
  reg('ancient_' + side, set, 36, side === 'r' ? 82 : 86);
  reg('ancient_' + side, { destroyed_0: rubble(side === 'd', 52, 20, side === 'd' ? 61 : 62) }, 26, 18);
}

// ---------------- fountains ----------------
function fountain(side, ph) {
  const dire = side === 'd', W = 56, H = 54, cx = 28, cy = 40, cv = new Cv(W, H);
  const ramp = dire ? DS : RS, ol = dire ? 'o' : 'O';
  const W4 = dire ? ['m', 'M', 'N', 'V'] : ['q', 'Q', 'T', 'U'];
  // rim: front wall (lower ellipse) then top ellipse
  const outer = ell(cx, cy, 25, 11), wall = union(ell(cx, cy + 4, 25, 11), outer);
  paint(cv, wall, (x, y) => { const t = (x - (cx - 25)) / 50; return t < 0.3 ? ramp[1] : t < 0.65 ? ramp[2] : ramp[3]; }, ol);
  paint(cv, outer, (x, y, m) => (!m.has(K(x, y - 1)) ? ramp[0] : y > cy + 6 ? ramp[1] : ((x + y) % 5 === 0 ? ramp[2] : ramp[1])), ol, true);
  // pool
  const pool = ell(cx, cy - 1, 21, 8);
  paint(cv, pool, (x, y, m) => {
    const d = Math.hypot((x - cx) / 21, (y - cy + 1) / 8);
    const w = Math.sin((x * 0.9 + ph * 1.6) + (y * 1.7)) ;
    if (!m.has(K(x, y - 1))) return W4[1];
    if (d > 0.8) return W4[1];
    if (w > 0.95) return W4[3];
    if (w > 0.35) return W4[2];
    return d < 0.5 ? W4[1] : W4[0];
  }, dire ? 'a' : 'q', true);
  // pedestal
  paint(cv, poly([[cx - 6, cy - 2], [cx - 4, cy - 12], [cx + 4, cy - 12], [cx + 6, cy - 2]]), shX(cx - 6, cx + 6, ramp), ol);
  paint(cv, ell(cx, cy - 12, 5, 2), (x, y) => (y < cy - 12 ? ramp[0] : ramp[1]), ol);
  // gold trim on rim
  for (let x = cx - 24; x <= cx + 24; x += 4) { const y = Math.round(cy - 11 * Math.sqrt(Math.max(0, 1 - ((x - cx) / 25) ** 2))); if (cv.get(x, y) !== '.') cv.set(x, y, dire ? 'A' : 'g'); }
  if (!dire) {
    // water jets: central column + arcs, animated droplets
    const top = cy - 24 - (ph === 1 || ph === 3 ? 1 : 0);
    for (let y = top; y <= cy - 12; y++) { cv.set(cx, y, y < top + 3 ? 'U' : 'T'); if (y > top + 2) { cv.set(cx - 1, y, 'Q'); cv.set(cx + 1, y, 'Q'); } }
    cv.set(cx, top - 1, 'U');
    for (const d of [-1, 1]) for (let t = 0; t <= 14; t++) { const x = cx + d * Math.round(t * 0.9), y = Math.round(cy - 20 + 0.07 * t * t - t * 0.55); if (cv.get(x, y) === '.' || cv.get(x, y) === 'O') cv.set(x, y, (t + ph) % 3 === 0 ? 'U' : 'T'); }
    for (let i = 0; i < 6; i++) { const a = i * 1.05 + ph * 0.7; const x = Math.round(cx + Math.cos(a) * 13), y = Math.round(cy - 3 + Math.sin(a) * 4); if (cv.get(x, y) !== '.') cv.set(x, y, 'U'); }
    // glowing crystal at the very top
    gem(cv, cx, top - 5, 2, 4, 3, PULSE[ph]);
  } else {
    // lava: spire with flame, bubbles
    paint(cv, poly([[cx - 4, cy - 12], [cx - 2, cy - 26], [cx, cy - 31], [cx + 2, cy - 26], [cx + 4, cy - 12]]), shX(cx - 4, cx + 4, DS), 'o');
    for (let y = cy - 25; y <= cy - 14; y += 3) { cv.set(cx, y, ['5', '6', '7'][(ph + y) % 3]); }
    for (let i = 0; i < 7; i++) { const fy = cy - 32 - i, fx = cx + (((i + ph) & 1) ? 1 : -1) * (i > 3 ? 0 : 1); cv.set(fx, fy, i < 2 ? 'V' : i < 4 ? 'N' : i < 6 ? 'A' : 'a'); cv.set(cx, fy, i < 3 ? 'V' : i < 5 ? 'N' : 'A'); }
    for (let i = 0; i < 5; i++) { const a = i * 1.3 + ph * 0.9; const x = Math.round(cx + Math.cos(a) * 12), y = Math.round(cy - 3 + Math.sin(a) * 4); if (cv.get(x, y) !== '.') cv.set(x, y, 'V'); }
    for (let i = 0; i < 4; i++) { const x = cx - 15 + ((i * 11 + ph * 5) % 31), y = cy - 5 + ((i * 3 + ph) % 6); if (cv.get(x, y) !== '.' && cv.get(x, y) !== 'a') cv.set(x, y, 'N'); }
  }
  return cv;
}
for (const side of ['r', 'd']) { const set = {}; for (let i = 0; i < 4; i++) set['idle_' + i] = fountain(side, i); reg('fountain_' + side, set, 28, 40 + 4); }

// ---------------- shops ----------------
function shop(side, ph) {
  const dire = side === 'd', W = 30, H = 34, cx = 15, by = 31, cv = new Cv(W, H);
  const wood = dire ? ['E', 'D', 'F', 'H'] : ['B', 'B', 'b', 'n'], ol = dire ? 'o' : 'O';
  // counter
  paint(cv, rect(cx - 10, by - 8, cx + 10, by), (x, y) => (y === by - 8 ? (dire ? 'I' : 'W') : x < cx - 3 ? wood[1] : x < cx + 5 ? wood[2] : wood[3]), ol);
  for (let x = cx - 8; x <= cx + 8; x += 4) for (let y = by - 6; y <= by - 1; y++) cv.set(x, y, wood[3]);
  // goods on the counter
  for (const [gx, ch] of dire ? [[-6, 'A'], [-2, '6'], [3, 'l'], [7, 'I']] : [[-6, 'c'], [-2, 'G'], [3, 'e'], [7, 'g']]) { cv.set(cx + gx, by - 9, ch); cv.set(cx + gx + 1, by - 9, ch); cv.set(cx + gx, by - 10, dire ? 'E' : 'w'); }
  // posts
  for (const px of [cx - 11, cx + 10]) paint(cv, rect(px, by - 24, px + 1, by), (x) => (x === px ? wood[1] : wood[2]), ol);
  // awning
  const aw = poly([[cx - 14, by - 15], [cx - 11, by - 26], [cx + 11, by - 26], [cx + 14, by - 15]]);
  paint(cv, aw, (x, y, m) => { const stripe = ((x - cx + 20) >> 2) & 1; if (dire) return stripe ? 'A' : 'a'; return stripe ? 'W' : (x < cx ? 'R' : 'r'); }, ol);
  for (let x = cx - 14; x <= cx + 14; x++) if (cv.get(x, by - 15) !== '.') cv.set(x, by - 14, (x & 1) ? (dire ? 'a' : 's') : '.');
  cv.set(cx, by - 27, dire ? 'A' : 'G');
  // lantern
  const ly = by - 12 + (ph & 1);
  cv.set(cx, by - 14, ol); cv.set(cx, by - 13, ol);
  paint(cv, rect(cx - 1, ly + 1, cx + 1, ly + 3), (x, y) => (dire ? (ph ? '7' : '6') : 'u'), ol, true);
  cv.set(cx, ly + 2, dire ? '8' : 'u');
  return cv;
}
for (const side of ['r', 'd']) { const set = {}; for (let i = 0; i < 2; i++) set['idle_' + i] = shop(side, i); reg('shop_' + side, set, 15, 31); }

// ---------------- export ----------------
const header = {
  gen: 'tools/art/world/buildings.mjs',
  doc: [
    'Buildings. Key scheme: <name>_<anim>_<i>; names tower_r/d, rax_melee_r/d, rax_ranged_r/d, ancient_r/d, fountain_r/d, shop_r/d (r = Radiant, d = Dire).',
    'anims: idle_0..N (glow pulse/flicker loop, ~4-6 fps), attack_0..1 (towers only), destroyed_0 (rubble). Frames of one building share one size and one anchor.',
    'Frames are cropped per building, so sizes differ between buildings: use anchors[key] = [x,y] = centre of the footprint on the ground (base line). `anchor` is a fallback.',
    'Emissive (emit map): crystal/ember cores and window glow. Radiant core chars 0-4, Dire ember chars 5-9, flames/lava N V l, water glow U T, lantern u.',
  ],
};
const bytes = writeSheet(path.join(SHEETS, 'buildings.js'), header, { pal, emit, anchor: [16, 60], anchors, frames });
console.log('buildings.js', bytes, 'bytes');
const seen = new Set(); for (const k of Object.keys(frames)) { const n = k.replace(/_(idle|attack|destroyed)_\d+$/, ''); if (!seen.has(n)) { seen.add(n); console.log(n, frames[k][0].length + 'x' + frames[k].length, anchors[k].join(',')); } }
