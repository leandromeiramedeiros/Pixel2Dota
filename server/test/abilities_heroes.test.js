// Hero ability tests (lina lion crystal_maiden axe sniper zuus drow_ranger juggernaut): node --test "server/test/abilities_heroes.test.js"
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { HANDLERS } from '../src/sim/abilities/index.js';
import { HEROES } from '../../shared/heroes.js';
import { TEAM, ST, KIND } from '../../shared/protocol.js';

const DT = 1 / 30;
const run = (w, sec) => { for (let i = 0, n = Math.round(sec / DT); i < n; i++) w.step(DT); };
const put = (w, u, x, y) => { w.teleport(u, x, y); w.index.insert(u); };
const near = (a, b, eps = 1) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const lost = (u) => u.maxHp - u.hp;
const magLost = (u, dmg) => dmg * (1 - u._mr);

/** Arena: caster 'a' (RADIANT) at (0,0), dummy sven foes (DIRE, huge hp, no attack) at the given positions. All abilities of the caster
 *  are levelled to 1 (static_field is skipped: innate). */
function mk(short, foes = [[600, 0]], { learn = 1, attack = false, seed = 5 } = {}) {
  const w = new World({ seed, pregame: 0, buildings: false });
  const c = w.addHero({ pid: 'a', team: TEAM.RADIANT, heroKey: 'npc_dota_hero_' + short });
  c.level = 25; c.skillPoints = 40;
  put(w, c, 0, 0);
  w.addModifier(c, { key: 'pool', src: c, mana: 5000, debuff: false });
  c._noAttack = !attack;
  const fs = foes.map(([x, y], i) => {
    const f = w.addHero({ pid: 'f' + i, team: TEAM.DIRE, heroKey: 'npc_dota_hero_sven' });
    put(w, f, x, y);
    w.addModifier(f, { key: 'tank', src: f, hp: 99000, mana: 2000, debuff: false });
    f._noAttack = true;
    return f;
  });
  w.step(DT);
  for (const f of fs) { w.addModifier(f, { key: 'noregen', src: f, hpRegen: -f._hpRegen, debuff: false }); }
  w.step(DT);
  for (const f of fs) { f.hp = f.maxHp; f.mana = f.maxMana; }
  c.mana = c.maxMana;
  c.abilities.forEach((ab, i) => { for (let l = 0; l < learn; l++) w.order('a', { t: 'learn', slot: i }); });
  w.step(DT);
  return { w, c, f: fs[0], fs };
}
const slot = (c, key) => c.abilities.findIndex((a) => a.key === key);
const ab = (c, key) => c.abilities.find((a) => a.key === key);
const cast = (w, c, key, o = {}) => { assert.ok(w.order('a', { t: 'cast', slot: slot(c, key), ...o }), 'order accepted'); };
const mod = (w, u, key) => w.getModifier(u, key);

test('registry: every ability of the 8 heroes has a handler', () => {
  for (const hk of ['lina', 'lion', 'crystal_maiden', 'axe', 'sniper', 'zuus', 'drow_ranger', 'juggernaut']) {
    for (const key of HEROES['npc_dota_hero_' + hk].abilities) assert.ok(HANDLERS[key], key);
  }
});

test('lina: dragon slave (point cast) + fiery soul stack, light strike array stun, laguna blade', () => {
  const { w, c, f } = mk('lina');
  cast(w, c, 'lina_dragon_slave', { x: f.x, y: f.y });
  run(w, 1.6);
  near(lost(f), magLost(f, w.val('lina_dragon_slave', 'dragon_slave_damage', 1)));
  assert.equal(mod(w, c, 'lina_fiery_soul').stacks, 1);
  f.hp = f.maxHp;
  cast(w, c, 'lina_light_strike_array', { x: f.x, y: f.y });
  run(w, 0.45 + 0.5 + 0.2);
  assert.ok(f._st & ST.STUN, 'stunned');
  near(lost(f), magLost(f, w.val('lina_light_strike_array', 'light_strike_array_damage', 1)));
  assert.equal(mod(w, c, 'lina_fiery_soul').stacks, 2);
  assert.ok(c.atkRate > 0);
  f.hp = f.maxHp;
  cast(w, c, 'lina_laguna_blade', { id: f.id });
  run(w, 1);
  near(lost(f), magLost(f, w.val('lina_laguna_blade', 'damage', 1)));
});

