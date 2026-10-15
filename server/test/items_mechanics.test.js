// Item mechanics from items.txt (behaviour flags, PRD, immunity, data rules): node --test server/test/items_mechanics.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { TEAM, ST, KIND, ORDER } from '../../shared/protocol.js';
import * as items from '../src/sim/items.js';
import { executeAbility } from '../src/sim/orders.js';
import { prdC } from '../src/sim/prd.js';
import { ATTR } from '../../shared/constants.js';

const DT = 1 / 30;
const run = (w, sec) => { for (let i = 0, n = Math.round(sec / DT); i < n; i++) w.step(DT); };
const put = (w, u, x, y) => { w.teleport(u, x, y); w.index.insert(u); };
function setup({ enemy = false, ally = false } = {}) {
  const w = new World({ seed: 7, pregame: 0 });
  const h = w.addHero({ pid: 'a', team: TEAM.RADIANT, heroKey: 'npc_dota_hero_sven' });
  const p = w.players.get('a'); p.gold = 50000;
  w.step(DT);
  const out = { w, h, p, buy: (k) => w.order('a', { t: 'buy', key: 'item_' + k }), slot: (k) => h.items.findIndex((i) => i.key === 'item_' + k) };
  if (enemy) { out.e = w.addHero({ pid: 'b', team: TEAM.DIRE, heroKey: 'npc_dota_hero_lina' }); out.e._noAttack = true; }
  if (ally) out.a = w.addHero({ pid: 'c', team: TEAM.RADIANT, heroKey: 'npc_dota_hero_lina' });
  w.step(DT);
  return out;
}
const dist = (u, x, y) => Math.hypot(u.x - x, u.y - y);

test('phase boots (IMMEDIATE) while moving keeps the move order and the walk carries on', () => {
  const { w, h, buy, slot } = setup();
  buy('phase_boots');
  const tx = h.x + 3000, ty = h.y + 3000;
  w.order('a', { t: 'move', x: tx, y: ty }); run(w, 0.5);
  const d0 = dist(h, tx, ty);
  assert.equal(w.order('a', { t: 'item', slot: slot('phase_boots') }), true);
  assert.equal(h._q.length, 1, 'phase did not enter the queue');
  assert.equal(h._q[0].t, ORDER.MOVE); assert.equal(h._q[0].x, tx); assert.equal(h._q[0].y, ty);
  assert.ok(h.items[slot('phase_boots')].cd > 0, 'fired at once');
  w.step(DT);
  assert.ok(dist(h, tx, ty) < d0, 'kept walking on the very next tick');
  run(w, 0.5);
  assert.ok(dist(h, tx, ty) < d0 - 150, `progress after phase: ${d0 - dist(h, tx, ty)}`);
  assert.equal(h._noCollide, true);
});

test('phase boots while attacking keeps the attack target; salve (DONT_RESUME_ATTACK) drops it', () => {
  const { w, h, e, buy, slot } = setup({ enemy: true });
  buy('phase_boots'); buy('flask'); buy('faerie_fire');
  put(w, e, h.x + 900, h.y);
  w.order('a', { t: 'attack', id: e.id }); run(w, 0.3);
  assert.equal(w.order('a', { t: 'item', slot: slot('phase_boots') }), true);
  assert.equal(h._q[0].t, ORDER.ATTACK); assert.equal(h._q[0].id, e.id);
  const d0 = dist(h, e.x, e.y); run(w, 0.5);
  assert.ok(dist(h, e.x, e.y) < d0 - 50, 'still chasing the target');
  assert.equal(h._q[0].id, e.id);
  w.order('a', { t: 'item', slot: slot('faerie_fire') });
  assert.equal(h._q[0] && h._q[0].id, e.id, 'faerie fire keeps the attack');
  w.order('a', { t: 'item', slot: slot('flask'), id: h.id });
  assert.equal(w.hasModifier(h, 'item_flask'), true, 'salve applied at once');
  assert.equal(h._q.length, 0, 'salve drops the attack order (DONT_RESUME_ATTACK)');
  assert.equal(h._tgt, null);
});

test('IGNORE_CHANNEL: phase during a TP channel keeps the channel; BKB (no flag) breaks it', () => {
  const { w, h, buy, slot } = setup();
  buy('phase_boots'); buy('tpscroll'); buy('black_king_bar');
  h.mana = h.maxMana;
  const t1 = w.towers.find((t) => t.team === h.team);
  w.order('a', { t: 'item', slot: slot('tpscroll'), x: t1.x, y: t1.y }); run(w, 0.5);
  assert.ok(h._channel, 'channeling');
  w.order('a', { t: 'item', slot: slot('phase_boots') }); w.step(DT);
  assert.ok(h._channel, 'phase kept the channel');
  assert.ok(h.items[slot('phase_boots')].cd > 0, 'phase fired');
  w.order('a', { t: 'item', slot: slot('black_king_bar') }); run(w, 0.3);
  assert.ok(!h._channel, 'bkb interrupts the TP');
});

