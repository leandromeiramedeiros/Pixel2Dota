// Shared chibi hero rig + palette builder + sheet writer (used by tools/art/heroes/<hero>.mjs).
// Conventions follow the trainer/Invoker: 1px dark outline 'K', 4-tone shading (light top-left), big head, short legs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { K, ellM, rectM, strokeM, union, shEll, shEdge } from '../lib.mjs';
export { K, ellM, rectM, strokeM, union, shEll, shEdge };

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const SHEETS_DIR = path.join(ROOT, 'client/src/art/sheets');

// ---------- colour helpers ----------
const h2r = h => { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const r2h = r => '#' + r.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export const mix = (a, b, t) => { const A = h2r(a), B = h2r(b); return r2h(A.map((v, i) => v + (B[i] - v) * t)); };
export const ramp4 = (base, hi = '#fff2d0', lo = '#2a1848', deep = '#1a0f26') => [mix(base, hi, 0.4), base, mix(base, lo, 0.42), mix(base, deep, 0.68)];

const POOL = [...'0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJLMNOPQRSTUVXx#$%&*+-=@^~'];
export class Pal {
  constructor() { this.map = { K: '#1a0f26', W: '#ffffff', Y: '#fff2a0', Z: '#e8a020' }; this.by = new Map(Object.entries(this.map).map(([k, v]) => [v, k])); this.i = 0; this.emit = {}; }
  c(hex, emit) {
    hex = hex.toLowerCase();
    let ch = this.by.get(hex);
    if (!ch) { ch = POOL[this.i++]; if (!ch) throw new Error('palette full'); this.map[ch] = hex; this.by.set(hex, ch); }
    if (emit !== undefined) this.emit[ch] = emit;
    return ch;
  }
  r(base, ...a) { return ramp4(base, ...a).map(h => this.c(h)); }   // auto 4-tone ramp (chars)
  r4(a, b, c, d) { return [a, b, c, d].map(h => this.c(h)); }        // explicit ramp (light -> dark)
}

// ---------- canvas / mask ops ----------
export class Canvas {
  constructor(w, h) { this.w = w; this.h = h; this.g = Array.from({ length: h }, () => Array(w).fill('.')); }
  get(x, y) { x = Math.round(x); y = Math.round(y); return x < 0 || y < 0 || x >= this.w || y >= this.h ? '.' : this.g[y][x]; }
  set(x, y, ch) { x = Math.round(x); y = Math.round(y); if (!(x >= 0 && y >= 0 && x < this.w && y < this.h)) return; this.g[y][x] = ch; }
  // set only where a pixel already exists (optionally only over given chars)
  over(x, y, ch, only) { const o = this.get(x, y); if (o !== '.' && (!only || only.includes(o))) this.set(x, y, ch); }
  rows() { return this.g.map(r => r.join('')); }
}
const xy = k => k.split(',').map(Number);
export const mir = (mask, W) => { const s = new Set(); for (const k of mask) { const [x, y] = xy(k); s.add(K(W - 1 - x, y)); } return s; };
export const minus = (a, b) => { const s = new Set(); for (const k of a) if (!b.has(k)) s.add(k); return s; };
export const inter = (a, b) => { const s = new Set(); for (const k of a) if (b.has(k)) s.add(k); return s; };
export const shift = (a, dx, dy) => { const s = new Set(); for (const k of a) { const [x, y] = xy(k); s.add(K(x + dx, y + dy)); } return s; };
export const where = (a, f) => { const s = new Set(); for (const k of a) { const [x, y] = xy(k); if (f(x, y)) s.add(k); } return s; };
// polygon mask (even-odd scanline) from [[x,y],...]
export function polyM(pts) {
  const s = new Set(); const ys = pts.map(p => p[1]); const y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
  for (let y = y0; y <= y1; y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) { const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length]; if ((ay <= y && by > y) || (by <= y && ay > y)) xs.push(ax + (y - ay) / (by - ay) * (bx - ax)); }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.round(xs[i]); x <= Math.round(xs[i + 1]); x++) s.add(K(x, y));
  }
  return s;
}
// outline: true = outline all neighbours, 'bg' = only onto empty pixels, false = none
export function paint(c, mask, sh, outline = true) {
  if (outline) for (const k of mask) { const [x, y] = xy(k); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { if (mask.has(K(x + dx, y + dy))) continue; if (outline === 'bg' && c.get(x + dx, y + dy) !== '.') continue; c.set(x + dx, y + dy, 'K'); } }
  for (const k of mask) { const [x, y] = xy(k); const ch = typeof sh === 'string' ? sh : sh(x, y, mask); if (ch) c.set(x, y, ch); }
}
export const fill = (c, mask, ch) => { for (const k of mask) { const [x, y] = xy(k); c.set(x, y, ch); } };
export const line = (c, x0, y0, x1, y1, ch) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let i = 0; i <= n; i++) c.set(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, ch); };
// 4-tone diagonal shader (light top-left) with explicit centre
export const shDiag = (cx, cy, r) => (x, y) => { const v = -(x - cx) * 0.6 - (y - cy) * 0.8; return r[v > 2.2 ? 0 : v > 0.2 ? 1 : v > -2.2 ? 2 : 3]; };
// vertical bands (top -> bottom) over [y0,y1]
export const shBand = (y0, y1, r) => (x, y) => r[Math.max(0, Math.min(r.length - 1, Math.floor((y - y0) / (y1 - y0 + 1) * r.length)))];
// angle helper (deg; 0 = up, 90 = screen right, 180 = down)
export const ang = (x, y, a, len) => { const r = a * Math.PI / 180; return [x + Math.sin(r) * len, y - Math.cos(r) * len]; };
// a straight limb/weapon bar from (x0,y0) toward angle a for len px, thickness w; returns {m,end}
export function bar(x0, y0, a, len, w = 2) { const [x1, y1] = ang(x0, y0, a, len); return { m: strokeM(Math.round(x0 - (w - 1) / 2), Math.round(y0 - (w - 1) / 2), Math.round(x1 - (w - 1) / 2), Math.round(y1 - (w - 1) / 2), w), end: [x1, y1] }; }

