// Graphics presets + FPS governor (pure; no DOM/three).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PRESETS, LEVELS, presetSettings, applyQuality, createFpsGovernor, isMobileUA, RESOLUTIONS, RES_SCALE, OPTION_DEFAULTS, OPTIONS_KEY, resolutionScale, optionSettings, applyOptions, normalizeOptions, loadOptions, saveOption, loadLevel, saveLevel, clearStored, classifyGpu, detectDefaults, createFrameCap } from '../src/render/quality.js';
import { createLoop } from '../src/loop.js';

// DEFAULTS is private to render/index.js (importing it would pull in three + the DOM): read the literal instead
const src = fs.readFileSync(new URL('../src/render/index.js', import.meta.url), 'utf8');
const DEFAULTS = Function('return ' + /const DEFAULTS = (\{[\s\S]*?\n\});/.exec(src)[1])();

test('presets: high equals the renderer DEFAULTS for every shared key', () => {
  const s = presetSettings('high');
  for (const k of Object.keys(s)) assert.deepEqual(s[k], DEFAULTS[k], k);
});

test('presets: low is a potato (no shadows/ambient/clutter/dof/ssr/rays/wind, few lights/particles/bloom mips); every level sets the same keys; no option keys', () => {
  const lo = presetSettings('low');
  assert.equal(lo.shadows, false); assert.equal(lo.shadowPoints, 0); assert.equal(lo.ambient, 0); assert.equal(lo.clutter, 0); assert.ok(lo.particles <= 0.5);
  assert.equal(lo.dof, false); assert.equal(lo.ssr, false); assert.equal(lo.rays, false); assert.equal(lo.wind, 0); assert.ok(lo.bloomLevels < DEFAULTS.bloomLevels);
  assert.ok(lo.maxLights < DEFAULTS.maxLights);
  const keys = Object.keys(PRESETS.high).sort();
  for (const l of LEVELS) {
    assert.deepEqual(Object.keys(PRESETS[l]).sort(), keys, l);
    for (const k of ['pixelScale', 'bloom', 'fps', 'vsync', 'resolution']) assert.ok(!(k in PRESETS[l]), l + ' must not set the user option ' + k);
    assert.equal(PRESETS[l].outlines, true, 'outlines stay');
  }
  assert.deepEqual(presetSettings('nope'), presetSettings('high'));
  presetSettings('low').shadows = true; assert.equal(PRESETS.low.shadows, false, 'copies, not references');
});

test('presets: wind high = 1 (unchanged look), medium = half, low = static; medium keeps shadows, dof and rays', () => {
  assert.equal(presetSettings('high').wind, 1); assert.equal(presetSettings('medium').wind, 0.5); assert.equal(presetSettings('low').wind, 0);
  const m = presetSettings('medium'); assert.ok(m.dof && m.rays && m.shadows);
  assert.ok(presetSettings('high').ssr);
});

test('presets: every graded key is monotonic low <= medium <= high; the costly ones are strictly graded', () => {
  const n = (v) => (v === true ? 1 : v === false ? 0 : v);
  for (const k of Object.keys(PRESETS.high)) {
    const [lo, me, hi] = LEVELS.map((l) => n(PRESETS[l][k]));
    if (typeof lo !== 'number') continue;
    assert.ok(lo <= me && me <= hi, k + ' ' + [lo, me, hi]);
  }
  for (const k of ['bloomLevels', 'shadowPoints', 'maxLights', 'particles', 'ambient', 'clutter', 'wind']) assert.ok(n(PRESETS.low[k]) < n(PRESETS.high[k]), k + ' low < high');
  for (const k of ['particles', 'maxLights', 'shadowPoints', 'ambient', 'clutter', 'wind']) assert.ok(n(PRESETS.low[k]) < n(PRESETS.medium[k]) && n(PRESETS.medium[k]) < n(PRESETS.high[k]), k + ' medium strictly between');
});

test('applyQuality: setSetting called once per key', () => {
  const calls = {}; applyQuality({ setSetting: (k, v) => { calls[k] = v; } }, 'medium');
  assert.deepEqual(calls, PRESETS.medium);
});

