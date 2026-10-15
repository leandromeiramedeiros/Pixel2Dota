// Invoker abilities: node --test "server/test/abilities_invoker.test.js"
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { TEAM, ST, EV } from '../../shared/protocol.js';

const DT = 1 / 30;
const run = (w, sec) => { for (let i = 0, n = Math.round(sec / DT); i < n; i++) w.step(DT); };
const put = (w, u, x, y) => { w.teleport(u, x, y); w.index.insert(u); };
const near = (a, b, eps = 0.1) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

// orbs: [q,w,e] levels
function mk(orbs = [4, 4, 4], seed = 7) {
  const w = new World({ seed, pregame: 0, buildings: false });
  const inv = w.addHero({ pid: 'a', team: TEAM.RADIANT, heroKey: 'npc_dota_hero_invoker' });
  const foe = w.addHero({ pid: 'b', team: TEAM.DIRE, heroKey: 'npc_dota_hero_sven' });
  put(w, inv, 0, 0); put(w, foe, 500, 0);
  orbs.forEach((l, i) => { inv.abilities[i].level = l; });
  inv._dirty = true;
  w.addModifier(foe, { key: 'tank', src: foe, hp: 99000, mana: 2000, debuff: false }); foe._dirty = true;
  w.step(DT); // lets the orb ticks grant Invoke
  foe.hp = foe.maxHp; foe.mana = foe.maxMana;
  inv.mana = inv.maxMana = 5000;
  return { w, inv, foe };
}
const orb = (w, inv, s) => { for (const c of s) { assert.ok(w.order('a', { t: 'cast', slot: 'QWE'.indexOf(c) })); w.step(DT); } };
const invoke = (w) => { assert.ok(w.order('a', { t: 'cast', slot: 5 })); w.step(DT); };
const make = (w, inv, orbs) => { orb(w, inv, orbs); invoke(w); };
const slotD = (inv) => inv.abilities[3], slotF = (inv) => inv.abilities[4];
const cast = (w, o) => { assert.ok(w.order('a', { t: 'cast', ...o })); const ab = w.units.get(w.players.get('a').hero) || null; for (let i = 0; i < 30; i++) { w.step(DT); const h = [...w.units.values()].find((u) => u.owner === 'a' && u.kind === 'hero'); if (h.abilities[o.slot].cd > 0) break; } };

test('orbs: keep last three, cast does not cancel movement', () => {
  const { w, inv } = mk();
  assert.ok(w.order('a', { t: 'move', x: 2000, y: 0 }));
  orb(w, inv, 'QWEQ');
  assert.equal(inv.orbs, 'WEQ');
  const x0 = inv.x; run(w, 0.5); assert.ok(inv.x > x0 + 50, 'still moving');
  assert.equal(inv.abilities[5].level, 1);
});

test('orb passives scale with instance count and level', () => {
  const { w, inv } = mk([1, 3, 2]);
  const ms0 = inv.ms, regen0 = inv._hpRegen, as0 = inv.atkRate, dmg0 = inv.dmgBonus;
  orb(w, inv, 'EEE'); w.step(DT);
  near(inv.dmgBonus - dmg0, 3 * w.val('invoker_exort', 'bonus_damage_per_instance', 2), 1e-6);
  orb(w, inv, 'WWW'); w.step(DT);
  assert.ok(inv.ms > ms0);
  assert.ok(inv.atkRate > as0);
  orb(w, inv, 'QQQ'); w.step(DT);
  near(inv._hpRegen - regen0, 3 * w.val('invoker_quas', 'hp_regen_per_instance', 1), 1e-6);
});

test('invoke needs three orbs; empty slots stay empty and cast is rejected or no-op', () => {
  const { w, inv } = mk();
  orb(w, inv, 'QQ'); invoke(w);
  assert.equal(slotD(inv).key, 'invoker_empty1');
  w.order('a', { t: 'cast', slot: 3 }); w.step(DT);
  w.order('a', { t: 'cast', slot: 4 }); w.step(DT);
  assert.equal(inv.orbs, 'QQ');
  assert.equal(slotD(inv).level, 0);
});

