// Voxel software renderer for pixel-art sprites (no GPU, no deps). The Vox grid itself lives in shared/vox/vox.js (re-exported here); renderVox ray-casts
// it through an orthographic camera at a given yaw/pitch, shades each hit face with a 4-step hue-shifted ramp (light + self-shadow + AO),
// then adds a selective dark outline and depth-break interior lines so the result reads as hand-pixeled art.
// Axes: x = right (as seen from the front), y = depth (the model faces -y), z = up. Cell (x,y,z) spans [x,x+1) etc.
import { hex, mix, Vox, smoothNormal } from '../../shared/vox/vox.js';
export { hex, mix, Vox, smoothNormal };

const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Amanatides-Woo DDA. Returns { m, c:[x,y,z], n:[..], t } of the first filled cell, or null. */
function cast(v, o, d) {
  const dim = [v.X, v.Y, v.Z];
  let t0 = 0, t1 = 1e9, ax0 = -1;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) { if (o[a] < 0 || o[a] >= dim[a]) return null; continue; }
    let ta = (0 - o[a]) / d[a], tb = (dim[a] - o[a]) / d[a]; if (ta > tb) [ta, tb] = [tb, ta];
    if (ta > t0) { t0 = ta; ax0 = a; }
    if (tb < t1) t1 = tb;
  }
  if (t0 > t1) return null;
  const c = [0, 1, 2].map(a => Math.min(dim[a] - 1, Math.max(0, Math.floor(o[a] + d[a] * (t0 + 1e-7)))));
  const step = d.map(x => (x > 0 ? 1 : -1));
  const tMax = [0, 1, 2].map(a => (Math.abs(d[a]) < 1e-9 ? 1e9 : (c[a] + (step[a] > 0 ? 1 : 0) - o[a]) / d[a]));
  const tDel = d.map(x => (Math.abs(x) < 1e-9 ? 1e9 : Math.abs(1 / x)));
  let n = [0, 0, 0]; if (ax0 >= 0) n[ax0] = -step[ax0];
  let t = t0;
  for (let k = 0; k < 400; k++) {
    const m = v.g[v.i(c[0], c[1], c[2])];
    if (m) return { m, c: c.slice(), n, t };
    const a = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
    c[a] += step[a]; if (c[a] < 0 || c[a] >= dim[a]) return null;
    t = tMax[a]; tMax[a] += tDel[a]; n = [0, 0, 0]; n[a] = -step[a];
  }
  return null;
}

/** Camera basis for yaw (deg, 0 = looking at the model's front, + = orbit towards its left/our right) and pitch (deg above horizon). */
export function basis(yawDeg, pitchDeg) {
  const a = yawDeg * Math.PI / 180, p = pitchDeg * Math.PI / 180;
  const toCam = [Math.sin(a) * Math.cos(p), -Math.cos(a) * Math.cos(p), Math.sin(p)];
  const d = toCam.map(x => -x);
  const right = norm([Math.cos(a), Math.sin(a), 0]);
  const up = norm([right[1] * d[2] - right[2] * d[1], right[2] * d[0] - right[0] * d[2], right[0] * d[1] - right[1] * d[0]]);
  return { d, right, up };
}

/**
 * Render a Vox. opts: { yaw, pitch, scale (px per voxel), W, H, center:[x,y,z], light:[r,u,v] (camera space: right, up, towards-viewer),
 *   levels:[t0,t1,t2] ramp thresholds, ambient, lines (depth-break interior lines), outline, ss (supersample),
 *   fill:[r,u,v,strength] second (unshadowed) light in camera space, e.g. a studio fill from the other side,
 *   fov (deg, vertical; perspective camera framed so 'scale' holds at the centre plane; omit = orthographic),
 *   rim: [{ dir:[sx,sy] screen step toward the back light, col:'#hex', w:px, k:0..1 }] silhouette rim light }
 * Returns { W, H, rgba: Uint8ClampedArray, mat: Int16Array (material per px), depth: Float32Array, project(p) -> [sx, sy] }.
 */
