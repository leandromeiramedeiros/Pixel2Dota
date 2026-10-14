// Lina2d kit: masks, shaded painter, outline, hand-stamp, PNG output. Used by lina2d.mjs (entry) + lina2d_views.mjs (figure).
//
// Method (no 3D): 2D vector parts (polygons / capsules / spine-tongues) rasterised at native pixel size, shaded per part in
// flat hue-shifted bands (fixed top-left key light), coloured interior lines, a selective silhouette outline, then a
// hand-typed pixel-row detail pass (face, gold ornament, highlights, embers).
//
// Frame: W x H below, anchor = bottom-centre between the feet (ANCHOR). Figure: ~80 px boot sole -> top of hair (flames excluded).
// Runtime px:2 => 3 world units per art px => ~240 world units tall.
import fs from 'node:fs';
import path from 'node:path';
import { encodePng } from '../png.mjs';

export const W = 88, H = 102;
export const ANCHOR = [44, 101];

// ---------------------------------------------------------------- colour
const h2r = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const r2h = r => '#' + r.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = h2r(a), B = h2r(b); return r2h(A.map((v, i) => v + (B[i] - v) * t)); };

// ramps: [hi, light, mid, shade, deep, line]   (warm lights -> cool purple-red shadows)
export const R = {
  skin: ['#ffe6c6', '#fcc296', '#ec9670', '#bc606c', '#82406a', '#3c1830'],
  hair: ['#fff3a0', '#ffc43c', '#ff8a26', '#e8501e', '#a8262c', '#3e0e2a'],
  red: ['#ff8056', '#ea483a', '#bc2a36', '#88193e', '#561442', '#260a2e'],
  gold: ['#fffbc4', '#ffe268', '#f2b232', '#c47c26', '#7c4430', '#34162c'],
  boot: ['#c0583e', '#8e3638', '#5e2238', '#3e1638', '#26102e', '#14081e'],
  orange: ['#ffd672', '#ffa63e', '#f0702c', '#c8422e', '#8a2838', '#3a1030'],
  fire: ['#ffffff', '#fff6b8', '#ffd860', '#ff9a30', '#e8501e', '#8a1c24'],
};

// ---------------------------------------------------------------- masks (Uint8Array W*H)
const mk = () => new Uint8Array(W * H);
const I = (x, y) => y * W + x;
function rast(f, bb) {
  const m = mk(); const [x0, y0, x1, y1] = bb || [0, 0, W - 1, H - 1];
  for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) if (f(x + 0.5, y + 0.5)) m[I(x, y)] = 1;
  return m;
}
export function poly(pts) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return rast((px, py) => {
    let ins = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) ins = !ins;
    }
    return ins;
  }, [Math.floor(Math.min(...xs)), Math.floor(Math.min(...ys)), Math.ceil(Math.max(...xs)), Math.ceil(Math.max(...ys))]);
}
export function ell(cx, cy, rx, ry, rot = 0) {
  const c = Math.cos(rot), s = Math.sin(rot), R_ = Math.max(rx, ry) + 1;
  return rast((px, py) => { const dx = px - cx, dy = py - cy; const u = dx * c + dy * s, v = -dx * s + dy * c; return (u * u) / (rx * rx) + (v * v) / (ry * ry) <= 1; }, [Math.floor(cx - R_), Math.floor(cy - R_), Math.ceil(cx + R_), Math.ceil(cy + R_)]);
}
export function cap(x0, y0, r0, x1, y1, r1) {
  const R_ = Math.max(r0, r1) + 1, dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
  return rast((px, py) => { let t = ((px - x0) * dx + (py - y0) * dy) / L2; t = Math.max(0, Math.min(1, t)); const cx = x0 + dx * t, cy = y0 + dy * t; const r = r0 + (r1 - r0) * t; return Math.hypot(px - cx, py - cy) <= r; },
    [Math.floor(Math.min(x0, x1) - R_), Math.floor(Math.min(y0, y1) - R_), Math.ceil(Math.max(x0, x1) + R_), Math.ceil(Math.max(y0, y1) + R_)]);
}
export const rect = (x0, y0, x1, y1) => rast((px, py) => px >= x0 && px <= x1 + 1 && py >= y0 && py <= y1 + 1);
export const or = (...ms) => { const o = mk(); for (const m of ms) for (let i = 0; i < o.length; i++) if (m[i]) o[i] = 1; return o; };
export const sub = (a, ...bs) => { const o = Uint8Array.from(a); for (const b of bs) for (let i = 0; i < o.length; i++) if (b[i]) o[i] = 0; return o; };
export const and = (a, b) => { const o = mk(); for (let i = 0; i < o.length; i++) if (a[i] && b[i]) o[i] = 1; return o; };
export function shift(m, dx, dy) { const o = mk(); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[I(x, y)]) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H) o[I(X, Y)] = 1; } return o; }