test('BKB: 60% magic resistance (not magic immunity), pure damage blocked, physical not', () => {
  const { w, h, e, buy, slot } = setup({ enemy: true });
  buy('black_king_bar'); h.mana = h.maxMana;
  const mr0 = h._mr;
  w.order('a', { t: 'item', slot: slot('black_king_bar') }); run(w, 0.2);
  assert.ok(h._st & ST.MAGIC_IMMUNE);
  assert.ok(Math.abs((1 - h._mr) - (1 - mr0) * 0.4) < 1e-6, `mr ${mr0} -> ${h._mr}`);
  const hp = h.hp;
  assert.ok(Math.abs(w.damage(e, h, 100, 'mag') - 100 * (1 - h._mr)) < 1e-6, 'magic damage goes through, reduced');
  assert.equal(w.damage(e, h, 100, 'pure'), 0, 'pure blocked');
  assert.ok(w.damage(e, h, 100, 'phys') > 0, 'physical goes through');
  assert.ok(h.hp < hp);
});

test('Blade Fury: debuff immune with 80% magic resistance', () => {
  const w = new World({ seed: 5, pregame: 0, buildings: false });
  const c = w.addHero({ pid: 'a', team: TEAM.RADIANT, heroKey: 'npc_dota_hero_juggernaut' });
  c.level = 25; c.skillPoints = 40; w.step(DT);
  const i = c.abilities.findIndex((a) => a.key === 'juggernaut_blade_fury');
  w.order('a', { t: 'learn', slot: i }); c.mana = c.maxMana; w.step(DT);
  const mr0 = c._mr;
  w.order('a', { t: 'cast', slot: i }); run(w, 0.3);
  assert.ok(c._st & ST.MAGIC_IMMUNE);
  const ir = w.val('juggernaut_blade_fury', 'immunity_resist', 1);
  assert.equal(ir, 80);
  assert.ok(Math.abs((1 - c._mr) - (1 - mr0) * 0.2) < 1e-6, `mr ${mr0} -> ${c._mr}`);
});

test('null talisman: +3% max mana (bonus_max_mana_percentage)', () => {
  const { w, h, buy } = setup();
  const m0 = h.maxMana;
  buy('null_talisman'); w.step(DT);
  const int = w.data.items.item_null_talisman.stats.int;
  const pct = w.data.items.item_null_talisman.stats.manaPct;
  assert.equal(pct, 3);
  const want = (m0 + int * ATTR.manaPerInt) * (1 + pct / 100);
  assert.ok(Math.abs(h.maxMana - want) < 1e-6, `max mana ${h.maxMana} vs ${want}`);
});

test('mango: a stack holds at most 3; castable on an allied hero within 400', () => {
  const { w, h, a, buy, slot } = setup({ ally: true });
  for (let i = 0; i < 4; i++) assert.equal(buy('enchanted_mango'), true);
  const st = h.items.filter((it) => it.key === 'item_enchanted_mango').map((it) => it.charges);
  assert.deepEqual(st, [3, 1], 'ItemStackableMax 3');
  put(w, a, h.x + 300, h.y); a.mana = 0;
  const s = slot('enchanted_mango'), c0 = h.items[s].charges;
  w.order('a', { t: 'item', slot: s, id: a.id }); w.step(DT);
  assert.ok(a.mana >= 99, 'ally got the mana');
  assert.equal(h.items[s].charges, c0 - 1);
  put(w, a, h.x + 1200, h.y); a.mana = 0; h.items[s].cd = 0;
  w.order('a', { t: 'item', slot: s, id: a.id }); w.step(DT);
  assert.equal(a.mana < 5, true, 'out of range: not fed');
});

