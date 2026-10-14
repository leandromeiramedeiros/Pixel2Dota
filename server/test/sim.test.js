// Simulation tests: node --test server/test/sim*.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { makeCreep } from '../src/sim/units.js';
import { addXp } from '../src/sim/heroes.js';
import { KIND, TEAM, ST, EV } from '../../shared/protocol.js';
import { armorMult, XP_TABLE, RESPAWN, WAVE_EVERY } from '../../shared/constants.js';
import { HERO_KEYS } from '../../shared/heroes.js';

const DT = 1 / 30;
const run = (w, sec) => { for (let i = 0, n = Math.round(sec / DT); i < n; i++) w.step(DT); };
const tower = (w, team, lane, tier) => w.towers.find((t) => t.team === team && t._lane === lane && t._tier === tier);
const creeps = (w, team) => [...w.units.values()].filter((u) => u.kind === KIND.CREEP && u.team !== TEAM.NEUTRAL && !u._dead && (team === undefined || u.team === team));   // lane creeps (camps / Roshan are neutrals.test.js)
const SVEN = 'npc_dota_hero_sven';
const put = (w, u, x, y) => { w.teleport(u, x, y); w.index.insert(u); };

test('armor math and attack time', () => {
  assert.ok(Math.abs(armorMult(10) - 0.625) < 1e-9);
  assert.ok(Math.abs(armorMult(0) - 1) < 1e-9);
  const w = new World({ seed: 1, pregame: 0, buildings: false });
  const h = w.addHero({ pid: 'a', team: TEAM.RADIANT, heroKey: SVEN });
  // sven: baseAS 110 + 18 agi, BAT 1.9
  assert.ok(Math.abs(h._interval - 1.9 / 1.28) < 1e-6, `interval ${h._interval}`);
  assert.ok(Math.abs(h.atkRate - 1.28 / 1.9) < 1e-6);
  const c = makeCreep(w, TEAM.DIRE, 'melee', 0, 0, 'mid'); w.addUnit(c);
  c.armor = 10; c.hp = c.maxHp = 1000;
  const d = w.damage(h, c, 100, 'phys');
  assert.ok(Math.abs(d - 62.5) < 1e-6);
  assert.ok(Math.abs(c.hp - 937.5) < 1e-6);
  const m = w.damage(h, c, 100, 'mag');
  assert.ok(Math.abs(m - 100 * (1 - c._mr)) < 1e-6);
  w.damage(h, c, 100, 'pure');
  assert.ok(Math.abs(c.hp - (937.5 - m - 100)) < 1e-6);
});

test('a creep wave spawns and walks toward the enemy', () => {
  const w = new World({ seed: 1, pregame: 0 });
  w.step(DT);
  const all = creeps(w);
  assert.equal(all.length, 24, 'first wave: 3 lanes x (3 melee + 1 ranged) x 2 teams');
  assert.equal(all.filter((c) => c._type === 'ranged').length, 6);
  assert.equal(all.filter((c) => c._type === 'siege').length, 0);
  const fort = w.forts[TEAM.DIRE];
  const mid = (t) => { const l = creeps(w, t).filter((c) => c._lane === 'mid'); return l.reduce((s, c) => s + Math.hypot(c.x - fort.x, c.y - fort.y), 0) / l.length; };
  const d0 = mid(TEAM.RADIANT);
  run(w, 20);
  assert.ok(mid(TEAM.RADIANT) < d0 - 1000, `radiant mid creeps advanced ${d0} -> ${mid(TEAM.RADIANT)}`);
  const rf = w.forts[TEAM.RADIANT];
  const dm = creeps(w, TEAM.DIRE).filter((c) => c._lane === 'mid');
  assert.ok(dm.every((c) => Math.hypot(c.x - rf.x, c.y - rf.y) < 9000) && dm.length > 0);
  run(w, WAVE_EVERY);
  assert.ok(creeps(w).length > 24, 'second wave spawned');
  // siege on wave 5
  run(w, WAVE_EVERY * 3 + 1);
  assert.equal(w.waveNo, 5);
  assert.equal(creeps(w).filter((c) => c._type === 'siege' && c._wave === 5).length, 6);
});