// catmull-rom spine "tongue": tapering flame/ribbon. returns {m, T (0 root..1 tip), S (-1 left..+1 right across width)}
export function tongue(pts, w, o = {}) {
  const p = o.pow ?? 0.8, bulge = o.bulge ?? 0, N = 80, sp = [];
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  const segs = pts.length - 1;
  for (let i = 0; i <= N; i++) {
    const u = i / N * segs, k = Math.min(segs - 1, Math.floor(u)), t = u - k;
    const [a, b, c, d] = [P[k], P[k + 1], P[k + 2], P[k + 3]];
    const f = q => 0.5 * ((2 * b[q]) + (-a[q] + c[q]) * t + (2 * a[q] - 5 * b[q] + 4 * c[q] - d[q]) * t * t + (-a[q] + 3 * b[q] - 3 * c[q] + d[q]) * t * t * t);
    sp.push([f(0), f(1)]);
  }
  const hw = t => w * Math.pow(Math.max(0, 1 - t), p) * (1 + bulge * Math.sin(Math.PI * Math.min(1, t * 1.4)));
  const m = mk(), T = new Float32Array(W * H), S = new Float32Array(W * H);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const [x, y] of sp) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const M = w + 2;
  for (let y = Math.max(0, Math.floor(y0 - M)); y <= Math.min(H - 1, Math.ceil(y1 + M)); y++) for (let x = Math.max(0, Math.floor(x0 - M)); x <= Math.min(W - 1, Math.ceil(x1 + M)); x++) {
    const px = x + 0.5, py = y + 0.5; let best = 1e9, bi = 0, bs = 0;
    for (let i = 0; i < N; i++) {
      const [ax, ay] = sp[i], [bx, by] = sp[i + 1], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
      let t = ((px - ax) * dx + (py - ay) * dy) / L2; t = Math.max(0, Math.min(1, t));
      const cx = ax + dx * t, cy = ay + dy * t, d = Math.hypot(px - cx, py - cy);
      if (d < best) { best = d; bi = i + t; bs = o.lit ? ((px - cx) + (py - cy) > 0 ? 1 : -1) : Math.sign((px - ax) * dy - (py - ay) * dx) * -1; }
    }
    const tt = bi / N, h = hw(tt);
    if (h > 0.2 && best <= h) { m[I(x, y)] = 1; T[I(x, y)] = tt; S[I(x, y)] = bs * best / h; }
  }
  return { m, T, S };
}

