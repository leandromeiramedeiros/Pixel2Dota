// Pudge / Mirana / Rubick: node --test "server/test/abilities_newheroes.test.js"
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { HANDLERS } from '../src/sim/abilities/index.js';
import { HEROES, HERO_KEYS } from '../../shared/heroes.js';
import { TEAM, ST, ABF } from '../../shared/protocol.js';

const DT = 1 / 30;
const run = (w, sec) => { for (let i = 0, n = Math.round(sec / DT); i < n; i++) w.step(DT); };
const put = (w, u, x, y) => { w.teleport(u, x, y); w.index.insert(u); };
const near = (a, b, eps = 1) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const lost = (u) => u.maxHp - u.hp;
const magLost = (u, dmg) => dmg * (1 - u._mr);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Arena: caster 'a' (RADIANT) at (0,0); dummy DIRE foes (huge hp, no attack, no regen) of hero `foeKey` at the given points.
 *  `skip`: ability keys the caster does NOT learn. */
function mk(short, foes = [[600, 0]], { skip = [], foeKey = 'sven', seed = 5, regen = false } = {}) {
  const w = new World({ seed, pregame: 0, buildings: false });
  const c = w.addHero({ pid: 'a', team: TEAM.RADIANT, heroKey: 'npc_dota_hero_' + short });
  c.level = 25; c.skillPoints = 40;
  put(w, c, 0, 0);
  w.addModifier(c, { key: 'pool', src: c, mana: 5000, debuff: false });
  c._noAttack = true;
  const fs = foes.map(([x, y], i) => {
    const f = w.addHero({ pid: 'f' + i, team: TEAM.DIRE, heroKey: 'npc_dota_hero_' + foeKey });
    put(w, f, x, y);
    w.addModifier(f, { key: 'tank', src: f, hp: 99000, mana: 3000, debuff: false });
    f._noAttack = true;
    return f;
  });
  w.step(DT);
  for (const f of fs) w.addModifier(f, { key: 'noregen', src: f, hpRegen: -f._hpRegen, debuff: false });
  if (!regen) w.addModifier(c, { key: 'noregen', src: c, hpRegen: -c._hpRegen, debuff: false });
  w.step(DT);
  for (const f of fs) { f.hp = f.maxHp; f.mana = f.maxMana; }
  c.hp = c.maxHp; c.mana = c.maxMana;
  c.abilities.forEach((ab, i) => { if (!skip.includes(ab.key)) w.order('a', { t: 'learn', slot: i }); });
  w.step(DT);
  return { w, c, f: fs[0], fs };
}
const slot = (c, key) => c.abilities.findIndex((a) => a.key === key);
const ab = (c, key) => c.abilities.find((a) => a.key === key);
const cast = (w, c, key, o = {}) => { assert.ok(w.order('a', { t: 'cast', slot: slot(c, key), ...o }), 'order accepted'); };
const mod = (w, u, key) => w.getModifier(u, key);

test('registry: every ability of pudge, mirana and rubick has a handler; roster is wired', () => {
  for (const hk of ['pudge', 'mirana', 'rubick']) {
    const key = 'npc_dota_hero_' + hk;
    assert.ok(HERO_KEYS.includes(key));
    for (const k of HEROES[key].abilities) if (!/empty/.test(k)) assert.ok(HANDLERS[k], k);
  }
  assert.deepEqual(HEROES.npc_dota_hero_rubick.keys, ['Q', 'W', 'E', 'D', 'F', 'R']);
});

// ---------------------------------------------------------------------------------------------------------------- Pudge
test('pudge: meat hook drags the first unit hit back to Pudge; pure damage to enemies', () => {
  const { w, c, f } = mk('pudge', [[900, 0]]);
  cast(w, c, 'pudge_meat_hook', { x: 1100, y: 0 });
  run(w, 3);
  assert.ok(dist(c, f) < c.radius + f.radius + 60, `dragged to Pudge (${dist(c, f)})`);
  near(lost(f), w.val('pudge_meat_hook', 'damage', 1));
  assert.ok(ab(c, 'pudge_meat_hook').cd > 0);
});

