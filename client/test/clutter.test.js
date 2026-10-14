// Pure clutter scatter tests (no WebGL): deterministic, tile-type rules, entity exclusion, per-frame budget-relevant counts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scatterClutter, V, NV, CELL } from '../src/render/clutter3d.js';
import { getMap, TT } from '../../shared/map.js';

const map = getMap();
const S = scatterClutter(map);
const at = (i) => { const x = S.data[i * S.stride], y = -S.data[i * S.stride + 2]; const tx = Math.floor((x - map.x0) / map.tile), ty = Math.floor((map.y1 - y) / map.tile); return { x, y, v: S.vari[i], t: tx < 0 || ty < 0 || tx >= map.w || ty >= map.h ? TT.OUT : map.type[ty * map.w + tx] }; };

test('scatter: deterministic and non-trivial', () => {
  const B = scatterClutter(map);
  assert.equal(B.n, S.n);
  assert.deepEqual(Array.from(B.data.subarray(0, 700)), Array.from(S.data.subarray(0, 700)));
  assert.ok(S.n > 5000 && S.n < 60000, 'count ' + S.n);
  assert.equal(S.counts.length, NV);
  for (let v = 0; v < NV; v++) assert.ok(S.counts[v] > 0, 'variant ' + v + ' present');
  assert.ok(CELL > 0);
});

test('scatter: no clutter in water except reeds / lily pads; roads only get pebbles and tufts', () => {
  for (let i = 0; i < S.n; i++) {
    const { v, t } = at(i);
    if (t === TT.WATER) assert.ok(v === V.REED || v === V.LILY, 'variant ' + v + ' in water');
    if (t === TT.ROAD) assert.ok(v === V.SCREE || v === V.TUFT, 'variant ' + v + ' on road');
    assert.notEqual(t, TT.OUT);
  }
  let roadN = 0, grassN = 0; for (let i = 0; i < S.n; i++) { const { t } = at(i); if (t === TT.ROAD) roadN++; else if (t === TT.GRASS) grassN++; }
  assert.ok(roadN < grassN * 0.05, 'lanes stay clear: ' + roadN + ' vs ' + grassN);
});

test('scatter: nothing on building footprints', () => {
  const R = { tower: 60, barracks: 100, fort: 150, fountain: 150, shop: 80, roshan: 150 };
  for (let i = 0; i < S.n; i++) {
    const { x, y } = at(i);
    for (const k in R) for (const e of map.ents[k] || []) assert.ok(Math.hypot(x - e.x, y - e.y) >= R[k], k + ' footprint hit by variant ' + S.vari[i]);
  }
});

test('scatter: CSR buckets cover every instance', () => {
  assert.equal(S.keyStart[S.keyStart.length - 1], S.n);
  assert.equal(S.counts.reduce((a, b) => a + b, 0), S.n);
});
