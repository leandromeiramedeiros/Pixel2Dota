// Procedural stand-in sprites (heroes / summons / wards whose art sheet has not been generated yet). Greyscale so the renderer can tint
// them per unit. Same frame naming as real unit sheets: `${anim}_${dir}_${i}`, anchor at the feet.
const W = 14, H = 22;

function blank() { return Array.from({ length: H }, () => Array(W).fill('.')); }
function set(g, x, y, c) { if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = c; }
function rect(g, x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(g, x + i, y + j, c); }
function ellipse(g, cx, cy, rx, ry, c) { for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) { const dx = (x - cx) / rx, dy = (y - cy) / ry; if (dx * dx + dy * dy <= 1) set(g, x, y, c); } }
function outline(g) {
  const o = blank();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (g[y][x] !== '.') { o[y][x] = g[y][x]; continue; }
    const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const xx = x + dx, yy = y + dy; return xx >= 0 && yy >= 0 && xx < W && yy < H && g[yy][xx] !== '.'; });
    if (n) o[y][x] = 'o';
  }
  return o.map((r) => r.join(''));
}

function figure(dir, anim, i) {
  const g = blank();
  const bob = anim === 'walk' ? (i % 2 ? 1 : 0) : anim === 'idle' ? (i % 2 ? 0 : 0) : 0;
  const step = anim === 'walk' ? [0, 1, 0, -1][i % 4] : 0;
  const cast = anim === 'cast' || anim === 'attack';
  const swing = anim === 'attack' ? [-2, 1, 3][i % 3] : anim === 'cast' ? [2, 4, 5][i % 3] : 0;
  const sh = anim === 'stunned' ? (i % 2 ? 1 : -1) : 0;
  const top = 2 + bob;
  // legs
  const lx = dir === 'e' ? 5 : 4;
  rect(g, lx, 16 + bob, 2, 5 - bob, 'd'); rect(g, lx + (dir === 'e' ? 2 : 4), 16 + bob, 2, 5 - bob, 'd');
  if (step) { rect(g, lx, 20 - Math.max(0, step), 2, 1, 'd'); rect(g, lx + (dir === 'e' ? 2 : 4), 20 + Math.min(0, step), 2, 1, 'd'); }
  // torso
  rect(g, 3 + sh, 9 + bob, 8, 8, 'b'); rect(g, 3 + sh, 14 + bob, 8, 1, 'd'); rect(g, 3 + sh, 9 + bob, 8, 1, 'l');
  // head
  ellipse(g, 7 + sh, top + 3, 3.6, 3.4, 'h');
  rect(g, 4 + sh, top - 1, 7, 2, dir === 'n' ? 'h2' : 'b'); if (dir === 'n') rect(g, 4 + sh, top, 7, 4, 'b');
  // arms + weapon
  if (dir === 'e') { rect(g, 9 + sh, 10 + bob, 3, 2, 'h'); if (cast) rect(g, 11 + sh, 8 + bob - (swing > 0 ? 1 : 0), 2, 2, 'w'); else rect(g, 11, 11 + bob, 1, 4, 'w'); }
  else { rect(g, 1 + sh, 10 + bob, 2, 4, 'b'); rect(g, 11 + sh, 10 + bob, 2, 4, 'b'); if (cast) { rect(g, 0, 7 + bob - (swing > 2 ? 1 : 0), 2, 3, 'w'); } else rect(g, 12, 13 + bob, 1, 3, 'w'); }
  // face
  if (dir === 's') { set(g, 6 + sh, top + 3, 'e'); set(g, 8 + sh, top + 3, 'e'); }
  else if (dir === 'e') { set(g, 9 + sh, top + 3, 'e'); }
  return outline(g);
}

export function makePlaceholderSheet() {
  const frames = {};
  const anims = { idle: 2, walk: 4, attack: 3, cast: 3, stunned: 2 };
  for (const a in anims) for (const d of ['s', 'n', 'e']) for (let i = 0; i < anims[a]; i++) frames[`${a}_${d}_${i}`] = figure(d, a, i);
  return {
    pal: { o: '#14101c', b: '#c4c0cc', d: '#7c7890', l: '#e4e0ec', h: '#ecd2b0', h2: '#a89c88', w: '#fff2c0', e: '#ffffff' },
    emit: { e: 2.2, w: 1.2 },
    anchor: [7, 21],
    frames,
  };
}

/** Simple coloured tint for a unit key (stable hash -> pastel HSL). */
export function tintFor(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  const hue = ((h >>> 0) % 360) / 360, s = 0.55, l = 0.62;
  const f = (n) => { const k = (n + hue * 12) % 12; return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1))); };
  return [f(0) * 1.15, f(8) * 1.15, f(4) * 1.15];
}
