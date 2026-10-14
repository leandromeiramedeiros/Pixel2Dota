// Observer / sentry wards: node --test server/test/wards.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { TEAM, KIND, ST } from '../../shared/protocol.js';
import { attackable, acquire } from '../src/sim/combat.js';
import * as items from '../src/sim/items.js';

const DT = 1 / 30;
const run = (w, sec) => { for (let i = 0, n = Math.round(sec / DT); i < n; i++) w.step(DT); };
const put = (w, u, x, y) => { w.teleport(u, x, y); w.index.insert(u); };
function setup() {
  const w = new World({ seed: 7, pregame: 0, neutrals: false });
  const h = w.addHero({ pid: 'a', team: TEAM.RADIANT, heroKey: 'npc_dota_hero_sven' });
  const e = w.addHero({ pid: 'b', team: TEAM.DIRE, heroKey: 'npc_dota_hero_lina' });
  w.players.get('a').gold = 50000;
  e.home = { x: e.x, y: e.y };
  put(w, e, 3000, 3000);
  w.step(DT);
  return { w, h, e, p: w.players.get('a'), buy: (k) => w.order('a', { t: 'buy', key: k }), slot: (k) => h.items.findIndex((i) => i.key === k) };
}
const OBS = 'item_ward_observer', SEN = 'item_ward_sentry';
function place(w, h, key, x, y) {
  const s = h.items.findIndex((i) => i.key === key);
  assert.ok(s >= 0, 'has ' + key);
  put(w, h, x, y);
  w.order(h.owner, { t: 'item', slot: s, x, y });
  w.step(DT);
  return [...w.units.values()].filter((u) => u.kind === KIND.WARD && u.team === h.team).pop();
}

test('shop stock: observer 2, then Out of stock, restock after 135 s; sentry stocked too', () => {
  const { w, h, buy } = setup();
  assert.equal(items.stockLeft(w, TEAM.RADIANT, OBS), 2);
  assert.equal(buy(OBS), true); assert.equal(buy(OBS), true);
  assert.equal(h.items.find((i) => i.key === OBS).charges, 2, 'stacks');
  assert.equal(buy(OBS), false, 'out of stock');
  assert.equal(items.stockLeft(w, TEAM.RADIANT, OBS), 0);
  assert.equal(items.stockLeft(w, TEAM.DIRE, OBS), 2, 'stock is per team');
  run(w, 136);
  assert.equal(items.stockLeft(w, TEAM.RADIANT, OBS), 1, 'one charge restocked');
  assert.equal(buy(OBS), true);
  const s0 = items.stockLeft(w, TEAM.RADIANT, SEN);
  assert.equal(buy(SEN), true);
  assert.equal(items.stockLeft(w, TEAM.RADIANT, SEN), s0 - 1);
});

test('observer: ground-targeted, invisible to enemies, 1600 vision, 360 s life, uses a charge', () => {
  const { w, h, e, buy } = setup();
  buy(OBS); buy(OBS);
  const ward = place(w, h, OBS, 0, 0);
  assert.ok(ward, 'ward spawned');
  assert.equal(h.items.find((i) => i.key === OBS).charges, 1, 'charge spent');
  assert.equal(ward.kind, KIND.WARD); assert.equal(ward.team, TEAM.RADIANT);
  assert.ok(ward._st & ST.INVIS);
  assert.equal(w.visionRadius(ward), 1600);
  assert.equal(attackable(e, ward), false, 'enemy cannot target an unrevealed ward');
  assert.equal(attackable(h, ward) === false, true, 'own ward is not an attack target');
  assert.ok(Math.abs(ward._expire - (w.time + 360)) < 1);
  const id = ward.id;
  run(w, 361);
  assert.equal(w.units.has(id), false, 'expired');
});

test('sentry: reveals enemy wards inside true sight radius only; revealed ward dies in 2 hits; observer pays bounty', () => {
  const { w, h, e } = setup();
  w.players.get('a').gold = 50000;
  w.order('a', { t: 'buy', key: OBS });
  w.order('a', { t: 'buy', key: SEN });
  const obs = place(w, h, OBS, 2000, 0);
  const sen = place(w, h, SEN, -2000, 0);
  assert.equal(sen._ward, 'sentry'); assert.equal(obs._ward, 'observer');
  assert.ok(Math.abs(sen._expire - (w.time + 420)) < 1);
  assert.equal(w.visionRadius(sen) < 400, true, 'sentry itself sees little');
  // dire bot-less hero buys a sentry and drops it next to the radiant observer
  const dp = w.players.get('b'); dp.gold = 5000;
  put(w, e, e.home.x, e.home.y);
  w.order('b', { t: 'buy', key: SEN });
  const dsen = place(w, e, SEN, 2000 + 800, 0);
  assert.ok(dsen && dsen.team === TEAM.DIRE);
  run(w, 0.6);
  assert.equal(attackable(h, dsen), false, 'invisible sentry unseen before it is revealed');
  assert.ok(obs._st & ST.REVEALED, 'radiant observer within 1050 of the dire sentry is revealed');
  assert.equal(attackable(e, obs), true, 'enemy can now attack the revealed observer');
  assert.ok(!(sen._st & ST.REVEALED), 'ward out of range stays hidden');
  // kill the revealed observer: one hit leaves it alive, the second kills; killer gets the bounty
  put(w, e, obs.x + 80, obs.y);
  const g = dp.gold;
  w.damage(e, obs, 40, 'phys', { attack: true });
  assert.ok(!obs._dead, 'one hit does not kill');
  w.damage(e, obs, 40, 'phys', { attack: true });
  assert.ok(obs._dead, 'two hits kill');
  assert.ok(dp.gold >= g + 50, 'observer bounty');
});

test('sentry expires after 420 s; its true sight reveals invisible enemy heroes in range', () => {
  const { w, h, e } = setup();
  w.order('a', { t: 'buy', key: SEN });
  const sen = place(w, h, SEN, 500, 500);
  put(w, e, 500 + 600, 500);
  w.addModifier(e, { key: 'test_invis', src: e, dur: 20, status: ST.INVIS });
  run(w, 0.6);
  assert.ok(e._st & ST.REVEALED, 'in range: revealed');
  assert.equal(attackable(h, e), true);
  put(w, e, 500 + 1500, 500);
  run(w, 1);
  assert.ok(!(e._st & ST.REVEALED), 'out of range: not revealed');
  const id = sen.id;
  run(w, 421);
  assert.equal(w.units.has(id), false, 'expired');
});
