// Debuff immunity / dispel per ability (DATA immunity = SpellImmunityType, dispel = SpellDispellableType): node --test server/test/abilities_immunity.test.js
// Rule (engine): ENEMIES_YES pierces debuff immunity; ENEMIES_NO cannot unit-target a debuff-immune enemy and applies no debuff / forced
// movement to one, but its damage still lands (magic reduced by the immunity's magic resistance; pure blocked by BKB unless ENEMIES_YES).
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { TEAM, ST } from '../../shared/protocol.js';
import { HEROES } from '../../shared/heroes.js';

const DT = 1 / 30;
const run = (w, sec) => { for (let i = 0, n = Math.round(sec / DT); i < n; i++) w.step(DT); };
const put = (w, u, x, y) => { w.teleport(u, x, y); w.index.insert(u); };
const near = (a, b, eps = 1) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const PURGE = { YES: 'basic', YES_STRONG: 'strong', NO: 'none' };
/** The BKB modifier exactly as items.js grants it (60% magic resistance, pure immune, debuff immune). */
const bkb = (w, u) => { w.addModifier(u, { key: 'item_black_king_bar', src: u, dur: 60, status: ST.MAGIC_IMMUNE, mr: w.data.items.item_black_king_bar.values.spell_reduce, pureImmune: true, purge: 'none', debuff: false }); w.step(DT); };

function mk(heroKey, { foeAt = [400, 0], learn = 3, seed = 5 } = {}) {
  const w = new World({ seed, pregame: 0, buildings: false });
  const c = w.addHero({ pid: 'a', team: TEAM.RADIANT, heroKey });
  c.level = 25; c.skillPoints = 40;
  put(w, c, 0, 0);
  w.addModifier(c, { key: 'pool', src: c, mana: 5000, debuff: false });
  c._noAttack = true;
  const f = w.addHero({ pid: 'f', team: TEAM.DIRE, heroKey: 'npc_dota_hero_sven' });
  put(w, f, foeAt[0], foeAt[1]);
  w.addModifier(f, { key: 'tank', src: f, hp: 99000, mana: 2000, debuff: false });
  f._noAttack = true;
  w.step(DT);
  w.addModifier(f, { key: 'noregen', src: f, hpRegen: -f._hpRegen, debuff: false });
  w.step(DT);
  f.hp = f.maxHp; f.mana = f.maxMana; c.mana = c.maxMana;
  c.abilities.forEach((ab, i) => { for (let l = 0; l < learn; l++) w.order('a', { t: 'learn', slot: i }); });
  w.step(DT);
  return { w, c, f };
}
function mkInvoker(orbs) {
  const r = mk('npc_dota_hero_invoker', { learn: 0, foeAt: [500, 0] });
  orbs.forEach((l, i) => { r.c.abilities[i].level = l; }); r.c._dirty = true; r.w.step(DT);
  r.c.mana = 5000;
  return r;
}
const make = (w, s) => { for (const ch of s) { w.order('a', { t: 'cast', slot: 'QWE'.indexOf(ch) }); w.step(DT); } w.order('a', { t: 'cast', slot: 5 }); w.step(DT); };

