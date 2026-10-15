// Voxel clutter (shared/vox/world/{clutter,rocks}.js -> clutterVox.js): authoring invariants and the mesher's output layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SPECS, slotGeo, slotCount, slotOf, shapeOf, halve } from '../src/render/clutterVox.js';
import { buildProp } from '../../shared/vox/world/clutter.js';
import { stats } from '../../shared/vox/world/clutterprim.js';

const NAMES = Object.keys(SPECS);
const TRI_CAP = [1000, 260];   // per slot and LOD: the instance counts at max zoom-out multiply this

test('clutter vox: all 13 voxel variants have 2+ shapes per side', () => {
  assert.equal(NAMES.length, 13);
  for (const n of NAMES) assert.ok(SPECS[n].shapes >= 2 && SPECS[n].unit > 0, n);
});

test('clutter vox: builders fill the grid, stand on z = 0 and stay inside it', () => {
  for (const n of NAMES) for (let side = 0; side < 2; side++) for (let k = 0; k < SPECS[n].shapes; k++) {
    const v = buildProp(n, side, k), s = stats(v), id = `${n} ${side} ${k}`;
    assert.ok(s.n > 12, id + ' not empty');
    assert.equal(s.min[2], 0, id + ' feet on the ground');
    assert.ok(s.min[0] >= 0 && s.min[1] >= 0 && s.max[0] < v.X && s.max[1] < v.Y && s.max[2] < v.Z, id + ' inside the grid');
    assert.ok(v.X % 2 === 0 && v.Y % 2 === 0, id + ' even footprint (whole-voxel foot centre)');
  }
});

test('clutter vox: Radiant and Dire sets differ', () => {
  for (const n of NAMES) for (let k = 0; k < SPECS[n].shapes; k++) {
    const a = buildProp(n, 0, k), b = buildProp(n, 1, k);
    const colours = (v) => v.mats.filter(Boolean).map((m) => m.rgb[2].join()).sort().join('|');
    assert.ok(stats(a).n !== stats(b).n || colours(a) !== colours(b), n + ' shape ' + k + ' identical on both sides');
  }
});

test('clutter vox: slotOf / shapeOf cover every slot, Radiant first', () => {
  for (const n of NAMES) {
    const seen = new Set();
    for (let i = 0; i < 64; i++) {
      const ph = (i + 0.5) / 64 * Math.PI * 2;
      assert.equal(shapeOf(n, ph), slotOf(n, 0, ph));
      assert.equal(slotOf(n, 1, ph), SPECS[n].shapes + shapeOf(n, ph));
      seen.add(slotOf(n, 0, ph)); seen.add(slotOf(n, 1, ph));
    }
    assert.equal(seen.size, slotCount(n), n);
    assert.equal(shapeOf(n, Math.PI * 2), SPECS[n].shapes - 1, 'phase 2pi stays in range');
    assert.equal(shapeOf(n, 0), 0);
  }
});

test('clutter vox: slot geometry is a ground-standing, down-face-free, non-indexed triangle list', () => {
  for (const n of NAMES) for (let lod = 0; lod < 2; lod++) for (let side = 0; side < 2; side++) for (let k = 0; k < SPECS[n].shapes; k++) {
    const { geo, tris, height } = slotGeo(n, side, k, lod), id = `${n} ${side} ${k} lod${lod}`;
    const P = geo.attributes.position, N = geo.attributes.normal;
    assert.equal(geo.index, null);
    assert.equal(P.count, tris * 3);
    assert.ok(tris > 0 && tris <= TRI_CAP[lod], `${id} ${tris} tris`);
    for (const a of ['aCol', 'aCol2', 'aSw', 'aEmit', 'aPart']) assert.equal(geo.attributes[a].count, P.count, a);
    let minY = Infinity;
    for (let i = 0; i < P.count; i++) {
      minY = Math.min(minY, P.getY(i));
      assert.ok(N.getY(i) > -0.5, id + ' no face-down quads');
      assert.ok(Math.abs(Math.hypot(N.getX(i), N.getY(i), N.getZ(i)) - 1) < 1e-6, id + ' unit normal');
    }
    assert.equal(minY, 0, id + ' ground at y = 0');
    assert.ok(height > 0 && height < 140, id + ' height ' + height);
  }
});

test('clutter vox: wind weight only on foliage / cloth, night glow only on mushroom caps', () => {
  const max = (n, side, k, attr) => { const A = slotGeo(n, side, k).geo.attributes[attr]; let m = 0; for (let i = 0; i < A.count; i++) m = Math.max(m, A.getX(i)); return m; };
  for (const n of ['BUSH', 'REED', 'BANNER']) for (let side = 0; side < 2; side++) assert.ok(max(n, side, 0, 'aSw') > 0.3, n + ' sways');
  for (const n of NAMES) for (let side = 0; side < 2; side++) {
    const sw = max(n, side, 0, 'aSw');
    assert.ok(sw >= 0 && sw <= 1, n + ' sway weight in 0..1');
    if (['ROCK', 'BOULDER', 'SCREE', 'LOG', 'PILLAR', 'CARGO', 'BONES', 'TWIGS', 'LILY', 'SHROOM'].includes(n)) assert.equal(sw, 0, n + ' static');
    assert.equal(max(n, side, 0, 'aEmit') > 0, n === 'SHROOM', n + ' glow');
  }
});

test('clutter vox: LOD 1 keeps the footprint and ground, at a third of the triangles or less', () => {
  let t0 = 0, t1 = 0;
  for (const n of NAMES) for (let side = 0; side < 2; side++) for (let k = 0; k < SPECS[n].shapes; k++) {
    const v = buildProp(n, side, k), h = halve(v, 1);
    assert.equal(h.X, Math.ceil(v.X / 2)); assert.equal(h.mats, v.mats);
    assert.equal(stats(h).min[2], 0, n + ' half-res feet on the ground');
    t0 += slotGeo(n, side, k, 0).tris; t1 += slotGeo(n, side, k, 1).tris;
  }
  assert.ok(t1 * 3 < t0, `lod1 ${t1} vs lod0 ${t0}`);
});
