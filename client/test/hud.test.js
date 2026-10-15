// HUD / input pure-logic tests (no DOM): formatting, targeting resolution, shop affordability + recipe trees, tooltips, pixel rasterising.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DATA } from '../../shared/data.js';
import { TEAM, ST } from '../../shared/protocol.js';
import { SHOP_RANGE } from '../../shared/constants.js';
import {
  fmtClock, fmtCd, fmtGold, fmtRegen, fmtBar, xpProgress, sweepDeg, prettyName, heroName, heroShort, heroRegen, dmgText, fmtRespawn, heroStats, heroMagicResist, netWorth,
} from '../src/ui/format.js';
import {
  abilitySlotForCode, itemSlotForCode, targetInfo, teamOk, abilityReady, itemReady, canLearn, requiredLevel, pipCount,
  orderForRightClick, orderForAttackClick, resolveTargetClick, resolveSelfCast, orderCast, PORTRAIT, portraitPhase,
} from '../src/ui/targeting.js';
import { SHOP_CATEGORIES, SHOP_COLUMNS, SHOP_GROUPS, shopCategories, categoryOf, groupOf,recipeTree, effectiveCost, buyCheck, inShopRange, sellValue, usedIn, markOwned, clampPanelPos, parsePanelPos } from '../src/ui/shopdata.js';
import { abilityTip, itemTip, recipeLines } from '../src/ui/tipdata.js';
import { rasterRows, parseColor } from '../src/ui/pixels.js';
import { expandUnits, hudScale } from '../src/ui/style.js';
import { bakeMapPixels } from '../src/ui/minimap.js';
import { GLYPHS } from '../src/ui/glyphs.js';
import { invKeyLabel, invSlotNote } from '../src/ui/hud.js';

// ---------------------------------------------------------------- format
test('fmtClock: pregame negative, minutes, hours', () => {
  assert.equal(fmtClock(-30), '-0:30');
  assert.equal(fmtClock(0), '0:00');
  assert.equal(fmtClock(75), '1:15');
  assert.equal(fmtClock(3725), '1:02:05');
  assert.equal(fmtClock(NaN), '0:00');
});

test('fmtCd / fmtRespawn / fmtGold / fmtRegen / fmtBar', () => {
  assert.equal(fmtCd(0), ''); assert.equal(fmtCd(0.7), '0.7'); assert.equal(fmtCd(1), '1'); assert.equal(fmtCd(7.2), '8');
  assert.equal(fmtRespawn(0), ''); assert.equal(fmtRespawn(23.1), '24');
  assert.equal(fmtGold(1234567), '1,234,567'); assert.equal(fmtGold(999.9), '999');
  assert.equal(fmtRegen(4.25), '+4.3'); assert.equal(fmtRegen(-1), '-1.0');
  assert.equal(fmtBar(619.2, 700), '620 / 700');
});

test('xpProgress / sweepDeg', () => {
  assert.equal(xpProgress(0, 1), 0);
  assert.equal(xpProgress(120, 1), 0.5);
  assert.equal(xpProgress(99999, 30), 1);
  assert.equal(sweepDeg(0, 10), 0); assert.equal(sweepDeg(5, 10), 180); assert.equal(sweepDeg(10, 10), 360); assert.equal(sweepDeg(5, 0), 0);
});

test('names', () => {
  assert.equal(prettyName('sven_storm_bolt'), 'Storm Hammer');
  assert.equal(prettyName('item_ogre_axe'), 'Ogre Axe');
  assert.equal(prettyName('lina_light_strike_array'), 'Light Strike Array');
  assert.equal(heroName('npc_dota_hero_crystal_maiden'), 'Crystal Maiden');
  assert.equal(heroShort('npc_dota_hero_zuus'), 'zuus');
  assert.equal(prettyName('invoker_emp'), 'E.M.P.');
});

test('heroRegen / dmgText', () => {
  const key = 'npc_dota_hero_axe';
  const r = heroRegen({ key, str: 25, int: 18, items: [] }, DATA);
  assert.ok(Math.abs(r.hp - (DATA.heroes[key].hpRegen + 2.5)) < 1e-9);
  assert.equal(dmgText({ dmgMin: 31, dmgMax: 35, dmgBonus: 10 }), '41-45');
});

