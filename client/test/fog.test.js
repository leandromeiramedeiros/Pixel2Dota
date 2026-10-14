// Fog (render/fog.js) pure rules: high ground, trees, flying sources, river, three-stage levels, blur. node --test client/test/fog.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { castVision, wallLiftOf, blurToBytes, fogLevels, FOG_LEVEL, FOG_UNSEEN_DARKEN } from '../src/render/fog.js';
import { TT } from '../../shared/map.js';

const N = 40, T = 48;
/** Synthetic map: 40x40 tiles, row 20 is the test row. f(x, y) -> {t, z}. */
function mk(f) {
  const type = new Uint8Array(N * N), hC = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const o = f(x, y) || {}; type[y * N + x] = o.t || 0; hC[y * N + x] = o.z === undefined ? 128 : o.z; }
  return { w: N, h: N, tile: T, x0: 0, y1: N * T, type, hC };
}
const row = 20, J = (x) => row * N + x;
const world = (tx) => [(tx + 0.5) * T, (N - row - 0.5) * T];
const seen = (map, from, to, o = {}) => {
  const vis = new Uint8Array(N * N); const [sx, sy] = world(from);
  castVision(map, vis, sx, sy, o.r || 1200, o.tree || null, !!o.fly); return !!vis[J(to)];
};
// plateau (z 256) for x >= 20, cliff WALL columns 18-19, lowland (z 128) for x < 18
const cliff = () => mk((x) => x >= 20 ? { z: 256 } : x >= 18 ? { t: TT.WALL, z: 192 } : { z: 128 });

test('high ground: a viewer on the plateau sees down over the cliff, a viewer below does not see up', () => {
  const m = cliff();
  assert.ok(seen(m, 24, 12), 'high sees low');
  assert.ok(seen(m, 24, 21), 'high sees its own ground');
  assert.ok(!seen(m, 12, 26), 'low does not see the plateau interior');
  assert.ok(!seen(m, 12, 22), 'low does not see the plateau edge tiles beyond the wall');
  assert.ok(seen(m, 12, 5), 'low sees its own ground');
});

test('flying (spell) vision ignores cliffs and trees', () => {
  const m = cliff();
  assert.ok(seen(m, 12, 26, { fly: true }));
  const flat = mk(() => ({}));
  assert.ok(!seen(flat, 10, 20, { tree: (j) => j === J(15) }));
  assert.ok(seen(flat, 10, 20, { tree: (j) => j === J(15), fly: true }));
});

test('trees: live tree blocks, cut tree does not, viewer well above the tree sees over it', () => {
  const flat = mk(() => ({}));
  const live = (j) => j === J(15);
  assert.ok(!seen(flat, 10, 20, { tree: live }), 'behind a live tree');
  assert.ok(seen(flat, 10, 15, { tree: live }), 'the tree tile itself is seen');
  assert.ok(seen(flat, 10, 20, { tree: () => false }), 'stump/no tree');
  const hill = mk((x) => x <= 12 ? { z: 256 } : {});   // viewer on a plateau, the tree on lowland
  assert.ok(seen(hill, 10, 20, { tree: live }), 'over the tree from above');
  const lowViewer = mk(() => ({}));
  assert.ok(!seen(lowViewer, 10, 20, { tree: live }));
});

test('river is a level below the lane: a viewer in the river does not see up onto the lane', () => {
  const m = mk((x) => x < 6 ? { z: 0 } : { z: 128 });
  assert.ok(!seen(m, 3, 15));
  assert.ok(seen(m, 3, 1), 'the river sees the river');
  assert.ok(seen(m, 20, 3), 'and the lane sees the river');
});

test('map border blocks and radius bounds', () => {
  const m = mk(() => ({}));
  assert.ok(!seen(m, 10, 30, { r: 400 }), 'beyond the radius');
  const out = mk((x) => x === 15 ? { t: TT.OUT } : {});
  assert.ok(!seen(out, 10, 20), 'beyond OUT');
});

test('wallLiftOf: cliff = high side, obstacle = height + margin, enclosed = Infinity', () => {
  const m = cliff(); const L = wallLiftOf(m);
  assert.equal(L[J(18)], 256);
  assert.equal(wallLiftOf(m), L, 'cached');
  const obst = mk((x, y) => x === 20 && y === 20 ? { t: TT.WALL } : {});
  assert.ok(wallLiftOf(obst)[J(20)] > 128 && isFinite(wallLiftOf(obst)[J(20)]));
  const solid = mk((x, y) => Math.abs(x - 20) < 5 && Math.abs(y - 20) < 5 ? { t: TT.WALL } : {});
  assert.equal(wallLiftOf(solid)[J(20)], Infinity);
});

test('three stages: visible > fogged > never-seen; FOG_UNSEEN_DARKEN = 0 collapses to pure Dota', () => {
  const [fogged, unseen, desat] = fogLevels();
  assert.equal(fogged, FOG_LEVEL);
  assert.ok(fogged > unseen && unseen > 0 && fogged < 1);
  assert.ok(Math.abs(unseen - FOG_LEVEL * (1 - FOG_UNSEEN_DARKEN)) < 1e-9);
  assert.ok(FOG_UNSEEN_DARKEN >= 0 && FOG_UNSEEN_DARKEN < 0.5, 'unseen is only slightly darker');
  assert.ok(desat > 0 && desat <= 1);
});

test('blurToBytes: soft edge, uniform field stays uniform, writes only its channel', () => {
  const w = 8, h = 3, src = new Float32Array(w * h), tmp = new Float32Array(w * h), out = new Uint8Array(w * h * 2).fill(7);
  for (let y = 0; y < h; y++) for (let x = 4; x < w; x++) src[y * w + x] = 1;
  blurToBytes(src, tmp, w, h, out, 0, 2);
  assert.equal(out[(1 * w + 0) * 2], 0); assert.equal(out[(1 * w + 7) * 2], 255);
  const e = out[(1 * w + 3) * 2], f = out[(1 * w + 4) * 2];
  assert.ok(e > 0 && e < 128 && f > 128 && f < 255, `edge ${e} ${f}`);
  for (let i = 0; i < w * h; i++) assert.equal(out[i * 2 + 1], 7);
  src.fill(1); blurToBytes(src, tmp, w, h, out, 1, 2);
  for (let i = 0; i < w * h; i++) assert.equal(out[i * 2 + 1], 255);
});
