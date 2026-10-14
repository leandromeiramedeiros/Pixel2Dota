// 3D ground clutter: rocks, scree, grass / ferns / bushes, mushrooms, fallen logs, bones, ruin pillars, reeds, lily pads and
// base props (crates / barrels / banners). Low-poly flat-shaded variants, ONE instanced draw per variant, all sharing ONE
// material (so three skips re-uploading uniforms between draws), lit / shadowed / fogged / Bayer-quantised exactly like trees3d.js.
//
// The scatter (scatterClutter) is pure and deterministic: it runs once over the map grid, and the result is bucketed by
// 256u cell x variant into one packed buffer that is already in GPU layout, so the per-frame work is "frustum-test a few
// dozen cells and memcpy their ranges".
import * as THREE from 'three';
import { WIND_GLSL } from './wind.js';
import { COMMON_GLSL } from './shaderlib.js';
import { DEPTH_FRAG } from './shadow.js';
import { createKit, instancedGeo, flushInstances, hash01, DEPTH_GLSL } from './mesh3d.js';
import { tileSide, waterDepth, isDeepVoid } from './terrainGeo.js';
import { getMap, heightAt, TT, sideOf } from '../../../shared/map.js';

export const V = { ROCK: 0, BOULDER: 1, SCREE: 2, TUFT: 3, FERN: 4, BUSH: 5, SHROOM: 6, LOG: 7, TWIGS: 8, BONES: 9, PILLAR: 10, REED: 11, LILY: 12, CARGO: 13, BANNER: 14 };
export const NV = 15;
export const CELL = 256;
const STRIDE = 7;                       // x, y(up), z, yaw, scale, phase, side
const GRID = 64;                        // jittered-grid pitch (world units)
const CASTERS = [V.ROCK, V.BOULDER, V.LOG, V.PILLAR, V.CARGO];
const BIG = new Set([V.ROCK, V.BOULDER, V.LOG, V.PILLAR, V.CARGO, V.BANNER]);   // keep clear of tree trunks

// ---------------------------------------------------------------------------------------------------------------------------------
// meshes. Colours: [Radiant, Dire]. Everything is darker / less saturated than units (art rule 8).
const P = (c, d, o = {}) => ({ c, d, ...o });
/** open cone leaning by t (rad) toward direction a, base at (bx, by, bz) */
function blade(k, bx, bz, h, r, t, a, col, seg = 3, o = {}) {
  const s = Math.sin(t), c = Math.cos(t);
  k.cone(r, h, seg, { ...col, ctr: true, x: bx - (h / 2) * s * Math.cos(a), y: (o.by || 0) + (h / 2) * c, z: bz + (h / 2) * s * Math.sin(a), rz: t, ry: a, sw: 1, ...o });
}
const GRASS = [P(0x2f6a3e, 0x6e6030), P(0x3c7a47, 0x85703a), P(0x275a38, 0x5a4e2a)];
const STONE = [P(0x565f5c, 0x6a584a), P(0x646d69, 0x7a6554), P(0x4a5350, 0x5c4a3e)];

