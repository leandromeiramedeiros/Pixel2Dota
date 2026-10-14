// Glyph drawings for items + misc UI icons. Each entry: key -> [theme, draw(g)]
// Every item is hand-drawn to echo the subject, silhouette and dominant colours of its Dota 2 counterpart.
import { Glyph as G, R } from './kit.mjs';
const W = '#ffffff';

// hand-placed pixel rows (16 wide): map = { char: hex }
const pix = (g, rows, map) => { const by = {}; rows.forEach((r, y) => [...r].slice(0, 16).forEach((c, x) => { if (map[c]) (by[c] ||= []).push([x, y]); })); for (const [c, pts] of Object.entries(by)) g.paint(G.pts(pts), [map[c], map[c], map[c], map[c]], 'f'); };
const mirror = pts => pts.map(([x, y]) => [15 - x, y]);
const sym = (g, pts, ramp, mode = 'x') => { g.poly(pts, ramp, mode); g.poly(mirror(pts), ramp, mode); };
const star = (cx, cy, ro, ri, n, rot = 0) => { const p = []; for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, r = i & 1 ? ri : ro; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return p; };
// custom ramps [hi, mid, shade, dark]
const TWIG = ['#fff0a0', '#e8b830', '#b8801c', '#6a4410'];
const OLIVE = ['#f0ea88', '#c0b040', '#8c7c22', '#4a4010'];
const AQUA = ['#d8fff4', '#58c8d8', '#2c8cb0', '#14486c'];
const FUR = ['#f0d890', '#c89848', '#8c6428', '#4a300e'];
const MINT = ['#e0fff0', '#98d8c0', '#58a090', '#2c5a54'];
const LEAF = ['#e4ff90', '#8cd850', '#4c9c34', '#1e5a28'];
const IRONB = ['#9a94a8', '#5a566a', '#38364a', '#1c1a28'];

function boot(g, ramp, trim, o = {}) {
  g.poly([[3, 1], [8, 1], [8, 8], [12, 9], [14.5, 11.5], [14.5, 14], [2.5, 14], [2.5, 9]], ramp, 'x');
  g.rect(3, 1, 8, 2.4, trim, 'e');
  g.paint(G.rect(2.5, 13, 14.5, 14), o.sole || R.brown, 'f', { lv: 2 });
  g.dots([[4, 5], [6, 5], [4, 7], [6, 7]], ramp[3]);
  g.dot(4, 3, ramp[0]); g.dot(11, 11, ramp[0]); g.dot(12, 11, ramp[0]);
}
function ringShape(g, ramp, gem) {
  g.paint(G.sub(G.ell(7.5, 9, 5.8, 6), G.ell(7.5, 9.4, 3.2, 3.8)), ramp, 'g');
  g.paint(G.rect(5, 2, 10, 4), R.steel, 'e', { soft: false });
  g.ell(7.5, 3, 2.4, 1.8, gem, 'g'); g.dot(6, 2, W);
}
function ward(g, body, iris, bg) {   // tentacle with big eyes
  g.halo(9, 6, 8, bg);
  g.poly([[0, 14], [3, 9], [6, 5], [10, 2], [14, 3], [15, 8], [12, 11], [8, 12], [5, 15], [1, 15]], body, 'g');
  g.paint(G.line(1, 14, 6, 9, 1), body, 'f', { lv: 3, soft: true });
  g.ell(11, 5.5, 3.2, 3.2, R.bone, 'g'); g.ell(11.4, 5.7, 2, 2, iris, 'g'); g.dots([[12, 5], [12, 6]], '#2a1004');
  g.ell(6.2, 7.2, 1.9, 1.9, R.bone, 'g'); g.ell(6.5, 7.5, 1.1, 1.1, iris, 'g'); g.dot(6, 7, '#2a1004');
  g.ell(8.5, 11, 1.4, 1.4, R.bone, 'g'); g.dot(9, 11, iris[2]);
  g.dots([[9, 3], [13, 8]], R.bone[0]);
}

