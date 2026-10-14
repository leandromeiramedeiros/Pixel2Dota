import test from 'node:test';
import assert from 'node:assert/strict';
import { DATA, abilityValue, abilityField, itemValue } from '../data.js';
import { HEROES, HERO_KEYS } from '../heroes.js';

const DECISION_ITEMS = [
  'tango', 'flask', 'clarity', 'faerie_fire', 'enchanted_mango', 'tpscroll',
  'branches', 'gauntlets', 'slippers', 'mantle', 'circlet', 'ring_of_protection', 'quelling_blade', 'blades_of_attack', 'broadsword',
  'claymore', 'chainmail', 'ogre_axe', 'mithril_hammer', 'blade_of_alacrity', 'staff_of_wizardry', 'boots', 'gloves', 'ring_of_regen',
  'sobi_mask', 'belt_of_strength', 'boots_of_elves', 'robe', 'magic_stick',
  'magic_wand', 'bracer', 'wraith_band', 'null_talisman', 'phase_boots', 'power_treads', 'lesser_crit', 'black_king_bar', 'blink',
];

test('meta', () => {
  assert.equal(DATA.meta.source, 'local game files');
  assert.ok(DATA.meta.patch);
  assert.ok(DATA.meta.vpk.endsWith('pak01_dir.vpk'));
});

test('heroes: roster baked with sane stats and authored ability order', () => {
  assert.deepEqual(Object.keys(DATA.heroes).sort(), [...HERO_KEYS].sort());
  for (const hk of HERO_KEYS) {
    const h = DATA.heroes[hk];
    assert.equal(h.short, HEROES[hk].short);
    assert.equal(h.name, HEROES[hk].name);
    assert.ok(['str', 'agi', 'int', 'all'].includes(h.attr), hk + ' attr');
    for (const f of ['str', 'agi', 'int', 'strGain', 'agiGain', 'intGain', 'dmgMin', 'dmgMax', 'ms', 'turnRate', 'atkRange', 'bat', 'atkPoint', 'baseAS', 'hp', 'mana', 'visionDay', 'visionNight', 'hull']) {
      assert.ok(Number.isFinite(h[f]) && h[f] > 0, `${hk}.${f} = ${h[f]}`);
    }
    for (const f of ['armor', 'mr', 'hpRegen', 'manaRegen', 'projSpeed']) assert.ok(Number.isFinite(h[f]), `${hk}.${f}`);
    assert.ok(h.dmgMax >= h.dmgMin);
    assert.deepEqual(h.abilities, HEROES[hk].abilities);
  }
});

test('abilities: every roster ability is baked with per-level arrays', () => {
  for (const hk of HERO_KEYS) {
    const list = [...HEROES[hk].abilities, ...(HEROES[hk].invoked || [])];
    assert.ok(HEROES[hk].abilities.length >= 4);
    for (const key of list) {
      const a = DATA.abilities[key];
      assert.ok(a, `${hk}: ${key} missing from DATA.abilities`);
      assert.ok(a.maxLevel >= 1);
      for (const f of ['castRange', 'castPoint', 'cooldown', 'manaCost', 'channel']) {
        assert.ok(Array.isArray(a[f]) && a[f].length >= a.maxLevel, `${key}.${f}`);
        assert.ok(a[f].every(Number.isFinite), `${key}.${f} numeric`);
      }
      for (const [vk, arr] of Object.entries(a.values)) assert.ok(Array.isArray(arr) && arr.length >= a.maxLevel && arr.every(Number.isFinite), `${key}.values.${vk}`);
      // active (castable) abilities: cooldown/mana arrays present (they are asserted above); the learnable ones also cost mana or have a cooldown
      const passive = a.behavior.includes('PASSIVE');
      const orb = ['invoker_quas', 'invoker_wex', 'invoker_exort', 'invoker_invoke'].includes(key);
      if (!passive && !orb && !['lion_mana_drain'].includes(key)) assert.ok(a.manaCost.some((m) => m > 0) || a.cooldown.some((c) => c > 0), `${key} active but free`);
    }
  }
  for (const k of DATA.heroes.npc_dota_hero_sven.abilities) assert.ok(DATA.abilities[k]);
  assert.ok(DATA.abilities.sven_gods_strength.ult && DATA.abilities.lina_laguna_blade.ult && !DATA.abilities.sven_storm_bolt.ult);
});

