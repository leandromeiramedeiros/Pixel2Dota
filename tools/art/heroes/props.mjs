// Shared prop/fx helpers for hero generators: flames, bolts, orbs, staffs, bows.
import { paint, strokeM, taperM, ellM, polyM, shEll, shNormal, ang } from './rig.mjs';

// teardrop flame from (x,y) toward angle a (deg, 0 up), length len, base half-width w. chars = [core, mid, outer]
export function flame(c, x, y, a, len, w, chars, wob = 0) {
  const m = taperM(x, y, a, len, w, w * 0.9, 0), r = a * Math.PI / 180, d = [Math.sin(r), -Math.cos(r)], n = [Math.cos(r), Math.sin(r)];
  paint(c, m, (px, py) => {
    const t = ((px - x) * d[0] + (py - y) * d[1]) / len, s = Math.abs((px - x) * n[0] + (py - y) * n[1]) / (w * (1 - t * 0.6) + 0.01);
    const v = s + t * 0.5 + (((px * 7 + py * 3 + wob) & 3) === 0 ? 0.15 : 0);
    return v < 0.45 ? chars[0] : v < 0.85 ? chars[1] : chars[2];
  }, false);
}
export function orb(c, x, y, r, chars, outline = false) {
  paint(c, ellM(x, y, r, r), shEll(x, y, r, r, [chars[0], chars[0], chars[1], chars[2]], 0), outline);
}
// zig-zag lightning (x0,y0)->(x1,y1); core char + glow char on empty neighbours
export function bolt(c, x0, y0, x1, y1, core, glow, seed = 0, jit = 2) {
  const n = Math.max(3, Math.round(Math.hypot(x1 - x0, y1 - y0) / 3)), pts = [[x0, y0]];
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  for (let i = 1; i < n; i++) { const j = (((i * 5 + seed * 3) % 5) - 2) / 2 * jit; pts.push([x0 + dx * i / n + nx * j, y0 + dy * i / n + ny * j]); }
  pts.push([x1, y1]);
  const seg = [];
  for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]], k = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), 1); for (let t = 0; t <= k; t++) seg.push([Math.round(a[0] + (b[0] - a[0]) * t / k), Math.round(a[1] + (b[1] - a[1]) * t / k)]); }
  if (glow) for (const [x, y] of seg) for (const [ox, oy] of [[1, 0], [-1, 0]]) if (c.get(x + ox, y + oy) === '.') c.set(x + ox, y + oy, glow);
  for (const [x, y] of seg) c.set(x, y, core);
}
// shaded straight bar with outline from (x,y) at angle a (deg), length len, thickness w
export function shaft(c, x, y, a, len, ramp, w = 1, outline = true) {
  const r = a * Math.PI / 180, x1 = x + Math.sin(r) * len, y1 = y - Math.cos(r) * len;
  const m = strokeM(Math.round(x), Math.round(y), Math.round(x1), Math.round(y1), w);
  paint(c, m, ramp.length === 1 ? ramp[0] : (px, py) => ramp[Math.min(ramp.length - 1, Math.floor(((px - x) * 0.6 + (py - y) * 0.8 > 0 ? 1 : 0) + 0))] , outline);
  return [x1, y1];
}
export { ang };

// Palette that never reuses a character: rig.mjs's POOL literal lists 'x' twice, so a hero with ~60+ colours would silently
// overwrite an earlier 'x' colour. New hero generators use SafePal (existing heroes keep Pal so their sheets stay byte-identical).
import { Pal } from './rig.mjs';
export class SafePal extends Pal {
  c(hex, emit) {
    hex = hex.toLowerCase();
    if (this.by.has(hex)) return super.c(hex, emit);
    const used = new Map(Object.entries(this.map)), oldEmit = { ...this.emit };
    let ch = super.c(hex, emit);
    if (used.has(ch)) {
      this.map[ch] = used.get(ch); this.by.delete(hex);
      if (ch in oldEmit) this.emit[ch] = oldEmit[ch]; else delete this.emit[ch];
      ch = super.c(hex, emit);
    }
    return ch;
  }
}
