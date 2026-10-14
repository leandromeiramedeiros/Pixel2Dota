// Neutral camps + Roshan: node --test server/test/neutrals.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { TEAM, KIND } from '../../shared/protocol.js';
import { acquire } from '../src/sim/combat.js';
import * as N from '../src/sim/neutrals.js';
import { getMap } from '../../shared/map.js';

const DT = 1 / 30;
const run = (w, sec) => { for (let i = 0, n = Math.round(sec / DT); i < n; i++) w.step(DT); };
const put = (w, u, x, y) => { w.teleport(u, x, y); w.index.insert(u); };
const CAMP = { x: 186, y: -5197 };
function mk(extra = {}) {
  const w = new World({ seed: 5, buildings: false, pregame: 0, neutrals: true, camps: [{ ...CAMP, tier: 'small' }], roshan: { x: 2904, y: -3000 }, ...extra });
  const h = w.addHero({ pid: 'a', team: TEAM.RADIANT, heroKey: 'npc_dota_hero_sven' });
  put(w, h, -3000, -3000);
  w.step(DT);
  return { w, h, camp: w.camps[0] };
}
const live = (c) => c.members.filter((m) => !m._dead);
const hit = (w, h, v, n = 1) => { for (let i = 0; i < n; i++) w.damage(h, v, 1, 'phys', { attack: true }); };

test('tiering: map camp boxes split 4/4/3/3 per side; real world has camps + pit', () => {
  const boxes = getMap().ents.camp;
  const t = N.tierCamps(boxes);
  assert.equal(t.length, boxes.length);
  const cnt = {}; for (const c of t) cnt[c.tier] = (cnt[c.tier] || 0) + 1;
  assert.deepEqual(cnt, { small: 8, medium: 8, large: 6, ancient: 6 });
  const real = new World({ seed: 1, pregame: 0 });
  assert.equal(real.camps.length, boxes.length);
  assert.ok(real.rosh && Math.abs(real.rosh.x - 2948) < 5);
});

test('camps spawn at 1:00 with the tier group and baked stats, not before', () => {
  const { w, camp } = mk();
  run(w, 59);
  assert.equal(live(camp).length, 0);
  run(w, 1.5);
  assert.equal(live(camp).length, 3);
  assert.deepEqual(camp.members.map((m) => m._neutral), N.GROUPS.small[0]);
  for (const m of camp.members) {
    assert.equal(m.team, TEAM.NEUTRAL); assert.equal(m.kind, KIND.CREEP);
    assert.ok(m.maxHp > 0 && m._base.xp > 0 && m._base.goldMax > 0, 'baked stats and bounty');
  }
});

test('respawn on the minute only when the box is empty', () => {
  const { w, h, camp } = mk();
  run(w, 61);
  assert.equal(live(camp).length, 3);
  run(w, 60);
  assert.equal(live(camp).length, 3, 'occupied: no stacking');
  for (const m of live(camp)) w.killUnit(m, h, null);
  run(w, 0.1);
  assert.equal(live(camp).length, 0);
  run(w, 60);
  assert.equal(live(camp).length, 3, 'empty box respawns');
  for (const m of live(camp)) w.killUnit(m, h, null);
  run(w, 0.1);
  put(w, h, CAMP.x, CAMP.y);
  run(w, 60);
  assert.equal(live(camp).length, 0, 'hero in the box blocks the spawn');
});

test('killing a neutral pays bounty gold + xp', () => {
  const { w, h, camp } = mk();
  run(w, 61);
  put(w, h, CAMP.x, CAMP.y + 150);
  const p = w.players.get('a'), g = p.gold, xp = h.xp;
  w.killUnit(camp.members[0], h, null);
  assert.ok(p.gold > g, 'gold');
  assert.ok(h.xp > xp || h.level > 1, 'xp');
});

test('idle camps are ignored by lane creeps/bots, picked by human heroes; a hit wakes the whole camp', () => {
  const { w, h, camp } = mk();
  run(w, 61);
  const m = camp.members[0];
  const creep = w.spawnSummon(h, { key: 'x', kind: KIND.CREEP, x: m.x, y: m.y + 100, hp: 500, ms: 300 });
  creep.owner = null;
  w.index.insert(creep);
  assert.equal(acquire(w, creep, 800), null, 'lane creep skips idle neutral');
  put(w, creep, 3000, 3000);
  const bot = w.addHero({ pid: 'b', team: TEAM.DIRE, heroKey: 'npc_dota_hero_lina', bot: true });
  put(w, bot, m.x + 200, m.y + 50);
  assert.equal(acquire(w, bot, 800), null, 'bot skips idle neutral');
  put(w, bot, 3000, 3000);
  put(w, h, m.x + 200, m.y);
  const pick = acquire(w, h, 800);
  assert.ok(pick && pick.team === TEAM.NEUTRAL, 'human hero can pick it');
  hit(w, h, m);
  assert.ok(camp.members.every((x) => x._aggro), 'whole camp awake');
  assert.equal(m._tgt, h);
  put(w, bot, m.x + 200, m.y + 50);
  put(w, h, -3000, -3000);
  assert.ok(acquire(w, bot, 800), 'aggro neutral is a valid target');
});

