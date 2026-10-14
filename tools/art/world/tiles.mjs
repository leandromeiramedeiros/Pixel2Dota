// Generates client/src/art/sheets/tiles.js  (node tools/art/world/tiles.mjs)
import path from 'node:path';
import { Cv, rng, writeSheet, SHEETS } from './lib.mjs';

const pal = {
  // Radiant grass ramp (dark..light; a..e = trainer GRASS ramp, InvokerTrainer js/render/terrain.js) + tuft highlight + flowers
  a: '#2c5626', b: '#3a6e30', c: '#447e36', d: '#4f8c3c', e: '#64a64a',  f: '#f4f0d8', g: '#f0d050', h: '#ee86b8', i: '#86b4f4',
  // Dire ground (dead): dark..light, ash, red crack, dark red
  j: '#30231e', k: '#43322a', l: '#58412f', m: '#725540', n: '#8c847c', o: '#7a2e22', p: '#4a1c1a',
  // forest floor R / D
  q: '#1a3120', r: '#223e28', s: '#2b4d2e', t: '#386036',
  u: '#231a1c', v: '#2d2123', w: '#392b29', x: '#4a3630',
  // road dirt: dark, base, mid, light, pebble light, pebble dark, rim dark
  A: '#4e3a28', B: '#85653f', C: '#9c7a50', D: '#b49468', E: '#d8c8a8', F: '#5e4c3c', G: '#392a1c',
  // water: deep, base, mid, light, speck, foam, shore dark
  H: '#1b4682', I: '#2a64a4', J: '#3f84c2', K: '#6aaedf', L: '#dcf6ff', M: '#9fd4ee', N: '#14325c',
  // rock top neutral (dark..light, crack) / dire rock
  O: '#45454f', P: '#62626c', Q: '#7c7c88', R: '#9c9ca8', S: '#2a2a34',
  T: '#3a2e34', U: '#55434b', V: '#6e5a63', W: '#8a767e', X: '#20161c',
  // void
  Y: '#07070d', Z: '#0e0e18',
  // cliff stone Radiant: lit ledge, light, mid, dark, deepest
  '1': '#c4c0ac', '2': '#9a977f', '3': '#757263', '4': '#54514a', '5': '#383630',
  // cliff Dire (red-brown): lit, light, mid, dark, deepest, red crack
  '6': '#b0735f', '7': '#85523f', '8': '#623a2f', '9': '#432822', '0': '#2a1815', '!': '#a03a2a',
};
const emit = { L: 1.6 };

const frames = {};
const T = (seed) => ({ cv: new Cv(8, 8, '.', true), r: rng(seed) });

// ---------- grass ----------
function tuftR(cv, x, y) { cv.set(x, y, 'e'); cv.set(x - 1, y + 1, 'd'); cv.set(x, y + 1, 'c'); cv.set(x + 1, y + 1, 'd'); cv.set(x, y + 2, 'a'); }
function grassR(i) {
  const { cv, r } = T(100 + i);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const v = r(); cv.set(x, y, v < 0.11 ? 'a' : v < 0.2 ? 'c' : 'b'); }
  // dither clusters
  for (let k = 0; k < 3; k++) { const x = Math.floor(r() * 8), y = Math.floor(r() * 8); cv.set(x, y, 'c'); cv.set(x + 1, y, 'c'); }
  const pos = [[2, 1], [5, 4]];
  if (i === 0) { /* plain */ }
  if (i === 1 || i === 4 || i === 5) tuftR(cv, 2 + (i === 4 ? 3 : 0), 1 + (i === 5 ? 3 : 0));
  if (i === 2 || i === 5) { tuftR(cv, 5, 4); }
  if (i === 2) tuftR(cv, 1, 5);
  if (i === 3) { cv.set(2, 5, 'a'); cv.set(2, 4, ['f', 'g', 'h', 'i'][0]); cv.set(5, 1, 'g'); cv.set(5, 2, 'd'); cv.set(6, 6, 'f'); cv.set(6, 7, 'c'); }
  if (i === 4) { cv.set(6, 6, 'h'); cv.set(6, 7, 'd'); }
  if (i === 5) { cv.set(7, 1, 'i'); cv.set(7, 2, 'd'); }
  return cv;
}
function deadTuft(cv, x, y) { cv.set(x, y, 'm'); cv.set(x, y + 1, 'l'); cv.set(x + 1, y + 1, 'l'); cv.set(x - 1, y + 2, 'k'); }
function grassD(i) {
  const { cv, r } = T(200 + i);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const v = r(); cv.set(x, y, v < 0.14 ? 'j' : v < 0.22 ? 'l' : 'k'); }
  for (let k = 0; k < 2; k++) { const x = Math.floor(r() * 8), y = Math.floor(r() * 8); cv.set(x, y, 'l'); cv.set(x + 1, y, 'l'); }
  if (i === 1 || i === 4) deadTuft(cv, 2, 2);
  if (i === 2) { deadTuft(cv, 5, 1); deadTuft(cv, 1, 5); }
  if (i === 3) { cv.set(1, 6, 'o'); cv.set(2, 5, 'o'); cv.set(3, 5, 'p'); cv.set(4, 4, 'o'); cv.set(5, 3, 'p'); }          // cracked ground, ember crack
  if (i === 4) { cv.set(5, 5, 'n'); cv.set(6, 5, 'n'); cv.set(6, 6, 'm'); cv.set(2, 6, 'n'); }                            // ash flecks
  if (i === 5) { deadTuft(cv, 6, 4); cv.set(1, 1, 'n'); cv.set(2, 1, 'm'); cv.set(3, 2, 'p'); cv.set(3, 3, 'o'); }
  return cv;
}
for (let i = 0; i < 6; i++) { frames['grass_r_' + i] = grassR(i).rows(); frames['grass_d_' + i] = grassD(i).rows(); }

