// Pure terrain geometry: per-tile top quads from the shared corner heights + vertical cliff-wall quads wherever neighbouring
// tile edges differ in height. No Three/DOM so node can test it. Three coords: X = x, Y = z, Z = -y.
import { TT } from '../../../shared/map.js';

export const CHUNK = 32;
export const FACE = { TOP: 0, N: 1, E: 2, S: 3, W: 4 };
export const WALL_PERIOD = 128;   // world units covered by one cliff strip (22 px)
const EPS = 0.5;

export function hash2(x, y, s = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Radiant (0) / Dire (1) art side of a tile, with a hashed dither band across the x+y diagonal. */
export function tileSide(map, tx, ty) {
  const cx = map.x0 + (tx + 0.5) * map.tile, cy = map.y1 - (ty + 0.5) * map.tile, s = cx + cy, band = 900;
  if (Math.abs(s) >= band) return s < 0 ? 0 : 1;
  return hash2(tx, ty, 7) < 0.5 + 0.5 * (s / band) ? 1 : 0;
}

const typeAt = (map, tx, ty) => (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h ? TT.WALL : map.type[ty * map.w + tx]);

/** 4-bit mask: N=1 E=2 S=4 W=8, bit set = that neighbour has the SAME type (ART convention: clear bit draws a border). */
export function sameMask(map, tx, ty, type) {
  return (typeAt(map, tx, ty - 1) === type ? 1 : 0) | (typeAt(map, tx + 1, ty) === type ? 2 : 0) | (typeAt(map, tx, ty + 1) === type ? 4 : 0) | (typeAt(map, tx - 1, ty) === type ? 8 : 0);
}

/** Atlas name of a tile's top texture (see client/src/art/sheets/tiles.js header). */
export function tileName(map, tx, ty) {
  const j = ty * map.w + tx, t = map.type[j], side = tileSide(map, tx, ty), d = side ? 'd' : 'r', h = hash2(tx, ty);
  if (map.ramp[j] && t !== TT.WALL && t !== TT.TREE) {
    const c = map.corners, o = j * 4;
    const gx = (c[o + 1] + c[o + 3] - c[o] - c[o + 2]) / 2, gy = (c[o + 2] + c[o + 3] - c[o] - c[o + 1]) / 2;
    if (Math.abs(gx) + Math.abs(gy) > 2) return 'stairs_' + (side ? 'd_' : '') + (Math.abs(gy) >= Math.abs(gx) ? 0 : 1);
  }
  switch (t) {
    case TT.GRASS: return 'grass_' + d + '_' + (h < 0.78 ? (h * 1000 | 0) % 3 : 3 + (h * 1000 | 0) % 3);
    case TT.ROAD: { const m = sameMask(map, tx, ty, TT.ROAD); return m === 15 ? 'road_' + ((h * 4) | 0) : 'road_e' + m; }
    case TT.WATER: { const m = sameMask(map, tx, ty, TT.WATER); return m === 15 ? 'water' : 'water_e' + m; }   // animated entries
    case TT.TREE: return 'forest_' + d;
    case TT.WALL: return 'rock_top_' + (side ? 'd_' : '') + ((h * 4) | 0);
    default: return 'void';
  }
}

export const wallName = (map, tx, ty, side) => 'cliff_' + (side ? 'd' : 'r') + '_' + (((hash2(tx, ty, 3) * 4) | 0) & 3);

/** Deep cliff mass: a wall tile whose 8 neighbours are all walls at the same height. Never visible, so no geometry. */
export function isDeepVoid(map, tx, ty) {
  const w = map.w, h = map.h, j = ty * w + tx;
  if (map.type[j] !== TT.WALL) return false;
  const e = map.elev[j];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const x = tx + dx, y = ty + dy;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const k = y * w + x;
    if (map.type[k] !== TT.WALL || map.elev[k] !== e || map.ramp[k]) return false;
  }
  return !map.ramp[j];
}

/**
 * Build one chunk. lookup(name) -> { x, y, w, h } atlas px of the cell (water entries: frame 0; frames are 8 px apart).
 * Returns typed arrays { pos, uv, cell, index, bbox:[minx,miny,minz,maxx,maxy,maxz] } or null when empty.
 * cell = (cellX px, cellY px, cellH px, kind) with kind = type + 8*face.
 */
