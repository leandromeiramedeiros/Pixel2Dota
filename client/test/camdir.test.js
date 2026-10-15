// Camera director (render/camdir.js): spring law, follow lead / lag, cut rule, user moves, modes, peek, dead hero, gesture helpers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMERA_FEEL as F, smoothDamp, smoothDamp2, edgeRamp, edgeHold, classifyPress, dragToWorld, createCamDir } from '../src/render/camdir.js';

const VH = 1190;
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} ${a} vs ${b} (eps ${eps})`);
const H = (x, y, o = {}) => ({ x, y, alive: true, ...o });
/** run n frames of dt with a hero function of time; returns the last output */
function run(cd, n, dt, heroAt, extra = {}, t0 = 0) {
  let out;
  for (let i = 1; i <= n; i++) out = cd.update(dt, { visibleH: VH, ...extra, hero: heroAt ? heroAt(t0 + i * dt) : null });
  return out;
}

test('smoothDamp: frame-rate independent for a fixed target (exact closed form)', () => {
  const step = (n, dt) => { let x = 0, v = 0; for (let i = 0; i < n; i++) [x, v] = smoothDamp(x, 100, v, 0.2, dt); return [x, v]; };
  const a = step(1, 0.5), b = step(30, 0.5 / 30), c = step(240, 0.5 / 240);
  near(a[0], b[0], 1e-9); near(a[0], c[0], 1e-9); near(a[1], c[1], 1e-9);
  assert.ok(a[0] > 90 && a[0] < 100);
});

test('smoothDamp: exact for a constant-velocity target too (no frame-rate bias), steady lag = v * smoothTime', () => {
  const step = (n, T) => { let x = 0, v = 0; const dt = T / n; for (let i = 1; i <= n; i++) [x, v] = smoothDamp(x, 300 * i * dt, v, 0.15, dt, 300); return [x, v]; };
  const a = step(1, 2), b = step(20, 2), c = step(500, 2);
  near(a[0], c[0], 1e-6); near(b[0], c[0], 1e-6); near(a[1], c[1], 1e-6);
  near(c[0], 600 - 300 * 0.15, 1e-3); near(c[1], 300, 1e-3);
});

test('smoothDamp: converges without overshoot from rest, keeps velocity state, dt<=0 no-op', () => {
  let x = 0, v = 0, max = 0;
  for (let i = 0; i < 120; i++) { [x, v] = smoothDamp(x, 50, v, 0.15, 1 / 60); max = Math.max(max, x); }
  near(x, 50, 1e-3); assert.ok(max <= 50 + 1e-9);
  assert.deepEqual(smoothDamp(3, 9, 2, 0.1, 0), [3, 2]);
  assert.deepEqual(smoothDamp(3, 9, 2, 0, 0.016), [9, 0]);
  const [, v1] = smoothDamp(0, 10, 0, 0.2, 0.01); assert.ok(v1 > 0);
  const p = { x: 0, y: 0 }, pv = { x: 0, y: 0 };
  for (let i = 0; i < 200; i++) smoothDamp2(p, { x: 30, y: -40 }, pv, 0.1, 1 / 60);
  near(p.x, 30, 1e-3); near(p.y, -40, 1e-3);
});

test('edgeRamp / edgeHold: floor at once, full by edgeRampMs, monotonic; hold resets', () => {
  near(edgeRamp(0), F.edgeFloor, 1e-12);
  assert.equal(edgeRamp(F.edgeRampMs), 1); assert.equal(edgeRamp(10 * F.edgeRampMs), 1);
  let prev = 0; for (let ms = 0; ms <= 200; ms += 5) { const k = edgeRamp(ms); assert.ok(k >= prev); prev = k; }
  assert.equal(edgeRamp(0, { ...F, edgeRampMs: 0 }), 1);
  assert.equal(edgeHold(40, true, 16), 56); assert.equal(edgeHold(40, false, 16), 0);
});

test('classifyPress: tap / hold / peek / orbit, sticky once decided', () => {
  assert.equal(classifyPress(2, 50, false), 'pending');
  assert.equal(classifyPress(2, 100, true), 'tap');
  assert.equal(classifyPress(2, F.intentMs, false), 'hold');           // held still -> hold-to-walk
  assert.equal(classifyPress(F.peekDragPx + 1, 120, false), 'peek');   // deliberate quick drag
  assert.equal(classifyPress(F.peekDragPx + 1, F.intentMs + 50, false), 'hold');
  assert.equal(classifyPress(F.peekDragPx + 1, 120, true), 'peek');
  assert.equal(classifyPress(50, 50, false, 'hold'), 'hold');          // sticky
  assert.equal(classifyPress(0, 900, true, 'peek'), 'peek');
  assert.equal(classifyPress(40, 40, false, 'pending', true), 'orbit');
});

test('dragToWorld: grab semantics + pitch factor', () => {
  const w = dragToWorld(100, 50, 1000, 500, 2100, 1190);
  near(w.x, -210, 1e-9); near(w.y, 50 * (1190 / 500) / 0.866, 1e-9);
});

test('follow: starts with a cut on the hero, then holds still on a still hero', () => {
  const cd = createCamDir();
  let o = cd.update(1 / 60, { hero: H(500, -300), visibleH: VH });
  assert.equal(o.snap, true); near(o.x, 500, 1e-9); near(o.y, -300, 1e-9);
  o = run(cd, 60, 1 / 60, () => H(500, -300));
  assert.equal(o.snap, false); near(o.x, 500, 1e-6);
  assert.equal(cd.mode, 'follow'); assert.equal(cd.following, true);
});

test('follow: a moving hero does not trail; camera leads, capped at leadCap * visibleH', () => {
  for (const v of [100, 300, 2000]) {
    const cd = createCamDir();
    const o = run(cd, 240, 1 / 60, (t) => H(v * t, 0, { vx: v, vy: 0 }));
    const hx = v * 4, lead = o.x - hx, want = Math.min(v * F.leadTau, F.leadCap * VH);
    assert.ok(lead >= 0, `trails at v=${v}`);
    near(lead, want, 1.5, `lead v=${v}`);
    near(o.y, 0, 1e-6);
  }
});

test('follow: lead from estimated velocity when vx/vy are not given; same result across frame rates', () => {
  const res = [30, 60, 144].map((fps) => { const cd = createCamDir(); return run(cd, 3 * fps, 1 / fps, (t) => H(250 * t, 100 * t)); });
  for (const o of res) { near(o.x - 750, 250 * F.leadTau, 3); near(o.y - 300, 100 * F.leadTau, 3); }
  near(res[0].x, res[2].x, 3); near(res[0].y, res[2].y, 3);
});

test('follow: joystick moveDir leads before the hero moves; total lead capped', () => {
  const cd = createCamDir();
  run(cd, 2, 1 / 60, () => H(0, 0));
  const o = run(cd, 180, 1 / 60, () => H(0, 0, { vx: 0, vy: 0 }), { moveDir: { x: 0, y: 1 } });
  near(o.y, F.joyLead * VH, 1); near(o.x, 0, 1e-6);
  const cd2 = createCamDir();
  const o2 = run(cd2, 240, 1 / 60, (t) => H(0, 600 * t, { vx: 0, vy: 600 }), { moveDir: { x: 0, y: 3 } });
  near(o2.y - 600 * 4, F.leadCap * VH, 1.5);
});

test('aim lookahead: shifts toward the aim point, capped; cleared by null', () => {
  const cd = createCamDir();
  run(cd, 2, 1 / 60, () => H(0, 0));
  cd.aimAt(200, 0);
  let o = run(cd, 240, 1 / 60, () => H(0, 0));
  near(o.x, 200 * F.aimFrac, 0.5);
  cd.aimAt(5000, 0);
  o = run(cd, 240, 1 / 60, () => H(0, 0));
  near(o.x, F.aimCap * VH, 0.5);
  cd.aimAt(null);
  o = run(cd, 300, 1 / 60, () => H(0, 0));
  near(o.x, 0, 0.5);
});

test('teleport cut: a jump > cutVH * visibleH snaps; a short blink springs', () => {
  const cd = createCamDir();
  run(cd, 30, 1 / 60, () => H(0, 0));
  let o = cd.update(1 / 60, { hero: H(400, 0), visibleH: VH });   // short blink
  assert.equal(o.snap, false); assert.ok(o.x > 0 && o.x < 400);
  run(cd, 120, 1 / 60, () => H(400, 0));
  o = cd.update(1 / 60, { hero: H(6000, 6000), visibleH: VH });   // TP
  assert.equal(o.snap, true); near(o.x, 6000, 1e-6); near(o.y, 6000, 1e-6);
  o = cd.update(1 / 60, { hero: H(6000, 6000), visibleH: VH });
  assert.equal(o.snap, false); near(o.x, 6000, 1e-6);
});

test('blink does not poison the velocity estimate (no lead spike)', () => {
  const cd = createCamDir();
  run(cd, 60, 1 / 60, () => H(0, 0));
  cd.update(1 / 60, { hero: H(250, 0), visibleH: VH });          // 250 u in one frame = 15000 u/s if not filtered
  const o = run(cd, 120, 1 / 60, () => H(250, 0));
  near(o.x, 250, 1);
});

test('user moves are instant; pan / jumpTo in follow drop to free; small pan snap:false', () => {
  const cd = createCamDir();
  run(cd, 10, 1 / 60, () => H(0, 0));
  cd.pan(120, -40);
  assert.equal(cd.mode, 'free'); assert.equal(cd.following, false);
  let o = cd.update(1 / 60, { hero: H(0, 0), visibleH: VH });
  near(o.x, 120, 1e-9); near(o.y, -40, 1e-9); assert.equal(o.snap, false);
  o = run(cd, 120, 1 / 60, () => H(300, 300));                    // free: hero walks away, camera stays
  near(o.x, 120, 1e-9); near(o.y, -40, 1e-9);
  cd.jumpTo(5000, -5000);
  o = cd.update(1 / 60, { hero: H(300, 300), visibleH: VH });
  near(o.x, 5000, 1e-9); assert.equal(o.snap, true);              // far jump: tz snaps too
  cd.setFollow(true); cd.jumpTo(10, 10);
  assert.equal(cd.mode, 'free');
});

test('bounds clamp user moves and the output', () => {
  const cd = createCamDir({ bounds: [-1000, 1000], follow: false });
  cd.pan(5000, -5000);
  const o = cd.update(1 / 60, { hero: H(0, 0), visibleH: VH });
  assert.equal(o.x, 1000); assert.equal(o.y, -1000);
});

test('free -> follow: springs back when near (no cut), cuts when far', () => {
  const cd = createCamDir();
  run(cd, 10, 1 / 60, () => H(0, 0));
  cd.pan(300, 0);
  cd.update(1 / 60, { hero: H(0, 0), visibleH: VH });
  cd.setFollow(true);
  let o = cd.update(1 / 60, { hero: H(0, 0), visibleH: VH });
  assert.equal(o.snap, false); assert.ok(o.x < 300 && o.x > 200, `glide ${o.x}`);
  o = run(cd, 120, 1 / 60, () => H(0, 0));
  near(o.x, 0, 0.5);
  cd.jumpTo(8000, 0); cd.update(1 / 60, { hero: H(0, 0), visibleH: VH });
  cd.setFollow(true);
  o = cd.update(1 / 60, { hero: H(0, 0), visibleH: VH });
  assert.equal(o.snap, true); near(o.x, 0, 1e-9);
});

test('centre: instant one-shot, mode unchanged', () => {
  const c0 = createCamDir({ follow: false });                      // before any hero: centres on first sight
  c0.centre();
  near(c0.update(1 / 60, { hero: H(-900, 40), visibleH: VH }).x, -900, 1e-9);
  const cd = createCamDir({ follow: false });
  run(cd, 5, 1 / 60, () => H(700, 700));
  cd.centre();
  const o = cd.update(1 / 60, { hero: H(700, 700), visibleH: VH });
  near(o.x, 700, 1e-9); assert.equal(cd.mode, 'free');
});

test('suspend (touch minimap press / aim edge pan): temporary free, return on release', () => {
  const cd = createCamDir();
  run(cd, 10, 1 / 60, () => H(0, 0));
  cd.suspend(true);
  cd.jumpTo(400, 0);
  assert.equal(cd.following, true);                                 // lock survives
  let o = run(cd, 30, 1 / 60, () => H(0, 0));
  near(o.x, 400, 1e-9);                                             // follow paused
  cd.suspend(false);
  o = cd.update(1 / 60, { hero: H(0, 0), visibleH: VH });
  assert.equal(o.snap, false); assert.ok(o.x < 400 && o.x > 0);     // near: glide
  o = run(cd, 120, 1 / 60, () => H(0, 0)); near(o.x, 0, 0.5);
  cd.suspend(true); cd.jumpTo(9000, 0); cd.update(1 / 60, { hero: H(0, 0), visibleH: VH });
  cd.suspend(false);
  o = cd.update(1 / 60, { hero: H(0, 0), visibleH: VH });
  assert.equal(o.snap, true); near(o.x, 0, 1e-9);                   // far: cut
});

test('hold-follow (desktop Space): centre + follow while held, pans ignored, release keeps camera and previous mode', () => {
  const cd = createCamDir({ follow: false });
  run(cd, 5, 1 / 60, () => H(0, 0));
  cd.pan(500, 0); cd.update(1 / 60, { hero: H(0, 0), visibleH: VH });
  cd.holdFollow(true);
  assert.equal(cd.mode, 'follow');
  let o = cd.update(1 / 60, { hero: H(0, 0), visibleH: VH });
  near(o.x, 0, 1e-9);                                               // instant centre
  cd.pan(300, 0);
  o = run(cd, 60, 1 / 60, (t) => H(200 * t, 0));
  assert.ok(Math.abs(o.x - 200) < 0.2 * VH, 'follows while held');
  const at = o.x;
  cd.holdFollow(false);                                             // also what onBlur does
  assert.equal(cd.mode, 'free');
  o = run(cd, 60, 1 / 60, (t) => H(200 + 200 * t, 0));
  near(o.x, at, 1e-9);                                              // stays where it was
  const cf = createCamDir();
  run(cf, 5, 1 / 60, () => H(0, 0));
  cf.holdFollow(true); cf.holdFollow(false);
  assert.equal(cf.mode, 'follow');
  cf.holdFollow(true); assert.equal(cf.toggleFollow(), false); cf.holdFollow(false);   // lock toggled while held survives release
  assert.equal(cf.mode, 'free');
});

test('peek: offset follows the finger instantly, base keeps following, springs back on release; capped', () => {
  const cd = createCamDir();
  run(cd, 10, 1 / 60, () => H(0, 0));
  cd.peekStart(); assert.equal(cd.mode, 'peek');
  cd.peekMove(300, 100);
  let o = cd.update(1 / 60, { hero: H(0, 0), visibleH: VH });
  near(o.x, 300, 1e-9); near(o.y, 100, 1e-9);
  assert.equal(cd.following, true);
  cd.peekEnd(); assert.equal(cd.mode, 'follow');
  o = cd.update(1 / 60, { hero: H(0, 0), visibleH: VH });
  assert.ok(o.x < 300 && o.x > 200, 'springs, not snaps');
  o = run(cd, 120, 1 / 60, () => H(0, 0));
  near(o.x, 0, 1e-9); near(o.y, 0, 1e-9);
  cd.peekStart(); cd.peekMove(1e6, 0);
  o = cd.update(1 / 60, { hero: H(0, 0), visibleH: VH });
  near(o.x, F.peekMax * VH, 1e-6);
  cd.peekEnd();
  const cf = createCamDir({ follow: false });                      // free: peek returns to the free spot
  run(cf, 5, 1 / 60, () => H(0, 0));
  cf.pan(100, 0); cf.peekStart(); cf.peekMove(0, 200); cf.peekEnd();
  o = run(cf, 120, 1 / 60, () => H(0, 0));
  near(o.x, 100, 1e-9); near(o.y, 0, 1e-9);
});

test('dead hero: follow pauses (camera stays); respawn cuts only if following', () => {
  const cd = createCamDir();
  run(cd, 30, 1 / 60, () => H(1000, 1000));
  let o = run(cd, 120, 1 / 60, () => H(1000, 1000, { alive: false }));
  near(o.x, 1000, 1e-6);
  o = cd.update(1 / 60, { hero: H(-6000, -6000), visibleH: VH });
  assert.equal(o.snap, true); near(o.x, -6000, 1e-9);
  // dead -> player pans -> free: respawn leaves the camera alone
  const cf = createCamDir();
  run(cf, 30, 1 / 60, () => H(1000, 1000));
  run(cf, 10, 1 / 60, () => H(1000, 1000, { alive: false }));
  cf.pan(50, 0);
  o = run(cf, 10, 1 / 60, () => H(-6000, -6000));
  near(o.x, 1050, 1e-9); assert.equal(o.snap, false);
  // respawn nearby (in place) while following: still a clean cut onto the hero
  const cn = createCamDir();
  run(cn, 30, 1 / 60, () => H(0, 0));
  run(cn, 10, 1 / 60, () => H(0, 0, { alive: false }));
  o = cn.update(1 / 60, { hero: H(100, 0), visibleH: VH });
  assert.equal(o.snap, true); near(o.x, 100, 1e-9);
});

test('no hero (spectator / loading): following waits and cuts on first sight; free does not', () => {
  const cd = createCamDir();
  let o = run(cd, 30, 1 / 60, null);
  near(o.x, 0, 1e-9);
  o = cd.update(1 / 60, { hero: H(3000, 0), visibleH: VH });
  assert.equal(o.snap, true); near(o.x, 3000, 1e-9);
  const cs = createCamDir({ follow: false });
  cs.jumpTo(0, 0);
  o = run(cs, 10, 1 / 60, null);
  near(o.x, 0, 1e-9);
});

test('orbit (showcase): hero centred, pan / peek / jumpTo ignored, leaving restores the base mode', () => {
  const cd = createCamDir({ follow: false });
  run(cd, 5, 1 / 60, () => H(0, 0));
  cd.pan(200, 0); cd.update(1 / 60, { hero: H(0, 0), visibleH: VH });
  let o = run(cd, 60, 1 / 60, () => H(0, 0), { showcase: true });
  assert.equal(cd.mode, 'orbit'); near(o.x, 0, 1e-3);
  cd.pan(500, 0); cd.jumpTo(900, 900); cd.peekStart(); cd.peekMove(300, 0);
  o = cd.update(1 / 60, { hero: H(0, 0), visibleH: VH, showcase: true });
  near(o.x, 0, 1e-3); near(o.y, 0, 1e-3);
  cd.aimAt(1000, 0);                                                // no lookahead in orbit
  o = run(cd, 60, 1 / 60, (t) => H(100 * t, 0, { vx: 100, vy: 0 }), { showcase: true });
  near(o.x, 100, 1);                                                // hero centred while it walks (no trailing)
  cd.aimAt(null);
  o = run(cd, 30, 1 / 60, () => H(100, 0));
  assert.equal(cd.mode, 'free'); near(o.x, 100, 1);                 // back to free, camera stays
});

test('re-lock reset (touch recentre): peekEnd + aimAt(null) + centre puts a stuck peek / aim lean back on the hero at once', () => {
  const cd = createCamDir();
  run(cd, 30, 1 / 60, () => H(1000, 1000));
  cd.peekStart(); cd.peekMove(0, 900); cd.aimAt(1000, 3000);   // a peek whose release was lost + a lean whose aim ended abnormally
  run(cd, 60, 1 / 60, () => H(1000, 1000));
  assert.equal(cd.mode, 'peek');
  cd.peekEnd(); cd.aimAt(null); cd.centre();
  assert.equal(cd.mode, 'follow');
  assert.deepEqual(cd.peekOffset, { x: 0, y: 0 });
  const o = run(cd, 1, 1 / 60, () => H(1000, 1000));
  near(o.x, 1000, 1, 'x'); near(o.y, 1000, 1, 'y');
});
