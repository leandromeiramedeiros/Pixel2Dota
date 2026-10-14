// Vocabulary shared by the HD (40x40 frame, 36x36 art box) icon files. Coordinates are art-box pixels 0..35.
// Everything is drawn from hand-picked hex colours and hand-placed shapes; nothing is sampled from any reference image.
import { Glyph, THEMES } from './kit.mjs';
export { Glyph, THEMES };
export const FULL = Glyph.rect(0, 0, 35, 35);
export const P = (g, pts, hex, sil = false) => g.fill(Glyph.poly(pts), hex, sil);                          // flat polygon
export const T = (g, a, b, c, r0, r1, hex, sil = false) => g.fill(Glyph.taper(a, b, c, r0, r1), hex, sil);   // tapered curved stroke (quadratic bezier a-b-c)
export const E = (g, cx, cy, rx, ry, hex, sil = false) => g.fill(Glyph.ell(cx, cy, rx, ry), hex, sil);
export const L = (g, pts, hex, w = 1, sil = false) => g.fill(Glyph.path(pts, w), hex, sil);                // poly-line, w px brush
export const D = (g, pts, hex) => g.dots(pts, hex);                                                          // single pixels, top layer
export const F = (g, fn, mask = FULL, sil = false) => { for (const [x, y] of Glyph.list(mask)) { const c = fn(x, y); if (c) g.fill(Glyph.pts([[x, y]]), c, sil); } };   // per-pixel rule
export const band = (v, cuts, cols) => { for (let i = 0; i < cuts.length; i++) if (v < cuts[i]) return cols[i]; return cols[cols.length - 1]; };   // flat (undithered) bands
// 4-pixel plus-shaped sparkle; big adds the long arms
export const star = (g, x, y, hex, big = false) => { D(g, [[x, y], [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]], hex); if (big) D(g, [[x - 2, y], [x + 2, y], [x, y - 2], [x, y + 2]], hex); };
