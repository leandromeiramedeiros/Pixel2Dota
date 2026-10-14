// Builds client/src/art/sheets/fx.js (projectiles, particle stamps, decals). Run: node tools/art/icons/fx.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PalBuilder } from './kit.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const pb = new PalBuilder();
const emitHex = {}; // hex -> strength (applied per palette char)

const hx = (r, g, b, a = 255) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('') + (a < 255 ? Math.round(a).toString(16).padStart(2, '0') : '');
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

class C {
  constructor(w, h) { this.w = w; this.h = h; this.p = Array.from({ length: h }, () => Array(w).fill(null)); }
  px(x, y, c, e) { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= this.w || y >= this.h || !c) return this; this.p[y][x] = c; if (e) emitHex[c] = e; return this; }
  // radial blob: colour ramp stops [[r, hex, emit?]...] sorted by radius ascending (first stop with d <= r wins)
  blob(cx, cy, stops, sx = 1, sy = 1) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const d = Math.hypot((x - cx) / sx, (y - cy) / sy);
      for (const [r, c, e] of stops) if (d <= r) { this.px(x, y, c, e); break; }
    }
    return this;
  }
  line(x0, y0, x1, y1, c, e) { const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) * 2 + 1; for (let i = 0; i <= n; i++) this.px(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c, e); return this; }
  rows() { return this.p.map(r => r.map(h => h ? pb.ch(h) : '.').join('')); }
}

const W = '#ffffff', frames = {};
const add = (k, c) => { frames[k] = c.rows(); };