// ---------------------------------------------------------------- targeting
const hero = (over = {}) => ({
  id: 'h1', team: 0, x: 0, y: 0, mana: 500, level: 6, skillPoints: 1, status: 0,
  abilities: [{ key: 'sven_storm_bolt', level: 1, cd: 0, cdMax: 15, mana: 110 }, { key: 'sven_great_cleave', level: 1, cd: 0, cdMax: 0, mana: 0 }, { key: 'sven_warcry', level: 0, cd: 0, cdMax: 30, mana: 40 }, { key: 'sven_gods_strength', level: 0, cd: 0, cdMax: 80, mana: 100 }],
  items: [{ key: 'item_blink', cd: 0 }, { key: 'item_tango', charges: 3, cd: 0 }, { key: 'item_boots', cd: 0 }, null, null, null],
  ...over,
});

test('key mapping: Invoker has D F', () => {
  assert.equal(abilitySlotForCode('npc_dota_hero_sven', 'KeyQ'), 0);
  assert.equal(abilitySlotForCode('npc_dota_hero_sven', 'KeyD'), -1);
  assert.equal(abilitySlotForCode('npc_dota_hero_invoker', 'KeyD'), 3);
  assert.equal(abilitySlotForCode('npc_dota_hero_invoker', 'KeyR'), 5);
  assert.equal(abilitySlotForCode('npc_dota_hero_sven', 'Digit1'), -1);
  assert.equal(itemSlotForCode('KeyZ'), 0); assert.equal(itemSlotForCode('KeyN'), 5); assert.equal(itemSlotForCode('KeyQ'), -1);
});

test('targetInfo: modes from behavior', () => {
  assert.equal(targetInfo('ability', 'sven_storm_bolt', 1).mode, 'unit');
  assert.equal(targetInfo('ability', 'sven_storm_bolt', 1).team, 'ENEMY');
  assert.equal(targetInfo('ability', 'sven_warcry', 1).mode, 'none');
  assert.equal(targetInfo('ability', 'sven_great_cleave', 1).mode, 'passive');
  assert.equal(targetInfo('ability', 'lina_light_strike_array', 1).mode, 'point');
  assert.equal(targetInfo('item', 'item_blink').mode, 'point');
  assert.equal(targetInfo('item', 'item_boots').mode, 'passive');
  assert.equal(targetInfo('item', 'item_tango').mode, 'unit');
  assert.equal(targetInfo('ability', 'nope', 1).mode, 'passive');
});

test('teamOk', () => {
  assert.ok(teamOk('ENEMY', { team: 1 }, 0)); assert.ok(!teamOk('ENEMY', { team: 0 }, 0));
  assert.ok(teamOk('FRIENDLY', { team: 0 }, 0)); assert.ok(!teamOk('FRIENDLY', { team: 1 }, 0));
  assert.ok(teamOk(null, { team: 1 }, 0)); assert.ok(!teamOk('ENEMY', null, 0));
});

test('abilityReady / itemReady', () => {
  const u = hero();
  assert.equal(abilityReady(u, 0).ok, true);
  assert.equal(abilityReady(u, 2).reason, 'Not learned');
  assert.equal(abilityReady(u, 1).reason, 'Passive');
  assert.equal(abilityReady(hero({ mana: 10 }), 0).reason, 'Not enough mana');
  assert.equal(abilityReady(hero({ status: ST.SILENCE }), 0).reason, 'Silenced');
  assert.equal(abilityReady(hero({ status: ST.STUN }), 0).reason, 'Disabled');
  u.abilities[0].cd = 3; assert.equal(abilityReady(u, 0).reason, 'On cooldown');
  assert.equal(itemReady(u, 0).ok, true);
  assert.equal(itemReady(u, 2).reason, 'Passive');
  assert.equal(itemReady(u, 4).reason, 'empty');
  assert.equal(itemReady(hero({ status: ST.MUTE }), 0).reason, 'Muted');
});

