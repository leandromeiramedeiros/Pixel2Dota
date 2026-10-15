// Spell wind: gust derivation from ability data, the fixed gust array (cap / eviction / decay) and the displacement shapes. Pure, no WebGL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_GUSTS, KIND, REARM, createWind, spellGust, abilityStats, envelope, windAt, launchAt, WIND_GLSL } from '../src/render/wind.js';
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
      assert.ok(g.life >= 2.5 && g.life <= 6, k + ' life ' + g.life);
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

test('envelope: rises fast, holds a rocking lean, decays, exactly 0 outside [0, life]', () => {
  assert.equal(envelope(0, 2), 0); assert.equal(envelope(2, 2), 0); assert.equal(envelope(3, 2), 0);
  assert.ok(envelope(0.12, 2) > 0.7, 'near peak by ~0.12 s');
  assert.ok(envelope(1, 2) < envelope(0.2, 2) && envelope(1.8, 2) < envelope(1, 2));
  assert.ok(envelope(1.99, 2) < 0.02);
  const e = []; for (let a = 0.2; a < 4; a += 0.05) e.push(envelope(a, 6));
  assert.ok(e.every((v) => v > 0), 'never pushes the other way');
  assert.ok(envelope(3, 6) > 0.1, 'still leaning 3 s after a strong cast');
  assert.ok(e.some((v, i) => i > 0 && i < e.length - 1 && v > e[i - 1] && v > e[i + 1]), 'rocks (has a local peak after the first push)');
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

test('displacement: swirl spirals outward (tangential + away, never inward), calm far outside', () => {
  const { A, B, C, n } = pack1({ ...base, kind: KIND.SWIRL }, 0.4);
  assert.equal(n, 1);
  let tang = 0, rad = 0;
  for (let a = 0; a < 6.28; a += 0.5) { const px = Math.cos(a) * 150, pz = Math.sin(a) * 150; const [ox, oz] = windAt(A, B, C, n, px, pz); const t = -Math.sin(a) * ox + Math.cos(a) * oz, q = Math.cos(a) * ox + Math.sin(a) * oz; assert.ok(t > 0 && q > 0, 'same spin, outward'); tang += t; rad += q; }
  assert.ok(tang > rad * 0.6 && rad > tang * 0.6, 'spiral ' + tang + ' vs ' + rad);
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
  const held = pack1({ ...base, kind: KIND.BURST, radius: 600, life: 6 }, 2);
  assert.ok(windAt(held.A, held.B, held.C, 1, 250, 0)[0] > 0.35 * held.A[3] && held.A[3] > 0.1, 'still leaning away long after the ring passed');
});

test('GLSL: declares the uniforms the renderer fills, loops over MAX_GUSTS', () => {
  for (const n of ['uWind', 'uWN', 'uWA', 'uWB', 'uWC', 'gustAt']) assert.ok(WIND_GLSL.includes(n), n);
  assert.ok(WIND_GLSL.includes('[' + MAX_GUSTS + ']'));
});

// ---------------------------------------------------------------------------------------------------------------------------------
// pull gusts: the wind pulls the plants the way the spell pulls the units
const pk = (ev, src, tgt) => spellGust(ev, src, tgt);
const rad = (p, r, ang, n = 1) => { const px = Math.cos(ang) * r, pz = Math.sin(ang) * r; const [ox, oz] = windAt(p.A, p.B, p.C, n, px, pz); return ox * Math.cos(ang) + oz * Math.sin(ang); };
const ring8 = (p, r, n = 1) => { let s = 0, mn = Infinity, mx = -Infinity; for (let a = 0; a < 6.28; a += 0.4) { const q = rad(p, r, a, n); s += q; mn = Math.min(mn, q); mx = Math.max(mx, q); } return { mean: s / 16, mn, mx }; };

test('pull burst: an imploding ring, plants lean toward the centre (never away), long after the ring passed', () => {
  const early = pack1({ ...base, kind: KIND.BURST, radius: 600, pull: 1 }, 0.1), late = pack1({ ...base, kind: KIND.BURST, radius: 600, pull: 1 }, 0.6);
  assert.equal(early.C[1], 1, 'pull flag packed in uWC.y');
  for (const p of [early, late]) for (const r of [100, 250, 400, 560]) { const q = ring8(p, r); assert.ok(q.mx <= 1e-9 && q.mn <= 0, 'radial inward only @' + r); }
  assert.ok(ring8(early, 560).mean < ring8(early, 150).mean * 0.5 && ring8(early, 560).mean < -0.05, 'young ring is still out at the edge');
  assert.ok(ring8(late, 250).mean < -0.2 && ring8(late, 250).mean < ring8(late, 560).mean, 'ring has contracted: the middle leans hardest');
  const held = pack1({ ...base, kind: KIND.BURST, radius: 600, life: 6, pull: 1 }, 2);
  assert.ok(ring8(held, 250).mean < -0.35 * held.A[3] && held.A[3] > 0.1, 'still leaning in 2 s later');
  const push = pack1({ ...base, kind: KIND.BURST, radius: 600 }, 0.6);
  assert.ok(ring8(push, 250).mean > 0.2, 'same gust without the flag pushes out');
});

test('pull swirl spirals inward (tangential same spin, radial negative); line pull narrows toward the caster', () => {
  const sw = pack1({ ...base, kind: KIND.SWIRL, pull: 1 }, 0.4);
  for (let a = 0; a < 6.28; a += 0.5) { const px = Math.cos(a) * 150, pz = Math.sin(a) * 150; const [ox, oz] = windAt(sw.A, sw.B, sw.C, 1, px, pz); const t = -Math.sin(a) * ox + Math.cos(a) * oz, q = Math.cos(a) * ox + Math.sin(a) * oz; assert.ok(t > 0 && q < 0, 'spin + inward'); }
  assert.deepEqual(windAt(sw.A, sw.B, sw.C, 1, 900, 0), [0, 0]);
  // line from x=-500 (pulled end) to x=+500 (caster): leans toward +x everywhere, wider cone at the pulled end
  const mk = (pull) => pack1({ ...base, kind: KIND.LINE, len: 500, radius: 300, pull }, 1.2);
  const pl = mk(1), ps = mk(0);
  assert.ok(windAt(pl.A, pl.B, pl.C, 1, 0, 0)[0] > 0.05, 'toward the caster end');
  const side = (p, x, z) => Math.abs(windAt(p.A, p.B, p.C, 1, x, z)[0]);
  assert.ok(side(pl, -400, 200) > side(pl, 400, 200) && side(ps, 400, 200) > side(ps, -400, 200), 'pull cone narrows toward the caster; a push widens');
});

test('spellGust: pull spells carry pull = 1 and the geometry that matches the sim events', () => {
  const PUDGE = { x: 0, y: 0 }, VIC = { x: 900, y: 0 };
  // meat hook: the cast pushes along the throw, the hit sub-event pulls victim -> Pudge
  const cast = pk(sp('pudge_meat_hook', { x: 900, y: 0, x2: 1300, y2: 0, r: 70, dur: 1 }), PUDGE, null);
  assert.equal(cast.kind, KIND.LINE); assert.equal(cast.pull, 0); assert.equal(cast.dx, 1);
  const hit = pk(sp('pudge_meat_hook', { sub: 'hit', t: 'v', x: 900, y: 0, x2: 0, y2: 0 }), PUDGE, VIC);
  assert.equal(hit.kind, KIND.LINE); assert.equal(hit.pull, 1); assert.equal(hit.dx, -1, 'runs from the victim toward Pudge'); assert.equal(hit.len, 450); assert.equal(hit.x, 450);
  assert.notEqual(hit.key, cast.key, 'distinct key: the hit is not eaten by the rearm window');
  assert.equal(pk(sp('pudge_meat_hook', { sub: 'nope', x: 1, y: 1 }), PUDGE, null), null, 'other sub-events still never gust');
  // unit-target channels / steals: line target -> caster
  for (const k of ['lion_mana_drain', 'rubick_spell_steal']) {
    const g = pk(sp(k, { t: 'v', x: 600, y: 300 }), PUDGE, { x: 600, y: 300 });
    assert.equal(g.pull, 1, k); assert.equal(g.kind, KIND.LINE, k); assert.ok(g.dx < -0.8 && g.dy < 0, k + ' points back at the caster'); assert.ok(g.strength >= 0.06, k);
  }
  const dis = pk(sp('pudge_dismember', { t: 'v', x: 150, y: 0, r: 120 }), PUDGE, { x: 150, y: 0 });
  assert.equal(dis.pull, 1); assert.equal(dis.kind, KIND.SWIRL);
  const call = pk(sp('axe_berserkers_call', { r: 315 }), { x: 40, y: 50 }, null);
  assert.equal(call.pull, 1); assert.equal(call.kind, KIND.BURST); assert.equal(call.x, 40); assert.equal(call.y, 50);
  // everything else keeps pushing
  for (const k of ['lina_dragon_slave', 'crystal_maiden_freezing_field', 'invoker_chaos_meteor', 'axe_battle_hunger']) assert.equal(pk(sp(k, { x: 500, y: 0, x2: 900, y2: 0 }), PUDGE, VIC).pull, 0, k);
});

test('invoker_emp: two phases. The charge pulls inward, the detonation (cast + dur) flips to a strong outward burst', () => {
  const w = createWind();
  const rec = w.report(sp('invoker_emp', { x: 500, y: 0, dur: 2.9, r: 675 }), (id) => (id === 'a' ? SRC : null));
  assert.ok(rec && rec.pull === 1 && rec.kind === KIND.BURST && rec.x === 500, 'pull burst at the EMP centre');
  assert.equal(w.gusts.length, 2, 'the detonation is queued as a dormant second gust');
  const boom = w.gusts[1]; assert.equal(boom.pull, 0); assert.equal(boom.kind, KIND.BURST); assert.ok(boom.age < 0 && Math.abs(boom.age + 2.9) < 1e-9 && boom.strength >= rec.strength);
  assert.ok(rec.life <= 2.9 + 1e-9, 'the pull has faded by the detonation');
  const A = new Float32Array(32), B = new Float32Array(32), C = new Float32Array(32);
  const radial = (n, r) => { let s = 0; for (let a = 0; a < 6.28; a += 0.4) s += (windAt(A, B, C, n, 500 + Math.cos(a) * r, Math.sin(a) * r)[0] * Math.cos(a) + windAt(A, B, C, n, 500 + Math.cos(a) * r, Math.sin(a) * r)[1] * Math.sin(a)); return s / 16; };
  w.update(1.0); let n = w.pack(A, B, C);
  assert.equal(n, 1, 'only the pull is awake during the charge'); assert.equal(C[1], 1);
  assert.ok(radial(n, 250) < -0.05, 'charging: leaning inward ' + radial(n, 250));
  w.update(1.9 + 0.5); n = w.pack(A, B, C);                         // t = 3.4 s: 0.5 s after the detonation
  assert.equal(n, 1, 'the pull is gone, the burst is up'); assert.equal(C[1], 0);
  assert.ok(radial(n, 300) > 0.3, 'detonated: pushed outward ' + radial(n, 300));
  const dud = createWind(); assert.equal(dud.report(sp('invoker_emp', { x: 500, y: 0, r: 675 }), () => SRC).kind, KIND.BURST); assert.equal(dud.gusts.length, 1, 'no delay in the event: just the pull');
});

test('launchAt: burst = away from the centre, pull = toward it, line = along the cast, swirl = tangential, nothing = null', () => {
  const G = (o) => ({ x: 0, y: 0, dx: 1, dy: 0, len: 0, radius: 600, strength: 0.8, kind: KIND.BURST, pull: 0, life: 4, age: 0, key: 'k', src: 'a', ...o });
  assert.equal(launchAt([], 100, 0), null);
  const out = launchAt([G()], 300, 0), pull = launchAt([G({ pull: 1 })], 300, 0), up = launchAt([G()], 0, -300);
  assert.ok(out.dx > 0.95 && Math.abs(out.dy) < 0.05, 'burst pushes away (+x)'); assert.ok(pull.dx < -0.95, 'pull toward the centre');
  assert.ok(up.dy < -0.95, 'game y (not plane z) of the result');
  const line = launchAt([G({ kind: KIND.LINE, dx: 0, dy: 1, len: 600, radius: 250, x: 0, y: 0 })], 20, 100);
  assert.ok(line.dy > 0.8, 'line along its direction (+y)');
  const sw = launchAt([G({ kind: KIND.SWIRL, radius: 500 })], 250, 0);
  assert.ok(Math.abs(sw.dy) > Math.abs(sw.dx), 'swirl is mostly tangential');
  assert.ok(launchAt([G()], 5000, 0) === null, 'far outside every gust');
  // strength follows the gust and what is left of it
  const fresh = launchAt([G()], 300, 0), weak = launchAt([G({ strength: 0.3 })], 300, 0), old = launchAt([G({ age: 3.5 })], 300, 0);
  assert.ok(fresh.mag > weak.mag && (!old || fresh.mag > old.mag));
  // a queued detonation replaces the charging pull; a dormant gust counts at full strength
  const gs = [G({ pull: 1, key: 'emp' }), G({ key: 'emp#then', age: -2 })];
  assert.ok(launchAt(gs, 300, 0).dx > 0.95, 'push, not the pull');
});