test('data: immunity / dispel baked from the game files', () => {
  const A = new World({ seed: 1, pregame: 0, buildings: false }).data.abilities;
  assert.equal(A.pudge_dismember.immunity, 'ENEMIES_YES'); assert.equal(A.pudge_dismember.dispel, 'YES_STRONG');
  assert.equal(A.axe_berserkers_call.dispel, 'NO');
  assert.equal(A.invoker_sun_strike.immunity, 'ENEMIES_YES');
  assert.equal(A.lion_finger_of_death.immunity, 'ENEMIES_NO');
  assert.equal(A.sven_storm_bolt.dispel, 'YES_STRONG');
  assert.equal(A.invoker_deafening_blast.dispel, 'NO');
  assert.equal(A.lina_dragon_slave.dispel, undefined, 'only when the file sets it');
  // every enemy-affecting roster spell carries a SpellImmunityType; the ENEMIES_YES set is exactly what the game files say
  const yes = Object.keys(A).filter((k) => A[k].immunity === 'ENEMIES_YES').sort();
  assert.deepEqual(yes, ['axe_berserkers_call', 'axe_counter_helix', 'axe_culling_blade', 'drow_ranger_marksmanship', 'drow_ranger_multishot',
    'invoker_sun_strike', 'juggernaut_omni_slash', 'pudge_dismember', 'pudge_meat_hook', 'rubick_spell_steal', 'sven_great_cleave']);
  for (const [k, d] of Object.entries(A)) if (d.damageType || (d.targetTeam === 'ENEMY' && d.behavior.includes('UNIT_TARGET'))) assert.ok(d.immunity, k + ' has an immunity type');
});

test('modifier defaults: purge from DATA dispel, pierce from ENEMIES_YES (key or key_suffix)', () => {
  const { w, c, f } = mk('npc_dota_hero_sven');
  const g = w.addHero({ pid: 'g', team: TEAM.DIRE, heroKey: 'npc_dota_hero_lina' }); put(w, g, 600, 0); w.step(DT);
  bkb(w, g);
  let n = 0;
  for (const [k, d] of Object.entries(w.data.abilities)) {
    for (const key of [k, k + '_sub']) {
      if (d.dispel) {
        const m = w.addModifier(f, { key, src: c, dur: 5, debuff: true });
        assert.ok(m, key); assert.equal(m.purge, PURGE[d.dispel], key + ' purge'); n++;
        w.removeModifier(f, key);
      }
      const mi = w.addModifier(g, { key, src: c, dur: 5, debuff: true });
      assert.equal(!!mi, d.immunity === 'ENEMIES_YES', key + ' vs debuff immune (' + d.immunity + ')');
      if (mi) w.removeModifier(g, key);
    }
  }
  assert.ok(n > 60);
  // an explicit purge / pierce still wins
  assert.equal(w.addModifier(f, { key: 'pudge_dismember', src: c, dur: 1, debuff: true, purge: 'basic' }).purge, 'basic');
  assert.equal(w.addModifier(g, { key: 'lion_voodoo', src: c, dur: 1, debuff: true, pierce: true }) !== null, true);
});

test('pure damage vs BKB: ENEMIES_YES abilities land, the rest are blocked; magic is reduced 60%', () => {
  const { w, c, f } = mk('npc_dota_hero_axe');
  bkb(w, f);
  for (const k of ['axe_counter_helix', 'pudge_meat_hook', 'invoker_sun_strike', 'axe_culling_blade']) near(w.damage(c, f, 100, 'pure', { ability: k }), 100, 1e-6);
  assert.equal(w.damage(c, f, 100, 'pure', { ability: 'axe_battle_hunger' }), 0);
  near(w.damage(c, f, 100, 'mag', { ability: 'lina_dragon_slave' }), 100 * (1 - f._mr), 1e-6);
  assert.ok(f._mr >= 0.6);
});

test('unit target on a debuff-immune enemy: only ENEMIES_YES abilities are cast', () => {
  const cases = [];
  for (const [hk, h] of Object.entries(HEROES)) {
    if (/invoker/.test(hk)) continue;
    for (const ak of h.abilities) cases.push([hk, ak]);
  }
  let tried = 0;
  for (const [hk, ak] of cases) {
    const { w, c, f } = mk(hk);
    const d = w.data.abilities[ak];
    if (!d || !d.behavior.includes('UNIT_TARGET') || d.behavior.includes('POINT') || d.targetTeam !== 'ENEMY') continue;   // POINT|UNIT_TARGET (Dragon Slave) aims at the spot
    const slot = c.abilities.findIndex((a) => a.key === ak);
    if (slot < 0 || c.abilities[slot].level < 1) continue;
    bkb(w, f); f._lastCast = { key: 'sven_storm_bolt', level: 1, t: w.time };   // spell steal needs something to steal
    w.order('a', { t: 'cast', slot, id: f.id });
    run(w, 1.5);
    assert.equal(c.abilities[slot].cd > 0, d.immunity === 'ENEMIES_YES', `${ak} (${d.immunity})`);
    tried++;
  }
  assert.ok(tried >= 10, `tried ${tried}`);
});