test('learn rules mirror the server', () => {
  const u = hero({ level: 1 });
  assert.equal(canLearn(u, 2), true);            // lvl-1 hero can take a first rank
  assert.equal(canLearn(u, 0), false);           // rank 2 needs level 3
  assert.equal(canLearn(u, 3), false);           // ult needs level 6
  assert.equal(canLearn(hero({ level: 6 }), 3), true);
  assert.equal(canLearn(hero({ skillPoints: 0 }), 2), false);
  assert.equal(requiredLevel({ key: 'sven_storm_bolt', level: 1 }), 3);
  assert.equal(requiredLevel({ key: 'sven_gods_strength', level: 1 }), 12);
  assert.equal(pipCount('sven_storm_bolt'), 4); assert.equal(pipCount('invoker_cold_snap'), 0);
});

const ctx = (units) => ({ myTeam: 0, getUnit: (id) => units[id] });
const U = { e1: { id: 'e1', team: 1, kind: 'hero', hp: 500, maxHp: 500 }, a1: { id: 'a1', team: 0, kind: 'hero', hp: 500, maxHp: 500 }, c1: { id: 'c1', team: 0, kind: 'creep', hp: 100, maxHp: 500 }, c2: { id: 'c2', team: 0, kind: 'creep', hp: 400, maxHp: 500 } };

test('right-click: enemy attacks, ground moves, low allied creep is denied, shift queues', () => {
  assert.deepEqual(orderForRightClick({ x: 5, y: 6, unitId: null }, ctx(U), false), { t: 'move', x: 5, y: 6 });
  assert.deepEqual(orderForRightClick({ x: 5, y: 6, unitId: 'e1' }, ctx(U), false), { t: 'attack', id: 'e1' });
  assert.deepEqual(orderForRightClick({ x: 5, y: 6, unitId: 'a1' }, ctx(U), false), { t: 'move', x: 5, y: 6 });
  assert.deepEqual(orderForRightClick({ x: 5, y: 6, unitId: 'c1' }, ctx(U), false), { t: 'attack', id: 'c1' });
  assert.deepEqual(orderForRightClick({ x: 5, y: 6, unitId: 'c2' }, ctx(U), false), { t: 'move', x: 5, y: 6 });
  assert.deepEqual(orderForRightClick({ x: 1, y: 2, unitId: null }, ctx(U), true), { t: 'move', x: 1, y: 2, q: true });
});

test('attack-move click', () => {
  assert.deepEqual(orderForAttackClick({ x: 3, y: 4, unitId: null }, ctx(U), false), { t: 'amove', x: 3, y: 4 });
  assert.deepEqual(orderForAttackClick({ x: 3, y: 4, unitId: 'e1' }, ctx(U), false), { t: 'attack', id: 'e1' });
  assert.deepEqual(orderForAttackClick({ x: 3, y: 4, unitId: 'a1' }, ctx(U), true), { t: 'amove', x: 3, y: 4, q: true });
});

test('resolveTargetClick: unit / point / unitpoint', () => {
  const unit = { kind: 'ability', slot: 0, info: targetInfo('ability', 'sven_storm_bolt', 1) };
  assert.deepEqual(resolveTargetClick(unit, { x: 1, y: 2, unitId: 'e1' }, ctx(U), false).order, { t: 'cast', slot: 0, id: 'e1' });
  assert.ok(resolveTargetClick(unit, { x: 1, y: 2, unitId: 'a1' }, ctx(U), false).error);     // wrong team
  assert.ok(resolveTargetClick(unit, { x: 1, y: 2, unitId: null }, ctx(U), false).error);      // ground
  const point = { kind: 'ability', slot: 1, info: targetInfo('ability', 'lina_light_strike_array', 1) };
  assert.deepEqual(resolveTargetClick(point, { x: 9, y: 8, unitId: 'e1' }, ctx(U), true).order, { t: 'cast', slot: 1, x: 9, y: 8, q: true });
  const item = { kind: 'item', slot: 0, info: targetInfo('item', 'item_blink') };
  assert.deepEqual(resolveTargetClick(item, { x: 7, y: 7, unitId: null }, ctx(U), false).order, { t: 'item', slot: 0, x: 7, y: 7 });
  const up = { kind: 'ability', slot: 2, info: { mode: 'unitpoint', team: null, range: 0, radius: 0 } };
  assert.deepEqual(resolveTargetClick(up, { x: 1, y: 2, unitId: null }, ctx(U), false).order, { t: 'cast', slot: 2, x: 1, y: 2 });
});

