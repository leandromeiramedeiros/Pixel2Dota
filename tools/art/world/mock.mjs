// Mock 20x12 tile scene to eyeball world art together: node tools/art/world/mock.mjs [scale=5]
import fs from 'node:fs';
import path from 'node:path';
import { encodePng, loadSheet } from '../png.mjs';
import { ROOT } from './lib.mjs';
const SC = +(process.argv[2] || 5);
const hex = h => { h = h.replace('#', ''); if (h.length === 6) h += 'ff'; return [0, 2, 4, 6].map(i => parseInt(h.slice(i, i + 2), 16)); };
const MAP = ['################################',
  '#..............~~~~~...........#',
  '#..T...........~~~~~~....T.T...#',
  '#.TT...===.......~~~..........T#',
  '#......=..=======.....====....##',
  '#......=.........=....=...=....#',
  '#..........T.....=....=...=....#',
  '#.........TT.....======...=....#',
  '#................................',
  '#..###.....................##..#',
  '#..###.....T...............##..#',
  '#..###................T.......##',
  '#.........................TT...#',
  '#.T...........................##',
  '#.TT...T.........T...........###',
  '################################'];
const GW = 32, GH = 16, W = GW * 8 * SC, H = (GH * 8 + 16) * SC;
const img = new Uint8Array(W * H * 4); for (let i = 0; i < W * H; i++) img.set([20, 20, 24, 255], i * 4);
const sheets = { tiles: loadSheet('tiles'), trees: loadSheet('trees'), buildings: loadSheet('buildings'), creeps: loadSheet('creeps') };
function draw(sn, key, px, py, anchorMode) { // px,py = pixel position of anchor (or top-left for tiles)
  const S = sheets[sn], rows = S.frames[key]; if (!rows) throw new Error('missing ' + sn + ':' + key);
  const a = anchorMode ? ((S.anchors && S.anchors[key]) || S.anchor) : [0, 0];
  const emit = S.emit || {};
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === '.') return; const col = hex(S.pal[c]); for (let dy = 0; dy < SC; dy++) for (let dx = 0; dx < SC; dx++) { const X = (px - a[0] + x) * SC + dx, Y = (py - a[1] + y) * SC + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const i = (Y * W + X) * 4; const al = col[3] / 255; for (let k = 0; k < 3; k++) img[i + k] = col[k] * al + img[i + k] * (1 - al); img[i + 3] = 255; } }));
}
const at = (x, y) => (MAP[y]?.[x]) ?? '#';
const rad = (x) => x < 16; // Radiant on the left half
const hash = (x, y) => (x * 73856093 ^ y * 19349663) >>> 0;
for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
  const c = at(x, y), d = rad(x) ? 'r' : 'd', h = hash(x, y) % 4;
  const same = (dx, dy) => at(x + dx, y + dy) === c;
  const mask = (same(0, -1) ? 1 : 0) | (same(1, 0) ? 2 : 0) | (same(0, 1) ? 4 : 0) | (same(-1, 0) ? 8 : 0);
  if (c === '#') draw('tiles', 'rock_top_' + h, x * 8, y * 8);
  else if (c === '=') draw('tiles', 'road_e' + mask, x * 8, y * 8);
  else if (c === '~') draw('tiles', 'water_e' + mask, x * 8, y * 8);
  else draw('tiles', `grass_${d}_${hash(x, y) % 6}`, x * 8, y * 8);
}
// cliff strips below wall tiles that border walkable ground
for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (at(x, y) === '#' && at(x, y + 1) !== '#') draw('tiles', `cliff_${rad(x) ? 'r' : 'd'}_${hash(x, y) % 4}`, x * 8, y * 8 + 8);
// sprites sorted by y
const spr = [];
for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (at(x, y) === 'T') spr.push({ y: y * 8 + 7, f: () => draw('trees', rad(x) ? `tree_r_${hash(x, y) % 4}` : `tree_d_${hash(x, y) % 4}`, x * 8 + 4, y * 8 + 7, true) });
spr.push({ y: 80, f: () => draw('buildings', 'tower_r_idle_1', 60, 80, true) });
spr.push({ y: 80, f: () => draw('buildings', 'tower_d_idle_1', 190, 80, true) });
spr.push({ y: 120, f: () => draw('buildings', 'rax_melee_r_idle_0', 60, 120, true) });
spr.push({ y: 120, f: () => draw('buildings', 'rax_ranged_d_idle_0', 200, 120, true) });
spr.push({ y: 112, f: () => draw('buildings', 'fountain_r_idle_0', 140, 112, true) });
spr.push({ y: 112, f: () => draw('buildings', 'shop_d_idle_0', 20, 112, true) });
spr.push({ y: 100, f: () => draw('buildings', 'ancient_d_idle_1', 236, 104, true) });
[['melee_r', 90, 60, 'walk_e_1'], ['ranged_r', 100, 62, 'walk_e_2'], ['siege_r', 115, 64, 'walk_e_0'], ['melee_d', 130, 62, 'attack_s_1'], ['ranged_d', 150, 66, 'idle_s_0'], ['melee_r', 125, 92, 'attack_e_1'], ['melee_d', 140, 92, 'attack_s_1'], ['siege_d', 170, 96, 'walk_e_2'], ['ranged_r', 100, 96, 'attack_e_1']].forEach(([n, x, y, f]) => spr.push({ y, f: () => draw('creeps', 'creep_' + n + '_' + f, x, y, true) }));
spr.sort((a, b) => a.y - b.y).forEach(s => s.f());
const out = path.join(ROOT, 'tools/art/out/mock_scene.png');
fs.writeFileSync(out, encodePng(W, H, img)); console.log(out, W + 'x' + H);
