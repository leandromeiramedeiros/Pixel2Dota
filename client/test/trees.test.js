// Voxel map trees: greedy mesher (client/src/render/voxmesh.js greedyVox / downsampleVox), the tree models (shared/vox/world/trees.js) and
// their game geometry (client/src/render/trees3d.js treeGeometry).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Vox } from '../../shared/vox/vox.js';
import { greedyVox, downsampleVox } from '../src/render/voxmesh.js';
import { TREES, TREE_KEYS, STUMPS, TREE_REF, treeModel } from '../../shared/vox/world/trees.js';
import { treeGeometry, UNIT, TREE_INDEX, STUMP_OF } from '../src/render/trees3d.js';

/** Every exposed voxel face as a key "x,y,z,axis,sign". */
function exposed(v) {
  const s = new Set();
  for (let z = 0; z < v.Z; z++) for (let y = 0; y < v.Y; y++) for (let x = 0; x < v.X; x++) {
    if (!v.get(x, y, z)) continue;
    for (let d = 0; d < 3; d++) for (const sg of [-1, 1]) { const p = [x, y, z]; p[d] += sg; if (!v.get(p[0], p[1], p[2])) s.add(`${x},${y},${z},${d},${sg}`); }
  }
  return s;
}

/** Rasterise greedy quads back to unit faces (voxel coords); checks winding against the stored normal. Returns { faces: Map key -> count, cw }. */
function covered(g, cx, cy, unit) {
  const faces = new Map(); let cw = 0;
  const toVox = (i) => [g.pos[i] / unit + cx, cy - g.pos[i + 2] / unit, g.pos[i + 1] / unit];
  for (let q = 0; q < g.quads; q++) {
    const b = q * 18, P = [0, 3, 6, 15].map((o) => toVox(b + o));   // tri verts 0,1,2 + the 4th corner (vertex 5)
    const n = [g.nrm[b], g.nrm[b + 1], g.nrm[b + 2]], nv = [n[0], -n[2], n[1]];         // model normal -> voxel axes
    const tri = [0, 1, 2].map((k) => [g.pos[b + k * 3], g.pos[b + k * 3 + 1], g.pos[b + k * 3 + 2]]);
    const e1 = tri[1].map((x, i) => x - tri[0][i]), e2 = tri[2].map((x, i) => x - tri[0][i]);
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] <= 0) cw++;
    const d = nv.findIndex((c) => c !== 0), sg = nv[d];
    const mn = [0, 1, 2].map((i) => Math.min(...P.map((p) => p[i]))), mx = [0, 1, 2].map((i) => Math.max(...P.map((p) => p[i])));
    const lo = mn.map((x, i) => (i === d ? Math.round(x) - (sg > 0 ? 1 : 0) : Math.round(x))), hi = mx.map((x, i) => (i === d ? lo[i] + 1 : Math.round(x)));
    for (let z = lo[2]; z < hi[2]; z++) for (let y = lo[1]; y < hi[1]; y++) for (let x = lo[0]; x < hi[0]; x++) {
      const k = `${x},${y},${z},${d},${sg}`; faces.set(k, (faces.get(k) || 0) + 1);
    }
  }
  return { faces, cw };
}

function sameCover(v, g, cx, cy, unit, tag) {
  const want = exposed(v), { faces, cw } = covered(g, cx, cy, unit);
  assert.equal(cw, 0, `${tag}: quads wound CW`);
  let dup = 0, extra = 0; for (const [k, c] of faces) { if (c > 1) dup++; if (!want.has(k)) extra++; }
  assert.equal(dup, 0, `${tag}: overlapping quads`); assert.equal(extra, 0, `${tag}: quads over hidden faces`);
  assert.equal(faces.size, want.size, `${tag}: exposed faces covered`);
}

test('greedyVox: covers every exposed face once, CCW, merges a slab to 6 quads', () => {
  const v = new Vox(8, 6, 5), a = v.mat('a', { ramp: ['#000', '#111', '#222', '#333'] }), b = v.mat('b', { ramp: ['#000', '#444', '#555', '#666'] });
  for (let z = 0; z < 2; z++) for (let y = 1; y < 5; y++) for (let x = 1; x < 7; x++) v.set(x, y, z, a);
  assert.equal(greedyVox(v, { cx: 4, cy: 3 }).quads, 6);
  v.set(3, 2, 2, b); v.set(4, 2, 2, b); v.set(4, 3, 2, a); v.set(1, 1, 0, 0); v.set(6, 4, 1, b);
  for (const rows of [false, true]) sameCover(v, greedyVox(v, { cx: 4, cy: 3, unit: 2.5, rows }), 4, 3, 2.5, `synthetic rows=${rows}`);
  const g = greedyVox(v, { cx: 4, cy: 3, colorOf: (m) => (m.name === 'b' ? [1, 0, 0] : [0, 1, 0]), extraOf: (m) => (m.name === 'b' ? 1 : 0) });
  for (let i = 0; i < g.ext.length; i++) assert.equal(g.ext[i], g.col[i * 3]);   // colour and extra follow the same material
});