// tapered polygon along angle a from (x0,y0): half-widths hw0 at base, hw1 at 75% length, pointed (or tipHw) at the end
export function taperM(x0, y0, a, len, hw0, hw1, tipHw = 0) {
  const r = a * Math.PI / 180, d = [Math.sin(r), -Math.cos(r)], n = [Math.cos(r), Math.sin(r)];
  const Pt = (t, s) => [x0 + d[0] * t + n[0] * s, y0 + d[1] * t + n[1] * s];
  const pts = tipHw ? [Pt(0, -hw0), Pt(len * 0.75, -hw1), Pt(len, -tipHw), Pt(len, tipHw), Pt(len * 0.75, hw1), Pt(0, hw0)] : [Pt(0, -hw0), Pt(len * 0.75, -hw1), Pt(len, 0), Pt(len * 0.75, hw1), Pt(0, hw0)];
  return polyM(pts);
}
// shade a shape lengthwise by lit side (light top-left); ramp = 4 chars light->dark; hw = half width
export function shNormal(x0, y0, a, ramp, hw = 2) {
  const r = a * Math.PI / 180, n = [Math.cos(r), Math.sin(r)], sg = (n[0] * -0.6 + n[1] * -0.8) >= 0 ? 1 : -1;
  return (x, y) => { const t = ((x - x0) * n[0] + (y - y0) * n[1]) * sg / hw; return t > 0.45 ? ramp[0] : t > -0.15 ? ramp[1] : t > -0.65 ? ramp[2] : ramp[3]; };
}
// cap/dome: paint mask with ellipse shading and a dark rim on bottom edge (no outline)
export function capPaint(c, mask, cx, cy, rx, ry, ramp, rim = true) {
  const sh = shEll(cx, cy, rx, ry, ramp, 0.1);
  for (const k of mask) { const [x, y] = k.split(',').map(Number); c.set(x, y, rim && !mask.has(K(x, y + 1)) ? ramp[3] : sh(x, y)); }
}
// swing trail along an arc of radius r around (cx,cy) from angle a0 to a1 (deg, 0 = up, 90 = right); only on empty pixels
export function arcTrail(c, cx, cy, r, a0, a1, chars) {
  const n = 14;
  for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180, x = cx + Math.sin(a) * r, y = cy - Math.cos(a) * r; const ch = chars[Math.min(chars.length - 1, Math.floor(i / (n + 1) * chars.length))]; if (c.get(x, y) === '.') c.set(x, y, ch); }
}
// 3-row chibi eye like Invoker: lash row, white+iris row, iris row. cols = [outer, inner] x positions, outerWhite true
export function eye3(c, xo, xi, y, { lash = 'K', white = 'W', iris, dim }) {
  c.set(xo, y - 1, lash); c.set(xi, y - 1, lash);
  c.set(xo, y, white); c.set(xi, y, iris);
  c.set(xo, y + 1, dim ?? iris); c.set(xi, y + 1, iris);
}
export function eyeX(c, x, y, ch = 'K') { for (const [dx, dy] of [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]]) c.set(x + dx, y + dy, ch); }

