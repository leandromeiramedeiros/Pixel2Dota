import test from 'node:test';
import assert from 'node:assert/strict';
import { AP, hash3, apronSpan, apronDepth, shoreSpan, shoreDepth, apronProfile, ledgeSlabs, groundAt, apronCells, apronQuads } from '../vox/world/cliffs.js';
import { getMap } from '../map.js';

const C = 8.4, CH = 32;
const near = (a, b) => Math.abs(a - b) < 1e-6;
const onGrid = (v) => near(v / C, Math.round(v / C));
const sideOf = (tx, ty) => (tx + ty < 368 ? 0 : 1);

test('hash3 is deterministic and in [0, 1)', () => {
  for (let i = 0; i < 200; i++) { const h = hash3(i, i * 3 - 50, 7); assert.ok(h >= 0 && h < 1); assert.equal(h, hash3(i, i * 3 - 50, 7)); }
});

test('apronSpan / shoreSpan: blocks are >= half a cell deep, on the right side of the plane, and depth matches the span', () => {
  for (const s of [1, -1]) for (let k = 0; k < 40; k++) for (let n = 0; n < 3; n++) {
    const e = (k * 3.37 - 60) * s * 1; // arbitrary planes
    const [lo, hi] = apronSpan(e, s, C, n), d = apronDepth(e, s, C, n);
    assert.ok(d >= 0.5 * C - 1e-9 && d <= (n + 1.5) * C + 1e-9);
    assert.equal(hi - lo + 1 >= n + 1, true);
    // outer edge of the block, measured from the plane, equals the depth
    const edge = s > 0 ? (hi + 1) * C - e : e - lo * C;
    assert.ok(near(edge, d), `edge ${edge} depth ${d}`);
    // the cell holding the plane belongs to the block
    const own = Math.floor(e / C);
    assert.ok(lo <= own && own <= hi || s < 0 && lo <= own && own <= hi + 1);
    const [slo, shi] = shoreSpan(e, s, C, n), sd = shoreDepth(e, s, C, n);
    assert.ok(sd > 0 && sd <= (n + 1.5) * C + 1e-9);
    const sedge = s > 0 ? (shi + 1) * C - e : e - slo * C;
    assert.ok(near(sedge, sd));
    // shore cells sit on the outward side: centres are beyond the plane
    for (let i = slo; i <= shi; i++) assert.ok(s > 0 ? (i + 0.5) * C >= e - 1e-9 : (i + 0.5) * C <= e + 1e-9);
  }
});

test('apronProfile: tread heights on the cell grid, above the ground, none for low walls', () => {
  assert.deepEqual(apronProfile(0.5, 0, 2 * C, C), []);
  for (let i = 0; i < 100; i++) {
    const r = i / 100, ground = (i % 5) * 3;
    for (const drop of [4 * C, 12 * C, 30 * C]) {
      const p = apronProfile(r, ground, drop, C);
      assert.ok(p.length >= 1 && p.length <= 3);
      for (const b of p) { assert.ok(onGrid(b.y)); assert.ok(b.y >= ground + 1.2 * C - 1e-9); assert.ok(b.y < ground + drop); }
      for (let k = 1; k < p.length; k++) assert.ok(p[k].y > p[k - 1].y && p[k].n < p[k - 1].n);
    }
    const s = apronProfile(r, 0, 0, C, true);
    assert.ok(s.length <= 2); for (const b of s) assert.ok(onGrid(b.y) && b.y >= 0.5 * C);
  }
});