// ---------------------------------------------------------------- projectiles (drawn pointing +x, renderer rotates)
function arrowFrost(f) {
  const c = new C(11, 5);
  c.line(1, 2, 8, 2, '#8a6a42'); c.line(2, 2, 7, 2, '#b08a58');
  c.px(0, 1, '#e8f6ff'); c.px(0, 3, '#e8f6ff'); c.px(1, 1, '#9adcff'); c.px(1, 3, '#9adcff');
  c.px(8, 1, '#7ad0ff', 1.2); c.px(8, 3, '#7ad0ff', 1.2); c.px(9, 2, W, 2); c.px(10, 2, '#cdf2ff', 2); c.px(8, 2, '#d8f6ff', 1.5);
  const t = [[3, 0], [5, 4], [4, 0]][f]; c.px(t[0], t[1], '#a8e8ff', 1);
  c.px(0, 2, '#bff0ff', 1);
  return c;
}
function bullet(f) {
  const c = new C(5, 3);
  c.px(0, 1, '#a07018'); c.px(1, 1, '#e8b840', 1); c.px(2, 1, '#ffe070', 1.5); c.px(3, 1, '#fff4c0', 2); c.px(4, 1, W, 2);
  if (f) { c.px(1, 0, '#e8b84088'); c.px(1, 2, '#e8b84088'); } else { c.px(2, 0, '#ffe07066'); c.px(2, 2, '#ffe07066'); }
  return c;
}
function fireball(f) {
  const c = new C(11, 9);
  const r = [3.1, 3.5, 3.3][f];
  c.line(0, 4, 4, 4, '#a01c0a', 0.6); c.px(1, 3 - (f === 1), '#d83a10', 0.8); c.px(2, 5 + (f === 2), '#d83a10', 0.8); c.px(0, 3, '#701208'); c.px(1, 5, '#701208');
  c.blob(6.5, 4, [[r * 0.4, W, 2.5], [r * 0.7, '#ffe888', 2], [r * 0.95, '#ff9a24', 1.6], [r * 1.25, '#e8481a', 1.2], [r * 1.55, '#8a1a0a', 0.5]]);
  c.px(4 + f, 2, '#ff9a24', 1); c.px(3 + f, 6, '#e8481a', 1);
  return c;
}
function stormHammer(f) {
  const c = new C(13, 13);
  const ang = f * Math.PI / 4 + 0.4, ca = Math.cos(ang), sa = Math.sin(ang);
  const P = (x, y) => [6 + x * ca - y * sa, 6 + x * sa + y * ca];
  for (let t = -4; t <= 4; t += 0.5) { const [x, y] = P(t, 0); c.px(x, y, t < 0 ? '#8a6038' : '#b0824c'); }
  for (let t = -2.5; t <= 2.5; t += 0.5) for (let u = 1; u <= 3; u += 0.5) { const [x, y] = P(u + 2, t); c.px(x, y, u > 2 ? '#e8f0ff' : '#aebcdc'); }
  for (let t = -2; t <= 2; t += 0.5) { const [x, y] = P(5.5, t); c.px(x, y, '#d8e8ff', 1.5); }
  c.blob(6, 6, [[1.2, W, 2.5], [2.3, '#9acaff', 1.8]]);
  const z = [[0, 0, 2, 3], [11, 1, 12, 4], [1, 11, 3, 12]][f % 3];
  c.line(z[0], z[1], z[2], z[3], '#d8f0ff', 2); c.px(12 - z[0], 12 - z[1], '#8ad0ff', 2);
  return c;
}
function creepBolt(col, f) {
  const c = new C(5, 5);
  const [a, b, d] = col;
  c.blob(2, 2, [[0.5, W, 1.6], [1.2, a, 1.4], [2.1, b, 0.8]]);
  if (f) { c.px(0, 2, d); c.px(4, 2, d); } else { c.px(2, 0, d); c.px(2, 4, d); }
  return c;
}
function towerShot(col, f) {
  const c = new C(9, 7);
  const [a, b, d] = col;
  c.line(0, 3, 4, 3, d, 0.8); c.px(1, 2 + f, d); c.px(1, 4 - f, d);
  c.blob(5.5, 3, [[0.8, W, 2.4], [1.6, a, 1.8], [2.6, b, 1.2], [3.2, d, 0.5]]);
  c.px(4, 1 + f * 4, a, 1); c.px(7, 5 - f * 4, a, 1);
  return c;
}
const ORB = { q: ['#bff6ff', '#2cc8f0', '#0a5a9a'], w: ['#ffd8ff', '#e040f0', '#6a1a9a'], e: ['#fff0b0', '#ff9a24', '#b03a10'] };
function invokerOrb(k, f) {
  const [a, b, d] = ORB[k];
  const c = new C(7, 7);
  c.blob(3, 3, [[0.9, W, 2.5], [1.8, a, 2], [2.6, b, 1.5], [3.3, d, 0.6]]);
  const o = [[5, 1], [1, 5], [5, 5]][f]; c.px(o[0], o[1], a, 1.5); c.px(6 - o[0], 6 - o[1], b, 1);
  return c;
}
function assassinate() {
  const c = new C(15, 3);
  c.line(0, 1, 9, 1, '#a02030', 0.8); c.px(5, 0, '#ff4050'); c.px(7, 2, '#ff4050');
  c.line(8, 1, 13, 1, '#ff8890', 1.5); c.px(14, 1, W, 3); c.px(13, 1, '#ffe0e0', 2.5);
  return c;
}
assassinate.f = 1;
function assassinate2() { const c = assassinate(); c.px(2, 0, '#ff4050'); c.px(3, 2, '#ff4050'); c.px(5, 0, null); c.px(7, 2, null); return c; }
function magicMissile(f) {
  const c = new C(11, 5);
  c.px(0, 2, '#4a1a9a'); c.px(1, 1 + (f % 2) * 2, '#6a2ad0', 0.8); c.px(1, 2, '#8a44f0', 1); c.px(2, 2, '#a060ff', 1.2); c.px(0, 1 + (f === 2) * 2, '#4a1a9a');
  c.blob(6.2, 2, [[0.6, W, 2.5], [1.5, '#e0c8ff', 2], [2.4, '#a060ff', 1.4], [3.1, '#5a24b0', 0.6]], 1.3, 1);
  c.px(9, 1, '#c8a0ff', 1); c.px(9, 3, '#c8a0ff', 1); c.px(10, 2, '#e8d8ff', 1.5);
  return c;
}

