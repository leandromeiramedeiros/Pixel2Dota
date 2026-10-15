// Lane-creep motion metrics (stacking, path jitter, aggro, spawn -> lane): node --test server/test/creepmotion.test.js
// Prints the numbers (CREEP_MOTION=1 for indented JSON). Metric definitions: creepmotion.js.
// Baseline before the creep-motion pass (seed 3, 300 s):
//   stack mean 16.4 max 38 depth 4.6 | walk turn 575 deg/1000u back 2.4/1000u | fight turn 3907 back 18.2
//   aggro drift 7.8 u/s, targets/creep 44.5, reacquire 5629 | spawn 0.8 s (max 3.7), 3.8 turns, 57 deg | lane corners 18/19/19
// After: stack mean 2.7 max 11 depth 1.6 | walk 108 back 0.3 | fight 736 back 2.0 | drift 3.4, targets 4.4, reacquire 29 |
//   spawn 0.5 s (max 1.1), 0.8 turns, 4 deg | lane corners 12/4/13
// The bounds below are loose (about 2x the "after" numbers) so seed chaos does not trip them; a real regression does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { measureCreepMotion } from './creepmotion.js';

test('creep motion: 5-minute bot match metrics', () => {
  const m = measureCreepMotion({ seed: 3, sec: 300 });
  console.log(JSON.stringify(m, null, process.env.CREEP_MOTION ? 2 : 0));
  assert.ok(m.stack.mean < 6 && m.stack.depth < 3, 'creeps overlap: ' + JSON.stringify(m.stack));
  assert.ok(m.jitter.walk.turnPer1k < 250 && m.jitter.fight.turnPer1k < 1600, 'path jitter: ' + JSON.stringify(m.jitter));
  assert.ok(m.aggro.reacquire < 200 && m.aggro.targetsPerCreep < 10, 'aggro flip-flop: ' + JSON.stringify(m.aggro));
  assert.ok(m.spawn.turns < 2 && m.spawn.maxSec < 3 && m.spawn.samePairs === 0, 'spawn -> lane: ' + JSON.stringify(m.spawn));
  for (const [k, l] of Object.entries(m.lanes)) assert.ok(l.corners <= 15, k + ' lane corners: ' + l.corners);
});
