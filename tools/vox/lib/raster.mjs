// Deterministic CPU renderer for the private Dota 2 reference (tools/vox/ref.mjs). Orthographic camera, z-buffer triangles, base-colour texture
// sampling (nearest, alpha-masked), one fixed key + fill + ambient light, 2x2 supersampling. No GPU, no randomness: same input -> same bytes.
// World axes are Source's: Z up, the model faces +X. yaw 0 = camera in front of the model, + orbits toward the model's left (screen right).
// Output stays under tools/.cache/ref/ (gitignored). Never import this from shared/ or client/.

const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Camera basis: t = unit vector toward the camera, right / up in world space. */
export function basis(yawDeg, pitchDeg) {
  const a = yawDeg * Math.PI / 180, p = pitchDeg * Math.PI / 180;
  const t = [Math.cos(a) * Math.cos(p), Math.sin(a) * Math.cos(p), Math.sin(p)], right = norm(cross([0, 0, 1], [t[0], t[1], 0]));
  return { t, right, up: cross(t, right) };
}

export function bounds(prims) {
  const mn = [1e30, 1e30, 1e30], mx = [-1e30, -1e30, -1e30];
  for (const p of prims) for (let i = 0; i < p.pos.length; i += 3) for (let k = 0; k < 3; k++) { const v = p.pos[i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
  return { mn, mx };
}

/** Albedo of a primitive at uv (null when alpha-masked out). */
export function albedoAt(m, u, v, out) {
  let r = 200, g = 200, b = 200, a = 255;
  const T = m.tex;
  if (T && u === u && v === v) {
    const x = Math.floor((u - Math.floor(u)) * T.W) % T.W, y = Math.floor((v - Math.floor(v)) * T.H) % T.H, i = (y * T.W + x) * 4;
    r = T.rgba[i]; g = T.rgba[i + 1]; b = T.rgba[i + 2]; a = T.rgba[i + 3];
  }
  if (m.mask && T && a < m.cutoff * 255) return false;
  out[0] = Math.min(255, r * m.factor[0]); out[1] = Math.min(255, g * m.factor[1]); out[2] = Math.min(255, b * m.factor[2]);
  return true;
}

/**
 * Render prims. cam: { yaw, pitch, S (px, square), scale (px per unit), center:[x,y,z], ss: 2, bg: '#rrggbb' }.
 * Returns { W, H, rgba: Uint8ClampedArray (opaque) }.
 */
export function render(prims, cam) {
  const { yaw = 0, pitch = 10, S = 288, scale = 1, center = [0, 0, 0], ss = 2, bg = [28, 32, 48] } = cam;
  const { t, right, up } = basis(yaw, pitch), W = S * ss, H = S * ss, sc = scale * ss;
  const Lk = norm([0, 1, 2].map(k => -0.55 * right[k] + 0.75 * up[k] + 0.7 * t[k])), Lf = norm([0, 1, 2].map(k => 0.8 * right[k] - 0.2 * up[k] + 0.55 * t[k]));
  const z = new Float32Array(W * H).fill(-1e30), col = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) { col[i * 3] = bg[0]; col[i * 3 + 1] = bg[1]; col[i * 3 + 2] = bg[2]; }
  const alb = [0, 0, 0];
  for (const P of prims) {
    const nv = P.pos.length / 3, sx = new Float32Array(nv), sy = new Float32Array(nv), sz = new Float32Array(nv), shade = new Float32Array(nv);
    for (let v = 0; v < nv; v++) {
      const x = P.pos[v * 3] - center[0], y = P.pos[v * 3 + 1] - center[1], zz = P.pos[v * 3 + 2] - center[2];
      sx[v] = W / 2 + (x * right[0] + y * right[1] + zz * right[2]) * sc; sy[v] = H / 2 - (x * up[0] + y * up[1] + zz * up[2]) * sc; sz[v] = x * t[0] + y * t[1] + zz * t[2];
    }
    const hasN = !!P.nrm;
    for (let f = 0; f < P.idx.length; f += 3) {
      const a = P.idx[f], b = P.idx[f + 1], c = P.idx[f + 2];
      const x0 = sx[a], y0 = sy[a], x1 = sx[b], y1 = sy[b], x2 = sx[c], y2 = sy[c];
      const den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
      if (Math.abs(den) < 1e-9) continue;
      // face normal (fallback + sidedness), world space
      const ux = P.pos[b * 3] - P.pos[a * 3], uy = P.pos[b * 3 + 1] - P.pos[a * 3 + 1], uz = P.pos[b * 3 + 2] - P.pos[a * 3 + 2];
      const vx = P.pos[c * 3] - P.pos[a * 3], vy = P.pos[c * 3 + 1] - P.pos[a * 3 + 1], vz = P.pos[c * 3 + 2] - P.pos[a * 3 + 2];
      let fn = norm([uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]);
      if (fn[0] * t[0] + fn[1] * t[1] + fn[2] * t[2] < 0 && !hasN) fn = fn.map(q => -q);
      const xa = Math.max(0, Math.floor(Math.min(x0, x1, x2))), xb = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
      const ya = Math.max(0, Math.floor(Math.min(y0, y1, y2))), yb = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
      for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
        const px = x + 0.5, py = y + 0.5;
        const l1 = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / den, l2 = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / den, l3 = 1 - l1 - l2;
        if (l1 < -1e-5 || l2 < -1e-5 || l3 < -1e-5) continue;
        const d = l1 * sz[a] + l2 * sz[b] + l3 * sz[c], zi = y * W + x;
        if (d <= z[zi]) continue;
        const u = P.uv ? l1 * P.uv[a * 2] + l2 * P.uv[b * 2] + l3 * P.uv[c * 2] : NaN, vv = P.uv ? l1 * P.uv[a * 2 + 1] + l2 * P.uv[b * 2 + 1] + l3 * P.uv[c * 2 + 1] : NaN;
        if (!albedoAt(P.mat, u, vv, alb)) continue;
        let n = fn;
        if (hasN) {
          n = norm([l1 * P.nrm[a * 3] + l2 * P.nrm[b * 3] + l3 * P.nrm[c * 3], l1 * P.nrm[a * 3 + 1] + l2 * P.nrm[b * 3 + 1] + l3 * P.nrm[c * 3 + 1], l1 * P.nrm[a * 3 + 2] + l2 * P.nrm[b * 3 + 2] + l3 * P.nrm[c * 3 + 2]]);
          if (n[0] * t[0] + n[1] * t[1] + n[2] * t[2] < 0 && fn[0] * t[0] + fn[1] * t[1] + fn[2] * t[2] < 0) n = n.map(q => -q);   // back face seen from behind: flip
        }
        const k = 0.42 + 0.62 * Math.max(0, n[0] * Lk[0] + n[1] * Lk[1] + n[2] * Lk[2]) + 0.16 * Math.max(0, n[0] * Lf[0] + n[1] * Lf[1] + n[2] * Lf[2]);
        z[zi] = d; col[zi * 3] = Math.min(255, alb[0] * k); col[zi * 3 + 1] = Math.min(255, alb[1] * k); col[zi * 3 + 2] = Math.min(255, alb[2] * k);
      }
    }
  }
  const rgba = new Uint8ClampedArray(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let r = 0, g = 0, b = 0;
    for (let yy = 0; yy < ss; yy++) for (let xx = 0; xx < ss; xx++) { const i = ((y * ss + yy) * W + x * ss + xx) * 3; r += col[i]; g += col[i + 1]; b += col[i + 2]; }
    const o = (y * S + x) * 4, n = ss * ss; rgba[o] = Math.round(r / n); rgba[o + 1] = Math.round(g / n); rgba[o + 2] = Math.round(b / n); rgba[o + 3] = 255;
  }
  return { W: S, H: S, rgba };
}