test('lion: impale stuns along the line, hex, mana drain, finger of death', () => {
  const { w, c, f } = mk('lion');
  cast(w, c, 'lion_impale', { x: f.x, y: f.y });
  run(w, 0.3 + 0.5);
  assert.ok(f._st & ST.STUN, 'impaled');
  near(lost(f), magLost(f, w.val('lion_impale', 'damage', 1)));
  run(w, 2);
  assert.ok(!(f._st & ST.STUN));
  cast(w, c, 'lion_voodoo', { id: f.id });
  run(w, 0.2);
  assert.ok(f._st & ST.HEX && f._st & ST.SILENCE && f._st & ST.DISARM);
  assert.equal(f.ms, 100);
  w.removeModifier(f, 'lion_voodoo');
  c.mana = 100; f.mana = 1000;
  cast(w, c, 'lion_mana_drain', { id: f.id });
  run(w, 1.5);
  assert.ok(c._channel, 'channeling');
  assert.ok(c.mana > 100 + 20 && f.mana < 1000 - 20, `mana ${c.mana} ${f.mana}`);
  assert.ok(f._slowed);
  w.order('a', { t: 'stop' }); run(w, 0.1);
  assert.ok(!mod(w, f, 'lion_mana_drain'), 'slow removed on channel end');
  f.hp = f.maxHp; c.mana = c.maxMana;
  cast(w, c, 'lion_finger_of_death', { id: f.id });
  run(w, 1);
  near(lost(f), magLost(f, w.val('lion_finger_of_death', 'damage', 1)));
});

test('crystal maiden: nova slow, frostbite root + dot, brilliance regen, freezing field', () => {
  const { w, c, f, fs } = mk('crystal_maiden', [[500, 0]]);
  const ms0 = f.ms;
  cast(w, c, 'crystal_maiden_crystal_nova', { x: f.x, y: f.y });
  run(w, 0.6);
  near(lost(f), magLost(f, w.val('crystal_maiden_crystal_nova', 'nova_damage', 1)));
  assert.ok(f.ms < ms0, 'slowed');
  w.removeModifier(f, 'crystal_maiden_crystal_nova'); f.hp = f.maxHp;
  cast(w, c, 'crystal_maiden_frostbite', { id: f.id });
  run(w, 1.4);
  assert.ok(f._st & ST.ROOT && f._st & ST.DISARM);
  const dps = w.val('crystal_maiden_frostbite', 'damage_per_second', 1);
  assert.ok(lost(f) > dps * 0.5 * (1 - f._mr), `dot ${lost(f)}`);
  // brilliance: global for allies, tripled nearby; self gets the amp
  const ally = w.addHero({ pid: 'z', team: TEAM.RADIANT, heroKey: 'npc_dota_hero_sven' });
  put(w, ally, 300, 0); ally._noAttack = true; w.step(DT);
  const r0 = ally._manaRegen;
  run(w, 0.8);
  near(ally._manaRegen - r0, w.val('crystal_maiden_brilliance_aura', 'base_mana_regen', 1) * 3, 0.01);
  put(w, ally, 4000, 0); run(w, 0.8);
  near(ally._manaRegen - r0, w.val('crystal_maiden_brilliance_aura', 'base_mana_regen', 1), 0.01);
  // freezing field
  w.removeModifier(f, 'crystal_maiden_frostbite'); f.hp = f.maxHp; f.mana = f.maxMana;
  put(w, f, 450, 0);
  cast(w, c, 'crystal_maiden_freezing_field');
  run(w, 3);
  assert.ok(c._channel, 'channeling');
  assert.ok(f._slowed, 'aura slow');
  assert.ok(lost(f) > 0, 'explosions hit');
  assert.equal(fs.length, 1);
});

