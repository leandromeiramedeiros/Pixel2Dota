// Dota engine mechanics: attack cooldown on cancel, turn-while-moving, tower aggro, creep wave growth / super & mega creeps, melee arcs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { makeCreep } from '../src/sim/units.js';
import { spawnWave } from '../src/sim/creeps.js';
import { resolveAttack } from '../src/sim/combat.js';
import { KIND, TEAM } from '../../shared/protocol.js';
import { WAVE_MELEE, WAVE_RANGED, SIEGE_EVERY, WAVE_GROW } from '../../shared/constants.js';
import { DATA } from '../../shared/data.js';

const DT = 1 / 30;
const run = (w, sec) => { for (let i = 0, n = Math.round(sec / DT); i < n; i++) w.step(DT); };
const put = (w, u, x, y) => { w.teleport(u, x, y); w.index.insert(u); };
const SVEN = 'npc_dota_hero_sven';
const X0 = -2000, Y0 = 2000;   // open jungle-free ground in a buildings:false world
const tank = (u) => { u._base.hp = u.hp = u.maxHp = 1e6; };   // _base too: recalc() would reset maxHp

function duel() {
  const w = new World({ seed: 1, pregame: 0, buildings: false, creeps: false });
  const h = w.addHero({ pid: 'a', team: TEAM.RADIANT, heroKey: SVEN });
  put(w, h, X0, Y0); h.facing = 0;
  const c = makeCreep(w, TEAM.DIRE, 'melee', X0 + 100, Y0, 'mid'); w.addUnit(c);
  c._base.hp = c.hp = c.maxHp = 5000; c.ms = 0; c._base.ms = 0;
  c.dmgMin = c.dmgMax = 0;
  return { w, h, c };
}

test('attack cooldown is only spent when the attack goes off', () => {
  // escaped during the windup: no hit, no cooldown, a fresh attack starts as soon as the target is back in range
  {
    const { w, h, c } = duel();
    w.order('a', { t: 'attack', id: c.id });
    for (let i = 0; i < 60 && !(h._wind > 0); i++) w.step(DT);
    assert.ok(h._wind > 0, 'windup started');
    const hp = c.hp;
    put(w, c, X0 + 900, Y0); c.ms = 0;
    for (let i = 0; i < 60 && h._wind > 0; i++) w.step(DT);
    assert.equal(c.hp, hp, 'no hit');
    assert.ok(h._cd <= 0, `cooldown not spent (cd ${h._cd})`);
  }
  // a stop order mid-windup refunds the attack too (animation cancel)
  {
    const { w, h, c } = duel();
    w.order('a', { t: 'attack', id: c.id });
    for (let i = 0; i < 60 && !(h._wind > 0); i++) w.step(DT);
    w.order('a', { t: 'stop' });
    w.step(DT);
    assert.equal(h._wind, 0);
    assert.ok(h._cd <= 0, 'cancelled windup costs no cooldown');
  }
  // a completed attack: attack-start to attack-start still equals the attack interval
  {
    const { w, h, c } = duel();
    w.order('a', { t: 'attack', id: c.id });
    const starts = [];
    let prev = 0;
    for (let i = 0; i < 200; i++) { w.step(DT); if (h._wind > 0 && !(prev > 0)) starts.push(w.time); prev = h._wind; }
    assert.ok(starts.length >= 3);
    const gap = (starts[starts.length - 1] - starts[0]) / (starts.length - 1);
    assert.ok(Math.abs(gap - h._interval) < 2 * DT + 1e-9, `attack period ${gap} vs interval ${h._interval}`);
  }
});

test('units turn while moving: curve at moderate angles, turn in place only when facing away', () => {
  const w = new World({ seed: 1, pregame: 0, buildings: false, creeps: false });
  const h = w.addHero({ pid: 'a', team: TEAM.RADIANT, heroKey: SVEN });
  const step = h.ms * DT;
  // 60 degrees off: moves on the very first tick, slower than full speed
  put(w, h, X0, Y0); h.facing = 0;
  w.order('a', { t: 'move', x: X0 + 1000 * Math.cos(Math.PI / 3), y: Y0 + 1000 * Math.sin(Math.PI / 3) });
  w.step(DT);
  const d1 = Math.hypot(h.x - X0, h.y - Y0);
  assert.ok(d1 > 0.3 * step && d1 < step - 0.1, `curved start moved ${d1} of ${step}`);
  // 170 degrees off: turns in place first
  put(w, h, X0, Y0); h.facing = 0;
  w.order('a', { t: 'move', x: X0 + 1000 * Math.cos(Math.PI * 17 / 18), y: Y0 + 1000 * Math.sin(Math.PI * 17 / 18) });
  w.step(DT);
  assert.ok(Math.hypot(h.x - X0, h.y - Y0) < 0.01, 'turned in place');
  run(w, 0.5);
  assert.ok(Math.hypot(h.x - X0, h.y - Y0) > step * 5, 'then walks');
});

