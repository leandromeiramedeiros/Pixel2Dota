// Voxel cliff aprons: stepped stone ledges stacked at the foot of every flat cliff wall (and so stepping into the water at river banks).
// Pure + DOM-free (node-testable). Visual only: tile heights, walkability and pathing are untouched.
//
// The wall itself stays the one flat quad terrainGeo already emits. In front of it a heightfield of world-grid cells (size C = the ground
// voxel, VOX_CELL) rises as 1-2 stacked blocks, 0.5-2.5 cells deep, treads at multiples of C. Cells are keyed on the world grid, owned by the
// chunk holding their centre, so strips of neighbouring tiles / chunks join seamlessly; concave corners overlap (max), convex corners are
// filled by running a strip past its end when the same tile has a wall on the perpendicular edge.
// Faces use terrainGeo's FACE codes: 1 N (-Z), 2 E (+X), 3 S (+Z), 4 W (-X), 5 UP (tread).

export const AP = { N: 1, E: 2, S: 3, W: 4, UP: 5 };
const EPS = 0.5;
const MIN_DROP_CELLS = 3.5;   // walls shorter than this get no apron

export function hash3(x, y, s = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const key = (ix, iz) => (ix + 4096) * 8192 + (iz + 4096);

/** World cell indices [lo, hi] covered by a block starting at the wall plane `e` and running outward (s = +1 / -1) over the cell holding the
 *  plane plus `n` more; one more again when that cell holds < half a cell outside the plane, so every block is >= 0.5 cell deep. */
export function apronSpan(e, s, C, n) {
  const u = s * e, k0 = Math.floor(u / C), g = (k0 + 1) * C - u;
  const last = k0 + n + (g < C * 0.5 ? 1 : 0);
  return s > 0 ? [k0, last] : [-last - 1, -k0 - 1];
}

/** Outward depth (world units) of the block from the plane, same arguments as apronSpan. */
export function apronDepth(e, s, C, n) {
  const u = s * e, k0 = Math.floor(u / C), g = (k0 + 1) * C - u;
  return (n + (g < C * 0.5 ? 1 : 0)) * C + g;
}

/** Shore variant of apronSpan: only cells whose centre lies on the water side of the plane (never over the bank), so a block is 0.5-1.5 cells deep. */
export function shoreSpan(e, s, C, n) {
  const u = s * e, k0 = Math.floor(u / C), first = u < (k0 + 0.5) * C ? k0 : k0 + 1, last = first + n;
  return s > 0 ? [first, last] : [-last - 1, -first - 1];
}

/** Depth of a shoreSpan block, from the plane. */
export function shoreDepth(e, s, C, n) {
  const u = s * e, k0 = Math.floor(u / C), first = u < (k0 + 0.5) * C ? k0 : k0 + 1;
  return (first + n + 1) * C - u;
}

/** Stacked blocks of one wall edge, outer (lowest) first: [{ n, y }] = extra cells + tread height (a multiple of C, >= 1.2 C over the ground).
 *  shore: a same-height bank edge (drop 0) gets a 1-cell curb above the water instead, or stays bare. */
export function apronProfile(r, ground, drop, C, shore = false) {
  if (shore) {
    const y = Math.ceil((ground + 0.5 * C) / C) * C;
    if (r < 0.2) return [];
    if (r < 0.65) return [{ n: 0, y }];
    if (r < 0.85) return [{ n: 1, y }];
    return [{ n: 1, y }, { n: 0, y: y + C }];
  }
  if (drop < MIN_DROP_CELLS * C) return [];
  const yA = Math.ceil((ground + 1.2 * C) / C) * C;
  if (r < 0.15) return [{ n: 0, y: yA }];
  if (r < 0.4 || drop < 8 * C) return [{ n: 1, y: yA }];
  if (r < 0.75) return [{ n: 1, y: yA }, { n: 0, y: yA + (2 + (((r * 97) | 0) & 1)) * C }];
  return [{ n: 2, y: yA }, { n: 1, y: yA + 2 * C }, { n: 0, y: yA + 4 * C }];
}

/** Slabs jutting from a tall wall (drop >= 8 cells), 0-2 per edge: [{ a0, a1, n, top }] = cell run along the wall (indices into the edge's own
 *  cell range [i0, i1]), extra depth cells, tread height (multiple of C, between 6 cells over the ground and 2 cells under the wall top). */
export function ledgeSlabs(r, i0, i1, ground, drop, C) {
  const out = [], len = i1 - i0 + 1;
  if (drop < 8 * C || len < 3) return out;
  const cnt = r < 0.8 ? 0 : 1;
  const base = Math.ceil(ground / C) + 6, span = Math.max(1, Math.floor(drop / C) - 9);
  for (let k = 0; k < cnt; k++) {
    const h1 = hash3(i0, k, 21), h2 = hash3(i0, k, 22), h3 = hash3(i1, k, 23), h4 = hash3(i0, i1, 24 + k);
    const l = Math.min(len, 2 + ((h1 * 3) | 0)), a0 = i0 + ((h2 * (len - l + 1)) | 0);
    out.push({ a0, a1: a0 + l - 1, n: h3 < 0.5 ? 0 : 1, top: (base + ((h4 * span) | 0)) * C });
  }
  return out;
}

/** Bilinear ground height at a world point (three x, z); Infinity off the map. */
export function groundAt(map, x, z) {
  const t = map.tile, tx = Math.floor((x - map.x0) / t), ty = Math.floor((z + map.y1) / t);
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return Infinity;
  const o = (ty * map.w + tx) * 4, c = map.corners, fx = (x - map.x0) / t - tx, fz = (z + map.y1) / t - ty;
  return c[o] * (1 - fx) * (1 - fz) + c[o + 1] * fx * (1 - fz) + c[o + 2] * (1 - fx) * fz + c[o + 3] * fx * fz;
}

// [neighbour dx, dy, face, corner of this tile (start, end), neighbour corners (start, end) as terrainGeo reads them]
const EDGES = [
  [0, -1, AP.N, 0, 1, 2, 3],
  [1, 0, AP.E, 1, 3, 0, 2],
  [0, 1, AP.S, 3, 2, 1, 0],
  [-1, 0, AP.W, 2, 0, 3, 1],
];

const WATER = 5, OUT = 6;

/** Edge of tile (tx, ty) towards `e` that earns an apron: flat, both tiles non-ramp, and either a drop >= 3.5 cells (cliff wall) or a bank (land
 *  edge level with a water tile: shore). { drop, ground, shore } or null. */
function wallEdge(map, tx, ty, e, C) {
  const nx = tx + e[0], ny = ty + e[1];
  if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) return null;
  const j = ty * map.w + tx, k = ny * map.w + nx;
  if (map.ramp[j] || map.ramp[k]) return null;
  const c = map.corners, o = j * 4, no = k * 4;
  const a0 = c[o + e[3]], a1 = c[o + e[4]], b0 = c[no + e[5]], b1 = c[no + e[6]];
  if (Math.abs(a0 - a1) > EPS || Math.abs(b0 - b1) > EPS) return null;
  if (a0 - b0 >= MIN_DROP_CELLS * C) return { drop: a0 - b0, ground: b0, shore: false };
  if (map.type[k] === WATER && map.type[j] !== WATER && map.type[j] !== OUT && Math.abs(a0 - b0) <= EPS) return { drop: 0, ground: b0, shore: true };
  return null;
}

