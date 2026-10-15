// CPU 2D preview of a flattened vpcf tree (tools/fx/lib/vpcf.mjs flatten()): a rough, deterministic re-play of the core particle ops, for the OG panel.
// Interprets: emitters (instant / continuous / noise / maintain, start + duration), child delays, lifetime, radius (+ InterpolateRadius), alpha
// (+ FadeIn / FadeOut), colour (RandomColor / InitVec / ColorInterpolate), spawn shape (sphere / ring / path / model / position offset), velocity
// (sphere speed + local speed, VelocityRandom, InitialVelocityNoise), gravity + drag; sprites (frame 0 of the texture, tinted, additive or alpha),
// ropes / trails as tinted streaks, deferred lights as soft glows. NOT interpreted: models, curves / CP-driven inputs (fall back to their literal or
// output range), moving control points, noise / vortex / attract forces, constraints, sequence animation, orientation / roll, screen-space sizing.
// Control points: CP0 = caster at the origin, CP1 = target at +x `dist`, every other CP = CP1 if the system reads 1 and 2 as a path, else CP0.
import { range } from './vpcf.mjs';

export const PREVIEW = {
  can: 'emit timing (instant / rate / duration / child delays), lifetimes, radius + radius interpolation, alpha fades, colours + colour fades, spawn shapes (sphere / ring / path / model), initial + local velocity, gravity, drag, sprite textures (frame 0, tinted), additive vs alpha blend, ropes / trails as streaks, deferred lights as glows',
  cannot: 'models (.vmdl), moving / attached control points (projectiles do not travel, CPs are static), curve / CP / time-driven inputs (literal or output range used; a CP-driven emit rate with neither plays at 20/s), noise / vortex / attraction forces, constraints, sprite-sheet animation, roll / orientation, screen-space or max-size clamps, soft particles, distortion / refraction, bloom / tone mapping of the real engine',
};

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const lerp = (a, b, t) => a + (b - a) * t;
const pick = (R, x, d) => { const [a, b] = range(x, d); return lerp(a, b, R()); };
const v3 = (a) => (Array.isArray(a) && a.length >= 3 ? [+a[0] || 0, +a[1] || 0, +a[2] || 0] : [0, 0, 0]);
const vr = (R, lo, hi) => { lo = v3(lo); hi = v3(hi); return [lerp(lo[0], hi[0], R()), lerp(lo[1], hi[1], R()), lerp(lo[2], hi[2], R())]; };
const hashStr = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