// ---------------------------------------------------------------------------------------------------------------- waves
const laneCreeps = (w, team, lane, wave) => [...w.units.values()].filter((u) => u.kind === KIND.CREEP && u.team === team && u._lane === lane && u._wave === wave && !u._dead);
const count = (list, type, grade) => list.filter((u) => u._type === type && (grade === undefined || u._grade === grade)).length;

test('barracks: own rax down keeps spawning, enemy rax down -> super creeps in that lane, all six down -> mega', () => {
  const w = new World({ seed: 1, pregame: 0 });
  const rax = (team, lane, kind) => w.rax.find((r) => r.team === team && r._lane === lane && r._rax === kind);
  w.killUnit(rax(TEAM.DIRE, 'mid', 'melee'), null);
  spawnWave(w, 1);
  const rm = laneCreeps(w, TEAM.RADIANT, 'mid', 1), dm = laneCreeps(w, TEAM.DIRE, 'mid', 1), rt = laneCreeps(w, TEAM.RADIANT, 'top', 1);
  assert.equal(count(rm, 'melee', 'upgraded'), WAVE_MELEE, 'radiant mid melee are super');
  assert.equal(count(rm, 'ranged', ''), WAVE_RANGED, 'radiant mid ranged stay normal (dire ranged rax alive)');
  assert.equal(count(dm, 'melee', ''), WAVE_MELEE, 'dire mid still spawns its melee creeps');
  assert.equal(count(rt, 'melee', ''), WAVE_MELEE, 'other lanes unaffected');
  const sup = rm.find((u) => u._type === 'melee'), d = DATA.units.goodguys_melee_upgraded;
  assert.equal(sup.maxHp, d.hp); assert.equal(sup.dmgMax, d.dmgMax);
  assert.equal(sup.key, DATA.units.goodguys_melee.key, 'wire key stays the base creep model');
  for (const r of w.rax) if (r.team === TEAM.DIRE && !r._dead) w.killUnit(r, null);
  spawnWave(w, SIEGE_EVERY);
  const all = laneCreeps(w, TEAM.RADIANT, 'bot', SIEGE_EVERY);
  assert.ok(all.length > 0 && all.every((u) => u._grade === 'upgraded_mega'), 'mega creeps once all six enemy rax are down');
  assert.equal(count(all, 'siege'), 1);
  assert.ok(laneCreeps(w, TEAM.DIRE, 'bot', SIEGE_EVERY).every((u) => u._grade === ''), 'dire creeps unchanged');
});

test('waves grow with the game clock', () => {
  const w = new World({ seed: 1, pregame: 0 });
  const n = (min, wave) => { w.time = min * 60; spawnWave(w, wave); return laneCreeps(w, TEAM.RADIANT, 'mid', wave); };
  const a = n(0, 1), b = n(15, 2), c = n(30, 3), e = n(45, SIEGE_EVERY * 10);
  assert.equal(count(a, 'melee'), WAVE_MELEE);
  assert.equal(count(b, 'melee'), WAVE_MELEE + 1);
  assert.equal(count(c, 'melee'), WAVE_MELEE + 2); assert.equal(count(c, 'ranged'), WAVE_RANGED + WAVE_GROW.ranged.filter((m) => m <= 30).length);
  assert.equal(count(e, 'melee'), WAVE_MELEE + 3); assert.equal(count(e, 'siege'), 1 + WAVE_GROW.siege.filter((m) => m <= 45).length);
});

