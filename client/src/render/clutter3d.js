// 3D ground clutter: rocks, scree, grass / ferns / bushes, mushrooms, fallen logs, bones, ruin pillars, reeds, lily pads and
// base props (crates / barrels / banners). Every prop except the tufts is a hand-authored voxel model (shared/vox/world/clutter.js + rocks.js, meshed by
// clutterVox.js), a Radiant and a Dire set, each with a few shapes: ONE instanced draw per (variant, side, shape) "slot" (a variant's scatter range is split by
// the instance's side and phase), all sharing ONE material (so three skips re-uploading uniforms between draws), lit / shadowed / fogged / Bayer-quantised exactly like trees3d.js.
//
// The scatter (scatterClutter) is pure and deterministic: it runs once over the map grid, and the result is bucketed by
// 256u cell x variant into one packed buffer that is already in GPU layout, so the per-frame work is "frustum-test a few
// dozen cells and memcpy their ranges".
//
// Voxel ground (terrain.js voxtEnabled, `?voxt=0` off): the low-poly TUFT / FERN scatter is replaced by "sparse raised tufts" as in the offline reference
// (tools/art/terrain.mjs): 1-3 axis-aligned cubes of one ground cell (VOX_CELL), snapped to the terrain's cell grid, in the ground preset's top[4] tone
// (tops lightened toward the preset light, sides darkened), mostly 2-3 stacked. The two slots keep their ids: V.TUFT = base tone cubes, V.FERN = highlight tone cubes (palette = the side field), drawn by a second material (VOXC).
import * as THREE from 'three';
import { WIND_GLSL } from './wind.js';
import { COMMON_GLSL } from './shaderlib.js';
import { DEPTH_FRAG } from './shadow.js';
import { createKit, instancedGeo, flushInstances, hash01, DEPTH_GLSL } from './mesh3d.js';
import { tileSide, waterDepth, isDeepVoid } from './terrainGeo.js';
import { getMap, heightAt, TT, sideOf } from '../../../shared/map.js';
import { voxtEnabled, VOX_CELL, VOX_FOREST_DIM, VOX_MACRO } from './terrain.js';
import { TERRAINS } from '../../../shared/vox/terrain.js';
import { hex, mix } from '../../../shared/vox/vox.js';
import { slotGeo, slotOf, slotCount, SPECS } from './clutterVox.js';

export const V = { ROCK: 0, BOULDER: 1, SCREE: 2, TUFT: 3, FERN: 4, BUSH: 5, SHROOM: 6, LOG: 7, TWIGS: 8, BONES: 9, PILLAR: 10, REED: 11, LILY: 12, CARGO: 13, BANNER: 14 };
export const NV = 15;
const NAME = Object.keys(V);   // variant id -> name (V is declared in id order)
export const CELL = 256;
const STRIDE = 7;                       // x, y(up), z, yaw, scale, phase, side
const GRID = 64;                        // jittered-grid pitch (world units)
const CASTERS = [V.ROCK, V.BOULDER, V.LOG, V.PILLAR, V.CARGO];
const VOX = voxtEnabled;                // voxel ground on: TUFT / FERN become cell-snapped cubes (see header)
const VOX_P = { grass: 0.0045, road: 0.0015, forest: 0.0045 };   // base-cell probability of a tuft: share of ground cells
const VOX_SHAPE = [0.1, 0.22, 0.58, 0.85];   // cumulative: single / flat pair / stack of 2 / stack of 3 / L (pair, one of them stacked); biased tall
const VOX_HI = 0.3;                     // share of lone / flat cubes in the highlight tone (top[4] lightened; the rest top[4]); stack tops are always highlight
const VOX_LITE = 0.3, VOX_SIDE_K = 0.58, VOX_TOP_K = 1.06;   // highlight tint toward the preset light colour; side face / top face albedo factors (sides clearly darker)
const LOD_DIST = 900;                   // eye-to-cell distance past which the voxel props use their half-resolution grid
const VOX_MAX = 8000;                  // instance buffer of each voxel tone variant (cubes are 1 instance each)
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

/** one ground cell cube, base at y 0 (aPart = tone: 0 top[4], 1 top[4] lightened) */
const voxCube = (tone) => ({ ramp: 0, fn(k) { k.box(VOX_CELL, VOX_CELL, VOX_CELL, { part: tone }); } });