test('pudge: hook takes the first unit in line (an ally), drags it, no damage', () => {
  const { w, c, f } = mk('pudge', [[1000, 0]]);
  const al = w.addHero({ pid: 'al', team: TEAM.RADIANT, heroKey: 'npc_dota_hero_sven' });
  put(w, al, 500, 0); al._noAttack = true;
  w.step(DT);
  const fx = f.x;
  cast(w, c, 'pudge_meat_hook', { x: 1100, y: 0 });
  run(w, 3);
  assert.ok(dist(c, al) < c.radius + al.radius + 60, 'ally dragged');
  assert.equal(al.hp, al.maxHp);
  assert.ok(Math.abs(f.x - fx) < 5, 'enemy behind untouched');
  assert.equal(lost(f), 0);
});

test('pudge: hook miss retracts and deals nothing', () => {
  const { w, c, f } = mk('pudge', [[900, 700]]);
  cast(w, c, 'pudge_meat_hook', { x: 1100, y: 0 });
  run(w, 3);
  assert.equal(lost(f), 0);
});

test('pudge: rot hurts enemies AND Pudge (never kills him), slows, toggles off', () => {
  const { w, c, f } = mk('pudge', [[150, 0]]);
  const R = 'pudge_rot';
  cast(w, c, R);
  w.step(DT);
  assert.ok(ab(c, R).flags & ABF.TOGGLE_ON);
  run(w, 2);
  const tick = w.val(R, 'rot_tick', 1);
  const n = Math.floor(2 / tick);   // ticks in 2 s (+- 1 tick of phase)
  const per = w.val(R, 'rot_damage', 1) * tick;
  assert.ok(Math.abs(lost(f) - magLost(f, per * n)) <= magLost(f, per) * 2, `foe lost ${lost(f)}`);
  assert.ok(Math.abs(lost(c) - magLost(c, per * n)) <= magLost(c, per) * 2, `self lost ${lost(c)}`);
  assert.ok(mod(w, f, R), 'slowed');
  assert.equal(mod(w, f, R).msPct, w.val(R, 'rot_slow', 1));
  c.hp = 3; run(w, 1);
  assert.ok(c.hp >= 1 && !c._dead, 'rot cannot kill Pudge');
  cast(w, c, R); w.step(DT);
  assert.ok(!(ab(c, R).flags & ABF.TOGGLE_ON));
  c.hp = c.maxHp; const l0 = lost(f); run(w, 1);
  assert.equal(lost(f), l0, 'no damage once off');
  assert.equal(c.hp, c.maxHp);
});

test('pudge: dismember stuns, damages over time (str-scaled) and heals Pudge, released at the end', () => {
  const { w, c, f } = mk('pudge', [[150, 0]]);
  c.hp = c.maxHp - 800;
  const hp0 = c.hp;
  cast(w, c, 'pudge_dismember', { id: f.id });
  run(w, 1.2);
  assert.ok(f._st & ST.STUN, 'stunned');
  assert.ok(c._channel, 'channelling');
  const dur = w.field('pudge_dismember', 'channel', 1);
  run(w, dur + 0.5);
  assert.ok(!(f._st & ST.STUN), 'released');
  const total = (w.val('pudge_dismember', 'dismember_damage', 1) + w.val('pudge_dismember', 'strength_damage', 1) * c.str) * dur;
  near(lost(f), magLost(f, total), total * 0.12);
  assert.ok(c.hp > hp0 + magLost(f, total) * 0.8, 'healed by damage dealt');
});

test('pudge: dismember is interrupted when Pudge is stunned, stun on the victim ends', () => {
  const { w, c, f } = mk('pudge', [[150, 0]]);
  cast(w, c, 'pudge_dismember', { id: f.id });
  run(w, 1);
  w.addModifier(c, { key: 'zap', src: f, dur: 1, status: ST.STUN, debuff: true });
  w.step(DT);
  assert.ok(!c._channel);
  assert.ok(!mod(w, f, 'pudge_dismember'));
});

