// Shared helpers for the world-art generators (tiles, trees, buildings, creeps) + sheet writer + validation.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const SHEETS = path.join(ROOT, 'client/src/art/sheets');

export function rng(seed) {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class Cv {
  constructor(w, h, fill = '.', wrap = false) { this.w = w; this.h = h; this.wrap = wrap; this.g = Array.from({ length: h }, () => Array(w).fill(fill)); }
  get(x, y) { x = Math.round(x); y = Math.round(y); if (this.wrap) { x = ((x % this.w) + this.w) % this.w; y = ((y % this.h) + this.h) % this.h; } else if (x < 0 || y < 0 || x >= this.w || y >= this.h) return '.'; return this.g[y][x]; }
  set(x, y, c) { x = Math.round(x); y = Math.round(y); if (this.wrap) { x = ((x % this.w) + this.w) % this.w; y = ((y % this.h) + this.h) % this.h; } else if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; this.g[y][x] = c; }
  /** set only where currently transparent */
  under(x, y, c) { if (this.get(x, y) === '.') this.set(x, y, c); }
  rows() { return this.g.map(r => r.join('')); }
  /** blit another canvas (transparent '.' skipped) at ox,oy */
  blit(o, ox, oy) { for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) { const c = o.g[y][x]; if (c !== '.') this.set(ox + x, oy + y, c); } }
  /** recolour via map */
  remap(m) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) { const c = this.g[y][x]; if (m[c]) this.g[y][x] = m[c]; } return this; }
}

// ---- masks (Set of "x,y") ----
export const K = (x, y) => x + ',' + y;
export const pt = k => k.split(',').map(Number);
export const ell = (cx, cy, rx, ry, f = 1.0) => { const s = new Set(); for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) { const a = (x - cx) / rx, b = (y - cy) / ry; if (a * a + b * b <= f) s.add(K(x, y)); } return s; };
export const rect = (x0, y0, x1, y1) => { const s = new Set(); for (let y = Math.round(y0); y <= Math.round(y1); y++) for (let x = Math.round(x0); x <= Math.round(x1); x++) s.add(K(x, y)); return s; };
export const line = (x0, y0, x1, y1, w = 1) => { const s = new Set(); const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2; const o = -Math.floor((w - 1) / 2); for (let i = 0; i <= n; i++) { const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n); for (let a = 0; a < w; a++) for (let b = 0; b < w; b++) s.add(K(x + a + o, y + b + o)); } return s; };
/** polygon via even-odd scanline, pts = [[x,y],...] (pixel-centre sampling) */
export const poly = (pts) => {
  const s = new Set(); let y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; if ((a[1] <= y) === (b[1] <= y)) continue; xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.round(xs[i]); x <= Math.round(xs[i + 1]); x++) s.add(K(x, y));
  }
  return s;
};
export const union = (...ms) => { const s = new Set(); for (const m of ms) for (const k of m) s.add(k); return s; };
export const diff = (a, ...bs) => { const s = new Set(); for (const k of a) { let ok = true; for (const b of bs) if (b.has(k)) { ok = false; break; } if (ok) s.add(k); } return s; };
export const inter = (a, b) => { const s = new Set(); for (const k of a) if (b.has(k)) s.add(k); return s; };
export const shift = (m, dx, dy) => { const s = new Set(); for (const k of m) { const [x, y] = pt(k); s.add(K(x + dx, y + dy)); } return s; };
export const bbox = m => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const k of m) { const [x, y] = pt(k); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return { x0, y0, x1, y1 }; };

/** outline ring (4- or 8-neighbour) of mask */
export function ring(mask, diag = false) { const s = new Set(); const d = diag ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]]; for (const k of mask) { const [x, y] = pt(k); for (const [dx, dy] of d) { const q = K(x + dx, y + dy); if (!mask.has(q)) s.add(q); } } return s; }
/** paint mask: outline char (or null) on empty cells, then fill by shade (string or fn(x,y,mask)) */
export function paint(c, mask, shade, outline = null, force = false) {
  if (outline) for (const k of ring(mask)) { const [x, y] = pt(k); if (force || c.get(x, y) === '.') c.set(x, y, outline); }
  for (const k of mask) { const [x, y] = pt(k); const ch = typeof shade === 'string' ? shade : shade(x, y, mask); if (ch) c.set(x, y, ch); }
}
/** Outline an existing canvas silhouette (all non-transparent pixels) with char ch. */
export function outlineAll(c, ch, diag = false) { const m = new Set(); for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.g[y][x] !== '.') m.add(K(x, y)); for (const k of ring(m, diag)) { const [x, y] = pt(k); c.set(x, y, ch); } }

