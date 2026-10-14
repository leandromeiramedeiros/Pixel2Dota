// Bot tests: node --test server/test/bots.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { HERO_KEYS } from '../../shared/heroes.js';
import { TEAM, KIND } from '../../shared/protocol.js';

const DT = 1 / 30;
const run = (w, sec) => { for (let i = 0, n = Math.round(sec / DT); i < n; i++) w.step(DT); };

function match(seed, pregame) {
  const w = new World({ seed, pregame });
  const hs = [];
  for (let i = 0; i < 10; i++) hs.push(w.addHero({ pid: 'b' + i, team: i < 5 ? TEAM.RADIANT : TEAM.DIRE, heroKey: HERO_KEYS[i % HERO_KEYS.length], bot: true, slot: i % 5 }));
  return { w, hs };
}

test('bots: start set is bought and skills are learned right at spawn', () => {
  const { w, hs } = match(3, 0);
  run(w, 4);
  for (const h of hs) {
    assert.ok(h.items.filter((i) => i.key).length >= 3, h.key + ' bought a start set');
    assert.ok(h.items.some((i) => i.key === 'item_tango'), h.key + ' has tango');
    assert.ok(h.abilities.some((a) => a.level > 0), h.key + ' learned a skill');
  }
});

test('bots: 10 bots (all heroes), 5 game-minutes, no errors; gold, items, creep kills, tower damage', () => {
  const { w, hs } = match(5, 0);
  const gold0 = new Map(hs.map((h) => [h.id, w.players.get(h.owner).gold]));
  let creepDeaths = 0;
  for (let t = 0; t < 300 * 30; t++) {
    w.step(DT);
    for (const e of w.drainEvents()) if (e.e === 'death' && e.k && /creep/i.test(String(e.k))) creepDeaths++;
  }
  let lh = 0, bought = 0, levels = 0;
  for (const h of hs) {
    const p = w.players.get(h.owner);
    assert.equal(p._bot.errs, 0, h.key + ' bot error: ' + (p._bot.lastErr && p._bot.lastErr.stack));
    lh += p.lh | 0;
    levels += h.level - 1;
    // anything beyond the cheap start set counts as "bought" (components or finished items)
    bought += h.items.filter((i) => i.key && !/tango|flask|clarity|branches|quelling|magic_stick|tpscroll/.test(i.key)).length;
  }
  const dead = w.towers.filter((t) => t._dead).length;
  const hurt = w.towers.filter((t) => t.hp < t.maxHp).length;
  const creepsAlive = [...w.units.values()].filter((u) => u.kind === KIND.CREEP && !u._dead).length;
  assert.ok(lh > 0 || creepDeaths > 0, 'creeps die (lh ' + lh + ', deaths ' + creepDeaths + ')');
  assert.ok(levels > 0, 'heroes gain levels');
  assert.ok(bought >= 3, 'bots buy build items: ' + bought);
  assert.ok(dead + hurt > 0, 'some tower took damage');
  assert.ok(creepsAlive > 0);
  assert.ok(hs.some((h) => w.players.get(h.owner).gold > gold0.get(h.id)) || bought > 0, 'bots earn gold');
});

test('bots: after a death the bot recovers and keeps thinking (no errors across respawn)', () => {
  const { w, hs } = match(9, 0);
  run(w, 20);
  const v = hs[1];
  w.killUnit(v, hs[6]);
  run(w, 60);
  assert.equal(w.players.get(v.owner)._bot.errs, 0);
  assert.equal(v._dead, false, 'respawned');
});