test('axe: berserkers call taunts + armor, battle hunger dot/slow, counter helix, culling blade', () => {
  const { w, c, f, fs } = mk('axe', [[200, 0], [260, 0]]);
  const armor0 = c.armor;
  cast(w, c, 'axe_berserkers_call');
  run(w, 0.5);
  assert.ok(f._st & ST.TAUNT, 'taunted');
  assert.equal(mod(w, f, 'axe_berserkers_call').taunter, c.id);
  assert.ok(c.armor >= armor0 + w.val('axe_berserkers_call', 'bonus_armor', 1) - 0.01);
  w.removeModifier(f, 'axe_berserkers_call'); w.removeModifier(fs[1], 'axe_berserkers_call');
  cast(w, c, 'axe_battle_hunger', { id: f.id });
  run(w, 3.6);
  assert.ok(f._slowed);
  near(lost(f), w.val('axe_battle_hunger', 'damage_per_second', 1) * 3, 0.5);
  // counter helix: every N-th attack taken (hook driven, N from the data)
  w.removeModifier(f, 'axe_battle_hunger'); f.hp = f.maxHp; fs[1].hp = fs[1].maxHp;
  const hx = ab(c, 'axe_counter_helix'), n = w.val('axe_counter_helix', 'trigger_attacks', 1);
  for (let i = 0; i < n - 1; i++) HANDLERS.axe_counter_helix.onAttacked(w, c, hx, f, {}, 10);
  assert.equal(lost(f), 0);
  HANDLERS.axe_counter_helix.onAttacked(w, c, hx, f, {}, 10);
  near(lost(f), w.val('axe_counter_helix', 'damage', 1), 0.01);   // pure
  // culling blade: above threshold only damages
  f.hp = f.maxHp;
  cast(w, c, 'axe_culling_blade', { id: f.id });
  run(w, 0.8);
  near(lost(f), w.val('axe_culling_blade', 'damage', 1), 0.01);
  assert.ok(!f._dead);
  const cb = ab(c, 'axe_culling_blade');
  assert.ok(cb.cd > 0);
  // below threshold: kills, resets cooldown, hastes
  const g = fs[1];
  g.hp = 100; cb.cd = 0; c.mana = c.maxMana;
  cast(w, c, 'axe_culling_blade', { id: g.id });
  run(w, 0.8);
  assert.ok(g._dead, 'executed');
  assert.equal(cb.cd, 0);
  assert.ok(mod(w, c, 'axe_culling_blade'), 'haste');
});

test('axe: battle hunger ends when the afflicted hero scores a kill', () => {
  const { w, c, f } = mk('axe', [[200, 0]]);
  const dummy = w.addHero({ pid: 'z', team: TEAM.RADIANT, heroKey: 'npc_dota_hero_sven' });
  put(w, dummy, -300, 0); dummy._noAttack = true;
  cast(w, c, 'axe_battle_hunger', { id: f.id });
  run(w, 1);
  assert.ok(mod(w, f, 'axe_battle_hunger'));
  dummy.hp = 1; w.damage(f, dummy, 50, 'pure');
  assert.ok(dummy._dead);
  run(w, 0.2);
  assert.ok(!mod(w, f, 'axe_battle_hunger'), 'removed');
});

test('sniper: shrapnel zone, headshot proc + slow, take aim range, assassinate', () => {
  const { w, c, f, fs } = mk('sniper', [[900, 0], [900, -1500]]);
  const rng0 = c.atkRange;
  const base = mk('sniper', [[900, 0]], { learn: 0 });
  assert.equal(rng0 - base.c.atkRange, w.val('sniper_take_aim', 'passive_attack_range_bonus', 1));
  const ta = ab(c, 'sniper_take_aim');
  assert.ok(ta.flags & 1, 'shows as passive');
  cast(w, c, 'sniper_shrapnel', { x: f.x, y: f.y });
  run(w, 1.2 + 0.3 + 1.2);
  assert.ok(lost(f) >= magLost(f, w.val('sniper_shrapnel', 'shrapnel_damage', 1)) - 0.01, `shrapnel ${lost(f)}`);
  assert.ok(f._slowed);
  // headshot
  const hs = ab(c, 'sniper_headshot');
  let procs = 0;
  for (let i = 0; i < 200; i++) {
    const info = { dmg: 50, crit: 1 };
    HANDLERS.sniper_headshot.onAttack(w, c, hs, f, info);
    if (info.headshot) { procs++; assert.equal(info.dmg, 50 + w.val('sniper_headshot', 'damage', 1)); HANDLERS.sniper_headshot.onAttackLanded(w, c, hs, f, info, 10); }
  }
  assert.ok(procs > 50 && procs < 110, `procs ${procs}`);
  assert.ok(mod(w, f, 'sniper_headshot'));
  // assassinate
  const g = fs[1];
  cast(w, c, 'sniper_assassinate', { id: g.id });
  run(w, 2.8);
  assert.ok(g._st & ST.STUN, 'mini stun');
  near(lost(g), magLost(g, w.val('sniper_assassinate', 'damage', 1)));
});