test('downsampleVox: block majority, thin materials survive, materials shared', () => {
  const v = new Vox(4, 4, 4), solid = v.mat('s', { ramp: ['#000', '#111', '#222', '#333'] }), twig = v.mat('t', { ramp: ['#000', '#111', '#222', '#333'], thin: true });
  for (let z = 0; z < 2; z++) for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) v.set(x, y, z, solid);
  v.set(2, 2, 2, twig); v.set(0, 3, 3, solid);
  const o = downsampleVox(v, 2);
  assert.equal(o.X, 2); assert.equal(o.mats, v.mats);
  assert.equal(o.get(0, 0, 0), solid);   // full block
  assert.equal(o.get(1, 1, 1), twig);    // 1 of 8, but thin
  assert.equal(o.get(0, 1, 1), 0);       // 1 of 8, not thin
});

test('trees: every model builds clean, meshes exactly at both LODs, stays inside its grid', () => {
  for (const k of TREE_KEYS) {
    const T = TREES[k], v = T.build(), [X, Y, Z] = T.META.grid;
    assert.equal(T.META.rig, 'static', k); assert.ok(TREE_REF[k], `${k}: reference`);
    assert.ok(v.X === X && v.Y === Y && v.Z === Z, `${k}: grid`);
    let z0 = 0, wall = 0;
    for (let z = 0; z < v.Z; z++) for (let y = 0; y < v.Y; y++) for (let x = 0; x < v.X; x++) if (v.get(x, y, z)) { if (!z) z0++; if (x === 0 || y === 0 || x === X - 1 || y === Y - 1 || z === Z - 1) wall++; }
    assert.ok(z0 > 0, `${k}: grounded`); assert.equal(wall, 0, `${k}: voxels on the grid walls`);
    sameCover(v, greedyVox(v, { cx: T.META.cx, cy: T.META.cy }), T.META.cx, T.META.cy, 1, `${k} lod0`);
    sameCover(downsampleVox(v, 2), greedyVox(downsampleVox(v, 2), { cx: T.META.cx / 2, cy: T.META.cy / 2 }), T.META.cx / 2, T.META.cy / 2, 1, `${k} lod1`);
  }
});

test('trees: game geometry (sway by height only, stumps planted, quad budget)', () => {
  for (const k of TREE_KEYS) {
    const g0 = treeGeometry(k, 0), g1 = treeGeometry(k, 1), stump = STUMPS.includes(k);
    assert.ok(g0.quads <= 1200 && g1.quads <= 340, `${k}: quads ${g0.quads} / ${g1.quads} over budget`);
    assert.ok(g1.quads < g0.quads, `${k}: LOD1 not cheaper`);
    for (const g of [g0, g1]) for (let i = 0; i < g.sw.length; i++) {
      const y = g.pos[i * 3 + 1];
      assert.ok(g.sw[i] >= 0 && g.sw[i] <= 1, `${k}: sway range`);
      if (stump || y <= 3 * UNIT) assert.equal(g.sw[i], 0, `${k}: planted vertex sways`);
      if (i && g.pos[i * 3 - 2] === y) assert.equal(g.sw[i], g.sw[i - 1], `${k}: sway not a function of height`);
    }
  }
  assert.deepEqual(STUMP_OF.map((i) => TREE_KEYS[i]), ['stumpR', 'stumpD']);
});

test('treeModel: side picks the art set, the Dota name picks the silhouette family', () => {
  const side = (k) => TREES[k].side;
  for (const nm of ['tree_pine_01', 'tree_pine_03b', 'tree_oak_01b', 'tree_oak_02', 'tree_cine_02_low', 'tree_bamboo_02', 'dire_tree004b', 'dire_tree007', 'dire_tree008', '']) {
    for (const s of [0, 1]) { const k = treeModel(nm, s, 0.37); assert.ok(TREE_INDEX[k] != null && !STUMPS.includes(k), `${nm}/${s}: ${k}`); assert.equal(side(k), s, `${nm}/${s}: wrong side model ${k}`); }
  }
  assert.equal(treeModel('tree_pine_01', 0), 'pineA'); assert.equal(treeModel('tree_oak_02', 0), 'oakB'); assert.equal(treeModel('tree_bamboo_01', 0), 'bamboo');
  assert.equal(treeModel('dire_tree007', 1), 'dire007'); assert.equal(treeModel('dire_tree004b', 1), 'dire004'); assert.equal(treeModel('dire_tree008', 1), 'dire008');
});