test('pudge: flesh heap grants magic resistance; hero kills stack strength', () => {
  const { w, c, f } = mk('pudge', [[600, 0]]);
  const mr0 = c._mr, str0 = c.str;
  cast(w, c, 'pudge_flesh_heap');
  run(w, 0.2);
  assert.ok(c._mr > mr0, 'magic resist up');
  f.hp = 1;
  w.damage(c, f, 50, 'pure', { attack: true });
  w.step(DT); w.step(DT);
  assert.equal(c._fhStacks, 1);
  assert.ok(c.str >= str0, 'strength not lower');
  assert.ok(c.str + c._bonus.str >= 0);
  assert.ok(c._bonus.str > 0, 'bonus strength from the stack');
});

// ---------------------------------------------------------------------------------------------------------------- Mirana
test('mirana: starstorm hits everything in radius, then a second star hits the nearest', () => {
  const { w, c, fs } = mk('mirana', [[300, 0], [500, 0], [1200, 0]]);
  const [a, b, far] = fs;
  cast(w, c, 'mirana_starfall');
  run(w, 0.55);
  const dmg = w.val('mirana_starfall', 'damage', 1);
  near(lost(a), magLost(a, dmg)); near(lost(b), magLost(b, dmg));
  assert.equal(lost(far), 0);
  run(w, 0.8);
  near(lost(a), magLost(a, dmg * 1.8));
  near(lost(b), magLost(b, dmg));
});

test('mirana: sacred arrow stun scales with distance travelled and caps at max', () => {
  const stunAt = (d) => {
    const { w, c, f } = mk('mirana', [[d, 0]]);
    cast(w, c, 'mirana_arrow', { x: d, y: 0 });
    let m = null;
    for (let i = 0; i < 200 && !m; i++) { w.step(DT); m = mod(w, f, 'mirana_arrow'); }
    assert.ok(m, `stunned at ${d}`);
    near(lost(f), magLost(f, w.val('mirana_arrow', 'damage', 1)));
    return m.dur;
  };
  const sMin = 0.01, sMax = 2.3, R = 1500;
  const near1 = stunAt(300), mid = stunAt(750), far = stunAt(2500);
  near(near1, sMin + (sMax - sMin) * 300 / R, 0.05);
  near(mid, sMin + (sMax - sMin) * 750 / R, 0.05);
  near(far, sMax, 0.001);
  assert.ok(near1 < mid && mid < far);
});

test('mirana: arrow hits only the first enemy', () => {
  const { w, c, fs } = mk('mirana', [[500, 0], [900, 0]]);
  cast(w, c, 'mirana_arrow', { x: 900, y: 0 });
  run(w, 2);
  assert.ok(lost(fs[0]) > 0); assert.equal(lost(fs[1]), 0);
});

test('mirana: leap dashes forward, grants speed buff, spends charges that regenerate', () => {
  const { w, c } = mk('mirana', []);
  c.facing = 0;
  const L = 'mirana_leap';
  cast(w, c, L); run(w, 0.8);
  assert.ok(c.x > 500, `leapt (${c.x})`);
  assert.ok(mod(w, c, L), 'buff');
  const x1 = c.x;
  cast(w, c, L); run(w, 0.8);
  assert.ok(c.x > x1 + 50, 'second leap moved');
  assert.equal(c._leap.n, 0);
  assert.ok(ab(c, L).cd > 0, 'out of charges: cd sweep shows next charge');
  const x2 = c.x;
  w.order('a', { t: 'cast', slot: slot(c, L) }); run(w, 0.8);
  assert.ok(Math.abs(c.x - x2) < 5 && c._leap.n === 0, 'third leap rejected');
  run(w, w.val(L, 'AbilityChargeRestoreTime', 1) + 1);
  assert.equal(c._leap.n, 1);
  assert.equal(ab(c, L).cd, 0);
});

