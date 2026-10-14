// Glyph drawings for Pudge, Mirana and Rubick abilities (same kit/frame as abilities.mjs). Merged by icons.mjs.
import { Glyph as G, R } from './kit.mjs';

const W = '#ffffff';
const pol = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
// hand-placed 16x16 pixels: rows of chars, map char -> hex; outlined like any painted shape
const pix = (g, rows, map) => { const by = {}; rows.forEach((r, y) => [...r].slice(0, 16).forEach((c, x) => { if (map[c]) (by[c] ||= []).push([x, y]); })); for (const [c, pts] of Object.entries(by)) g.paint(G.pts(pts), [map[c], map[c], map[c], map[c]], 'f'); };

export const ABILITIES_NH = {
  // ---------------------------------------------------------------- Pudge
  pudge_meat_hook: ['blood', g => {
    g.halo(8, 9, 8, '#c42828');
    // chain links running in from the top-left
    for (const [x, y] of [[1, 1], [3, 2], [4, 4], [6, 5]]) g.ring(x + 0.5, y + 0.5, 0.6, 1.5, R.iron, 'f');
    g.rect(7, 5, 8, 9, R.iron, 'h');
    // the hook: a U with a barbed tip, a lump of meat on the barb
    g.paint(G.arc(8, 9, 3.4, 5.4, -0.15, Math.PI + 0.5), R.steel, 'f', { lv: 1 });
    g.paint(G.arc(8, 9, 3.4, 4.2, 0.2, Math.PI - 0.3), R.white, 'f', { lv: 0, soft: true });
    g.poly([[1.6, 7.5], [4.2, 9.6], [2.2, 10.2]], R.white, 'e');
    g.ell(12.5, 12.6, 2.4, 2, R.blood, 'g'); g.dot(12, 12, '#ff9a8a'); g.dot(13, 13, '#430a10');
    g.spark(13, 3, '#ff8a6a');
  }],
  pudge_rot: ['nature', g => {
    g.halo(7.5, 8, 9, '#6ae04c');
    g.ell(5, 9, 4.2, 3.4, R.green, 'g'); g.ell(10.5, 8, 4.6, 3.6, R.green, 'g'); g.ell(7.5, 5.5, 4, 3.2, R.green, 'g'); g.ell(7.5, 10.5, 5.4, 3, R.green, 'g');
    g.soft(G.pts([[5, 5], [6, 5], [4, 7], [11, 6], [12, 7]]), '#dcffa0');
    g.soft(G.pts([[5, 11], [9, 12], [10, 10], [3, 10]]), '#1a5a24');
    // stink lines and flies
    g.soft(G.pts([[3, 0], [4, 1], [3, 2], [4, 3], [12, 0], [11, 1], [12, 2], [11, 3]]), '#b8f080');
    g.dots([[13, 12], [2, 13], [14, 6]], '#12121c'); g.dots([[1, 11], [14, 13]], '#12121c');
  }],
  pudge_flesh_heap: ['blood', g => {
    g.halo(7.5, 8, 8, '#d44a4a');
    g.ell(7.5, 10, 6.6, 4.8, R.blood, 'g');
    g.ell(4, 7, 2.8, 2.6, R.blood, 'g'); g.ell(11.5, 6.6, 3, 2.8, R.blood, 'g'); g.ell(7.5, 6, 3, 2.6, R.red, 'g');
    // stitches and a bone
    g.soft(G.pts([[5, 10], [6, 9], [6, 11], [7, 10], [8, 9], [8, 11], [9, 10]]), '#f0b0a0');
    g.paint(G.line(10, 1, 12, 5, 2), R.bone, 'f', { lv: 1 });
    g.ell(10, 1.2, 1.4, 1.2, R.bone, 'g'); g.ell(12.4, 5.6, 1.3, 1.1, R.bone, 'g');
    g.dots([[3, 12], [12, 12]], '#430a10'); g.spark(2, 2, '#ff9a8a');
  }],
  pudge_dismember: ['blood', g => {
    g.halo(8, 7, 9, '#ff4a40');
    // butcher's cleaver with a bite taken out of the edge
    g.poly([[2, 2], [11, 2], [13, 4], [13, 10], [2, 10]], R.steel, 'e');
    g.poly([[3, 3], [10, 3], [10, 5], [3, 5]], R.white, 'f', { lv: 0 });
    g.paint(G.pts([[5, 10], [6, 10], [7, 10], [6, 9], [9, 10], [10, 10]]), R.dark, 'f', { lv: 3, soft: true });
    g.ell(11, 5.5, 1, 1, R.dark, 'f');
    g.rect(5, 11, 8, 15, R.wood, 'h'); g.rect(4, 14, 9, 15, R.gold, 'e');
    // blood
    g.soft(G.pts([[3, 11], [3, 12], [3, 13], [11, 11], [12, 11], [12, 12], [10, 13]]), '#e84a3c');
    g.spark(14, 1, '#ff9a8a'); g.spark(1, 13, '#ff9a8a');
  }],
  // ---------------------------------------------------------------- Mirana
  mirana_starfall: ['moon', g => {
    g.halo(9, 9, 10, '#d8ecff');
    // a small falling star with a long streak, top-left
    g.paint(G.line(0, 0, 4, 4, 2), R.cyan, 'f', { lv: 2, soft: true }); g.paint(G.line(0, 1, 3, 4, 1), R.ice, 'f', { lv: 1, soft: true }); g.spark(4, 4, W);
    // the big four-point star filling the frame
    const BR = ['#ffffff', '#fffbe0', '#ffe48a', '#c88a10'];
    g.poly([[9, 0.5], [11.2, 6.8], [9, 15.5], [6.8, 6.8]], BR, 'x');
    g.poly([[1.5, 9], [7.8, 6.8], [16, 9], [7.8, 11.2]], BR, 'x');
    g.poly([[5, 4.5], [9.4, 8.6], [13.5, 13.5], [8.6, 9.4]], R.ice, 'f', { lv: 1 });
    g.poly([[13.5, 4.5], [9.4, 9.4], [5, 13.5], [8.6, 8.6]], R.ice, 'f', { lv: 1 });
    g.poly([[9, 0.5], [11.2, 6.8], [9, 15.5], [6.8, 6.8]], BR, 'x'); g.poly([[1.5, 9], [7.8, 6.8], [16, 9], [7.8, 11.2]], BR, 'x');
    g.soft(G.ell(9, 9, 1.4, 1.4), W);
    g.dots([[14, 2], [2, 14], [15, 15]], '#e0f0ff');
  }],
  mirana_arrow: ['moon', g => {
    g.halo(11, 4.5, 9, '#e0d8ff');
    // glowing moonlit trail behind the arrow
    g.paint(G.line(0, 15, 9, 6, 3), R.purple, 'f', { lv: 1, soft: true });
    g.paint(G.line(0, 14, 9, 5, 1), R.magenta, 'f', { lv: 0, soft: true });
    // shaft (white-silver), big head, fletching
    g.paint(G.line(2, 13, 12, 3, 2), R.white, 'f', { lv: 1 });
    g.poly([[15.6, 0.4], [8.6, 2], [14, 7.4]], R.white, 'e'); g.poly([[14.6, 1.4], [11, 2.6], [13.4, 5]], R.ice, 'f', { lv: 0 });
    g.poly([[0.5, 15], [0, 10.5], [4, 11.5]], R.magenta, 'x'); g.poly([[0.5, 15], [5, 15.5], [4.5, 11.5]], R.purple, 'x');
    g.spark(6, 2, '#e8e0ff'); g.spark(13, 12, '#e8e0ff');
  }],
  mirana_leap: ['arcane', g => {
    g.halo(9, 3, 8, '#e8d8ff');
    // hand-placed: crescent moon, a jump arc that lands in a down-right arrowhead, dust where it took off
    pix(g, [
      '................',
      '...........mm...',
      '..........mM....',
      '..........mM....',
      '...........mm...',
      '....wwwwww......',
      '..wwcccccww.....',
      '.wcc......cww...',
      'wc..........cw..',
      'wc...........cw.',
      'wc.........wwwwww',
      'wc..........wwww.',
      'dd...........ww..',
      'ddd..............',
      '.ddd.............',
      '................'], { w: '#ffffff', c: '#86e6ff', m: '#ece2c0', M: '#b8a880', d: '#a878f0' });
    g.spark(3, 2, '#ffffff');
  }],
  mirana_invis: ['arcane', g => {
    g.halo(7, 7.5, 9, '#c8b0ff');
    // big glowing crescent moon (Moonlight Shadow)
    g.paint(G.sub(G.ell(7, 7.5, 6.8, 6.8), G.ell(10.4, 5.6, 5.6, 5.8)), R.bone, 'g');
    g.paint(G.sub(G.ell(7, 7.5, 5.6, 5.6), G.ell(9.6, 6.2, 5.2, 5.4)), R.yellow, 'f', { lv: 1, soft: true });
    // shimmer of a fading figure on the dark side
    g.soft(G.pts([[11, 9], [12, 11], [11, 13], [13, 8], [13, 12], [12, 14]]), '#d8c4ff');
    g.spark(13, 2, '#ffffff'); g.dots([[15, 6], [2, 1], [9, 15], [15, 15]], '#e8e0ff');
  }],
  // ---------------------------------------------------------------- Rubick
  rubick_telekinesis: ['arcane', g => {
    g.halo(7.5, 6, 9, '#d098ff');
    // ground ring + lifted boulder with a little levitation sparkle
    g.paint(G.sub(G.ell(7.5, 13, 6.4, 2.2), G.ell(7.5, 13, 4.6, 1)), R.magenta, 'e');
    g.poly([[4, 4], [7, 1], [11, 2], [12.5, 5], [11, 8.5], [6, 9], [3.5, 7]], R.brown, 'g');
    g.dots([[6, 4], [9, 6], [7, 7]], '#5e3a1c'); g.soft(G.pts([[6, 3], [7, 2]]), '#e0b070');
    g.zig([[2, 12], [2, 9]], R.magenta, W, 1); g.zig([[13, 12], [13, 9]], R.magenta, W, 1);
    g.soft(G.pts([[2, 8], [1, 9], [3, 9], [13, 8], [12, 9], [14, 9]]), '#f2d8ff');
  }],
  rubick_fade_bolt: ['bolt', g => {
    g.halo(8, 8, 9, '#9ad0ff');
    // a thick bolt chaining through three targets
    g.zig([[2, 13], [6, 10], [5, 7], [10, 5], [11.5, 3.5]], R.cyan, W, 2);
    g.zig([[11.5, 3.5], [14, 7], [12.5, 10], [13.5, 13]], R.cyan, W, 2);
    for (const [x, y, r] of [[2.5, 12.5, 2.6], [11.5, 3.5, 2.4], [13.5, 13, 2]]) { g.ell(x, y, r, r, R.ice, 'g'); g.dot(x, y, W); }
    g.spark(2, 2, '#e0f4ff'); g.spark(6, 14, '#e0f4ff');
  }],
  rubick_arcane_supremacy: ['arcane', g => {
    g.halo(7.5, 8, 9, '#c898ff');
    // grimoire with a golden star
    g.poly([[1, 3], [7.5, 2], [14, 3], [14, 13], [7.5, 14], [1, 13]], R.purple, 'e');
    g.poly([[2, 4], [7, 3.4], [7, 12.6], [2, 12]], R.bone, 'f', { lv: 1 });
    g.poly([[8, 3.4], [13, 4], [13, 12], [8, 12.6]], R.bone, 'f', { lv: 2 });
    g.paint(G.line(7.5, 2, 7.5, 14, 1), R.dark, 'f', { lv: 2, soft: true });
    g.soft(G.pts([[3, 6], [4, 6], [5, 6], [3, 8], [4, 8], [3, 10], [4, 10], [5, 10]]), '#7c4c26');
    g.poly([[10.5, 5.5], [11.4, 7.6], [13.4, 8], [11.4, 8.4], [10.5, 10.5], [9.6, 8.4], [7.6, 8], [9.6, 7.6]], R.gold, 'e');
    g.spark(14, 1, '#f2d8ff'); g.spark(1, 14, '#f2d8ff');
  }],
  rubick_spell_steal: ['nature', g => {
    g.halo(7.5, 7.5, 9, '#7aff6a');
    // green swirl pulled into a magenta orb held in a grasping hand
    let prev = null;
    for (let i = 0; i <= 40; i++) { const t = i / 40, a = t * 3.6 * Math.PI + 0.9, r = 7.3 * (1 - t) + 1.4; const p = pol(7.5, 6.5, r, a);
      if (prev) g.paint(G.line(prev[0], prev[1], p[0], p[1], 1), t < 0.55 ? R.green : R.yellow, 'f', { lv: t < 0.55 ? 1 : 2 }); prev = p; }
    g.ell(7.5, 6.5, 2.6, 2.6, R.magenta, 'g'); g.dot(6, 5, '#ffd6ff');
    g.poly([[2, 14], [3, 10], [5, 9.4], [7.5, 11], [10, 9.4], [12, 10], [13, 14]], R.skin, 'x');
    g.soft(G.pts([[5, 11], [7, 12], [9, 11]]), '#6a4028');
    g.spark(13, 2, '#dcffa0'); g.spark(2, 2, '#dcffa0');
  }],
};
