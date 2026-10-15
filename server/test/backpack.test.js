// Backpack tests (6 main + 3 backpack slots): node --test server/test/backpack.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { TEAM, INV_SLOTS, ACTIVE_SLOTS, BACKPACK_SWAP_CD } from '../../shared/protocol.js';
import { HERO_KEYS } from '../../shared/heroes.js';
import * as items from '../src/sim/items.js';

const DT = 1 / 30;
const run = (w, sec) => { for (let i = 0, n = Math.round(sec / DT); i < n; i++) w.step(DT); };
const SVEN = 'npc_dota_hero_sven', LINA = 'npc_dota_hero_lina';
const none = () => ({ key: '', charges: 0, cd: 0, cdMax: 0 });
const give = (h, i, key, extra) => { h.items[i] = Object.assign({ key: 'item_' + key, charges: key === 'flask' ? 1 : 0, cd: 0, cdMax: 0 }, extra); h._dirty = true; };
function setup() {
  const w = new World({ seed: 7, pregame: 0 });
  const h = w.addHero({ pid: 'a', team: TEAM.RADIANT, heroKey: SVEN });
  const p = w.players.get('a'); p.gold = 50000;
  w.step(DT);
  return { w, h, p, buy: (k) => w.order('a', { t: 'buy', key: 'item_' + k }) };
}

test('constants and inventory size', () => {
  assert.equal(INV_SLOTS, 9); assert.equal(ACTIVE_SLOTS, 6); assert.equal(BACKPACK_SWAP_CD, 6);
  assert.equal(setup().h.items.length, 9);
});

test('stats / passives ignore backpack items; main applies them', () => {
  const { w, h } = setup();
  w.step(DT);
  const str0 = h.str, ms0 = h.ms;
  give(h, 7, 'gauntlets'); give(h, 8, 'boots'); give(h, 6, 'lesser_crit');
  w.step(DT);
  assert.equal(h.str, str0, 'backpack gauntlets give nothing');
  assert.equal(h.ms, ms0, 'backpack boots give nothing');
  let crits = 0;
  for (let i = 0; i < 300; i++) { const inf = { dmg: 100, crit: 1 }; items.onAttack(w, h, h, inf); if (inf.crit > 1) crits++; }
  assert.equal(crits, 0, 'backpack crit never procs');
  assert.equal(w.order('a', { t: 'swap', a: 0, b: 7 }), true);
  w.step(DT);
  assert.equal(h.str, str0 + 3, 'gauntlets count once in main (stats apply during the lock)');
  assert.equal(h.items[0].key, 'item_gauntlets'); assert.equal(h.items[7].key, '');
});

test('backpack items cannot be used; charges do not grow; cooldowns tick', () => {
  const { w, h } = setup();
  give(h, 7, 'flask'); give(h, 6, 'magic_stick', { charges: 2 }); give(h, 8, 'blink', { cd: 5, cdMax: 15 });
  assert.equal(items.useInfo(w, h, 7), null);
  assert.equal(w.order('a', { t: 'item', slot: 7, id: h.id }), false, 'item order on a backpack slot is refused');
  items.use(w, h, 7, { unit: h, x: h.x, y: h.y });
  assert.equal(h.items[7].key, 'item_flask', 'use() ignores the backpack');
  const e = w.addHero({ pid: 'b', team: TEAM.DIRE, heroKey: LINA });
  items.onEnemySpell(w, h, e, 'x');
  assert.equal(h.items[6].charges, 2, 'stick charges do not grow in the backpack');
  run(w, 2);
  assert.ok(h.items[8].cd < 3.1, 'cooldowns tick in the backpack');
});