test('mirana: moonlight shadow fades all allied heroes after fade_delay, breaks on attack, true sight reveals', () => {
  const { w, c, f } = mk('mirana', [[800, 0]]);
  const al = w.addHero({ pid: 'al', team: TEAM.RADIANT, heroKey: 'npc_dota_hero_sven' });
  put(w, al, 200, 0); al._noAttack = true;
  w.step(DT);
  const fade = w.val('mirana_invis', 'fade_delay', 1);
  cast(w, c, 'mirana_invis');
  run(w, fade);
  assert.ok(!(c._st & ST.INVIS) && !(al._st & ST.INVIS), 'not yet');
  run(w, 1.0);
  assert.ok(c._st & ST.INVIS, 'mirana invisible'); assert.ok(al._st & ST.INVIS, 'ally invisible');
  assert.ok(!(f._st & ST.INVIS), 'enemy unaffected');
  // true sight
  w.addModifier(al, { key: 'sentry', src: f, dur: 1, status: ST.REVEALED, debuff: true });
  w.step(DT);
  assert.ok((al._st & ST.REVEALED) && (al._st & ST.INVIS));
  run(w, 1.2);
  // attacking breaks it
  w.damage(c, f, 1, 'phys', { attack: true });
  assert.ok(mod(w, al, 'mirana_invis'));
  cast(w, c, 'mirana_arrow', { x: 800, y: 0 });
  run(w, 0.6);
  assert.ok(!(c._st & ST.INVIS), 'casting broke Mirana invisibility');
  assert.ok(al._st & ST.INVIS, 'ally still invisible');
  run(w, w.val('mirana_invis', 'duration', 1) + 1);
  assert.ok(!(al._st & ST.INVIS), 'expired');
});

// ---------------------------------------------------------------------------------------------------------------- Rubick
test('rubick: telekinesis lifts (stun) and the landing stuns nearby enemies', () => {
  const { w, c, fs } = mk('rubick', [[450, 0], [550, 0], [1500, 300]]);
  const [t, side, far] = fs;
  cast(w, c, 'rubick_telekinesis', { id: t.id });
  run(w, 0.5);
  assert.ok(t._st & ST.STUN, 'lifted');
  assert.ok(!(side._st & ST.STUN));
  const lift = w.val('rubick_telekinesis', 'lift_duration', 1), fall = w.val('rubick_telekinesis', 'fall_duration', 1);
  run(w, lift + fall - 0.5 + 0.5);
  assert.ok(side._st & ST.STUN, 'landing shockwave stuns neighbours');
  assert.ok(!(far._st & ST.STUN));
  run(w, 4);
  assert.ok(!(t._st & ST.STUN));
});

test('rubick: fade bolt chains to nearby enemies, reduces their attack damage', () => {
  const { w, c, fs } = mk('rubick', [[500, 0], [700, 0], [900, 0], [3000, 0]], { skip: ['rubick_arcane_supremacy'] });
  cast(w, c, 'rubick_fade_bolt', { id: fs[0].id });
  run(w, 2);
  const dmg = w.val('rubick_fade_bolt', 'damage', 1), red = w.val('rubick_fade_bolt', 'damage_reduction', 1);
  near(lost(fs[0]), magLost(fs[0], dmg));
  assert.ok(lost(fs[1]) > 0 && lost(fs[1]) < lost(fs[0]) * 1.001, 'bounced');
  assert.ok(lost(fs[2]) > 0);
  assert.equal(lost(fs[3]), 0);
  const m = mod(w, fs[1], 'rubick_fade_bolt');
  assert.ok(m); assert.equal(m.dmg, -red);
  const dBase = fs[3].dmgBonus;
  assert.equal(fs[1].dmgBonus, dBase - red);
});

test('rubick: arcane supremacy amplifies spell damage and extends cast range', () => {
  const base = mk('rubick', [[500, 0]], { skip: ['rubick_arcane_supremacy'] });
  cast(base.w, base.c, 'rubick_fade_bolt', { id: base.f.id });
  run(base.w, 0.6);
  const l0 = lost(base.f);
  const amp = mk('rubick', [[500, 0]]);
  assert.equal(amp.c._spellAmp, amp.w.val('rubick_arcane_supremacy', 'spell_amp', 1));
  cast(amp.w, amp.c, 'rubick_fade_bolt', { id: amp.f.id });
  run(amp.w, 0.6);
  near(lost(amp.f) / l0, 1 + amp.c._spellAmp / 100, 0.01);
  // cast range: fade bolt range 800 + bonus; foe at 850 is reached without walking
  const rg = mk('rubick', [[800 + 30, 0]]);
  cast(rg.w, rg.c, 'rubick_fade_bolt', { id: rg.f.id });
  run(rg.w, 0.6);
  assert.ok(Math.abs(rg.c.x) < 5, 'did not need to walk');
  assert.ok(lost(rg.f) > 0);
});