test('abilities: spot values match the game files', () => {
  // Sven Storm Hammer (sven_storm_bolt)
  assert.deepEqual(DATA.abilities.sven_storm_bolt.values.damage, [80, 160, 240, 320]);
  assert.deepEqual(DATA.abilities.sven_storm_bolt.cooldown, [21, 18, 15, 12]);
  assert.deepEqual(DATA.abilities.sven_storm_bolt.values.bolt_stun_duration, [1, 1.25, 1.5, 1.75]);
  assert.equal(abilityValue('sven_storm_bolt', 'damage', 3), 240);
  assert.equal(abilityValue('sven_storm_bolt', 'damage', 9), 320); // clamps
  assert.equal(abilityField('sven_storm_bolt', 'manaCost', 1), 110);
  assert.equal(abilityField('sven_storm_bolt', 'castRange', 0), 600); // level < 1 clamps to 1
  assert.equal(DATA.abilities.sven_storm_bolt.damageType, 'mag');
  assert.equal(DATA.abilities.sven_storm_bolt.targetTeam, 'ENEMY');
  // Invoker: Sun Strike damage by Exort level, pure, 175 mana
  const ss = DATA.abilities.invoker_sun_strike;
  assert.deepEqual(ss.values.damage, [175, 225, 275, 325, 375, 425, 475, 525, 575]);
  assert.equal(ss.levelKeys.damage, 'exortlevel');
  assert.equal(abilityValue('invoker_sun_strike', 'damage', 5), 375);
  assert.equal(ss.damageType, 'pure');
  assert.equal(abilityField('invoker_sun_strike', 'manaCost'), 175);
  assert.equal(abilityValue('invoker_sun_strike', 'delay'), 1.7);
  // Invoker orbs have per-orb-level values
  assert.deepEqual(DATA.abilities.invoker_quas.values.hp_regen_per_instance.slice(0, 4), [1, 2, 3, 4]);
  assert.equal(DATA.abilities.invoker_exort.values.bonus_damage_per_instance[2], 6);
  assert.equal(DATA.abilities.invoker_cold_snap.levelKeys.duration, 'quaslevel');
  // Sniper Shrapnel charges, Lion Mana Drain channel, ultimates
  assert.equal(abilityValue('sniper_shrapnel', 'AbilityCharges'), 3);
  assert.equal(abilityField('lion_mana_drain', 'channel', 1), 5.1);
  assert.deepEqual(DATA.abilities.lion_finger_of_death.cooldown, [110, 70, 30]);
  // Zeus Static Field is an innate in this patch (1 level, not learnable); data is still present
  assert.equal(DATA.abilities.zuus_static_field.maxLevel, 1);
  assert.ok(abilityValue('zuus_static_field', 'damage_health_pct') > 0);
});

test('items: every DECISIONS item exists with a cost (or recipe parts)', () => {
  for (const n of DECISION_ITEMS) {
    const it = DATA.items['item_' + n];
    assert.ok(it, 'item_' + n + ' missing');
    assert.ok(it.cost > 0 || (it.recipe && it.recipe.parts.length), n + ' cost');
    for (const f of ['cooldown', 'manaCost', 'castRange', 'charges']) assert.ok(Number.isFinite(it[f]), `${n}.${f}`);
    assert.equal(typeof it.stack, 'boolean');
    assert.equal(typeof it.consumable, 'boolean');
    assert.equal(typeof it.sell, 'boolean');
    assert.ok(it.stats && typeof it.stats === 'object' && it.values && typeof it.values === 'object');
    if (it.recipe) {
      assert.ok(it.recipe.cost >= 0 && it.recipe.parts.length >= 2, n + ' recipe');
      for (const p of it.recipe.parts) assert.ok(DATA.items[p], `${n}: part ${p} missing`);
      const sum = it.recipe.cost + it.recipe.parts.reduce((s, p) => s + DATA.items[p].cost, 0);
      assert.equal(sum, it.cost, `${n}: parts + recipe == cost`);
    }
  }
});