const MESHES = {
  [V.TUFT]: VOX ? voxCube(0) : { ramp: 34, fn(k) {
    for (let i = 0; i < 8; i++) {
      const a = i * 2.4, rr = 3 + (i % 3) * 3;
      blade(k, Math.cos(a) * rr, Math.sin(a) * rr, 30 + (i * 7) % 18, 4.2, 0.2 + (i % 4) * 0.12, a + 0.6, GRASS[i % 3]);
    }
  } },
  [V.FERN]: VOX ? voxCube(1) : { ramp: 26, fn(k) {
    for (let i = 0; i < 6; i++) {
      const a = i * 1.047 + 0.2, col = P(i & 1 ? 0x2c6a48 : 0x347852, i & 1 ? 0x6a5a2c : 0x7c6834);
      blade(k, 0, 0, 44, 10, 1.0 + (i % 2) * 0.12, a, col, 4, { sx: 1.0, sz: 0.35, by: 6 });
    }
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

/** palettes of the voxel tufts (the side field of an instance): ground presets as terrain.js picks them; [top[4], top[4] toward the preset light] per palette */
const VOX_PAL = [TERRAINS.grass, TERRAINS.dire, TERRAINS.grass, TERRAINS.dire, TERRAINS.dirt].map((T, i) => [0, VOX_LITE].map((l) => { const c = mix(hex(T.top[4]), hex(T.light), l); return i === 2 || i === 3 ? mix(c, hex(T.shadow), VOX_FOREST_DIM) : c; }));
const NB8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];   // tile neighbours (dx, dy), dy + = south
const VOX_REACH = 26.5, VOX_SIDE = 13.5, VOX_LIP = 22, VOX_WET = 12;   // world units: terrain shader blend reach (4.4 art px), side swap (half), cliff lip / AO, wet edge
const tprio = (t) => (t === TT.WATER ? 0 : t === TT.ROAD ? 1 : t === TT.GRASS ? 2 : t === TT.TREE ? 3 : 4);   // terrain.js prio(): water < road < grass < forest < rock

/**
 * Sparse raised tufts for the voxel ground: pushes { v (V.TUFT base tone / V.FERN highlight tone), x, y, yaw 0, sc 1, ph 0, side = palette, lift } per cube. Cubes sit on the
 * terrain's VOX_CELL grid (cell centres, world xz = three xz with z = -y); only on cells whose ground the terrain shader paints as plain grass / forest floor / road
 * dirt (no lip, AO, wet edge, side swap or kind bleed within reach of a border), never on water, shore, cliffs, rock or stairs. Pure and deterministic.
 */
function scatterVoxTufts(map, ctx, blocked, push) {
  const { w: MW, h: MH, tile, x0, y1, type, ramp, elev } = map, C = VOX_CELL, info = new Array(MW * MH), taken = new Set();
  const tileInfo = (tx, ty) => {
    if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return null;
    const j = ty * MW + tx; if (info[j] !== undefined) return info[j];
    const t = type[j], side = tileSide(map, tx, ty); let r = null;
    if ((t === TT.GRASS || t === TT.TREE || t === TT.ROAD) && !ramp[j] && !(t === TT.GRASS && (ctx.flags[j] & F_SHORE))) {
      const myP = tprio(t), hz = new Float32Array(8);
      NB8.forEach(([dx, dy], i) => {
        const nx = tx + dx, ny = ty + dy; if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) return;
        const nj = ny * MW + nx, nt = type[nj]; if (nt === TT.OUT) return;
        if (ramp[nj]) hz[i] = VOX_LIP;
        else if (elev[nj] !== elev[j]) hz[i] = VOX_LIP;
        else { const np = tprio(nt); hz[i] = np > myP ? VOX_REACH : np === 0 ? VOX_WET : np === myP && t !== TT.ROAD && tileSide(map, nx, ny) !== side ? VOX_SIDE : 0; }
      });
      r = { tx, ty, t, hz, any: hz.some((v) => v > 0), pal: t === TT.ROAD ? 4 : (t === TT.TREE ? 2 : 0) + side, j };
    }
    return info[j] = r;
  };
  const ok = (tf, cx, cz) => {   // cell (cx, cz) centre lies in tile tf and is clear of every border hazard
    const px = (cx + 0.5) * C, pz = (cz + 0.5) * C;
    if (tf.any) {
      const lx = px - (x0 + tf.tx * tile), ly = (y1 - tf.ty * tile) + pz;
      for (let i = 0; i < 8; i++) {
        const r = tf.hz[i]; if (!r) continue;
        const [dx, dy] = NB8[i], ex = dx < 0 ? lx : dx > 0 ? tile - lx : 0, ey = dy < 0 ? ly : dy > 0 ? tile - ly : 0;
        if (ex * ex + ey * ey < r * r) return false;
      }
    }
    return !blocked(px, -pz);
  };
  const tileAt = (cx, cz) => tileInfo(Math.floor(((cx + 0.5) * C - x0) / tile), Math.floor((y1 + (cz + 0.5) * C) / tile));
  const key = (cx, cz) => (cx + 4096) * 8192 + (cz + 4096);
  const ADJ = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let ty = 0; ty < MH; ty++) for (let tx = 0; tx < MW; tx++) {
    const tf = tileInfo(tx, ty); if (!tf) continue;
    const j = tf.j, fo = ctx.forest[j];
    const P = tf.t === TT.ROAD ? VOX_P.road : tf.t === TT.TREE ? (fo <= 19 ? VOX_P.forest * (1 - fo / 20) : 0) : VOX_P.grass;
    if (P <= 0) continue;
    const xa = x0 + tx * tile, za = -y1 + ty * tile, cx0 = Math.ceil(xa / C - 0.5), cz0 = Math.ceil(za / C - 0.5);
    const nx = Math.ceil((xa + tile) / C - 0.5) - cx0, nz = Math.ceil((za + tile) / C - 0.5) - cz0;
    const seed = 1500000 + j * 16, h = (n) => hash01(seed + n);
    const m = Math.floor(P * nx * nz + h(0));
    for (let q = 0; q < m; q++) {
      const cx = cx0 + Math.min(nx - 1, Math.floor(h(1 + q * 2) * nx)), cz = cz0 + Math.min(nz - 1, Math.floor(h(2 + q * 2) * nz));
      if (taken.has(key(cx, cz)) || !ok(tf, cx, cz)) continue;
      const g = hash01(Math.imul(cx, 7919) + cz * 104729 + 31);   // per-cell, independent of the tile loop
      const g2 = (n) => hash01(Math.imul(cx, 7919) + cz * 104729 + 31 + n * 977);
      const cube = (x, z, lift, hi) => { taken.add(key(x, z)); push({ v: hi && tf.t !== TT.ROAD ? V.FERN : V.TUFT, x: (x + 0.5) * C, y: -(z + 0.5) * C, yaw: 0, sc: 1, ph: 0, side: tf.pal, lift }); };
      const pair = (g >= VOX_SHAPE[0] && g < VOX_SHAPE[1]) || g >= VOX_SHAPE[3], n = g < VOX_SHAPE[1] ? 1 : g < VOX_SHAPE[2] ? 2 : g < VOX_SHAPE[3] ? 3 : 2;
      for (let k = 0; k < n; k++) cube(cx, cz, k * C, k === n - 1 && n > 1 || g2(1) < VOX_HI);   // stack: tops highlight
      if (!pair) continue;
      const [ax, az] = ADJ[Math.floor(g2(2) * 4) & 3], bx = cx + ax, bz = cz + az, tb = tileAt(bx, bz);
      if (tb && tb.pal === tf.pal && !taken.has(key(bx, bz)) && ok(tb, bx, bz)) cube(bx, bz, 0, g2(3) < VOX_HI);
    }
  }
}