test('purchases fill main first, then backpack; refused when all 9 are taken', () => {
  const { h, buy } = setup();
  for (let i = 0; i < ACTIVE_SLOTS; i++) assert.equal(buy('sobi_mask'), true);
  assert.ok(h.items.slice(0, 6).every((i) => i.key === 'item_sobi_mask'));
  assert.ok(h.items.slice(6).every((i) => !i.key));
  assert.equal(buy('gauntlets'), true);
  assert.equal(h.items[6].key, 'item_gauntlets', 'overflow to the first backpack slot');
  assert.equal(buy('circlet'), true); assert.equal(buy('ring_of_protection'), true);
  assert.equal(buy('boots'), false, 'inventory full');
  assert.equal(h.items.length, 9, 'no stray slot left behind');
  assert.equal(buy('tango'), false);
});

test('recipes combine across main + backpack', () => {
  const { h, p, buy } = setup();
  for (let i = 0; i < ACTIVE_SLOTS; i++) give(h, i, 'sobi_mask');
  give(h, 6, 'gauntlets'); give(h, 7, 'circlet');
  const g = p.gold;
  assert.equal(buy('bracer'), true, 'completes a recipe although main is full');
  assert.equal(p.gold, g - 210, 'only the recipe is paid');
  assert.equal(h.items[6].key, 'item_bracer'); assert.equal(h.items[7].key, '');
  // parts split main / backpack: the result takes the lowest used slot (main)
  give(h, 1, 'gauntlets'); give(h, 8, 'circlet'); h.items[6] = none();
  assert.equal(buy('bracer'), true);
  assert.equal(h.items[1].key, 'item_bracer'); assert.equal(h.items[8].key, '');
});

test('backpack-only parts build into a free main slot', () => {
  const { h, buy } = setup();
  give(h, 0, 'sobi_mask'); give(h, 6, 'gauntlets'); give(h, 7, 'circlet');
  assert.equal(buy('bracer'), true);
  assert.equal(h.items[1].key, 'item_bracer', 'result lands in the first free main slot');
  assert.equal(h.items[6].key, ''); assert.equal(h.items[7].key, '');
});

test('full inventory: only a purchase that completes a free recipe goes through (boots + chainmail + blades -> phase boots)', () => {
  const { h, buy } = setup();
  for (let i = 0; i < 7; i++) give(h, i, 'sobi_mask');
  give(h, 7, 'chainmail'); give(h, 8, 'blades_of_attack');
  assert.equal(buy('gauntlets'), false, 'plain purchase refused when full');
  assert.equal(h.items.length, 9);
  assert.equal(buy('boots'), true, 'boots complete the free Phase Boots recipe');
  assert.equal(h.items.length, 9);
  assert.equal(h.items.filter((i) => i.key === 'item_phase_boots').length, 1);
  assert.equal(h.items.filter((i) => i.key === 'item_chainmail' || i.key === 'item_boots' || i.key === 'item_blades_of_attack').length, 0);
});

test('swap rules and the 6 s lock when entering main', () => {
  const { w, h } = setup();
  give(h, 0, 'sobi_mask'); give(h, 6, 'flask'); give(h, 7, 'tango', { charges: 3 });
  assert.equal(items.swap(w, h, 0, 9), false); assert.equal(items.swap(w, h, -1, 2), false); assert.equal(items.swap(w, h, 3, 3), false);
  assert.equal(items.swap(w, h, 6, 7), true, 'backpack <-> backpack'); assert.equal(h.items[7].cd, 0);
  assert.equal(items.swap(w, h, 0, 1), true, 'main <-> main'); assert.equal(h.items[1].cd, 0);
  // main -> backpack: the sobi mask leaves, the tango (slot 6 after the first swap) enters main
  assert.equal(h.items[6].key, 'item_tango');
  assert.equal(items.swap(w, h, 1, 6), true);
  assert.equal(h.items[1].key, 'item_tango'); assert.equal(h.items[1].cd, 6); assert.equal(h.items[1].cdMax, 6);
  assert.equal(h.items[6].key, 'item_sobi_mask'); assert.equal(h.items[6].cd, 0, 'item leaving main is not locked');
  // flask (no cooldown of its own) is unusable for 6 s, then works
  assert.equal(items.swap(w, h, 7, 2), true);
  assert.equal(h.items[2].key, 'item_flask'); assert.equal(h.items[2].cd, 6);
  assert.equal(items.useInfo(w, h, 2).ready, false);
  h.hp = h.maxHp * 0.5;
  w.order('a', { t: 'item', slot: 2, id: h.id }); run(w, 1);
  assert.equal(h.items[2].key, 'item_flask', 'locked: not used');
  run(w, 5.5);
  w.order('a', { t: 'item', slot: 2, id: h.id }); run(w, 1);
  assert.equal(h.items[2].key, '', 'flask used after the lock');
  // an item with a longer cooldown keeps it
  give(h, 8, 'blink', { cd: 12, cdMax: 15 });
  assert.equal(items.swap(w, h, 8, 3), true); assert.equal(h.items[3].cd, 12);
  // the Aegis never goes to the backpack
  give(h, 4, 'aegis'); assert.equal(items.swap(w, h, 4, 8), false);
});

