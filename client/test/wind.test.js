// Spell wind: gust derivation from ability data, the fixed gust array (cap / eviction / decay) and the displacement shapes. Pure, no WebGL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_GUSTS, KIND, REARM, createWind, spellGust, abilityStats, envelope, windAt, WIND_GLSL } from '../src/render/wind.js';
import { EV } from '../../shared/protocol.js';
import { DATA } from '../../shared/data.js';

const sp = (k, o = {}) => ({ e: EV.SPELL, k, s: 'a', lv: 3, ...o });
const SRC = { x: 0, y: 0 }, TGT = { x: 500, y: 100 };

test('spellGust: basic attacks, passives, items and sub-events never gust', () => {
  assert.equal(spellGust({ e: EV.ATK, k: 'lina', s: 'a', t: 'b' }, SRC, TGT), null);
  assert.equal(spellGust(sp('axe_counter_helix'), SRC, null), null, 'passive');
  assert.equal(spellGust(sp('item_black_king_bar'), SRC, null), null);
  assert.equal(spellGust(sp('zuus_arc_lightning', { sub: 'arc', x: 1, y: 1 }), SRC, TGT), null);
  assert.equal(spellGust(sp('not_a_spell'), SRC, TGT), null);
});

test('spellGust: unit / point targeted -> swirl at the impact point, sized by radius / range', () => {
  const g = spellGust(sp('axe_battle_hunger', { t: 'b', x: 500, y: 100 }), SRC, TGT);
  assert.equal(g.kind, KIND.SWIRL); assert.equal(g.x, 500); assert.equal(g.y, 100);
  const lsa = spellGust(sp('lina_light_strike_array', { x: 700, y: 0, x2: 700, y2: 0, r: 225 }), SRC, null);
  assert.equal(lsa.kind, KIND.SWIRL, 'aoe point spell with an x2 is not a line'); assert.equal(lsa.x, 700);
  const nova = spellGust(sp('crystal_maiden_crystal_nova', { x: 400, y: 0 }), SRC, null);
  assert.ok(nova.radius >= lsa.radius && nova.radius <= 620);
});

test('spellGust: vector spells -> a line from the caster to (x2,y2), half length = half the distance', () => {
  const g = spellGust(sp('lina_dragon_slave', { x: 900, y: 0, x2: 1000, y2: 0, r: 137 }), SRC, null);
  assert.equal(g.kind, KIND.LINE); assert.equal(g.dx, 1); assert.equal(g.dy, 0); assert.equal(g.len, 500); assert.equal(g.x, 500);
  const db = spellGust(sp('invoker_deafening_blast', { x2: 0, y2: -1000, r: 200 }), SRC, null);
  assert.equal(db.kind, KIND.LINE); assert.equal(db.dy, -1);
  assert.equal(spellGust(sp('mirana_arrow', { x2: 1500, y2: 0, r: 57 }), SRC, null).kind, KIND.LINE);
});

test('spellGust: big area / self-centred spells -> radial burst, bigger than a swirl', () => {
  const ff = spellGust(sp('crystal_maiden_freezing_field'), SRC, null);
  assert.equal(ff.kind, KIND.BURST); assert.equal(ff.x, 0); assert.ok(ff.radius >= 900);
  const cm = spellGust(sp('invoker_chaos_meteor', { x: 600, y: 0, x2: 1500, y2: 0 }), SRC, null);
  assert.equal(cm.kind, KIND.BURST); assert.equal(cm.x, 600, 'burst at the landing point, not along the roll');
  const warcry = spellGust(sp('sven_warcry'), SRC, null);
  assert.equal(warcry.kind, KIND.BURST); assert.ok(warcry.strength < 0.35, 'no damage: light breeze');
  assert.ok(ff.radius > spellGust(sp('axe_battle_hunger', { t: 'b' }), SRC, TGT).radius);
});