/** Area-uniform lattice samples of the albedo: calls fn(r, g, b, x, y, z, prim) per sample (deterministic, ~`budget` samples). */
export function sampleAlbedo(prims, budget, fn) {
  let area = 0;
  const tri = (P, f) => {
    const a = P.idx[f] * 3, b = P.idx[f + 1] * 3, c = P.idx[f + 2] * 3, p = P.pos;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    return 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
  };
  for (const P of prims) for (let f = 0; f < P.idx.length; f += 3) area += tri(P, f);
  const a0 = area / budget || 1, alb = [0, 0, 0];
  for (const P of prims) for (let f = 0; f < P.idx.length; f += 3) {
    const k = Math.max(1, Math.min(48, Math.round(Math.sqrt(tri(P, f) / a0))));
    const ia = P.idx[f], ib = P.idx[f + 1], ic = P.idx[f + 2];
    const put = (l1, l2) => {
      const l3 = 1 - l1 - l2, at = (arr, n, c) => l1 * arr[ia * n + c] + l2 * arr[ib * n + c] + l3 * arr[ic * n + c];
      const u = P.uv ? at(P.uv, 2, 0) : NaN, v = P.uv ? at(P.uv, 2, 1) : NaN;
      if (!albedoAt(P.mat, u, v, alb)) return;
      fn(alb[0], alb[1], alb[2], at(P.pos, 3, 0), at(P.pos, 3, 1), at(P.pos, 3, 2), P);
    };
    for (let i = 0; i < k; i++) for (let j = 0; j < k - i; j++) {
      put((i + 1 / 3) / k, (j + 1 / 3) / k);
      if (j < k - i - 1) put((i + 2 / 3) / k, (j + 2 / 3) / k);
    }
  }
}