export function stars(c, hx, hy, f) {
  const pts = f ? [[-5, 1], [5, -1], [0, -3]] : [[-4, -1], [4, 1], [1, -3]];
  for (const [dx, dy] of pts) { const x = Math.round(hx + dx), y = Math.round(hy + dy); c.set(x - 1, y, 'Z'); c.set(x + 1, y, 'Z'); c.set(x, y - 1, 'Z'); c.set(x, y + 1, 'Z'); c.set(x, y, 'Y'); }
}

// ---------- the rig ----------
// cfg: { W,H, g:{geometry}, m:{head,torso,arm,armD,hand,handD,pants,pantsD,shoe (4-char ramps)}, hooks, pose(), bustRows,bustW }
// hooks (c,P): back, backFar, weaponBack, torsoDeco, weaponMid, preHead, headShape(c,P,mask), face, headgear, weapon, fx
// P: {dir,p,g,m,W,H,CX,tcx,tcy,tRx,tRy,hcx,hcy,hip,floor,legLen,dy,tTop,side,c,l(u),r(u),hands:{main:{x,y},off:{x,y}},headMask}
//   l(u)/r(u): symmetric pixel columns left/right of the centre line (u=0 are the two middle columns)
// pose p: dy sq tx hx hy step lL lR am ao ([dx,dy] hand offsets: main/off) eyes stars t anim i + hero-specific fields
export function makeRig(cfg) {
  const W = cfg.W ?? 28, H = cfg.H ?? 32, CX = (W - 1) / 2, g = cfg.g, m = cfg.m;
  const FL = Math.floor(CX), CL = Math.ceil(CX);
  const frame = function frame(dir, p) {
    const c = new Canvas(W, H);
    const floor = H - 2, dy = p.dy || 0, sq = p.sq || 0;
    const legLen = g.legLen - sq * 2, tRy = g.tRy - sq * 1.2;
    const hip = floor - legLen + 1;
    const tcy = hip + 1.5 - tRy + dy, tTop = tcy - tRy;
    const hcy = tTop + g.headOv - g.hRy + (p.hy || 0);
    const side = dir === 'e';
    const tcx = CX + (p.tx || 0) + (side ? (g.eLean || 0) : 0);
    const hcx = CX + (g.hx || 0) + (p.hx || 0) + (side ? g.eHead : 0);
    const tRx = side ? g.tRxE : g.tRx;
    const P = { dir, p, g, m, W, H, CX, tcx, tcy, tRx, tRy, hcx, hcy, hip, floor, legLen, dy, tTop, side, c, l: u => FL - u, r: u => CL + u, hands: {} };
    // ---- arm geometry ----
    const sh = tcy - tRy + 2.5, aw = g.armW;
    const am = p.am || [0, 0], ao = p.ao || [0, 0];
    const arms = [];
    if (!side) {
      for (const sd of [-1, 1]) {
        const isMain = (dir === 's') === (sd < 0), a = isMain ? am : ao;
        const out = tRx + (g.shOut ?? 0.5), ldx = sd < 0 ? a[0] : -a[0];   // work in left-local coords, mirror for the right arm
        const xsC = CX - out, xhC = CX - out - (g.armOut || 0) + ldx;
        const ys = sh, yh = sh + g.armLen + a[1];
        arms.push({ sd, isMain, xsC, xhC, ys, yh, hx: sd < 0 ? xhC : W - 1 - xhC, hy: yh + 0.5 });
      }
    } else {
      const mk = (far, a) => { const sx = tcx + (far ? 1 : -1), hxC = sx + g.eArm + a[0]; return { far, isMain: !far, xsC: sx, xhC: hxC, ys: sh, yh: sh + g.armLen + a[1], hx: hxC, hy: sh + g.armLen + a[1] + 0.5 }; };
      arms.push(mk(true, ao), mk(false, am));
    }
    for (const a of arms) { a.x = a.hx; a.y = a.hy; if (a.isMain) P.hands.main = a; else P.hands.off = a; }
    const drawArm = a => {
      let sm = strokeM(Math.round(a.xsC - (aw - 1) / 2), Math.round(a.ys), Math.round(a.xhC - (aw - 1) / 2), Math.round(a.yh), aw);
      if (!side && a.sd > 0) sm = mir(sm, W);
      const dark = !!a.far;
      paint(c, sm, shEdge(dark ? m.armD : m.arm));
      paint(c, ellM(a.hx, a.hy, g.handR, g.handR), shEll(a.hx, a.hy, g.handR, g.handR, dark ? m.handD : m.hand, 0));
    };
    cfg.back && cfg.back(c, P);
    // ---- legs ----
    if (!cfg.noLegs) {
      const lifts = [p.lL || 0, p.lR || 0], w = g.legW;
      const leg = (x0, lift, shoeW, shoeX, dark) => {
        const top = hip + dy, bot = floor - lift;
        paint(c, rectM(x0, top, x0 + w - 1, bot), shEdge(dark ? m.pantsD : m.pants));
        paint(c, rectM(shoeX, bot - 1, shoeX + shoeW - 1, bot), shEdge(m.shoe));
      };
      if (!side) {
        const xl = Math.round(CX - g.legX - (w - 1) / 2), xr = W - xl - w;
        leg(xl, lifts[0], w + 1, xl - 1, false);
        leg(xr, lifts[1], w + 1, xr, false);
      } else {
        const st = p.step || 0, fx = Math.round(tcx - 1 - st * g.stride), nx = Math.round(tcx - 1 + st * g.stride);
        leg(fx, lifts[1], w + 1, fx, true);
        leg(nx, lifts[0], w + 1, nx, false);
      }
    }
    cfg.backFar && cfg.backFar(c, P);
    if (side) drawArm(arms[0]);
    cfg.weaponBack && cfg.weaponBack(c, P);
    paint(c, ellM(tcx, tcy, tRx, tRy), shEll(tcx, tcy, tRx, tRy, m.torso, 0.14));
    cfg.torsoDeco && cfg.torsoDeco(c, P);
    if (!side) for (const a of arms) drawArm(a); else drawArm(arms[1]);
    cfg.weaponMid && cfg.weaponMid(c, P);
    cfg.preHead && cfg.preHead(c, P);
    const hm = ellM(hcx, hcy, g.hRx, g.hRy);
    P.headMask = hm;
    if (cfg.headShape) cfg.headShape(c, P, hm); else paint(c, hm, shEll(hcx, hcy, g.hRx, g.hRy, m.head, 0.1));
    cfg.face && cfg.face(c, P);
    cfg.headgear && cfg.headgear(c, P);
    cfg.weapon && cfg.weapon(c, P);
    cfg.fx && cfg.fx(c, P);
    if (p.stars !== undefined) stars(c, hcx, hcy - g.hRy - (g.starsUp ?? 1), p.stars);
    frame.last = P;
    return c.rows();
  };
  return frame;
}

