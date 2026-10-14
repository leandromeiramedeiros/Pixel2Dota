// Client fog radius (render/fog.js visionRadius) mirrors the sim (units.js _visDay/_visNight) for every unit kind. node --test server/test/visradius.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { visionRadius } from '../../client/src/render/fog.js';
import { TEAM } from '../../shared/protocol.js';

test('visionRadius client == server for heroes, buildings, creeps, neutrals (day and night)', () => {
  const w = new World({ seed: 3, pregame: 0 });
  w.addHero({ pid: 'a', team: TEAM.RADIANT, heroKey: 'npc_dota_hero_sven' });
  for (let i = 0; i < 3; i++) w.step(1 / 30);
  const bad = [], kinds = new Set();
  for (const night of [false, true]) {
    w.night = night;
    for (const u of w.units.values()) {
      const s = w.visionRadius(u), c = visionRadius({ kind: u.kind, key: u.key, team: u.team }, night);
      kinds.add(u.kind);
      if (s !== c) bad.push(`${u.kind}:${u.key} night=${night} server ${s} client ${c}`);
    }
  }
  assert.ok(kinds.size >= 3, 'several unit kinds present: ' + [...kinds]);
  assert.deepEqual([...new Set(bad)], []);
});
