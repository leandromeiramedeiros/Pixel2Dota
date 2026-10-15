// Voxel ground palettes + cell hash, browser-safe: shared by the offline hero showcase (tools/art/terrain.mjs) and the in-game terrain shader
// (client/src/render/terrain.js). To add a ground, add an entry with the same keys; the showcase lists every key, the game maps presets in terrain.js.

/**
 * top:  5 colours, picked by hash noise as [shadowed, base, mid, light, highlight]; base dominates.
 * side: 3 colours for the slab sides (side[1] is the bottom layer).
 * shadow: colour the contact shadow blends towards; light: colour the ramp highlights blend towards.
 */
export const TERRAINS = {
  grass: { top: ['#2f6a40', '#3f7a3a', '#4e9244', '#5fa64c', '#6db455'], side: ['#6a4630', '#573826', '#7a5438'], shadow: '#1c1a3c', light: '#f6f0b0' },
  dirt: { top: ['#5a3c2a', '#6e4a32', '#80583a', '#946a44', '#a87e52'], side: ['#4a3022', '#3a2418', '#5a3a28'], shadow: '#1c1428', light: '#ffe2b0' },
  snow: { top: ['#9aa8c8', '#c6d0e4', '#d8e0ee', '#e8eef6', '#ffffff'], side: ['#6a7088', '#525870', '#7c829a'], shadow: '#3a3c6a', light: '#ffffff' },
  dire: { top: ['#2a2420', '#3a302a', '#4a3a30', '#5c4636', '#7a3a24'], side: ['#2c201c', '#201614', '#3a2a22'], shadow: '#100c18', light: '#ff9a5a' },
};

/** Tone thresholds of the cell hash n in [0,1): index into top[] (0 shadowed .. 4 highlight); base (1) holds 52%. TOP_CUTS is mirrored in the terrain shader. */
export const TOP_CUTS = [0.1, 0.62, 0.84, 0.95];
export const topIndex = n => (n < TOP_CUTS[0] ? 0 : n < TOP_CUTS[1] ? 1 : n < TOP_CUTS[2] ? 2 : n < TOP_CUTS[3] ? 3 : 4);

/** Integer-lattice hash -> [0,1). Same maths as HSH_GLSL (32-bit wrap), so a cell (a, b) gets the same value offline and in game. */
export const hsh = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** GLSL ES 3.00 port of hsh(): `float vhash(vec2 cell)` on integer-valued cell coords. */
export const HSH_GLSL = /* glsl */ `
float vhash(vec2 c){
  uint h = uint(int(c.x)) * 374761393u + uint(int(c.y)) * 668265263u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  return float(h ^ (h >> 16u)) / 4294967296.;
}`;

/** In-game only (not in TERRAINS, so the hero showcase sheet keeps its four grounds): cool grey rock for rock tops and rock cliffs. */
export const STONE = { top: ['#44474c', '#585c62', '#686c72', '#7a7f85', '#90959a'], side: ['#4c4d54', '#393a42', '#5c5d66'], shadow: '#161826', light: '#e8ecf4' };