test('ledgeSlabs: only tall walls, inside the edge, between the apron and the wall top', () => {
  assert.deepEqual(ledgeSlabs(0.99, 0, 5, 0, 6 * C, C), []);
  assert.deepEqual(ledgeSlabs(0.99, 0, 1, 0, 30 * C, C), []);
  let some = 0;
  for (let i = 0; i < 200; i++) {
    const i0 = i - 100, i1 = i0 + 3 + (i % 5), ground = 0, drop = (8 + (i % 23)) * C;
    for (const sl of ledgeSlabs(i / 200, i0, i1, ground, drop, C)) {
      some++;
      assert.ok(sl.a0 >= i0 && sl.a1 <= i1 && sl.a1 >= sl.a0);
      assert.ok(onGrid(sl.top) && sl.top >= ground + 6 * C - 1e-9 && sl.top <= ground + drop - 2 * C + 1e-9, `top ${sl.top} drop ${drop}`);
      assert.ok(sl.n === 0 || sl.n === 1);
    }
  }
  assert.ok(some > 0);
});

test('groundAt: bilinear inside the map, Infinity outside', () => {
  const m = getMap();
  assert.equal(groundAt(m, m.x0 - 10, 0), Infinity);
  assert.ok(Number.isFinite(groundAt(m, 0, 0)));
});

// every chunk of a window of the real map; the window has cliffs, the river and the base walls
const m = getMap();
const chunkQuads = (cx, cy) => apronQuads(m, cx * CH, cy * CH, Math.min(m.w, (cx + 1) * CH), Math.min(m.h, (cy + 1) * CH), C, sideOf);

test('apronCells (real map): cells above the ground, unique, tread on the grid', () => {
  const cells = apronCells(m, 160, 160, 192, 192, C, sideOf);
  assert.ok(cells.size > 0);
  for (const c of cells.values()) {
    assert.ok(c.y > groundAt(m, (c.ix + 0.5) * C, (c.iz + 0.5) * C) + 1);
    assert.ok(onGrid(c.y));
    assert.ok(c.side === 0 || c.side === 1);
  }
});

test('apronQuads (real map): well-formed, on the cell grid, deterministic, each tread cell owned by one chunk', () => {
  const treadCells = new Map();
  let quads = 0, dup = 0;
  for (let cy = 4; cy < 9; cy++) for (let cx = 4; cx < 9; cx++) {
    const q = chunkQuads(cx, cy);
    assert.deepEqual(q, chunkQuads(cx, cy));
    for (const a of q) {
      quads++;
      assert.ok(a.f >= AP.N && a.f <= AP.UP && (a.side === 0 || a.side === 1) && Number.isFinite(a.type));
      for (const v of [a.x0, a.x1, a.z0, a.z1, a.y0, a.y1]) assert.ok(Number.isFinite(v));
      assert.ok(onGrid(a.x0) && onGrid(a.x1) && onGrid(a.z0) && onGrid(a.z1) && onGrid(a.y1));
      assert.ok(a.x1 >= a.x0 && a.z1 >= a.z0 && a.y1 >= a.y0);
      if (a.f === AP.UP) {
        assert.equal(a.y0, a.y1);
        assert.ok(a.x1 > a.x0 && a.z1 > a.z0);
        for (let ix = Math.round(a.x0 / C); ix < Math.round(a.x1 / C); ix++) for (let iz = Math.round(a.z0 / C); iz < Math.round(a.z1 / C); iz++) {
          const k = ix + "," + iz + "," + a.y0, id = cx * 100 + cy;
          if (treadCells.has(k) && treadCells.get(k) !== id) dup++;
          treadCells.set(k, id);
        }
      } else {
        assert.ok(a.y1 > a.y0 - 1e-9);
        // E / W risers are flat in x, N / S risers flat in z
        assert.ok(a.f === AP.E || a.f === AP.W ? near(a.x0, a.x1) : near(a.z0, a.z1));
      }
    }
  }
  assert.ok(quads > 50, `quads ${quads}`);
  // a tread cell is emitted by one chunk only
  assert.equal(dup, 0);
});

test('apronQuads: nothing is emitted where there is no wall or bank', () => {
  // a chunk in the middle of the open lane far from walls may be empty; an off-map rect must be
  assert.deepEqual(apronQuads(m, 4000, 4000, 4032, 4032, C, sideOf), []);
});
