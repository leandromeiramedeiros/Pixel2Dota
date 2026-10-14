import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeGrid16, decodeGrid16, encodeBytes, decodeBytes, GRID_NONE } from '../worldcodec.js';
import { getMap, heightAt, zRealAt, waterZAt, navAt, tileCenter, TT } from '../map.js';

test('Grid16 round-trips (incl. sentinels, extremes, runs, odd sizes)', () => {
  const w = 37, h = 23, g = new Int16Array(w * h);
  for (let i = 0; i < g.length; i++) g[i] = i % 11 === 0 ? GRID_NONE : (i * 7919) % 900 - 300;
  g.fill(128, 100, 300); g[5] = 32767; g[6] = -32768;
  assert.deepEqual(decodeGrid16(encodeGrid16(g, w, h), w, h), g);
});
test('Bytes RLE round-trips', () => {
  const a = Uint8Array.from([0, 0, 0, 1, 20, 20, 16, 16, 16, 16, 255, 7]);
  const long = new Uint8Array(70000).fill(20); long[3] = 1;
  for (const x of [a, long, new Uint8Array(0)]) assert.deepEqual(decodeBytes(encodeBytes(x), x.length), x);
});
test('map.js loads; real data consistent with the tier map', () => {
  const m = getMap();
  assert.equal(m.w, 368); assert.equal(m.zReal.length, m.w * m.h); assert.equal(m.nav.flags.length, m.nav.gw * m.nav.gh);
  const [x, y] = tileCenter(184, 184);
  assert.ok(Number.isFinite(heightAt(x, y)));
  let n = 0, dev = 0;
  for (let j = 0; j < m.w * m.h; j++) if (m.type[j] === TT.GRASS && !m.ramp[j] && Number.isFinite(m.zReal[j])) { n++; if (Math.abs(m.zReal[j] - m.elev[j] * 128) > 40) dev++; }
  assert.ok(n > 10000 && dev / n < 0.02, `dev ${dev}/${n}`);
  let wet = 0; for (let j = 0; j < m.w * m.h; j++) if (m.type[j] === TT.WATER) { wet++; assert.ok(Number.isFinite(m.waterZ[j])); }
  assert.ok(wet > 1000);
  // nav walkable bit agrees with the tile type at tile centres
  let bad = 0; for (let j = 0; j < m.w * m.h; j += 7) { const [cx, cy] = tileCenter(j % m.w, (j / m.w) | 0); const wk = m.type[j] === TT.WALL; if (!!(navAt(cx, cy) & 1) === wk && m.type[j] !== TT.TREE) bad++; }
  assert.equal(bad, 0);
  assert.ok(Number.isNaN(zRealAt(1e6, 0)) && Number.isNaN(waterZAt(1e6, 0)));
});