// ---------- forest floor ----------
function forest(seed, c) { // c = [dark, base, mid, litter]
  const { cv, r } = T(seed);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const v = r(); cv.set(x, y, v < 0.22 ? c[0] : v < 0.3 ? c[2] : c[1]); }
  for (let k = 0; k < 3; k++) { const x = Math.floor(r() * 8), y = Math.floor(r() * 8); cv.set(x, y, c[3]); cv.set(x + 1, y + 1, c[2]); }
  return cv;
}
frames.forest_r = forest(300, ['q', 'r', 's', 't']).rows();
frames.forest_d = forest(301, ['u', 'v', 'w', 'x']).rows();

// ---------- road ----------
function roadBase(i) {
  const { cv, r } = T(400 + i);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const v = r(); cv.set(x, y, v < 0.1 ? 'A' : v < 0.28 ? 'C' : v < 0.33 ? 'D' : 'B'); }
  const peb = [[[1, 2], [5, 6]], [[6, 1], [2, 5]], [[3, 3]], [[0, 6], [5, 2], [7, 7]]][i % 4];
  for (const [x, y] of peb) { cv.set(x, y, 'E'); cv.set(x + 1, y, 'D'); cv.set(x, y + 1, 'F'); cv.set(x + 1, y + 1, 'F'); }
  for (let k = 0; k < 2; k++) cv.set(Math.floor(r() * 8), Math.floor(r() * 8), 'A');
  return cv;
}
for (let i = 0; i < 4; i++) frames['road_' + i] = roadBase(i).rows();
// bit order N=1 E=2 S=4 W=8 : bit set => neighbour is the SAME type (no rim on that side)
function rim(cv, mask, outer, inner, innerAlt) {
  const sides = [[1, (x, y) => y], [2, (x, y) => 7 - x], [4, (x, y) => 7 - y], [8, (x, y) => x]]; // distance from that side
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    let d = 9;
    for (const [bit, f] of sides) if (!(mask & bit)) d = Math.min(d, f(x, y));
    if (d === 0) cv.g[y][x] = outer;
    else if (d === 1) cv.g[y][x] = innerAlt && ((x + y) % 3) ? innerAlt : inner;
  }
}
for (let m = 0; m < 16; m++) { const cv = roadBase(m); cv.wrap = false; rim(cv, m, 'G', 'A', 'B'); frames['road_e' + m] = cv.rows(); }

// ---------- water ----------
function waterBase(f, seed = 500) {
  const cv = new Cv(8, 8, 'I', true), r = rng(seed + f * 7);
  // static deep spots (fixed across frames so the water body doesn't flicker)
  for (const [x, y] of [[1, 0], [6, 3], [3, 6], [7, 7]]) cv.set(x, y, 'H');
  const dash = (x, y, c) => { cv.set(x, y, c); cv.set(x + 1, y, c); cv.set(x + 2, y, c); };
  dash((0 + 2 * f) % 8, 1, 'J'); cv.set((1 + 2 * f) % 8, 1, 'K');
  dash((4 + 2 * f) % 8, 4, 'J'); cv.set((5 + 2 * f) % 8, 4, 'K');
  dash((7 - 2 * f + 8) % 8, 6, 'H'); dash((2 - f + 8) % 8, 3, 'H');
  cv.set((3 + 2 * f) % 8, 7, 'J'); cv.set((6 - f + 8) % 8, 2, 'J');
  const sp = [[[2, 1]], [[5, 0], [1, 5]], [[3, 6]], [[7, 3], [0, 7]]][f];
  for (const [x, y] of sp) cv.set(x, y, 'L');
  return cv;
}
for (let f = 0; f < 4; f++) frames['water_' + f] = waterBase(f).rows();
for (let m = 0; m < 16; m++) for (let f = 0; f < 4; f++) { const cv = waterBase(f); cv.wrap = false; rim(cv, m, 'N', 'M', 'I'); frames['water_e' + m + (f ? '_' + f : '')] = cv.rows(); }

