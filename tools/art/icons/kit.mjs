// Tiny pixel-art toolkit for 20x20 framed icons. Glyphs are drawn in a 16x16 box (0..15) inside the frame.
export const S = 20, GB = 16, OFF = 2;
export const OUT = '#06060c';
const key = (x, y) => (y + 8) * 64 + (x + 8);
const unkey = k => [(k & 63) - 8, (k >> 6) - 8];
export const R = {   // ramps: [highlight, mid, shade, dark]
  steel: ['#f2f6fc', '#b4c0d4', '#7586a2', '#3e4a66'], iron: ['#c8d0dc', '#8e9ab0', '#5a667e', '#2c3448'],
  gold: ['#fff4a8', '#f6c842', '#c48a1c', '#7a4a0e'], wood: ['#e0b070', '#b27a40', '#7c4c26', '#46280f'],
  leather: ['#d89a62', '#a8683a', '#76421f', '#40220c'], red: ['#ffa898', '#e84a3c', '#a42222', '#5a0e14'],
  orange: ['#ffe48a', '#ff9a30', '#d8601a', '#8a2e0c'], fire: ['#ffe9a0', '#ff8a2a', '#e03a14', '#8a1408'],
  cyan: ['#eafcff', '#86e6ff', '#38aef0', '#1c5ca6'], ice: ['#ffffff', '#cdf2ff', '#7cc8f0', '#3a7cc0'],
  blue: ['#b4ceff', '#5c8cf4', '#3058c4', '#182a78'], magenta: ['#ffd6ff', '#e468ff', '#a432d4', '#5c1684'],
  purple: ['#dcc4ff', '#a878f0', '#6c40b8', '#341a6a'], green: ['#dcffa0', '#84e04c', '#3c9c30', '#1a5a24'],
  white: ['#ffffff', '#e8eef6', '#aeb8cc', '#6c778e'], bone: ['#fffbe8', '#ece2c0', '#b8a880', '#6e6244'],
  skin: ['#ffd8b4', '#e8a878', '#b87850', '#6a4028'], dark: ['#6c6c88', '#3c3c52', '#262634', '#12121c'],
  yellow: ['#ffffff', '#fff4a0', '#ffd23c', '#c88a10'], brown: ['#c89868', '#8c5c34', '#5e3a1c', '#341c0a'],
  teal: ['#c8fff0', '#5ce0c0', '#24a08c', '#106058'], pink: ['#ffe0ee', '#ff8cc0', '#d44a88', '#7a1c4c'],
  blood: ['#ff6a5a', '#c42828', '#821418', '#430a10'],
};
export const THEMES = {   // bg bands [top, mid, bottom], bevel [light, dark]
  ice: { bg: ['#2a6ea8', '#184a86', '#0e2a58'], bev: ['#78d4ff', '#0c2048'] },
  wex: { bg: ['#7a2cae', '#52188a', '#2c0c58'], bev: ['#e08cff', '#220844'] },
  exort: { bg: ['#b8601c', '#8a3c10', '#4c1c08'], bev: ['#ffc060', '#2c1004'] },
  fire: { bg: ['#a8301a', '#701810', '#3a0a0c'], bev: ['#ff9060', '#24060a'] },
  bolt: { bg: ['#2a3c9c', '#1a2468', '#0c1238'], bev: ['#8cb0ff', '#080c28'] },
  phys: { bg: ['#4a587a', '#303c58', '#1c2438'], bev: ['#b4c4e4', '#0e1424'] },
  blood: { bg: ['#7c1c2a', '#521018', '#2c080e'], bev: ['#f07080', '#1c0408'] },
  nature: { bg: ['#2c7a3c', '#1a5230', '#0c2c1c'], bev: ['#9ce87c', '#08200e'] },
  arcane: { bg: ['#4a2c88', '#2e1a5c', '#180c34'], bev: ['#b090f0', '#0c0620'] },
  gold: { bg: ['#80581c', '#58380e', '#2e1a06'], bev: ['#ffd878', '#1c0e04'] },
  night: { bg: ['#34384c', '#222638', '#10121e'], bev: ['#8a90b0', '#080a12'] },
  item: { bg: ['#4c4440', '#322c2c', '#1c1818'], bev: ['#d8b890', '#100c0c'] },
  teal: { bg: ['#1c7078', '#104a58', '#082a34'], bev: ['#70e8d8', '#041a20'] },
  moon: { bg: ['#3a4cb8', '#22307c', '#101848'], bev: ['#a8c0ff', '#080c30'] },   // Mirana / night spells: saturated indigo, never grey
  steel: { bg: ['#4c74b0', '#2e4c84', '#16264a'], bev: ['#c8dcff', '#0a1228'] },  // physical abilities: cool blue steel (phys stays for items)
};
const FR = '#08080e';

