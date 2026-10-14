// Item tests: node --test server/test/items.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { TEAM, ST, EV } from '../../shared/protocol.js';
import * as items from '../src/sim/items.js';

const DT = 1 / 30;
const run = (w, sec) => { for (let i = 0, n = Math.round(sec / DT); i < n; i++) w.step(DT); };
const SVEN = 'npc_dota_hero_sven', LINA = 'npc_dota_hero_lina';
const put = (w, u, x, y) => { w.teleport(u, x, y); w.index.insert(u); };
const keys = (u) => u.items.map((i) => i.key.replace('item_', '')).filter(Boolean);
function setup(withEnemy) {
  const w = new World({ seed: 7, pregame: 0 });
  const h = w.addHero({ pid: 'a', team: TEAM.RADIANT, heroKey: SVEN });
  const p = w.players.get('a'); p.gold = 50000;
  w.step(DT);
  const out = { w, h, p, buy: (k) => w.order('a', { t: 'buy', key: 'item_' + k }), slot: (k) => h.items.findIndex((i) => i.key === 'item_' + k) };
  if (withEnemy) out.e = w.addHero({ pid: 'b', team: TEAM.DIRE, heroKey: LINA });
  return out;
}

test('buy: basic, stack, recipe from parts, recipe missing parts, full inventory', () => {
  const { w, h, p, buy } = setup();
  assert.equal(buy('tango'), true); assert.equal(buy('tango'), true);
  assert.equal(h.items[0].charges, 6, 'tango stacks charges');
  assert.equal(keys(h).length, 1);
  buy('magic_stick'); buy('branches'); buy('branches');
  const g = p.gold;
  assert.equal(buy('magic_wand'), true);
  assert.equal(p.gold, g - 150, 'only the recipe is paid when parts are held');
  assert.deepEqual(keys(h), ['tango', 'magic_wand']);
  const g2 = p.gold;
  assert.equal(buy('bracer'), true);
  assert.equal(p.gold, g2 - w.data.items.item_bracer.cost, 'missing parts bought');
  assert.ok(keys(h).includes('bracer'));
  buy('boots'); buy('gloves');
  assert.equal(keys(h).includes('power_treads'), false);
  buy('robe');
  assert.ok(keys(h).includes('power_treads'), 'free recipe auto-combines');
  assert.equal(h.items.find((i) => i.key === 'item_power_treads')._attr, 'int');
  assert.equal(keys(h).filter((k) => k === 'boots' || k === 'gloves' || k === 'robe').length, 0);
  const g3 = p.gold;
  assert.equal(buy('black_king_bar'), true);
  assert.equal(p.gold, g3 - w.data.items.item_black_king_bar.cost);
  while (keys(h).length < 6) assert.equal(buy('sobi_mask') || buy('gauntlets'), true);
  assert.equal(h.items.every((i) => i.key), true);
  assert.equal(buy('gauntlets'), false, 'full inventory refuses');
  assert.equal(buy('tango'), true, 'but stacks still work');
});

test('buy: refused without gold and far from the shop', () => {
  const { w, h, p, buy } = setup();
  p.gold = 10; assert.equal(buy('blink'), false);
  p.gold = 9999; put(w, h, 0, 0);
  assert.equal(buy('blink'), false, 'too far from shop');
});

test('sell: 100% inside 10 s, 50% after; swap', () => {
  const { w, h, p, buy } = setup();
  p.gold = 1000; buy('boots');
  assert.equal(p.gold, 500);
  assert.equal(w.order('a', { t: 'sell', slot: 0 }), true);
  assert.equal(p.gold, 1000);
  buy('boots'); run(w, 11);
  assert.equal(w.order('a', { t: 'sell', slot: 0 }), true);
  assert.ok(p.gold >= 750 && p.gold < 800, 'half refund ' + p.gold);
  assert.equal(h.items[0].key, '');
  buy('tango'); buy('boots');
  assert.equal(w.order('a', { t: 'swap', a: 0, b: 1 }), true);
  assert.equal(h.items[0].key, 'item_boots');
});

test('stats: boots ms do not stack, treads attribute toggles', () => {
  const { w, h, buy, slot } = setup();
  w.step(DT);
  const ms0 = h.ms, str0 = h.str, agi0 = h.agi;
  buy('boots'); w.step(DT);
  assert.equal(h.ms, ms0 + 45);
  buy('gloves'); buy('belt_of_strength'); w.step(DT);
  const s = slot('power_treads'); assert.ok(s >= 0);
  assert.equal(h.items[s]._attr, 'str');
  assert.equal(h.ms, ms0 + 55, 'treads replace boots ms');
  assert.equal(h.str, str0 + 10);
  w.order('a', { t: 'item', slot: s }); run(w, 0.2);
  assert.equal(h.items[s]._attr, 'agi');
  assert.equal(h.str, str0);
  assert.equal(h.agi, agi0 + 10);
  w.order('a', { t: 'item', slot: s }); run(w, 0.2);
  assert.equal(h.items[s]._attr, 'int');
});