test('spellGust: bigger damage -> stronger gust (ults a bit more); every ability yields sane numbers', () => {
  const mid = spellGust(sp('axe_battle_hunger', { t: 'b' }), SRC, TGT);
  const big = spellGust(sp('lion_finger_of_death', { t: 'b' }), SRC, TGT);
  const laguna = spellGust(sp('lina_laguna_blade', { t: 'b' }), SRC, TGT);
  const weak = spellGust(sp('drow_ranger_frost_arrows', { t: 'b' }), SRC, TGT);
  assert.ok(big.strength > mid.strength && laguna.strength > mid.strength && big.strength <= 1);
  assert.ok(weak == null || weak.strength < big.strength);
  let n = 0;
  for (const k of Object.keys(DATA.abilities)) {
    for (const ev of [sp(k, { t: 'b' }), sp(k, { x: 300, y: 0, x2: 900, y2: 100 }), sp(k)]) {
      const g = spellGust(ev, SRC, TGT);
      if (!g) continue;
      n++;
      assert.ok(g.strength > 0 && g.strength <= 1, k + ' strength ' + g.strength);
      assert.ok(g.life >= 1 && g.life <= 2.5, k + ' life ' + g.life);
      assert.ok(g.radius > 0 && Number.isFinite(g.x) && Number.isFinite(g.y) && Number.isFinite(g.dx), k);
    }
  }
  assert.ok(n > 60, 'most abilities produce a gust: ' + n);
});

test('abilityStats: damage ignores pct / delay / per-mana noise, dps counts for 2 s, vision radius is not an area', () => {
  assert.equal(abilityStats('invoker_emp', 1).damage, 0);
  assert.ok(abilityStats('crystal_maiden_frostbite', 1).damage >= 40);
  assert.equal(abilityStats('sven_storm_bolt', 4).radius, 310);
  assert.equal(abilityStats('sven_storm_bolt', 4).damage, 320);
  assert.equal(abilityStats('nope', 1), null);
});

test('envelope: rises fast, decays, exactly 0 outside [0, life]', () => {
  assert.equal(envelope(0, 2), 0); assert.equal(envelope(2, 2), 0); assert.equal(envelope(3, 2), 0);
  assert.ok(envelope(0.12, 2) > 0.7, 'near peak by ~0.12 s');
  assert.ok(envelope(1, 2) < envelope(0.2, 2) && envelope(1.8, 2) < envelope(1, 2));
  assert.ok(envelope(1.99, 2) < 0.02);
});

test('createWind: fixed array, rearm window, eviction of the weakest, decay to empty, gain 0 = off', () => {
  const w = createWind();
  const mk = (key, strength, src = 'a') => ({ x: 0, y: 0, dx: 1, dy: 0, len: 0, radius: 300, strength, kind: KIND.SWIRL, life: 2, key, src });
  assert.ok(w.spawn(mk('x', 0.5)));
  assert.equal(w.spawn(mk('x', 0.5)), null, 'duplicate cast inside REARM');
  assert.ok(w.spawn(mk('x', 0.5, 'b')), 'other caster');
  w.update(REARM + 0.01); assert.ok(w.spawn(mk('x', 0.5)), 'after the rearm window');
  for (let i = 0; i < 20; i++) w.spawn(mk('k' + i, 0.3 + (i % 5) * 0.1));
  assert.equal(w.gusts.length, MAX_GUSTS, 'never above the cap');
  const before = w.gusts.map((g) => g.strength).sort().join();
  assert.equal(w.spawn(mk('weak', 0.01)), null, 'weaker than everything: dropped');
  assert.equal(w.gusts.map((g) => g.strength).sort().join(), before);
  assert.ok(w.spawn(mk('strong', 1)) && w.gusts.some((g) => g.key === 'strong') && w.gusts.length === MAX_GUSTS);
  const A = new Float32Array(MAX_GUSTS * 4), B = new Float32Array(MAX_GUSTS * 4), C = new Float32Array(MAX_GUSTS * 4);
  w.update(0.2); assert.ok(w.pack(A, B, C) > 0);
  for (let t = 0; t < 4; t += 0.05) w.update(0.05);
  assert.equal(w.gusts.length, 0, 'everything decays within 2.5 s'); assert.equal(w.pack(A, B, C), 0);
  w.setGain(0); assert.equal(w.spawn(mk('z', 1)), null, 'wind off: nothing spawns');
  assert.equal(w.report(sp('lina_dragon_slave', { x2: 1000, y2: 0 }), () => SRC), null);
});