for (let i = 0; i < 3; i++) add(`arrow_frost${i ? '_' + i : ''}`, arrowFrost(i));
add('bullet', bullet(0)); add('bullet_1', bullet(1));
for (let i = 0; i < 3; i++) add(`fireball${i ? '_' + i : ''}`, fireball(i));
for (let i = 0; i < 4; i++) add(`storm_hammer${i ? '_' + i : ''}`, stormHammer(i));
const CR = ['#f0ffc0', '#a0e038', '#3a7a18'], CD = ['#ffc0e0', '#e04080', '#701850'];
const TR = ['#ffffd0', '#f0d040', '#a07010'], TD = ['#ffe0c0', '#ff6030', '#8a1a10'];
for (let i = 0; i < 2; i++) { add(`creep_ranged_r${i ? '_1' : ''}`, creepBolt(CR, i)); add(`creep_ranged_d${i ? '_1' : ''}`, creepBolt(CD, i)); add(`tower_r${i ? '_1' : ''}`, towerShot(TR, i)); add(`tower_d${i ? '_1' : ''}`, towerShot(TD, i)); }
for (const k of ['q', 'w', 'e']) for (let i = 0; i < 3; i++) add(`invoker_orb_${k}${i ? '_' + i : ''}`, invokerOrb(k, i));
add('assassinate_bullet', assassinate()); add('assassinate_bullet_1', assassinate2());
for (let i = 0; i < 3; i++) add(`magic_missile${i ? '_' + i : ''}`, magicMissile(i));

// ---------------------------------------------------------------- tint-friendly particle stamps (white/grey, alpha ramps)
const g = (v, a = 255) => hx(v, v, v, a);
{ // spark: 5x5 plus with bright core
  const c = new C(5, 5);
  c.px(2, 2, W, 2); c.px(1, 2, g(220), 1.4); c.px(3, 2, g(220), 1.4); c.px(2, 1, g(220), 1.4); c.px(2, 3, g(220), 1.4);
  c.px(0, 2, g(150, 150)); c.px(4, 2, g(150, 150)); c.px(2, 0, g(150, 150)); c.px(2, 4, g(150, 150)); add('p_spark', c);
}
{ const c = new C(3, 3); c.px(1, 1, W, 2.4); c.px(0, 1, g(200, 170), 1); c.px(2, 1, g(200, 170), 1); c.px(1, 0, g(200, 170), 1); c.px(1, 2, g(200, 170), 1); add('p_ember', c); }
{ const c = new C(5, 5); c.px(2, 2, g(254)); c.px(1, 2, g(235)); c.px(3, 2, g(235)); c.px(2, 1, g(235)); c.px(2, 3, g(235));
  c.px(0, 0, g(190, 160)); c.px(4, 0, g(190, 160)); c.px(0, 4, g(190, 160)); c.px(4, 4, g(190, 160)); add('p_snow', c); }