test('lane creep passives from the game files: irresolute, piercing, siege', () => {
  const w = new World({ seed: 1, pregame: 0 });
  const h = w.addHero({ pid: 'a', team: TEAM.RADIANT, heroKey: SVEN });
  const mk = (team, type) => { const c = makeCreep(w, team, type, X0, Y0, 'mid'); w.addUnit(c); c.dmgMin = c.dmgMax = 100; c.dmgBonus = 0; return c; };
  const hit = (a, t) => { const hp = t.hp; t.armor = 0; t._mr = 0; resolveAttack(w, a, t); const d = hp - t.hp; t.hp = t.maxHp; return d; };
  const mel = mk(TEAM.DIRE, 'melee'), rng = mk(TEAM.DIRE, 'ranged'), sg = mk(TEAM.DIRE, 'siege');
  const foeC = mk(TEAM.RADIANT, 'melee'), foeS = mk(TEAM.RADIANT, 'siege');
  const tw = w.towers.find((b) => b.team === TEAM.RADIANT && b._tier === 1 && b._lane === 'top');
  tw._st = 0; tw.hp = tw.maxHp;
  assert.ok(Math.abs(hit(mel, h) - 75) < 1e-6, 'melee vs hero -25%');
  assert.ok(Math.abs(hit(mel, foeC) - 100) < 1e-6, 'melee vs creep');
  assert.ok(Math.abs(hit(rng, h) - 50) < 1e-6, 'ranged vs hero -50%');
  assert.ok(Math.abs(hit(rng, foeC) - 150) < 1e-6, 'ranged vs creep +50%');
  assert.ok(Math.abs(hit(rng, foeS) - 50 * 0.7) < 1e-6, 'ranged vs siege -50% (heavy), siege takes -30% from creeps');
  assert.ok(Math.abs(hit(sg, tw) - 250) < 1e-6, 'siege vs building +150%');
  h.dmgMin = h.dmgMax = 100; h.dmgBonus = 0;
  assert.ok(Math.abs(w.damage(h, foeS, 100, 'pure') - 50) < 1e-6, 'siege takes -50% from heroes');
});

// ---------------------------------------------------------------------------------------------------------------- melee arc
test('melee heroes attacking one target spread around it and settle instead of shoving toward its centre', () => {
  const w = new World({ seed: 1, pregame: 0, buildings: false });
  const c = makeCreep(w, TEAM.DIRE, 'melee', X0, Y0, 'mid'); w.addUnit(c);
  c.ms = 0; c._base.ms = 0; tank(c); c.dmgMin = c.dmgMax = 0;
  const hs = [];
  for (let i = 0; i < 8; i++) {   // a tight column coming from one side
    const pid = 'p' + i, h = w.addHero({ pid, team: TEAM.RADIANT, heroKey: SVEN });
    put(w, h, X0 - 600 + (i % 3) * 30, Y0 + ((i / 3) | 0) * 40 - 40);
    w.order(pid, { t: 'attack', id: c.id });
    hs.push(h);
  }
  run(w, 3);
  let late = 0;   // movement in the 4th second: should be none once everybody has a spot
  for (let k = 0; k < 30; k++) { const p = hs.map((h) => [h.x, h.y]); w.step(DT); hs.forEach((h, i) => { late += Math.hypot(h.x - p[i][0], h.y - p[i][1]); }); }
  let minD = Infinity;
  for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) minD = Math.min(minD, Math.hypot(hs[i].x - hs[j].x, hs[i].y - hs[j].y));
  const inRange = hs.filter((h) => Math.hypot(h.x - c.x, h.y - c.y) <= h.atkRange + h.radius + c.radius + 1).length;
  assert.equal(inRange, hs.length, `all ${hs.length} in attack range (${inRange})`);
  assert.ok(minD >= 2 * hs[0].radius - 4, `no overlapping bodies (closest pair ${minD.toFixed(1)})`);
  assert.ok(late < 2, `settled: ${late.toFixed(1)} units of shoving in the last second`);
});

// ---------------------------------------------------------------------------------------------------------------- hero steering
test('heroes walk around standing units in their way instead of shoving through them', () => {
  const SX = -6500, SY = -5000;   // open base ground (no buildings in this world)
  const w = new World({ seed: 1, pregame: 0, buildings: false });
  const h = w.addHero({ pid: 'a', team: TEAM.RADIANT, heroKey: SVEN });
  put(w, h, SX, SY); h.facing = 0;
  const block = [0, 1, 2].map((i) => { const c = makeCreep(w, TEAM.RADIANT, 'melee', SX + 300, SY + (i - 1) * 34, 'mid'); c._lp = null; w.addUnit(c); return c; });
  const at = block.map((c) => [c.x, c.y]);
  w.order('a', { t: 'move', x: SX + 700, y: SY });
  let minGap = Infinity, tArrive = -1;
  for (let k = 0; k < 150 && tArrive < 0; k++) {
    w.step(DT);
    for (const c of block) minGap = Math.min(minGap, Math.hypot(h.x - c.x, h.y - c.y) - h.radius - c.radius);
    if (Math.hypot(h.x - (SX + 700), h.y - SY) < 10) tArrive = (k + 1) * DT;
  }
  const pushed = Math.max(...block.map((c, i) => Math.hypot(c.x - at[i][0], c.y - at[i][1])));
  assert.ok(tArrive > 0 && tArrive < 700 / h.ms + 0.5, `arrived in ${tArrive.toFixed(2)} s`);
  assert.ok(minGap > -3, `never pushed into a body (min gap ${minGap.toFixed(1)})`);
  assert.ok(pushed < 3, `standing creeps not shoved (${pushed.toFixed(1)})`);
});