test('self cast + cast order shape', () => {
  const h = { id: 'h1', team: 0, x: 10, y: 20 };
  const pt = { kind: 'ability', slot: 1, info: targetInfo('ability', 'lina_light_strike_array', 1) };
  assert.deepEqual(resolveSelfCast(pt, h, false).order, { t: 'cast', slot: 1, x: 10, y: 20 });
  const heal = { kind: 'item', slot: 1, info: { mode: 'unit', team: 'FRIENDLY' } };
  assert.deepEqual(resolveSelfCast(heal, h, false).order, { t: 'item', slot: 1, id: 'h1' });
  const bolt = { kind: 'ability', slot: 0, info: targetInfo('ability', 'sven_storm_bolt', 1) };
  assert.ok(resolveSelfCast(bolt, h, false).error);
  assert.deepEqual(orderCast('ability', 3, null, true), { t: 'cast', slot: 3, q: true });
});

// ---------------------------------------------------------------- shop
test('categories cover every item exactly once', () => {
  const seen = new Map();
  for (const c of SHOP_CATEGORIES) for (const k of c.items) { assert.ok(DATA.items[k], k); seen.set(k, (seen.get(k) || 0) + 1); }
  for (const k of Object.keys(DATA.items)) { if (/recipe/.test(k) || DATA.items[k].sell === false) continue; assert.equal(seen.get(k), 1, k + ' category count'); }
  assert.equal(categoryOf('item_blink'), 'misc'); assert.equal(categoryOf('zzz'), null);   // shops.txt lists Blink under misc (BASIC)
  assert.equal(groupOf('item_blink'), 'basic'); assert.equal(groupOf('item_bracer'), 'upgrades'); assert.equal(groupOf('zzz'), null);
});

test('shop columns: Dota display order from scripts/shops.txt', () => {
  assert.deepEqual(SHOP_GROUPS.map((g) => g.id), ['basic', 'upgrades']);
  assert.deepEqual(SHOP_COLUMNS.map((c) => [c.group, c.id, c.src]), [
    ['basic', 'consumables', 'consumables'], ['basic', 'attributes', 'attributes'], ['basic', 'equipment', 'weapons_armor'], ['basic', 'misc', 'misc'], ['basic', 'secret', 'secretshop'],
    ['upgrades', 'accessories', 'basics'], ['upgrades', 'support', 'support'], ['upgrades', 'magical', 'magics'], ['upgrades', 'armor', 'defense'], ['upgrades', 'weapons', 'weapons'], ['upgrades', 'artifacts', 'artifacts'],
  ]);
  assert.deepEqual(SHOP_CATEGORIES.map((c) => c.id), SHOP_COLUMNS.map((c) => c.id));   // empty columns keep their header
  // no key in two columns of the full Dota lists; every shown item keeps its shops.txt position
  const all = SHOP_COLUMNS.flatMap((c) => c.order);
  assert.equal(new Set(all).size, all.length);
  for (const c of SHOP_CATEGORIES) {
    const order = SHOP_COLUMNS.find((x) => x.id === c.id).order;
    const idx = c.items.map((k) => order.indexOf(k));
    assert.ok(idx.every((v, i) => v >= 0 && (i === 0 || v > idx[i - 1])), c.id + ' follows shops.txt order');
  }
  // the 40 items we sell today, pinned per column (shops.txt order)
  const cols = Object.fromEntries(SHOP_CATEGORIES.map((c) => [c.id, c.items]));
  assert.deepEqual(cols, {
    consumables: ['item_tpscroll', 'item_clarity', 'item_faerie_fire', 'item_ward_observer', 'item_ward_sentry', 'item_enchanted_mango', 'item_flask', 'item_tango'],
    attributes: ['item_branches', 'item_gauntlets', 'item_slippers', 'item_mantle', 'item_circlet', 'item_belt_of_strength', 'item_boots_of_elves', 'item_robe', 'item_ogre_axe', 'item_blade_of_alacrity', 'item_staff_of_wizardry'],
    equipment: ['item_quelling_blade', 'item_ring_of_protection', 'item_blades_of_attack', 'item_gloves', 'item_chainmail', 'item_broadsword', 'item_claymore', 'item_mithril_hammer'],
    misc: ['item_ring_of_regen', 'item_sobi_mask', 'item_magic_stick', 'item_boots', 'item_blink'],
    secret: [],
    accessories: ['item_magic_wand', 'item_bracer', 'item_wraith_band', 'item_null_talisman', 'item_power_treads', 'item_phase_boots'],
    support: [], magical: [],
    armor: ['item_black_king_bar'],
    weapons: ['item_lesser_crit'],
    artifacts: [],
  });
  // an item added to DATA shows up in its Dota slot without touching the shop
  const more = { items: { ...DATA.items, item_crown: { cost: 450, sell: true } } };
  assert.deepEqual(shopCategories(more).find((c) => c.id === 'attributes').items.slice(7, 10), ['item_robe', 'item_crown', 'item_ogre_axe']);
});

