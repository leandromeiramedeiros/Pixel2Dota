// Terrain tile atlas: packs the ART `tiles` sheet (naming in client/src/art/sheets/tiles.js header) into one nearest-filtered
// texture; falls back to a small procedural dithered sheet with the same names when the sheet is missing.
// Water entries are 4 animation frames laid side by side (8 px apart); the shader offsets by frame.
import * as THREE from 'three';
import { shelfPack, nextPow2, rasterize, makeTexture } from '../art/atlas.js';
import { hash2 } from './terrainGeo.js';

/** Group sheet frames into atlas entries: { name, w, h, parts:[rows...] } */
export function groupTileFrames(frames) {
  const groups = new Map();
  const add = (name, idx, rows) => { if (!groups.has(name)) groups.set(name, []); groups.get(name)[idx] = rows; };
  for (const k in frames) {
    let m;
    if ((m = /^water_(\d)$/.exec(k))) add('water', +m[1], frames[k]);
    else if ((m = /^(water_e\d+)_(\d)$/.exec(k))) add(m[1], +m[2], frames[k]);
    else if ((m = /^(water_e\d+)$/.exec(k))) add(m[1], 0, frames[k]);
    else add(k, 0, frames[k]);
  }
  return [...groups].map(([name, parts]) => {
    parts = parts.filter(Boolean);
    const h = parts[0].length, w0 = Math.max(...parts[0].map((r) => r.length));
    return { name, parts, w: w0 * parts.length, h, pw: w0, x: 0, y: 0 };
  });
}

export function buildTerrainAtlas(tiles) {
  const def = tiles && tiles.frames ? tiles : proceduralTiles();
  const entries = groupTileFrames(def.frames);
  const W = 256, H = nextPow2(shelfPack(entries, W, 1));
  const data = new Uint8Array(W * H * 4), emit = new Uint8Array(W * H * 4);
  for (const e of entries) e.parts.forEach((rows, i) => rasterize(def, rows, data, W, e.x + i * e.pw, e.y, emit));
  // A = emission strength (/4), RGB = colour; tiles are opaque so alpha carries no coverage
  for (let i = 3; i < data.length; i += 4) data[i] = emit[i];
  const texture = makeTexture(data, W, H);
  const byName = new Map(entries.map((e) => [e.name, e]));
  const rgb = (name) => { const e = byName.get(name); if (!e) return [20, 20, 30]; const o = ((e.y + 3) * W + e.x + 3) * 4; return [data[o], data[o + 1], data[o + 2]]; };
  return {
    texture, width: W, height: H, def, entries,
    lookup(name) { const e = byName.get(name); return e ? { x: e.x, y: e.y, w: e.pw, h: e.h } : null; },
    has: (name) => byName.has(name),
    voidColor: rgb('void'),
    swatch: rgb,
  };
}

// ---- procedural fallback (same names as the ART sheet; plain dithered fills) ----
function proceduralTiles() {
  const pal = { a: '#2a6027', b: '#397a31', c: '#4a913d', d: '#68b04f', e: '#4a3a2a', f: '#7a5a3a', g: '#9a7a52', h: '#c4a46a', i: '#1c3a6c', j: '#2a5ca8', k: '#5aa0e0', l: '#cfeaff', m: '#4a4642', n: '#6a655e', o: '#8c867c', p: '#aaa498', q: '#1a1418', r: '#5a2a24', s: '#7a3c30', t: '#9a5a44', u: '#2a2018', v: '#3a2a1c' };
  const frames = {};
  const mk = (w, h, f) => Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => f(x, y)).join(''));
  const pick = (cs, x, y, s) => { const r = hash2(x, y, s); return cs[Math.min(cs.length - 1, (r * cs.length) | 0)]; };
  for (let v = 0; v < 6; v++) {
    frames['grass_r_' + v] = mk(8, 8, (x, y) => pick('abbcc d'.replace(' ', 'b'), x, y, v + 1));
    frames['grass_d_' + v] = mk(8, 8, (x, y) => pick('eeffg', x, y, v + 11));
  }
  frames.forest_r = mk(8, 8, (x, y) => pick('aaab', x, y, 21)); frames.forest_d = mk(8, 8, (x, y) => pick('uuve', x, y, 22));
  for (let v = 0; v < 4; v++) {
    frames['road_' + v] = mk(8, 8, (x, y) => pick('fgh', x, y, 31 + v));
    frames['water_' + v] = mk(8, 8, (x, y) => ((x + y + v * 2) % 4 === 0 ? 'k' : (x * 3 + y + v) % 5 === 0 ? 'j' : 'i'));
    frames['rock_top_' + v] = mk(8, 8, (x, y) => pick('mnno', x, y, 41 + v)); frames['rock_top_d_' + v] = mk(8, 8, (x, y) => pick('rsst', x, y, 51 + v));
    frames['cliff_r_' + v] = mk(8, 22, (x, y) => (y === 0 ? 'p' : y > 19 ? 'q' : y % 7 === 0 ? 'm' : pick('nnom', x, y, 61 + v)));
    frames['cliff_d_' + v] = mk(8, 22, (x, y) => (y === 0 ? 't' : y > 19 ? 'q' : y % 7 === 0 ? 'r' : pick('sstr', x, y, 71 + v)));
  }
  for (let m = 0; m < 16; m++) {
    const edge = (x, y) => (!(m & 1) && y < 2) || (!(m & 2) && x > 5) || (!(m & 4) && y > 5) || (!(m & 8) && x < 2);
    frames['road_e' + m] = mk(8, 8, (x, y) => (edge(x, y) ? 'e' : pick('fgh', x, y, 81)));
    for (let f = 0; f < 4; f++) frames['water_e' + m + (f ? '_' + f : '')] = mk(8, 8, (x, y) => (edge(x, y) ? 'h' : (x + y + f * 2) % 4 === 0 ? 'k' : 'i'));
  }
  frames.void = mk(8, 8, () => 'q');
  frames.stairs_0 = frames.stairs_1 = frames.stairs_d_0 = frames.stairs_d_1 = mk(8, 8, (x, y) => (y % 3 === 0 ? 'g' : 'f'));
  return { pal, anchor: [0, 0], emit: {}, frames };
}
export { THREE };