test('all ten recipes map to the right spell (any orb order)', () => {
  const R = { QQQ: 'cold_snap', QQW: 'ghost_walk', QQE: 'ice_wall', WWW: 'emp', WWQ: 'tornado', WWE: 'alacrity', EEE: 'sun_strike', EEQ: 'forge_spirit', EEW: 'chaos_meteor', QWE: 'deafening_blast' };
  const { w, inv } = mk();
  for (const [c, k] of Object.entries(R)) {
    inv.abilities[5].cd = 0;
    orb(w, inv, c.split('').reverse().join(''));
    invoke(w);
    assert.equal(slotD(inv).key, 'invoker_' + k, c);
    assert.equal(slotD(inv).level, 1);
  }
});

test('slot rules: new -> D, old -> F, re-invoke swaps without invoke cooldown, third drops oldest', () => {
  const { w, inv } = mk();
  make(w, inv, 'QQQ');
  assert.equal(slotD(inv).key, 'invoker_cold_snap');
  assert.ok(inv.abilities[5].cd > 0);
  assert.ok(w.drainEvents().some((e) => e.e === EV.INVOKE && e.k === 'invoker_cold_snap'));
  inv.abilities[5].cd = 0;
  make(w, inv, 'WWW');
  assert.equal(slotD(inv).key, 'invoker_emp'); assert.equal(slotF(inv).key, 'invoker_cold_snap');
  inv.abilities[5].cd = 0;
  make(w, inv, 'QQQ'); // swap, free
  assert.equal(slotD(inv).key, 'invoker_cold_snap'); assert.equal(slotF(inv).key, 'invoker_emp');
  assert.equal(inv.abilities[5].cd, 0, 'swap does not start invoke cooldown');
  make(w, inv, 'QQQ'); // already in D: no-op
  assert.equal(inv.abilities[5].cd, 0);
  make(w, inv, 'EEE');
  assert.equal(slotD(inv).key, 'invoker_sun_strike'); assert.equal(slotF(inv).key, 'invoker_cold_snap');
  assert.ok(inv.abilities[5].cd > 0);
  make(w, inv, 'WWW'); // invoke on cooldown but WWW is not slotted any more: refused
  assert.equal(slotD(inv).key, 'invoker_sun_strike');
});

test('invoke cooldown shrinks with orb levels', () => {
  const a = mk([1, 1, 1]), b = mk([7, 7, 7]);
  assert.ok(a.inv.abilities[5].cdMax > b.inv.abilities[5].cdMax);
  assert.ok(a.inv.abilities[5].cdMax <= 7);
});

test('per-spell cooldown persists across slot changes', () => {
  const { w, inv, foe } = mk();
  make(w, inv, 'QQQ');
  const snap = slotD(inv);
  cast(w, { slot: 3, id: foe.id });
  const cdMax = snap.cdMax;
  assert.ok(snap.cd > cdMax - 0.2, 'cold snap on cooldown');
  inv.abilities[5].cd = 0; make(w, inv, 'WWW');
  inv.abilities[5].cd = 0; make(w, inv, 'EEE');   // cold snap now unslotted
  assert.equal(inv._inv.slots.includes('invoker_cold_snap'), false);
  run(w, 3);
  inv.abilities[5].cd = 0; make(w, inv, 'QQQ');   // back
  assert.equal(slotD(inv).key, 'invoker_cold_snap');
  assert.ok(slotD(inv).cd > 0, 'still cooling');
  near(slotD(inv).cd, cdMax - 3.8, 1.0);
});

test('cold snap: freezes and re-freezes on damage', () => {
  const { w, inv, foe } = mk([8, 1, 1]);
  make(w, inv, 'QQQ');
  const m = inv.mana;
  cast(w, { slot: 3, id: foe.id });
  assert.ok(inv.mana < m, 'mana paid');
  assert.ok(foe.hp < foe.maxHp, 'initial damage');
  assert.ok(foe._st & ST.STUN, 'stunned');
  run(w, 0.6);
  assert.ok(!(foe._st & ST.STUN));
  const hp2 = foe.hp;
  w.damage(inv, foe, 50, 'pure');
  run(w, 0.1);
  assert.ok(foe._st & ST.STUN, 're-stunned by damage');
  assert.ok(foe.hp < hp2 - 50, 'freeze damage on top');
});

