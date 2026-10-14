// Temporary vision sources (sim/vision.js) granted by abilities: node --test server/test/vision.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { syncVision } from '../src/room/MatchRoom.js';
import { MatchState } from '../src/room/schema.js';
import { TEAM } from '../../shared/protocol.js';

const DT = 1 / 30;
const run = (w, sec) => { for (let i = 0, n = Math.round(sec / DT); i < n; i++) w.step(DT); };
const put = (w, u, x, y) => { w.teleport(u, x, y); w.index.insert(u); };
const R = TEAM.RADIANT, D = TEAM.DIRE;
const sees = (w, team, x, y) => w.teamSees(team, x, y);

/** Caster 'a' (RADIANT) at (0,0), an enemy 'b' (DIRE) parked far away so it never sees the test spots. */
function mk(short) {
  const w = new World({ seed: 5, pregame: 0, buildings: false });
  const c = w.addHero({ pid: 'a', team: R, heroKey: 'npc_dota_hero_' + short });
  const e = w.addHero({ pid: 'b', team: D, heroKey: 'npc_dota_hero_sven' });
  c.level = 25; c.skillPoints = 40;
  put(w, c, 0, 0); put(w, e, 0, 6000);
  w.addModifier(c, { key: 'pool', src: c, mana: 5000, debuff: false });
  w.addModifier(e, { key: 'tank', src: e, hp: 99000, debuff: false }); e._noAttack = true; c._noAttack = true;
  w.step(DT);
  c.hp = c.maxHp; c.mana = c.maxMana; e.hp = e.maxHp;
  c.abilities.forEach((ab, i) => { w.order('a', { t: 'learn', slot: i }); });
  w.step(DT);
  return { w, c, e };
}
/** Order the cast and step until the cast point passed (the ability is on cooldown). */
const cast = (w, slot, o) => {
  const hero = [...w.units.values()].find((u) => u.owner === 'a' && u.kind === 'hero');
  assert.ok(w.order('a', { t: 'cast', slot, ...o }), 'order accepted');
  for (let i = 0; i < 90 && hero.abilities[slot].cd <= 0; i++) w.step(DT);
  assert.ok(hero.abilities[slot].cd > 0, 'cast went off');
};
const slotOf = (c, key) => c.abilities.findIndex((a) => a.key === key);

test('Sun Strike: target area visible during the 1.7 s delay and 4 s after, then fogged again', () => {
  const w = new World({ seed: 7, pregame: 0, buildings: false });
  const inv = w.addHero({ pid: 'a', team: R, heroKey: 'npc_dota_hero_invoker' });
  const foe = w.addHero({ pid: 'b', team: D, heroKey: 'npc_dota_hero_sven' });
  put(w, inv, 0, 0); put(w, foe, 0, 6000);
  [4, 4, 4].forEach((l, i) => { inv.abilities[i].level = l; });
  inv._dirty = true; inv.mana = inv.maxMana = 5000;
  w.addModifier(foe, { key: 'tank', src: foe, hp: 99000, debuff: false }); foe._dirty = true;
  w.step(DT);
  for (const c of 'EEE') { assert.ok(w.order('a', { t: 'cast', slot: 'QWE'.indexOf(c) })); w.step(DT); }
  assert.ok(w.order('a', { t: 'cast', slot: 5 })); w.step(DT);
  assert.equal(inv.abilities[3].key, 'invoker_sun_strike');

  const X = 4000, Y = 0;
  const vr = w.val('invoker_sun_strike', 'vision_distance', 1), vd = w.val('invoker_sun_strike', 'vision_duration', 1), delay = w.val('invoker_sun_strike', 'delay', 1);
  assert.equal(vr, 400); assert.equal(vd, 4); assert.equal(delay, 1.7);   // baked values
  assert.equal(sees(w, R, X, Y), false, 'fogged before the cast');
  assert.equal(w.visionSources.size, 0);

  assert.ok(w.order('a', { t: 'cast', slot: 3, x: X, y: Y }));
  let t = 0;
  while (w.visionSources.size === 0 && t < 3) { w.step(DT); t += DT; }
  assert.equal(w.visionSources.size, 1, 'vision source created by the cast');
  const t0 = w.time;
  const src = [...w.visionSources.values()][0];
  assert.equal(src.team, R); assert.equal(src.r, vr);

  assert.equal(sees(w, R, X, Y), true, 'visible at cast');
  assert.equal(sees(w, R, X + vr - 5, Y), true, 'edge of the radius');
  assert.equal(sees(w, R, X + vr + 60, Y), false, 'outside the radius');
  assert.equal(sees(w, D, X, Y), false, 'enemy team gets nothing');
  while (w.time - t0 < delay - 0.2) w.step(DT);
  assert.equal(sees(w, R, X, Y), true, 'visible just before the strike');
  while (w.time - t0 < delay + 0.2) w.step(DT);
  assert.equal(sees(w, R, X, Y), true, 'visible just after the strike');
  while (w.time - t0 < delay + vd - 0.2) w.step(DT);
  assert.equal(sees(w, R, X, Y), true, 'still visible late in the linger');
  while (w.time - t0 < delay + vd + 0.3) w.step(DT);
  assert.equal(sees(w, R, X, Y), false, 'fogged again after the linger');
  assert.equal(w.visionSources.size, 0, 'source removed');
});