/** Particles of one system alive at time t (seconds after the ability fired). Each: { p: [x,y,z], v, r, a, c: [r,g,b] (0..255) }. */
export function simulate(S, t, cps) {
  const ts = t - (S.delay || 0); if (ts < 0) return [];
  const R = rng(hashStr(S.path)), I = S.init || {}, O = S.ops || {};
  const spawns = [];
  for (const E of S.emitters || []) {
    const start = typeof E.start === 'number' ? E.start : range(E.start, 0)[0];
    if (/Instantaneous|Maintain/.test(E.cls)) { const n = Math.min(2000, Math.round(range(E.count, 1)[1])); for (let i = 0; i < n; i++) spawns.push({ at: start, i, n }); }
    else {
      // a CP / curve driven rate without a literal plays at 20/s
      const rate = (range(E.rate, 20)[0] + range(E.rate, 20)[1]) / 2, dur = range(E.duration, 0)[1] || 0;
      if (rate <= 0) continue;
      const end = Math.min(ts, dur > 0 ? start + dur : ts), n = Math.min(4000, Math.floor(Math.max(0, end - start) * rate));
      for (let i = 0; i < n; i++) spawns.push({ at: start + i / rate, i, n });
    }
  }
  const maxP = S.maxParticles || 1000, out = [];
  const cpOf = (k) => cps[k] || cps[0];
  for (const sp of spawns) {
    if (sp.at > ts) continue;
    const life = Math.max(0.01, pick(R, I.life, S.constant.life)), age = ts - sp.at;
    let rad = pick(R, I.radius, S.constant.radius), alpha = I.alpha ? pick(R, I.alpha, 1) : (S.constant.color[3] ?? 255) / 255;
    const ca = I.color ? I.color[0] : S.constant.color, cb = I.color ? I.color[1] : S.constant.color, cr = R();
    let col = [0, 1, 2].map((k) => lerp(ca[k] ?? 255, cb[k] ?? 255, cr));
    let p = [0, 0, 0], v = [0, 0, 0];
    const sh = I.shape;
    if (sh?.type === 'sphere') {
      const c = cpOf(sh.cp), u = R() * 2 - 1, th = R() * Math.PI * 2, s = Math.sqrt(1 - u * u), d = [s * Math.cos(th), s * Math.sin(th), u];
      const rr = lerp(sh.r[0], sh.r[1], R()), b = v3(sh.bias), spd = lerp(sh.speed[0], sh.speed[1], R());
      p = [c[0] + d[0] * rr * b[0], c[1] + d[1] * rr * b[1], c[2] + d[2] * rr * b[2]];
      const l = vr(R, sh.local[0], sh.local[1]);
      v = [d[0] * spd + l[0], d[1] * spd + l[1], d[2] * spd + l[2]];
    } else if (sh?.type === 'ring') {
      const c = cpOf(sh.cp), th = R() * Math.PI * 2, rr = lerp(sh.r[0], sh.r[1], R()), spd = lerp(sh.speed[0], sh.speed[1], R());
      p = [c[0] + Math.cos(th) * rr, c[1] + Math.sin(th) * rr, c[2]]; v = [Math.cos(th) * spd, Math.sin(th) * spd, 0];
    } else if (sh?.type === 'path') {
      let a = cpOf(sh.a), b = cpOf(sh.b); if (a === b) { a = cps[0]; b = cps[1]; }
      const f = sp.n > 1 ? sp.i / (sp.n - 1) : R();
      p = [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
    } else if (sh?.type === 'model') { const c = cpOf(sh.cp); p = [c[0] + (R() - 0.5) * 50, c[1] + (R() - 0.5) * 50, c[2] + R() * 130]; }
    else p = cps[0].slice();
    for (const [lo, hi] of I.offset || []) { const o = vr(R, lo, hi); p[0] += o[0]; p[1] += o[1]; p[2] += o[2]; }
    if (I.vel) { const d = vr(R, [-1, -1, -1], [1, 1, 1]), n = Math.hypot(...d) || 1, s = lerp(I.vel.speed[0], I.vel.speed[1], R()), l = vr(R, I.vel.local[0], I.vel.local[1]); for (let k = 0; k < 3; k++) v[k] += (d[k] / n) * s + l[k]; }
    if (I.velNoise) { const n = vr(R, I.velNoise[0], I.velNoise[1]); for (let k = 0; k < 3; k++) v[k] += n[k]; }
    if (age > life) continue;
    // integrate at 30 Hz (gravity, drag)
    const g = v3(O.gravity), drag = typeof O.drag === 'number' ? O.drag : 0, dt = 1 / 30;
    for (let s = 0; s < age; s += dt) {
      const h = Math.min(dt, age - s);
      for (let k = 0; k < 3; k++) { v[k] += g[k] * h; v[k] *= Math.pow(1 - Math.min(0.99, drag), h * 30); p[k] += v[k] * h; }
    }
    const f = age / life;
    if (O.radius) { const { from, to, t0, t1 } = O.radius; rad *= f <= t0 ? from : f >= t1 ? to : lerp(from, to, (f - t0) / Math.max(1e-6, t1 - t0)); }
    if (O.fadeIn && f < O.fadeIn) alpha *= f / O.fadeIn;
    if (O.fadeOut && f > 1 - O.fadeOut) alpha *= Math.max(0, (1 - f) / O.fadeOut);
    if (O.colorFade) { const { to, t0, t1 } = O.colorFade, k = f <= t0 ? 0 : f >= t1 ? 1 : (f - t0) / Math.max(1e-6, t1 - t0); col = col.map((x, j) => lerp(x, to[j] ?? x, k)); }
    out.push({ p, v, r: Math.max(0.5, rad), a: Math.max(0, Math.min(1, alpha)), c: col });
  }
  return out.slice(-maxP);
}

/** Camera: CP0 at the origin, looking north at `elev` degrees; world units -> px by `scale`, centred on (cx, cy). */
export function camera({ W, H, scale, cx, cy, elev = 55 }) {
  const se = Math.sin(elev * Math.PI / 180), ce = Math.cos(elev * Math.PI / 180);
  return { W, H, scale, proj: (p) => [cx + p[0] * scale, cy - (p[1] * se + p[2] * ce) * scale] };
}

/** World-space extent of the tree over the times (for an auto-fit camera): [minX, maxX, minY', maxY'] in projected units at scale 1. */
export function extent(flat, times, cps, elev = 55) {
  const se = Math.sin(elev * Math.PI / 180), ce = Math.cos(elev * Math.PI / 180), xs = [], ys = [];
  for (const t of times) for (const S of flat) if (!S.disabled && !S.error) for (const q of simulate(S, t, cps)) { xs.push(q.p[0]); ys.push(-(q.p[1] * se + q.p[2] * ce)); }
  for (const c of cps.slice(0, 2)) { xs.push(c[0]); ys.push(0); }
  const pc = (a, f) => { const s = a.slice().sort((x, y) => x - y); return s[Math.max(0, Math.min(s.length - 1, Math.floor(f * (s.length - 1))))]; };
  return [pc(xs, 0.03), pc(xs, 0.97), pc(ys, 0.03), pc(ys, 0.97)];
}

/** Draw the tree at time t into a float RGB buffer. tex(path) -> { W, H, rgba } | null. */
export function render(flat, t, cps, cam, tex, bg = [16, 18, 26]) {
  const { W, H } = cam, buf = new Float32Array(W * H * 3);
  for (let i = 0; i < W * H; i++) { buf[i * 3] = bg[0]; buf[i * 3 + 1] = bg[1]; buf[i * 3 + 2] = bg[2]; }
  // ground grid every 100 u + CP markers
  const line = (a, b, col, k) => { const [x0, y0] = cam.proj(a), [x1, y1] = cam.proj(b), n = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) + 1; for (let i = 0; i <= n; i++) { const x = Math.round(lerp(x0, x1, i / n)), y = Math.round(lerp(y0, y1, i / n)); if (x >= 0 && y >= 0 && x < W && y < H) for (let q = 0; q < 3; q++) buf[(y * W + x) * 3 + q] = lerp(buf[(y * W + x) * 3 + q], col[q], k); } };
  for (let g = -2000; g <= 3000; g += 100) { line([g, -1500, 0], [g, 1500, 0], [60, 66, 90], 0.35); line([-2000, g - 500, 0], [3000, g - 500, 0], [60, 66, 90], 0.35); }
  const ring = (c, col) => { for (let k = 0; k < 24; k++) { const a0 = (k / 24) * Math.PI * 2, a1 = ((k + 1) / 24) * Math.PI * 2; line([c[0] + Math.cos(a0) * 40, c[1] + Math.sin(a0) * 40, 0], [c[0] + Math.cos(a1) * 40, c[1] + Math.sin(a1) * 40, 0], col, 0.8); } };
  ring(cps[0], [90, 160, 255]); ring(cps[1], [255, 90, 90]);
  const splat = (q, img, add, gain) => {
    const [sx, sy] = cam.proj(q.p), rp = Math.max(0.6, q.r * cam.scale);
    const x0 = Math.floor(sx - rp), x1 = Math.ceil(sx + rp), y0 = Math.floor(sy - rp), y1 = Math.ceil(sy + rp);
    for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
      const u = (x + 0.5 - (sx - rp)) / (2 * rp), v = (y + 0.5 - (sy - rp)) / (2 * rp);
      let tr = 255, tg = 255, tb = 255, ta;
      if (img) { const i = (Math.max(0, Math.min(img.H - 1, Math.floor(v * img.H))) * img.W + Math.max(0, Math.min(img.W - 1, Math.floor(u * img.W)))) * 4; tr = img.rgba[i]; tg = img.rgba[i + 1]; tb = img.rgba[i + 2]; ta = img.rgba[i + 3] / 255; }
      else { const d = Math.hypot(u - 0.5, v - 0.5) * 2; ta = d >= 1 ? 0 : (1 - d) * (1 - d); }
      const a = ta * q.a; if (a <= 0.002) continue;
      const j = (y * W + x) * 3, cr = (tr / 255) * q.c[0], cg = (tg / 255) * q.c[1], cb = (tb / 255) * q.c[2];
      if (add) { buf[j] += cr * a * gain; buf[j + 1] += cg * a * gain; buf[j + 2] += cb * a * gain; }
      else { buf[j] = lerp(buf[j], cr, a); buf[j + 1] = lerp(buf[j + 1], cg, a); buf[j + 2] = lerp(buf[j + 2], cb, a); }
    }
  };
  for (const S of flat) {
    if (S.disabled || S.error) continue;
    const ps = simulate(S, t, cps); if (!ps.length) continue;
    for (const Rd of S.renderers || []) {
      if (Rd.kind === 'sprite') { const img = Rd.textures?.[0] ? tex(Rd.textures[0]) : null, gain = typeof Rd.overbright === 'number' ? Math.min(4, Rd.overbright) : 1; for (const q of ps) splat(q, img, Rd.additive, gain); }
      else if (Rd.kind === 'rope' || Rd.kind === 'trail') {
        for (let i = 0; i < ps.length; i++) {
          const q = ps[i], nx = Rd.kind === 'rope' ? ps[i + 1] : null, sp = Math.hypot(...q.v) || 1;
          const tail = nx ? nx.p : [q.p[0] - (q.v[0] / sp) * q.r * 4, q.p[1] - (q.v[1] / sp) * q.r * 4, q.p[2] - (q.v[2] / sp) * q.r * 4];
          const steps = Math.max(1, Math.ceil(Math.hypot(tail[0] - q.p[0], tail[1] - q.p[1], tail[2] - q.p[2]) * cam.scale / 2));
          for (let k = 0; k <= steps; k++) { const f = k / steps; splat({ ...q, p: [lerp(q.p[0], tail[0], f), lerp(q.p[1], tail[1], f), lerp(q.p[2], tail[2], f)], r: q.r * 0.35, a: q.a * 0.35 }, null, true, 1); }
        }
      } else if (Rd.kind === 'light') {
        const lc = Array.isArray(Rd.color) && Rd.color.length >= 3 ? Rd.color.map((x) => (x <= 1.5 ? x * 255 : x)) : null;
        for (const q of ps) splat({ ...q, r: q.r * (Rd.radiusScale || 1), a: q.a * 0.18 * (Rd.alphaScale || 1), c: lc ? lc.map((x, k) => (x * q.c[k]) / 255) : q.c }, null, true, 1);
      }
    }
  }
  const px = new Uint8ClampedArray(W * H * 4);
  // hue-preserving soft clip: linear up to 190, then the brightest channel rolls off towards 255 (additive pile-ups keep their colour, no flat white)
  for (let i = 0; i < W * H; i++) {
    const r = buf[i * 3], g = buf[i * 3 + 1], b = buf[i * 3 + 2], m = Math.max(r, g, b), k = m > 190 ? (190 + 65 * (1 - Math.exp(-(m - 190) / 65))) / m : 1;
    px[i * 4] = r * k; px[i * 4 + 1] = g * k; px[i * 4 + 2] = b * k; px[i * 4 + 3] = 255;
  }
  return { W, H, rgba: px };
}