for (let i = 0; i < 4; i++) { // smoke puffs: soft irregular greys with alpha (not emissive)
  const c = new C(10, 10), cx = 4.5 + (i % 2 ? 0.3 : -0.3), cy = 4.5;
  const n = (x, y) => Math.sin(x * 2.3 + i * 1.7) * Math.cos(y * 1.9 + i * 2.9) * 0.9 + Math.sin((x + y) * 1.3 + i) * 0.5;
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
    const d = Math.hypot(x - cx, y - cy) + n(x, y) * 0.9;
    if (d < 2.0) c.px(x, y, g(235, 230)); else if (d < 3.2) c.px(x, y, g(200, 190)); else if (d < 4.4) c.px(x, y, g(160, 120)); else if (d < 5.0 && (x + y + i) % 2) c.px(x, y, g(130, 70));
  }
  add(`p_smoke_${i}`, c);
}
{ // ring 12x12, 1px, with brighter quarters
  const c = new C(12, 12);
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) { const d = Math.hypot(x - 5.5, y - 5.5); if (d >= 4.7 && d <= 5.9) c.px(x, y, d < 5.3 ? W : g(200, 200), 1); }
  add('p_ring', c);
}
{ // 4-point star 7x7
  const c = new C(7, 7);
  c.px(3, 3, W, 2.5); for (const [x, y] of [[2, 3], [4, 3], [3, 2], [3, 4]]) c.px(x, y, W, 1.8);
  for (const [x, y] of [[1, 3], [5, 3], [3, 1], [3, 5]]) c.px(x, y, g(220), 1.2);
  for (const [x, y] of [[0, 3], [6, 3], [3, 0], [3, 6]]) c.px(x, y, g(160, 160)); for (const [x, y] of [[2, 2], [4, 2], [2, 4], [4, 4]]) c.px(x, y, g(180, 150));
  add('p_star', c);
}
{ // ice shard 5x8: pale cyan diamond (mild tint; keep near-white so tinting still works)
  const c = new C(5, 8);
  const rowsS = ['..a..', '.aBa.', '.aWb.', 'aBWWb', 'aBWbb', '.aWb.', '.abb.', '..b..'];
  const col = { a: '#e8fbff', B: '#ffffff', W: '#f4feff', b: '#a8e4f8' };
  rowsS.forEach((r, y) => [...r].forEach((ch, x) => ch !== '.' && c.px(x, y, col[ch], ch === 'W' || ch === 'B' ? 0.8 : 0)));
  add('p_shard_ice', c);
}
{ // bolts: three jagged white lightning segments 8x8
  const paths = [[[1, 0], [3, 2], [2, 3], [5, 5], [4, 6], [6, 7]], [[6, 0], [4, 2], [5, 3], [2, 5], [3, 6], [1, 7]], [[3, 0], [2, 2], [5, 3], [3, 5], [4, 7]]];
  paths.forEach((pa, i) => { const c = new C(8, 8); for (let j = 0; j < pa.length - 1; j++) c.line(...pa[j], ...pa[j + 1], j % 2 ? W : g(235), 2); for (const [x, y] of pa) c.px(x, y, W, 2.5); add(`p_bolt_${i}`, c); });
}
{ const c = new C(5, 4); // leaf (tint green/brown)
  c.px(0, 2, g(150)); c.px(1, 1, g(230)); c.px(2, 1, W); c.px(3, 1, g(230)); c.px(1, 2, g(200)); c.px(2, 2, g(190)); c.px(3, 2, g(160)); c.px(4, 3, g(120)); c.px(2, 3, g(130)); add('p_leaf', c); }
{ const c = new C(8, 8); // soft round glow
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const d = Math.hypot(x - 3.5, y - 3.5), a = Math.max(0, 1 - d / 4.2); if (a > 0.08) c.px(x, y, g(255, a * a * 255), a > 0.55 ? 1.5 : 0.8); }
  add('p_glow', c); }
for (let f = 0; f < 4; f++) { // hit burst 4 frames, 9x9: flash -> spikes -> ring -> fade
  const c = new C(9, 9);
  if (f === 0) { c.blob(4, 4, [[1, W, 3], [2.2, g(235), 2], [3.1, g(190, 150), 1]]); }
  if (f === 1) { c.px(4, 4, W, 2.5); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? 2.4 : 3.6; c.px(4 + Math.cos(a) * r, 4 + Math.sin(a) * r, i % 2 ? g(220) : W, 2); } c.px(4, 3, g(240), 1.5); c.px(4, 5, g(240), 1.5); c.px(3, 4, g(240), 1.5); c.px(5, 4, g(240), 1.5); }
  if (f === 2) { for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; c.px(4 + Math.cos(a) * 3.4, 4 + Math.sin(a) * 3.4, g(235), 1.5); } for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; c.px(4 + Math.cos(a) * 4.2, 4 + Math.sin(a) * 4.2, W, 2); } }
  if (f === 3) { for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + 0.2; c.px(4 + Math.cos(a) * 4.1, 4 + Math.sin(a) * 4.1, g(190, 140), 0.8); } }
  add(`p_hit_${f}`, c);
}
{ const c = new C(4, 4); // coin (gold, not tint-friendly)
  c.px(1, 0, '#8a5a08'); c.px(2, 0, '#8a5a08'); c.px(0, 1, '#8a5a08'); c.px(3, 1, '#8a5a08'); c.px(0, 2, '#8a5a08'); c.px(3, 2, '#8a5a08'); c.px(1, 3, '#8a5a08'); c.px(2, 3, '#8a5a08');
  c.px(1, 1, '#ffe060', 1); c.px(2, 1, '#ffd030', 0.8); c.px(1, 2, '#e8a818', 0.6); c.px(2, 2, '#e8a818', 0.6); add('p_coin', c); }

