// Browser-safe voxel kit shared by the offline renderer (tools/art/vox.mjs) and the game mesher (client/src/render/voxmesh.js). No node imports.
// A Vox is a dense grid of material ids. Axes: x = right (as seen from the front), y = depth (the model faces -y), z = up. Cell (x,y,z) spans [x,x+1) etc.

export const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

export class Vox {
  constructor(X, Y, Z) { this.X = X; this.Y = Y; this.Z = Z; this.g = new Uint8Array(X * Y * Z); this.mats = [null]; this.ids = new Map(); }
  /** Material: { ramp:[dark, mid, light, highlight] } (lit) or { emit:'#hex' } (unlit, glows). Returns its id. */
  mat(name, def) {
    if (!this.ids.has(name)) {
      const m = { name, ...def };
      if (m.ramp) m.rgb = m.ramp.map(hex);
      if (m.emit) m.rgb = [hex(m.emit)];
      m.ol = mix(m.ramp ? hex(m.ramp[0]) : mix(hex(m.emit), [60, 10, 10], 0.6), [18, 8, 20], 0.55);
      this.ids.set(name, this.mats.length); this.mats.push(m);
    }
    return this.ids.get(name);
  }
  i(x, y, z) { return (z * this.Y + y) * this.X + x; }
  inside(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.X && y < this.Y && z < this.Z; }
  get(x, y, z) { return this.inside(x, y, z) ? this.g[this.i(x, y, z)] : 0; }
  set(x, y, z, m) { if (this.inside(x, y, z)) this.g[this.i(x, y, z)] = m; }
  /** Calls f(px,py,pz, x,y,z) with cell centres inside the bounding box; f returns a material id (or 0/undefined to leave the cell). */
  each(x0, y0, z0, x1, y1, z1, f) {
    for (let z = Math.max(0, Math.floor(z0)); z <= Math.min(this.Z - 1, Math.ceil(z1)); z++)
      for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(this.Y - 1, Math.ceil(y1)); y++)
        for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(this.X - 1, Math.ceil(x1)); x++) {
          const m = f(x + 0.5, y + 0.5, z + 0.5, x, y, z);
          if (m !== undefined && m !== null && m !== false) this.g[this.i(x, y, z)] = m;
        }
  }
  ellipsoid(cx, cy, cz, rx, ry, rz, m, only) {
    this.each(cx - rx, cy - ry, cz - rz, cx + rx, cy + ry, cz + rz, (px, py, pz, x, y, z) => {
      const d = ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 + ((pz - cz) / rz) ** 2;
      if (d <= 1 && (!only || only(px, py, pz, x, y, z))) return typeof m === 'function' ? m(px, py, pz) : m;
    });
  }
  /** Capsule between points a and b, radius r (or r0 -> r1). */
  capsule(a, b, r0, m, r1 = r0) {
    const R = Math.max(r0, r1);
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1;
    this.each(Math.min(a[0], b[0]) - R, Math.min(a[1], b[1]) - R, Math.min(a[2], b[2]) - R, Math.max(a[0], b[0]) + R, Math.max(a[1], b[1]) + R, Math.max(a[2], b[2]) + R,
      (px, py, pz) => {
        let t = ((px - a[0]) * ab[0] + (py - a[1]) * ab[1] + (pz - a[2]) * ab[2]) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const r = r0 + (r1 - r0) * t;
        const d2 = (px - a[0] - ab[0] * t) ** 2 + (py - a[1] - ab[1] * t) ** 2 + (pz - a[2] - ab[2] * t) ** 2;
        if (d2 <= r * r) return typeof m === 'function' ? m(px, py, pz, t) : m;
      });
  }
  /** First filled cell along +y (from the front) at column (x, z): its y, or -1. */
  front(x, z) { for (let y = 0; y < this.Y; y++) if (this.get(x, y, z)) return y; return -1; }
  /** Recolour the front-most voxel of column (x, z). */
  paintFront(x, z, m) { const y = this.front(x, z); if (y >= 0) this.set(x, y, z, m); }
}

const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

/** Per-voxel smooth normal: minus the gradient of occupancy in a (2r+1)^3 box (r = 2), cached on the Vox. */
export function smoothNormal(v, x, y, z, r = 2) {
  if (!v._n) v._n = new Map();
  const k = v.i(x, y, z); const c = v._n.get(k); if (c) return c;
  let gx = 0, gy = 0, gz = 0;
  for (let dz = -r; dz <= r; dz++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (!dx && !dy && !dz) continue;
    if (v.get(x + dx, y + dy, z + dz)) { const w = 1 / (dx * dx + dy * dy + dz * dz); gx -= dx * w; gy -= dy * w; gz -= dz * w; }
  }
  const n = norm([gx, gy, gz]); v._n.set(k, n); return n;
}
