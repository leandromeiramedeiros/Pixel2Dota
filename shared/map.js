// Decoded Dota map grid shared by sim and renderer. ONE height function for everyone: heightAt(x, y).
// Tiles: 48u, row 0 = north. tx = (x - x0) / tile, ty = (y1 - y) / tile.
// Height rule (render mesh and sim must agree):
//   - non-ramp tiles are flat at elev * 128 (cliff walls fill the vertical gaps between tiers);
//   - ramp tiles get a smoothed centre height (Jacobi relaxation between the flat walkable tiles around them);
//   - every tile owns 4 corner heights (nw, ne, sw, se). Flat tile: all = its height. Ramp tile corner: if the walkable
//     non-ramp tiles touching that corner all share one height -> that height (seamless join), else the mean of the touching
//     walkable tiles' heights (ramp: smoothed, flat: tier);
//   - heightAt(x, y) = bilinear blend of the containing tile's corners.
import { DOTAWORLD } from './data/dotaworld.js';

export const TT = { GRASS: 0, TREE: 1, WALL: 2, ROAD: 4, WATER: 5, OUT: 6 };
export const ELEV_Z = 128;
const TREE_HALF = 64;

let M = null;

export function getMap() {
  if (M) return M;
  const D = DOTAWORLD, N = D.w, H = D.h, tile = D.tile, n = N * H;
  const type = new Uint8Array(n), elev = new Uint8Array(n), ramp = new Uint8Array(n);
  for (let y = 0; y < H; y++) {
    const r = D.rows[y]; let x = 0;
    for (let i = 0; i < r.length;) {
      const ch = r.charCodeAt(i++) - 65; let c = 0, has = false;
      while (i < r.length) { const d = r.charCodeAt(i) - 48; if (d < 0 || d > 9) break; c = c * 10 + d; has = true; i++; }
      if (!has) c = 1;
      const t = ch & 7, e = (ch >> 3) & 3, rp = (ch >> 5) & 1;
      for (let k = 0; k < c && x < N; k++, x++) { const j = y * N + x; type[j] = t; elev[j] = e; ramp[j] = rp; }
    }
  }
  const walk = (j) => type[j] === TT.GRASS || type[j] === TT.ROAD || type[j] === TT.WATER || type[j] === TT.TREE;
  // centre heights
  const hC = new Float32Array(n);
  const ramps = [];
  for (let j = 0; j < n; j++) { hC[j] = elev[j] * ELEV_Z; if (ramp[j] && walk(j)) ramps.push(j); }
  const tmp = new Float32Array(ramps.length);
  for (let it = 0; it < 60; it++) {
    for (let k = 0; k < ramps.length; k++) {
      const j = ramps[k], x = j % N, y = (j / N) | 0; let s = 0, c = 0;
      if (x > 0 && walk(j - 1)) { s += hC[j - 1]; c++; }
      if (x < N - 1 && walk(j + 1)) { s += hC[j + 1]; c++; }
      if (y > 0 && walk(j - N)) { s += hC[j - N]; c++; }
      if (y < H - 1 && walk(j + N)) { s += hC[j + N]; c++; }
      tmp[k] = c ? s / c : hC[j];
    }
    for (let k = 0; k < ramps.length; k++) hC[ramps[k]] = tmp[k];
  }
  // corners: 4 per tile, order nw, ne, sw, se
  const corners = new Float32Array(n * 4);
  for (let j = 0; j < n; j++) { const h = hC[j]; corners[j * 4] = corners[j * 4 + 1] = corners[j * 4 + 2] = corners[j * 4 + 3] = h; }
  for (const j of ramps) {
    const x = j % N, y = (j / N) | 0;
    for (let c = 0; c < 4; c++) {
      const bx = x + (c & 1) - 1, by = y + (c >> 1) - 1; // top-left tile of the 2x2 block sharing this corner
      let flatH = null, flatSame = true, flatN = 0, s = 0, cnt = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const tx = bx + dx, ty = by + dy;
        if (tx < 0 || ty < 0 || tx >= N || ty >= H) continue;
        const k = ty * N + tx; if (!walk(k)) continue;
        s += hC[k]; cnt++;
        if (!ramp[k]) { flatN++; if (flatH === null) flatH = hC[k]; else if (flatH !== hC[k]) flatSame = false; }
      }
      corners[j * 4 + c] = flatN && flatSame ? flatH : cnt ? s / cnt : hC[j];
    }
  }
  M = { w: N, h: H, tile, x0: D.x0, y1: D.y1, type, elev, ramp, hC, corners, trees: D.trees, ents: D.ents };
  return M;
}

export const worldToTile = (x, y) => { const m = getMap(); return [(x - m.x0) / m.tile, (m.y1 - y) / m.tile]; };
export const tileCenter = (tx, ty) => { const m = getMap(); return [m.x0 + (tx + 0.5) * m.tile, m.y1 - (ty + 0.5) * m.tile]; };
export function tileIndex(tx, ty) { const m = getMap(); tx = Math.floor(tx); ty = Math.floor(ty); return tx < 0 || ty < 0 || tx >= m.w || ty >= m.h ? -1 : ty * m.w + tx; }
export function tileAt(x, y) { const [tx, ty] = worldToTile(x, y); return tileIndex(tx, ty); }
export function tileType(x, y) { const j = tileAt(x, y); return j < 0 ? TT.OUT : getMap().type[j]; }
export function elevAt(x, y) { const j = tileAt(x, y); return j < 0 ? 0 : getMap().elev[j]; }
/** Static walkability (trees count as blocked; the sim unblocks cut trees itself). */
export function walkableTile(j) { const t = getMap().type[j]; return j >= 0 && (t === TT.GRASS || t === TT.ROAD || t === TT.WATER); }

export function heightAt(x, y) {
  const m = getMap(); const [fx, fy] = worldToTile(x, y);
  const tx = Math.floor(fx), ty = Math.floor(fy);
  if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return 0;
  const j = (ty * m.w + tx) * 4, u = fx - tx, v = fy - ty, c = m.corners;
  const top = c[j] + (c[j + 1] - c[j]) * u, bot = c[j + 2] + (c[j + 3] - c[j + 2]) * u;
  return top + (bot - top) * v;
}

/** Tile indices covered by tree i (same 128x128 footprint rule as the extractor). */
export function treeTiles(i) {
  const m = getMap(), t = m.trees[i], out = [];
  const x0 = Math.ceil((t[0] - TREE_HALF - m.x0) / m.tile - 0.5), x1 = Math.floor((t[0] + TREE_HALF - m.x0) / m.tile - 0.5 - 1e-6);
  const y0 = Math.ceil((m.y1 - t[1] - TREE_HALF) / m.tile - 0.5), y1 = Math.floor((m.y1 - t[1] + TREE_HALF) / m.tile - 0.5 - 1e-6);
  for (let ty = Math.max(y0, 0); ty <= Math.min(y1, m.h - 1); ty++) for (let tx = Math.max(x0, 0); tx <= Math.min(x1, m.w - 1); tx++) out.push(ty * m.w + tx);
  return out;
}

/** Radiant (0) or Dire (1) side of the map, for art blending. */
export const sideOf = (x, y) => (x + y < 0 ? 0 : 1);
