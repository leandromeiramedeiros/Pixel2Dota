// Tiny orthographic SDF renderer that turns a 3D "paper doll" into shaded, outlined ASCII pixel frames.
// Model space: units = sprite pixels, +x = character's left, +y up, +z = forward; feet at y=0, centre x=z=0.
// Yaw 0 = facing the camera (s), 90 = facing screen right (e), 180 = facing away (n). Light is fixed in view space.
//
//   prims: ellipsoid(c,r,o) cone(a,b,r1,r2,o) box(c,h,rad,o) custom(sd,c,R,o)       o: {mat, alt, grp, bias}
//   mat:   {ramp:[light..dark 4 chars], ol:dark outline char, olL:lit-side outline char, unlit?, noOutline?}
//   alt(x,y,z,nx,ny,nz) -> mat | [mat, toneOverride] | undefined   (per-pixel material, e.g. eyes, trims; x,y,z in model space)
//   grp:   parts with different grp get a dark seam line on the far side where they overlap in depth
const D2R = Math.PI / 180;
export const flat = (ch, o = {}) => ({ ramp: [ch, ch, ch, ch], flat: true, ...o });

const mk = (sd, c, R, o = {}) => ({ sd, c, R, mat: o.mat, alt: o.alt, grp: o.grp ?? 0, bias: o.bias ?? 0 });

export function ellipsoid(c, r, o) {
  const [cx, cy, cz] = c, [rx, ry, rz] = r, m = Math.min(rx, ry, rz);
  return mk((x, y, z) => {
    const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz, k0 = Math.hypot(px, py, pz);
    if (k0 < 1e-6) return -m;
    const k1 = Math.hypot(px / rx, py / ry, pz / rz);
    return k0 * (k0 - 1) / k1;
  }, c, Math.max(rx, ry, rz), o);
}
export const sphere = (c, r, o) => ellipsoid(c, [r, r, r], o);

// round cone / capsule from a (radius r1) to b (radius r2)
export function cone(a, b, r1, r2 = r1, o) {
  const [ax, ay, az] = a, bx = b[0] - ax, by = b[1] - ay, bz = b[2] - az, l2 = bx * bx + by * by + bz * bz, rr = r1 - r2;
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], R = Math.sqrt(l2) / 2 + Math.max(r1, r2);
  if (l2 < 1e-6 || rr * rr >= l2) {   // degenerate: one end swallows the other
    const big = r1 >= r2, c = big ? a : b, r = Math.max(r1, r2);
    return mk((x, y, z) => Math.hypot(x - c[0], y - c[1], z - c[2]) - r, mid, R, o);
  }
  const a2 = l2 - rr * rr, il2 = 1 / l2, srr = Math.sign(rr);
  return mk((x, y, z) => {
    const px = x - ax, py = y - ay, pz = z - az, yy = px * bx + py * by + pz * bz, zz = yy - l2;
    const qx = px * l2 - bx * yy, qy = py * l2 - by * yy, qz = pz * l2 - bz * yy, x2 = qx * qx + qy * qy + qz * qz;
    const y2 = yy * yy * l2, z2 = zz * zz * l2, k = srr * rr * rr * x2;
    if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
  }, mid, R, o);
}

// axis-aligned rounded box, half extents h, corner radius rad
export function box(c, h, rad, o) {
  const [cx, cy, cz] = c, [hx, hy, hz] = h;
  return mk((x, y, z) => {
    const qx = Math.abs(x - cx) - hx + rad, qy = Math.abs(y - cy) - hy + rad, qz = Math.abs(z - cz) - hz + rad;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - rad;
  }, c, Math.hypot(hx, hy, hz), o);
}
export const custom = (sd, c, R, o) => mk(sd, c, R, o);