// ---------------------------------------------------------------------------------------------------------------- tower aggro
function towerScene() {
  const w = new World({ seed: 2, pregame: 0 });
  const t = w.towers.find((b) => b.team === TEAM.DIRE && b._lane === 'mid' && b._tier === 1);
  const h = w.addHero({ pid: 'a', team: TEAM.RADIANT, heroKey: SVEN });
  tank(h);   // survive the tower for the whole test
  const c = makeCreep(w, TEAM.RADIANT, 'melee', t.x - 520, t.y - 120, 'mid'); w.addUnit(c);
  c.ms = 0; c._base.ms = 0; tank(c);
  return { w, t, h, c };
}

test('tower keeps its hero target when a creep walks into range (no free dives)', () => {
  const { w, t, h, c } = towerScene();
  put(w, c, t.x + 3000, t.y + 3000);           // creep out of the way
  put(w, h, t.x - 420, t.y - 420);
  run(w, 1);
  assert.equal(t._tgt, h, 'tower shoots the lone hero');
  put(w, c, t.x - 520, t.y - 120);             // creep enters tower range
  run(w, 3);
  assert.equal(t._tgt, h, 'still on the hero');
});

test('tower switches to a hero that attacks an allied hero in its range; spells do not draw aggro', () => {
  const { w, t, h, c } = towerScene();
  const foe = w.addHero({ pid: 'b', team: TEAM.DIRE, heroKey: SVEN });
  tank(foe);
  put(w, foe, t.x - 100, t.y - 720);           // out of both heroes' auto-attack reach
  put(w, h, t.x + 3000, t.y - 3000);            // hero away: the tower settles on the creep
  run(w, 1);
  assert.equal(t._tgt, c, 'tower on the creep');
  put(w, h, t.x - 420, t.y - 420);
  w.damage(h, foe, 10, 'mag', { ability: 'sven_storm_bolt' });
  run(w, 1);
  assert.equal(t._tgt, c, 'spell damage draws no tower aggro');
  w.order('a', { t: 'attack', id: foe.id });
  w.step(DT);
  assert.equal(t._tgt, h, 'attack order on an allied hero pulls the tower at once');
  w.order('a', { t: 'stop' });
  run(w, 3);
  assert.equal(t._tgt, h, 'sticky after the aggro window: keeps its target');
});

function aggroScene() {
  const w = new World({ seed: 1, pregame: 0, buildings: false });
  const h = w.addHero({ pid: 'a', team: TEAM.RADIANT, heroKey: SVEN });
  const foe = w.addHero({ pid: 'b', team: TEAM.DIRE, heroKey: SVEN });
  tank(h); tank(foe);
  put(w, h, X0, Y0); put(w, foe, X0 + 900, Y0);
  const rc = makeCreep(w, TEAM.RADIANT, 'melee', X0 + 200, Y0 + 300, 'mid'); w.addUnit(rc);
  const near = makeCreep(w, TEAM.DIRE, 'melee', X0 + 300, Y0 + 300, 'mid'); w.addUnit(near);
  const far = makeCreep(w, TEAM.DIRE, 'melee', X0 - 800, Y0 - 300, 'mid'); w.addUnit(far);
  for (const c of [rc, near, far]) { c.ms = 0; c._base.ms = 0; tank(c); c._lp = null; }
  return { w, h, foe, rc, near, far };
}

test('creep aggro: an attack order on an enemy hero pulls the victim team\'s creeps near the attacker; spells do not', () => {
  {
    const { w, h, foe, rc, near, far } = aggroScene();
    run(w, 0.5);
    assert.equal(near._tgt, rc, 'dire creep fights the radiant creep');
    w.order('a', { t: 'attack', id: foe.id });
    w.step(DT);
    assert.equal(near._tgt, h, 'creep within 500 of the attacker switches to it');
    assert.notEqual(far._tgt, h, 'creep far from the attacker does not');
  }
  {
    const { w, h, foe, rc, near } = aggroScene();
    run(w, 0.5);
    w.damage(h, foe, 10, 'mag', { ability: 'sven_storm_bolt' });
    run(w, 0.5);
    assert.equal(near._tgt, rc, 'spell damage draws no creep aggro');
  }
});