test('createWind.report: spell -> gust, attack -> none, fogged -> none', () => {
  const w = createWind(); const unit = (id) => (id === 'a' ? SRC : id === 'b' ? TGT : null);
  assert.ok(w.report(sp('axe_battle_hunger', { t: 'b' }), unit));
  assert.equal(w.report({ e: EV.ATK, s: 'a', t: 'b', k: 'lina' }, unit), null);
  assert.equal(w.report(sp('lion_impale', { x2: 900, y2: 0, r: 70 }), unit, undefined, () => false), null, 'fogged');
  assert.equal(w.gusts.length, 1);
});

const pack1 = (g, age) => {
  const w = createWind(); const r = w.spawn(g); r.age = age;
  const A = new Float32Array(32), B = new Float32Array(32), C = new Float32Array(32); const n = w.pack(A, B, C); return { A, B, C, n };
};
const base = { x: 0, y: 0, dx: 1, dy: 0, len: 0, radius: 400, strength: 1, life: 2, key: 'k', src: 's' };

test('displacement: swirl circles the centre (mostly tangential), calm far outside', () => {
  const { A, B, C, n } = pack1({ ...base, kind: KIND.SWIRL }, 0.4);
  assert.equal(n, 1);
  let tang = 0, rad = 0;
  for (let a = 0; a < 6.28; a += 0.5) { const px = Math.cos(a) * 150, pz = Math.sin(a) * 150; const [ox, oz] = windAt(A, B, C, n, px, pz); tang += Math.abs(-Math.sin(a) * ox + Math.cos(a) * oz); rad += Math.abs(Math.cos(a) * ox + Math.sin(a) * oz); }
  assert.ok(tang > rad * 1.2 && tang > 0, 'tangential ' + tang + ' vs radial ' + rad);
  assert.deepEqual(windAt(A, B, C, n, 900, 0), [0, 0]);
});

test('displacement: line pushes along dir (not outside / behind it); burst is a ring that travels outward', () => {
  const line = pack1({ ...base, kind: KIND.LINE, len: 500, radius: 300 }, 0.9);
  const [lx, lz] = windAt(line.A, line.B, line.C, 1, 0, 0);
  assert.ok(lx > 0.05 && Math.abs(lz) < lx, 'along +x: ' + lx + ',' + lz);
  const [ex] = windAt(line.A, line.B, line.C, 1, 0, 700); assert.ok(Math.abs(ex) < 0.01, 'outside the cone');
  const [bx] = windAt(line.A, line.B, line.C, 1, -900, 0); assert.ok(Math.abs(bx) < 0.01, 'behind');
  const early = pack1({ ...base, kind: KIND.BURST, radius: 600 }, 0.1), late = pack1({ ...base, kind: KIND.BURST, radius: 600 }, 0.45);
  const at = (p, r) => windAt(p.A, p.B, p.C, 1, r, 0)[0];
  assert.ok(at(early, 60) > 0 && at(early, 500) < at(early, 60) * 0.2, 'young ring is near the centre');
  assert.ok(at(late, 560) > at(early, 560), 'ring has travelled out');
  const [, oz] = windAt(late.A, late.B, late.C, 1, 0, 500); assert.ok(Math.abs(oz) > 0, 'radial in every direction');
});

test('GLSL: declares the uniforms the renderer fills, loops over MAX_GUSTS', () => {
  for (const n of ['uWind', 'uWN', 'uWA', 'uWB', 'uWC', 'gustAt']) assert.ok(WIND_GLSL.includes(n), n);
  assert.ok(WIND_GLSL.includes('[' + MAX_GUSTS + ']'));
});