// turn prims about the vertical axis through pivot (used for head turns toward the camera); mutates and returns the list
export function rotY(prims, pivot, deg) {
  const a = deg * D2R, ca = Math.cos(a), sa = Math.sin(a), [px, , pz] = pivot;
  for (const p of prims) {
    const sd = p.sd, alt = p.alt, c = p.c, dx = c[0] - px, dz = c[2] - pz;
    p.c = [px + dx * ca + dz * sa, c[1], pz - dx * sa + dz * ca]; p.R += 0;
    const back = (x, z) => { const X = x - px, Z = z - pz; return [px + X * ca - Z * sa, pz + X * sa + Z * ca]; };
    p.sd = (x, y, z) => { const [lx, lz] = back(x, z); return sd(lx, y, lz); };
    if (alt) p.alt = (x, y, z, nx, ny, nz) => { const [lx, lz] = back(x, z); return alt(lx, y, lz, nx * ca - nz * sa, ny, nx * sa + nz * ca); };
  }
  return prims;
}
export const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const len3 = a => Math.hypot(a[0], a[1], a[2]);
export const norm3 = a => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// two-bone IK: root a -> end t with segment lengths l1,l2; mid joint bends toward `pole`. Returns {mid,end} (end clamped to reach)
export function ik2(a, t, l1, l2, pole) {
  let d = sub3(t, a), D = len3(d); const max = l1 + l2 - 0.01;
  if (D > max) { d = mul3(d, max / D); D = max; t = add3(a, d); }
  if (D < 0.5) return { mid: add3(a, mul3(norm3(pole), l1)), end: t };
  const dn = mul3(d, 1 / D), x = (l1 * l1 - l2 * l2 + D * D) / (2 * D), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  let pp = sub3(pole, mul3(dn, dot3(pole, dn))); pp = norm3(pp);
  return { mid: add3(add3(a, mul3(dn, x)), mul3(pp, h)), end: t };
}

