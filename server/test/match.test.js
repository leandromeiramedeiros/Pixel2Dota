// Headless 10-bot match smoke test: node --test server/test/match.test.js
// Simulates 12 game-minutes (pregame included) with seed 3, sampling for NaN and checking progression/events/bot health.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { HERO_KEYS } from '../../shared/heroes.js';
import { TEAM, KIND, EV } from '../../shared/protocol.js';

const DT = 1 / 30;
const MATCH_SEC = 12 * 60;
const SAMPLE_EVERY = 30;
const STARTING = /tango|flask|clarity|branches|quelling|magic_stick|tpscroll/;

test('match: 10 bots, 12 game-minutes, no NaN, no bot errors, progression, events, perf', () => {
  const w = new World({ seed: 3 });
  for (let i = 0; i < 10; i++) {
    const team = i < 5 ? TEAM.RADIANT : TEAM.DIRE, slot = i % 5;
    w.addHero({ pid: `bot:${team}:${slot}`, team, heroKey: HERO_KEYS[i % HERO_KEYS.length], bot: true, name: HERO_KEYS[i % HERO_KEYS.length], slot });
  }
  const counts = { death: 0, kill: 0, spell: 0, heroDeath: 0, creepDeath: 0 };
  let nonFinite = [];
  let stepMs = 0, ticks = 0;
  while (w.time < MATCH_SEC - 1e-6 && w.winner < 0) {
    const t0 = performance.now();
    w.step(DT);
    stepMs += performance.now() - t0;
    ticks++;
    for (const e of w.drainEvents()) {
      if (e.e === EV.DEATH) {
        counts.death++;
        if (/npc_dota_hero_/.test(String(e.k))) counts.heroDeath++;
        else if (/creep/i.test(String(e.k))) counts.creepDeath++;
      } else if (e.e === EV.KILL) counts.kill++;
      else if (e.e === EV.SPELL) counts.spell++;
    }
    if (ticks % SAMPLE_EVERY === 0) {
      for (const u of w.units.values()) {
        if (!Number.isFinite(u.x) || !Number.isFinite(u.y) || !Number.isFinite(u.hp)) {
          if (nonFinite.length < 10) nonFinite.push(`${u.key} id=${u.id} t=${w.time.toFixed(1)} x=${u.x} y=${u.y} hp=${u.hp}`);
        }
      }
    }
  }
  assert.deepEqual(nonFinite, [], 'non-finite unit x/y/hp samples');

  const heroes = [...w.units.values()].filter((u) => u.kind === KIND.HERO);
  assert.equal(heroes.length, 10, 'ten hero units exist');

  const botErrs = [...w.players].filter(([, p]) => p._bot && p._bot.errs > 0)
    .map(([pid, p]) => `${pid}: ${p._bot.errs} (${p._bot.lastErr && p._bot.lastErr.message})`);
  assert.deepEqual(botErrs, [], 'bot errors');

  for (const h of heroes) assert.ok(h.level >= 2, `${h.key} level ${h.level} >= 2 at ${(w.time / 60).toFixed(1)}m`);

  const heroFights = counts.kill + counts.heroDeath;
  assert.ok(heroFights > 0 || counts.creepDeath > 100,
    `combat happened: kills ${counts.kill}, hero deaths ${counts.heroDeath}, creep deaths ${counts.creepDeath}`);

  assert.ok(counts.spell > 0, 'at least one spell event');

  const bought = heroes.filter((h) => h.items.some((i) => i.key && !STARTING.test(i.key)));
  assert.ok(bought.length > 0, 'at least one hero bought an item beyond starting items');

  const msPerTick = stepMs / ticks;
  assert.ok(msPerTick < 5, `avg ms per tick ${msPerTick.toFixed(2)} < 5`);
});