export class Glyph {
  constructor(theme) { this.theme = THEMES[theme]; this.col = new Map(); this.sil = new Set(); this.top = new Map(); this.bgx = new Map(); this.outline = true; }
  // ---- masks
  static ell(cx, cy, rx, ry) { const s = new Set(); for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) { const a = (x - cx) / rx, b = (y - cy) / ry; if (a * a + b * b <= 1.0) s.add(key(x, y)); } return s; }
  static rect(x0, y0, x1, y1) { const s = new Set(); for (let y = Math.round(y0); y <= Math.round(y1); y++) for (let x = Math.round(x0); x <= Math.round(x1); x++) s.add(key(x, y)); return s; }
  static line(x0, y0, x1, y1, w = 1) { const s = new Set(); const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 3; for (let i = 0; i <= n; i++) { const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n); for (let a = 0; a < w; a++) for (let b = 0; b < w; b++) s.add(key(x + a - (w > 2 ? 1 : 0), y + b - (w > 2 ? 1 : 0))); } return s; }
  static poly(pts) { const s = new Set(); let x0 = 99, x1 = -99, y0 = 99, y1 = -99; for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) { const px = x, py = y; let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside; }
      if (inside) s.add(key(x, y)); }
    return s; }
  static ring(cx, cy, r0, r1) { const s = new Set(); for (let y = Math.floor(cy - r1); y <= Math.ceil(cy + r1); y++) for (let x = Math.floor(cx - r1); x <= Math.ceil(cx + r1); x++) { const d = Math.hypot(x - cx, y - cy); if (d >= r0 && d <= r1) s.add(key(x, y)); } return s; }
  static arc(cx, cy, r0, r1, a0, a1) { const s = new Set(); const span = ((a1 - a0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI); for (let y = Math.floor(cy - r1); y <= Math.ceil(cy + r1); y++) for (let x = Math.floor(cx - r1); x <= Math.ceil(cx + r1); x++) { const d = Math.hypot(x - cx, y - cy); if (d < r0 || d > r1) continue; const a = Math.atan2(y - cy, x - cx); const t = ((a - a0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI); if (t <= span) s.add(key(x, y)); } return s; }
  static pts(list) { const s = new Set(); for (const [x, y] of list) s.add(key(x, y)); return s; }
  static or(...ms) { const s = new Set(); for (const m of ms) for (const k of m) s.add(k); return s; }
  static sub(a, ...bs) { const s = new Set(a); for (const b of bs) for (const k of b) s.delete(k); return s; }
  static and(a, b) { const s = new Set(); for (const k of a) if (b.has(k)) s.add(k); return s; }
  static move(m, dx, dy) { const s = new Set(); for (const k of m) { const [x, y] = unkey(k); s.add(key(x + dx, y + dy)); } return s; }
  static flip(m) { const s = new Set(); for (const k of m) { const [x, y] = unkey(k); s.add(key(15 - x, y)); } return s; }
  // ---- painting
  paint(mask, ramp, mode = 'e', o = {}) {
    if (typeof ramp === 'string') ramp = R[ramp];
    let x0 = 99, x1 = -99, y0 = 99, y1 = -99;
    for (const k of mask) { const [x, y] = unkey(k); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2 + 0.8, ry = (y1 - y0) / 2 + 0.8;
    for (const k of mask) {
      const [x, y] = unkey(k); if (x < 0 || y < 0 || x >= GB || y >= GB) continue;
      const u = mask.has(key(x, y - 1)), l = mask.has(key(x - 1, y)), d = mask.has(key(x, y + 1)), r = mask.has(key(x + 1, y));
      let c;
      if (mode === 'f') c = ramp[o.lv ?? 1];
      else if (mode === 'e') c = (!d || !r) ? ramp[3] : (!u && !l) ? ramp[0] : (!u || !l) ? ramp[1] : ramp[2];
      else if (mode === 'g') {
        const v = -0.55 * (x - cx) / rx - 0.75 * (y - cy) / ry; const t = [0.8, 0.28, -0.3]; let lv = v > t[0] ? 0 : v > t[1] ? 1 : v > t[2] ? 2 : 3;
        for (let i = 0; i < 3; i++) if (Math.abs(v - t[i]) < 0.1) { lv = ((x + y) & 1) ? i + 1 : i; break; }
        c = ramp[lv];
      } else if (mode === 'v') { // vertical bands, lit edge on left
        const f = (y - y0) / Math.max(1, y1 - y0); let lv = f < 0.3 ? 1 : f < 0.65 ? 2 : 3; if (!l) lv = Math.max(0, lv - 1); if (!r) lv = Math.min(3, lv + 1); c = ramp[lv];
      } else if (mode === 'h') { // horizontal bands (lit from left)
        const f = (x - x0) / Math.max(1, x1 - x0); const lv = f < 0.3 ? 0 : f < 0.6 ? 1 : f < 0.85 ? 2 : 3; c = ramp[lv];
      } else if (mode === 'x') { c = (!d || !r) ? ramp[2] : (!u || !l) ? ramp[0] : ramp[1]; }
      this.col.set(k, c); if (!o.soft) this.sil.add(k);
    }
    return this;
  }
  ell(cx, cy, rx, ry, ramp, mode = 'g') { return this.paint(Glyph.ell(cx, cy, rx, ry), ramp, mode); }
  rect(x0, y0, x1, y1, ramp, mode = 'e') { return this.paint(Glyph.rect(x0, y0, x1, y1), ramp, mode); }
  line(x0, y0, x1, y1, ramp, w = 1, mode = 'f') { return this.paint(Glyph.line(x0, y0, x1, y1, w), ramp, mode); }
  poly(pts, ramp, mode = 'e') { return this.paint(Glyph.poly(pts), ramp, mode); }
  ring(cx, cy, r0, r1, ramp, mode = 'e') { return this.paint(Glyph.ring(cx, cy, r0, r1), ramp, mode); }
  soft(mask, hex) { for (const k of mask) { const [x, y] = unkey(k); if (x >= 0 && y >= 0 && x < GB && y < GB) this.top.set(k, hex); } return this; }  // not in silhouette, drawn on top
  dot(x, y, hex) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < GB && y < GB) this.top.set(key(x, y), hex); return this; }
  dots(list, hex) { for (const [x, y] of list) this.dot(x, y, hex); return this; }
  spark(x, y, hex = '#ffffff', big = false) { this.dot(x, y, hex); this.dot(x - 1, y, hex); this.dot(x + 1, y, hex); this.dot(x, y - 1, hex); this.dot(x, y + 1, hex); if (big) { this.dot(x - 2, y, hex); this.dot(x + 2, y, hex); this.dot(x, y - 2, hex); this.dot(x, y + 2, hex); } return this; }
  halo(cx, cy, r, hex) { // soft glow into background (dithered levels)
    for (let y = 0; y < GB; y++) for (let x = 0; x < GB; x++) { const d = Math.hypot(x - cx, y - cy) / r; if (d >= 1) continue; const t = 1 - d; let lv = t > 0.66 ? 3 : t > 0.4 ? 2 : t > 0.18 ? 1 : 0;
      for (const th of [0.66, 0.4, 0.18]) if (Math.abs(t - th) < 0.07) lv = ((x + y) & 1) ? lv : Math.max(0, lv - 1);
      if (lv > 0) this.bgx.set(key(x, y), [hex, lv / 4.2]); }
    return this; }
  // flame teardrop: base at (cx, by), height h, half-width w, tip leaning by sway
  static flameMask(cx, by, w, h, sway = 0) { const s = new Set(); for (let i = 0; i <= h; i++) { const t = i / h; const hw = w * Math.pow(1 - t, 0.75) * (1 + 0.25 * Math.sin(t * 6)); const mx = cx + sway * t * t; const y = by - i;
      for (let x = Math.round(mx - hw); x <= Math.round(mx + hw); x++) s.add(key(x, y)); } return s; }
  snow(cx, cy, r, ramp) { const m = Glyph.or(Glyph.line(cx - r, cy, cx + r, cy), Glyph.line(cx, cy - r, cx, cy + r), Glyph.line(cx - r * .7, cy - r * .7, cx + r * .7, cy + r * .7), Glyph.line(cx - r * .7, cy + r * .7, cx + r * .7, cy - r * .7));
    return this.paint(m, ramp, 'f', { lv: 1 }); }
  zig(pts, ramp = R.yellow, core = '#ffffff', w = 2) { for (let i = 0; i + 1 < pts.length; i++) this.paint(Glyph.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w), ramp, 'f', { lv: 2 });
    for (let i = 0; i + 1 < pts.length; i++) this.soft(Glyph.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 1), core); return this; }
  // ---- compose to 20x20 array of hex|null
  render() {
    const T = this.theme, out = Array.from({ length: S }, () => Array(S).fill(null));
    const mix = (a, b, t) => { const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16)); return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if ((x === 0 || x === S - 1) && (y === 0 || y === S - 1)) continue;
      if (x === 0 || y === 0 || x === S - 1 || y === S - 1) { out[y][x] = FR; continue; }
      if (x === 1 || y === 1 || x === S - 2 || y === S - 2) { const lit = (y === 1 && x < S - 2) || (x === 1 && y < S - 2); out[y][x] = lit ? T.bev[0] : T.bev[1]; continue; }
      const gx = x - OFF, gy = y - OFF; let b = gy < 5 ? 0 : gy < 11 ? 1 : 2;
      if ((gy === 5 || gy === 11) && ((gx + gy) & 1)) b--; if ((gy === 4 || gy === 10) && ((gx + gy) & 1)) b++;
      out[y][x] = T.bg[Math.max(0, Math.min(2, b))];
    }
    for (const [k, [hex, a]] of this.bgx) { const [gx, gy] = unkey(k); const o = out[gy + OFF]?.[gx + OFF]; if (o) out[gy + OFF][gx + OFF] = mix(o, hex, a); }
    const put = (k, c) => { const [gx, gy] = unkey(k); if (gx < 0 || gy < 0 || gx >= GB || gy >= GB) return; out[gy + OFF][gx + OFF] = c; };
    for (const [k, c] of this.col) put(k, c);
    if (this.outline) for (const k of this.sil) { const [x, y] = unkey(k); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = key(x + dx, y + dy); if (!this.sil.has(n)) put(n, OUT); } }
    for (const [k, c] of this.top) put(k, c);
    return out;
  }
}
// ---- sheet palette assignment
const POOL = (() => { const p = []; for (let c = 0x21; c < 0x7f; c++) { const ch = String.fromCharCode(c); if ("'\\.`".includes(ch)) continue; p.push(ch); } for (let c = 0xc0; c < 0x2000; c++) { if (c === 0xd7 || c === 0xf7) continue; p.push(String.fromCharCode(c)); } return p; })();
export class PalBuilder {
  constructor() { this.map = new Map(); this.pal = {}; }
  ch(hex) { hex = hex.toLowerCase(); let c = this.map.get(hex); if (!c) { c = POOL[this.map.size]; this.map.set(hex, c); this.pal[c] = hex; } return c; }
  rows(img) { return img.map(r => r.map(h => h ? this.ch(h) : '.').join('')); }
}