test('selling from the backpack; Aegis pushes a main item into the backpack', () => {
  const { w, h, p } = setup();
  p.gold = 0; give(h, 8, 'gauntlets', { _paid: 140, _t: -1e9 });
  assert.equal(w.order('a', { t: 'sell', slot: 8 }), true);
  assert.equal(p.gold, 70); assert.equal(h.items[8].key, '');
  for (let i = 0; i < ACTIVE_SLOTS; i++) give(h, i, 'sobi_mask');
  assert.equal(items.grantAegis(w, h), true);
  assert.equal(h.items[5].key, 'item_aegis'); assert.equal(h.items[6].key, 'item_sobi_mask');
  h.items[5] = none();
  for (let i = 5; i < 9; i++) give(h, i, 'sobi_mask');
  assert.equal(items.grantAegis(w, h), false, 'all 9 full');
});

test('bots keep core items in main, junk goes to the backpack, and never break', () => {
  const w = new World({ seed: 11, pregame: 0 });
  const h = w.addHero({ pid: 'bot:0:0', team: TEAM.RADIANT, heroKey: SVEN, bot: true, slot: 0 });
  w.players.get('bot:0:0').gold = 0;
  w.step(DT);
  for (let i = 0; i < 6; i++) give(h, i, 'branches');
  give(h, 6, 'boots'); give(h, 7, 'blink');
  run(w, 8);
  assert.ok(h.items.slice(0, 6).some((i) => i.key === 'item_boots'), 'boots moved into main');
  assert.ok(h.items.slice(0, 6).some((i) => i.key === 'item_blink'), 'blink moved into main');
  assert.ok(h.items.slice(6).every((i) => !i.key || i.key === 'item_branches'));
  assert.equal(w.players.get('bot:0:0')._bot.errs, 0);
});

test('bots: full match with 9-slot inventories ends cleanly, bots buy beyond the start set', () => {
  const w = new World({ seed: 6 });   // bot matches are chaotic: any map data change reshuffles who is ahead at 12 min
  const hs = [];
  for (let i = 0; i < 10; i++) hs.push(w.addHero({ pid: 'b' + i, team: i < 5 ? TEAM.RADIANT : TEAM.DIRE, heroKey: HERO_KEYS[i], bot: true, slot: i % 5 }));
  for (let i = 0; i < 30 * 60 * 12 && w.winner < 0; i++) w.step(DT);
  for (const h of hs) assert.equal(h.items.length, INV_SLOTS);
  assert.equal([...w.players.values()].reduce((n, p) => n + (p._bot ? p._bot.errs : 0), 0), 0);
  for (const h of hs) {
    assert.ok(h.items.slice(0, 6).filter((i) => i.key).length >= 3, h.key + ' main inventory in use');
    for (let i = 6; i < 9; i++) assert.ok(!h.items[i].key || !/phase_boots|power_treads|black_king_bar|blink|lesser_crit/.test(h.items[i].key) || h.items.slice(0, 6).every((m) => m.key && !/branches|tango|flask|clarity/.test(m.key)), h.key + ' leaves a core item in the backpack: ' + h.items.map((x) => x.key));
  }
});