export function buildChunk(map, cx, cy, lookup) {
  const N = map.w, tile = map.tile, tx0 = cx * CHUNK, ty0 = cy * CHUNK, tx1 = Math.min(tx0 + CHUNK, map.w), ty1 = Math.min(ty0 + CHUNK, map.h);
  const pos = [], uv = [], cell = [], index = [];
  let minY = 1e9, maxY = -1e9, minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  let nv = 0;
  const vtx = (x, y, z, u, v, c, kind) => {
    pos.push(x, y, z); uv.push(u, v); cell.push(c.x, c.y, c.h, kind);
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    return nv++;
  };
  const cn = map.corners;
  for (let ty = ty0; ty < ty1; ty++) {
    for (let tx = tx0; tx < tx1; tx++) {
      if (isDeepVoid(map, tx, ty)) continue;
      const j = ty * N + tx, o = j * 4;
      const wx = map.x0 + tx * tile, wx1 = wx + tile, zN = -(map.y1 - ty * tile), zS = zN + tile;   // three Z of the north / south edge
      const hNW = cn[o], hNE = cn[o + 1], hSW = cn[o + 2], hSE = cn[o + 3];
      const side = tileSide(map, tx, ty);
      const c = lookup(tileName(map, tx, ty)); if (!c) continue;
      const type = map.type[j], kind = type + 8 * FACE.TOP;
      const a = vtx(wx, hNW, zN, 0, 0, c, kind), b = vtx(wx1, hNE, zN, 1, 0, c, kind), d = vtx(wx, hSW, zS, 0, 1, c, kind), e = vtx(wx1, hSE, zS, 1, 1, c, kind);
      // diagonal that best fits the bilinear surface
      if (Math.abs(hNW - hSE) <= Math.abs(hNE - hSW)) index.push(a, d, e, a, e, b); else index.push(a, d, b, b, d, e);
      // cliff walls: emit when THIS tile is the higher one across an edge
      const cw = lookup(wallName(map, tx, ty, side)); if (!cw) continue;
      // [neighbour dx, dy, face, this top-edge corner heights (start->end), edge endpoints (x,z) start->end]
      const edges = [
        [0, -1, FACE.N, hNW, hNE, wx, zN, wx1, zN],
        [1, 0, FACE.E, hNE, hSE, wx1, zN, wx1, zS],
        [0, 1, FACE.S, hSE, hSW, wx1, zS, wx, zS],
        [-1, 0, FACE.W, hSW, hNW, wx, zS, wx, zN],
      ];
      for (const [dx, dy, face, a0, a1, x0, z0, x1, z1] of edges) {
        const nx = tx + dx, ny = ty + dy; if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
        const no = (ny * N + nx) * 4;
        // neighbour corner heights along the same physical edge, same direction as (a0 -> a1)
        let b0, b1;
        if (face === FACE.N) { b0 = cn[no + 2]; b1 = cn[no + 3]; }      // neighbour's sw, se
        else if (face === FACE.E) { b0 = cn[no]; b1 = cn[no + 2]; }     // neighbour's nw, sw
        else if (face === FACE.S) { b0 = cn[no + 1]; b1 = cn[no]; }     // neighbour's ne, nw
        else { b0 = cn[no + 3]; b1 = cn[no + 1]; }                     // W: neighbour's se, ne
        if (!(a0 - b0 > EPS || a1 - b1 > EPS)) continue;
        if (a0 + a1 <= b0 + b1) continue;
        const t0 = Math.max(a0, b0), t1 = Math.max(a1, b1), l0 = Math.min(a0, b0), l1 = Math.min(a1, b1);
        const v0 = vtx(x0, t0, z0, 0, 0, cw, type + 8 * face), v1 = vtx(x1, t1, z1, 1, 0, cw, type + 8 * face);
        const v2 = vtx(x1, l1, z1, 1, (t1 - l1) / WALL_PERIOD, cw, type + 8 * face), v3 = vtx(x0, l0, z0, 0, (t0 - l0) / WALL_PERIOD, cw, type + 8 * face);
        index.push(v0, v3, v2, v0, v2, v1);   // terrain material is DoubleSide
      }
    }
  }
  if (!nv) return null;
  return { pos: new Float32Array(pos), uv: new Float32Array(uv), cell: new Float32Array(cell), index: nv > 65535 ? new Uint32Array(index) : new Uint16Array(index), bbox: [minX, minY, minZ, maxX, maxY, maxZ], verts: nv };
}