/**
 * Deterministic scatter over the whole map. Returns { n, data (packed GPU layout, sorted by cell then variant), vari (variant of each
 * instance), keyStart (CSR over cell * NV + variant), GW, GH, cellMaxH, counts }.
 */
export function scatterClutter(map = getMap(), { density = 1, vox = false } = {}) {
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
    if (vox && (v === V.TUFT || v === V.FERN)) continue;               // voxel ground: cubes instead (scatterVoxTufts), same rolls for every other variant
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

  if (vox) scatterVoxTufts(map, ctx, blocked, (r) => rec.push(r));

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
    data[o] = r.x; data[o + 1] = z - 1.5 + (r.lift || 0); data[o + 2] = -r.y; data[o + 3] = r.yaw; data[o + 4] = r.sc; data[o + 5] = r.ph; data[o + 6] = r.side;
    vari[i] = r.v; counts[r.v]++;
    const ci = (key / NV) | 0; if (z > cellMaxH[ci]) cellMaxH[ci] = z;
  }
  return { n, data, vari, keyStart, GW, GH, cellMaxH, counts, stride: STRIDE };
}

/** Instance scale. The voxel props keep a narrow range so their voxel size stays near one grain (a wide spread would mix coarse and fine cubes on screen). */
function scaleOf(v, h) {
  switch (v) {
    case V.ROCK: return 0.85 + 0.45 * h * h;
    case V.BOULDER: return 0.9 + 0.3 * h;
    case V.SCREE: return 0.9 + 0.3 * h;
    case V.TUFT: return 0.9 + 0.7 * h;
    case V.FERN: return 0.8 + 0.5 * h;
    case V.BUSH: return 0.85 + 0.3 * h;
    case V.SHROOM: return 0.9 + 0.3 * h;
    case V.LOG: return 0.9 + 0.25 * h;
    case V.REED: return 0.9 + 0.3 * h;
    case V.LILY: return 1 + 0.25 * h;
    case V.BANNER: return 1.05 + 0.1 * h;
    case V.CARGO: return 1.05 + 0.2 * h;
    default: return 0.95 + 0.15 * h;
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
#ifdef VOXC
attribute float aPart;
varying float vPal, vTone;
#endif
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
    vec2 g = gustAt(iPos.xz) * (.8 + .4 * sin(uTime * 6. + ph * 3.)) * (uWind * sw * 40. * iXf.y);
    w.xz += g; w.y -= length(g) * .18;
  }
  vW = w; vN = vec3(normal.x * c + normal.z * s, normal.y, -normal.x * s + normal.z * c); vFoot = iPos;
  vLY = position.y; vPh = ph; vEm = aEmit;
  vCol = mix(aCol, aCol2, iXf.w);
#ifdef VOXC
  vPal = iXf.w; vTone = aPart;
#endif
  vec4 cr = projectionMatrix * viewMatrix * vec4(w, 1.);
#ifdef SHADOW
  gl_Position = cr;
#else
  gl_Position = propDepth(cr, iPos, 6. * iXf.y);
#endif
}`;

// voxel tufts (VOXC): flat preset tone per palette (instance side field) x the terrain shader's own low-frequency cool<->warm tint of that ground cell
const VOXC_GLSL = /* glsl */ `
const float VOX_CELL = ${VOX_CELL.toFixed(3)};
const float VOX_MACRO = ${VOX_MACRO.toFixed(2)};
const vec3 VTC[${VOX_PAL.length * 2}] = vec3[${VOX_PAL.length * 2}](${VOX_PAL.flat().map((c) => 'vec3(' + c.map((v) => (v / 255).toFixed(4)).join(',') + ')').join(',')});
float tfHash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float tfNoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(tfHash(i), tfHash(i + vec2(1., 0.)), f.x), mix(tfHash(i + vec2(0., 1.)), tfHash(i + vec2(1., 1.)), f.x), f.y);
}`;

const FRAG = /* glsl */ `
precision highp float;
${COMMON_GLSL}
#ifdef VOXC
${VOXC_GLSL}
#endif
uniform float uRimOn;
varying vec3 vW, vN, vFoot, vCol;
varying float vLY, vPh, vEm;
#ifdef VOXC
varying float vPal, vTone;
#endif
void main(){
  vec3 n = normalize(vN);
  bool top = abs(n.y) > .6;
  vec2 dp = top ? floor(vW.xz / 6.) : vec2(floor((vW.x + vW.z) / 6.), floor(vW.y / 6.));
#ifdef VOXC
  vec3 alb = VTC[int(vPal + .5) * 2 + int(vTone + .5)];
  vec2 vc = floor(vFoot.xz / VOX_CELL), dqw = (vc + .5) * (VOX_CELL / 6.);
  float vq = floor((tfNoise(dqw * .009 + 3.) * .6 + tfNoise(dqw * .034 + 9.) * .4) * 5. + mix(tfHash(vc), bayer4(vc), .5)) / 5.;
  alb *= top ? ${VOX_TOP_K.toFixed(2)} : ${VOX_SIDE_K.toFixed(2)};                    // side faces clearly darker than the top
  alb *= mix(vec3(1.), mix(vec3(.84, .93, .98), vec3(1.07, 1.04, .92), clamp(vq * 1.25, 0., 1.)), VOX_MACRO * (vPal > 3.5 ? .8 : 1.));
#else
  vec3 alb = vCol;
  alb *= .84 + .32 * fract(sin(vPh * 91.7) * 4375.5);                  // per-instance tint
  alb *= .95 + .1 * fract(sin(dot(floor(dp / 2.), vec2(12.9898, 78.233))) * 43758.5453);
  alb *= mix(.74, 1., smoothstep(0., 14., vLY));                       // contact darkening
#endif
  vec3 pl = pointLights(vW + n * 8., n, .5);
  float sh = shadowAt(vW, n, dp);
  vec3 L = quantL(shadowAmb(sh) + uKeyCol * (max(dot(n, uKeyDir), 0.) * sh) + pl, dp);
  vec3 col = alb * L;
#ifndef VOXC
  vec3 v = normalize(uCamPos - vW);
  float fr = pow(1. - max(dot(n, v), 0.), 3.);
  float kf = smoothstep(-.1, .6, dot(n, uKeyDir)) * mix(.35, 1., sh);
  col += uRimOn * .55 * (uRimKey * fr * (.3 + kf) + pl * fr * .5);
  col += vEm * vCol * (.5 * uNight * (.82 + .18 * sin(uTime * 1.3 + vPh * 3.)));   // mushroom caps: faint glow at night only
#endif
  gl_FragColor = vec4(fogGrade(col, vFoot, dp), 1.);
}`;

const IFLOATS = [['iPos', 3], ['iXf', 4]];

export function createClutter3d({ scene, uniforms, max = 1800, scatter } = {}) {
  const map = getMap();
  const data = scatter || scatterClutter(map, { vox: VOX });
  const rimU = { value: 1 };
  const group = new THREE.Group(); group.name = 'clutter3d'; scene.add(group);
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { ...uniforms, uRimOn: rimU }, side: THREE.FrontSide });
  const depthMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: DEPTH_FRAG, uniforms: mat.uniforms, side: THREE.DoubleSide, defines: { SHADOW: 1 } });
  const voxMat = VOX ? new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: mat.uniforms, side: THREE.FrontSide, defines: { VOXC: 1 } }) : null;   // voxel tufts: shares the uniform objects
  const isVox = (v) => VOX && (v === V.TUFT || v === V.FERN);
  const vars = [], stats = { draws: 0, tris: 0, instances: 0, cells: 0, total: data.n, ms: 0 };
  const slotBase = new Int32Array(NV), routed = new Array(NV).fill(null);   // slot of a variant's first draw; routed[v] = voxel prop name (instances split by side / phase), null = one draw
  const addSlot = (v, name, merged, voxc) => {
    const inst = instancedGeo(merged, voxc ? Math.max(max, VOX_MAX) : max, IFLOATS);
    const mesh = new THREE.Mesh(inst.geo, voxc ? voxMat : mat); mesh.userData.depthMat = depthMat; mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.name = 'clutter3d_' + name + vars.length; mesh.renderOrder = 1;
    mesh.visible = false; group.add(mesh);
    vars.push({ v, inst, mesh, n: 0, tris: inst.tris });
  };
  for (let v = 0; v < NV; v++) {
    slotBase[v] = vars.length;
    const name = NAME[v];
    if (SPECS[name]) {
      routed[v] = name;
      for (let lod = 0; lod < 2; lod++) for (let side = 0; side < 2; side++) for (let k = 0; k < SPECS[name].shapes; k++) addSlot(v, name, slotGeo(name, side, k, lod).geo, false);   // LOD 0 slots, then LOD 1
    } else {   // tufts: the one-cube / low-poly slots
      const kit = createKit(1); MESHES[v].fn(kit);
      const merged = kit.build(), ramp = MESHES[v].ramp;
      if (ramp) { const sw = merged.attributes.aSw, pos = merged.attributes.position; for (let i = 0; i < sw.count; i++) sw.setX(i, sw.getX(i) * Math.min(1, Math.max(0, pos.getY(i) / ramp))); }
      addSlot(v, name, merged, isVox(v));
    }
  }
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), box = new THREE.Box3(), lo = new THREE.Vector3(), hi = new THREE.Vector3();
  const { GW, GH, keyStart, cellMaxH } = data, src = data.data;
  const MARGIN = 150;
  const order = [], ordD = new Float32Array(GW * GH);
  const api = {
    group, stats, data, enabled: true, density: 1,   // density < 1 thins every cell evenly (quality)
    /** cull to the camera view and fill the instance buffers. (tx, ty) = camera target, visW / visH = visible size at the target; round = orbiting camera (yaw != 0): symmetric search radius instead of the north-up box */
    update(camera, tx, ty, visW, visH, round = false, reach = 0) {   // reach > 0 (showcase): a circle of that radius around the target, filled near-first
      const t0 = performance.now();
      for (const t of vars) t.n = 0;
      let cells = 0;
      // cells further than LOD_DIST from the eye get the half-resolution props (about a quarter of the triangles, same silhouette), chosen per 256u cell
      const lodR2 = LOD_DIST * LOD_DIST - camera.position.y * camera.position.y;
      if (api.enabled) {
        pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pv);
        const x0 = map.x0, y1 = map.y1;
        const rx = round ? Math.max(visW * 0.95, visH * 1.7, reach) : visW * 0.95, rN = round ? rx : visH * 1.7, rS = round ? rx : visH * 0.9;
        const cx0 = Math.max(0, Math.floor((tx - rx - x0) / CELL)), cx1 = Math.min(GW - 1, Math.floor((tx + rx - x0) / CELL));
        const cy0 = Math.max(0, Math.floor((y1 - (ty + rN)) / CELL)), cy1 = Math.min(GH - 1, Math.floor((y1 - (ty - rS)) / CELL));
        order.length = 0;
        const cpx = camera.position.x, cpz = camera.position.z, rr = (rx + CELL) * (rx + CELL);
        for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
          const ci = cy * GW + cx, a = keyStart[ci * NV], b = keyStart[ci * NV + NV]; if (a === b) continue;
          const wx = x0 + cx * CELL, zn = -(y1 - cy * CELL);
          if (reach > 0) { const ex = wx + CELL / 2 - tx, ey = (y1 - cy * CELL - CELL / 2) - ty; if (ex * ex + ey * ey > rr) continue; }
          lo.set(wx - MARGIN, -20, zn - MARGIN); hi.set(wx + CELL + MARGIN, cellMaxH[ci] + 130, zn + CELL + MARGIN); box.set(lo, hi);
          if (!frustum.intersectsBox(box)) continue;
          const dx = wx + CELL / 2 - cpx, dz = zn + CELL / 2 - cpz; ordD[ci] = dx * dx + dz * dz; order.push(ci);
        }
        if (reach > 0) order.sort((p, q) => ordD[p] - ordD[q]);
        for (let oi = 0; oi < order.length; oi++) {
          const ci = order[oi], lodOff = ordD[ci] > lodR2 ? 1 : 0;
          cells++;
          for (let v = 0; v < NV; v++) {
            const s = keyStart[ci * NV + v], e = keyStart[ci * NV + v + 1]; if (s === e) continue;
            if (routed[v]) {   // voxel prop: each instance goes to the slot of its side and shape (the phase field picks the shape); thinning as below
              const name = routed[v], base = slotBase[v], d = api.density, thin = d < 1;
              for (let i = s, a = 0; i < e; i++) {
                if (thin) { const q = Math.floor((i - s + 1) * d); if (q === a) continue; a = q; }
                const o = i * STRIDE, t = vars[base + lodOff * slotCount(name) + slotOf(name, src[o + 6], src[o + 5])];
                if (t.n >= t.inst.max) continue;
                t.inst.data.set(src.subarray(o, o + STRIDE), t.n * STRIDE); t.n++;
              }
              continue;
            }
            const t = vars[slotBase[v]], room = t.inst.max - t.n;
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
    casters() { const cv = new Set(VOX ? [...CASTERS, V.TUFT, V.FERN] : CASTERS); return vars.filter((t) => cv.has(t.v)).map((t) => ({ mesh: t.mesh, mat: depthMat })); },
    dispose() { for (const t of vars) t.inst.geo.dispose(); mat.dispose(); depthMat.dispose(); if (voxMat) voxMat.dispose(); scene.remove(group); },
  };
  return api;
}