// ---------------------------------------------------------------- canvas
export class Cv {
  constructor() { this.px = new Array(W * H).fill(null); this.n = 0; this.glow = []; }
  at(x, y) { return x < 0 || y < 0 || x >= W || y >= H ? null : this.px[I(x, y)]; }
  set(x, y, hex, o = {}) { if (x < 0 || y < 0 || x >= W || y >= H) return; this.px[I(x, y)] = { hex, ramp: o.ramp || null, lv: o.lv ?? 0, part: o.part ?? -1, em: o.em || 0 }; }
  // paint a mask with a ramp. o.mode: 'form' (diag light rays) | function(x,y,a,b)=>level | number (flat level)
  paint(m, ramp, o = {}) {
    const id = ++this.n, rp = R[ramp] || ramp, mode = o.mode ?? 'form', bias = o.bias ?? 0, lo = o.lo ?? 0.34, hi = o.hi ?? 0.74;
    const inM = (x, y) => x >= 0 && y >= 0 && x < W && y < H && m[I(x, y)];
    const cells = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[I(x, y)]) {
      let a = 1; while (inM(x - a, y - a)) a++;
      let b = 1; while (inM(x + b, y + b)) b++;
      let lv;
      if (typeof mode === 'number') lv = mode;
      else if (typeof mode === 'function') lv = mode(x, y, a, b);
      else {
        const s = a / (a + b - 1 + 0.001), th = a + b - 1;
        lv = s < lo ? 1 : s < hi ? 2 : 3;
        if (th <= 3) lv = Math.min(lv, 2) === 1 && a > 1 ? 2 : lv;
        if (b === 1 && th >= 5 && o.rim !== false) lv = 4;
        if (o.hl && a === 1 && th >= 6 && ((x + y) % o.hl === 0)) lv = 0;
      }
      cells.push([x, y, lv]);
    }
    for (const [x, y, lv] of cells) { const L = Math.max(0, Math.min(5, lv + bias)); this.px[I(x, y)] = { hex: rp[L], ramp: rp, lv: L, part: id, em: 0 }; }
    // coloured interior lines where this part meets earlier parts
    if (o.line != null) for (const [x, y] of cells) {
      let touch = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H && !m[I(X, Y)] && this.px[I(X, Y)]) touch = true; }
      if (touch) { const p = this.px[I(x, y)]; const L = o.line; this.px[I(x, y)] = { ...p, hex: rp[L], lv: L }; }
    }
    return id;
  }
  // per-pixel level from tongue params
  paintT(tg, ramp, fn, o = {}) {
    const rp = R[ramp] || ramp;
    return this.paint(tg.m, rp, { ...o, mode: (x, y) => fn(tg.T[I(x, y)], tg.S[I(x, y)], x, y) });
  }
  // darken what is already painted under (caster shifted by dx,dy) -- contact shadow
  ao(caster, dx, dy, steps = 1, only) {
    const sh = shift(caster, dx, dy);
    for (let i = 0; i < W * H; i++) if (sh[i] && !caster[i] && this.px[i] && this.px[i].ramp && (!only || only(this.px[i]))) { const p = this.px[i]; const L = Math.min(4, p.lv + steps); this.px[i] = { ...p, lv: L, hex: p.ramp[L] }; }
  }
  // restyle pixels of an existing region by mask
  tint(m, fn) { for (let i = 0; i < W * H; i++) if (m[i] && this.px[i]) { const p = this.px[i]; const L = Math.max(0, Math.min(5, fn(p.lv, i % W, (i / W) | 0))); this.px[i] = { ...p, lv: L, hex: p.ramp ? p.ramp[L] : p.hex }; } }
  // hand pixel rows. legend char -> hex | [ramp,lv] | {hex,em}; '.' = keep, ' ' = keep. o.only: only over existing pixels
  stamp(x0, y0, rows, legend, o = {}) {
    rows.forEach((row, j) => [...row].forEach((ch, i) => {
      if (ch === '.' || ch === ' ') return;
      let v = legend[ch]; if (v == null) throw new Error('legend ' + ch);
      const x = x0 + i, y = y0 + j; if (o.only && !this.at(x, y)) return; if (o.onlySkin && !(this.at(x, y) && this.at(x, y).ramp === R.skin)) return; if (o.mask && !o.mask[I(x, y)]) return;
      if (v === 'clear') { this.px[I(x, y)] = null; return; }
      let hex, rp = null, lv = 0, em = 0;
      if (typeof v === 'string') hex = v;
      else if (Array.isArray(v)) { rp = R[v[0]]; lv = v[1]; hex = rp[lv]; em = v[2] || 0; }
      else { hex = v.hex; em = v.em || 0; }
      this.set(x, y, hex, { ramp: rp, lv, em });
    }));
  }
  // selective silhouette outline: dark hue-tinted ramp 'line' tone; lit (top/left) edges use the deep tone instead
  outline(o = {}) {
    const add = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!this.px[I(x, y)]) {
      let best = null, lit = false;
      for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) { const p = this.at(x + dx, y + dy); if (p && !p.noOutline) { if (!best || (p.ramp && !best.ramp)) { best = p; lit = dx > 0 || dy > 0; } } }
      if (best) add.push([x, y, best, lit]);
    }
    for (const [x, y, p, lit] of add) {
      const rp = p.ramp; let hex;
      if (rp) hex = lit && o.lit !== false ? mix(rp[5], rp[4], 0.45) : rp[5]; else hex = '#1a0a1c';
      this.px[I(x, y)] = { hex, ramp: null, lv: 5, part: -2, em: 0, ol: true };
    }
  }
  // fill 1-px gaps enclosed by painted pixels (otherwise the outline pass turns them into dark holes)
  fillHoles() {
    for (let pass = 0; pass < 2; pass++) { const add = [];
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (!this.px[I(x, y)]) {
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => this.px[I(x + dx, y + dy)]).filter(p => p && !p.noOutline);
        if (nb.length >= 3) add.push([x, y, nb.sort((a, b) => a.lv - b.lv)[0]]);
      }
      for (const [x, y, p] of add) this.px[I(x, y)] = { ...p };
    }
  }
  // scattered ember / sparkle pixels (never part of the silhouette)
  dot(x, y, hex, em = 0) { if (!this.at(x, y) && x >= 0 && y >= 0 && x < W && y < H) { this.set(x, y, hex, { em }); this.px[I(x, y)].noOutline = true; } }
}

