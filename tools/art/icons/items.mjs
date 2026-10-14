// Glyph drawings for items + misc UI icons. Each entry: key -> [theme, draw(g)]
import { Glyph as G, R } from './kit.mjs';
const W = '#ffffff';

function boot(g, ramp, trim, o = {}) {
  g.poly([[3, 1], [8, 1], [8, 8], [12, 9], [14.5, 11.5], [14.5, 14], [2.5, 14], [2.5, 9]], ramp, 'x');
  g.rect(3, 1, 8, 2.4, trim, 'e');
  g.paint(G.rect(2.5, 13, 14.5, 14), o.sole || R.brown, 'f', { lv: 2 });
  g.dots([[4, 5], [6, 5], [4, 7], [6, 7]], ramp[3]);
  g.dot(4, 3, ramp[0]); g.dot(11, 11, ramp[0]); g.dot(12, 11, ramp[0]);
}
function glove(g, ramp, cuff) {
  g.rect(3, 6, 11, 11, ramp, 'x');
  for (const x of [3, 5.5, 8, 10.5]) g.rect(x, 2 + (x === 5.5 || x === 8 ? -1 : 0), x + 1.5, 6, ramp, 'x');
  g.rect(11, 8, 13, 9, ramp, 'x'); g.ell(1.5, 9, 1.8, 2.4, ramp, 'g');
  g.rect(2.5, 11, 11.5, 14, cuff, 'v');
  g.dots([[4, 12], [7, 12], [10, 12]], cuff[3]);
}
function ringShape(g, ramp, gem) {
  g.paint(G.sub(G.ell(7.5, 9, 5.4, 6), G.ell(7.5, 9, 3, 3.8)), ramp, 'g');
  g.ell(7.5, 3, 2, 1.8, gem, 'g'); g.dot(7, 2, W);
}
function band(g, ramp, gem, gl) {
  g.paint(G.sub(G.ell(7.5, 8, 6.2, 5.8), G.ell(7.5, 8, 3.2, 2.9)), ramp, 'g');
  g.rect(6, 1, 9, 3.4, gem, 'g'); g.dot(6, 2, W); g.dots([[2, 6], [13, 6], [2, 10], [13, 10]], gl || ramp[0]);
}
function wandTop(g, x, y) { g.spark(x, y, '#ffffff', true); }