test('recipe tree: sums to the item cost', () => {
  const sum = (n) => (n.parts.length ? n.recipeCost + n.parts.reduce((a, p) => a + sum(p), 0) : n.cost);
  for (const k of Object.keys(DATA.items)) {
    const d = DATA.items[k]; if (!d.recipe) continue;
    const t = recipeTree(k);
    assert.equal(sum(t), d.cost, k);
  }
  assert.equal(recipeTree('item_boots').parts.length, 0);
  assert.ok(usedIn('item_ogre_axe').length >= 0);
});

test('effectiveCost: owned components are free', () => {
  const k = Object.keys(DATA.items).find((x) => DATA.items[x].recipe && DATA.items[x].recipe.parts.length);
  const d = DATA.items[k];
  const full = effectiveCost(k, []);
  assert.equal(full.cost, d.cost);
  const part = d.recipe.parts[0];
  const withPart = effectiveCost(k, [{ key: part }]);
  assert.equal(withPart.cost, d.cost - DATA.items[part].cost);
  assert.equal(withPart.consumed, 1);
  const m = markOwned(recipeTree(k), [{ key: part }]);
  assert.equal([...m.values()].filter(Boolean).length, 1);
});

test('buyCheck: range, gold, full, dead, components', () => {
  const free = Array.from({ length: 9 }, () => ({ key: '' }));
  const full = Array.from({ length: 9 }, () => ({ key: 'item_boots' }));
  assert.equal(buyCheck('item_tango', { gold: 1000, items: free, inRange: true }).ok, true);
  assert.equal(buyCheck('item_tango', { gold: 1000, items: free, inRange: false }).reason, 'range');
  const poor = buyCheck('item_tango', { gold: 50, items: free, inRange: true });
  assert.equal(poor.reason, 'gold'); assert.equal(poor.need, 40);
  assert.equal(buyCheck('item_tango', { gold: 1000, items: full, inRange: true }).reason, 'full');
  assert.equal(buyCheck('item_tango', { gold: 1000, items: free, inRange: true, dead: true }).reason, 'dead');
  assert.equal(buyCheck('item_nope', { gold: 1, items: free, inRange: true }).reason, 'unknown');
  // stackable consumable can still be bought on a full inventory when you already hold it
  const tangoFull = Array.from({ length: 9 }, (_, i) => ({ key: i ? 'item_boots' : 'item_tango', charges: 3 }));
  assert.equal(buyCheck('item_tango', { gold: 1000, items: tangoFull, inRange: true }).ok, true);
  // a recipe that consumes a held component fits in a full inventory
  const k = Object.keys(DATA.items).find((x) => DATA.items[x].recipe && DATA.items[x].recipe.parts.every((p) => !DATA.items[p].recipe) && DATA.items[x].recipe.parts.length);
  const parts = DATA.items[k].recipe.parts;
  const inv = Array.from({ length: 9 }, (_, i) => ({ key: i < parts.length ? parts[i] : 'item_boots' }));
  assert.equal(buyCheck(k, { gold: 99999, items: inv, inRange: true }).ok, true);
});