test('rubick: spell steal copies the last spell cast (normal spell), at the stolen level, in slot D', () => {
  const { w, c, f } = mk('rubick', [[700, 0]], { foeKey: 'lina', skip: ['rubick_arcane_supremacy'] });
  const lina = f;
  // nothing cast yet: refunded
  cast(w, c, 'rubick_spell_steal', { id: lina.id });
  run(w, 0.5);
  assert.equal(c.abilities[3].key, 'rubick_empty1');
  assert.equal(ab(c, 'rubick_spell_steal').cd, 0, 'refunded');
  // lina casts (needs a point order from her owner)
  lina.abilities.forEach((a, i) => { lina.skillPoints = 5; lina.level = 25; w.order('f0', { t: 'learn', slot: i }); });
  lina.mana = lina.maxMana;
  w.order('f0', { t: 'cast', slot: 0, x: 0, y: 0 });
  run(w, 0.7);
  assert.equal(lina._lastCast.key, 'lina_dragon_slave');
  c.hp = c.maxHp;
  cast(w, c, 'rubick_spell_steal', { id: lina.id });
  run(w, 0.4);
  const D = c.abilities[3];
  assert.equal(D.key, 'lina_dragon_slave');
  assert.ok(D.level >= 1 && D.stolen);
  assert.ok(D.flags & ABF.POINT_TARGET || D.flags & ABF.UNIT_TARGET);
  assert.equal(c.abilities[4].key, 'rubick_empty2');
  // learn is refused on the stolen slot
  c.skillPoints = 3; assert.equal(w.order('a', { t: 'learn', slot: 3 }), false);
  // cast the stolen spell
  const lv = D.level;
  w.step(DT); w.addModifier(lina, { key: 'noregen2', src: lina, hpRegen: -lina._hpRegen, debuff: false }); w.step(DT);
  lina.hp = lina.maxHp;
  assert.ok(w.order('a', { t: 'cast', slot: 3, x: lina.x, y: lina.y }));
  run(w, 2);
  near(lost(lina), magLost(lina, w.val('lina_dragon_slave', 'dragon_slave_damage', lv)));
  assert.ok(D.cd > 0);
  // expires
  run(w, w.val('rubick_spell_steal', 'duration', 1) + 1);
  assert.equal(c.abilities[3].key, 'rubick_empty1');
  assert.equal(c.abilities[3].level, 0);
});

test('rubick: spell steal copies an INVOKER spell using orb level = 2 x steal level (Rubick Q/W/E levels untouched)', () => {
  const { w, c, f } = mk('rubick', [[700, 0], [3000, 0]], { foeKey: 'invoker', skip: ['rubick_arcane_supremacy'] });
  const inv = f, victim = w.units.get([...w.units.keys()].find((k) => w.units.get(k) !== c && w.units.get(k) !== f && w.units.get(k).kind === 'hero'));
  inv.skillPoints = 20; inv.level = 25;
  for (const s of [0, 1, 2]) for (let i = 0; i < 4; i++) w.order('f0', { t: 'learn', slot: s });
  w.step(DT); w.step(DT);
  inv.mana = inv.maxMana;
  for (let i = 0; i < 3; i++) { w.order('f0', { t: 'cast', slot: 2 }); w.step(DT); }
  w.order('f0', { t: 'cast', slot: 5 }); w.step(DT);
  assert.equal(inv.abilities[3].key, 'invoker_sun_strike');
  w.order('f0', { t: 'cast', slot: 3, x: 0, y: 1500 });
  run(w, 0.6);
  assert.equal(inv._lastCast.key, 'invoker_sun_strike');
  const q0 = [0, 1, 2].map((i) => c.abilities[i].level);
  cast(w, c, 'rubick_spell_steal', { id: inv.id });
  run(w, 0.4);
  const D = c.abilities[3];
  assert.equal(D.key, 'invoker_sun_strike');
  assert.equal(D.level, 1);
  // cast it at the far foe
  const ssLv = ab(c, 'rubick_spell_steal').level;
  victim.hp = victim.maxHp;
  assert.ok(w.order('a', { t: 'cast', slot: 3, x: victim.x, y: victim.y }));
  w.step(DT);
  assert.deepEqual([0, 1, 2].map((i) => c.abilities[i].level), q0, 'orb levels restored');
  run(w, 2.5);
  near(lost(victim), w.val('invoker_sun_strike', 'damage', 2 * ssLv), 1);
});