export function renderVox(v, o) {
  const { yaw = 0, pitch = 30, scale = 2, W = 96, H = 112, center = [v.X / 2, v.Y / 2, v.Z / 2], ambient = 0.38, levels = [0.48, 0.74, 1.0], lines = 2.2, outline = true } = o;
  const { d, right, up } = basis(yaw, pitch);
  const lc = o.light || [-0.5, 0.55, 0.75];
  const L = norm([0, 1, 2].map(k => right[k] * lc[0] + up[k] * lc[1] - d[k] * lc[2]));
  const F = o.fill ? norm([0, 1, 2].map(k => right[k] * o.fill[0] + up[k] * o.fill[1] - d[k] * o.fill[2])) : null;
  const rgba = new Uint8ClampedArray(W * H * 4), mat = new Int16Array(W * H), depth = new Float32Array(W * H).fill(1e9);
  const shade = new Uint8Array(W * H);
  const sub = o.ss || 1;   // supersample (majority vote per output pixel) for cleaner edges
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const votes = new Map();
    for (let sy = 0; sy < sub; sy++) for (let sx = 0; sx < sub; sx++) {
      const u = (px + (sx + 0.5) / sub - W / 2) / scale, w = (H / 2 - (py + (sy + 0.5) / sub)) / scale;
      let or, rd = d;
      if (o.fov) {   // perspective: eye on the view axis, image plane through the centre at 'scale' px per voxel
        const dist = (H / 2 / scale) / Math.tan(o.fov * Math.PI / 360);
        or = [0, 1, 2].map(k => center[k] - d[k] * dist);
        rd = norm([0, 1, 2].map(k => d[k] * dist + right[k] * u + up[k] * w));
      } else or = [0, 1, 2].map(k => center[k] + right[k] * u + up[k] * w - d[k] * 300);
      const h = cast(v, or, rd);
      if (!h) { votes.set(0, (votes.get(0) || { n: 0 })); votes.get(0).n++; continue; }
      const M = v.mats[h.m];
      let lvl = 0;
      if (M.emit) lvl = 0;
      else {
        const sn = smoothNormal(v, h.c[0], h.c[1], h.c[2]), fw = o.faceW ?? 0.3;
        const nn = norm([0, 1, 2].map(k => sn[k] * (1 - fw) + h.n[k] * fw));
        const lam = Math.max(0, dot(nn, L));
        // ambient occlusion: filled cells around the face's outer neighbour
        const oc = [h.c[0] + h.n[0], h.c[1] + h.n[1], h.c[2] + h.n[2]];
        const ax = h.n[0] ? 0 : h.n[1] ? 1 : 2, t1 = (ax + 1) % 3, t2 = (ax + 2) % 3;
        let occ = 0;
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
          if (!i && !j) continue;
          const q = oc.slice(); q[t1] += i; q[t2] += j;
          if (v.get(q[0], q[1], q[2])) occ += (i && j) ? 0.5 : 1;
        }
        const hp = [0, 1, 2].map(k => or[k] + rd[k] * h.t + h.n[k] * 0.02);
        const sh = !M.noShadow && lam > 0 && cast(v, hp, L) ? 1 : 0;
        let I = ambient + (sh ? 0.12 : 0.85) * lam + (F ? o.fill[3] * Math.max(0, dot(nn, F)) : 0);
        I *= 1 - 0.055 * occ;
        lvl = I < levels[0] ? 0 : I < levels[1] ? 1 : I < levels[2] ? 2 : 3;
      }
      const key = h.m * 4 + lvl;
      const e = votes.get(key) || { n: 0, t: 0 }; e.n++; e.t += h.t; votes.set(key, e);
    }
    let best = 0, bn = -1; for (const [k, e] of votes) if (e.n > bn) { bn = e.n; best = k; }
    const i = py * W + px;
    if (best === 0) { mat[i] = 0; continue; }
    const m = best >> 2, lvl = best & 3, M = v.mats[m];
    mat[i] = m; shade[i] = lvl; depth[i] = votes.get(best).t / votes.get(best).n;
    const c = M.emit ? M.rgb[0] : M.rgb[lvl];
    rgba[i * 4] = c[0]; rgba[i * 4 + 1] = c[1]; rgba[i * 4 + 2] = c[2]; rgba[i * 4 + 3] = 255;
  }
  // rim light: figure pixels whose neighbour toward the back light is empty (or far behind) blend toward the rim colour
  for (const R of o.rim || []) {
    const rc = hex(R.col), w = R.w || 2, kk = R.k ?? 0.7, out = rgba.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (!mat[i]) continue; const M = v.mats[mat[i]]; if (M.emit) continue;
      for (let k = 1; k <= w; k++) {
        const X = x + Math.round(R.dir[0] * k), Y = y + Math.round(R.dir[1] * k);
        const j = Y * W + X, open = X < 0 || Y < 0 || X >= W || Y >= H || !mat[j] || depth[j] - depth[i] > 4;
        if (!open) continue;
        const a = kk * (k === 1 ? 1 : 0.5), tgt = mix(M.rgb[3], rc, 0.55), c = mix([rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]], tgt, a);
        out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; break;
      }
    }
    rgba.set(out);
  }
  // interior lines: the farther pixel of a big depth break gets the material's dark line colour
  if (lines) {
    const out = rgba.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (!mat[i]) continue; const M = v.mats[mat[i]]; if (M.emit || M.noLine) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const j = Y * W + X; if (!mat[j]) continue;
        if (depth[i] - depth[j] > lines && !v.mats[mat[j]].emit) { const c = M.rgb[0]; const k = mix(c, [20, 8, 22], 0.25); out[i * 4] = k[0]; out[i * 4 + 1] = k[1]; out[i * 4 + 2] = k[2]; break; }
      }
    }
    rgba.set(out);
  }
  // outer outline: empty pixels touching the figure take the neighbour's tinted outline colour
  if (outline) {
    const out = rgba.slice(), mo = mat.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (mat[i]) continue;
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
        const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const j = Y * W + X; if (!mat[j]) continue;
        const M = v.mats[mat[j]]; const c = M.ol;
        out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = 255; mo[i] = -1; break;
      }
    }
    rgba.set(out); mat.set(mo);
  }
  const project = p => { const q = [p[0] - center[0], p[1] - center[1], p[2] - center[2]]; return [W / 2 + dot(q, right) * scale, H / 2 - dot(q, up) * scale]; };
  return { W, H, rgba, mat, depth, project };
}