test('shop range + sell value', () => {
  assert.ok(inShopRange({ x: 0, y: 0 }, { x: SHOP_RANGE - 1, y: 0 }));
  assert.ok(!inShopRange({ x: 0, y: 0 }, { x: SHOP_RANGE + 1, y: 0 }));
  assert.ok(!inShopRange(null, { x: 0, y: 0 })); assert.ok(!inShopRange({ x: 0, y: 0 }, null));
  assert.equal(sellValue('item_boots', 5), 500); assert.equal(sellValue('item_boots', 60), 250); assert.equal(sellValue('item_nope', 0), 0);
});

// ---------------------------------------------------------------- tooltips
test('abilityTip: values, mana, cooldown', () => {
  const t = abilityTip('sven_storm_bolt', 2);
  assert.equal(t.title, 'Storm Hammer');
  assert.ok(t.rows.length > 0);
  assert.ok(t.rows.some((r) => /stun/i.test(r.k)));
  assert.deepEqual(t.mana, [110, 110, 110, 110].every((x) => x === 110) ? [110] : t.mana);
  assert.ok(t.cd.length === 4 && t.cur === 1);
  assert.ok(!t.rows.some((r) => /scepter/i.test(r.k)));
  assert.equal(abilityTip('does_not_exist', 1).rows.length, 0);
});

test('itemTip: stats + recipe', () => {
  const t = itemTip('item_blink');
  assert.equal(t.title, 'Blink Dagger'); assert.equal(t.cost, 2250);
  assert.ok(t.cd && t.cd[0] > 0);
  const w = itemTip('item_power_treads');
  assert.ok(w.recipe && w.recipe.parts.length >= 1);
  assert.ok(recipeLines(w.recipe).length >= 2);
  assert.ok(itemTip('item_ogre_axe').stats.some((s) => /Strength/.test(s.k)));
});

// ---------------------------------------------------------------- pixels / style / minimap
test('rasterRows: palette, transparency, crop', () => {
  const r = rasterRows({ a: '#ff0000', b: '#00ff0080' }, ['a.b', '.a.']);
  assert.equal(r.w, 3); assert.equal(r.h, 2);
  assert.deepEqual([...r.data.slice(0, 4)], [255, 0, 0, 255]);
  assert.deepEqual([...r.data.slice(4, 8)], [0, 0, 0, 0]);
  assert.deepEqual([...r.data.slice(8, 12)], [0, 255, 0, 128]);
  const c = rasterRows({ a: '#ff0000' }, ['a.b', '.a.'], [1, 1, 1, 1]);
  assert.equal(c.w, 1); assert.deepEqual([...c.data], [255, 0, 0, 255]);
  assert.deepEqual(parseColor('#fff'), [255, 255, 255, 255]);
});

test('glyphs are rectangular, use only palette chars', () => {
  for (const [name, g] of Object.entries(GLYPHS)) {
    const w = g.rows[0].length;
    for (const row of g.rows) { assert.equal(row.length, w, name + ' width'); for (const ch of row) assert.ok(ch === '.' || g.pal[ch], name + ' char ' + ch); }
  }
});

test('style: unit expansion + integer scale', () => {
  assert.equal(expandUnits('width:12u; margin:-2u 0.5u'), 'width:calc(12 * var(--u)); margin:calc(-2 * var(--u)) calc(0.5 * var(--u))');
  assert.equal(expandUnits('color:#fff; animation:x 0.9s'), 'color:#fff; animation:x 0.9s');
  assert.equal(hudScale(1280, 720), 2); assert.equal(hudScale(1920, 1080), 3); assert.equal(hudScale(640, 360), 1); assert.equal(hudScale(5000, 3000), 4);
});

test('minimap: baked terrain is opaque and varied', () => {
  const px = bakeMapPixels(46);
  assert.equal(px.length, 46 * 46 * 4);
  let distinct = new Set();
  for (let i = 0; i < px.length; i += 4) { assert.equal(px[i + 3], 255); distinct.add((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]); }
  assert.ok(distinct.size > 12);
});

