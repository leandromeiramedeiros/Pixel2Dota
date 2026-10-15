// Voxel helpers shared by the hand-authored world props (rocks.js, clutter.js). Browser-safe, no node imports. All props are chibi reads of their Dota 2
// counterparts, authored by hand from the vox:ref silhouettes (docs/VOXEL.md): nothing here is derived from a game asset.
import { Vox } from '../vox.js';
import { ramp } from '../mats.js';

/** Deterministic 0..1 hash of an integer cell + seed. */
export const hh = (x, y, z = 0, s = 0) => {
  let h = Math.imul(x + 0x9e37, 73856093) ^ Math.imul(y + 0x85eb, 19349663) ^ Math.imul(z + 0xc2b2, 83492791) ^ Math.imul(s + 1, 668265263);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};

/** Register a palette on v: { name: '#base' | { c: '#base', sway?: 0..1 (wind weight), night?: true (faint glow at night) } } -> { name: id }. Lit 4-step hue-shifted ramps. */
export function palette(v, defs) {
  const o = {};
  for (const k in defs) {
    const d = typeof defs[k] === 'string' ? { c: defs[k] } : defs[k];
    o[k] = v.mat(k, { ramp: ramp(d.c), ...(d.sway ? { sway: d.sway } : {}), ...(d.night ? { night: 1 } : {}) });
  }
  return o;
}

/** New grid whose foot centre is (X / 2, Y / 2) (X, Y even: whole-voxel stored units) and whose ground is z = 0. */
export const grid = (X, Y, Z) => new Vox(X, Y, Z);

/**
 * Chamfered, optionally leaning / tilted block: centre c, half sizes h, `cut` clips the corners (|x|/hx + |y|/hy + |z|/hz <= cut: 3 = plain box, ~2.4 = chunky
 * rock), `lean` shifts x per unit of height, `tilt` slopes the top plane along x (z drop per unit of x / hx * hz), `tiltY` the same along y.
 * m: a material id, or (px, py, pz, lx, ly, lz) -> id (local coords in -1..1) for per-voxel strata.
 */
export function chunk(v, { c, h, cut = 3, lean = 0, tilt = 0, tiltY = 0, m }) {
  const r = Math.ceil(Math.max(h[0], h[1], h[2]) * 2 + Math.abs(lean) * h[2] * 2);
  v.each(c[0] - r, c[1] - r, c[2] - r, c[0] + r, c[1] + r, c[2] + r, (px, py, pz) => {
    const lx = (px - c[0] - lean * (pz - c[2])) / h[0], ly = (py - c[1]) / h[1], lz = (pz - c[2]) / h[2];
    if (Math.abs(lx) > 1 || Math.abs(ly) > 1 || Math.abs(lz) > 1) return;
    if (Math.abs(lx) + Math.abs(ly) + Math.abs(lz) > cut) return;
    if (lz > 1 - tilt * lx - tiltY * ly) return;   // tilted top plane
    return typeof m === 'function' ? m(px, py, pz, lx, ly, lz) : m;
  });
}

/** Rough ellipsoid: the boundary is eroded by hash noise (`rough` 0..1) for leafy / lumpy masses. Skips cells below z = 0. */
export function blob(v, cx, cy, cz, rx, ry, rz, m, rough = 0, seed = 0) {
  v.each(cx - rx, cy - ry, Math.max(0, cz - rz), cx + rx, cy + ry, cz + rz, (px, py, pz, x, y, z) => {
    const d = ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 + ((pz - cz) / rz) ** 2;
    if (d <= 1 - rough * hh(x, y, z, seed) * 0.9) return typeof m === 'function' ? m(px, py, pz, x, y, z) : m;
  });
}

/** Solid of revolution about the vertical axis through (cx, cy): layer k (z = z0 + k) has radius prof[k]; m = id or (k, x, y, z) -> id. */
export function lathe(v, cx, cy, z0, prof, m) {
  prof.forEach((r, k) => {
    if (r <= 0) return;
    v.each(cx - r, cy - r, z0 + k, cx + r, cy + r, z0 + k, (px, py, pz, x, y, z) => {
      if ((px - cx) ** 2 + (py - cy) ** 2 <= r * r) return typeof m === 'function' ? m(k, x, y, z) : m;
    });
  });
}

/** True when the cell has an empty 6-neighbour (a surface voxel). */
export const exposed = (v, x, y, z) => !v.get(x + 1, y, z) || !v.get(x - 1, y, z) || !v.get(x, y + 1, z) || !v.get(x, y - 1, z) || !v.get(x, y, z + 1) || !v.get(x, y, z - 1);

/** Recolour a share `p` (0..1) of the surface voxels of material `from` (a Set / id, or any when null) to `to`, hash-picked. */
export function speckle(v, to, p, from = null, seed = 7) {
  for (let z = 0; z < v.Z; z++) for (let y = 0; y < v.Y; y++) for (let x = 0; x < v.X; x++) {
    const m = v.get(x, y, z); if (!m || (from != null && m !== from) || !exposed(v, x, y, z)) continue;
    if (hh(x, y, z, seed) < p) v.set(x, y, z, to);
  }
}

/** Filled-voxel count and bounding box (tests). */
export function stats(v) {
  let n = 0, x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1, y1 = -1, z1 = -1;
  for (let z = 0; z < v.Z; z++) for (let y = 0; y < v.Y; y++) for (let x = 0; x < v.X; x++) if (v.get(x, y, z)) {
    n++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); z0 = Math.min(z0, z); x1 = Math.max(x1, x); y1 = Math.max(y1, y); z1 = Math.max(z1, z);
  }
  return { n, min: [x0, y0, z0], max: [x1, y1, z1] };
}