const MESHES = {
  [V.ROCK]: { ramp: 0, fn(k) {
    k.ico(30, { ...STONE[0], y: 10, sy: 0.62 });
    k.ico(19, { ...STONE[1], x: 36, z: 12, y: 7, sy: 0.7, ry: 1 });
    k.oct(14, 10, 12, { ...STONE[2], x: -30, z: 20, y: 6 });
  } },
  [V.BOULDER]: { ramp: 0, fn(k) {
    k.ico(62, { ...STONE[1], y: 24, sy: 0.7 });
    k.oct(26, 17, 23, { ...STONE[2], x: 66, z: -20, y: 12, ry: 0.5 });
  } },
  [V.SCREE]: { ramp: 0, fn(k) {
    const at = [[0, 0, 11], [26, 10, 8], [-22, 18, 9], [10, -26, 7], [-30, -10, 6]];
    at.forEach(([x, z, r], i) => k.oct(r, r * 0.6, r * 0.85, { ...STONE[i % 3], x, z, y: r * 0.35, ry: i * 1.3 }));
  } },
  [V.TUFT]: { ramp: 34, fn(k) {
    for (let i = 0; i < 8; i++) {
      const a = i * 2.4, rr = 3 + (i % 3) * 3;
      blade(k, Math.cos(a) * rr, Math.sin(a) * rr, 30 + (i * 7) % 18, 4.2, 0.2 + (i % 4) * 0.12, a + 0.6, GRASS[i % 3]);
    }
  } },
  [V.FERN]: { ramp: 26, fn(k) {
    for (let i = 0; i < 6; i++) {
      const a = i * 1.047 + 0.2, col = P(i & 1 ? 0x2c6a48 : 0x347852, i & 1 ? 0x6a5a2c : 0x7c6834);
      blade(k, 0, 0, 44, 10, 1.0 + (i % 2) * 0.12, a, col, 4, { sx: 1.0, sz: 0.35, by: 6 });
    }
  } },
  [V.BUSH]: { ramp: 0, fn(k) {
    k.ico(25, { ...P(0x2f6a3c, 0x75622f, { sw: 0.45 }), y: 18, sy: 0.82 });
    k.ico(17, { ...P(0x3a7a46, 0x8b7538, { sw: 0.5 }), x: 24, z: 10, y: 12, sy: 0.8 });
  } },
  [V.SHROOM]: { ramp: 0, fn(k) {
    const m = [[0, 0, 15, 11], [17, 7, 10, 8]];
    m.forEach(([x, z, h, r]) => {
      k.cyl(2.6, 3.6, h, 4, { c: 0xb0a88c, d: 0xa89a82, x, z });
      k.cone(r, r * 0.7, 5, { c: [0.30, 0.62, 0.66], d: [0.66, 0.30, 0.40], x, z, y: h - 1, e: true });
    });
  } },
  [V.LOG]: { ramp: 0, fn(k) {
    const bark = P(0x5b4630, 0x4f3a2a);
    k.cyl(10, 12, 118, 5, { ...bark, ctr: true, rz: Math.PI / 2, y: 11 });
    k.cyl(2.6, 4, 36, 3, { ...bark, ctr: true, rz: 0.9, x: -12, y: 26, z: 6 });
    k.cyl(2.2, 3.4, 30, 3, { ...bark, ctr: true, rz: -0.8, x: 26, y: 24, z: -8, ry: 0.7 });
  } },
  [V.TWIGS]: { ramp: 0, fn(k) {
    const w = P(0x5e4a34, 0x54402e);
    [[0, 0, 0.0, 70], [14, 12, 0.9, 56], [-10, 20, 2.1, 48]].forEach(([x, z, ry, l]) => k.cyl(2.2, 3, l, 3, { ...w, ctr: true, rz: Math.PI / 2, ry, x, z, y: 3 }));
  } },
  [V.BONES]: { ramp: 0, fn(k) {
    const b = P(0x9d9279, 0x8f8068);
    k.ico(8.5, { ...b, y: 6, sy: 0.85, x: 6 });
    k.cyl(2.4, 2.8, 36, 3, { ...b, ctr: true, rz: Math.PI / 2, ry: 0.5, x: -16, z: 14, y: 2.5 });
    k.cyl(2.2, 2.6, 30, 3, { ...b, ctr: true, rz: Math.PI / 2, ry: -0.6, x: -10, z: -12, y: 2.5 });
  } },
  [V.PILLAR]: { ramp: 0, fn(k) {
    const s = P(0x6b7274, 0x796250);
    k.cyl(13, 16, 52, 6, { ...s });
    k.oct(17, 9, 15, { c: 0x5a6264, d: 0x66523f, y: 53, rz: 0.2 });
    k.cyl(12, 12, 34, 6, { ...s, ctr: true, rz: Math.PI / 2, ry: 0.4, x: 42, z: 14, y: 12 });
  } },
  [V.REED]: { ramp: 60, fn(k) {
    const g = [P(0x58763a, 0x7b6e3c), P(0x4c6a34, 0x6e6234), P(0x628040, 0x867842)];
    [[0, 0, 80, 0.1], [9, 5, 94, 0.2], [-8, 7, 70, 0.28], [5, -9, 86, 0.15], [-10, -4, 62, 0.3]].forEach(([x, z, h, t], i) => blade(k, x, z, h, 3.2, t, i * 1.7, g[i % 3]));
    [[9, 5, 94], [5, -9, 86]].forEach(([x, z, h], i) => k.cyl(3, 3, 13, 3, { c: 0x4a3626, d: 0x4e3a28, x: x - 4 * (i ? -1 : 1) * 0.3, z, y: h - 18, sw: 1 }));
  } },
  [V.LILY]: { ramp: 0, fn(k) {
    k.cyl(17, 17, 1.6, 7, { c: 0x2c6a44, d: 0x5c6a30, y: 0 });
    k.cyl(10, 10, 1.6, 6, { c: 0x347852, d: 0x6a7836, x: 26, z: 10, y: 0.4, ry: 0.7 });
    k.oct(4.5, 4, 4.5, { c: 0xb89aa6, d: 0xb8825a, y: 4 });
  } },
  [V.CARGO]: { ramp: 0, fn(k) {
    k.box(26, 24, 26, { c: 0x3a7a72, d: 0x9a4430, ry: 0.15 });
    k.box(29, 3, 29, { c: 0x2c5a54, d: 0x6c2c20, y: 24, ry: 0.15 });
    k.cyl(10.5, 12, 30, 5, { c: 0x2e625c, d: 0x7c3622, x: 32, z: 8 });
  } },
  [V.BANNER]: { ramp: 0, fn(k) {
    k.cyl(2.4, 3.2, 124, 4, { c: 0x3b3029, d: 0x33271f });
    k.box(2, 38, 30, { c: 0x2fa093, d: 0xb83a28, x: 0, y: 78, z: 17, sw: 1 });
    k.oct(4.5, 7, 4.5, { c: 0x8a8670, d: 0x9a7040, y: 128 });
  } },
};