test('inventory: backpack slots (6..8) have no hotkey and a backpack note', () => {
  assert.equal(invKeyLabel(0), 'Z'); assert.equal(invKeyLabel(5), 'N');
  for (const i of [6, 7, 8]) { assert.equal(invKeyLabel(i), ''); assert.match(invSlotNote(i), /^Backpack: no stats or use\. Drag to main to use \(6 s lock\)\.$/); }
  assert.match(invSlotNote(2), /Right-click: sell/);
});

test('TEAM constants sanity', () => { assert.equal(TEAM.RADIANT, 0); assert.equal(TEAM.DIRE, 1); });

// ---------------------------------------------------------------- draggable panel helpers
test('clampPanelPos keeps a panel fully on screen', () => {
  assert.deepEqual(clampPanelPos(100, 50, 200, 100, 844, 390), { x: 100, y: 50 });
  assert.deepEqual(clampPanelPos(-40, -9, 200, 100, 844, 390), { x: 2, y: 2 });
  assert.deepEqual(clampPanelPos(900, 500, 200, 100, 844, 390), { x: 642, y: 288 });
  assert.deepEqual(clampPanelPos(50, 50, 900, 500, 844, 390), { x: 2, y: 2 });   // bigger than the view: pin to the margin
  assert.deepEqual(clampPanelPos(NaN, undefined, 10, 10, 100, 100), { x: 2, y: 2 });
});

test('parsePanelPos accepts only finite {x,y}', () => {
  assert.deepEqual(parsePanelPos('{"x":12,"y":34}'), { x: 12, y: 34 });
  assert.equal(parsePanelPos(null), null);
  assert.equal(parsePanelPos('nope'), null);
  assert.equal(parsePanelPos('{"x":"a","y":1}'), null);
});

test('heroStats: groups, attribute gains, armor %, AS, net worth', () => {
  const key = Object.keys(DATA.heroes)[0], hd = DATA.heroes[key];
  const u = { key, str: 25, agi: 20, int: 18, level: 3, xp: 0, dmgMin: 40, dmgMax: 44, dmgBonus: 2, armor: 4, ms: 300, atkRate: 1, atkRange: 150, items: [] };
  const st = heroStats(u, { gold: 1234 }, DATA);
  assert.deepEqual(st.groups.map((g) => g.title), ['ATTRIBUTES', 'ATTACK', 'DEFENCE', 'REGEN', 'GOLD']);
  const row = (id) => st.groups.flatMap((g) => g.rows).find((r) => r.id === id);
  assert.match(row('str').value, /^25/); assert.equal(row('dmg').value, '42-46'); assert.equal(row('ms').value, '300');
  assert.equal(row('as').value, String(Math.round(hd.bat * 100))); assert.match(row('armor').value, /^4 \(/);
  assert.equal(row('gold').value, '1,234'); assert.equal(row('nw').value, '1,234');
  assert.equal(heroStats(u, null, DATA).groups.length, 4);               // no player record: no gold group
  assert.equal(heroStats(null, null, DATA), null);
});
test('heroMagicResist / netWorth: base + int + item, items add their cost', () => {
  const key = Object.keys(DATA.heroes)[0];
  const lo = heroMagicResist({ key, int: 0, items: [] }, DATA), hi = heroMagicResist({ key, int: 100, items: [] }, DATA);
  assert.ok(lo >= 0 && hi > lo && hi < 1);
  const ik = Object.keys(DATA.items).find((k) => DATA.items[k].cost > 0);
  assert.equal(netWorth({ items: [{ key: ik }, null] }, 100, DATA), 100 + DATA.items[ik].cost);
  assert.equal(netWorth(null, -5, DATA), 0);
});
test('portrait gestures: hold shows stats, moving cancels, a short tap centres', () => {
  assert.equal(portraitPhase(100, 0), 'tap');
  assert.equal(portraitPhase(PORTRAIT.HOLD_MS, 0), 'stats');
  assert.equal(portraitPhase(900, PORTRAIT.MOVE + 1), 'cancel');
});
