// Snapshot clock: jitter must not leak into sample spacing; the delay grows with jitter and settles back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClock, DELAY_MIN, DELAY_MAX } from '../src/net/clock.js';

test('clock: jittery arrivals -> evenly spaced stamps, delay covers the jitter', () => {
  const c = createClock();
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const stamps = [];
  for (let i = 1; i <= 300; i++) {
    const serverSec = 100 + i / 30, arrive = 5000 + i * 1000 / 30 + 110 + rnd() * 140;   // 110 ms base latency, 0-140 ms jitter
    stamps.push({ t: c.stamp(serverSec, arrive), arrive });
  }
  const tail = stamps.slice(100);
  for (let i = 1; i < tail.length; i++) assert.ok(Math.abs(tail[i].t - tail[i - 1].t - 1000 / 30) < 3, 'spacing = server tick');
  const d = c.delay();
  assert.ok(d > 120 && d <= DELAY_MAX, 'delay grew to cover jitter: ' + d);
  // every sample is in the buffer before it is needed: render time (arrival - delay) never passes a stamp still in flight
  for (const s of tail) assert.ok(s.arrive - d <= s.t + 2, 'late sample still ahead of render time');
});

test('clock: steady link settles at the minimum delay; lobby time 0 passes through', () => {
  const c = createClock();
  for (let i = 1; i <= 400; i++) c.stamp(10 + i / 30, 1000 + i * 1000 / 30 + 20);
  assert.ok(c.delay() <= DELAY_MIN + 1);
  assert.equal(c.stamp(0, 4242), 4242);
});