test('leash: puller is chased up to the leash, then the camp heals and walks home', () => {
  const { w, h, camp } = mk();
  run(w, 61);
  const m = camp.members[0];
  put(w, h, CAMP.x, CAMP.y + 200);
  hit(w, h, m, 3);
  run(w, 1);
  assert.ok(live(camp).every((x) => x._aggro));
  for (let i = 0; i < 30 * 15 && !camp.members.some((x) => x._ret); i++) { put(w, h, CAMP.x, CAMP.y + 1500); w.step(DT); }
  assert.ok(camp.members.some((x) => x._ret), 'camp returned');
  for (const x of camp.members) assert.equal(x._tgt, null);
  put(w, h, -3000, -3000);
  run(w, 15);
  for (const x of camp.members) {
    assert.ok(!x._ret && !x._aggro, 'settled');
    assert.ok(Math.hypot(x.x - x._home.x, x.y - x._home.y) < 60, 'back home');
    assert.equal(Math.round(x.hp), Math.round(x.maxHp), 'healed');
  }
});

test('Roshan: spawns with baked stats, slams, leashes back to the pit', () => {
  const { w, h } = mk();
  run(w, 1);
  const r = w.rosh.unit;
  assert.ok(r && r._roshan && r.maxHp === 6000 && r.team === TEAM.NEUTRAL);
  h.hp = h.maxHp = 100000;
  put(w, h, r.x + 120, r.y);
  hit(w, h, r);
  const hp0 = h.hp;
  run(w, 2);
  assert.ok(h.hp < hp0, 'roshan hurts');
  assert.ok(r._slamAt > 0, 'slam fired');
  for (let i = 0; i < 30 * 15 && !r._ret; i++) { put(w, h, r._home.x - 1500, r._home.y); w.step(DT); }
  assert.ok(r._ret, 'leash return');
  put(w, h, -3000, -3000);
  run(w, 15);
  assert.ok(!r._ret && Math.round(r.hp) === r.maxHp);
});

test('Roshan death: Aegis to killer; carrier dies -> reincarnates in place after 5s, no death counted; respawn 8-11 min', () => {
  const { w, h } = mk();
  run(w, 1);
  const r = w.rosh.unit, t0 = w.time;
  put(w, h, r.x + 100, r.y);
  w.killUnit(r, h, null);
  run(w, 0.1);
  assert.equal(w.rosh.unit, null);
  assert.equal(w.rosh.deaths, 1);
  assert.ok(h.items.some((i) => i.key === 'item_aegis'), 'killer holds the Aegis');
  const p = w.players.get('a'), deaths = p.deaths, spot = { x: h.x, y: h.y };
  const e = w.addHero({ pid: 'b', team: TEAM.DIRE, heroKey: 'npc_dota_hero_lina' });
  w.killUnit(h, e, null);
  assert.equal(h.respawn, 5);
  assert.equal(p.deaths, deaths, 'no death counted');
  assert.equal(h.items.some((i) => i.key === 'item_aegis'), false, 'aegis consumed');
  run(w, 5.5);
  assert.ok(!h._dead && h.hp > 0, 'reincarnated');
  assert.ok(Math.hypot(h.x - spot.x, h.y - spot.y) < 100, 'at the death spot');
  run(w, 480 - (w.time - t0) - 1);
  assert.equal(w.rosh.unit, null, 'not before 8 min');
  run(w, 11 * 60 - 480 + 2);
  assert.ok(w.rosh.unit && !w.rosh.unit._dead, 'back by 11 min');
});

test('Aegis expires after 5 minutes', () => {
  const { w, h } = mk();
  run(w, 1);
  w.killUnit(w.rosh.unit, h, null);
  run(w, 0.1);
  assert.ok(h.items.some((i) => i.key === 'item_aegis'));
  run(w, 299);
  assert.ok(h.items.some((i) => i.key === 'item_aegis'));
  run(w, 2);
  assert.equal(h.items.some((i) => i.key === 'item_aegis'), false);
});