/**
 * Apron cells for the tile rect [tx0, tx1) x [ty0, ty1) plus a ring of tiles around it (cells of the ring let the chunk edge see its neighbours).
 * sideOf(tx, ty) = 0 Radiant / 1 Dire. Returns Map(key -> { ix, iz, y, type, side }); y = tread height, the highest contributor wins.
 */
export function apronCells(map, tx0, ty0, tx1, ty1, C, sideOf, boxes = null) {
  const cells = new Map(), tile = map.tile;
  const put = (ix, iz, y, type, side) => { const k = key(ix, iz), c = cells.get(k); if (!c || y > c.y) cells.set(k, { ix, iz, y, type, side }); };
  const R = 2;
  for (let ty = Math.max(0, ty0 - R); ty < Math.min(map.h, ty1 + R); ty++) {
    for (let tx = Math.max(0, tx0 - R); tx < Math.min(map.w, tx1 + R); tx++) {
      const info = EDGES.map((e) => wallEdge(map, tx, ty, e, C));
      if (!info[0] && !info[1] && !info[2] && !info[3]) continue;
      const j = ty * map.w + tx, type = map.type[j], side = sideOf(tx, ty);
      const wx = map.x0 + tx * tile, wx1 = wx + tile, zN = ty * tile - map.y1, zS = zN + tile;
      // per face: plane, outward sign, axis the plane is on ('z' for N / S, 'x' for E / W), span along the wall, perpendicular faces at its start / end
      const geo = [
        [zN, -1, 'z', wx, wx1, 3, 1],      // N: along x, ends meet W (index 3) and E (index 1)
        [wx1, 1, 'x', zN, zS, 0, 2],       // E: along z, ends meet N and S
        [zS, 1, 'z', wx, wx1, 3, 1],       // S
        [wx, -1, 'x', zN, zS, 0, 2],       // W
      ];
      for (let f = 0; f < 4; f++) {
        const inf = info[f]; if (!inf) continue;
        const [pl, s, ax, a0, a1, p0, p1] = geo[f];
        if (boxes && !inf.shore && tx >= tx0 && tx < tx1 && ty >= ty0 && ty < ty1) {
          const own = [Math.ceil(a0 / C - 0.5), Math.ceil(a1 / C - 0.5) - 1];
          for (const sl of ledgeSlabs(hash3(tx, ty, 15 + f), own[0], own[1], inf.ground, inf.drop, C)) {
            const [n0, n1] = apronSpan(pl, s, C, sl.n);
            boxes.push(ax === 'z' ? { ix0: sl.a0, ix1: sl.a1, iz0: n0, iz1: n1, y0: sl.top - 2 * C, y1: sl.top, f: f + 1, type, side }
              : { ix0: n0, ix1: n1, iz0: sl.a0, iz1: sl.a1, y0: sl.top - 2 * C, y1: sl.top, f: f + 1, type, side });
          }
        }
        const prof = apronProfile(hash3(tx, ty, 11 + f), inf.ground, inf.drop, C, inf.shore);
        if (!prof.length) continue;
        const span = inf.shore ? shoreSpan : apronSpan, depth = inf.shore ? shoreDepth : apronDepth;
        const wide = Math.max(...prof.map((b) => depth(pl, s, C, b.n)));
        const lo = a0 - (info[p0] ? wide : 0), hi = a1 + (info[p1] ? wide : 0);
        const i0 = Math.ceil(lo / C - 0.5), i1 = Math.ceil(hi / C - 0.5) - 1;
        for (const b of prof) {
          const [n0, n1] = span(pl, s, C, b.n);
          for (let a = i0; a <= i1; a++) for (let m = n0; m <= n1; m++) {
            if (ax === 'z') put(a, m, b.y, type, side); else put(m, a, b.y, type, side);
          }
        }
      }
    }
  }
  // drop cells that are not above the ground they sit on (over a higher tile, a ramp, or off the map)
  for (const [k, c] of cells) { const g = groundAt(map, (c.ix + 0.5) * C, (c.iz + 0.5) * C); if (!(c.y > g + 1)) cells.delete(k); }
  return cells;
}