test('options: resolution -> pixelScale (1/4 = 1, 1/2 = sqrt2, native = 2), bloom passes through, independent of the preset', () => {
  assert.equal(RES_SCALE.native, 2); assert.equal(RES_SCALE.half, Math.SQRT2); assert.equal(RES_SCALE.quarter, 1);
  assert.ok(Math.abs(resolutionScale('half') ** 2 * 2 - resolutionScale('native') ** 2) < 1e-9, 'half the pixels of native');
  assert.ok(Math.abs(resolutionScale('quarter') ** 2 * 4 - resolutionScale('native') ** 2) < 1e-9, 'a quarter of the pixels');
  assert.deepEqual(optionSettings({ resolution: 'half', bloom: false }), { pixelScale: Math.SQRT2, bloom: false });
  assert.equal(resolutionScale('junk'), 2);
  const calls = {}; applyOptions({ setSetting: (k, v) => { calls[k] = v; } }, { resolution: 'quarter', fps: 30, bloom: true, vsync: false });
  assert.deepEqual(calls, { pixelScale: 1, bloom: true }, 'fps / vsync belong to the loop, not the renderer');
  for (const l of LEVELS) assert.ok(!('pixelScale' in presetSettings(l)));
  assert.equal(DEFAULTS.pixelScale, 2); assert.equal(DEFAULTS.bloom, true);
});

test('options: normalizeOptions keeps valid values only', () => {
  assert.deepEqual(normalizeOptions({ resolution: 'half', fps: 120, bloom: false, vsync: false }), { resolution: 'half', fps: 120, bloom: false, vsync: false });
  assert.deepEqual(normalizeOptions({ resolution: 'x', fps: 45, bloom: 'no', vsync: 1 }), OPTION_DEFAULTS);
  assert.deepEqual(normalizeOptions({ fps: 30 }, {}), { resolution: undefined, fps: 30, bloom: undefined, vsync: undefined });
  assert.deepEqual(normalizeOptions(null), OPTION_DEFAULTS);
});

test('options: stored overrides round-trip and DEFAULTS clears them', () => {
  const store = {};
  globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  try {
    assert.deepEqual(loadOptions(), {}); assert.equal(loadLevel('medium'), 'medium');
    saveOption('fps', 30); saveOption('bloom', false); saveLevel('low');
    assert.deepEqual(loadOptions(), { fps: 30, bloom: false }); assert.equal(loadLevel(), 'low');
    store[OPTIONS_KEY] = '{"fps":45,"resolution":"half","junk":1}'; assert.deepEqual(loadOptions(), { resolution: 'half' });
    clearStored(); assert.deepEqual(loadOptions(), {}); assert.equal(loadLevel('high'), 'high');
    store[OPTIONS_KEY] = '{not json'; assert.deepEqual(loadOptions(), {});
  } finally { delete globalThis.localStorage; }
});

