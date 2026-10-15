// Dota engine mechanics: attack cooldown on cancel, turn-while-moving, tower aggro, creep wave growth / super & mega creeps, melee arcs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { makeCreep } from '../src/sim/units.js';
import { TEAM } from '../../shared/protocol.js';

const DT = 1 / 30;
const run = (w, sec) => { for (let i = 0, n = Math.round(sec / DT); i < n; i++) w.step(DT); };
const put = (w, u, x, y) => { w.teleport(u, x, y); w.index.insert(u); };
const SVEN = 'npc_dota_hero_sven';
const X0 = -2000, Y0 = 2000;   // open jungle-free ground in a buildings:false world

function duel() {
  const w = new World({ seed: 1, pregame: 0, buildings: false, creeps: false });
  const h = w.addHero({ pid: 'a', team: TEAM.RADIANT, heroKey: SVEN });
  put(w, h, X0, Y0); h.facing = 0;
  const c = makeCreep(w, TEAM.DIRE, 'melee', X0 + 100, Y0, 'mid'); w.addUnit(c);
  c.hp = c.maxHp = 5000; c.ms = 0; c._base.ms = 0;
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

// ---------------------------------------------------------------------------------------------------------------- tower aggro
function towerScene() {
  const w = new World({ seed: 2, pregame: 0 });
  const t = w.towers.find((b) => b.team === TEAM.DIRE && b._lane === 'mid' && b._tier === 1);
  const h = w.addHero({ pid: 'a', team: TEAM.RADIANT, heroKey: SVEN });
  h.hp = h.maxHp = 1e6;   // survive the tower for the whole test
  const c = makeCreep(w, TEAM.RADIANT, 'melee', t.x - 520, t.y - 120, 'mid'); w.addUnit(c);
  c.ms = 0; c._base.ms = 0; c.hp = c.maxHp = 1e6;
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
  foe.hp = foe.maxHp = 1e6;
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
  h.hp = h.maxHp = foe.hp = foe.maxHp = 1e6;
  put(w, h, X0, Y0); put(w, foe, X0 + 900, Y0);
  const rc = makeCreep(w, TEAM.RADIANT, 'melee', X0 + 200, Y0 + 300, 'mid'); w.addUnit(rc);
  const near = makeCreep(w, TEAM.DIRE, 'melee', X0 + 300, Y0 + 300, 'mid'); w.addUnit(near);
  const far = makeCreep(w, TEAM.DIRE, 'melee', X0 - 800, Y0 - 300, 'mid'); w.addUnit(far);
  for (const c of [rc, near, far]) { c.ms = 0; c._base.ms = 0; c.hp = c.maxHp = 1e6; c._lp = null; }
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