// ---------- animation tables ----------
export function basePose(anim, dir, i) {
  const side = dir === 'e', p = { anim, i, t: i };
  if (anim === 'idle') { p.sq = [0, 0, 0.5, 0.5][i]; }
  else if (anim === 'walk') {
    if (!side) { p.lL = [1, 0, 0, 0][i]; p.lR = [0, 0, 1, 0][i]; p.sq = [0, 0.5, 0, 0.5][i]; const s = [1, 0, -1, 0][i]; p.am = [0, s]; p.ao = [0, -s]; }
    else { const st = [1, 0, -1, 0][i]; p.step = st; p.sq = [0.5, 0, 0.5, 0][i]; p.lL = i === 1 ? 1 : 0; p.lR = i === 3 ? 1 : 0; p.am = [-st * 1.5, 0]; p.ao = [st * 1.5, 0]; }
  } else if (anim === 'stunned') { p.sq = 0.5; p.eyes = 'x'; p.stars = i; p.hx = [-1, 1][i]; }
  return p;
}

export const ANIMS = { idle: 4, walk: 4, attack: 3, cast: 3, stunned: 2 };
export const DIRS = ['s', 'n', 'e'];

export function buildSheet(cfg, pal) {
  const frame = makeRig(cfg);
  const frames = {};
  for (const [anim, n] of Object.entries(ANIMS)) for (const d of DIRS) for (let i = 0; i < n; i++) {
    let p = basePose(anim, d, i);
    if (cfg.pose) p = cfg.pose(anim, d, i, p) || p;
    frames[`${anim}_${d}_${i}`] = frame(d, p);
  }
  { let p = basePose('idle', 's', 0); if (cfg.pose) p = cfg.pose('idle', 's', 0, p) || p; p.portrait = true; frames._bust = frame('s', p); }
  frames.portrait = portraitOf(frames._bust, cfg, frame.last); delete frames._bust;
  const W = cfg.W ?? 28, H = cfg.H ?? 32;
  return { pal: pal.map, anchor: [W / 2, H - 1], emit: Object.keys(pal.emit).length ? pal.emit : undefined, frames };
}