test('BKB: magic immune, dispels, duration shrinks 9 -> 8, mana and cooldown', () => {
  const { w, h, buy, slot } = setup();
  buy('black_king_bar'); const s = slot('black_king_bar');
  h.mana = h.maxMana;
  w.addModifier(h, { key: 'test_slow', src: null, dur: 30, msPct: -50, debuff: true });
  const mana0 = h.mana;
  assert.equal(w.order('a', { t: 'item', slot: s }), true);
  run(w, 0.2);
  assert.ok(h._st & ST.MAGIC_IMMUNE, 'magic immune');
  assert.equal(w.hasModifier(h, 'test_slow'), false, 'debuff dispelled');
  assert.ok(h.mana < mana0);
  const it = h.items[s]; assert.ok(it.cd > 90);
  run(w, 8.5); assert.ok(h._st & ST.MAGIC_IMMUNE, 'still on at 8.7 s');
  run(w, 0.8); assert.equal(h._st & ST.MAGIC_IMMUNE, 0, 'off after 9 s');
  assert.equal(items.useInfo(w, h, s).ready, false, 'on cooldown');
  it.cd = 0; h.mana = h.maxMana;
  w.order('a', { t: 'item', slot: s }); run(w, 8.3);
  assert.equal(h._st & ST.MAGIC_IMMUNE, 0, 'second use lasts 8 s');
  assert.equal(it._uses, 2);
});

test('blink: clamps to 1200, 3 s lock after hero damage, not usable rooted', () => {
  const { w, h, e, buy, slot } = setup(true);
  buy('blink'); const s = slot('blink');
  put(w, h, -3000, -3000);
  const x0 = h.x, y0 = h.y;
  assert.equal(items.useInfo(w, h, s).ready, true);
  w.drainEvents();
  w.order('a', { t: 'item', slot: s, x: x0 + 2000, y: y0 });
  run(w, 0.3);
  const d = Math.hypot(h.x - x0, h.y - y0);
  assert.ok(d > 1000 && d <= 1201, `blinked ${d}`);
  assert.ok(h.items[s].cd > 14);
  assert.ok(w.drainEvents().some((ev) => ev.e === EV.BLINK));
  h.items[s].cd = 0;
  put(w, e, h.x + 300, h.y);
  w.damage(e, h, 10, 'pure');
  put(w, e, h.x + 3000, h.y);
  assert.equal(items.useInfo(w, h, s).ready, false);
  assert.ok(h.items[s].cd >= 2.9);
  run(w, 3.2);
  assert.equal(items.useInfo(w, h, s).ready, true);
  w.addModifier(h, { key: 'rt', src: null, dur: 5, status: ST.ROOT, debuff: true });
  w.step(DT);
  assert.equal(items.useInfo(w, h, s).ready, false, 'rooted');
});

test('tango: eats a tree, regen buff, consumes a charge', () => {
  const { w, h, buy, slot } = setup();
  buy('tango'); const s = slot('tango');
  const tr = w.map.trees; let ti = 0;
  for (let i = 0; i < tr.length; i++) if (Math.hypot(tr[i][0] - h.x, tr[i][1] - h.y) < Math.hypot(tr[ti][0] - h.x, tr[ti][1] - h.y)) ti = i;
  put(w, h, tr[ti][0] + 110, tr[ti][1]);
  h.hp = h.maxHp - 200;
  assert.equal(w.order('a', { t: 'item', slot: s, x: tr[ti][0], y: tr[ti][1] }), true);
  run(w, 1);
  assert.ok(w.treesDown.has(ti), 'tree cut');
  assert.equal(h.items[s].charges, 2);
  assert.equal(w.hasModifier(h, 'item_tango'), true);
  const hp = h.hp; run(w, 2); assert.ok(h.hp > hp + 10, 'regen');
});