export const ITEMS = {
  item_tango: ['nature', g => {   // glowing green leaf with three orbs
    g.halo(8, 8, 8, '#a8ff70');
    g.poly([[0, 13], [2, 8], [5, 5], [7, 1], [9, 4], [13, 2], [15, 6], [15, 10], [11, 14], [5, 15]], LEAF, 'g');
    g.paint(G.line(1, 13, 14, 8, 1), LEAF, 'f', { lv: 3, soft: true });
    g.paint(G.line(7, 3, 7, 5, 1), LEAF, 'f', { lv: 3, soft: true });
    g.ell(8, 7, 2, 2, R.teal, 'g'); g.ell(5.5, 11, 2, 2, R.teal, 'g'); g.ell(10.5, 11, 2, 2, R.teal, 'g');
    g.dots([[7, 6], [5, 10], [10, 10]], '#ffffff'); g.dots([[8, 7], [6, 11], [11, 11]], '#d8fff0');
  }],
  item_flask: ['item', g => {   // healing salve: round green flask, brown cork
    g.ell(8, 2.6, 2.4, 2.2, R.brown, 'g'); g.dot(7, 1, R.brown[0]);
    g.rect(6, 4, 10, 6, R.gold, 'e');
    g.ell(8, 10.5, 6, 5, R.green, 'g');
    g.paint(G.ell(9.5, 12.2, 3.8, 2.4), R.green, 'f', { lv: 3, soft: true });
    g.dots([[4, 8], [4, 9], [5, 7], [5, 8]], '#e8ffc0'); g.dot(11, 12, '#a8f070'); g.spark(13.5, 5, '#e8ffc0');
  }],
  item_clarity: ['night', g => {   // blue mana flask, silver cap
    g.ell(8, 1.6, 2, 1.2, R.steel, 'g'); g.rect(6.2, 2.5, 9.8, 3.8, R.steel, 'e');
    g.rect(6.5, 4, 9.5, 7, R.cyan, 'v');
    g.ell(8, 11, 6, 4.6, R.blue, 'g');
    g.paint(G.and(G.ell(8, 11, 6, 4.6), G.rect(0, 12.6, 15, 15)), R.bone, 'f', { lv: 1 });
    g.dots([[5, 13], [8, 13], [10, 13]], '#38aef0');
    g.dots([[4, 9], [4, 10], [5, 8]], '#cdf2ff'); g.dots([[11, 10], [10, 11]], '#86e6ff'); g.spark(14, 3, '#d8f8ff');
  }],
  item_faerie_fire: ['arcane', g => {   // green flame leaves
    g.halo(7.5, 9, 8, '#a8ff50');
    g.poly([[7.5, 15], [2, 11], [0.5, 4], [4, 6], [6.5, 10]], LEAF, 'x');
    g.poly([[7.5, 15], [13, 11], [14.5, 3], [11, 6], [9, 10]], LEAF, 'x');
    g.poly([[7.5, 14], [5, 8], [6, 1], [8, 5], [10, 1], [10.5, 9]], LEAF, 'g');
    g.poly([[7.5, 14], [6.2, 9], [7.5, 5], [9, 9]], R.yellow, 'g');
    g.dots([[3, 14], [13, 14], [1, 8]], '#dcffa0'); g.spark(13, 8, '#e8ffc0');
  }],
  item_enchanted_mango: ['bolt', g => {   // golden mango, green leaf, blue sparkles
    g.halo(8, 9, 8, '#38aef0');
    pix(g, [
      '................',
      '.........dgg....',
      '........dgGGgd..',
      '.......dYyyod...',
      '......dYyyyood..',
      '.....dYyyyyyood.',
      '....dyyyyyyyyod.',
      '...dkyyyyyyyood.',
      '...dkkyyyyyyood.',
      '..dkkkyyyyyoord.',
      '..dkkkkyyyoorrd.',
      '..dkkkkkyoorrd..',
      '...dkkkkoorrd...',
      '....dkkkorrd....',
      '.....ddddd......',
      '................'], { d: '#8a4a0c', Y: '#fff4a0', y: '#ffc23c', o: '#ff9a30', r: '#d8601a', k: '#84c83c', g: '#3c9c30', G: '#84e04c' });
    g.dots([[6, 5], [5, 6]], '#ffffff'); g.dots([[13, 1], [15, 3], [14, 2], [15, 6], [12, 2], [14, 0]], '#86e6ff');
  }],
  item_tpscroll: ['item', g => {   // parchment scroll, spiral rune
    g.rect(3, 3, 12, 12, R.bone, 'v');
    g.rect(1, 1.5, 14, 3, R.white, 'e'); g.rect(1, 12, 14, 13.5, R.white, 'e');
    g.rect(0, 0.5, 1.5, 4, R.gold, 'e'); g.rect(13.5, 0.5, 15, 4, R.gold, 'e'); g.rect(0, 11, 1.5, 14.5, R.gold, 'e'); g.rect(13.5, 11, 15, 14.5, R.gold, 'e');
    g.soft(G.pts([[5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [10, 5], [5, 6], [5, 7], [5, 8], [5, 9], [5, 10], [6, 10], [7, 10], [8, 10], [9, 10], [10, 10], [10, 6], [10, 7], [10, 8], [10, 9], [7, 7], [8, 7], [8, 8], [7, 8], [7, 9], [8, 9]]), '#7c4c26');
    g.soft(G.pts([[7, 7], [8, 7], [7, 8]]), '#b27a40');
  }],
  item_branches: ['item', g => {   // bundle of golden twigs tied with a green band
    g.line(0, 1, 7, 8, TWIG, 2, 'f'); g.line(0, 4, 6, 10, TWIG, 2, 'f'); g.line(3, 0, 8, 6, TWIG, 2, 'f');
    g.paint(G.or(G.line(1, 1, 7, 7, 1), G.line(3, 0, 8, 5, 1)), TWIG, 'f', { lv: 0, soft: true });
    g.line(7, 8, 15, 5, TWIG, 1, 'f'); g.line(7, 8, 15, 9, TWIG, 1, 'f'); g.line(7, 9, 14, 14, TWIG, 1, 'f'); g.line(6, 10, 9, 15, TWIG, 1, 'f'); g.line(10, 7, 13, 2, TWIG, 1, 'f');
    g.line(11, 8, 14, 7, TWIG, 1, 'f');
    g.paint(G.or(G.line(3, 6, 6, 3, 2)), R.green, 'f', { lv: 2 }); g.dots([[4, 5], [5, 4]], R.green[1]);
  }],
  item_gauntlets: ['night', g => {   // studded leather cuff, steel fist
    g.poly([[0, 3], [5, 2], [7, 4], [7, 13], [5, 15], [0, 14]], R.leather, 'v');
    g.dots([[1, 5], [3, 4], [1, 9], [3, 8], [4, 12], [2, 12]], '#fff0c0');
    g.rect(6, 4, 14, 12, R.steel, 'x');
    for (const y of [4.5, 7, 9.5]) g.ell(13, y, 2, 1.3, R.steel, 'g');
    g.ell(9, 13, 3, 1.6, R.steel, 'g'); g.paint(G.line(7, 8, 11, 8, 1), R.steel, 'f', { lv: 3, soft: true });
  }],
  item_slippers: ['item', g => {   // pair of green curly-toe shoes
    pix(g, ["..............dd","..dddd.....ddgd",".dgllgdd..dgggd",".dglgggdddgggd.","dgllggggggggd..","dgggggggggggd..",".dsssssssssd...","..............dd","..dddd.....ddgd",".dgllgdd..dgggd",".dglgggdddgggd.","dgllggggggggd..","dgggggggggggd..",".dsssssssssd...",""], { d: '#1a5a24', g: '#3c9c30', l: '#a8f060', s: '#7c4c26' });
  }],
  item_mantle: ['bolt', g => {   // blue cloth with a flared collar, white laced front
    g.poly([[0, 8], [1, 3], [5, 1], [9, 4], [13, 1], [15, 5], [15, 10], [11, 14], [3, 15]], R.blue, 'x');
    g.poly([[5, 1], [9, 4], [8, 7], [4, 6]], R.blue, 'f', { lv: 3 });
    g.poly([[1, 3], [5, 1], [4, 4]], R.cyan, 'f', { lv: 0 }); g.poly([[13, 1], [15, 5], [11, 5]], R.cyan, 'f', { lv: 0 });
    g.poly([[0, 10], [9, 7], [15, 10], [11, 14], [3, 15]], R.white, 'x');
    g.dots([[5, 11], [7, 12], [7, 10], [5, 13], [9, 12], [9, 10]], '#3058c4');
  }],
  item_circlet: ['night', g => {   // silver diadem, amber gem
    g.paint(G.arc(7.5, 4, 5.2, 7.2, 0.1, 3.04), R.steel, 'g');
    g.poly([[0, 3], [3, 4.5], [2, 7], [0, 5]], R.steel, 'x'); g.poly([[15, 3], [12, 4.5], [13, 7], [15, 5]], R.steel, 'x');
    g.poly([[6, 10], [9, 10], [7.5, 14]], R.steel, 'x');
    g.ell(7.5, 10, 2.6, 2.2, R.orange, 'g'); g.dot(6, 9, W); g.spark(13, 12, '#ffe48a');
  }],
  item_ring_of_protection: ['night', g => {   // silver ring, amber stone
    g.paint(G.sub(G.ell(7.5, 9, 6, 6.2), G.ell(7.5, 9.4, 3.3, 3.9)), R.steel, 'g');
    g.paint(G.rect(5, 3, 10, 4), R.steel, 'e');
    g.ell(7.5, 2.6, 2.6, 1.7, R.orange, 'g'); g.dot(6, 2, W); g.spark(14, 2, '#cdf2ff');
  }],
  item_quelling_blade: ['item', g => {   // hatchet: wrapped handle, steel head
    g.line(1, 15, 8, 8, R.wood, 2, 'h');
    g.paint(G.or(G.line(2, 14, 3, 13, 2), G.line(4, 12, 5, 11, 2)), R.orange, 'f', { lv: 1 });
    g.poly([[6, 7], [5, 3], [9, 0.5], [13, 1], [15, 4], [15, 9], [11, 11], [12, 8], [10, 5], [9, 8]], R.steel, 'x');
    g.paint(G.line(7, 2, 12, 1, 1), R.white, 'f', { lv: 0 }); g.paint(G.line(14, 4, 14, 8, 1), R.white, 'f', { lv: 0 });
    g.dots([[10, 3], [12, 4], [7, 5]], '#7586a2'); g.dots([[9, 6], [10, 7]], '#3e4a66');
  }],
  item_blades_of_attack: ['night', g => {   // clawed wrist guard
    g.poly([[0, 2], [4, 0.5], [7, 3], [6, 8], [2, 10], [0, 7]], R.brown, 'x');
    g.paint(G.line(1, 4, 5, 6, 1), R.brown, 'f', { lv: 3 }); g.paint(G.line(1, 7, 4, 8, 1), R.brown, 'f', { lv: 3 });
    g.paint(G.rect(5, 3, 6, 6), R.orange, 'f', { lv: 1 });
    g.poly([[6, 2], [12, 3], [15, 9], [11, 6], [6, 5]], R.steel, 'x');
    g.poly([[6, 5], [12, 8], [14, 13], [10, 10], [6, 8]], R.steel, 'x');
    g.poly([[4, 8], [9, 11], [10, 15], [7, 12.5], [4, 10.5]], R.steel, 'x');
    g.paint(G.line(7, 3, 12, 4, 1), R.white, 'f', { lv: 0 });
  }],
  item_broadsword: ['nature', g => {   // hilt top-left, wide blade down-right
    g.poly([[5, 3], [8, 4], [15, 12], [14.5, 15], [12, 14.5], [4, 7]], R.steel, 'x');
    g.paint(G.line(6, 6, 13, 13, 1), R.white, 'f', { lv: 0, soft: true });
    g.poly([[2, 8], [7, 2], [8.5, 3.5], [3.5, 9.5]], R.iron, 'x'); g.dot(5, 5, '#ff9a30');
    g.line(0, 0, 3, 3, R.leather, 2, 'f'); g.dots([[1, 2], [3, 1]], '#d8601a'); g.ell(1, 1, 1.1, 1.1, R.leather, 'g');
  }],
  item_claymore: ['blood', g => {   // hilt top-right, blade down-left, gold guard, red gem
    g.paint(G.line(2, 13, 10, 5, 3), R.steel, 'h');
    g.poly([[1, 12], [5, 13], [4, 15], [1, 15]], R.steel, 'x');
    g.paint(G.line(3, 12, 9, 6, 1), R.white, 'f', { lv: 0, soft: true });
    g.poly([[7, 3], [11, 1], [14, 4], [13, 9], [12, 8], [12, 5], [9, 7]], R.gold, 'x');
    g.paint(G.line(8, 5, 12, 9, 2), R.gold, 'e');
    g.dot(10, 6, '#ff6a5a'); g.dot(9, 6, '#e84a3c');
    g.line(12, 3, 14, 1, R.dark, 2, 'f'); g.ell(14.2, 0.8, 1, 1, R.gold, 'g');
  }],
  item_chainmail: ['night', g => {   // scale/chain vest with leather shoulders
    g.poly([[4, 1.5], [6, 1.5], [7.5, 3.5], [9, 1.5], [11, 1.5], [15, 4.5], [15, 10], [12.5, 10], [11.5, 7], [11.5, 14], [3.5, 14], [3.5, 7], [2.5, 10], [0, 10], [0, 4.5]], R.iron, 'x');
    for (let y = 4; y < 14; y++) for (let x = 0; x < 16; x++) if (((x + y) & 1) && g.col.has((y + 8) * 64 + (x + 8))) g.dot(x, y, (y % 4 < 2) ? '#6e7a94' : '#c8d0dc');
    g.poly([[4, 1.5], [6, 1.5], [7.5, 3.5], [9, 1.5], [11, 1.5], [14, 4], [11, 6], [8, 4.5], [7, 4.5], [4, 6], [1, 4]], R.leather, 'x');
    g.dots([[3, 4], [12, 4], [7, 2]], '#fff0c0');
  }],
  item_ogre_axe: ['blood', g => {   // broad axe, red emblem, handle to the right
    g.line(8, 6, 15, 12, R.wood, 2, 'h'); g.dots([[11, 8], [12, 9], [10, 7], [14, 11]], '#46280f');
    g.poly([[0, 2], [4, 1], [7, 3], [9, 5], [9, 11], [7, 13], [3, 14], [0, 15], [2, 8]], R.iron, 'x');
    g.poly([[6, 3], [8, 0], [10, 4]], R.steel, 'x');
    g.poly([[2, 4], [7, 4.5], [7, 9], [3, 10.5], [5, 7.5]], R.red, 'g'); g.dots([[1, 3], [2, 2], [8, 6]], '#ffffff');
  }],
  item_mithril_hammer: ['teal', g => {   // pale teal-steel hammer head, wooden haft
    g.rect(6.5, 7, 9.5, 15, R.wood, 'h'); g.dots([[7, 10], [8, 11], [7, 13], [8, 14]], '#46280f');
    g.rect(1.5, 1, 13.5, 7, MINT, 'e'); g.ell(7.5, 4, 3, 2, MINT, 'g');
    g.rect(6, 6.6, 10, 8.4, R.steel, 'e'); g.paint(G.line(3, 2, 12, 2, 1), R.white, 'f', { soft: true });
    g.dots([[3, 3], [3, 5]], '#e0fff0'); g.spark(14, 11, '#d8fff4');
  }],
  item_blade_of_alacrity: ['nature', g => {   // curved knife, gold hilt, blade sweeping down-right
    g.line(0, 0, 4, 4, R.gold, 2, 'f'); g.paint(G.line(1, 1, 3, 3, 1), R.leather, 'f', { lv: 1, soft: true });
    g.poly([[2, 6], [6, 2], [8, 4], [4, 8]], R.dark, 'x');
    g.poly([[5, 5], [8, 3.5], [12, 6], [15, 13], [14, 15], [9, 13], [6, 9]], R.steel, 'x');
    g.paint(G.line(8, 6, 14, 13, 1), R.white, 'f', { lv: 0 }); g.dots([[7, 8], [9, 11], [11, 13]], '#7586a2');
    g.dots([[13, 2], [14, 4], [3, 12]], '#c8fff0');
  }],
  item_staff_of_wizardry: ['night', g => {   // blue orb in a wooden claw
    g.line(14, 15, 8, 9, R.wood, 2, 'h'); g.dot(12, 12, '#46280f');
    g.halo(6, 6, 7, '#5cb4ff');
    g.paint(G.arc(6, 6, 4.4, 6.2, 0.4, 5.6), R.wood, 'g');
    g.ell(6, 6, 3.6, 3.6, R.blue, 'g'); g.paint(G.ell(7, 7, 2, 2), R.cyan, 'f', { lv: 1, soft: true });
    g.dots([[4, 4], [5, 4], [4, 5]], W); g.poly([[1, 3], [3, 0.5], [3, 3.5]], R.wood, 'x');
  }],
  item_boots: ['item', g => boot(g, R.leather, R.bone)],
  item_gloves: ['nature', g => {   // green gauntlet with brown swirls
    g.poly([[0, 5], [2, 3], [4, 4], [5, 2], [7, 4], [8, 3], [14, 8], [14, 14], [9, 13], [3, 9], [0, 8]], R.green, 'x');
    g.poly([[0, 5], [2, 3], [4, 4], [5, 2], [7, 4], [4, 6], [1, 7]], R.leather, 'x');
    g.rect(13, 8, 15, 15, R.leather, 'v'); g.paint(G.line(12, 9, 12, 13, 1), R.leather, 'f', { lv: 3 });
    g.dots([[6, 7], [7, 7], [8, 8], [9, 9], [9, 10], [8, 11], [10, 11], [11, 10]], '#76421f');
  }],
  item_ring_of_regen: ['blood', g => { ringShape(g, R.gold, R.red); }],
  item_sobi_mask: ['arcane', g => {   // purple-capped white mask
    g.poly([[1, 1], [8, 0], [14, 1], [13, 7], [2, 7]], R.blue, 'x');
    g.poly([[0, 3], [3, 2], [3, 6], [1, 6]], R.purple, 'x'); g.poly([[15, 3], [12, 2], [12, 6], [14, 6]], R.purple, 'x');
    g.poly([[2, 7], [13, 7], [12, 10], [8, 15], [7, 15], [3, 10]], R.white, 'x');
    g.poly([[3, 7], [7, 8], [6, 10], [3, 9]], R.dark, 'f', { lv: 3 }); g.poly([[12, 7], [8, 8], [9, 10], [12, 9]], R.dark, 'f', { lv: 3 });
    g.dots([[4, 11], [11, 11], [7, 12], [8, 12]], '#6c40b8'); g.dots([[5, 2], [6, 2]], '#b4ceff');
  }],
  item_belt_of_strength: ['item', g => {   // fur-rimmed belt, red buckle, spikes
    g.ell(7.5, 8, 7.4, 6, FUR, 'g');
    g.paint(G.ell(7.5, 6.8, 5.4, 3.6), R.brown, 'f', { lv: 3 }); g.paint(G.ell(7.5, 6, 3.6, 1.8), R.brown, 'f', { lv: 2, soft: true });
    g.rect(3.5, 9, 11.5, 14, R.steel, 'e'); g.rect(5, 10.4, 10, 12.6, R.red, 'f', { lv: 1 }); g.dots([[7, 11], [8, 11]], '#ffa898'); g.dots([[6, 12], [9, 12]], '#a42222');
    g.poly([[0, 9], [3, 8], [2, 12]], R.white, 'x'); g.poly([[15, 9], [12, 8], [13, 12]], R.white, 'x');
  }],
  item_boots_of_elves: ['teal', g => {   // green leaf plate with etched pattern
    g.poly([[0, 14], [2, 8], [7, 3], [13, 0.5], [15, 2], [14, 8], [10, 12], [5, 15]], LEAF, 'g');
    g.paint(G.line(2, 13, 12, 3, 1), LEAF, 'f', { lv: 3 });
    g.paint(G.or(G.line(5, 11, 8, 11, 1), G.line(7, 9, 10, 9, 1), G.line(9, 7, 12, 7, 1), G.line(6, 8, 6, 6, 1), G.line(9, 5, 9, 3, 1)), R.teal, 'f', { lv: 0 });
    g.dots([[13, 3], [12, 4]], '#ffffff');
  }],
  item_robe: ['nature', g => {   // teal robe, gold trim, flared collar
    g.poly([[4, 1], [8, 4], [12, 1], [15, 4], [13.5, 8], [14, 15], [2, 15], [1.5, 8], [0, 4]], AQUA, 'x');
    g.poly([[4, 1], [8, 4], [12, 1], [10.5, 5], [7.5, 6.5], [5.5, 5]], R.dark, 'f', { lv: 3 });
    g.rect(5, 7, 10, 12, R.gold, 'e'); g.dots([[6, 9], [8, 8], [9, 10], [7, 11]], '#c48a1c');
    g.paint(G.line(1, 4, 4, 1, 1), R.gold, 'f', { lv: 1 }); g.paint(G.line(14, 4, 11, 1, 1), R.gold, 'f', { lv: 1 });
    g.paint(G.line(4, 13, 11, 13, 1), R.gold, 'f', { lv: 2 });
  }],
  item_magic_stick: ['night', g => {   // curved brown stick, blue wrap, green glow tip
    g.halo(12, 3, 6, '#58ff98');
    g.line(2, 14, 4, 11, R.wood, 2, 'h'); g.line(4, 11, 8, 7, R.wood, 2, 'h'); g.line(8, 7, 11, 4, R.wood, 2, 'h');
    g.paint(G.or(G.line(2, 13, 4, 12, 2), G.line(4, 10, 6, 9, 2)), R.blue, 'f', { lv: 1 });
    g.line(11, 4, 14, 1, R.green, 2, 'f'); g.paint(G.line(12, 3, 14, 1, 1), R.yellow, 'f', { lv: 0 });
    g.dots([[10, 1], [14, 5]], '#b8ffd0');
  }],
  item_magic_wand: ['night', g => {   // diagonal wand, teal gem pommel, green-white glow
    g.halo(3, 3, 8, '#78ffc0');
    g.line(13, 13, 5, 5, R.wood, 2, 'h'); g.paint(G.or(G.line(9, 9, 11, 11, 2)), R.dark, 'f', { lv: 2 });
    g.dots([[8, 8], [9, 8], [10, 10], [11, 10]], '#d8a050');
    g.ell(14, 13.5, 1.6, 1.6, R.teal, 'g'); g.dot(14, 13, W);
    g.line(4, 4, 2, 2, R.gold, 2, 'f');
    g.spark(2, 2, '#e8fff0', true); g.dots([[5, 1], [1, 5], [4, 6]], '#bffff0');
  }],
  item_bracer: ['gold', g => {   // gold-and-red round bracer
    g.ell(7.5, 8, 7, 6.6, R.gold, 'g');
    g.paint(G.ell(10, 11.5, 3.6, 2.6), R.dark, 'f', { lv: 3 });
    g.paint(G.poly([[1, 6], [5, 2], [11, 3], [14, 7], [10, 7], [7, 5], [4, 8]]), R.red, 'x');
    g.ell(4.5, 9, 1.4, 1.4, R.gold, 'g'); g.ell(9.5, 4.5, 1.3, 1.3, R.gold, 'g'); g.dot(3, 4, '#fff4a8');
  }],
  item_wraith_band: ['night', g => {   // green leaf tiara, red gem
    sym(g, [[0, 3], [3, 1], [5, 5], [7.5, 8], [7.5, 12], [4, 10], [1, 6]], LEAF);
    sym(g, [[0, 3], [1, 0], [3, 1]], LEAF);
    g.paint(G.rect(6, 7, 9, 12), R.green, 'x');
    g.ell(7.5, 5, 1.8, 1.8, R.red, 'g'); g.dot(7, 4, W);
    g.dots([[3, 5], [12, 5]], '#e4ff90');
  }],
  item_null_talisman: ['arcane', g => {   // purple gem pendant on a chain
    for (const [x, y] of [[7, 0], [9, 1], [11, 0], [13, 1]]) g.paint(G.rect(x, y, x + 1.5, y + 1), R.steel, 'e');
    g.poly([[2, 5], [10, 3], [14, 9], [11, 15], [4, 14]], R.white, 'x');
    g.poly([[2, 11], [14, 9], [11, 15], [4, 14]], R.blue, 'x');
    g.poly([[5, 6], [9.5, 5], [12, 8.5], [8, 12], [5, 10.5]], R.magenta, 'g');
    g.poly([[6, 7], [9, 6.4], [10, 8], [7, 9]], R.magenta, 'f', { lv: 0 }); g.dot(6, 7, W);
  }],
  item_phase_boots: ['night', g => {   // purple boot with strap, blue wing behind
    g.halo(8, 8, 8, '#7a6cff');
    g.poly([[0, 3], [5, 0], [7, 3], [3, 8], [0, 9]], R.blue, 'x'); g.poly([[0, 8], [3, 6], [4, 10], [0, 12]], R.cyan, 'x');
    boot(g, R.purple, R.magenta, { sole: R.dark });
    g.paint(G.rect(2.5, 8, 8, 9.2), R.steel, 'e'); g.dot(5, 8, '#ffffff');
  }],
  item_power_treads: ['item', g => {   // brown fur-topped boot with straps
    boot(g, R.brown, FUR, { sole: R.dark });
    g.paint(G.rect(2.5, 5, 8, 5.8), R.bone, 'f', { lv: 1 }); g.paint(G.rect(2.5, 8, 8, 8.8), R.bone, 'f', { lv: 1 });
    g.paint(G.line(9, 10, 13, 12, 1), R.bone, 'f', { lv: 1 }); g.dots([[3, 1], [5, 1], [7, 1], [4, 0], [6, 0]], '#f0d890');
  }],
  item_lesser_crit: ['blood', g => {   // red glowing blade, dark spiked guard
    g.halo(5, 5, 8, '#ff3a30');
    g.paint(G.line(2, 2, 9, 9, 3), R.red, 'h'); g.poly([[0, 0], [3, 1], [1, 3]], R.red, 'x');
    g.paint(G.line(3, 3, 9, 9, 1), R.red, 'f', { lv: 0, soft: true }); g.dots([[2, 2], [3, 3]], W);
    g.poly(star(11, 11, 4.2, 1.8, 4, 0.8), IRONB, 'x');
    g.line(12, 12, 14, 14, R.dark, 2, 'f'); g.dots([[13, 13]], R.steel[1]);
  }],
  item_black_king_bar: ['night', g => {   // gold ornate head with red eye, dark bar
    g.poly([[4, 6], [8, 3], [15, 11], [15, 15], [11, 15], [3, 9]], R.dark, 'x');
    g.paint(G.or(G.line(7, 8, 11, 12, 1), G.line(5, 10, 9, 14, 1), G.line(9, 6, 13, 10, 1)), R.gold, 'f', { lv: 2, soft: true });
    g.poly([[0, 7], [2, 3], [6, 0.5], [9, 2], [10, 4], [8, 8], [4, 10], [1, 11]], R.gold, 'x');
    g.poly([[3, 4], [7, 2], [6, 5]], R.gold, 'f', { lv: 0 });
    g.ell(4.5, 6.5, 1.6, 1.6, R.red, 'g'); g.dot(4, 6, W); g.spark(13, 3, '#ffe48a');
  }],
  item_ward_observer: ['nature', g => ward(g, OLIVE, R.orange, '#c8e040')],
  item_ward_sentry: ['bolt', g => ward(g, AQUA, R.green, '#38aef0')],
  item_aegis: ['fire', g => {   // glowing orange bloom in dark petals
    g.halo(7.5, 7.5, 8.5, '#ff9a30');
    g.poly(star(7.5, 7.5, 7.6, 3.4, 8, 0.2), IRONB, 'x');
    g.poly(star(7.5, 7.5, 5.4, 2.6, 8, 0.2 + Math.PI / 8), R.fire, 'g');
    g.ell(7.5, 7.5, 2.4, 2.4, R.yellow, 'g'); g.dots([[7, 7], [8, 7]], W);
  }],
  item_recipe: ['item', g => {   // torn parchment with a rune
    g.poly([[1, 1], [12, 1], [14, 3], [14, 11], [13, 14], [2, 15], [1, 9]], R.bone, 'x');
    g.paint(G.line(2, 14, 13, 14, 1), R.bone, 'f', { lv: 2 });
    g.soft(G.or(G.ring(7.5, 7.5, 3.4, 4.4)), '#8c5c34'); g.soft(G.rect(7, 6, 8, 9), '#8c5c34'); g.soft(G.pts([[7, 4], [8, 4], [7, 11], [8, 11]]), '#8c5c34');
    g.dots([[3, 3], [4, 3], [10, 3], [11, 3], [3, 12], [4, 12], [11, 12]], '#b27a40');
  }],
  // ---------------------------------------------------------------- misc UI
  gold: ['item', g => {
    g.halo(9, 8, 9, '#ffc840');
    // stack of coins on the left (dark seams between them), one big coin standing in front
    for (const cy of [13, 10.5, 8]) { g.rect(0.5, cy, 8.5, cy + 1.6, R.gold, 'v'); g.ell(4.5, cy, 4, 1.6, R.gold, 'g'); }
    g.soft(G.or(G.line(1, 12, 8, 12, 1), G.line(1, 9.6, 8, 9.6, 1)), '#7a4a0e');
    g.soft(G.ring(10.5, 8.5, 5.6, 6.6), '#06060c');
    g.ell(10.5, 8.5, 5.4, 5.4, R.gold, 'g');
    g.paint(G.ring(10.5, 8.5, 3.2, 4.2), R.gold, 'f', { lv: 2, soft: true });
    g.paint(G.rect(10, 6, 11, 11), R.gold, 'f', { lv: 3, soft: true });
    g.soft(G.pts([[8, 4], [9, 4], [7, 5], [7, 6]]), '#ffffff');
    g.spark(14, 1, '#fff4a8');
  }],
  lock: ['night', g => {
    g.paint(G.sub(G.ring(7.5, 6, 2.6, 4.6), G.rect(0, 6.5, 15, 15)), R.steel, 'e');
    g.rect(3, 7, 12, 14, R.gold, 'e'); g.ell(7.5, 10, 1.3, 1.3, R.dark, 'f'); g.rect(7, 10, 8, 12, R.dark, 'f', { lv: 3 });
  }],
  empty: ['night', g => {
    g.outline = false;
    g.soft(G.sub(G.poly([[7.5, 3], [12, 7.5], [7.5, 12], [3, 7.5]]), G.poly([[7.5, 4.5], [10.5, 7.5], [7.5, 10.5], [4.5, 7.5]])), '#4a5070');
    g.soft(G.pts([[7, 7], [8, 7], [7, 8], [8, 8]]), '#2c3048');
  }],
  attr_str: ['blood', g => hexBadge(g, R.red, g => { g.rect(4, 5, 11, 10, R.white, 'x'); g.rect(1.8, 6.5, 3.6, 9, R.white, 'x'); g.rect(12.4, 6.5, 14.2, 9, R.white, 'x'); g.dots([[6, 7], [8, 7], [9, 7]], '#a42222'); g.dot(5, 5, W); })],
  attr_agi: ['nature', g => hexBadge(g, R.green, g => { g.poly([[7.5, 2], [13, 8.5], [10, 8.5], [10, 13], [5, 13], [5, 8.5], [2, 8.5]], R.white, 'x'); })],
  attr_int: ['ice', g => hexBadge(g, R.blue, g => { g.poly([[7.5, 1], [9.2, 6], [14.5, 7.5], [9.2, 9], [7.5, 14], [5.8, 9], [0.5, 7.5], [5.8, 6]], R.white, 'x'); })],
  attr_all: ['arcane', g => hexBadge(g, R.purple, g => {
    g.poly([[7.5, 7.5], [7.5, 1.5], [14, 12]], R.red, 'f', { lv: 1 }); g.poly([[7.5, 7.5], [14, 12], [1, 12]], R.blue, 'f', { lv: 1 }); g.poly([[7.5, 7.5], [1, 12], [7.5, 1.5]], R.green, 'f', { lv: 1 });
    g.dots([[7, 7], [8, 7], [7, 8], [8, 8], [7, 6], [8, 6]], W);
  })],
  skillpoint: ['gold', g => {
    g.halo(7.5, 7.5, 8, '#ffe070');
    g.poly([[7.5, 0.5], [9.2, 6], [15, 7.5], [9.2, 9], [7.5, 15], [5.8, 9], [0, 7.5], [5.8, 6]], R.gold, 'g');
    g.dots([[7, 5], [7, 6], [6, 6]], W); g.spark(7.5, 7.5, '#ffffff');
  }],
};

function hexBadge(g, ramp, inner) {
  const hex = [[4, 0.5], [11, 0.5], [15, 7.5], [11, 14.5], [4, 14.5], [0, 7.5]];
  g.poly(hex, ramp, 'g');
  g.paint(G.sub(G.poly(hex), G.poly([[4.6, 2], [10.4, 2], [13.4, 7.5], [10.4, 13], [4.6, 13], [1.6, 7.5]])), ramp, 'f', { lv: 3, soft: true });
  inner(g);
}