// ---------------------------------------------------------------- output helpers
const hexRGB = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
export function toRGBA(cv) { const b = new Uint8Array(W * H * 4); for (let i = 0; i < W * H; i++) { const p = cv.px[i]; if (p) { b.set(hexRGB(p.hex), i * 4); b[i * 4 + 3] = 255; } } return b; }
// composite frames onto bg at scale s with additive engine-style glow for emit pixels. A canvas may carry .crop=[x,y,w,h].
const dims = cv => cv.crop ? [cv.crop[2], cv.crop[3]] : [W, H];
export function sheetPng(frames, scales, bg = '#2a2e3c', glow = true, pad = 6) {
  const B = hexRGB(bg), maxH = Math.max(...frames.map(c => dims(c)[1])), maxS = Math.max(...scales);
  let tw = pad; for (const s of scales) tw += frames.reduce((a, c) => a + (dims(c)[0] + pad) * s, 0) + pad;
  const th = maxS * maxH + 2 * pad;
  const img = new Uint8Array(tw * th * 4); for (let i = 0; i < tw * th; i++) { img.set(B, i * 4); img[i * 4 + 3] = 255; }
  let ox = pad;
  for (const s of scales) {
    for (const cv of frames) {
      const [fw, fh] = dims(cv), [cx, cy] = cv.crop || [0, 0];
      const x0 = ox, y0 = pad + (maxS * maxH - fh * s);
      const em = [];
      for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) { const p = cv.px[I(x + cx, y + cy)]; if (!p) continue; const c = hexRGB(p.hex); for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) { const j = ((y0 + y * s + dy) * tw + x0 + x * s + dx) * 4; img.set(c, j); } if (p.em) em.push([x, y, c, p.em]); }
      if (glow) for (const [x, y, c, st] of em) for (let dy = -2 * s; dy < 3 * s; dy++) for (let dx = -2 * s; dx < 3 * s; dx++) { const d = Math.hypot(dx, dy) / s; if (d > 0.8 && d < 2.6) { const X = x0 + x * s + (s >> 1) + dx, Y = y0 + y * s + (s >> 1) + dy; if (X < 0 || Y < 0 || X >= tw || Y >= th) continue; const j = (Y * tw + X) * 4; for (let k = 0; k < 3; k++) img[j + k] = Math.min(255, img[j + k] + c[k] * 0.10 * st * (2.6 - d)); } }
      ox += (fw + pad) * s;
    }
    ox += pad;
  }
  return { w: tw, h: th, png: encodePng(tw, th, img) };
}
// sheet-format export (pal chars + rows + emit) so the gate frames can later be dropped into a runtime sheet
export function toSheet(frames, names) {
  const POOL = [...'0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJLMNOPQRSTUVXx#$%&*+-='];
  const pal = {}, by = new Map(), emit = {}; let n = 0;
  const ch = (hex, em) => { let c = by.get(hex); if (!c) { c = POOL[n++]; by.set(hex, c); pal[c] = hex; } if (em) emit[c] = Math.max(emit[c] || 0, em); return c; };
  const out = {};
  frames.forEach((cv, f) => { const [fw, fh] = dims(cv), [cx, cy] = cv.crop || [0, 0]; out[names[f]] = Array.from({ length: fh }, (_, y) => Array.from({ length: fw }, (_, x) => { const p = cv.px[I(x + cx, y + cy)]; return p ? ch(p.hex, p.em) : '.'; }).join('')); });
  return { pal, anchor: ANCHOR, px: 2, emit, frames: out };
}
export { mix, I };


// ---------------------------------------------------------------- hand-typed span silhouettes (flames / locks)
// spans: [y0, 'xL-xR xL-xR ...'] rows going down from y0 ("a" alone = a-a). Returns {m, rows:[{y,xl,xr}]}.
export function spans(y0, str) {
  const m = new Uint8Array(W * H), rows = [];
  str.trim().split(/\s+/).forEach((t, i) => { const [a, b] = t.split('-').map(Number), xl = a, xr = b ?? a, y = y0 + i; rows.push({ y, xl, xr }); for (let x = xl; x <= xr; x++) if (x >= 0 && y >= 0 && x < W && y < H) m[I(x, y)] = 1; });
  return { m, rows };
}
// banded flame shading for a span silhouette: pale hot tip, yellow lit edge + core, orange body, red far rim, roots darker
export function paintFlame(cv, sp, o = {}) {
  const info = new Map(); for (const r of sp.rows) info.set(r.y, r);
  const y0 = sp.rows[0].y, y1 = sp.rows[sp.rows.length - 1].y, span = Math.max(1, y1 - y0);
  const bias = o.bias ?? 0, tipHot = o.tip ?? 0.16;
  return cv.paint(sp.m, 'hair', { line: o.line ?? null, mode: (x, y) => {
    const r = info.get(y), w = r.xr - r.xl, u = w ? (x - r.xl) / w : 0, v = (y - y0) / span;
    let L;
    if (v < tipHot) L = u > 0.8 && w > 2 ? 1 : 0;
    else if (w === 0) L = 1;
    else if (x === r.xl) L = 1;
    else if (u < 0.34) L = v < 0.6 ? 1 : 2;
    else if (u < 0.66) L = v < 0.5 ? 1 : 2;
    else L = 2;
    if (x === r.xr && w > 1) L = Math.max(L, v < 0.3 ? 2 : 3);
    if (v > 0.8) L += 1; if (v > 0.92) L += 1;
    return Math.max(0, Math.min(4, L)) + bias;
  } });
}