test('crystal nova on BKB: damage lands reduced, no slow', () => {
  const { w, c, f } = mk('npc_dota_hero_crystal_maiden');
  bkb(w, f);
  const hp0 = f.hp;
  w.order('a', { t: 'cast', slot: c.abilities.findIndex((a) => a.key === 'crystal_maiden_crystal_nova'), x: f.x, y: f.y });
  run(w, 1);
  near(hp0 - f.hp, w.val('crystal_maiden_crystal_nova', 'nova_damage', 3) * (1 - f._mr), 2);
  assert.equal(w.hasModifier(f, 'crystal_maiden_crystal_nova'), false);
});

test('storm bolt stun survives a basic dispel; berserker\'s call taunt survives a strong one', () => {
  const { w, c, f } = mk('npc_dota_hero_sven');
  const { w: w2, c: a, f: g } = mk('npc_dota_hero_axe', { foeAt: [150, 0] });
  w.order('a', { t: 'cast', slot: c.abilities.findIndex((x) => x.key === 'sven_storm_bolt'), id: f.id }); run(w, 0.8);
  const sm = w.getModifier(f, 'sven_storm_bolt');
  assert.ok(sm && sm.purge === 'strong', 'stunned, strong-dispel only');
  w.dispel(f, { debuffs: true }); assert.ok(w.getModifier(f, 'sven_storm_bolt'), 'basic dispel keeps it');
  w.dispel(f, { debuffs: true, strong: true }); assert.equal(w.getModifier(f, 'sven_storm_bolt'), null);
  w2.order('a', { t: 'cast', slot: a.abilities.findIndex((x) => x.key === 'axe_berserkers_call') }); run(w2, 0.6);
  assert.ok(w2.getModifier(g, 'axe_berserkers_call'), 'taunted');
  w2.dispel(g, { debuffs: true, strong: true }); assert.ok(w2.getModifier(g, 'axe_berserkers_call'), 'undispellable');
});

test('berserker\'s call (ENEMIES_YES) taunts a BKB hero; meat hook damages and pulls one', () => {
  const { w, c, f } = mk('npc_dota_hero_axe', { foeAt: [150, 0] });
  bkb(w, f);
  w.order('a', { t: 'cast', slot: c.abilities.findIndex((x) => x.key === 'axe_berserkers_call') }); run(w, 0.6);
  assert.ok(f._st & ST.TAUNT);
  const p = mk('npc_dota_hero_pudge', { foeAt: [700, 0] });
  bkb(p.w, p.f);
  const hp0 = p.f.hp;
  p.w.order('a', { t: 'cast', slot: p.c.abilities.findIndex((x) => x.key === 'pudge_meat_hook'), x: 700, y: 0 }); run(p.w, 2.5);
  near(hp0 - p.f.hp, p.w.val('pudge_meat_hook', 'damage', 3), 2);
  assert.ok(p.f.x < 400, `pulled: ${p.f.x}`);
});