// ---------------------------------------------------------------------------------------------------------------------------------
// scatter (pure)
const F_ROADEDGE = 1, F_SHORE = 2, F_WALKNEAR = 4;
const SOLID_EXCL = { tower: 125, barracks: 205, fort: 340, fountain: 280, shop: 165, lantern: 45, filler: 115, camp: 150, outpost: 150, lotus: 150, gate: 170, roshan: 230 };

/** per-tile context: forest = TREE tiles in the 5x5 block, cliff = 2 (foot of a higher wall, 8-neighbourhood) / 1 (within 2 tiles) / 0, flags */
export function tileContext(map) {
  const { w, h, type, elev, ramp } = map;
  const forest = new Uint8Array(w * h), cliff = new Uint8Array(w * h), flags = new Uint8Array(w * h);
  const walk = (t) => t === TT.GRASS || t === TT.ROAD || t === TT.WATER;
  for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
    const j = ty * w + tx, t = type[j]; let f = 0, c = 0, cl = 0, road = 0, water = 0, wk = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = tx + dx, y = ty + dy; if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const k = y * w + x, tk = type[k], near = Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
      if (tk === TT.TREE) c++;
      if (tk === TT.WALL && !ramp[k]) { if (near && elev[k] > elev[j]) cl = 2; else if (!cl && elev[k] > elev[j]) cl = 1; }
      if (near && tk === TT.ROAD) road++;
      if (near && tk === TT.WATER) water++;
      if (walk(tk)) wk++;
    }
    forest[j] = c; cliff[j] = cl;
    if (t === TT.GRASS && road) f |= F_ROADEDGE;
    if (t === TT.ROAD && road < 9) f |= F_ROADEDGE;
    if (t === TT.GRASS && water) f |= F_SHORE;
    if (wk) f |= F_WALKNEAR;
    flags[j] = f;
  }
  return { forest, cliff, flags };
}