const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120';
const PC = (o) => ({ mobile: false, cores: 12, memory: 8, screenW: 1920, screenH: 1080, dpr: 1, gpu: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)', refreshHz: 0, ...o });

test('classifyGpu: software / weak / mid / strong / unknown', () => {
  assert.equal(classifyGpu('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'), 'software');
  assert.equal(classifyGpu('llvmpipe (LLVM 15.0.7, 256 bits)'), 'software');
  assert.equal(classifyGpu('Mali-T720'), 'weak'); assert.equal(classifyGpu('Adreno (TM) 308'), 'weak'); assert.equal(classifyGpu('PowerVR Rogue GE8320'), 'weak');
  assert.equal(classifyGpu('ANGLE (Intel, Intel(R) HD Graphics 4000 Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'weak');
  assert.equal(classifyGpu('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'mid');
  assert.equal(classifyGpu('ANGLE (Intel, Intel(R) HD Graphics 630 Direct3D11)'), 'mid');
  assert.equal(classifyGpu('ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11)'), 'mid');
  assert.equal(classifyGpu('ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB Direct3D11)'), 'strong');
  assert.equal(classifyGpu('ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11)'), 'strong');
  assert.equal(classifyGpu('ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)'), 'strong');
  assert.equal(classifyGpu('Apple GPU', true), 'mid'); assert.equal(classifyGpu('Apple GPU', false), 'strong');
  assert.equal(classifyGpu('Adreno (TM) 740'), 'strong'); assert.equal(classifyGpu(''), 'unknown'); assert.equal(classifyGpu('Whatever 9000'), 'unknown');
});

test('isMobileUA', () => {
  assert.equal(isMobileUA({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' }), true);
  assert.equal(isMobileUA({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile' }), true);
  assert.equal(isMobileUA({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 }), true, 'iPadOS');
  assert.equal(isMobileUA({ userAgent: WIN, maxTouchPoints: 0 }), false);
});

test('detectDefaults: gaming PC = High / native / 60 / bloom / vsync', () => {
  const d = detectDefaults(PC());
  assert.deepEqual([d.tier, d.level, d.resolution, d.fps, d.bloom, d.vsync], ['good', 'high', 'native', 60, true, true]);
});
test('detectDefaults: measured refresh above 100 Hz lifts a good machine to 120 fps, not a weaker one', () => {
  assert.equal(detectDefaults(PC({ refreshHz: 144 })).fps, 120);
  assert.equal(detectDefaults(PC({ refreshHz: 60 })).fps, 60);
  assert.equal(detectDefaults(PC({ refreshHz: 144, gpu: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)', cores: 4, memory: 8 })).fps, 60);
});
test('detectDefaults: integrated laptop = low-mid (half res, 60, bloom on)', () => {
  const d = detectDefaults(PC({ gpu: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)', cores: 4, memory: 8 }));
  assert.equal(d.tier, 'lowmid'); assert.equal(d.resolution, 'half'); assert.equal(d.fps, 60); assert.equal(d.bloom, true); assert.ok(d.level === 'low' || d.level === 'medium');
});
test('detectDefaults: potato = Low / 1/4 / 30 / bloom off (old GPU, 2 cores, 2 GB, software renderer)', () => {
  const want = { tier: 'potato', level: 'low', resolution: 'quarter', fps: 30, bloom: false, vsync: true };
  for (const info of [PC({ gpu: 'ANGLE (Intel, Intel(R) HD Graphics 4000 Direct3D11)', cores: 4, memory: 4 }), PC({ cores: 2 }), PC({ memory: 2 }), PC({ gpu: 'Google SwiftShader' })]) {
    const d = detectDefaults(info); for (const k of Object.keys(want)) assert.equal(d[k], want[k], k + ' ' + info.gpu);
  }
});
test('detectDefaults: phones never reach High (old Android = potato, flagship = low-mid), iPhone/iPad Apple GPU = low-mid', () => {
  const old = detectDefaults({ mobile: true, cores: 8, memory: 3, screenW: 360, screenH: 800, dpr: 2, gpu: 'Mali-G52 MC2' });
  assert.equal(old.tier, 'potato'); assert.equal(old.level, 'low');
  const flag = detectDefaults({ mobile: true, cores: 8, memory: 8, screenW: 412, screenH: 915, dpr: 2.6, gpu: 'Adreno (TM) 740', refreshHz: 120 });
  assert.equal(flag.tier, 'lowmid'); assert.notEqual(flag.level, 'high'); assert.equal(flag.fps, 60);
  const ios = detectDefaults({ mobile: true, cores: 6, screenW: 390, screenH: 844, dpr: 3, gpu: 'Apple GPU' });
  assert.notEqual(ios.tier, 'good'); assert.notEqual(ios.level, 'high');
});
test('detectDefaults: missing / empty info degrades safely', () => {
  for (const info of [undefined, {}, { gpu: '' }]) { const d = detectDefaults(info); assert.ok(LEVELS.includes(d.level)); assert.ok([30, 60, 120].includes(d.fps)); assert.ok(RESOLUTIONS.includes(d.resolution)); }
});

test('frame cap: 60 on a 60 Hz display renders every callback (with jitter)', () => {
  const c = createFrameCap(60); let n = 0, t = 1000, sum = 0;
  for (let i = 0; i < 600; i++) { t += 16.667 + (i % 2 ? 0.8 : -0.8); const dt = c.tick(t); if (dt) { n++; sum += dt; } }
  assert.equal(n, 600); assert.ok(Math.abs(sum / n - 16.667) < 0.5);
});
test('frame cap: 30 on 60 Hz renders every second callback and passes the real elapsed dt', () => {
  const c = createFrameCap(30); let n = 0, t = 1000; const dts = [];
  for (let i = 0; i < 600; i++) { t += 16.667; const dt = c.tick(t); if (dt) { n++; dts.push(dt); } }
  assert.ok(Math.abs(n - 300) <= 1, String(n)); for (const d of dts.slice(2)) assert.ok(Math.abs(d - 33.33) < 0.5, String(d));
});
test('frame cap: 120 on 60 Hz renders every callback without runaway; 30 on 144 Hz averages 30', () => {
  const c = createFrameCap(120); let n = 0, t = 0;
  for (let i = 0; i < 300; i++) { t += 16.667; if (c.tick(t)) n++; } assert.equal(n, 300);
  const d = createFrameCap(30); n = 0; t = 0;
  for (let i = 0; i < 1440; i++) { t += 1000 / 144; if (d.tick(t)) n++; } assert.ok(Math.abs(n - 300) <= 3, String(n));
});
test('frame cap: a stall does not cause a burst; setFps / reset', () => {
  const c = createFrameCap(60); let t = 0; for (let i = 0; i < 10; i++) { t += 16.667; c.tick(t); }
  t += 2000; assert.ok(c.tick(t) > 0); t += 1; assert.equal(c.tick(t), 0, 'no catch-up burst');
  c.setFps(30); assert.equal(c.interval, 1000 / 30); c.reset(); assert.ok(c.tick(5000) > 0);
});

// a virtual clock: setTimeout + MessageChannel queue events by time; rAF fires every 16.667 ms while any callback is pending
function fakeEnv() {
  const q = []; let t = 0, seq = 0, rafId = 0, rafCb = null, rafAt = 0;
  const env = {
    performance: { now: () => t },
    requestAnimationFrame: (f) => { rafCb = f; rafId++; rafAt = (Math.floor(t / 16.667 + 1e-9) + 1) * 16.667; return rafId; },
    cancelAnimationFrame: () => { rafCb = null; },
    setTimeout: (f, ms) => { const e = { at: t + ms, seq: seq++, f }; q.push(e); return e; },
    clearTimeout: (e) => { const i = q.indexOf(e); if (i >= 0) q.splice(i, 1); },
    MessageChannel: class { constructor() { const p1 = { onmessage: null, close() {} }; this.port1 = p1; this.port2 = { postMessage: (d) => { q.push({ at: t + 0.05, seq: seq++, f: () => p1.onmessage && p1.onmessage({ data: d }) }); } }; } },
    document: undefined,
  };
  env.run = (ms) => {
    const end = t + ms;
    for (;;) {
      q.sort((a, b) => a.at - b.at || a.seq - b.seq);
      const next = q[0], rafT = rafCb ? rafAt : Infinity, ev = next && next.at <= rafT ? next : null;
      const when = ev ? ev.at : rafT;
      if (when > end) { t = end; return; }
      t = when;
      if (ev) { q.shift(); ev.f(); } else { const f = rafCb; rafCb = null; f(t); }
    }
  };
  return env;
}

test('loop: vsync on = rAF capped by the accumulator; vsync off = timer/channel cadence at the cap; switching leaves a single chain', () => {
  const env = fakeEnv(); const dts = [];
  const loop = createLoop({ frame: (now, dt) => dts.push(dt), fps: 60, vsync: true, env });
  loop.start(); env.run(1000);
  assert.ok(dts.length >= 58 && dts.length <= 62, 'vsync 60 -> ' + dts.length);
  loop.setFps(30); dts.length = 0; env.run(1000);
  assert.ok(Math.abs(dts.length - 30) <= 2, 'vsync 30 -> ' + dts.length);
  loop.setVsync(false); loop.setFps(120); dts.length = 0; env.run(1000);
  assert.ok(dts.length >= 100 && dts.length <= 125, 'free 120 -> ' + dts.length);
  loop.setFps(30); dts.length = 0; env.run(1000);
  assert.ok(Math.abs(dts.length - 30) <= 3, 'free 30 -> ' + dts.length);
  loop.setVsync(true); loop.setVsync(false); loop.setVsync(true); loop.setVsync(false); loop.setFps(60); dts.length = 0; env.run(1000);
  assert.ok(dts.length >= 55 && dts.length <= 65, 'after toggling, still one chain -> ' + dts.length);
  loop.stop(); dts.length = 0; env.run(500); assert.equal(dts.length, 0);
  loop.destroy();
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
