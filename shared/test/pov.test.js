// Spectator POV wire contract: validation, order events, throttle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { POV, cleanPov, povOrderEvent, createPovGate } from '../pov.js';

test('cleanPov: clamps and whitelists, drops garbage', () => {
  assert.deepEqual(cleanPov({ x: 10.4, y: -20.6, d: 1134, sel: 'u1', evil: 1 }), { x: 10, y: -21, d: 1134, sel: 'u1' });
  assert.equal(cleanPov({ x: 1e9, y: -1e9, d: 5 }).x, POV.MAP);
  assert.equal(cleanPov({ x: 0, y: 0, d: 5 }).d, POV.D_MIN);
  assert.equal(cleanPov({ x: 0, y: 0, d: 1e6 }).d, POV.D_MAX);
  for (const bad of [null, 5, 'x', {}, { x: NaN, y: 0, d: 1 }, { x: 0, y: Infinity, d: 1 }, { x: '1', y: 0, d: 1 }]) assert.equal(cleanPov(bad), null);
  assert.equal(cleanPov({ x: 0, y: 0, d: 900, sel: 'x'.repeat(33) }).sel, '');
});

test('cleanPov: aim only with a valid target', () => {
  const ok = cleanPov({ x: 0, y: 0, d: 900, tg: { k: 'ability', s: 2 }, ax: 100.2, ay: 5 });
  assert.deepEqual(ok.tg, { k: 'ability', s: 2 }); assert.equal(ok.ax, 100);
  assert.equal(cleanPov({ x: 0, y: 0, d: 900, tg: { k: 'hack', s: 2 }, ax: 1, ay: 1 }).tg, undefined);
  assert.equal(cleanPov({ x: 0, y: 0, d: 900, tg: { k: 'item', s: 99 }, ax: 1, ay: 1 }).tg, undefined);
  assert.equal(cleanPov({ x: 0, y: 0, d: 900, tg: { k: 'item', s: 1 } }).ax, undefined);
});

test('povOrderEvent: only visible order kinds, compact', () => {
  assert.deepEqual(povOrderEvent({ t: 'move', x: 5.6, y: 7, junk: 1 }), { t: 'move', x: 6, y: 7 });
  assert.deepEqual(povOrderEvent({ t: 'cast', slot: 1, id: 'e3', q: true }), { t: 'cast', q: true, id: 'e3', slot: 1 });
  for (const t of ['buy', 'sell', 'learn', 'swap', 'nope']) assert.equal(povOrderEvent({ t }), null);
  assert.equal(povOrderEvent(null), null);
  assert.equal(povOrderEvent({ t: 'move', x: NaN, y: 1 }).x, undefined);
});

test('createPovGate: state min interval per sender', () => {
  const g = createPovGate(80, 20);
  assert.equal(g.state('a', 1000), true);
  assert.equal(g.state('a', 1050), false);
  assert.equal(g.state('b', 1050), true);
  assert.equal(g.state('a', 1080), true);
  g.forget('a'); assert.equal(g.state('a', 1081), true);
});

test('createPovGate: order bucket bursts then refills', () => {
  const g = createPovGate(80, 10);
  let n = 0; for (let i = 0; i < 100; i++) if (g.order('a', 0)) n++;
  assert.equal(n, 20);                                  // burst = 2x per-second
  assert.equal(g.order('a', 0), false);
  assert.equal(g.order('a', 200), true);                // 0.2 s refills 2 tokens
  assert.equal(g.order('b', 0), true);                  // other senders unaffected
});
