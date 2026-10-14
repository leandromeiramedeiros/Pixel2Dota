// Glyph drawings for hero abilities + Invoker invoked spells. Each entry: key -> [theme, draw(g)]
import { Glyph as G, R } from './kit.mjs';

const pol = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
const W = '#ffffff';

export const ABILITIES = {
  // ---------------------------------------------------------------- Sven
  sven_storm_bolt: ['bolt', g => {
    g.halo(8, 6, 8, '#6ab4ff');
    g.zig([[1, 1], [4, 4], [2, 6], [5, 9]], R.cyan, W, 1);
    g.line(8, 9, 2, 14, R.wood, 2, 'h');
    g.poly([[9, 0.5], [14.6, 6], [11, 9.6], [5.4, 4]], R.steel, 'e');
    g.poly([[9, 2], [12.5, 5.5], [11, 7], [7.5, 3.8]], R.white, 'f');
    g.zig([[13, 9], [11, 11], [13, 12], [11, 15]], R.cyan, W, 1);
    g.spark(14, 2, '#bfe4ff');
  }],
  sven_great_cleave: ['phys', g => {
    g.paint(G.arc(8, 9, 5.2, 7.2, -2.7, -0.2), R.white, 'f', { lv: 0 });
    g.paint(G.line(3, 13, 12, 4, 3), R.steel, 'h');
    g.poly([[11, 2], [14, 5], [12.5, 6.5], [9.5, 3.5]], R.white, 'e');
    g.line(2, 9, 7, 14, R.gold, 2, 'f');
    g.line(1, 14, 3, 12, R.leather, 2, 'f');
    g.spark(14, 11, '#ff8a6a');
  }],
  sven_warcry: ['blood', g => {
    g.halo(7.5, 7, 8, '#ff6a40');
    g.poly([[3, 2], [12, 2], [12, 8], [7.5, 14], [3, 8]], R.steel, 'e');
    g.poly([[4, 3], [11, 3], [11, 7.5], [7.5, 12], [4, 7.5]], R.red, 'e');
    g.poly([[7.5, 4], [10, 7], [7.5, 9], [5, 7]], R.gold, 'e');
    g.paint(G.arc(7.5, 7.5, 6.5, 7.2, -0.6, 0.6), R.yellow, 'f', { soft: true });
    g.paint(G.arc(7.5, 7.5, 6.5, 7.2, Math.PI - 0.6, Math.PI + 0.6), R.yellow, 'f', { soft: true });
  }],
  sven_gods_strength: ['blood', g => {
    g.halo(7.5, 7, 9, '#ff3a20');
    g.paint(G.flameMask(3, 14, 2, 9, -1), R.fire, 'g'); g.paint(G.flameMask(12, 14, 2, 9, 1), R.fire, 'g');
    g.poly([[6, 1], [9, 1], [9.5, 3], [9.5, 9], [6, 9], [6, 3]], R.steel, 'h');
    g.poly([[6.5, 0], [8.5, 0], [9, 1.5], [6, 1.5]], R.white, 'f');
    g.rect(3, 9, 12, 10, R.gold, 'e'); g.rect(6, 11, 9, 14, R.leather, 'h'); g.rect(6, 14, 9, 14, R.gold, 'f');
    g.spark(2, 3, '#ffb070'); g.spark(13, 4, '#ffb070');
  }],
  // ---------------------------------------------------------------- Lina
  lina_dragon_slave: ['fire', g => {
    g.halo(8, 8, 9, '#ff7a30');
    g.poly([[1, 3], [6, 3], [10, 5], [15, 8], [10, 11], [6, 13], [1, 13], [4, 8]], R.fire, 'g');
    g.poly([[3, 5], [6, 5], [9, 6.5], [12, 8], [9, 9.5], [6, 11], [3, 11], [5, 8]], R.orange, 'g');
    g.poly([[6, 7], [9, 7.2], [11, 8], [9, 8.8], [6, 9], [7.5, 8]], R.yellow, 'f', { lv: 0 });
  }],
  lina_light_strike_array: ['fire', g => {
    g.halo(7.5, 6, 8, '#ffb040');
    g.paint(G.sub(G.ell(7.5, 12, 7, 3), G.ell(7.5, 12, 5, 1.6)), R.orange, 'e');
    g.paint(G.flameMask(7.5, 12, 4, 11), R.orange, 'g');
    g.paint(G.flameMask(7.5, 12, 2.4, 9), R.yellow, 'g');
    g.paint(G.rect(7, 4, 8, 12), R.white, 'f', { lv: 0, soft: true });
    g.spark(3, 4, '#ffe9a0'); g.spark(12, 5, '#ffe9a0');
  }],
  lina_fiery_soul: ['fire', g => {
    g.halo(7.5, 8, 8, '#ff6a30');
    g.paint(G.flameMask(7.5, 14, 5.5, 14, 1), R.fire, 'g');
    g.paint(G.flameMask(7.5, 13, 3.6, 9, 1), R.orange, 'g');
    g.ell(7.5, 10, 2.6, 2.4, R.yellow, 'g');
    g.dot(6, 9, '#7a1408'); g.dot(9, 9, '#7a1408'); g.dot(7, 11, '#ff8a2a'); g.dot(8, 11, '#ff8a2a');
    g.spark(2, 6, '#ffd070'); g.spark(13, 3, '#ffd070');
  }],
  lina_laguna_blade: ['bolt', g => {
    g.halo(8, 7, 9, '#7ab4ff');
    g.zig([[14, 1], [10, 5], [12, 6], [7, 10], [9, 11], [3, 15]], R.yellow, W, 2);
    g.paint(G.line(2, 13, 11, 4, 2), R.steel, 'h');
    g.poly([[11, 2], [14, 1], [13, 4], [11, 5]], R.white, 'e');
    g.line(1, 9, 6, 14, R.gold, 2, 'f');
    g.spark(3, 3, '#cfe4ff'); g.spark(13, 12, '#cfe4ff');
  }],
  // ---------------------------------------------------------------- Lion
  lion_impale: ['gold', g => {
    g.rect(0, 13, 15, 15, R.brown, 'v');
    g.poly([[1, 14], [3, 7], [6, 14]], R.bone, 'e');
    g.poly([[4.5, 14], [8, 0.5], [11.5, 14]], R.bone, 'e');
    g.poly([[10, 14], [12.5, 5], [15, 14]], R.bone, 'e');
    g.dots([[3, 13], [6, 13], [9, 13], [12, 13], [14, 13]], '#6e4a28');
    g.spark(13, 3, '#ffe8b0');
  }],
  lion_voodoo: ['nature', g => {
    g.ell(7.5, 10, 6.4, 4.2, R.green, 'g');
    g.ell(4, 5.5, 2.4, 2.4, R.green, 'g'); g.ell(11, 5.5, 2.4, 2.4, R.green, 'g');
    g.dot(4, 5, W); g.dot(11, 5, W); g.dot(4, 6, '#101810'); g.dot(11, 6, '#101810'); g.dot(5, 5, W); g.dot(10, 5, W);
    g.paint(G.line(4, 11, 11, 11, 1), R.green, 'f', { lv: 3, soft: true });
    g.soft(G.line(5, 9, 10, 9, 1), '#c8ff90');
    g.rect(2, 13, 5, 14, R.green, 'e'); g.rect(10, 13, 13, 14, R.green, 'e');
    g.spark(13, 2, '#e468ff'); g.spark(2, 2, '#ffd6ff');
  }],
  lion_mana_drain: ['ice', g => {
    g.halo(7.5, 7.5, 7, '#7ae0ff');
    let prev = null;
    for (let i = 0; i <= 40; i++) { const t = i / 40, a = t * 4 * Math.PI + 0.5, r = 7.2 * (1 - t) + 1; const p = [7.5 + r * Math.cos(a), 7.5 + r * Math.sin(a)];
      if (prev) g.paint(G.line(prev[0], prev[1], p[0], p[1], 1), t < 0.5 ? R.blue : t < 0.8 ? R.cyan : R.white, 'f', { lv: t < 0.5 ? 1 : t < 0.8 ? 1 : 0 }); prev = p; }
    g.ell(7.5, 7.5, 2.2, 2.2, R.white, 'g');
    g.dots([[14, 3], [1, 12], [13, 13], [2, 2]], '#d8f8ff');
  }],
  lion_finger_of_death: ['wex', g => {
    g.halo(7.5, 7, 9, '#e468ff');
    g.zig([[7, 3], [11, 1], [10, 3], [14, 1]], R.magenta, W, 1); g.zig([[7, 3], [4, 1], [5, 3], [1, 2]], R.magenta, W, 1);
    g.rect(5, 8, 12, 14, R.skin, 'x'); g.rect(6, 3, 8, 9, R.skin, 'x'); g.rect(10, 6, 12, 9, R.skin, 'x'); g.rect(8.5, 7, 9.5, 9, R.skin, 'x');
    g.rect(2.5, 9, 5, 11.5, R.skin, 'x');
    g.dots([[6, 4]], '#ffffff'); g.dots([[9, 11], [10, 11], [7, 11]], R.skin[3]); g.rect(5, 14, 12, 15, R.purple, 'e');
  }],
  // ---------------------------------------------------------------- Crystal Maiden
  crystal_maiden_crystal_nova: ['ice', g => {
    g.halo(7.5, 7.5, 9, '#9aeaff');
    g.paint(G.or(G.line(7, 0, 8, 15, 2)), R.ice, 'h'); g.paint(G.line(0, 7, 15, 8, 2), R.ice, 'h');
    g.paint(G.or(G.line(2, 2, 13, 13, 2), G.line(13, 2, 2, 13, 2)), R.cyan, 'h');
    g.ell(7.5, 7.5, 3.4, 3.4, R.ice, 'g');
    g.dots([[7, 7], [8, 7], [7, 8]], W);
    g.dots([[3, 7], [12, 8], [8, 3], [7, 12]], '#4a9ad8');
  }],
  crystal_maiden_frostbite: ['ice', g => {
    g.poly([[7, 0], [10, 5], [9.5, 14], [5.5, 14], [5, 5]], R.ice, 'e');
    g.poly([[2, 5], [5, 8], [4.5, 14], [1, 13]], R.cyan, 'e');
    g.poly([[13, 5], [14.5, 12], [11, 14], [10.5, 8]], R.cyan, 'e');
    g.paint(G.line(7, 2, 7, 11, 1), R.white, 'f', { lv: 0, soft: true });
    g.dots([[3, 7], [12, 8]], W); g.spark(13, 2, '#cdf2ff'); g.spark(2, 2, '#cdf2ff');
    g.rect(0, 14, 15, 15, R.ice, 'v');
  }],
  crystal_maiden_brilliance_aura: ['teal', g => {
    g.halo(7.5, 7.5, 9, '#5ce0ff');
    g.paint(G.ring(7.5, 7.5, 5.3, 6.6), R.cyan, 'f', { lv: 1, soft: true });
    g.poly([[7.5, 2], [11.5, 7.5], [7.5, 13], [3.5, 7.5]], R.blue, 'e');
    g.poly([[7.5, 3.5], [10, 7.5], [7.5, 8], [5, 7.5]], R.cyan, 'f', { lv: 0 });
    g.poly([[7.5, 8], [10, 7.5], [7.5, 11.5], [5, 7.5]], R.blue, 'f', { lv: 1 });
    g.spark(2, 2, '#bff4ff'); g.spark(13, 3, '#bff4ff'); g.spark(13, 13, '#bff4ff'); g.spark(2, 12, '#bff4ff');
  }],
  crystal_maiden_freezing_field: ['ice', g => {
    g.halo(7.5, 7.5, 9, '#9aeaff');
    g.paint(G.ring(7.5, 7.5, 6, 7.2), R.cyan, 'f', { lv: 1 });
    g.paint(G.or(G.line(7, 3, 8, 12, 2), G.line(3, 7, 12, 8, 2)), R.ice, 'h');
    g.paint(G.or(G.line(4, 4, 11, 11, 1), G.line(11, 4, 4, 11, 1)), R.ice, 'f', { lv: 0 });
    g.ell(7.5, 7.5, 1.8, 1.8, R.white, 'f');
    g.dots([[1, 3], [14, 12], [3, 14], [13, 2]], W);
  }],
  // ---------------------------------------------------------------- Axe
  axe_berserkers_call: ['blood', g => {
    g.halo(7.5, 7.5, 9, '#ff5a40');
    g.rect(7, 3, 8, 14, R.wood, 'h');
    g.poly([[7, 2], [3, 2], [1, 7], [3, 11], [7, 9]], R.steel, 'e');
    g.poly([[8, 2], [12, 2], [14, 7], [12, 11], [8, 9]], R.steel, 'e');
    g.poly([[6, 4], [4, 4.5], [3, 7], [4, 9], [6, 8]], R.red, 'f', { lv: 2 });
    g.poly([[9, 4], [11, 4.5], [12, 7], [11, 9], [9, 8]], R.red, 'f', { lv: 2 });
    g.spark(1, 1, '#ff9a8a'); g.spark(14, 1, '#ff9a8a');
  }],
  axe_battle_hunger: ['blood', g => {
    g.ell(6, 7.5, 5.2, 4.8, R.blood, 'g');
    g.paint(G.line(9, 10, 13, 13, 2), R.bone, 'e');
    g.ell(14, 13, 1.5, 1.5, R.bone, 'g'); g.ell(12, 14.4, 1.3, 1, R.bone, 'g');
    g.soft(G.line(3, 5, 6, 3, 1), '#ffb0a0'); g.dot(4, 8, '#ffb0a0');
    g.dot(8, 9, '#430a10'); g.dot(5, 10, '#430a10');
    g.spark(13, 3, '#ff8a6a');
  }],
  axe_counter_helix: ['blood', g => {
    g.halo(7.5, 7.5, 8, '#ff5a40');
    g.paint(G.arc(7.5, 7.5, 4.6, 6.4, 0.3, 3.2), R.white, 'f', { lv: 1 });
    g.paint(G.arc(7.5, 7.5, 4.6, 6.4, 3.45, 6.35), R.steel, 'f', { lv: 1 });
    g.poly([[13, 9], [15, 12], [11.5, 11.5]], R.red, 'f', { lv: 1 });
    g.poly([[2, 6], [0.5, 3], [4, 3.6]], R.red, 'f', { lv: 1 });
    g.poly([[6, 5], [9, 5], [10, 8], [9, 10.5], [6, 10.5], [5, 8]], R.steel, 'x');
    g.poly([[6.5, 7], [9, 7], [9, 9], [6.5, 9]], R.red, 'f', { lv: 1 });
  }],
  axe_culling_blade: ['blood', g => {
    g.paint(G.line(3, 14, 10, 6, 2), R.wood, 'h');
    g.poly([[7, 2], [13, 0.5], [15, 5], [14, 9], [11, 8], [9, 6.5], [8, 5]], R.steel, 'e');
    g.poly([[9, 3], [12.5, 2], [13.5, 5], [11, 5.5]], R.white, 'f', { lv: 0 });
    g.zig([[0, 2], [4, 6], [3, 7], [8, 11]], R.red, '#ffd0c0', 1);
    g.dots([[11, 12], [13, 14], [1, 10]], '#e84a3c');
  }],
  // ---------------------------------------------------------------- Sniper
  sniper_shrapnel: ['exort', g => {
    g.halo(7.5, 8, 8, '#ffb040');
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + 0.2; const [x, y] = pol(7.5, 8, 6.2, a); g.paint(G.line(7.5, 8, x, y, 1), R.steel, 'f', { lv: i % 2 ? 1 : 2 }); }
    g.paint(G.flameMask(7.5, 11, 3.6, 8), R.fire, 'g'); g.ell(7.5, 8, 2, 2, R.yellow, 'g');
    for (let i = 0; i < 4; i++) { const [x, y] = pol(7.5, 8, 6.4, i * Math.PI / 2 + 0.2 + Math.PI / 4); g.paint(G.rect(x - 1, y - 1, x, y), R.steel, 'e'); }
  }],
  sniper_headshot: ['blood', g => {
    g.ell(7.5, 6.8, 4.6, 4.4, R.bone, 'g'); g.rect(5, 10, 10, 12, R.bone, 'e');
    g.rect(5, 6, 6, 8, R.dark, 'f'); g.rect(9, 6, 10, 8, R.dark, 'f'); g.dot(7, 9, '#3c3c52');
    g.paint(G.ring(7.5, 7.5, 6, 7.2), R.red, 'f', { lv: 1, soft: true });
    g.soft(G.or(G.line(7, 0, 8, 2, 1), G.line(7, 13, 8, 15, 1), G.line(0, 7, 2, 8, 1), G.line(13, 7, 15, 8, 1)), '#ff4a3a');
    g.dot(7, 3, '#ff4a3a'); g.dot(8, 3, '#ff4a3a');
  }],
  sniper_take_aim: ['night', g => {
    g.ell(7.5, 7.5, 7, 7, R.iron, 'g');
    g.paint(G.ell(7.5, 7.5, 5, 5), R.dark, 'f', { lv: 2 });
    g.soft(G.ell(7.5, 7.5, 4.6, 4.6), '#1c3a2c');
    g.soft(G.or(G.line(7, 3, 8, 12, 1), G.line(3, 7, 12, 8, 1)), '#9ad8a8');
    g.soft(G.pts([[7, 7], [8, 7], [7, 8], [8, 8]]), '#ff4a3a');
    g.soft(G.pts([[4, 4], [5, 4], [4, 5]]), '#6ea880');
  }],
  sniper_assassinate: ['blood', g => {
    g.halo(8, 8, 8, '#ff3a30');
    g.paint(G.ring(8, 8, 5, 6.4), R.red, 'f', { lv: 1 });
    g.soft(G.or(G.line(8, 0, 8, 4, 1), G.line(8, 12, 8, 15, 1), G.line(0, 8, 4, 8, 1), G.line(12, 8, 15, 8, 1)), '#ffd0c0');
    g.ell(8, 8, 1.8, 1.8, R.red, 'g');
    g.paint(G.line(0, 1, 6, 6, 1), R.white, 'f', { lv: 0 });
    g.paint(G.line(5, 5, 7, 7, 2), R.gold, 'f', { lv: 1 });
  }],
  // ---------------------------------------------------------------- Zeus
  zuus_arc_lightning: ['bolt', g => {
    g.halo(8, 8, 9, '#6ab4ff');
    g.zig([[2, 13], [6, 12], [4, 9.5], [8, 8], [7, 6], [8.5, 6]], R.yellow, W, 2);
    g.zig([[8, 7], [12, 7], [11, 4], [14, 2.5]], R.yellow, W, 2);
    g.ell(2.5, 13, 1.7, 1.7, R.cyan, 'g'); g.ell(8, 6.5, 2, 2, R.cyan, 'g'); g.ell(13.5, 2.5, 1.6, 1.6, R.cyan, 'g');
    g.spark(13, 11, '#bfe4ff'); g.spark(3, 3, '#bfe4ff');
  }],
  zuus_lightning_bolt: ['bolt', g => {
    g.halo(8, 9, 8, '#8abaff');
    g.ell(5, 3, 3.6, 2.4, R.dark, 'g'); g.ell(9.5, 3.4, 4, 2.6, R.dark, 'g'); g.rect(3, 3, 12, 5, R.dark, 'v');
    g.zig([[9, 5], [6, 8], [9, 9], [5, 14]], R.yellow, W, 2);
    g.spark(5, 14, '#fff6b0', true); g.dots([[11, 11], [2, 10]], '#bfe4ff');
  }],
  zuus_static_field: ['bolt', g => {
    g.halo(7.5, 7.5, 9, '#7ab4ff');
    g.ell(7.5, 7.5, 4, 4, R.blue, 'g'); g.ell(7.5, 7.5, 2, 2, R.white, 'g');
    g.zig([[0, 4], [3, 5], [2, 7]], R.yellow, W, 1); g.zig([[15, 11], [12, 10], [13, 8]], R.yellow, W, 1);
    g.zig([[11, 0], [10, 3], [12, 4]], R.yellow, W, 1); g.zig([[4, 15], [5, 12], [3, 11]], R.yellow, W, 1);
  }],
  zuus_thundergods_wrath: ['bolt', g => {
    g.halo(8, 8, 9, '#8abaff');
    g.rect(1, 1, 14, 3, R.dark, 'v'); g.ell(4, 3, 3.4, 2.4, R.dark, 'g'); g.ell(11, 3, 3.6, 2.4, R.dark, 'g'); g.ell(7.5, 2.6, 3.6, 2.4, R.steel, 'g');
    g.zig([[3, 5], [5, 8], [3, 9], [4, 14]], R.yellow, W, 2);
    g.zig([[8, 5], [10, 8], [8, 9], [9, 15]], R.yellow, W, 2);
    g.zig([[13, 5], [12, 9], [14, 10], [12, 14]], R.yellow, W, 1);
    g.spark(4, 14, '#fff6b0'); g.spark(13, 14, '#fff6b0');
  }],
  // ---------------------------------------------------------------- Drow Ranger
  drow_ranger_frost_arrows: ['ice', g => {
    g.halo(11, 4, 7, '#a0f0ff');
    g.paint(G.line(2, 14, 11, 5, 1), R.wood, 'f', { lv: 1 }); g.paint(G.line(3, 14, 12, 5, 1), R.wood, 'f', { lv: 2 });
    g.poly([[15, 0.5], [8, 2], [13, 7]], R.ice, 'e');
    g.poly([[1, 14], [0, 10.5], [4, 11.5]], R.white, 'x'); g.poly([[1, 14], [5, 15], [4.5, 11]], R.cyan, 'x'); g.poly([[4, 12], [7, 12.5], [6, 9.5]], R.white, 'x');
    g.spark(13, 11, '#cdf2ff'); g.spark(3, 3, '#cdf2ff');
  }],
  drow_ranger_wave_of_silence: ['ice', g => {
    g.paint(G.arc(1, 7.5, 3, 4.6, -1.0, 1.0), R.white, 'f', { lv: 0 });
    g.paint(G.arc(1, 7.5, 6.4, 8, -0.95, 0.95), R.cyan, 'f', { lv: 1 });
    g.paint(G.arc(1, 7.5, 9.8, 11.4, -0.9, 0.9), R.cyan, 'f', { lv: 2 });
    g.paint(G.arc(1, 7.5, 13.2, 14.8, -0.8, 0.8), R.blue, 'f', { lv: 1 });
    g.rect(0, 5, 2, 10, R.purple, 'e');
    g.soft(G.line(7, 5, 11, 10, 1), '#ff5a5a'); g.soft(G.line(11, 5, 7, 10, 1), '#ff5a5a');
  }],
  drow_ranger_multishot: ['night', g => {
    g.halo(11, 5, 8, '#7ac8ff');
    for (const [x, y] of [[13, 0.5], [15, 6.5], [7.5, 0.5]]) {
      g.paint(G.line(2, 14, x, y, 1), R.steel, 'f', { lv: 1 });
      const a = Math.atan2(y - 14, x - 2); const tip = [x + 1.8 * Math.cos(a), y + 1.8 * Math.sin(a)], bx = x - 2 * Math.cos(a), by = y - 2 * Math.sin(a);
      g.poly([tip, [bx + 2 * Math.cos(a + Math.PI / 2), by + 2 * Math.sin(a + Math.PI / 2)], [bx + 2 * Math.cos(a - Math.PI / 2), by + 2 * Math.sin(a - Math.PI / 2)]], R.ice, 'x');
    }
    g.ell(2.5, 13.5, 2, 2, R.cyan, 'g'); g.dots([[12, 13], [4, 4]], '#cdf2ff');
  }],
  drow_ranger_marksmanship: ['arcane', g => {
    g.halo(7.5, 7.5, 8, '#c090ff');
    g.paint(G.ring(7.5, 7.5, 6, 7.2), R.white, 'f', { lv: 1 });
    g.paint(G.ring(7.5, 7.5, 3.8, 5), R.purple, 'f', { lv: 0 });
    g.ell(7.5, 7.5, 2, 2, R.magenta, 'g');
    g.paint(G.line(1, 14, 7, 8, 1), R.steel, 'f', { lv: 1 });
    g.poly([[7, 7], [10, 4], [9, 9]], R.white, 'f', { lv: 0 });
    g.paint(G.line(0, 12, 2, 14, 1), R.purple, 'f', { lv: 0 });
  }],
  // ---------------------------------------------------------------- Juggernaut
  juggernaut_blade_fury: ['phys', g => {
    g.halo(7.5, 7.5, 8, '#9ab4ff');
    g.paint(G.ring(7.5, 7.5, 6, 7.2), R.steel, 'f', { lv: 2, soft: true });
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.3; g.poly([pol(7.5, 7.5, 1.5, a), pol(7.5, 7.5, 7, a + 0.55), pol(7.5, 7.5, 5, a + 0.95), pol(7.5, 7.5, 2.4, a + 1.1)], R.steel, 'x'); }
    g.ell(7.5, 7.5, 1.8, 1.8, R.gold, 'g');
  }],
  juggernaut_healing_ward: ['nature', g => {
    g.halo(7.5, 6, 8, '#7aff7a');
    g.rect(5, 6, 10, 13, R.wood, 'h'); g.rect(3, 13, 12, 14, R.brown, 'e');
    g.ell(7.5, 5.5, 3.6, 3.2, R.wood, 'g'); g.rect(3, 4, 12, 5, R.red, 'e');
    g.dot(6, 6, '#a0ff80'); g.dot(9, 6, '#a0ff80'); g.soft(G.line(6, 9, 9, 9, 1), '#1c1008');
    g.paint(G.rect(7, 0, 8, 3), R.green, 'f', { lv: 1 }); g.paint(G.rect(6, 1, 9, 2), R.green, 'f', { lv: 1 });
    g.spark(2, 8, '#bfffa0'); g.spark(13, 9, '#bfffa0');
  }],
  juggernaut_blade_dance: ['phys', g => {
    g.paint(G.line(2, 13, 12, 3, 2), R.steel, 'h'); g.paint(G.line(13, 13, 3, 3, 2), R.steel, 'h');
    g.poly([[11, 1], [14, 1], [14, 4], [12, 4]], R.white, 'e'); g.poly([[4, 1], [1, 1], [1, 4], [3, 4]], R.white, 'e');
    g.paint(G.line(1, 9, 5, 13, 2), R.gold, 'f', { lv: 1 }); g.paint(G.line(14, 9, 10, 13, 2), R.gold, 'f', { lv: 1 });
    g.spark(7.5, 8, '#ffe27a', true);
  }],
  juggernaut_omni_slash: ['blood', g => {
    g.halo(7.5, 7.5, 9, '#ff4a40');
    g.poly([[0, 2], [4, 4], [15, 12], [11, 11]], R.white, 'x');
    g.poly([[15, 3], [11, 4], [0, 12], [4, 11.5]], R.steel, 'x');
    g.poly([[7.5, 0], [8.5, 5], [7.5, 15], [6.5, 9]], R.white, 'x');
    g.spark(7.5, 7.5, '#ffd0c0'); g.spark(1, 13, '#ff6a5a'); g.spark(14, 14, '#ff6a5a');
  }],
  // ---------------------------------------------------------------- Invoker (own drawings; trainer art is reused where it reads well, see icons.mjs)
  invoker_cold_snap: ['ice', g => {
    g.halo(7.5, 7.5, 9, '#9aeaff');
    g.paint(G.or(G.line(7, 1, 8, 14, 2), G.line(1, 7, 14, 8, 2)), R.ice, 'h');
    g.paint(G.or(G.line(3, 3, 12, 12, 2), G.line(12, 3, 3, 12, 2)), R.cyan, 'h');
    g.ell(7.5, 7.5, 3, 3, R.blue, 'g'); g.ell(7.5, 7.5, 1.4, 1.4, R.white, 'f');
    g.dots([[1, 1], [14, 1], [1, 14], [14, 14]], W);
  }],
  invoker_ghost_walk: ['night', g => {
    g.halo(7.5, 7, 8, '#7a90ff');
    g.poly([[3, 14], [2, 7], [4, 2], [7.5, 1], [11, 2], [13, 7], [12, 14], [10.5, 12], [9, 14], [7.5, 12], [6, 14], [4.5, 12]], R.white, 'g');
    g.rect(4, 5, 6, 8, R.dark, 'f'); g.rect(9, 5, 11, 8, R.dark, 'f'); g.dot(5, 6, '#7ab0ff'); g.dot(10, 6, '#7ab0ff');
    g.soft(G.rect(7, 10, 8, 11), '#3c3c52');
  }],
  invoker_ice_wall: ['ice', g => {
    g.poly([[0, 14], [0, 8], [3, 3], [5, 8], [5, 14]], R.ice, 'e');
    g.poly([[4, 14], [5, 6], [8, 0.5], [11, 6], [11, 14]], R.ice, 'e');
    g.poly([[10, 14], [10, 8], [12, 4], [15, 9], [15, 14]], R.cyan, 'e');
    g.paint(G.line(8, 3, 8, 12, 1), R.white, 'f', { lv: 0, soft: true });
    g.rect(0, 14, 15, 15, R.blue, 'v'); g.spark(13, 1, '#cdf2ff');
  }],
  invoker_emp: ['wex', g => {
    g.halo(7.5, 7.5, 9, '#e468ff');
    g.paint(G.ring(7.5, 7.5, 6, 7.3), R.magenta, 'f', { lv: 1 });
    g.paint(G.ring(7.5, 7.5, 3.4, 4.6), R.magenta, 'f', { lv: 0 });
    g.ell(7.5, 7.5, 2, 2, R.white, 'g');
    g.zig([[7, 1], [5, 3]], R.magenta, W, 1); g.zig([[14, 7], [12, 9]], R.magenta, W, 1); g.zig([[8, 14], [10, 12]], R.magenta, W, 1); g.zig([[1, 8], [3, 6]], R.magenta, W, 1);
  }],
  invoker_tornado: ['wex', g => {
    g.halo(7.5, 7.5, 9, '#c080ff');
    g.rect(2, 1, 13, 2, R.magenta, 'e'); g.rect(3, 4, 12, 5, R.purple, 'e'); g.rect(4, 7, 11, 8, R.magenta, 'e'); g.rect(5, 10, 10, 11, R.purple, 'e'); g.rect(6, 13, 9, 14, R.magenta, 'e');
    g.soft(G.pts([[3, 1], [4, 1], [5, 1], [4, 4], [5, 4], [6, 7], [7, 7], [8, 10], [9, 13]]), '#ffd6ff');
  }],
  invoker_alacrity: ['exort', g => {
    g.halo(7.5, 7.5, 9, '#ffb040');
    g.poly([[1, 1], [6, 1], [11, 7.5], [6, 14], [1, 14], [6, 7.5]], R.orange, 'g');
    g.poly([[7, 1], [10, 1], [14.5, 7.5], [10, 14], [7, 14], [11, 7.5]], R.fire, 'g');
    g.spark(13, 2, '#ffe9a0');
  }],
  invoker_sun_strike: ['exort', g => {
    g.halo(7.5, 6, 8, '#ffd060');
    g.paint(G.sub(G.ell(7.5, 12.5, 7, 2.6), G.ell(7.5, 12.5, 5, 1.2)), R.orange, 'e');
    g.paint(G.rect(5, 0, 10, 12), R.orange, 'h'); g.paint(G.rect(6, 0, 9, 12), R.yellow, 'h'); g.paint(G.rect(7, 0, 8, 12), R.white, 'f', { lv: 0 });
    g.spark(2, 4, '#ffe9a0'); g.spark(13, 5, '#ffe9a0');
  }],
  invoker_forge_spirit: ['exort', g => {
    g.halo(7.5, 7, 8, '#ff9a30');
    g.ell(7.5, 8, 5.5, 5.5, R.fire, 'g');
    g.paint(G.flameMask(4, 4, 2, 4, -1), R.fire, 'g'); g.paint(G.flameMask(11, 4, 2, 4, 1), R.fire, 'g'); g.paint(G.flameMask(7.5, 3, 1.5, 3), R.orange, 'g');
    g.ell(7.5, 9, 3, 2.6, R.dark, 'f'); g.dot(6, 8, '#ffd070'); g.dot(9, 8, '#ffd070'); g.soft(G.line(6, 11, 9, 11, 1), '#ffd070');
  }],
  invoker_chaos_meteor: ['exort', g => {
    g.halo(9, 7, 9, '#ff8a30');
    g.paint(G.flameMask(4, 6, 3, 8, -2), R.fire, 'g'); g.paint(G.line(1, 1, 7, 7, 3), R.orange, 'f', { lv: 2 });
    g.ell(9.5, 9.5, 5, 5, R.brown, 'g'); g.ell(8, 8, 1.4, 1.4, R.orange, 'f'); g.dots([[11, 10], [9, 12]], '#ff8a2a'); g.dot(12, 8, '#341c0a');
    g.spark(14, 2, '#ffd070');
  }],
  invoker_deafening_blast: ['wex', g => {
    g.halo(7.5, 7.5, 9, '#e468ff');
    g.rect(0, 5, 3.5, 10, R.magenta, 'e');
    g.poly([[3, 5], [8, 1], [8, 14], [3, 10]], R.purple, 'g'); g.paint(G.line(8, 2, 8, 13, 1), R.white, 'f', { lv: 1, soft: true });
    g.paint(G.arc(8, 7.5, 3.4, 4.6, -1.0, 1.0), R.white, 'f', { lv: 1, soft: true }); g.paint(G.arc(8, 7.5, 6.2, 7.4, -0.9, 0.9), R.magenta, 'f', { lv: 0, soft: true });
  }],
  invoker_invoke: ['arcane', g => {
    g.halo(7.5, 8, 9, '#c090ff');
    g.ell(4.6, 5.6, 3.3, 3.3, R.cyan, 'g'); g.ell(10.6, 5.6, 3.3, 3.3, R.magenta, 'g'); g.ell(7.6, 11, 3.3, 3.3, R.orange, 'g');
    g.spark(7.5, 7.5, '#ffffff'); g.spark(1, 1, '#e0d0ff'); g.spark(14, 2, '#e0d0ff'); g.spark(14, 13, '#e0d0ff');
  }],
};