export const ITEMS = {
  item_tango: ['nature', g => {
    g.poly([[2, 14], [2, 7], [6, 2], [13, 1], [14, 8], [10, 13], [5, 14]], R.green, 'g');
    g.paint(G.line(3, 13, 12, 3, 1), R.green, 'f', { lv: 3 });
    g.paint(G.or(G.line(6, 10, 8, 10, 1), G.line(8, 8, 10, 8, 1), G.line(5, 7, 5, 5, 1)), R.green, 'f', { lv: 3 });
    g.rect(1, 14, 3, 15, R.wood, 'e'); g.spark(13, 12, '#dcffa0');
  }],
  item_flask: ['blood', g => {
    g.rect(6, 3, 9, 6, R.bone, 'v'); g.rect(5.5, 1, 9.5, 2, R.wood, 'e');
    g.poly([[6, 5], [9, 5], [13, 9], [13, 13], [10.5, 15], [4.5, 15], [2, 13], [2, 9]], R.red, 'g');
    g.paint(G.rect(3, 11, 12, 13), R.blood, 'f', { lv: 2, soft: true });
    g.dots([[4, 8], [4, 9], [5, 7]], '#ffd0c0'); g.dot(10, 11, '#ffa898'); g.spark(13, 3, '#ffd0c0');
  }],
  item_clarity: ['ice', g => {
    g.rect(6, 3, 9, 6, R.bone, 'v'); g.rect(5.5, 1, 9.5, 2, R.wood, 'e');
    g.poly([[6, 5], [9, 5], [13, 9], [13, 13], [10.5, 15], [4.5, 15], [2, 13], [2, 9]], R.cyan, 'g');
    g.paint(G.rect(3, 11, 12, 13), R.blue, 'f', { lv: 2, soft: true });
    g.dots([[4, 8], [4, 9], [5, 7]], W); g.spark(13, 4, '#d8f8ff');
  }],
  item_faerie_fire: ['arcane', g => {
    g.halo(7.5, 8, 8, '#ffb0e0');
    g.poly([[7, 7], [1, 1], [0.5, 8], [6, 10]], R.white, 'x'); g.poly([[8, 7], [14, 1], [14.5, 8], [9, 10]], R.white, 'x');
    g.poly([[7, 9], [2, 12], [3, 14.5], [7, 11.5]], R.pink, 'x'); g.poly([[8, 9], [13, 12], [12, 14.5], [8, 11.5]], R.pink, 'x');
    g.ell(7.5, 8.5, 1.8, 2.8, R.pink, 'g'); g.ell(7.5, 5, 1.7, 1.7, R.skin, 'g');
    g.spark(2, 14, '#ffd0f0'); g.spark(14, 13, '#ffd0f0');
  }],
  item_enchanted_mango: ['exort', g => {
    g.ell(7.5, 9, 6, 5.4, R.orange, 'g');
    g.paint(G.ell(10, 11, 3.4, 3), R.fire, 'f', { lv: 2, soft: true });
    g.poly([[7, 4], [9, 1], [14, 1], [12, 4], [9, 5]], R.green, 'x');
    g.paint(G.line(7, 4, 8, 2, 1), R.wood, 'f', { lv: 2 });
    g.dots([[4, 7], [4, 8], [5, 6]], '#fff4c0'); g.spark(13, 12, '#ffe48a');
  }],
  item_tpscroll: ['ice', g => {
    g.rect(3, 3, 12, 12, R.bone, 'v');
    g.ell(7.5, 3, 5.5, 1.8, R.bone, 'g'); g.ell(7.5, 12, 5.5, 1.8, R.bone, 'g');
    g.paint(G.ring(7.5, 7.5, 2.4, 3.4), R.blue, 'f', { lv: 1, soft: true });
    g.soft(G.pts([[7, 7], [8, 7], [7, 8], [8, 8], [7, 5], [8, 10]]), '#38aef0');
    g.dot(2, 3, '#cdf2ff'); g.spark(13, 12, '#cdf2ff');
  }],
  item_branches: ['nature', g => {
    g.line(1, 13, 12, 2, R.wood, 2, 'h'); g.line(4, 14, 14, 8, R.wood, 2, 'h'); g.line(7, 14, 3, 4, R.wood, 2, 'h');
    g.dots([[2, 3], [13, 12]], '#84e04c'); g.ell(11.5, 2, 1.6, 1.3, R.green, 'g'); g.ell(3, 4, 1.5, 1.3, R.green, 'g');
  }],
  item_gauntlets: ['blood', g => { glove(g, R.leather, R.steel); g.ell(12, 3.5, 1.4, 1.4, R.red, 'g'); g.dot(12, 3, W); }],
  item_slippers: ['nature', g => {
    g.poly([[2, 5], [7, 5], [8, 8.5], [13.5, 10], [14, 13], [1.5, 13]], R.green, 'x');
    g.rect(1.5, 12.5, 14, 14, R.brown, 'f', { lv: 2 }); g.rect(2, 5, 7, 6, R.bone, 'e');
    g.paint(G.line(10, 10, 12, 10, 1), R.green, 'f', { lv: 3 }); g.dots([[4, 8], [5, 8]], R.green[0]);
    g.poly([[12, 6], [15, 4], [14, 8]], R.bone, 'x'); g.spark(13, 1, '#dcffa0');
  }],
  item_mantle: ['ice', g => {
    g.poly([[3, 3], [12, 3], [15, 13], [0, 13]], R.blue, 'x');
    g.paint(G.ell(7.5, 3.4, 4.4, 2.2), R.bone, 'g');
    g.paint(G.line(7, 5, 5, 13, 1), R.blue, 'f', { lv: 3 }); g.paint(G.line(8, 5, 10, 13, 1), R.blue, 'f', { lv: 3 });
    g.ell(7.5, 6.2, 1.5, 1.5, R.cyan, 'g'); g.dot(7, 6, W);
  }],
  item_circlet: ['gold', g => {
    g.paint(G.sub(G.ell(7.5, 9, 6.4, 4.6), G.ell(7.5, 9.8, 4.4, 2.8)), R.gold, 'g');
    g.ell(7.5, 5.2, 2, 2.2, R.cyan, 'g'); g.dot(7, 4, W);
    g.poly([[1.6, 8], [1, 5], [3.4, 7]], R.gold, 'e'); g.poly([[13.4, 8], [14, 5], [11.6, 7]], R.gold, 'e');
    g.spark(13, 2, '#fff4a8');
  }],
  item_ring_of_protection: ['item', g => { ringShape(g, R.steel, R.blue); }],
  item_quelling_blade: ['nature', g => {
    g.line(3, 14, 11, 5, R.wood, 2, 'h');
    g.poly([[8, 1], [14, 2], [14.5, 8], [11, 9], [9.5, 5]], R.steel, 'e'); g.paint(G.line(10, 2, 13, 3, 1), R.white, 'f', { lv: 0 });
    g.rect(2, 13, 4, 15, R.gold, 'e'); g.spark(2, 2, '#dcffa0');
  }],
  item_blades_of_attack: ['blood', g => {
    for (const x of [3, 9]) {
      g.poly([[x + 1.5, 0], [x + 3.4, 2], [x + 3.4, 9], [x - 0.4, 9], [x - 0.4, 2]], R.steel, 'h');
      g.rect(x - 1.4, 9.5, x + 4.4, 10.8, R.gold, 'e'); g.rect(x + 0.6, 11, x + 2.4, 14, R.leather, 'h'); g.rect(x + 0.2, 14, x + 2.8, 15, R.gold, 'f');
    }
    g.dots([[5, 3], [11, 3]], R.red[1]);
  }],
  item_broadsword: ['phys', g => {
    g.paint(G.line(3, 12, 11, 4, 3), R.steel, 'h'); g.poly([[11, 1.5], [14.5, 1], [14, 4.5], [12, 6], [10, 4]], R.white, 'x');
    g.line(1, 9, 7, 15, R.gold, 2, 'f'); g.line(0, 14, 3, 11, R.leather, 2, 'f'); g.paint(G.line(4, 10, 10, 4, 1), R.white, 'f', { lv: 0, soft: true });
  }],
  item_claymore: ['phys', g => {
    g.poly([[7.5, 0], [10, 3], [10, 10], [5, 10], [5, 3]], R.iron, 'h');
    g.paint(G.rect(7, 2, 7, 9), R.white, 'f', { lv: 0, soft: true });
    g.rect(2.5, 10, 12.5, 11.5, R.gold, 'e'); g.rect(6.5, 12, 8.5, 14, R.leather, 'h'); g.rect(5.5, 14, 9.5, 15, R.gold, 'f');
    g.dots([[3, 10], [12, 10]], '#c48a1c');
  }],
  item_chainmail: ['phys', g => {
    g.poly([[4, 1.5], [6, 1.5], [7.5, 3.5], [9, 1.5], [11, 1.5], [15, 4.5], [12.5, 7.5], [11.5, 6.5], [11.5, 14], [3.5, 14], [3.5, 6.5], [2.5, 7.5], [0, 4.5]], R.iron, 'x');
    for (let y = 4; y < 14; y++) for (let x = 3; x < 12; x++) if (((x + y) & 1) && (x > 3 && x < 12)) g.dot(x, y, (y % 4 < 2) ? '#6e7a94' : '#9aa6bc');
    g.rect(3.5, 12.5, 11.5, 14, R.steel, 'x');
  }],
  item_ogre_axe: ['blood', g => {
    g.line(3, 14, 9, 7, R.wood, 2, 'h');
    g.poly([[6, 1], [14, 0.5], [15, 8], [10, 10], [8, 6]], R.iron, 'x'); g.paint(G.line(8, 3, 12, 2, 1), R.white, 'f', { lv: 0 });
    g.dots([[11, 6], [12, 4]], '#2c3448'); g.ell(2.5, 14, 1.4, 1.4, R.red, 'g');
  }],
  item_mithril_hammer: ['phys', g => {
    g.line(3, 14, 10, 7, R.wood, 2, 'h');
    g.poly([[8, 1], [14.5, 4], [12.5, 9], [5.5, 6]], R.cyan, 'x'); g.poly([[9, 2.4], [12.5, 4], [11.4, 6], [8, 4.4]], R.white, 'f', { lv: 0 });
    g.spark(14, 12, '#d8f8ff');
  }],
  item_blade_of_alacrity: ['nature', g => {
    g.halo(8, 7, 8, '#7affc0');
    g.paint(G.line(2, 13, 12, 3, 2), R.teal, 'h'); g.poly([[11, 1.5], [14.5, 0.5], [13.5, 4], [11.5, 4.5]], R.white, 'x');
    g.line(1, 9, 6, 14, R.gold, 2, 'f'); g.paint(G.line(4, 9, 11, 3, 1), R.white, 'f', { lv: 0, soft: true });
    g.dots([[10, 11], [12, 9], [13, 12]], '#c8fff0');
  }],
  item_staff_of_wizardry: ['ice', g => {
    g.halo(11, 4, 6, '#7adfff');
    g.line(2, 14, 10, 6, R.wood, 2, 'h'); g.ell(11.5, 4, 3, 3, R.cyan, 'g');
    g.poly([[8, 1], [9, 4], [8, 6]], R.gold, 'x'); g.poly([[15, 1], [14, 4], [15, 7]], R.gold, 'x'); g.rect(8, 6, 13, 7, R.gold, 'e');
    g.dot(10, 3, W); g.spark(2, 4, '#bff4ff');
  }],
  item_boots: ['item', g => boot(g, R.leather, R.bone)],
  item_gloves: ['gold', g => { glove(g, R.orange, R.leather); g.paint(G.line(0, 3, 3, 3, 1), R.white, 'f', { lv: 1 }); g.paint(G.line(0, 6, 2, 6, 1), R.white, 'f', { lv: 1 }); }],
  item_ring_of_regen: ['nature', g => { ringShape(g, R.gold, R.green); }],
  item_sobi_mask: ['arcane', g => {
    g.poly([[2, 3], [13, 3], [12.5, 9], [7.5, 14], [2.5, 9]], R.purple, 'x');
    g.poly([[3.5, 6], [6.5, 6.5], [6, 8], [4, 8]], R.dark, 'f', { lv: 3 }); g.poly([[11.5, 6], [8.5, 6.5], [9, 8], [11, 8]], R.dark, 'f', { lv: 3 });
    g.dot(5, 7, '#7affc0'); g.dot(10, 7, '#7affc0'); g.paint(G.line(7, 9, 7, 11, 1), R.purple, 'f', { lv: 3 });
    g.ell(7.5, 4.2, 1.2, 1.2, R.cyan, 'g'); g.paint(G.line(5, 12, 10, 12, 1), R.purple, 'f', { lv: 3, soft: true });
  }],
  item_belt_of_strength: ['blood', g => {
    g.rect(0, 5, 15, 11, R.leather, 'v');
    g.dots([[2, 8], [4, 8], [11, 8], [13, 8]], R.leather[3]);
    g.rect(4.5, 3.5, 10.5, 12.5, R.gold, 'e'); g.rect(6, 5.5, 9, 10.5, R.leather, 'f', { lv: 3 }); g.ell(7.5, 8, 1.4, 1.8, R.red, 'g');
  }],
  item_boots_of_elves: ['nature', g => { boot(g, R.green, R.bone, { sole: R.leather }); g.poly([[8.5, 2], [13, 0.5], [14, 4], [9, 5]], R.white, 'x'); }],
  item_robe: ['ice', g => {
    g.poly([[5, 1], [10, 1], [14.5, 4.5], [13.5, 14.5], [1.5, 14.5], [0.5, 4.5]], R.blue, 'x');
    g.poly([[5, 1], [7.5, 6], [10, 1], [8.5, 1], [7.5, 3], [6.5, 1]], R.bone, 'x');
    g.rect(2, 9.5, 13, 10.8, R.gold, 'e'); g.paint(G.line(7, 7, 7, 14, 1), R.blue, 'f', { lv: 3 }); g.ell(7.5, 10, 1.1, 1.1, R.cyan, 'g');
  }],
  item_magic_stick: ['ice', g => {
    g.halo(11, 4, 7, '#9ae8ff');
    g.line(2, 14, 11, 5, R.wood, 2, 'h'); g.rect(1, 13, 3, 15, R.gold, 'e'); wandTop(g, 12, 3);
    g.dots([[13, 9], [4, 4]], '#bff4ff');
  }],
  item_magic_wand: ['ice', g => {
    g.halo(11, 4, 8, '#9ae8ff');
    g.line(2, 14, 10, 6, R.gold, 2, 'h'); g.paint(G.line(5, 11, 7, 9, 2), R.leather, 'f', { lv: 1 });
    g.poly([[11.5, 0.5], [13, 3], [15.5, 4], [13, 5.5], [11.5, 8.5], [10, 5.5], [7.5, 4], [10, 3]], R.cyan, 'g');
    g.dot(11, 4, W); g.dots([[3, 4], [14, 11], [8, 14]], '#bff4ff');
  }],
  item_bracer: ['blood', g => band(g, R.leather, R.red)],
  item_wraith_band: ['nature', g => band(g, R.bone, R.green, '#dcffa0')],
  item_null_talisman: ['ice', g => {
    g.paint(G.arc(7.5, 1, 5, 6.2, 0.2, 2.9), R.steel, 'f', { lv: 1 });
    g.poly([[7.5, 5], [12, 9.5], [7.5, 15], [3, 9.5]], R.blue, 'e');
    g.poly([[7.5, 6.5], [10, 9.5], [7.5, 10], [5, 9.5]], R.cyan, 'f', { lv: 0 });
    g.dot(7, 8, W); g.dot(8, 8, W); g.spark(1, 8, '#bff4ff'); g.spark(14, 6, '#bff4ff');
  }],
  item_phase_boots: ['ice', g => {
    g.halo(8, 8, 8, '#7adfff');
    boot(g, R.blue, R.steel, { sole: R.iron });
    g.poly([[8.5, 3], [13, 1], [14.5, 4.5], [9.5, 5.5]], R.white, 'x');
    g.paint(G.line(0, 6, 4, 6, 1), R.cyan, 'f', { lv: 1 }); g.paint(G.line(0, 9, 3, 9, 1), R.cyan, 'f', { lv: 2 }); g.paint(G.line(0, 3, 3, 3, 1), R.cyan, 'f', { lv: 2 });
  }],
  item_power_treads: ['phys', g => {
    boot(g, R.iron, R.steel, { sole: R.dark });
    for (const x of [2, 4.5, 7, 9.5, 12]) g.rect(x, 12.4, x + 1.2, 14.2, R.dark, 'f', { lv: 2 });
    g.dots([[4, 4], [5, 4]], '#e84a3c'); g.dots([[6, 4], [7, 4]], '#84e04c'); g.dot(4, 5, '#e84a3c'); g.dot(6, 5, '#84e04c');
  }],
  item_lesser_crit: ['blood', g => {
    g.halo(8, 7, 8, '#ff5a50');
    g.poly([[7.5, 0], [10.5, 3], [10, 10], [5, 10], [4.5, 3]], R.red, 'x');
    g.poly([[7.5, 1.5], [9, 3.5], [8.4, 9], [6.6, 9], [6, 3.5]], R.red, 'f', { lv: 0 }); g.paint(G.line(7, 2, 7, 8, 1), R.white, 'f', { lv: 0, soft: true });
    g.rect(3, 10, 12, 11.4, R.gold, 'e'); g.rect(6.5, 12, 8.5, 14, R.leather, 'h'); g.rect(5.5, 14, 9.5, 15, R.gold, 'f');
    g.spark(13, 3, '#ffd0c0');
  }],
  item_black_king_bar: ['night', g => {
    g.halo(7.5, 7.5, 9, '#ffc040');
    g.rect(5.5, 2, 9.5, 13, R.dark, 'h'); g.paint(G.rect(6, 2, 6, 13), R.steel, 'f', { lv: 2, soft: true });
    g.ell(7.5, 2, 3.4, 2, R.gold, 'g'); g.ell(7.5, 13.5, 3.4, 2, R.gold, 'g');
    g.rect(4.5, 6.4, 10.5, 8.8, R.gold, 'e'); g.ell(7.5, 7.6, 1.3, 1.3, R.red, 'g'); g.dot(7, 7, W);
    g.spark(2, 4, '#ffe48a'); g.spark(13, 11, '#ffe48a');
  }],
  item_ward_observer: ['gold', g => {   // golden eye totem on a stake
    g.line(7.5, 9, 7.5, 15, R.wood, 2, 'h'); g.rect(5, 14, 10, 15, R.brown, 'f', { lv: 2 });
    g.halo(7.5, 6, 7, '#fff0a0');
    g.ell(7.5, 6, 5.6, 4.4, R.gold, 'g');
    g.ell(7.5, 6, 3.4, 2.4, R.bone, 'g'); g.ell(7.5, 6, 1.6, 2, R.orange, 'g');
    g.dots([[7, 6], [8, 6], [7, 5], [8, 5]], '#3a1a04'); g.dot(6, 4, W);
    g.dots([[2, 3], [13, 3], [2, 9], [13, 9]], R.gold[3]);
  }],
  item_ward_sentry: ['ice', g => {   // blue true-sight eye totem
    g.line(7.5, 9, 7.5, 15, R.wood, 2, 'h'); g.rect(5, 14, 10, 15, R.brown, 'f', { lv: 2 });
    g.halo(7.5, 6, 7, '#b4ceff');
    g.ell(7.5, 6, 5.6, 4.4, R.blue, 'g');
    g.ell(7.5, 6, 3.4, 2.4, R.ice, 'g'); g.ell(7.5, 6, 1.6, 2, R.cyan, 'g');
    g.dots([[7, 6], [8, 6], [7, 5], [8, 5]], '#0c1a48'); g.dot(6, 4, W);
    g.spark(13, 12, '#d8f8ff'); g.spark(2, 1, '#d8f8ff');
  }],
  item_aegis: ['gold', g => {   // Aegis of the Immortal: gilded shield, red gem
    g.halo(7.5, 8, 8, '#ffe48a');
    g.poly([[1.5, 2], [13.5, 2], [13.5, 8], [7.5, 15], [1.5, 8]], R.gold, 'g');
    g.poly([[4, 4], [11, 4], [11, 8], [7.5, 12], [4, 8]], R.steel, 'g');
    g.paint(G.line(7.5, 4, 7.5, 12, 1), R.gold, 'f', { lv: 2 });
    g.ell(7.5, 7, 1.8, 1.8, R.red, 'g'); g.dot(7, 6, W);
    g.dots([[2, 2], [13, 2]], R.gold[0]); g.spark(13, 13, '#fff4a8');
  }],
  item_recipe: ['gold', g => {
    g.poly([[2, 2], [11, 2], [14, 5], [14, 14], [2, 14]], R.bone, 'x'); g.poly([[11, 2], [11, 5], [14, 5]], R.leather, 'x');
    g.dots([[4, 6], [5, 6], [6, 6], [7, 6], [4, 8], [5, 8], [6, 8], [4, 10], [5, 10], [6, 10], [7, 10], [8, 10], [9, 10], [4, 12], [5, 12], [6, 12]], '#8c5c34');
    g.ell(11, 11, 1.7, 1.7, R.gold, 'g');
  }],
  // ---------------------------------------------------------------- misc UI
  gold: ['gold', g => {
    for (const cy of [11.5, 8.5, 5.5]) { g.rect(2, cy, 13, cy + 2, R.gold, 'v'); g.ell(7.5, cy, 5.8, 2.4, R.gold, 'g'); g.paint(G.ell(7.5, cy, 3.4, 1.2), R.gold, 'f', { lv: 2, soft: true }); }
    g.dots([[4, 5], [5, 5]], '#fff4a8'); g.dots([[3, 8], [3, 11]], '#fff4a8'); g.spark(13, 2, '#fff4a8');
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
  attr_str: ['blood', g => hexBadge(g, R.red, g => { g.rect(4, 5, 11, 11, R.white, 'x'); g.rect(2.6, 8, 4, 10.4, R.white, 'x'); g.dots([[6, 5], [6, 6], [8, 5], [8, 6], [10, 5], [10, 6]], '#a42222'); g.dots([[5, 9], [7, 9], [9, 9]], '#aeb8cc'); })],
  attr_agi: ['nature', g => hexBadge(g, R.green, g => { g.poly([[7.5, 3.5], [11.5, 8], [9, 8], [9, 11.5], [6, 11.5], [6, 8], [3.5, 8]], R.white, 'x'); })],
  attr_int: ['ice', g => hexBadge(g, R.blue, g => { g.poly([[7.5, 2.5], [9, 6.5], [13, 7.5], [9, 8.5], [7.5, 12.5], [6, 8.5], [2, 7.5], [6, 6.5]], R.white, 'x'); })],
  attr_all: ['arcane', g => hexBadge(g, R.purple, g => {
    g.poly([[7.5, 7.5], [7.5, 1.5], [12.5, 10]], R.red, 'f', { lv: 1 }); g.poly([[7.5, 7.5], [12.5, 10], [2.5, 10]], R.blue, 'f', { lv: 1 }); g.poly([[7.5, 7.5], [2.5, 10], [7.5, 1.5]], R.green, 'f', { lv: 1 });
    g.dots([[7, 7], [8, 7], [7, 8], [8, 8]], W);
  })],
  skillpoint: ['gold', g => {
    g.halo(7.5, 7.5, 8, '#ffe070');
    g.poly([[7.5, 0.5], [9.2, 6], [15, 7.5], [9.2, 9], [7.5, 15], [5.8, 9], [0, 7.5], [5.8, 6]], R.gold, 'g');
    g.dots([[7, 5], [7, 6], [6, 6]], W); g.spark(7.5, 7.5, '#ffffff');
  }],
};

function hexBadge(g, ramp, inner) {
  g.poly([[4, 1], [11, 1], [14.5, 7.5], [11, 14], [4, 14], [0.5, 7.5]], ramp, 'g');
  g.paint(G.sub(G.poly([[4, 1], [11, 1], [14.5, 7.5], [11, 14], [4, 14], [0.5, 7.5]]), G.poly([[5, 3], [10, 3], [12.5, 7.5], [10, 12], [5, 12], [2.5, 7.5]])), ramp, 'f', { lv: 3, soft: true });
  inner(g);
}
