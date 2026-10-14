// Spectator POV follow logic: store staleness, goal choice, smoothing, picker, vision key, outgoing message.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPovStore, followGoal, stepFollow, povPlayers, pickPovSid, visionKey, povStateMsg, DEF_DIST, POV_SNAP } from '../src/pov.js';
import { POV } from '../../shared/pov.js';

test('store: fresh -> entry, stale -> null, junk rejected', () => {
  const s = createPovStore();
  assert.equal(s.push({ s: 'a', x: 'no', y: 0, d: 1 }, 0), null);
  s.push({ s: 'a', x: 10, y: 20, d: 900, sel: 'h1', tg: { k: 'ability', s: 1 }, ax: 3, ay: 4 }, 1000);
  const e = s.get('a', 1000 + POV.STALE_MS);
  assert.equal(e.x, 10); assert.equal(e.sel, 'h1'); assert.equal(e.ax, 3);
  assert.equal(s.get('a', 1001 + POV.STALE_MS), null);
  assert.equal(s.get('zzz', 1000), null);
  s.push({ s: 'a', x: 1, y: 1, d: 1, tg: { k: 'x', s: 1 } }, 5000); assert.equal(s.get('a', 5000).tg, null);
  s.clear(); assert.equal(s.get('a', 5000), null);
});

test('followGoal: player camera wins, bots / silent players follow the hero, nothing -> null', () => {
  assert.deepEqual(followGoal({ x: 5, y: 6, d: 700 }, { x: 1, y: 1 }), { x: 5, y: 6, d: 700, live: true });
  assert.deepEqual(followGoal(null, { x: 1, y: 2 }), { x: 1, y: 2, d: DEF_DIST, live: false });
  assert.equal(followGoal(null, null), null);
  assert.equal(followGoal(null, { x: NaN, y: 0 }), null);
});

test('stepFollow: smooth approach, snap on first / far jump, no overshoot', () => {
  const g = { x: 1000, y: 0 };
  assert.deepEqual(stepFollow(null, g, 0.016), { x: 1000, y: 0 });
  assert.deepEqual(stepFollow({ x: -5000, y: 0 }, g, 0.016), { x: 1000, y: 0 });
  let c = { x: 0, y: 0 }; const xs = [];
  for (let i = 0; i < 30; i++) { c = stepFollow(c, g, 0.016); xs.push(c.x); }
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] > xs[i - 1] && xs[i] <= 1000);
  assert.ok(xs[0] > 0 && xs[0] < 200);
  assert.ok(xs[29] > 500);
  assert.equal(stepFollow(c, null, 0.1), c);
  assert.ok(POV_SNAP > 1000);
  assert.deepEqual(stepFollow({ x: 0, y: 0 }, g, 0), { x: 0, y: 0 });
});

const P = (sid, team, slot, isBot = false) => ({ sid, team, slot, isBot, hero: 'h' });
const mk = (...ps) => new Map(ps.map((p) => [p.sid, p]));

test('povPlayers / pickPovSid: ten seats ordered, spectators excluded, stale pick replaced', () => {
  const pl = mk(P('d1', 1, 0), P('r2', 0, 1, true), P('r1', 0, 0), P('s', 3, 0));
  assert.deepEqual(povPlayers(pl).map((p) => p.sid), ['r1', 'r2', 'd1']);
  assert.equal(pickPovSid(pl, 'd1'), 'd1');
  assert.equal(pickPovSid(pl, 'gone'), 'r1');
  assert.equal(pickPovSid(mk(P('b', 0, 0, true)), ''), 'b');
  assert.equal(pickPovSid(mk(P('s', 3, 0)), ''), '');
  assert.equal(pickPovSid(null, 'x'), '');
});

test('visionKey: free roam / fog off = both teams (-2), fog on = that team', () => {
  assert.equal(visionKey(true, null, true), -2);
  assert.equal(visionKey(true, 1, false), -2);
  assert.equal(visionKey(true, 1, true), 1);
  assert.equal(visionKey(true, 0, true), 0);
  assert.equal(visionKey(false, 0, true), 0);
  assert.equal(visionKey(false, null, true), -1);
});

test('povStateMsg: sends on change, heartbeat after 1 s, rounds, carries aim', () => {
  const cam = { x: 10.4, y: 20.6, d: 1133.7 };
  const m = povStateMsg(cam, 'u', null, null, 1000, 0);
  assert.deepEqual(m, { x: 10, y: 21, d: 1134, sel: 'u' });
  assert.equal(povStateMsg(cam, 'u', null, m, 1500, 1000), null);
  assert.deepEqual(povStateMsg(cam, 'u', null, m, 2100, 1000), m);
  assert.notEqual(povStateMsg({ ...cam, x: 50 }, 'u', null, m, 1100, 1000), null);
  assert.notEqual(povStateMsg(cam, null, null, m, 1100, 1000), null);
  const a = povStateMsg(cam, 'u', { tg: { k: 'ability', s: 2 }, ax: 5.5, ay: 6 }, m, 1100, 1000);
  assert.deepEqual(a.tg, { k: 'ability', s: 2 }); assert.equal(a.ax, 6);
  assert.equal(povStateMsg(cam, 'u', { tg: { k: 'ability', s: 2 }, ax: 5.5, ay: 6 }, a, 1200, 1100), null);
});