// ---- extra themes for the ability redraw (existing themes above are untouched; items use item/phys/gold/night)
Object.assign(THEMES, {
  storm: { bg: ['#2c80d8', '#1a52a8', '#0c2468'], bev: ['#a8e0ff', '#081844'] },    // Zeus / Laguna: electric blue
  deep: { bg: ['#1c3478', '#12205a', '#0a1038'], bev: ['#7898e8', '#060a20'] },     // deep navy (Sven bolt, Drow arrows)
  olive: { bg: ['#6c7c2c', '#46561c', '#222e0e'], bev: ['#c8e070', '#10180a'] },    // Pudge hook / rot
  flesh: { bg: ['#c89080', '#a46a64', '#6c3c40'], bev: ['#ffd8c8', '#2c1014'] },    // Pudge flesh heap: pale meat
  ember: { bg: ['#d06a20', '#9a3c12', '#541a0a'], bev: ['#ffc078', '#2c0e04'] },    // warm orange-brown (Lina, Lion, Axe)
  dusk: { bg: ['#6a4234', '#44261e', '#201010'], bev: ['#e0a888', '#14080a'] },     // brown-dark with warm rays (alacrity)
  jade: { bg: ['#38b048', '#1c7c30', '#0a401c'], bev: ['#c0ff98', '#062410'] },     // Rubick: bright green rays
  ruby: { bg: ['#c82c2c', '#8c1420', '#4a0812'], bev: ['#ff9488', '#240408'] },     // Axe: red
  ash: { bg: ['#5a6478', '#3c4458', '#222836'], bev: ['#b8c4dc', '#0e121c'] },      // grey-blue mist (Drow frost arrows)
});