test('ghost walk: invisible, slows nearby enemy, breaks on attack', () => {
  const { w, inv, foe } = mk([8, 8, 1]);
  make(w, inv, 'QQW');
  put(w, foe, 200, 0);
  const base = foe.ms;
  cast(w, { slot: 3 });
  w.step(DT);
  assert.ok(inv._st & ST.INVIS);
  run(w, 1);
  assert.ok(foe.ms < base, 'enemy slowed');
  assert.ok(w.getModifier(inv, 'invoker_ghost_walk'));
  w.order('a', { t: 'attack', id: foe.id });
  run(w, 2);
  assert.ok(!w.getModifier(inv, 'invoker_ghost_walk'), 'broken by attack');
});

test('ice wall: damages and slows units standing in it, then expires', () => {
  const { w, inv, foe } = mk([8, 1, 8]);
  make(w, inv, 'QQE');
  inv.facing = 0;
  put(w, foe, 200, 100);
  const hp = foe.hp;
  cast(w, { slot: 3 });
  run(w, 2);
  assert.ok(foe.hp < hp, 'damaged');
  assert.ok(w.getModifier(foe, 'invoker_ice_wall_slow'), 'slowed');
  run(w, 20);
  run(w, 3);
  assert.ok(!w.getModifier(foe, 'invoker_ice_wall_slow'), 'wall expired');
});

test('emp: burns mana and deals 60% of it after delay, refunds mana', () => {
  const { w, inv, foe } = mk([1, 4, 1]);
  make(w, inv, 'WWW');
  put(w, foe, 600, 0);
  const burn = w.val('invoker_emp', 'mana_burned', 4);
  cast(w, { slot: 3, x: 600, y: 0 });
  const mAfter = inv.mana, mana0 = foe.mana, hp0 = foe.hp;
  run(w, 2.0);
  assert.equal(foe.mana, mana0, 'not yet');
  run(w, 1.2);
  near(foe.mana, mana0 - burn, 5);
  assert.ok(hp0 - foe.hp > burn * 0.6 * 0.5, 'damage dealt');
  assert.ok(inv.mana > mAfter + 1, 'mana restored');
});

test('tornado: lifts (invulnerable stun) then damages', () => {
  const { w, inv, foe } = mk([4, 4, 1]);
  make(w, inv, 'WWQ');
  const hp0 = foe.hp;
  cast(w, { slot: 3, x: 1500, y: 0 });
  let lifted = false, ev = null;
  for (let i = 0; i < 90 && !lifted; i++) { w.step(DT); lifted = !!w.getModifier(foe, 'invoker_tornado_lift'); ev ??= w._ev.find((e) => e.e === EV.SPELL && e.k === 'invoker_tornado' && e.sub === 'lift'); }
  assert.ok(lifted, 'lifted');
  assert.ok(ev && ev.t === foe.id && ev.dur === w.val('invoker_tornado', 'lift_duration', 4), 'lift event for the caught unit (client cyclone)');
  w.step(DT);
  assert.ok((foe._st & ST.STUN) && (foe._st & ST.INVULN));
  assert.equal(foe.hp, hp0);
  run(w, w.val('invoker_tornado', 'lift_duration', 4) + 0.3);
  assert.ok(foe.hp < hp0, 'landing damage');
  assert.ok(!(foe._st & ST.INVULN));
  assert.ok(!(foe._st & ST.STUN));
});

test('alacrity: attack speed and damage on an ally, expires', () => {
  const { w, inv } = mk([1, 5, 5]);
  make(w, inv, 'WWE');
  const d0 = inv.dmgBonus, a0 = inv.atkRate;
  cast(w, { slot: 3, id: inv.id });
  w.step(DT);
  near(inv.dmgBonus - d0, w.val('invoker_alacrity', 'bonus_damage', 5), 1e-6);
  assert.ok(inv.atkRate > a0);
  run(w, 10);
  near(inv.dmgBonus - d0, 0, 1e-6);
});