test('towers kill creeps', () => {
  const w = new World({ seed: 2, pregame: 0 });
  const t = tower(w, TEAM.DIRE, 'mid', 1);
  const c = makeCreep(w, TEAM.RADIANT, 'melee', t.x - 450, t.y - 450, 'mid'); w.addUnit(c);
  const start = c.hp;
  run(w, 2);
  assert.ok(c.hp < start, 'tower shot it');
  run(w, 10);
  assert.ok(c._dead, 'creep died');
});

test('hero levels from xp, respawns, fountain heals', () => {
  const w = new World({ seed: 3, pregame: 0 });
  const h = w.addHero({ pid: 'a', team: TEAM.RADIANT, heroKey: SVEN });
  assert.equal(h.level, 1);
  const hp1 = h.maxHp;
  addXp(w, h, XP_TABLE[1]);
  assert.equal(h.level, 2);
  assert.equal(h.skillPoints, 2);
  assert.ok(h.maxHp > hp1 + 50, 'strength gain raised max hp');
  addXp(w, h, XP_TABLE[5] - h.xp);
  assert.equal(h.level, 6);
  // learn: ult needs hero level 6
  assert.ok(w.order('a', { t: 'learn', slot: 3 }));
  assert.equal(h.abilities[3].level, 1);
  assert.ok(!w.order('a', { t: 'learn', slot: 3 }), 'second ult level needs level 12');
  // death + respawn
  const lvl = h.level;
  w.killUnit(h, null);
  assert.ok(h._dead);
  assert.equal(h.respawn, RESPAWN[lvl - 1]);
  assert.equal(w.players.get('a').deaths, 1);
  run(w, RESPAWN[lvl - 1] - 1);
  assert.ok(h._dead);
  run(w, 2);
  assert.ok(!h._dead && h.respawn === 0);
  const f = w.fountains[TEAM.RADIANT];
  assert.ok(Math.hypot(h.x - f.x, h.y - f.y) < 400);
  assert.equal(h.hp, h.maxHp);
  // fountain heals
  h.hp = h.maxHp * 0.5;
  run(w, 5);
  assert.ok(h.hp > h.maxHp * 0.6, 'fountain regen');
});

test('tier protection, ancient win', () => {
  const w = new World({ seed: 4, pregame: 0 });
  const inv = (b) => !!(b._st & ST.INVULN);
  assert.ok(!inv(tower(w, TEAM.DIRE, 'mid', 1)));
  assert.ok(inv(tower(w, TEAM.DIRE, 'mid', 2)));
  assert.ok(inv(tower(w, TEAM.DIRE, 'mid', 3)));
  assert.ok(inv(w.rax.find((r) => r.team === TEAM.DIRE && r._lane === 'mid' && r._rax === 'melee')));
  assert.ok(inv(w.forts[TEAM.DIRE]));
  assert.ok(inv(w.fountains[TEAM.DIRE]));
  // invulnerable buildings take no damage
  const hero = w.addHero({ pid: 'a', team: TEAM.RADIANT, heroKey: SVEN });
  const t2 = tower(w, TEAM.DIRE, 'mid', 2);
  assert.equal(w.damage(hero, t2, 500, 'pure'), 0);
  w.killUnit(tower(w, TEAM.DIRE, 'mid', 1), hero);
  assert.ok(!inv(t2), 'T2 open after T1 falls');
  assert.ok(inv(tower(w, TEAM.DIRE, 'top', 2)), 'other lane untouched');
  assert.ok(inv(tower(w, TEAM.DIRE, 'mid', 3)));
  assert.ok(w.damage(hero, t2, 100, 'pure') > 0);
  w.killUnit(t2, hero);
  assert.ok(!inv(tower(w, TEAM.DIRE, 'mid', 3)));
  const rax = w.rax.find((r) => r.team === TEAM.DIRE && r._lane === 'mid' && r._rax === 'melee');
  w.killUnit(tower(w, TEAM.DIRE, 'mid', 3), hero);
  assert.ok(!inv(rax), 'rax open after T3');
  const t4 = w.towers.filter((t) => t.team === TEAM.DIRE && t._tier === 4);
  assert.equal(t4.length, 2);
  assert.ok(!t4.some(inv), 'T4 open once any T3 fell');
  assert.ok(inv(w.forts[TEAM.DIRE]));
  w.killUnit(t4[0], hero);
  assert.ok(inv(w.forts[TEAM.DIRE]), 'one T4 left');
  w.killUnit(t4[1], hero);
  assert.ok(!inv(w.forts[TEAM.DIRE]));
  assert.equal(w.winner, -1);
  w.drainEvents();
  w.killUnit(w.forts[TEAM.DIRE], hero);
  assert.equal(w.winner, TEAM.RADIANT);
  assert.ok(w.drainEvents().some((e) => e.e === EV.END && e.winner === TEAM.RADIANT));
  const tick = w.tick; w.step(DT); assert.equal(w.tick, tick, 'step is a no-op after the game ended');
});