test('zuus: arc chain, bolt on a point, innate static field, thundergods wrath', () => {
  const { w, c, f, fs } = mk('zuus', [[400, 0], [600, 0], [800, 0]]);
  const sf = ab(c, 'zuus_static_field');
  assert.equal(w.order('a', { t: 'learn', slot: slot(c, 'zuus_static_field') }), false, 'innate is not skill-pointable');
  cast(w, c, 'zuus_arc_lightning', { id: f.id });
  run(w, 1.5);
  const arc = magLost(f, w.val('zuus_arc_lightning', 'arc_damage', 1));
  for (const x of fs) assert.ok(lost(x) >= arc - 1, `chain hit ${x.id} ${lost(x)}`);
  assert.equal(sf.level, 1, 'static field forced to level 1');
  assert.ok(lost(f) > arc + 1, 'static field adds current-hp damage');
  for (const x of fs) { x.hp = x.maxHp; }
  c.abilities.forEach((a) => { a.cd = 0; });
  cast(w, c, 'zuus_lightning_bolt', { x: 620, y: 50 });
  run(w, 0.5);
  const bolted = fs.filter((x) => mod(w, x, 'zuus_lightning_bolt_stun'));
  assert.equal(bolted.length, 1);
  assert.equal(bolted[0], fs[1], 'nearest enemy to the point');
  assert.ok(mod(w, bolted[0], 'zuus_lightning_bolt_reveal'));
  assert.ok(lost(bolted[0]) >= magLost(bolted[0], w.val('zuus_lightning_bolt', 'damage', 1)) - 1);
  // wrath is global
  put(w, fs[2], 6000, 6000);
  for (const x of fs) x.hp = x.maxHp;
  c.abilities.forEach((a) => { a.cd = 0; });
  cast(w, c, 'zuus_thundergods_wrath');
  run(w, 1);
  const wr = w.val('zuus_thundergods_wrath', 'damage', 1);
  for (const x of fs) assert.ok(lost(x) >= magLost(x, wr) - 1, `wrath ${x.id} ${lost(x)}`);
});