test('invoker vs BKB: sun strike lands in full, tornado damages without lifting, deafening blast damages without disarm or knockback, EMP burns nothing', () => {
  { const { w, c, f } = mkInvoker([1, 1, 6]); make(w, 'EEE'); bkb(w, f);
    const hp0 = f.hp; w.order('a', { t: 'cast', slot: 3, x: f.x, y: f.y }); run(w, 2.5);
    near(hp0 - f.hp, w.val('invoker_sun_strike', 'damage', 6), 1); }
  { const { w, c, f } = mkInvoker([4, 4, 1]); make(w, 'WWQ'); bkb(w, f);
    const hp0 = f.hp; let lifted = false;
    w.order('a', { t: 'cast', slot: 3, x: 1500, y: 0 });
    for (let i = 0; i < 60; i++) { w.step(DT); lifted ||= !!w.getModifier(f, 'invoker_tornado_lift'); }
    assert.equal(lifted, false, 'no lift');
    const dmg = w.val('invoker_tornado', 'base_damage', 1) + w.val('invoker_tornado', 'wex_damage', 4) + w.val('invoker_tornado', 'quas_damage', 4);
    near(hp0 - f.hp, dmg * (1 - f._mr), 2); }
  { const { w, c, f } = mkInvoker([4, 4, 4]); make(w, 'QWE'); put(w, f, 300, 0); bkb(w, f);
    const hp0 = f.hp, x0 = f.x;
    w.order('a', { t: 'cast', slot: 3, x: 1000, y: 0 }); run(w, 0.8);
    near(hp0 - f.hp, w.val('invoker_deafening_blast', 'damage', 4) * (1 - f._mr), 2);
    assert.equal(f._st & ST.DISARM, 0); near(f.x, x0, 1); }
  { const { w, c, f } = mkInvoker([1, 4, 1]); make(w, 'WWW'); put(w, f, 600, 0); bkb(w, f);
    const m0 = f.mana, hp0 = f.hp; w.order('a', { t: 'cast', slot: 3, x: 600, y: 0 }); run(w, 3.5);
    assert.ok(f.mana >= m0 - 1e-6, 'EMP (ENEMIES_NO) burns no mana off a debuff-immune hero'); assert.equal(f.hp, hp0); }
  { const { w, c, f } = mkInvoker([1, 4, 1]); make(w, 'WWW'); put(w, f, 600, 0);   // control: no BKB, it burns
    const m0 = f.mana; w.order('a', { t: 'cast', slot: 3, x: 600, y: 0 }); run(w, 3.5);
    near(m0 - f.mana, w.val('invoker_emp', 'mana_burned', 4), 5); }
});

test('blade fury as the immunity source: basic dispel on cast, stuns blocked, magic reduced 80%, pure (no pureImmune) lands', () => {
  const { w, c: j, f } = mk('npc_dota_hero_juggernaut', { foeAt: [900, 0] });
  w.addModifier(j, { key: 'axe_battle_hunger', src: f, dur: 10, debuff: true });   // basic-dispellable debuff
  const slot = j.abilities.findIndex((a) => a.key === 'juggernaut_blade_fury');
  w.order('a', { t: 'cast', slot }); run(w, 0.2);
  const bf = w.getModifier(j, 'juggernaut_blade_fury');
  assert.ok(bf && (j._st & ST.MAGIC_IMMUNE), 'spinning'); assert.equal(bf.purge, 'none', 'DATA dispel NO');
  assert.equal(w.hasModifier(j, 'axe_battle_hunger'), false, 'basic dispel on cast');
  assert.equal(w.addModifier(j, { key: 'sven_storm_bolt', src: f, dur: 1, status: ST.STUN, debuff: true }), null);
  assert.ok(w.addModifier(j, { key: 'pudge_dismember', src: f, dur: 1, status: ST.STUN, debuff: true }), 'ENEMIES_YES pierces');
  w.removeModifier(j, 'pudge_dismember');
  const mr0 = j._mr;
  assert.ok(mr0 >= 0.8, 'immunity_resist 80: ' + mr0);
  near(w.damage(f, j, 100, 'mag', { ability: 'lina_dragon_slave' }), 100 * (1 - mr0), 1e-6);
  near(w.damage(f, j, 100, 'pure', { ability: 'axe_battle_hunger' }), 100, 1e-6);
});

