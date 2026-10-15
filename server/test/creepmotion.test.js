// Lane-creep motion metrics (stacking, path jitter, aggro, spawn -> lane): node --test server/test/creepmotion.test.js
// Prints the numbers (CREEP_MOTION=1 for indented JSON). Metric definitions: creepmotion.js.
// Baseline before the creep-motion pass (seed 3, 300 s):
//   stack mean 16.4 max 38 depth 4.6 | walk turn 575 deg/1000u back 2.4/1000u | fight turn 3907 back 18.2
//   aggro drift 7.8 u/s, targets/creep 44.5, reacquire 5629 | spawn 0.8 s (max 3.7), 3.8 turns, 57 deg | lane corners 18/19/19
import test from 'node:test';
import { measureCreepMotion } from './creepmotion.js';

test('creep motion: 5-minute bot match metrics', () => {
  const m = measureCreepMotion({ seed: 3, sec: 300 });
  console.log(JSON.stringify(m, null, process.env.CREEP_MOTION ? 2 : 0));
});