test('sun strike: global point, delay, pure damage', () => {
  const { w, inv, foe } = mk([1, 1, 6]);
  make(w, inv, 'EEE');
  put(w, foe, 4000, 0);
  const hp0 = foe.hp;
  cast(w, { slot: 3, x: 4000, y: 0 });
  run(w, 1.0); assert.equal(foe.hp, hp0);
  run(w, 1.0);
  near(hp0 - foe.hp, w.val('invoker_sun_strike', 'damage', 6), 1);
});

test('sun strike splits damage among heroes', () => {
  const { w, inv, foe } = mk([1, 1, 6]);
  const f2 = w.addHero({ pid: 'c', team: TEAM.DIRE, heroKey: 'npc_dota_hero_sven' });
  put(w, foe, 3000, 0); put(w, f2, 3050, 0); w.addModifier(f2, { key: 'tank', src: f2, hp: 99000, debuff: false }); f2._dirty = true; w.step(DT); f2.hp = f2.maxHp;
  make(w, inv, 'EEE');
  const h1 = foe.hp, h2 = f2.hp;
  cast(w, { slot: 3, x: 3020, y: 0 });
  run(w, 2);
  const dmg = w.val('invoker_sun_strike', 'damage', 6);
  near(h1 - foe.hp, dmg / 2, 1); near(h2 - f2.hp, dmg / 2, 1);
});

test('forge spirit: summons, melt armor, recast replaces, expire', () => {
  const { w, inv, foe } = mk([8, 1, 8]);
  make(w, inv, 'EEQ');
  const spirits = () => [...w.units.values()].filter((u) => u.key === 'invoker_forged_spirit' && !u._dead);
  cast(w, { slot: 3 });
  assert.equal(spirits().length, 3);
  w.step(DT);
  assert.equal(spirits()[0].ms, 320, 'spirit move speed = npc_dota_invoker_forged_spirit MovementSpeed');
  put(w, foe, 150, 0);
  const a0 = foe.armor;
  run(w, 5);
  assert.ok(foe.hp < foe.maxHp, 'spirits attacked');
  assert.ok(foe.armor < a0, 'melted');
  slotD(inv).cd = 0; inv.mana = inv.maxMana;
  cast(w, { slot: 3 });
  assert.equal(spirits().length, 3, 'old ones replaced');
  run(w, w.val('invoker_forge_spirit', 'spirit_duration', 8) + 1);
  assert.equal(spirits().length, 0);
});

test('chaos meteor: lands after delay, damages and burns', () => {
  const { w, inv, foe } = mk([1, 4, 6]);
  make(w, inv, 'EEW');
  put(w, foe, 600, 0);
  const hp0 = foe.hp;
  cast(w, { slot: 3, x: 600, y: 0 });
  run(w, 1.0); assert.equal(foe.hp, hp0, 'not landed');
  run(w, 3.0);
  assert.ok(hp0 - foe.hp >= w.val('invoker_chaos_meteor', 'main_damage', 6) * 0.5);
});

test('deafening blast: damage, knockback, disarm', () => {
  const { w, inv, foe } = mk([4, 4, 4]);
  make(w, inv, 'QWE');
  put(w, foe, 300, 0);
  const hp0 = foe.hp, x0 = foe.x;
  cast(w, { slot: 3, x: 1000, y: 0 });
  run(w, 0.8);
  assert.ok(foe.hp < hp0, 'damaged');
  assert.ok(foe._st & ST.DISARM, 'disarmed');
  assert.ok(foe.x > x0, 'knocked back');
  run(w, 8);
  assert.ok(!(foe._st & ST.DISARM));
});

test('deafening blast misses units outside the beam', () => {
  const { w, inv, foe } = mk([4, 4, 4]);
  make(w, inv, 'QWE');
  put(w, foe, 500, 600);
  const hp0 = foe.hp;
  cast(w, { slot: 3, x: 1000, y: 0 });
  run(w, 2);
  assert.equal(foe.hp, hp0);
});