test('drow ranger: frost arrows autocast, wave of silence, multishot, marksmanship', () => {
  const { w, c, f } = mk('drow_ranger', [[550, 0]], { attack: true });
  const fa = ab(c, 'drow_ranger_frost_arrows');
  assert.ok(fa.flags & 4, 'autocast on by default');
  const mana0 = c.mana;
  assert.ok(w.order('a', { t: 'attack', id: f.id }));
  run(w, 2);
  assert.ok(mod(w, f, 'drow_ranger_frost_arrows'), 'slowed by frost arrows');
  assert.ok(c.mana < mana0, 'arrows cost mana');
  assert.ok(f._slowed);
  w.order('a', { t: 'stop' });
  c._noAttack = true; w.removeModifier(f, 'drow_ranger_frost_arrows'); run(w, 0.3);
  // wave of silence
  f.hp = f.maxHp; put(w, f, 450, 0); put(w, c, 0, 0);
  cast(w, c, 'drow_ranger_wave_of_silence', { x: f.x, y: f.y });
  run(w, 0.25 + 0.5);
  assert.ok(f._st & ST.SILENCE, 'silenced');
  run(w, 1.2);
  assert.ok(f.x > 450 + 100, `knocked back ${f.x}`);
  // multishot
  w.removeModifier(f, 'drow_ranger_wave_of_silence'); f.hp = f.maxHp; put(w, f, 350, 0);
  const dmg = (c.dmgMin + c.dmgMax) / 2 + c.dmgBonus;
  cast(w, c, 'drow_ranger_multishot', { x: f.x, y: f.y });
  run(w, 0.2);
  assert.ok(c._channel, 'channeling');
  run(w, 2.2);
  assert.ok(lost(f) >= 3 * dmg * 0.8 * (1 - 0) * 0.5, `multishot ${lost(f)}`);
  // marksmanship: proc only with no enemy hero within disable_range
  const mm = ab(c, 'drow_ranger_marksmanship');
  put(w, f, 1000, 0);
  let procs = 0;
  for (let i = 0; i < 300; i++) { const info = { dmg: 50, crit: 1 }; HANDLERS.drow_ranger_marksmanship.onAttack(w, c, mm, f, info); if (info.marksman) procs++; }
  assert.ok(procs > 30, `procs ${procs}`);
  put(w, f, 200, 0); w.index.insert(f);
  procs = 0;
  w.step(DT);
  for (let i = 0; i < 300; i++) { const info = { dmg: 50, crit: 1 }; HANDLERS.drow_ranger_marksmanship.onAttack(w, c, mm, f, info); if (info.marksman) procs++; }
  assert.equal(procs, 0, 'disabled near an enemy hero');
});

test('juggernaut: blade fury, healing ward, blade dance crit, omnislash', () => {
  const { w, c, f, fs } = mk('juggernaut', [[150, 0], [300, 200]]);
  cast(w, c, 'juggernaut_blade_fury');
  run(w, 1.05);
  assert.ok(c._st & ST.MAGIC_IMMUNE && c._st & ST.DISARM);
  const dps = w.val('juggernaut_blade_fury', 'blade_fury_damage', 1);
  assert.ok(lost(f) >= magLost(f, dps) * 0.7, `fury ${lost(f)}`);
  assert.equal(lost(fs[1]), 0, 'outside radius');
  w.removeModifier(c, 'juggernaut_blade_fury'); f.hp = f.maxHp;
  // healing ward
  c.hp = c.maxHp - 200;
  cast(w, c, 'juggernaut_healing_ward', { x: 100, y: 0 });
  run(w, 0.5);
  const ward = [...w.units.values()].find((u) => u.key === 'juggernaut_healing_ward');
  assert.ok(ward && ward.kind === KIND.WARD, 'ward summoned');
  const hp0 = c.hp;
  run(w, 2);
  assert.ok(c.hp > hp0 + 0.5 * c.maxHp * w.val('juggernaut_healing_ward', 'healing_ward_heal_amount', 1) / 100, `healed ${c.hp - hp0}`);
  // blade dance
  const bd = ab(c, 'juggernaut_blade_dance');
  let crits = 0;
  for (let i = 0; i < 300; i++) { const info = { dmg: 50, crit: 1 }; HANDLERS.juggernaut_blade_dance.onAttack(w, c, bd, f, info); if (info.crit > 1) { crits++; near(info.crit, w.val('juggernaut_blade_dance', 'blade_dance_crit_mult', 1) / 100, 1e-9); } }
  assert.ok(crits > 70 && crits < 140, `crits ${crits}`);
  // omnislash
  w.removeModifier(c, 'juggernaut_blade_fury');
  for (const x of fs) x.hp = x.maxHp;
  c.abilities.forEach((a) => { a.cd = 0; });
  cast(w, c, 'juggernaut_omni_slash', { id: f.id });
  run(w, 0.6);
  assert.ok(c._st & ST.INVULN, 'invulnerable while slashing');
  run(w, 3.4);
  assert.ok(lost(f) > 0 && lost(fs[1]) > 0, `both hit ${lost(f)} ${lost(fs[1])}`);
  assert.ok(!(c._st & ST.INVULN), 'finished');
});