/** RGBA canvas helpers for contact sheets. */
export class Canvas {
  constructor(W, H, bg = '#262a38') { this.W = W; this.H = H; this.px = new Uint8ClampedArray(W * H * 4); this.fill(bg); }
  fill(c) { const k = hex(c); for (let i = 0; i < this.W * this.H; i++) this.px.set([k[0], k[1], k[2], 255], i * 4); }
  rect(x0, y0, w, h, c, a = 1) {
    const k = hex(c);
    for (let y = Math.max(0, y0); y < Math.min(this.H, y0 + h); y++) for (let x = Math.max(0, x0); x < Math.min(this.W, x0 + w); x++) {
      const i = (y * this.W + x) * 4; for (let q = 0; q < 3; q++) this.px[i + q] = this.px[i + q] + (k[q] - this.px[i + q]) * a;
    }
  }
  ellipse(cx, cy, rx, ry, c, a = 1) {
    const k = hex(c);
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      if (x < 0 || y < 0 || x >= this.W || y >= this.H) continue;
      if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 > 1) continue;
      const i = (y * this.W + x) * 4; for (let q = 0; q < 3; q++) this.px[i + q] = this.px[i + q] + (k[q] - this.px[i + q]) * a;
    }
  }
  /** Draw a rendered sprite at (x0, y0) scaled by integer s (nearest). */
  blit(r, x0, y0, s = 1) {
    for (let y = 0; y < r.H; y++) for (let x = 0; x < r.W; x++) {
      const i = (y * r.W + x) * 4; if (!r.rgba[i + 3]) continue;
      for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++) {
        const X = x0 + x * s + xx, Y = y0 + y * s + yy; if (X < 0 || Y < 0 || X >= this.W || Y >= this.H) continue;
        const j = (Y * this.W + X) * 4; this.px[j] = r.rgba[i]; this.px[j + 1] = r.rgba[i + 1]; this.px[j + 2] = r.rgba[i + 2]; this.px[j + 3] = 255;
      }
    }
  }
}
