// Glyph drawings for Pudge, Mirana and Rubick abilities (same kit/frame as abilities.mjs). Merged by icons.mjs.
import { Glyph as G, R, pix } from './kit.mjs';

const W = '#ffffff';
const pol = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
// hand-placed 16x16 pixels: rows of chars, map char -> hex; outlined like any painted shape

export const ABILITIES_NH = {
  // ---------------------------------------------------------------- Pudge
  pudge_meat_hook: ['olive', g => {
    g.halo(8, 9, 6, '#d8f080');
    // a great blood-soaked hook on its chain
    for (const [x, y] of [[11, 0], [12, 2]]) g.ring(x + 0.5, y + 0.5, 0.5, 1.4, R.iron, 'f');
    g.rect(11, 3, 12, 9, R.red, 'h');
    g.paint(G.arc(8, 9, 2.8, 5.6, -0.2, Math.PI + 0.7), R.red, 'g');
    g.poly([[0.6, 6.4], [4.6, 9.8], [1.8, 10.6]], R.red, 'e');
    g.paint(G.arc(8, 9, 4.8, 5.6, 0.3, Math.PI - 0.2), R.red, 'f', { lv: 0, soft: true });
    g.soft(G.pts([[12, 4], [12, 6], [11, 8], [10, 12], [7, 13], [4, 12], [2, 10]]), '#ffc8b8');
    g.soft(G.pts([[13, 12], [13, 14], [14, 11], [5, 14], [5, 15]]), '#c42828');
  }],
  pudge_rot: ['olive', g => {
    g.halo(7.5, 8, 10, '#c8f060');
    // a toxic cloud closing around a clawed grey hand
    g.ell(4.5, 9, 4.2, 3.6, R.green, 'g'); g.ell(11, 8, 4.6, 3.8, R.green, 'g'); g.ell(7.5, 4.6, 4.4, 3.2, R.green, 'g'); g.ell(8, 12, 5.4, 2.8, R.green, 'g');
    g.soft(G.pts([[5, 4], [6, 3], [4, 7], [11, 5], [12, 7], [10, 3]]), '#dcffa0');
    const HD = ['#7c8870', '#4e5a46', '#2c3628', '#141a12'];
    g.ell(7.5, 10.5, 3.2, 2.8, HD, 'g');
    for (const [x0, y0, x1, y1] of [[5, 9.5, 2.5, 5.5], [6.5, 8.5, 5.5, 3.5], [8.5, 8.5, 9.5, 3], [10, 9.5, 12.5, 5]]) { g.paint(G.line(x0, y0, x1, y1, 2), HD, 'f', { lv: 1 }); g.soft(G.rect(x1 - 0.4, y1 - 1, x1 + 0.4, y1 - 0.2), '#fffbe8'); }
    g.soft(G.pts([[3, 1], [4, 2], [3, 3], [12, 1], [11, 2], [12, 3]]), '#b8f080');
    g.dots([[13, 12], [2, 14], [14, 5]], '#12121c');
  }],
  pudge_flesh_heap: ['flesh', g => {
    g.halo(7.5, 8, 9, '#ffe8e0');
    // a diagonal link of red meat beads, stitched together
    g.paint(G.line(2, 13, 13, 2, 3), R.blood, 'g');
    for (const [x, y, r] of [[3, 12, 2.8], [8, 8, 2.8], [12.5, 3.5, 2.5]]) { g.ell(x, y, r, r, R.blood, 'g'); g.dot(x - 1, y - 1, '#ff9a8a'); g.dot(x, y - 1, '#ff9a8a'); }
    g.soft(G.pts([[5, 10], [6, 10], [10, 6], [11, 5], [6, 9], [5, 11], [10, 5], [11, 6]]), '#fff0e8');
    g.soft(G.pts([[1, 15], [15, 1]]), '#6c3c40'); g.dots([[1, 4], [14, 13], [4, 2], [11, 14]], '#ffd0c0');
  }],
  pudge_dismember: ['ruby', g => {
    g.halo(8, 7, 9, '#ff4a40');
    // a butcher's cleaver, blade wet with blood
    g.rect(0, 5, 5, 7, R.wood, 'h'); g.rect(4, 4, 5, 8, R.gold, 'e');
    g.poly([[6, 3], [14, 1.5], [15, 11], [6, 11]], R.steel, 'e');
    g.paint(G.rect(7, 3, 13, 3), R.white, 'f', { lv: 0, soft: true });
    g.ell(12, 5, 1.1, 1.1, R.dark, 'f');
    g.soft(G.rect(6, 10, 14, 10), '#c42828'); g.soft(G.pts([[8, 7], [9, 8], [8, 9], [11, 8], [12, 9]]), '#e84a3c');
    g.soft(G.pts([[7, 12], [7, 13], [10, 12], [10, 14], [13, 12], [2, 10], [2, 11], [3, 13]]), '#e84a3c');
    g.spark(14, 14, '#ff9a8a');
  }],
  // ---------------------------------------------------------------- Mirana
  mirana_starfall: ['moon', g => {
    g.halo(11, 11, 10, '#a8c0ff');
    // a shower of stars: one great comet and two lesser, tails streaming back up-left
    const comet = (hx, hy, len, big) => {
      g.paint(G.line(hx - len, hy - len, hx, hy, big ? 4 : 2), R.purple, 'f', { lv: 1, soft: true });
      g.paint(G.line(hx - len * 0.85, hy - len * 0.85, hx, hy, big ? 3 : 1), R.blue, 'f', { lv: 1, soft: true });
      g.paint(G.line(hx - len * 0.55, hy - len * 0.55, hx, hy, big ? 2 : 1), R.cyan, 'f', { lv: 0, soft: true });
      g.soft(G.ell(hx, hy, big ? 2.4 : 1.2, big ? 2.4 : 1.2), '#ffffff');
    };
    comet(5, 9, 5, false); comet(14, 4, 5, false); comet(11, 11, 10, true);
    g.spark(11, 11, '#ffffff'); g.dots([[2, 13], [8, 2], [14, 14], [1, 5], [6, 6]], '#e0f0ff');
  }],
  mirana_arrow: ['moon', g => {
    g.halo(3, 3, 8, '#e0e8ff');
    // the moon-staff arrow, tipped with a starburst
    g.paint(G.line(5, 5, 13, 13, 2), R.steel, 'f', { lv: 1 });
    g.paint(G.line(4, 5, 12, 13, 1), R.white, 'f', { lv: 0, soft: true });
    g.poly([[2, 2], [8, 4], [7, 5.5], [8.5, 8], [6, 7.5], [4, 8.5], [4.5, 5.5]], R.ice, 'e');
    g.poly([[2.5, 2.5], [6, 3.6], [4.2, 5.8]], R.white, 'f', { lv: 0 });
    g.ring(12.5, 12.5, 1.2, 2.8, R.blue, 'e'); g.ell(12.5, 12.5, 1.2, 1.2, R.cyan, 'f');
    g.poly([[14, 9], [15, 11], [13, 11]], R.cyan, 'x'); g.poly([[9, 14], [11, 15], [11, 13]], R.cyan, 'x');
    g.spark(2, 2, '#ffffff', true); g.dots([[13, 3], [3, 13], [9, 1], [1, 9]], '#c0d4ff');
  }],
  mirana_leap: ['moon', g => {
    g.halo(8, 7, 9, '#a0b8ff');
    // Sagan the snow leopard in full stretch, Mirana crouched on his back
    const CT = ['#ffffff', '#f0f4ff', '#c0c8e0', '#6c78a0'];
    g.paint(G.line(5, 9, 1, 12, 1), CT, 'f', { lv: 1 }); g.paint(G.line(6, 10, 3, 14, 1), CT, 'f', { lv: 2 });
    g.paint(G.line(10, 9, 14, 12, 1), CT, 'f', { lv: 1 }); g.paint(G.line(11, 8, 15, 10, 1), CT, 'f', { lv: 2 });
    g.paint(G.line(4, 7, 2, 4, 1), CT, 'f', { lv: 1 });
    g.ell(8, 8, 4.6, 2.4, CT, 'g'); g.ell(12.4, 7, 2, 1.8, CT, 'g');
    g.dots([[12, 5], [14, 5]], '#c0c8e0'); g.dot(13, 7, '#12121c');
    g.soft(G.pts([[5, 8], [7, 9], [9, 8], [6, 7], [9, 9]]), '#8890b8');
    g.ell(8, 4.6, 1.4, 1.4, R.skin, 'g'); g.rect(7, 6, 9, 7, R.blue, 'e');
    g.paint(G.arc(11, 5, 2.4, 3.2, -1.3, 1.3), R.cyan, 'f', { lv: 1, soft: true });
    g.paint(G.arc(13, 2.5, 1.2, 2.4, 0.6, 5.6), R.bone, 'f', { lv: 1, soft: true });
  }],
  mirana_invis: ['moon', g => {
    g.halo(6, 6, 10, '#e8f0ff');
    // Moonlight Shadow: a great pale moon, the huntress in dark profile before it
    g.ell(6, 6, 6.2, 6.2, ['#ffffff', '#e8f0ff', '#b8c4f0', '#7c88d0'], 'g');
    pix(g, [
      '................', '................',
      '........hhhhh...',
      '.......hhhhhhh..',
      '......hhhhhhhhs.',
      '......hhhhhhhss.',
      '......hhhhhhsssS',
      '......hhhhhhsss.',
      '......hhhhhhssm.',
      '......hhhhhhhss.',
      '.....hhhhhhhhs..',
      '....hhhhhhhhhh..',
      '...hhhhhhhhhhhh.',
      '..hhhhhhhhhhhhh.',
      '..hhhhhhhhhhhhhh'], { h: '#1c2450', s: '#9cacf0', S: '#6a74c8', m: '#d888d8' });
    g.dots([[13, 6]], '#ffffff'); g.dots([[1, 14], [14, 1], [10, 1]], '#e8f0ff');
  }],
  // ---------------------------------------------------------------- Rubick
  rubick_telekinesis: ['nature', g => {
    g.halo(8, 8, 11, '#c0ff90');
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; g.paint(G.line(8, 8, 8 + 10 * Math.cos(a), 8 + 10 * Math.sin(a), 1), R.green, 'f', { lv: 0, soft: true }); }
    // a dark figure flung into the air, tumbling, debris flying
    const D = R.dark;
    g.ell(9, 3.6, 1.7, 1.7, D, 'f');
    g.paint(G.line(9, 5, 7, 10, 2), D, 'f', { lv: 3 });
    g.paint(G.line(8.5, 6, 3, 3, 1), D, 'f', { lv: 3 }); g.paint(G.line(8.5, 6, 14, 8, 1), D, 'f', { lv: 3 });
    g.paint(G.line(7, 10, 3, 14, 1), D, 'f', { lv: 3 }); g.paint(G.line(7, 10, 12, 13, 1), D, 'f', { lv: 3 });
    g.soft(G.pts([[1, 8], [2, 9], [13, 3], [14, 2], [13, 12], [3, 7], [11, 1], [1, 2]]), '#12121c');
  }],
  rubick_fade_bolt: ['nature', g => {
    g.halo(8, 8, 10, '#7aff6a');
    // a looping streak of green fire ending in a bright bolt
    g.paint(G.ring(5.5, 6.5, 2.4, 4.2), R.green, 'f', { lv: 1, soft: true });
    g.paint(G.ring(5.5, 6.5, 2.8, 3.6), R.green, 'f', { lv: 0, soft: true });
    for (const [x0, y0, x1, y1, w] of [[7, 9.5, 9, 11, 3], [9, 11, 12, 11.5, 2], [12, 11.5, 14, 10, 1]]) g.paint(G.line(x0, y0, x1, y1, w), R.green, 'f', { lv: w > 1 ? 1 : 0, soft: true });
    g.paint(G.line(7.5, 3, 11, 2, 1), R.green, 'f', { lv: 1, soft: true });
    g.soft(G.ell(14, 10, 1.4, 1.4), '#ffffff'); g.spark(14, 10, '#dcffa0');
    g.dots([[1, 2], [13, 2], [2, 14], [10, 6]], '#dcffa0');
  }],
  rubick_arcane_supremacy: ['nature', g => {
    g.halo(8, 8, 11, '#c0ff90');
    // a white shield crossed by two glowing green staffs
    g.poly([[2, 1.5], [13.5, 1.5], [13.5, 8], [8, 15], [2, 8]], R.white, 'e');
    g.poly([[3.5, 3], [12, 3], [12, 7.5], [8, 12.5], [3.5, 7.5]], R.dark, 'e');
    g.paint(G.line(2, 14, 13, 2, 2), R.green, 'f', { lv: 1 }); g.paint(G.line(13, 14, 2, 2, 2), R.green, 'f', { lv: 1 });
    g.paint(G.line(2, 13, 12, 2, 1), R.green, 'f', { lv: 0, soft: true }); g.paint(G.line(13, 13, 3, 2, 1), R.green, 'f', { lv: 0, soft: true });
    g.ell(2, 1.8, 1.3, 1.3, R.yellow, 'g'); g.ell(13, 1.8, 1.3, 1.3, R.yellow, 'g');
    g.spark(8, 8, '#dcffa0');
  }],
  rubick_spell_steal: ['nature', g => {
    g.halo(8, 7, 11, '#f0ffa0');
    g.soft(G.ell(8, 7, 3.4, 3.4), '#f4ffb8'); g.soft(G.ell(8, 7, 2, 2), '#ffffff');
    // a dark hand reaching up, magic spilling between the fingers
    const HD = ['#3c4a40', '#1c2820', '#101a14', '#070c08'];
    g.ell(8, 13, 3.8, 2.6, HD, 'f');
    for (const [x0, y0, x1, y1] of [[5, 12, 0.5, 7.5], [6, 11, 3.5, 2], [8, 11, 8, 0.5], [10, 11, 12.5, 2], [11.5, 12, 15.5, 8]]) g.paint(G.line(x0, y0, x1, y1, 1), HD, 'f', { lv: 1 });
    g.dots([[3, 14], [13, 14], [8, 15]], '#dcffa0'); g.soft(G.pts([[5, 6], [11, 6], [8, 5]]), '#ffffff');
  }],
};