test('sven storm bolt stuns and damages', () => {
  const w = new World({ seed: 5, pregame: 0, buildings: false });
  const a = w.addHero({ pid: 'a', team: TEAM.RADIANT, heroKey: SVEN });
  const b = w.addHero({ pid: 'b', team: TEAM.DIRE, heroKey: SVEN });
  put(w, a, -1500, -1400); put(w, b, -1100, -1400);
  w.step(DT); b.hp = b.maxHp;
  const hp0 = b.hp, dmgExp = w.val('sven_storm_bolt', 'damage', 1) * (1 - b._mr);
  const cdMax = w.val('sven_storm_bolt', 'AbilityCooldown', 1) || 21;
  assert.ok(w.order('a', { t: 'learn', slot: 0 }));
  const mana0 = a.mana;
  assert.ok(w.order('a', { t: 'cast', slot: 0, id: b.id }));
  let stunned = false;
  for (let i = 0; i < 90 && !stunned; i++) { w.step(DT); stunned = !!(b.status & ST.STUN); }
  assert.ok(stunned, 'target stunned');
  assert.ok(Math.abs(hp0 - b.hp - dmgExp) < 2, `damage ${hp0 - b.hp} expected ${dmgExp}`);
  assert.ok(a.abilities[0].cd > 0 && a.abilities[0].cd <= cdMax + 0.1);
  assert.ok(a.mana < mana0 - 100 + 5);
  const st = w.getModifier(b, 'stun');
  assert.ok(st && st.left <= 1.01 && st.left > 0.9);
  // wears off
  run(w, 1.2);
  assert.ok(!(b.status & ST.STUN));
  // out-of-range target: hero walks into range first
  put(w, b, -400, -1400); b.hp = b.maxHp; const hp1 = b.hp;
  a.abilities[0].cd = 0; a.mana = a.maxMana;
  assert.ok(w.order('a', { t: 'cast', slot: 0, id: b.id }));
  run(w, 3);
  assert.ok(b.hp < hp1 - 20, 'approached and cast');
});

test('great cleave and warcry', () => {
  const w = new World({ seed: 6, pregame: 0, buildings: false });
  const a = w.addHero({ pid: 'a', team: TEAM.RADIANT, heroKey: SVEN });
  const b = w.addHero({ pid: 'b', team: TEAM.DIRE, heroKey: SVEN });
  put(w, a, -1500, -1400); put(w, b, -1400, -1400);
  b.hp = b.maxHp = 9000;
  const c = makeCreep(w, TEAM.DIRE, 'melee', -1400, -1330, 'mid'); w.addUnit(c);
  // learn cleave (slot 1) and warcry (slot 2)
  addXp(w, a, XP_TABLE[2]);
  assert.ok(w.order('a', { t: 'learn', slot: 1 }));
  assert.ok(w.order('a', { t: 'learn', slot: 2 }));
  a.facing = 0;
  const hp0 = c.hp;
  w.order('a', { t: 'attack', id: b.id });
  run(w, 3);
  assert.ok(c.hp < hp0, 'cleave hit the neighbour');
  w.order('a', { t: 'stop' });
  w.order('a', { t: 'cast', slot: 2 });
  run(w, 0.5);
  assert.ok(w.hasModifier(a, 'sven_warcry'));
  assert.ok(a.armor > 5);
});