// ---------------------------------------------------------------- decals (low alpha, tint at runtime)
{ const c = new C(18, 14); // scorch: dark charred blotch with ember rim
  for (let y = 0; y < 14; y++) for (let x = 0; x < 18; x++) {
    const d = Math.hypot((x - 8.5) / 8.4, (y - 6.5) / 6.4) + Math.sin(x * 1.7 + y * 0.9) * 0.08 + Math.cos(y * 2.1 - x * 0.7) * 0.07;
    if (d < 0.5) c.px(x, y, hx(14, 10, 8, 200)); else if (d < 0.78) c.px(x, y, hx(30, 20, 14, 150)); else if (d < 0.95 && (x * 3 + y * 5) % 4 < 2) c.px(x, y, hx(44, 30, 20, 90));
  }
  for (const [x, y] of [[4, 4], [12, 3], [6, 9], [13, 8]]) c.px(x, y, hx(255, 120, 30, 160), 0.8);
  add('decal_scorch', c); }
{ const c = new C(18, 14); // frost: pale cyan crystalline patch
  for (let y = 0; y < 14; y++) for (let x = 0; x < 18; x++) {
    const d = Math.hypot((x - 8.5) / 8.4, (y - 6.5) / 6.4) + Math.sin(x * 2.1 + y * 1.3) * 0.08;
    if (d < 0.45) c.px(x, y, hx(210, 245, 255, 150)); else if (d < 0.8) c.px(x, y, hx(150, 220, 250, 110)); else if (d < 0.97 && (x + y) % 2 === 0) c.px(x, y, hx(120, 200, 240, 80));
  }
  for (const [x1, y1, x2, y2] of [[3, 7, 14, 6], [8, 2, 9, 11], [5, 3, 12, 10], [5, 10, 12, 3]]) c.line(x1, y1, x2, y2, hx(240, 252, 255, 230), 0.6);
  add('decal_frost', c); }
{ const c = new C(26, 20); // targeting ring: white ellipse, dashed + 4 ticks
  for (let i = 0; i < 160; i++) { const a = i / 160 * Math.PI * 2; if (i % 8 >= 6) continue; c.px(12.5 + Math.cos(a) * 11.6, 9.5 + Math.sin(a) * 8.6, W, 0.8); }
  for (const [x, y] of [[0, 9], [0, 10], [25, 9], [25, 10], [12, 0], [13, 0], [12, 19], [13, 19], [1, 9], [1, 10], [24, 9], [24, 10]]) c.px(x, y, W, 1.2);
  add('decal_ring_target', c); }

// ---------------------------------------------------------------- output
const q = s => JSON.stringify(s);
const emit = {}; for (const [c, h] of Object.entries(pb.pal)) if (emitHex[h]) emit[c] = emitHex[h];
let out = `// GENERATED by tools/art/icons/fx.mjs -- do not hand-edit.\n`;
out += `// Projectiles (arrow_frost, bullet, fireball, storm_hammer, creep_ranged_r/d, tower_r/d, invoker_orb_q/w/e, assassinate_bullet, magic_missile) are drawn pointing +x; frames: key, key_1, key_2...\n`;
out += `// TINT-FRIENDLY (white/grey + alpha, multiply by emitter colour): p_spark, p_ember, p_snow, p_smoke_0..3, p_ring, p_star, p_bolt_0..2, p_leaf, p_glow, p_hit_0..3.\n`;
out += `// p_shard_ice is pale cyan (tint lightly); p_coin is gold (do not tint). Decals: decal_scorch, decal_frost (tint/alpha-scale at runtime), decal_ring_target (white, tint by team/ability).\n`;
out += `// anchor [0,0] = frame centre is handled by the renderer; frames are small, so treat the centre as the origin.\n`;
out += `// emit: palette char -> HDR strength (renderer blooms those pixels).\n`;
out += `export default {\n  pal: {\n${Object.entries(pb.pal).map(([c, h]) => `    ${q(c)}: ${q(h)}`).join(',\n')}\n  },\n  emit: {\n${Object.entries(emit).map(([c, e]) => `    ${q(c)}: ${e}`).join(',\n')}\n  },\n  anchor: [0, 0],\n  frames: {\n`;
out += Object.entries(frames).map(([k, r]) => `    ${q(k)}: [\n${r.map(x => `      ${q(x)}`).join(',\n')}\n    ]`).join(',\n');
out += `\n  }\n};\n`;
const file = path.join(ROOT, 'client/src/art/sheets/fx.js');
fs.writeFileSync(file, out);
console.log('wrote', file, Object.keys(frames).length + ' frames', Object.keys(pb.pal).length + ' colours', Object.keys(emit).length + ' emit');