// ---------- rock tops ----------
function rockTop(i, c) { // c = [dark, base, mid, light, crack]
  const { cv, r } = T(600 + i * 11 + (c[4] === 'X' ? 50 : 0));
  const seeds = []; const n = 3 + (i & 1);
  for (let k = 0; k < n; k++) seeds.push([r() * 8, r() * 8]);
  const id = (x, y) => { let b = 0, bd = 1e9; seeds.forEach((s, k) => { let dx = Math.abs(x - s[0]), dy = Math.abs(y - s[1]); dx = Math.min(dx, 8 - dx); dy = Math.min(dy, 8 - dy); const d = dx * dx + dy * dy; if (d < bd) { bd = d; b = k; } }); return b; };
  const ids = []; for (let y = 0; y < 8; y++) { ids.push([]); for (let x = 0; x < 8; x++) ids[y].push(id(x, y)); }
  const at = (x, y) => ids[(y + 8) % 8][(x + 8) % 8];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const me = ids[y][x];
    let ch = [c[1], c[1], c[2]][me % 3];
    if (at(x + 1, y) !== me || at(x, y + 1) !== me) ch = c[4];
    else if (at(x - 1, y) !== me || at(x, y - 1) !== me) ch = c[3];
    else if (r() < 0.12) ch = c[0];
    cv.set(x, y, ch);
  }
  return cv;
}
for (let i = 0; i < 4; i++) { frames['rock_top_' + i] = rockTop(i, ['O', 'P', 'Q', 'R', 'S']).rows(); frames['rock_top_d_' + i] = rockTop(i, ['T', 'U', 'V', 'W', 'X']).rows(); }

// ---------- void ----------
{ const { cv, r } = T(700); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) cv.set(x, y, r() < 0.12 ? 'Z' : 'Y'); frames.void = cv.rows(); }

// ---------- cliff faces: 8 wide x 22 tall, tile horizontally (periodic in x), top row = lit ledge, bottom row = ground contact ----------
function cliff(i, dire) {
  const W = 8, H = 22, cv = new Cv(W, H, '.', false), r = rng((dire ? 800 : 900) + i * 13);
  const S = dire ? ['6', '7', '8', '9', '0'] : ['1', '2', '3', '4', '5']; // lit, light, mid, dark, deepest
  const X = x => ((x % W) + W) % W;
  const put = (x, y, c) => { if (y >= 0 && y < H) cv.g[y][X(x)] = c; };
  // body
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = r(); cv.g[y][x] = v < 0.13 ? S[3] : v < 0.23 ? S[1] : S[2]; }
  // strata: dark line + light line above
  const ys = [6 + (i % 2), 12 + ((i + 1) % 2), 17];
  for (const y of ys) { const len = 4 + Math.floor(r() * 3), x0 = Math.floor(r() * W); for (let k = 0; k < len; k++) { put(x0 + k, y, S[4]); put(x0 + k + (k & 1), y - 1, S[1]); } for (let k = 0; k < 3; k++) put(x0 + len + 1 + k, y, S[3]); }
  // vertical cracks
  const nc = 1 + (i & 1);
  for (let c = 0; c < nc; c++) { let x = Math.floor(r() * W), y = 3 + Math.floor(r() * 6); const len = 5 + Math.floor(r() * 6); for (let k = 0; k < len && y < H - 2; k++, y++) { put(x, y, dire ? S[4] : S[4]); if (dire && k % 3 === 1) put(x, y, '!'); else put(x + 1, y, S[1]); if (r() < 0.3) x += r() < 0.5 ? -1 : 1; } }
  // top ledge rows 0..2
  for (let x = 0; x < W; x++) { cv.g[0][x] = S[0]; cv.g[1][x] = r() < 0.35 ? S[1] : S[0]; cv.g[2][x] = r() < 0.5 ? S[1] : S[2]; }
  if (!dire) { // moss on the lip + drips
    for (let x = 0; x < W; x++) { if (r() < 0.55) { cv.g[0][x] = r() < 0.5 ? 'd' : 'c'; cv.g[1][x] = r() < 0.7 ? 'c' : 'b'; if (r() < 0.45) { cv.g[2][x] = 'b'; if (r() < 0.5) cv.g[3][x] = 'a'; } } }
    for (let k = 0; k < 2; k++) { const x = Math.floor(r() * W), y = ys[1 + (k & 1)] - 1; put(x, y, 'b'); put(x + 1, y, 'c'); put(x, y + 1, 'a'); }
  } else { // rusty/ash flecks, a few hot cracks
    for (let x = 0; x < W; x++) if (r() < 0.3) { cv.g[1][x] = S[1]; }
    for (let k = 0; k < 2; k++) { const x = Math.floor(r() * W), y = 4 + Math.floor(r() * 12); put(x, y, 'o'); put(x + 1, y + 1, 'p'); }
  }
  // base shadow gradient (ambient occlusion where the wall meets ground)
  for (let x = 0; x < W; x++) { if (((x + 1) & 1) || r() < 0.4) cv.g[H - 4][x] = S[3]; cv.g[H - 3][x] = (x & 1) ? S[3] : S[4]; cv.g[H - 2][x] = S[4]; cv.g[H - 1][x] = S[4]; }
  for (let x = 0; x < W; x++) if (r() < 0.2) cv.g[H - 5][x] = S[3];
  return cv;
}
for (let i = 0; i < 4; i++) { frames['cliff_r_' + i] = cliff(i, false).rows(); frames['cliff_d_' + i] = cliff(i, true).rows(); }