// bust: crop head/shoulders of idle_s_0 and double the pixels (like Invoker's portrait)
function portraitOf(rows, cfg, P) {
  const W = rows[0].length;
  const top = rows.findIndex(r => /[^.]/.test(r));
  const chin = Math.round(P.hcy + cfg.g.hRy) + (cfg.bustBelow ?? 2);
  const sub = rows.slice(top, Math.min(rows.length, chin + 1));
  const maxW = cfg.bustW ?? 16, cx = (W - 1) / 2 + (cfg.bustDx || 0);
  const a = Math.max(0, Math.min(W - maxW, Math.round(cx - maxW / 2 + 0.01)));
  const out = [];
  for (const r of sub) { const d = [...r.slice(a, a + maxW).padEnd(maxW, '.')].map(ch => ch + ch).join(''); out.push(d, d); }
  return out;
}

export function writeSheet(name, sheet) {
  let s = `// GENERATED by tools/art/heroes/${name}.mjs -- do not edit by hand\nexport default {\n`;
  s += `  pal: { ${Object.entries(sheet.pal).map(([k, v]) => `'${k}':'${v}'`).join(', ')} },\n`;
  s += `  anchor: [${sheet.anchor.join(', ')}],\n`;
  if (sheet.emit) s += `  emit: { ${Object.entries(sheet.emit).map(([k, v]) => `'${k}':${v}`).join(', ')} },\n`;
  s += '  frames: {\n';
  const ks = Object.keys(sheet.frames);
  ks.forEach((k, ki) => { s += `  ${k}: [\n${sheet.frames[k].map(r => `    '${r}'`).join(',\n')}\n  ]${ki < ks.length - 1 ? ',' : ''}\n`; });
  s += '  }\n};\n';
  fs.mkdirSync(SHEETS_DIR, { recursive: true });
  const f = path.join(SHEETS_DIR, name + '.js');
  fs.writeFileSync(f, s);
  return f;
}