// ---------- renderer ----------
// opt: {W,H, ax,ay (continuous anchor px; model origin lands here), yaw, pitch, light, T (tone thresholds on half-lambert), shadow}
export function render(prims, opt) {
  const { W, H, ax, ay } = opt, yaw = (opt.yaw || 0) * D2R, pit = (opt.pitch ?? 12) * D2R;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pit), sp = Math.sin(pit);
  const r0 = [cy, 0, sy], r1 = [sy * sp, cp, -cy * sp], r2 = [-sy * cp, sp, cy * cp];     // view = M * model
  const dm = [-r2[0], -r2[1], -r2[2]];                                                     // ray direction in model space
  const Lv = norm3(opt.light || [-0.5, 0.72, 0.5]), Lm = [Lv[0] * r0[0] + Lv[1] * r1[0] + Lv[2] * r2[0], Lv[0] * r0[1] + Lv[1] * r1[1] + Lv[2] * r2[1], Lv[0] * r0[2] + Lv[1] * r1[2] + Lv[2] * r2[2]];
  const T = opt.T || [0.9, 0.64, 0.36], N = prims.length;
  // bounding sphere of everything
  let sc = [0, 0, 0]; for (const p of prims) sc = add3(sc, p.c); sc = mul3(sc, 1 / N);
  let SR = 0; for (const p of prims) SR = Math.max(SR, len3(sub3(p.c, sc)) + p.R); SR += 1;
  const sdAll = (x, y, z) => {
    let best = 1e9, bi = -1;
    for (let k = 0; k < N; k++) {
      const p = prims[k], c = p.c, dx = x - c[0], dy = y - c[1], dz = z - c[2];
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) - p.R >= best) continue;
      const d = p.sd(x, y, z); if (d < best) { best = d; bi = k; }
    }
    return [best, bi];
  };
  const dist = (x, y, z) => sdAll(x, y, z)[0];
  const px = new Array(W * H).fill(null);   // {ch, mat, grp, z}
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const vx = i + 0.5 - ax, vy = ay - (j + 0.5);
    const ox = r0[0] * vx + r1[0] * vy, oy = r0[1] * vx + r1[1] * vy, oz = r0[2] * vx + r1[2] * vy;
    const tc = (sc[0] - ox) * dm[0] + (sc[1] - oy) * dm[1] + (sc[2] - oz) * dm[2];
    const cd2 = (sc[0] - ox) ** 2 + (sc[1] - oy) ** 2 + (sc[2] - oz) ** 2 - tc * tc;
    if (cd2 > SR * SR) continue;
    const half = Math.sqrt(SR * SR - cd2); let t = tc - half; const t1 = tc + half;
    let hit = -1, hx = 0, hy = 0, hz = 0;
    for (let s = 0; s < 70 && t < t1; s++) {
      const x = ox + dm[0] * t, y = oy + dm[1] * t, z = oz + dm[2] * t, [d, bi] = sdAll(x, y, z);
      if (d < 0.05) { hit = bi; hx = x; hy = y; hz = z; break; }
      t += Math.max(0.05, d * 0.85);
    }
    if (hit < 0) continue;
    const e = 0.35, d0 = dist(hx, hy, hz);
    let nx = dist(hx + e, hy, hz) - dist(hx - e, hy, hz), ny = dist(hx, hy + e, hz) - dist(hx, hy - e, hz), nz = dist(hx, hy, hz + e) - dist(hx, hy, hz - e);
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl; void d0;
    const pr = prims[hit];
    let m = pr.mat, tone = -1;
    if (pr.alt) { const a = pr.alt(hx, hy, hz, nx, ny, nz); if (a) { if (Array.isArray(a)) { m = a[0]; tone = a[1]; } else m = a; } }
    if (tone < 0) {
      if (m.unlit) {
        const nv = nx * r2[0] + ny * r2[1] + nz * r2[2];
        tone = nv > 0.72 ? 0 : nv > 0.42 ? 1 : nv > 0.1 ? 2 : 3;
      } else {
        let lum = 0.5 + 0.5 * (nx * Lm[0] + ny * Lm[1] + nz * Lm[2]) + pr.bias * 0.12;
        if (opt.shadow !== false && !m.flat) {   // hard self-shadow toward the light
          let st = 1.2, sh = false;
          for (let s = 0; s < 14; s++) { const dd = dist(hx + Lm[0] * st + nx * 0.4, hy + Lm[1] * st + ny * 0.4, hz + Lm[2] * st + nz * 0.4); if (dd < 0.2) { sh = true; break; } st += Math.max(0.8, dd); if (st > 34) break; }
          if (sh) lum -= 0.3;
        }
        tone = lum > T[0] ? 0 : lum > T[1] ? 1 : lum > T[2] ? 2 : 3;
      }
    }
    px[j * W + i] = { ch: m.ramp[tone], mat: m, grp: pr.grp, z: hx * r2[0] + hy * r2[1] + hz * r2[2] };
  }
  // ---- seams: far pixel next to a clearly nearer pixel of another part gets the dark outline tone ----
  const out = px.map(p => p && p.ch), thr = opt.seam ?? 2.6;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const p = px[j * W + i]; if (!p || p.mat.noOutline) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const q = px[(j + dy) * W + i + dx]; if (i + dx < 0 || i + dx >= W || !q || q.grp === p.grp || q.mat.noOutline) continue;
      if (q.z > p.z + thr) { out[j * W + i] = p.mat.ol || 'K'; break; }
    }
  }
  // ---- outer outline: dark, but lighter on the lit (top/left) edges ----
  const g = Array.from({ length: H }, (_, j) => Array.from({ length: W }, (_, i) => out[j * W + i] || '.'));
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (px[j * W + i]) continue;
    let dark = null, lit = null;
    for (const [dx, dy, isLit] of [[0, 1, 1], [1, 0, 1], [0, -1, 0], [-1, 0, 0]]) {
      const x = i + dx, y = j + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const q = px[y * W + x]; if (!q || q.mat.noOutline) continue;
      if (isLit) lit = lit || q; else dark = dark || q;
    }
    if (dark) g[j][i] = dark.mat.ol || 'K'; else if (lit) g[j][i] = lit.mat.olL || lit.mat.ol || 'K';
  }
  return g.map(r => r.join(''));
}