// Hand-placed 16x16 pixel art. rows = 16 strings, map: char -> '#hex' (painted + outlined, like any shape)
// or ['#hex'] (soft: drawn on top, never outlined -- glows, streaks, background rays). '.' / unmapped = untouched.
export function pix(g, rows, map) {
  if (process.env.PIXLEN) rows.forEach((r, y) => { if ([...r].length !== 16) console.warn(`pix row ${y} has ${[...r].length} chars: ${r}`); });
  const solid = {}, soft = {};
  rows.forEach((r, y) => [...r].slice(0, 16).forEach((c, x) => { const m = map[c]; if (!m) return; (Array.isArray(m) ? (soft[m[0]] ||= []) : (solid[m] ||= [])).push([x, y]); }));
  for (const [h, pts] of Object.entries(solid)) g.paint(Glyph.pts(pts), [h, h, h, h], 'f');
  for (const [h, pts] of Object.entries(soft)) g.dots(pts, h);
  return g;
}
Object.assign(THEMES, { sun: { bg: ['#f2c458', '#d49424', '#8e5c14'], bev: ['#fff4b0', '#3a2006'] } });   // Gods Strength: blazing gold
Object.assign(THEMES, { coal: { bg: ['#3c120c', '#22080a', '#10040a'], bev: ['#ff9a60', '#0a0204'] } });   // Blade Fury / Omni Slash: near-black red