test('tp scroll: 3 s channel to nearest allied building, interrupt keeps the charge', () => {
  const { w, h, buy, slot } = setup();
  buy('tpscroll'); const s = slot('tpscroll');
  const t1 = w.towers.find((t) => t.team === h.team && t._lane === 'mid' && t._tier === 1) || w.towers.find((t) => t.team === h.team);
  h.mana = h.maxMana;
  w.drainEvents();
  assert.equal(w.order('a', { t: 'item', slot: s, x: t1.x, y: t1.y + 400 }), true);
  run(w, 0.2);
  const ev = w.drainEvents().find((e) => e.e === EV.TP);
  assert.ok(ev && ev.dur === 3, 'EV.TP at channel start');
  assert.ok(h._channel, 'channeling');
  run(w, 3.1);
  assert.ok(Math.hypot(h.x - t1.x, h.y - t1.y) < 400, `landed near tower: ${h.x | 0},${h.y | 0} vs ${t1.x | 0},${t1.y | 0}`);
  assert.equal(slot('tpscroll'), -1, 'last charge consumed');
  const home = { x: -7128, y: -7032 }; put(w, h, home.x, home.y);
  buy('tpscroll'); const s2 = slot('tpscroll');
  assert.ok(s2 >= 0);
  const mana = h.mana;
  w.order('a', { t: 'item', slot: s2, x: t1.x, y: t1.y }); run(w, 1);
  assert.ok(h._channel);
  const px = h.x, py = h.y;
  w.order('a', { t: 'move', x: h.x + 300, y: h.y }); run(w, 3.5);
  assert.equal(h.items[s2].key, 'item_tpscroll');
  assert.equal(h.items[s2].charges, 1, 'charge kept on interrupt');
  assert.ok(Math.hypot(h.x - px, h.y - py) < 400, 'did not teleport');
  assert.ok(h.mana >= mana - 20, 'mana refunded');
});

test('flask breaks on enemy hero damage; clarity, faerie, mango, stick', () => {
  const { w, h, e, buy, slot } = setup(true);
  put(w, e, h.x + 400, h.y + 400);
  buy('flask'); buy('clarity'); buy('faerie_fire'); buy('enchanted_mango'); buy('magic_stick');
  h.hp = h.maxHp * 0.3; h.mana = 0;
  w.order('a', { t: 'item', slot: slot('flask'), id: h.id }); run(w, 0.3);
  assert.equal(w.hasModifier(h, 'item_flask'), true);
  w.damage(e, h, 5, 'pure'); w.step(DT);
  assert.equal(w.hasModifier(h, 'item_flask'), false, 'broken by hero damage');
  assert.equal(slot('flask'), -1);
  w.order('a', { t: 'item', slot: slot('clarity'), id: h.id }); run(w, 0.3);
  assert.equal(w.hasModifier(h, 'item_clarity'), true);
  const m = h.mana; run(w, 2); assert.ok(h.mana > m + 8);
  const hp = h.hp;
  w.order('a', { t: 'item', slot: slot('faerie_fire') }); run(w, 0.3);
  assert.ok(h.hp >= hp + 80);
  const m2 = h.mana;
  w.order('a', { t: 'item', slot: slot('enchanted_mango') }); run(w, 0.2);
  assert.ok(h.mana >= m2 + 99);
  const st = h.items[slot('magic_stick')];
  items.onEnemySpell(w, h, e, 'x'); items.onEnemySpell(w, h, e, 'x');
  assert.equal(st.charges, 2);
  h.hp = 100; h.mana = 0;
  w.order('a', { t: 'item', slot: slot('magic_stick') }); run(w, 0.3);
  assert.ok(h.hp >= 130 && h.mana >= 29);
  assert.equal(st.charges, 0);
});

test('lesser crit rolls crits, quelling blade bonus vs creeps, phase boots haste', () => {
  const { w, h, buy, slot } = setup();
  buy('lesser_crit');
  let crits = 0;
  for (let i = 0; i < 400; i++) { const info = { dmg: 100, crit: 1 }; items.onAttack(w, h, h, info); if (info.crit > 1) crits++; }
  assert.ok(crits > 80 && crits < 160, `crits ${crits}`);
  const info = { dmg: 100, crit: 1 }; for (let i = 0; i < 100 && info.crit === 1; i++) items.onAttack(w, h, h, info);
  assert.equal(info.crit, 1.6);
  buy('quelling_blade');
  const cr = [...w.units.values()].find((u) => u.kind === 'creep');
  const i2 = { dmg: 100, crit: 1 }; if (cr) { items.onAttack(w, h, cr, i2); assert.ok(i2.dmg >= 108); }
  buy('phase_boots');
  const ms = h.ms; w.order('a', { t: 'item', slot: slot('phase_boots') }); run(w, 0.2);
  assert.ok(h.ms > ms * 1.1, 'phase speed');
  assert.equal(h._noCollide, true);
  run(w, 3.2); assert.ok(!h._noCollide);
});