function weightsFor(w, c) {
  w.fill(0);
  const { t, forest, cliff, side, shore, roadEdge, camp, rosh, wd, dire } = c;
  const fk = Math.min(1, forest / 9);
  if (t === TT.ROAD) { if (roadEdge) { w[V.SCREE] = 0.05; w[V.TUFT] = 0.012; } return; }          // lanes stay clear: a few edge pebbles
  if (t === TT.WATER) {
    if (wd <= 1.05) { w[V.REED] = 0.2; w[V.LILY] = 0.07; } else if (wd <= 3.3) w[V.LILY] = 0.11;
    return;
  }
  if (t === TT.WALL) {                                                                              // cliff tops / high ground rim
    w[V.ROCK] = 0.07; w[V.BOULDER] = 0.025; w[V.SCREE] = 0.06; w[V.TUFT] = 0.05; w[V.BUSH] = 0.025; w[V.PILLAR] = dire ? 0.014 : 0.006; w[V.FERN] = 0.015; w[V.BONES] = dire ? 0.008 : 0.002;
    return;
  }
  if (t === TT.TREE) {                                                                              // forest floor: only the sunlit edge shows
    if (forest <= 19) { const e = 1 - forest / 20; w[V.FERN] = 0.12 * e; w[V.SHROOM] = 0.04 * e; w[V.TUFT] = 0.08 * e; w[V.BUSH] = 0.06 * e; w[V.LOG] = 0.012 * e; w[V.TWIGS] = 0.02 * e; w[V.ROCK] = 0.02 * e; }
    return;
  }
  // open grass
  w[V.TUFT] = dire ? 0.1 : 0.15; w[V.FERN] = 0.018; w[V.BUSH] = 0.022; w[V.ROCK] = 0.03; w[V.SCREE] = 0.035; w[V.SHROOM] = dire ? 0.012 : 0.008;
  w[V.TWIGS] = 0.022; w[V.BOULDER] = 0.005; w[V.LOG] = 0.004; w[V.BONES] = dire ? 0.012 : 0.003; w[V.PILLAR] = dire ? 0.007 : 0.003;
  if (fk > 0) {                                                                                     // tree edges: dense
    w[V.TUFT] += 0.2 * fk; w[V.FERN] += 0.22 * fk; w[V.BUSH] += 0.1 * fk; w[V.SHROOM] += 0.05 * fk; w[V.LOG] += 0.045 * fk; w[V.TWIGS] += 0.05 * fk; w[V.ROCK] += 0.03 * fk;
  }
  if (cliff) {                                                                                      // cliff feet: scree and boulders
    const k = cliff === 2 ? 1 : 0.4;
    w[V.SCREE] += 0.3 * k; w[V.ROCK] += 0.14 * k; w[V.BOULDER] += 0.06 * k; w[V.TUFT] += 0.05 * k; w[V.BUSH] += 0.03 * k; w[V.PILLAR] += dire ? 0.012 * k : 0.004 * k; w[V.BONES] += dire ? 0.01 * k : 0.003 * k;
  }
  if (shore) { w[V.REED] = 0.28; w[V.TUFT] += 0.08; w[V.ROCK] += 0.04; w[V.SCREE] += 0.04; }
  if (camp) { w[V.ROCK] += 0.07 * camp; w[V.BONES] += (dire ? 0.04 : 0.025) * camp; w[V.TUFT] += 0.08 * camp; w[V.SCREE] += 0.06 * camp; w[V.BOULDER] += 0.02 * camp; w[V.TWIGS] += 0.04 * camp; }
  if (rosh) { w[V.ROCK] += 0.1 * rosh; w[V.BONES] += 0.06 * rosh; w[V.SCREE] += 0.12 * rosh; w[V.BOULDER] += 0.04 * rosh; w[V.PILLAR] += 0.02 * rosh; }
  if (roadEdge) { for (let i = 0; i < NV; i++) w[i] *= 0.35; w[V.SCREE] += 0.03; }                // keep lanes readable
}

/**
 * Deterministic scatter over the whole map. Returns { n, data (packed GPU layout, sorted by cell then variant), vari (variant of each
 * instance), keyStart (CSR over cell * NV + variant), GW, GH, cellMaxH, counts }.
 */