test('a unit-target ENEMIES_NO cast is cancelled when the target goes debuff immune during the cast point; ENEMIES_YES goes through', () => {
  { const { w, c, f } = mk('npc_dota_hero_lion');
    const slot = c.abilities.findIndex((a) => a.key === 'lion_finger_of_death');   // 0.3 s cast point
    const hp0 = f.hp, m0 = c.mana;
    w.order('a', { t: 'cast', slot, id: f.id }); w.step(DT);
    bkb(w, f); run(w, 1.5);
    assert.equal(c.abilities[slot].cd, 0, 'no cooldown'); assert.equal(c.mana, m0, 'no mana'); assert.equal(f.hp, hp0, 'no damage'); }
  { const { w, c, f } = mk('npc_dota_hero_pudge', { foeAt: [120, 0] });
    const slot = c.abilities.findIndex((a) => a.key === 'pudge_dismember');
    w.order('a', { t: 'cast', slot, id: f.id }); w.step(DT);
    bkb(w, f); run(w, 0.6);
    assert.ok(c.abilities[slot].cd > 0); assert.ok(w.hasModifier(f, 'pudge_dismember')); }
});

test('zeus vs BKB: lightning bolt / wrath still reveal and damage (reduced), the ministun does not land', () => {
  const { w, c, f } = mk('npc_dota_hero_zuus');
  bkb(w, f);
  const hp0 = f.hp;
  w.order('a', { t: 'cast', slot: c.abilities.findIndex((a) => a.key === 'zuus_lightning_bolt'), x: f.x, y: f.y }); run(w, 0.8);
  assert.ok(hp0 - f.hp > 0, 'damaged');
  assert.equal(w.hasModifier(f, 'zuus_lightning_bolt_stun'), false);
  assert.ok(w.hasModifier(f, 'zuus_lightning_bolt_reveal'));
  w.order('a', { t: 'cast', slot: c.abilities.findIndex((a) => a.key === 'zuus_thundergods_wrath') }); run(w, 1);
  assert.ok(w.hasModifier(f, 'zuus_thundergods_wrath_reveal'));
});

test('bots: no ENEMIES_NO spell is spent on a lone debuff-immune foe; ENEMIES_YES ones still are', () => {
  const setup = (heroKey) => {
    const w = new World({ seed: 7, pregame: 0, buildings: false });
    const b = w.addHero({ pid: 'b', team: TEAM.RADIANT, heroKey, bot: true, slot: 0 });
    put(w, b, 0, 0); b.level = 25; b.skillPoints = 40;
    w.addModifier(b, { key: 'pool', src: b, mana: 5000, debuff: false });
    const f = w.addHero({ pid: 'f', team: TEAM.DIRE, heroKey: 'npc_dota_hero_sven' });
    put(w, f, 300, 0); f._noAttack = true;
    w.addModifier(f, { key: 'tank', src: f, hp: 99000, debuff: false });
    w.step(DT); f.hp = f.maxHp; b.mana = b.maxMana;
    b.abilities.forEach((ab, i) => { for (let l = 0; l < 3; l++) w.order('b', { t: 'learn', slot: i }); });
    bkb(w, f);
    return { w, b, f };
  };
  for (const hk of ['npc_dota_hero_lina', 'npc_dota_hero_lion', 'npc_dota_hero_crystal_maiden', 'npc_dota_hero_axe']) {
    const { w, b, f } = setup(hk);
    for (let i = 0; i < 4 / DT; i++) { w.step(DT); w.teleport(f, b.x + 300, b.y); }   // keep the foe in reach wherever the bot walks
    assert.equal(w.players.get('b')._bot.errs, 0);
    for (const ab of b.abilities) {
      const d = w.data.abilities[ab.key];
      if (ab.level > 0 && d.immunity === 'ENEMIES_NO' && !d.behavior.includes('PASSIVE')) assert.equal(ab.cd, 0, `${hk} ${ab.key} not wasted`);
    }
    if (hk === 'npc_dota_hero_axe') assert.ok(b.abilities.find((a) => a.key === 'axe_berserkers_call').cd > 0, 'berserker\'s call (ENEMIES_YES) is used');
  }
});