test('20 game minutes headless: no exceptions, creeps keep pushing', () => {
  const w = new World({ seed: 7, pregame: 0 });
  HERO_KEYS.slice(0, 10).forEach((k, i) => w.addHero({ pid: 'p' + i, team: i % 2, heroKey: k, bot: true }));
  let accepted = 0, maxLiLate = 0, crashed = null;
  const ticks = 30 * 60 * 20;
  const lateWaves = [];
  try {
    for (let i = 0; i < ticks; i++) {
      if (i % 300 === 0) {
        for (const [pid, p] of w.players) {
          const h = w.units.get(p.heroId), f = { x: 0, y: 0 };   // fight around the river, never siege, so the full 20 min runs
          if (w.order(pid, { t: 'amove', x: f.x, y: f.y })) accepted++;
          w.order(pid, { t: 'learn', slot: i % 4 });
          w.order(pid, { t: 'cast', slot: i % 4, x: f.x, y: f.y, id: h.id });
        }
      }
      w.step(DT);
      if (i > ticks - 30 * 60 && i % 300 === 0) for (const c of w.units.values()) if (c.kind === KIND.CREEP && c.team !== TEAM.NEUTRAL && !c._dead) maxLiLate = Math.max(maxLiLate, c._li);
      if (i % 3000 === 0) w.drainEvents();
      if (w.winner >= 0) break;
    }
  } catch (e) { crashed = e; }
  assert.equal(crashed, null, crashed && crashed.stack);
  w.drainEvents();
  console.log(`# 20min: time=${w.time.toFixed(0)}s waves=${w.waveNo} winner=${w.winner} units=${w.units.size} creeps=${creeps(w).length} towersLeft=${w.towers.filter((t) => !t._dead).length} orders=${accepted}`);
  assert.ok(accepted > 0, 'hero orders accepted');
  assert.ok(w.time >= 1199 || w.winner >= 0);
  assert.ok(w.waveNo >= Math.floor(Math.min(w.time, 1200) / WAVE_EVERY));
  if (w.winner < 0) {
    assert.ok(creeps(w).length > 0, 'creeps alive at the end');
    assert.ok(maxLiLate >= 4, 'creeps still advancing in the last minute: ' + maxLiLate);
  }
  for (const u of w.units.values()) assert.ok(Number.isFinite(u.x) && Number.isFinite(u.y) && Number.isFinite(u.hp), 'finite state ' + u.key);
});

test('perf: ~200 units step() under 4 ms', () => {
  const w = new World({ seed: 8, pregame: 0 });
  HERO_KEYS.slice(0, 10).forEach((k, i) => w.addHero({ pid: 'p' + i, team: i % 2, heroKey: k, bot: true }));
  run(w, 20);
  // top up to 200 units with extra creeps scattered over lanes
  const lanes = ['top', 'mid', 'bot'];
  let n = 0;
  while (w.units.size < 200) {
    const team = n % 2, lane = lanes[n % 3];
    const path = w._laneTeam[team + lane];
    const p = path[(5 + n * 3) % (path.length - 2)];
    const c = makeCreep(w, team, n % 4 === 3 ? 'ranged' : 'melee', p.x + (n % 7) * 12, p.y, lane);
    c._lp = path; c._li = 1 + ((5 + n * 3) % (path.length - 2)); c._mvLi = -1;
    w.addUnit(c); n++;
  }
  // hold the population at ~200 by re-topping every few seconds is not needed: measure the first 10 s
  const times = [];
  let min = 1e9, sum = 0, cnt = 0;
  for (let i = 0; i < 300; i++) {
    const t0 = performance.now(); w.step(DT); const dt = performance.now() - t0;
    times.push(dt); sum += dt; cnt++; min = Math.min(min, dt);
    if (i % 90 === 0) w.drainEvents();
  }
  times.sort((a, b) => a - b);
  const avg = sum / cnt, p99 = times[Math.floor(times.length * 0.99)];
  console.log(`# perf: units=${w.units.size} avg=${avg.toFixed(3)}ms p99=${p99.toFixed(3)}ms max=${times[times.length - 1].toFixed(3)}ms`);
  assert.ok(avg < 4, `avg ${avg}ms`);
});