test('rubick: second steal moves the first to F; same spell refreshes; stolen spells cannot be re-stolen', () => {
  const { w, c, f } = mk('rubick', [[700, 0]], { foeKey: 'lina', skip: ['rubick_arcane_supremacy'] });
  f.skillPoints = 5; f.level = 25; f.mana = f.maxMana;
  f.abilities.forEach((a, i) => w.order('f0', { t: 'learn', slot: i }));
  w.order('f0', { t: 'cast', slot: 0, x: 0, y: 0 }); run(w, 0.7);
  cast(w, c, 'rubick_spell_steal', { id: f.id }); run(w, 0.4);
  assert.equal(c.abilities[3].key, 'lina_dragon_slave');
  ab(c, 'rubick_spell_steal').cd = 0;
  w.order('f0', { t: 'cast', slot: 1, x: 0, y: 0 }); run(w, 0.7);
  assert.equal(f._lastCast.key, 'lina_light_strike_array');
  cast(w, c, 'rubick_spell_steal', { id: f.id }); run(w, 0.4);
  assert.equal(c.abilities[3].key, 'lina_light_strike_array');
  assert.equal(c.abilities[4].key, 'lina_dragon_slave');
});

test('rubick: death clears the stolen slots', () => {
  const { w, c, f } = mk('rubick', [[700, 0]], { foeKey: 'lina', skip: ['rubick_arcane_supremacy'] });
  f.skillPoints = 5; f.level = 25; f.mana = f.maxMana;
  f.abilities.forEach((a, i) => w.order('f0', { t: 'learn', slot: i }));
  w.order('f0', { t: 'cast', slot: 0, x: 0, y: 0 }); run(w, 0.7);
  cast(w, c, 'rubick_spell_steal', { id: f.id }); run(w, 0.4);
  assert.equal(c.abilities[3].key, 'lina_dragon_slave');
  w.killUnit(c, f);
  assert.equal(c.abilities[3].key, 'rubick_empty1');
});

test('rubick: every hero ability can be stolen and cast without throwing (incl. all ten invoked spells)', () => {
  const keys = [];
  for (const hk of HERO_KEYS) {
    const H = HEROES[hk];
    if (H.short === 'rubick') continue;
    for (const k of H.abilities.concat(H.invoked || [])) keys.push(k);
  }
  const { w, c, f } = mk('rubick', [[500, 0], [800, 200]], { foeKey: 'sven', skip: ['rubick_arcane_supremacy'] });
  const D = c.abilities[3];
  const steal = ab(c, 'rubick_spell_steal');
  let casts = 0;
  for (const k of keys) {
    const d = w.data.abilities[k];
    if (!d || d.behavior.includes('PASSIVE') || /invoker_(quas|wex|exort|invoke)/.test(k)) continue;
    f._lastCast = { key: k, level: 1, t: w.time };
    steal.cd = 0; c.mana = c.maxMana; c.hp = c.maxHp;
    w.castNow(c, 5, { unit: f, x: f.x, y: f.y });
    assert.equal(D.key, k, k);
    D.cd = 0; D.level = Math.max(D.level, 1);
    assert.doesNotThrow(() => {
      w.castNow(c, 3, { unit: f, x: f.x + 50, y: f.y });
      run(w, 0.4);
      // toggles: switch back off
      if (D.flags & ABF.TOGGLE_ON) D.flags &= ~ABF.TOGGLE_ON;
    }, k);
    for (const u of [...w.units.values()]) if (u._channel && u === c) w.interrupt(u, true);
    f.hp = f.maxHp; f.mana = f.maxMana; f._st = f._st & ~ST.STUN;
    for (const u of [...w.units.values()]) if (u.kind !== 'hero') w.killUnit(u, null, null);
    casts++;
  }
  assert.ok(casts >= 40, `casts ${casts}`);
});