/**
 * Axis-aligned quads of the apron for one chunk (tile rect [tx0, tx1) x [ty0, ty1)): { f, type, side, x0, x1, y0, y1, z0, z1 } with f = AP.*.
 * Treads (f = 5, y0 = y1) and the exposed risers only (a face is dropped when the neighbour cell is as high: the cliff wall, another ledge);
 * runs of equal cells along a row merge into one quad. Only cells whose centre lies in the chunk are emitted.
 */
export function apronQuads(map, tx0, ty0, tx1, ty1, C, sideOf) {
  const boxes = [], cells = apronCells(map, tx0, ty0, tx1, ty1, C, sideOf, boxes);
  const xA = map.x0 + tx0 * map.tile, xB = map.x0 + tx1 * map.tile, zA = ty0 * map.tile - map.y1, zB = ty1 * map.tile - map.y1;
  const owned = (c) => { const x = (c.ix + 0.5) * C, z = (c.iz + 0.5) * C; return x >= xA && x < xB && z >= zA && z < zB; };
  const H = (ix, iz) => { const c = cells.get(key(ix, iz)); return c ? c.y : groundAt(map, (ix + 0.5) * C, (iz + 0.5) * C); };
  const same = (a, b) => a && b && Math.abs(a.y - b.y) < 1e-3 && a.type === b.type && a.side === b.side && owned(b);
  const out = [];
  const done = new Set();
  for (const c of cells.values()) {
    if (!owned(c) || done.has(key(c.ix, c.iz))) continue;
    let n = 0;
    while (same(c, cells.get(key(c.ix + n + 1, c.iz)))) n++;
    for (let i = 0; i <= n; i++) done.add(key(c.ix + i, c.iz));
    out.push({ f: AP.UP, type: c.type, side: c.side, x0: c.ix * C, x1: (c.ix + n + 1) * C, y0: c.y, y1: c.y, z0: c.iz * C, z1: (c.iz + 1) * C });
  }
  // [dx, dz, face, step along the run]
  for (const [dx, dz, f, sx, sz] of [[0, -1, AP.N, 1, 0], [1, 0, AP.E, 0, 1], [0, 1, AP.S, 1, 0], [-1, 0, AP.W, 0, 1]]) {
    const seen = new Set();
    for (const c of cells.values()) {
      if (!owned(c) || seen.has(key(c.ix, c.iz))) continue;
      const bot = H(c.ix + dx, c.iz + dz);
      if (c.y - bot <= EPS) continue;
      let n = 0;
      for (;;) {
        const nx = c.ix + (n + 1) * sx, nz = c.iz + (n + 1) * sz, d = cells.get(key(nx, nz));
        if (!same(c, d) || Math.abs(H(nx + dx, nz + dz) - bot) > 1e-3) break;
        n++;
      }
      for (let i = 0; i <= n; i++) seen.add(key(c.ix + i * sx, c.iz + i * sz));
      const q = { f, type: c.type, side: c.side, y0: bot, y1: c.y };
      if (sx) { q.x0 = c.ix * C; q.x1 = (c.ix + n + 1) * C; q.z0 = q.z1 = (dz < 0 ? c.iz : c.iz + 1) * C; }
      else { q.z0 = c.iz * C; q.z1 = (c.iz + n + 1) * C; q.x0 = q.x1 = (dx < 0 ? c.ix : c.ix + 1) * C; }
      out.push(q);
    }
  }
  // wall slabs: tread + the three faces not against the wall (b.f = the wall edge's outward face; the opposite one is skipped)
  for (const b of boxes) {
    const x0 = b.ix0 * C, x1 = (b.ix1 + 1) * C, z0 = b.iz0 * C, z1 = (b.iz1 + 1) * C;
    const skip = b.f === AP.N ? AP.S : b.f === AP.S ? AP.N : b.f === AP.E ? AP.W : AP.E;
    const q = (f, a) => { if (f !== skip) out.push({ f, type: b.type, side: b.side, ...a }); };
    q(AP.UP, { x0, x1, y0: b.y1, y1: b.y1, z0, z1 });
    q(AP.N, { x0, x1, y0: b.y0, y1: b.y1, z0, z1: z0 });
    q(AP.S, { x0, x1, y0: b.y0, y1: b.y1, z0: z1, z1 });
    q(AP.W, { x0, x1: x0, y0: b.y0, y1: b.y1, z0, z1 });
    q(AP.E, { x0: x1, x1, y0: b.y0, y1: b.y1, z0, z1 });
  }
  return out;
}