test('items: spot values', () => {
  const bkb = DATA.items.item_black_king_bar;
  assert.equal(bkb.cost, 4050);
  assert.deepEqual(bkb.recipe, { cost: 1450, parts: ['item_mithril_hammer', 'item_ogre_axe'] });
  assert.deepEqual(bkb.values.duration, [9, 8, 7]);
  assert.equal(itemValue('item_black_king_bar', 'duration', 2), 8);
  assert.deepEqual(bkb.stats, { dmg: 24, str: 10 });
  assert.equal(bkb.cooldown, 95);
  assert.equal(DATA.items.item_blink.cost, 2250);
  assert.equal(DATA.items.item_blink.castRange, 1200);
  assert.equal(DATA.items.item_blink.values.blink_damage_cooldown, 3);
  assert.equal(DATA.items.item_blink.recipe, null);
  // stat mapping
  assert.deepEqual(DATA.items.item_branches.stats, { str: 1, agi: 1, int: 1 });
  assert.deepEqual(DATA.items.item_circlet.stats, { str: 2, agi: 2, int: 2 });
  assert.deepEqual(DATA.items.item_gauntlets.stats, { str: 3 });
  assert.deepEqual(DATA.items.item_boots.stats, { ms: 45 });
  assert.deepEqual(DATA.items.item_gloves.stats, { as: 20 });
  assert.deepEqual(DATA.items.item_ring_of_protection.stats, { armor: 2 });
  assert.deepEqual(DATA.items.item_ring_of_regen.stats, { hpRegen: 1.25 });
  assert.deepEqual(DATA.items.item_sobi_mask.stats, { manaRegen: 0.7 });
  assert.deepEqual(DATA.items.item_blades_of_attack.stats, { dmg: 9 });
  assert.equal(DATA.items.item_bracer.stats.hp, 50);
  assert.equal(DATA.items.item_magic_wand.stats.str, 3);
  assert.deepEqual(DATA.items.item_magic_wand.recipe.parts, ['item_magic_stick', 'item_branches', 'item_branches']);
  assert.equal(DATA.items.item_lesser_crit.values.crit_chance, 30);
  assert.equal(DATA.items.item_power_treads.recipe.alts.length, 3); // str / int / agi variants
  // consumables
  assert.equal(DATA.items.item_tango.charges, 3);
  assert.ok(DATA.items.item_tango.stack && DATA.items.item_tango.consumable && DATA.items.item_flask.consumable && DATA.items.item_tpscroll.consumable);
  assert.ok(!DATA.items.item_boots.consumable);
  assert.equal(DATA.items.item_tpscroll.values.tooltip_channel_time, 3);
});

test('units: creeps, towers, barracks, fort, fountain', () => {
  const U = DATA.units;
  for (const k of ['goodguys_melee', 'goodguys_ranged', 'goodguys_siege', 'badguys_melee', 'badguys_ranged', 'badguys_siege', 'tower1', 'tower2', 'tower3', 'tower4', 'melee_rax', 'ranged_rax', 'fort', 'fountain']) {
    const u = U[k];
    assert.ok(u, k);
    assert.ok(u.hp > 0 && u.hull > 0 && u.vision > 0, k);
    assert.ok(typeof u.key === 'string' && u.key.length, k);
    for (const f of ['hpRegen', 'mana', 'armor', 'mr', 'dmgMin', 'dmgMax', 'bat', 'atkPoint', 'atkRange', 'projSpeed', 'ms', 'goldMin', 'goldMax', 'xp']) assert.ok(Number.isFinite(u[f]), `${k}.${f}`);
  }
  for (const k of ['goodguys_melee', 'goodguys_ranged', 'goodguys_siege', 'tower1', 'tower2', 'tower3', 'tower4']) assert.ok(U[k].dmgMax > 0 && U[k].atkRange > 0 && U[k].bat > 0, k);
  assert.ok(U.goodguys_melee.ms > 0 && U.goodguys_melee.goldMax >= U.goodguys_melee.goldMin);
  assert.ok(U.goodguys_ranged.projSpeed > 0 && U.goodguys_ranged.atkRange > U.goodguys_melee.atkRange);
  assert.ok(U.tower4.hp >= U.tower1.hp && U.tower4.armor >= U.tower1.armor);
  assert.ok(U.fort.hp > U.tower4.hp);
  assert.equal(U.tower1.atkRange, 700);
  assert.equal(U.goodguys_melee.hp, 550);
  assert.equal(U.fort.hp, 4500);
  assert.equal(U.fort.key, 'npc_dota_goodguys_fort');
  assert.deepEqual({ ...U.goodguys_melee, key: 0 }, { ...U.badguys_melee, key: 0 });
});