/** ellipse shading, ramp = [highlight, light, mid, dark]; light from upper-left */
export const shEll = (cx, cy, rx, ry, r, dith = 0.12) => (x, y) => {
  const v = -0.55 * (x - cx) / rx - 0.75 * (y - cy) / ry;
  const t = [0.85, 0.3, -0.35];
  let lv = v > t[0] ? 0 : v > t[1] ? 1 : v > t[2] ? 2 : 3;
  if (dith) for (let i = 0; i < 3; i++) if (Math.abs(v - t[i]) < dith) { lv = ((x + y) & 1) ? i + 1 : i; break; }
  return r[lv];
};
/** box shading from edges of the mask: top/left lit, bottom/right dark; r = [hi, light, mid, dark] */
export const shEdge = r => (x, y, m) => {
  const u = m.has(K(x, y - 1)), l = m.has(K(x - 1, y)), d = m.has(K(x, y + 1)), rr = m.has(K(x + 1, y));
  if (!d || !rr) return r[3];
  if (!u && !l) return r[0];
  if (!u || !l) return r[1];
  return r[2];
};
/** horizontal gradient across [x0,x1]: left light -> right dark, ordered dither between tones */
export const shX = (x0, x1, r, dith = true) => (x, y) => {
  const t = Math.min(1, Math.max(0, (x - x0) / Math.max(1, x1 - x0))); const v = t * (r.length - 1); let i = Math.floor(v + 0.001); const f = v - i;
  if (dith && i < r.length - 1 && f > 0.34 && f < 0.67 && ((x + y) & 1)) i++; else if (!dith && f > 0.5) i++;
  return r[Math.min(i, r.length - 1)];
};

// ---- sheet writing / validation ----
const q = s => "'" + s + "'";
export function writeSheet(file, header, sheet) {
  const { pal, anchor, anchors, frames, emit } = sheet;
  const errs = validate(sheet);
  if (errs.length) { console.error(errs.join('\n')); throw new Error('sheet invalid: ' + file); }
  let o = '// GENERATED by ' + header.gen + ' - do not edit by hand.\n';
  for (const l of header.doc) o += '// ' + l + '\n';
  o += 'export default {\n';
  o += '  pal: { ' + Object.entries(pal).map(([k, v]) => q(k) + ":'" + v + "'").join(', ') + ' },\n';
  if (emit && Object.keys(emit).length) o += '  emit: { ' + Object.entries(emit).map(([k, v]) => q(k) + ':' + v).join(', ') + ' },\n';
  o += '  anchor: [' + anchor.join(', ') + '],\n';
  if (anchors && Object.keys(anchors).length) o += '  anchors: {\n' + Object.entries(anchors).map(([k, v]) => '    ' + k + ': [' + v.join(', ') + ']').join(',\n') + '\n  },\n';
  o += '  frames: {\n';
  o += Object.entries(frames).map(([k, rows]) => '  ' + k + ': [\n' + rows.map(r => '    ' + q(r)).join(',\n') + '\n  ]').join(',\n');
  o += '\n  }\n};\n';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, o);
  return o.length;
}
export function validate({ pal, anchor, anchors, frames, emit }) {
  const errs = [];
  for (const [k, v] of Object.entries(pal)) { if (k.length !== 1) errs.push('pal key len ' + k); if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v)) errs.push('pal colour ' + k + '=' + v); if (k === '.') errs.push('pal uses "."'); }
  for (const k of Object.keys(emit || {})) if (!pal[k]) errs.push('emit char not in pal: ' + k);
  for (const [k, rows] of Object.entries(frames)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) errs.push('bad key ' + k);
    const w = rows[0].length;
    rows.forEach((r, i) => { if (r.length !== w) errs.push(`${k}: row ${i} len ${r.length} != ${w}`); for (const ch of r) if (ch !== '.' && !pal[ch]) { errs.push(`${k}: row ${i} char ${ch} not in pal`); break; } });
    const a = (anchors && anchors[k]) || anchor;
    if (!a || a[0] < 0 || a[1] < 0 || a[0] > w || a[1] > rows.length) errs.push(`${k}: anchor ${a} outside ${w}x${rows.length}`);
  }
  return errs;
}

/** crop canvas to its opaque bbox (+pad), returns { rows, anchor } with the given anchor point (in source coords) re-based */
export function trim(cv, ax = 0, ay = 0, pad = 0) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < cv.h; y++) for (let x = 0; x < cv.w; x++) if (cv.g[y][x] !== '.') { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const rows = []; for (let y = y0; y <= y1; y++) { let r = ''; for (let x = x0; x <= x1; x++) r += (x < 0 || y < 0 || x >= cv.w || y >= cv.h) ? '.' : cv.g[y][x]; rows.push(r); }
  return { rows, anchor: [ax - x0, ay - y0] };
}
/** pad a set of rows to a fixed w x h (content anchored by `anchor`; target anchor ta) -> { rows, anchor } */
export function fit(rows, anchor, w, h, ta) {
  const dx = ta[0] - anchor[0], dy = ta[1] - anchor[1]; const out = Array.from({ length: h }, () => Array(w).fill('.'));
  rows.forEach((r, y) => [...r].forEach((c, x) => { const X = x + dx, Y = y + dy; if (c !== '.' && X >= 0 && Y >= 0 && X < w && Y < h) out[Y][X] = c; }));
  return out.map(r => r.join(''));
}
