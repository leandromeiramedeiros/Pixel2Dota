// Graphics presets + FPS governor (pure; no DOM/three).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PRESETS, LEVELS, presetSettings, applyQuality, createFpsGovernor, isMobileUA, defaultLevel } from '../src/render/quality.js';

// DEFAULTS is private to render/index.js (importing it would pull in three + the DOM): read the literal instead
const src = fs.readFileSync(new URL('../src/render/index.js', import.meta.url), 'utf8');
const DEFAULTS = Function('return ' + /const DEFAULTS = (\{[\s\S]*?\n\});/.exec(src)[1])();

test('presets: high equals the renderer DEFAULTS for every shared key', () => {
  const s = presetSettings('high');
  for (const k of Object.keys(s)) assert.deepEqual(s[k], DEFAULTS[k], k);
});

test('presets: low is a potato (no shadows/ambient/clutter/dof/ssr/rays/wind, fewer particles, fewer bloom mips); every level sets the same keys', () => {
  const lo = presetSettings('low');
  assert.equal(lo.shadows, false); assert.equal(lo.ambient, false); assert.equal(lo.clutter, false); assert.ok(lo.particles <= 0.5);
  assert.equal(lo.dof, false); assert.equal(lo.ssr, false); assert.equal(lo.rays, false); assert.equal(lo.wind, 0); assert.ok(lo.bloomLevels < DEFAULTS.bloomLevels);
  assert.ok(lo.pixelScale < DEFAULTS.pixelScale);
  const keys = Object.keys(PRESETS.high).sort();
  for (const l of LEVELS) assert.deepEqual(Object.keys(PRESETS[l]).sort(), keys, l);
  assert.deepEqual(presetSettings('nope'), presetSettings('high'));
  presetSettings('low').shadows = true; assert.equal(PRESETS.low.shadows, false, 'copies, not references');
});

test('presets: wind high = 1 (unchanged look), medium = half, low = static; medium keeps the post passes', () => {
  assert.equal(presetSettings('high').wind, 1); assert.equal(presetSettings('medium').wind, 0.5); assert.equal(presetSettings('low').wind, 0);
  for (const l of ['medium', 'high']) { const p = presetSettings(l); assert.ok(p.dof && p.ssr && p.rays, l); }
});

test('presets: cost is monotonic low <= medium <= high', () => {
  const cost = (s) => s.pixelScale ** 2 + (s.shadows ? 1 : 0) + (s.ambient ? 0.5 : 0) + (s.clutter ? 0.5 : 0) + s.particles + (s.dof ? 0.5 : 0) + (s.ssr ? 0.5 : 0) + (s.rays ? 0.25 : 0) + s.bloomLevels / 10;
  assert.ok(cost(PRESETS.low) < cost(PRESETS.medium) && cost(PRESETS.medium) < cost(PRESETS.high));
});

test('applyQuality: setSetting called once per key', () => {
  const calls = {}; applyQuality({ setSetting: (k, v) => { calls[k] = v; } }, 'medium');
  assert.deepEqual(calls, PRESETS.medium);
});

test('default level: phones low, desktop high', () => {
  assert.equal(defaultLevel({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' }), 'low');
  assert.equal(defaultLevel({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile' }), 'low');
  assert.equal(isMobileUA({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 }), true, 'iPadOS');
  assert.equal(defaultLevel({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120', maxTouchPoints: 0 }), 'high');
});

// run `frames` at a fixed dt (or a per-frame function) from `t`; returns the next t
function run(g, t, ms, dt) { const end = t + ms; while (t < end) { const d = dt(t); t += d; g.feed(d, t); } return t; }

test('governor: sustained 30 fps drops once after the window, then waits another window', () => {
  let drops = 0; const g = createFpsGovernor({ onDrop: () => drops++ });
  let t = run(g, 1000, 5000, () => 1000 / 30);
  assert.equal(drops, 0, 'warm-up (first 5 s) ignored');
  t = run(g, t, 9000, () => 1000 / 30); assert.equal(drops, 0, '9 s of data is not a full window');
  t = run(g, t, 3000, () => 1000 / 30); assert.equal(drops, 1);
  t = run(g, t, 6000, () => 1000 / 30); assert.equal(drops, 1, 'window restarted');
  run(g, t, 6000, () => 1000 / 30); assert.equal(drops, 2);
});

test('governor: 60 fps never drops', () => {
  let drops = 0; const g = createFpsGovernor({ onDrop: () => drops++ });
  run(g, 0, 120000, () => 1000 / 60); assert.equal(drops, 0);
});

test('governor: brief stalls do not drop (median); hidden-tab gaps are ignored', () => {
  let drops = 0; const g = createFpsGovernor({ onDrop: () => drops++ });
  let n = 0;
  const t = run(g, 0, 60000, () => (++n % 40 === 0 ? 250 : 1000 / 60));   // a 250 ms hitch every 40 frames
  assert.equal(drops, 0);
  g.feed(30000, t + 30000);   // tab was hidden for 30 s: neither counted nor a drop
  run(g, t + 30000, 20000, () => 1000 / 60); assert.equal(drops, 0);
});

test('governor: a slow window right after a long gap restarts the measurement', () => {
  let drops = 0; const g = createFpsGovernor({ onDrop: () => drops++ });
  let t = run(g, 0, 6000, () => 1000 / 30);
  t = run(g, t, 8000, () => 1000 / 30);
  g.feed(5000, t + 5000); t += 5000;   // gap resets the window
  t = run(g, t, 9000, () => 1000 / 30); assert.equal(drops, 0);
  run(g, t, 2000, () => 1000 / 30); assert.equal(drops, 1);
});

test('governor: reset() restarts warm-up', () => {
  let drops = 0; const g = createFpsGovernor({ onDrop: () => drops++ });
  let t = run(g, 0, 5500, () => 33); t = run(g, t, 8000, () => 33);
  g.reset(t); t = run(g, t, 14000, () => 33); assert.equal(drops, 0, 'warm-up 5 s + window 10 s not done');
  run(g, t, 2000, () => 33); assert.equal(drops, 1);
});