export function scatterClutter(map = getMap(), { density = 1 } = {}) {
  const { w: MW, h: MH, tile, x0, y1, type, ramp } = map;
  const ctx = tileContext(map), wdArr = waterDepth(map), W = MW * tile, H = MH * tile;
  const tileOf = (x, y) => { const tx = Math.floor((x - x0) / tile), ty = Math.floor((y1 - y) / tile); return tx < 0 || ty < 0 || tx >= MW || ty >= MH ? -1 : ty * MW + tx; };
  // entity exclusion + attractors
  const ents = [];
  for (const kind in SOLID_EXCL) for (const e of map.ents[kind] || []) ents.push({ x: e.x, y: e.y, r: SOLID_EXCL[kind], kind });
  const EC = 256, eg = new Map();
  ents.forEach((e, i) => { for (let cx = Math.floor((e.x - e.r) / EC); cx <= Math.floor((e.x + e.r) / EC); cx++) for (let cy = Math.floor((e.y - e.r) / EC); cy <= Math.floor((e.y + e.r) / EC); cy++) { const k = cx * 4096 + cy; (eg.get(k) || eg.set(k, []).get(k)).push(i); } });
  const blocked = (x, y, pad = 0, skip = -1) => { const l = eg.get(Math.floor(x / EC) * 4096 + Math.floor(y / EC)); if (!l) return false; for (const i of l) { if (i === skip) continue; const e = ents[i]; if (Math.hypot(x - e.x, y - e.y) < e.r + pad) return true; } return false; };
  const TC = 128, tg = new Map();
  map.trees.forEach((t, i) => { const k = Math.floor(t[0] / TC) * 4096 + Math.floor(t[1] / TC); (tg.get(k) || tg.set(k, []).get(k)).push(i); });
  const nearTree = (x, y, r) => { for (let cx = Math.floor((x - r) / TC); cx <= Math.floor((x + r) / TC); cx++) for (let cy = Math.floor((y - r) / TC); cy <= Math.floor((y + r) / TC); cy++) { const l = tg.get(cx * 4096 + cy); if (l) for (const i of l) if (Math.hypot(map.trees[i][0] - x, map.trees[i][1] - y) < r) return true; } return false; };
  const camps = (map.ents.camp || []), roshans = (map.ents.roshan || []);
  const nearest = (list, x, y) => { let d = 1e9; for (const e of list) { const q = Math.hypot(e.x - x, e.y - y); if (q < d) d = q; } return d; };

  const rec = [];                                     // { v, x, y, yaw, sc, ph, side }
  const wts = new Float32Array(NV), c = {};
  const emit = (v, x, y, h, side) => {
    const sc = scaleOf(v, h(1)), yaw = h(2) * Math.PI * 2;
    rec.push({ v, x, y, yaw, sc, ph: h(3) * 6.2832, side });
  };
  const GX = Math.floor(W / GRID), GY = Math.floor(H / GRID);
  for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) {
    const seed = (gy * 7919 + gx) * 8;
    const x = x0 + (gx + hash01(seed)) * GRID, y = y1 - (gy + hash01(seed + 1)) * GRID;
    const j = tileOf(x, y); if (j < 0 || ramp[j]) continue;
    const t = type[j];
    if (t === TT.WALL && (!(ctx.flags[j] & F_WALKNEAR) || isDeepVoid(map, j % MW, (j / MW) | 0))) continue;
    if (t !== TT.WALL && t !== TT.GRASS && t !== TT.ROAD && t !== TT.WATER && t !== TT.TREE) continue;
    if (blocked(x, y)) continue;
    const tx = j % MW, ty = (j / MW) | 0, side = tileSide(map, tx, ty);
    const dc = nearest(camps, x, y), dr = nearest(roshans, x, y);
    c.t = t; c.forest = ctx.forest[j]; c.cliff = ctx.cliff[j]; c.side = side; c.dire = side === 1; c.roadEdge = !!(ctx.flags[j] & F_ROADEDGE); c.shore = !!(ctx.flags[j] & F_SHORE);
    c.wd = wdArr[j]; c.camp = dc < 520 ? 1 - dc / 520 : 0; c.rosh = dr < 900 ? 1 - dr / 900 : 0;
    weightsFor(wts, c);
    const r = hash01(seed + 2);
    let acc = 0, v = -1;
    for (let i = 0; i < NV; i++) { acc += wts[i] * density; if (r < acc) { v = i; break; } }
    if (v < 0) continue;
    if (BIG.has(v) && nearTree(x, y, 52)) continue;
    const h = (n) => hash01(seed + 3 + n);
    emit(v, x, y, h, side);
    // small clumps
    if (v === V.TUFT || v === V.FERN || v === V.REED || v === V.SHROOM || v === V.SCREE || v === V.TWIGS) {
      const extra = v === V.TUFT ? 2 : 1;
      for (let m = 0; m < extra; m++) {
        if (h(10 + m) < 0.45) continue;
        const a = h(20 + m) * 6.2832, d = 14 + h(30 + m) * 26, x2 = x + Math.cos(a) * d, y2 = y + Math.sin(a) * d, j2 = tileOf(x2, y2);
        if (j2 < 0 || type[j2] !== t || ramp[j2] || blocked(x2, y2)) continue;
        if (t === TT.GRASS && (ctx.flags[j2] & F_ROADEDGE) !== (ctx.flags[j] & F_ROADEDGE)) continue;
        emit(v, x2, y2, (n) => hash01(seed + 3 + n + 100 * (m + 1)), side);
      }
    }
  }

  // base props: crates / barrels / banners ringed around the buildings of each team
  const okGround = (x, y, skip) => { const j = tileOf(x, y); return j >= 0 && !ramp[j] && type[j] === TT.GRASS && !(ctx.flags[j] & F_ROADEDGE) && !blocked(x, y, 18, skip) && !nearTree(x, y, 60); };
  const CFG = { barracks: [V.BANNER, V.BANNER, V.CARGO, V.CARGO], tower: [V.CARGO, V.CARGO], fort: [V.BANNER, V.BANNER, V.BANNER, V.CARGO, V.CARGO], fountain: [V.BANNER, V.BANNER, V.CARGO, V.CARGO], shop: [V.CARGO, V.CARGO], filler: [V.CARGO] };
  ents.forEach((e, ei) => {
    const list = CFG[e.kind]; if (!list) return;
    list.forEach((v, k) => {
      const seed = 900000 + ei * 1024 + k * 128;
      for (let tries = 0; tries < 24; tries++) {
        const a = hash01(seed + tries) * 6.2832, d = e.r + 20 + hash01(seed + 20 + tries) * 150;
        const x = e.x + Math.cos(a) * d, y = e.y + Math.sin(a) * d;
        if (!okGround(x, y, ei)) continue;
        emit(v, x, y, (n) => hash01(seed + 40 + n), sideOf(x, y));
        break;
      }
    });
  });

  // bucket: cell x variant, counting sort
  const GW = Math.ceil(W / CELL), GH = Math.ceil(H / CELL), keys = GW * GH * NV, n = rec.length;
  const keyOf = (r) => (Math.floor((r.x - x0) / CELL) + Math.floor((y1 - r.y) / CELL) * GW) * NV + r.v;
  const keyStart = new Int32Array(keys + 1);
  for (const r of rec) keyStart[keyOf(r) + 1]++;
  for (let i = 0; i < keys; i++) keyStart[i + 1] += keyStart[i];
  const fill = keyStart.slice(0, keys), data = new Float32Array(n * STRIDE), vari = new Uint8Array(n), cellMaxH = new Float32Array(GW * GH), counts = new Int32Array(NV);
  for (const r of rec) {
    const key = keyOf(r), i = fill[key]++, z = heightAt(r.x, r.y), o = i * STRIDE;
    data[o] = r.x; data[o + 1] = z - 1.5; data[o + 2] = -r.y; data[o + 3] = r.yaw; data[o + 4] = r.sc; data[o + 5] = r.ph; data[o + 6] = r.side;
    vari[i] = r.v; counts[r.v]++;
    const ci = (key / NV) | 0; if (z > cellMaxH[ci]) cellMaxH[ci] = z;
  }
  return { n, data, vari, keyStart, GW, GH, cellMaxH, counts, stride: STRIDE };
}