test('Crystal Nova: vision_duration (6 s) over the nova area, then gone', () => {
  const { w, c } = mk('crystal_maiden');
  const i = slotOf(c, 'crystal_maiden_crystal_nova'), dur = w.val('crystal_maiden_crystal_nova', 'vision_duration', 1);
  assert.equal(dur, 6);
  put(w, c, 2000, 0);
  cast(w, i, { x: 2300, y: 0 });
  const t0 = w.time;
  assert.equal(sees(w, R, 2300, 0), true);
  put(w, c, 0, 0);   // caster leaves (teleport): only the source keeps the spot visible
  run(w, dur - 1);
  assert.equal(sees(w, R, 2300, 0), true, 'still visible');
  while (w.time - t0 < dur + 0.1) w.step(DT);
  assert.equal(sees(w, R, 2300, 0), false, 'expired');
});

test('Sacred Arrow: vision rides the arrow and dies with it', () => {
  const { w, c } = mk('mirana');
  const i = slotOf(c, 'mirana_arrow');
  assert.equal(w.val('mirana_arrow', 'arrow_vision', 1), 400);
  cast(w, i, { x: 3000, y: 0 });
  const ar = w.projs.find((p) => p.k === 'mirana_arrow');
  assert.ok(ar);
  run(w, 1.0);
  const s = [...w.visionSources.values()][0];
  assert.ok(s && Math.abs(s.x - ar.x) < 40, 'source tracks the arrow');
  assert.equal(sees(w, R, ar.x + 1500, 0), false, 'ahead of the arrow stays dark');
  put(w, c, -3000, 0);
  assert.equal(sees(w, R, ar.x, 0), true, 'the arrow itself sees');
  run(w, 6);
  assert.equal(w.projs.find((p) => p.k === 'mirana_arrow'), undefined);
  assert.equal(w.visionSources.size, 0, 'removed after the arrow ended');
});

test('Meat Hook: vision follows the hook, lingers vision_duration (4 s) where it ended', () => {
  const { w, c } = mk('pudge');
  const i = slotOf(c, 'pudge_meat_hook');
  assert.equal(w.val('pudge_meat_hook', 'vision_radius', 1), 500);
  cast(w, i, { x: 1500, y: 0 });
  assert.equal(w.visionSources.size, 1);
  run(w, 2);   // hook range / speed is about 1 s: the outbound hook has ended
  assert.equal(w.visionSources.size, 1, 'lingering');
  const s = [...w.visionSources.values()][0];
  assert.ok(s.x > 500, 'lingers where the hook ended');
  put(w, c, -3000, 0);
  assert.equal(sees(w, R, s.x, s.y), true);
  run(w, 4);
  assert.equal(w.visionSources.size, 0);
});

test('Storm Bolt: vision rides the bolt, none once it landed', () => {
  const { w, c, e } = mk('sven');
  put(w, e, 900, 0);
  const i = slotOf(c, 'sven_storm_bolt');
  cast(w, i, { id: e.id });
  assert.equal(w.visionSources.size, 1);
  run(w, 2);
  assert.equal(w.visionSources.size, 0);
});

test('Lightning Bolt / Thundergod\'s Wrath: sight_duration vision on the struck spot', () => {
  const { w, c, e } = mk('zuus');
  const lb = slotOf(c, 'zuus_lightning_bolt');
  const sight = w.val('zuus_lightning_bolt', 'sight_duration', 1);
  cast(w, lb, { x: 700, y: 0 });
  put(w, c, -3000, 0);
  assert.equal(sees(w, R, 700, 0), true);
  run(w, sight + 0.3);
  assert.equal(sees(w, R, 700, 0), false);
  // Wrath strikes every enemy hero: its spot stays visible for sight_duration
  const tw = slotOf(c, 'zuus_thundergods_wrath');
  put(w, c, 0, 0);
  cast(w, tw, {});
  put(w, c, -3000, 0);
  assert.equal(sees(w, R, e.x, e.y), true);
  run(w, w.val('zuus_thundergods_wrath', 'sight_duration', 1) + 0.3);
  assert.equal(sees(w, R, e.x, e.y), false);
});

test('Shrapnel: zone visible for delay + duration', () => {
  const { w, c } = mk('sniper');
  const i = slotOf(c, 'sniper_shrapnel');
  const dur = w.val('sniper_shrapnel', 'duration', 1) + w.val('sniper_shrapnel', 'damage_delay', 1);
  cast(w, i, { x: 1500, y: 0 });
  const t0 = w.time;
  put(w, c, -3000, 0);
  assert.equal(sees(w, R, 1500, 0), true);
  while (w.time - t0 < dur + 0.1) w.step(DT);
  assert.equal(sees(w, R, 1500, 0), false);
});

test('room mirrors vision sources into state.vision and clears them on expiry', () => {
  const st = new MatchState();
  const w = new World({ seed: 1, pregame: 0, buildings: false });
  const h = w.addHero({ pid: 'a', team: R, heroKey: 'npc_dota_hero_sven' });
  w.addVision({ owner: h, x: 1234.6, y: -500, r: 400, dur: 1 });
  syncVision(st, w);
  assert.equal(st.vision.size, 1);
  const sv = [...st.vision.values()][0];
  assert.equal(sv.team, R); assert.equal(sv.r, 400); assert.equal(sv.y, -500);
  run(w, 1.2);
  syncVision(st, w);
  assert.equal(st.vision.size, 0);
});