// ---------- stairs / ramp tiles ----------
function stairs(horizontal, dire) {
  const cv = new Cv(8, 8, '.', false); const S = dire ? ['6', '7', '8', '9', '0'] : ['1', '2', '3', '4', '5']; const r = rng(horizontal ? 11 : 12);
  for (let s = 0; s < 4; s++) for (let t = 0; t < 2; t++) for (let k = 0; k < 8; k++) { const [x, y] = horizontal ? [k, s * 2 + t] : [s * 2 + t, k]; cv.g[y][x] = t === 0 ? (r() < 0.2 ? S[1] : S[0]) : (r() < 0.25 ? S[3] : S[2]); }
  for (let s = 0; s < 4; s++) for (let k = 0; k < 8; k++) { const [x, y] = horizontal ? [k, s * 2 + 1] : [s * 2 + 1, k]; if (k === 0 || k === 7) cv.g[y][x] = S[4]; }
  return cv;
}
frames.stairs_0 = stairs(true, false).rows();
frames.stairs_1 = stairs(false, false).rows();
frames.stairs_d_0 = stairs(true, true).rows();
frames.stairs_d_1 = stairs(false, true).rows();

const header = {
  gen: 'tools/art/world/tiles.mjs',
  doc: [
    'Terrain tiles: every key except cliff_* is an 8x8 px tile (8 px = 48u). cliff_* are 8 wide x 22 tall wall strips (128u). anchor unused ([0,0]).',
    'Variants: grass_r_0..5 (Radiant lush, flowers in 3..5), grass_d_0..5 (Dire dead/ash), forest_r/forest_d (floor under trees), road_0..3, water_0..3 (animation',
    'frames, ~4-8 fps; specks are emissive), rock_top_0..3 (+ rock_top_d_0..3 red-brown for the Dire half), void, stairs_0 (steps along y) / stairs_1 (steps along x) (+ _d).',
    'Autotile edges: road_e<mask> and water_e<mask>, mask 0..15, bits N=1 E=2 S=4 W=8, a bit set = that neighbour is the SAME type (no border on that side;',
    'a clear bit draws a 2 px rim). mask 15 = interior. Water edges are animated: water_e<mask> is frame 0, water_e<mask>_1.._3 are frames 1..3.',
    'Neighbour test is orthogonal only (diagonals ignored). Rims are drawn inside the road/water tile itself so tiles are opaque; no alpha anywhere.',
    'Cliff faces: cliff_r_0..3 (Radiant, mossy lip) / cliff_d_0..3 (Dire, red-brown); top row = lit ledge, bottom rows = dark ground contact; periodic in x so any',
    'order of variants tiles horizontally. Pick variant by hash(tile x, y, side).',
  ],
};
const bytes = writeSheet(path.join(SHEETS, 'tiles.js'), header, { pal, emit, anchor: [0, 0], frames });
console.log('tiles.js', bytes, 'bytes,', Object.keys(frames).length, 'frames');