function scaleOf(v, h) {
  switch (v) {
    case V.ROCK: return 0.7 + 0.8 * h * h;
    case V.BOULDER: return 0.8 + 0.6 * h;
    case V.SCREE: return 0.8 + 0.6 * h;
    case V.TUFT: return 0.9 + 0.7 * h;
    case V.FERN: return 0.8 + 0.5 * h;
    case V.BUSH: return 0.75 + 0.6 * h;
    case V.SHROOM: return 0.8 + 0.5 * h;
    case V.LOG: return 0.8 + 0.5 * h;
    case V.REED: return 0.8 + 0.5 * h;
    case V.LILY: return 1 + 0.6 * h;
    case V.BANNER: return 1.1 + 0.1 * h;
    case V.CARGO: return 1.25 + 0.3 * h;
    default: return 0.85 + 0.35 * h;
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// rendering
const VERT = /* glsl */ `
${COMMON_GLSL.split('float bayer4')[0]}
attribute vec3 aCol, aCol2;
attribute float aSw, aEmit;
attribute vec3 iPos;
attribute vec4 iXf;
varying vec3 vW, vN, vFoot, vCol;
varying float vLY, vPh, vEm;
${DEPTH_GLSL}
${WIND_GLSL}
void main(){
  vec3 p = position;
  float ph = iXf.z, sw = aSw * aSw;
  if (uWind > 0.) {                                             // base breeze (wind off at low quality)
    p.x += uWind * sw * 6. * sin(uTime * 1.7 + ph + position.x * .02);
    p.z += uWind * sw * 3.5 * sin(uTime * 1.3 + ph * 1.7 + position.z * .02);
  }
  float c = cos(iXf.x), s = sin(iXf.x);
  vec3 w = iPos + vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c) * iXf.y;
  if (uWind > 0. && uWN > 0 && sw > 0.) {                       // spell gusts (wind.js): grass / bushes ripple outward or around the impact
    vec2 g = gustAt(iPos.xz) * (.8 + .4 * sin(uTime * 6. + ph * 3.)) * (uWind * sw * 20. * iXf.y);
    w.xz += g; w.y -= length(g) * .18;
  }
  vW = w; vN = vec3(normal.x * c + normal.z * s, normal.y, -normal.x * s + normal.z * c); vFoot = iPos;
  vLY = position.y; vPh = ph; vEm = aEmit;
  vCol = mix(aCol, aCol2, iXf.w);
  vec4 cr = projectionMatrix * viewMatrix * vec4(w, 1.);
#ifdef SHADOW
  gl_Position = cr;
#else
  gl_Position = propDepth(cr, iPos, 6. * iXf.y);
#endif
}`;

const FRAG = /* glsl */ `
precision highp float;
${COMMON_GLSL}
uniform float uRimOn;
varying vec3 vW, vN, vFoot, vCol;
varying float vLY, vPh, vEm;
void main(){
  vec3 n = normalize(vN);
  bool top = abs(n.y) > .6;
  vec2 dp = top ? floor(vW.xz / 6.) : vec2(floor((vW.x + vW.z) / 6.), floor(vW.y / 6.));
  vec3 alb = vCol;
  alb *= .84 + .32 * fract(sin(vPh * 91.7) * 4375.5);                  // per-instance tint
  alb *= .95 + .1 * fract(sin(dot(floor(dp / 2.), vec2(12.9898, 78.233))) * 43758.5453);
  alb *= mix(.74, 1., smoothstep(0., 14., vLY));                       // contact darkening
  vec3 pl = pointLights(vW + n * 8., n, .5);
  float sh = shadowAt(vW, n, dp);
  vec3 L = quantL(shadowAmb(sh) + uKeyCol * (max(dot(n, uKeyDir), 0.) * sh) + pl, dp);
  vec3 col = alb * L;
  vec3 v = normalize(uCamPos - vW);
  float fr = pow(1. - max(dot(n, v), 0.), 3.);
  float kf = smoothstep(-.1, .6, dot(n, uKeyDir)) * mix(.35, 1., sh);
  col += uRimOn * .55 * (uRimKey * fr * (.3 + kf) + pl * fr * .5);
  col += vEm * vCol * (.5 * uNight * (.82 + .18 * sin(uTime * 1.3 + vPh * 3.)));   // mushroom caps: faint glow at night only
  gl_FragColor = vec4(col * fogBright(vFoot, dp), 1.);
}`;

const IFLOATS = [['iPos', 3], ['iXf', 4]];

export function createClutter3d({ scene, uniforms, max = 1800, scatter } = {}) {
  const map = getMap();
  const data = scatter || scatterClutter(map);
  const rimU = { value: 1 };
  const group = new THREE.Group(); group.name = 'clutter3d'; scene.add(group);
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { ...uniforms, uRimOn: rimU }, side: THREE.FrontSide });
  const depthMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: DEPTH_FRAG, uniforms: mat.uniforms, side: THREE.DoubleSide, defines: { SHADOW: 1 } });
  const vars = [], stats = { draws: 0, tris: 0, instances: 0, cells: 0, total: data.n, ms: 0 };
  for (let v = 0; v < NV; v++) {
    const kit = createKit(1); MESHES[v].fn(kit);
    const merged = kit.build(), ramp = MESHES[v].ramp;
    if (ramp) { const sw = merged.attributes.aSw, pos = merged.attributes.position; for (let i = 0; i < sw.count; i++) sw.setX(i, sw.getX(i) * Math.min(1, Math.max(0, pos.getY(i) / ramp))); }
    const inst = instancedGeo(merged, max, IFLOATS);
    const mesh = new THREE.Mesh(inst.geo, mat); mesh.userData.depthMat = depthMat; mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.name = 'clutter3d_' + v; mesh.renderOrder = 1;
    mesh.visible = false; group.add(mesh);
    vars.push({ inst, mesh, n: 0, tris: inst.tris });
  }
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), box = new THREE.Box3(), lo = new THREE.Vector3(), hi = new THREE.Vector3();
  const { GW, GH, keyStart, cellMaxH } = data, src = data.data;
  const MARGIN = 150;
  const api = {
    group, stats, data, enabled: true, density: 1,   // density < 1 thins every cell evenly (quality)
    /** cull to the camera view and fill the instance buffers. (tx, ty) = camera target, visW / visH = visible size at the target */
    update(camera, tx, ty, visW, visH) {
      const t0 = performance.now();
      for (const t of vars) t.n = 0;
      let cells = 0;
      if (api.enabled) {
        pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pv);
        const x0 = map.x0, y1 = map.y1;
        const cx0 = Math.max(0, Math.floor((tx - visW * 0.95 - x0) / CELL)), cx1 = Math.min(GW - 1, Math.floor((tx + visW * 0.95 - x0) / CELL));
        const cy0 = Math.max(0, Math.floor((y1 - (ty + visH * 1.7)) / CELL)), cy1 = Math.min(GH - 1, Math.floor((y1 - (ty - visH * 0.9)) / CELL));
        for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
          const ci = cy * GW + cx, a = keyStart[ci * NV], b = keyStart[ci * NV + NV]; if (a === b) continue;
          const wx = x0 + cx * CELL, zn = -(y1 - cy * CELL);
          lo.set(wx - MARGIN, -20, zn - MARGIN); hi.set(wx + CELL + MARGIN, cellMaxH[ci] + 130, zn + CELL + MARGIN); box.set(lo, hi);
          if (!frustum.intersectsBox(box)) continue;
          cells++;
          for (let v = 0; v < NV; v++) {
            const s = keyStart[ci * NV + v], e = keyStart[ci * NV + v + 1]; if (s === e) continue;
            const t = vars[v], room = t.inst.max - t.n;
            if (api.density >= 1) {
              const k = Math.min(e - s, room); if (k <= 0) continue;
              t.inst.data.set(src.subarray(s * STRIDE, (s + k) * STRIDE), t.n * STRIDE); t.n += k;
            } else {   // keep instance i when floor((i + 1) * density) steps up: an even, deterministic thinning
              const d = api.density;
              for (let i = s, a = 0; i < e && t.n < t.inst.max; i++) {
                const q = Math.floor((i - s + 1) * d); if (q === a) continue; a = q;
                t.inst.data.set(src.subarray(i * STRIDE, (i + 1) * STRIDE), t.n * STRIDE); t.n++;
              }
            }
          }
        }
      }
      let tris = 0, draws = 0, inst = 0;
      for (const t of vars) { flushInstances(t.inst, t.n); t.mesh.visible = t.n > 0; if (t.n) { tris += t.n * t.tris; draws++; inst += t.n; } }
      stats.tris = tris; stats.draws = draws; stats.instances = inst; stats.cells = cells; stats.ms = performance.now() - t0;
    },
    setRim(on) { rimU.value = on ? 1 : 0; },
    /** shadow casters: the big props only. [{ mesh, mat }] */
    casters() { return CASTERS.map((v) => ({ mesh: vars[v].mesh, mat: depthMat })); },
    dispose() { for (const t of vars) t.inst.geo.dispose(); mat.dispose(); depthMat.dispose(); scene.remove(group); },
  };
  return api;
}