test('salve on an ally heals at half rate; salve / clarity break only on hero damage', () => {
  const { w, h, a, e, buy, slot } = setup({ ally: true, enemy: true });
  buy('flask'); buy('flask'); buy('clarity');
  put(w, h, -3000, -3000); put(w, a, h.x + 150, h.y);   // away from the fountain aura
  a.hp = a.maxHp * 0.3; h.hp = h.maxHp * 0.3; w.step(DT);
  const ba = a._hpRegen, bh = h._hpRegen;
  w.order('a', { t: 'item', slot: slot('flask'), id: a.id }); w.step(DT);
  w.order('a', { t: 'item', slot: slot('flask'), id: h.id }); w.step(DT);
  const ha = a.hp, hh = h.hp; run(w, 2);
  const ra = (a.hp - ha) / 2 - ba, rh = (h.hp - hh) / 2 - bh;
  assert.ok(Math.abs(ra / rh - 0.5) < 0.05, `ally ${ra} vs self ${rh}`);
  w.order('a', { t: 'item', slot: slot('clarity'), id: h.id }); w.step(DT);
  const cr = { id: 'stub', kind: KIND.CREEP, team: TEAM.DIRE };
  items.onDamaged(w, h, cr, 10, 'phys');
  assert.equal(w.hasModifier(h, 'item_flask'), true, 'creep damage keeps salve');
  assert.equal(w.hasModifier(h, 'item_clarity'), true, 'creep damage keeps clarity');
  items.onDamaged(w, h, e, 10, 'phys');
  assert.equal(w.hasModifier(h, 'item_flask'), false);
  assert.equal(w.hasModifier(h, 'item_clarity'), false);
});

test('quelling blade: unique (two do not stack), any non-hero non-building', () => {
  const { w, h, e, buy } = setup({ enemy: true });
  buy('quelling_blade'); buy('quelling_blade');
  const bonus = w.data.items.item_quelling_blade.values.damage_bonus;   // Sven is melee
  const hit = (t) => { const i = { dmg: 100, crit: 1 }; items.onAttack(w, h, t, i); return i.dmg - 100; };
  assert.equal(hit({ kind: KIND.CREEP }), bonus, 'creep: one bonus only');
  assert.equal(hit({ kind: KIND.SUMMON }), bonus, 'summon');
  assert.equal(hit(e), 0, 'hero');
  assert.equal(hit(w.towers[0]), 0, 'building');
});

test('crystalys: PRD at 30% (rate, bounded streak), never on buildings', () => {
  const { w, h, buy } = setup();
  buy('lesser_crit');
  const C = prdC(0.3); assert.ok(C > 0.11 && C < 0.125, `C ${C}`);
  const tgt = { kind: KIND.CREEP };
  let crits = 0, miss = 0, worst = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) {
    const info = { dmg: 100, crit: 1 }; items.onAttack(w, h, tgt, info);
    if (info.crit > 1) { crits++; miss = 0; } else worst = Math.max(worst, ++miss);
  }
  assert.ok(Math.abs(crits / N - 0.3) < 0.015, `rate ${crits / N}`);
  assert.ok(worst <= Math.ceil(1 / C) - 1, `longest miss streak ${worst}`);
  for (let i = 0; i < 200; i++) { const info = { dmg: 100, crit: 1 }; items.onAttack(w, h, w.towers[0], info); assert.equal(info.crit, 1); }
});

test('magic stick: charge only from a visible enemy cast inside charge_radius', () => {
  const { w, h, e, buy, slot } = setup({ enemy: true });
  buy('magic_stick');
  const st = h.items[slot('magic_stick')];
  const R = items.STICK_RADIUS(w); assert.equal(R, 1200);
  const ab = e.abilities[0]; ab.level = 1; e.mana = e.maxMana;
  put(w, e, h.x + 600, h.y); w.step(DT);
  executeAbility(w, e, ab, { unit: null, x: e.x + 100, y: e.y });
  assert.equal(st.charges, 1, 'near and seen');
  put(w, e, h.x + R + 200, h.y); w.step(DT); e.mana = e.maxMana;
  executeAbility(w, e, ab, { unit: null, x: e.x + 100, y: e.y });
  assert.equal(st.charges, 1, 'outside charge_radius');
});

test('data rules: TP mana/channel, aegis not buyable and not backpackable', () => {
  const { w, h, buy } = setup();
  const tp = w.data.items.item_tpscroll;
  assert.equal(tp.channel, 3); assert.equal(tp.manaCost, 75);
  assert.equal(buy('aegis'), false, 'ItemPurchasable 0');
  items.grantAegis(w, h);
  const i = h.items.findIndex((it) => it.key === 'item_aegis');
  assert.ok(i >= 0 && i < 6);
  assert.equal(items.swap(w, h, i, 6), false, 'AllowedInBackpack 0');
});

test('blink self-cast goes toward the team fountain', () => {
  const { w, h, buy, slot } = setup();
  buy('blink');
  put(w, h, 0, 0); w.step(DT);
  const f = w.fountains[h.team], d0 = dist(h, f.x, f.y);
  w.order('a', { t: 'item', slot: slot('blink'), id: h.id }); run(w, 0.3);
  assert.ok(dist(h, f.x, f.y) < d0 - 900, `moved ${d0 - dist(h, f.x, f.y)} toward the fountain`);
});
