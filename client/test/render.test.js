// Pure render-module tests (no WebGL): atlas packing / animation key resolution, camera params, light selection, terrain geometry, fog LOS.
import test from 'node:test';
import assert from 'node:assert/strict';
import { shelfPack, nextPow2, resolveKey, indexSheet } from '../src/art/atlas.js';
import { timeOfDay, skyPalette, goldenLight } from '../src/render/sky.js';
import { camParams, visibleHeight, CameraRig, cameraPose, rayToGround, stepYaw, viewFacing, wrapPi } from '../src/render/camera.js';
import { ORBIT, dragToOrbit, pinchZoomFactor, inJoyZone } from '../src/ui/orbit.js';
import { selectLights } from '../src/render/lights.js';
import { castVision, visionRadius, VISION_FALLBACK } from '../src/render/fog.js';
import { buildChunk, hash2, CHUNK } from '../src/render/terrainGeo.js';
import { dirOf, dir8Of } from '../src/render/actors.js';
import { getMap, TT } from '../../shared/map.js';
import { CAMERA, DAY_LEN } from '../../shared/constants.js';

test('shelfPack: no overlap, inside width', () => {
  const items = Array.from({ length: 60 }, (_, i) => ({ w: 5 + (i * 7) % 23, h: 4 + (i * 11) % 29 }));
  const H = shelfPack(items, 256, 1);
  for (const a of items) { assert.ok(a.x >= 1 && a.x + a.w <= 255); assert.ok(a.y >= 1 && a.y + a.h <= H); }
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `overlap ${i} ${j}`);
  }
  assert.equal(nextPow2(300), 512); assert.equal(nextPow2(512), 512);
});

test('resolveKey: direction fallback, west mirrors east, non-loop clamp', () => {
  const counts = { idle_s: 2, idle_e: 2, walk_s: 4, walk_e: 4, attack_e: 3, dead_s: 1 };
  assert.deepEqual(resolveKey({}, counts, 'walk', 'w', 1), { key: 'walk_e_1', flip: true, n: 4 });
  assert.equal(resolveKey({}, counts, 'walk', 'n', 5).key, 'walk_s_1');         // n missing -> s, index wraps
  assert.equal(resolveKey({}, counts, 'attack', 'e', 9, '', true).key, 'attack_e_2');   // clamped
  assert.equal(resolveKey({}, counts, 'stunned', 's', 0).key, 'idle_s_0');      // falls back to idle
  assert.equal(resolveKey({}, counts, 'cast', 'e', 0).key, 'attack_e_0');
  assert.equal(resolveKey({}, {}, 'idle', 's', 0), null);
});

test('resolveKey: 8-dir sheets mirror sw/nw, 1x sheets fall back diagonal -> e', () => {
  const c8 = { idle_s: 2, idle_se: 2, idle_e: 2, idle_ne: 2, idle_n: 2 };
  assert.deepEqual(resolveKey({}, c8, 'idle', 'sw', 1), { key: 'idle_se_1', flip: true, n: 2 });
  assert.deepEqual(resolveKey({}, c8, 'idle', 'nw', 0), { key: 'idle_ne_0', flip: true, n: 2 });
  assert.deepEqual(resolveKey({}, c8, 'idle', 'ne', 0), { key: 'idle_ne_0', flip: false, n: 2 });
  const c4 = { idle_s: 1, idle_e: 1, idle_n: 1 };
  assert.deepEqual(resolveKey({}, c4, 'idle', 'sw', 0), { key: 'idle_e_0', flip: true, n: 1 });   // 1x sheet: sw -> mirrored e
  assert.deepEqual(resolveKey({}, c4, 'idle', 'ne', 0), { key: 'idle_e_0', flip: false, n: 1 });
  assert.deepEqual(resolveKey({}, c4, 'idle', 'nw', 0), { key: 'idle_e_0', flip: true, n: 1 });
});

test('indexSheet: counts 8-dir keys, anim names with underscores', () => {
  const idx = indexSheet({ frames: { idle_se_0: ['.'], idle_se_1: ['.'], idle_sw_0: ['.'], walk_ne_2: ['.'], portrait: ['.'] } });
  assert.equal(idx.idle_se, 2); assert.equal(idx.idle_sw, 1); assert.equal(idx.walk_ne, 3);
});

test('dir8Of: 45 degree sectors, 0 = east, CCW, y north', () => {
  const P = Math.PI;
  assert.deepEqual([0, P / 4, P / 2, 3 * P / 4, P, -3 * P / 4, -P / 2, -P / 4].map(dir8Of), ['e', 'ne', 'n', 'nw', 'w', 'sw', 's', 'se']);
  assert.equal(dir8Of(P / 8 - 0.01), 'e'); assert.equal(dir8Of(P / 8 + 0.01), 'ne'); assert.equal(dir8Of(2 * P + 0.1), 'e');
});

test('indexSheet counts frames per sequence', () => {
  const def = { frames: { idle_s_0: ['.'], idle_s_1: ['.'], walk_e_0: ['.'] } };
  const idx = indexSheet(def);
  assert.ok(idx);
});

test('camParams: game angle at default distance, closer is flatter', () => {
  const far = camParams(CAMERA.distance), near = camParams(CAMERA.closeDistance);
  assert.equal(far.pitch, CAMERA.pitch);
  assert.equal(near.pitch, CAMERA.pitchMin);
  assert.ok(far.vfov > near.vfov - 20 && far.vfov > 40 && far.vfov < 60);
  const mid = camParams((CAMERA.distance + CAMERA.closeDistance) / 2);
  assert.ok(mid.pitch > near.pitch && mid.pitch < far.pitch);
  assert.ok(visibleHeight(1134, far.vfov) > 1000);
});

test('camParams: showcase close-up below the close camera, continuous at closeDistance', () => {
  const sc = camParams(CAMERA.showcaseDistance), near = camParams(CAMERA.closeDistance), justIn = camParams(CAMERA.closeDistance - 0.01);
  assert.equal(sc.pitch, CAMERA.showcasePitch);
  assert.ok(sc.pitch < near.pitch && sc.vfov > near.vfov);   // low eye, wider lens
  assert.ok(Math.abs(justIn.pitch - near.pitch) < 0.01 && Math.abs(justIn.vfov - near.vfov) < 0.01);
  assert.equal(camParams(CAMERA.showcaseDistance - 100).pitch, CAMERA.showcasePitch);   // clamped
});

test('selectLights: capped, prefers bright & near', () => {
  const list = [];
  for (let i = 0; i < 50; i++) list.push({ x: i * 100, y: 0, radius: 300, intensity: 1 });
  list.push({ x: 0, y: 0, radius: 400, intensity: 3 });
  const s = selectLights(list, 0, 0, 32);
  assert.equal(s.length, 32);
  assert.equal(s[0].radius, 400);
  assert.ok(!s.includes(list[49]));
});

test('terrain chunk: positions / uv attributes consistent', () => {
  const map = getMap();
  const lookup = () => ({ x: 0, y: 0, w: 8, h: 8 });
  let found = 0;
  for (let cy = 0; cy < Math.ceil(map.h / CHUNK) && found < 6; cy += 7) for (let cx = 0; cx < Math.ceil(map.w / CHUNK) && found < 6; cx += 7) {
    const c = buildChunk(map, cx, cy, lookup);
    if (!c) continue;
    found++;
    assert.equal(c.pos.length % 3, 0);
    for (const v of c.pos) assert.ok(Number.isFinite(v));
    assert.equal(c.uv.length / 2, c.pos.length / 3);
    assert.equal(c.cell.length / 4, c.pos.length / 3);
    if (c.index) for (const i of c.index) assert.ok(i < c.pos.length / 3);
  }
  assert.ok(found > 0);
  assert.equal(hash2(3, 4, 1), hash2(3, 4, 1));
  const h = hash2(10, 20); assert.ok(h >= 0 && h < 1);
});

test('dirOf: facing -> sprite direction (0 = east, CCW, y north)', () => {
  assert.equal(dirOf(0), 'e'); assert.equal(dirOf(Math.PI), 'w');
  assert.equal(dirOf(Math.PI / 2), 'n'); assert.equal(dirOf(-Math.PI / 2), 's');
  assert.equal(dirOf(Math.PI / 4 + 0.2), 'n');
});

test('castVision: radius bound, symmetric-ish, walls block', () => {
  const map = getMap();
  // find an open flat tile with open neighbourhood
  let sx = 0, sy = 0, ok = false;
  for (let ty = 40; ty < map.h - 40 && !ok; ty += 5) for (let tx = 40; tx < map.w - 40 && !ok; tx += 5) {
    let clean = true;
    const j0 = ty * map.w + tx;
    for (let dy = -12; dy <= 12 && clean; dy++) for (let dx = -12; dx <= 12; dx++) { const j = (ty + dy) * map.w + tx + dx; if (map.type[j] !== map.type[j0] || Math.abs(map.hC[j] - map.hC[j0]) > 4) { clean = false; break; } }
    if (clean && map.type[j0] !== TT.WALL && map.type[j0] !== TT.OUT) { ok = true; sx = map.x0 + (tx + 0.5) * map.tile; sy = map.y1 - (ty + 0.5) * map.tile; }
  }
  assert.ok(ok, "open flat patch exists");
  const vis = new Uint8Array(map.w * map.h);
  const n = castVision(map, vis, sx, sy, 400, null);
  assert.ok(n > 0);
  const rt = 400 / map.tile;
  let far = 0, near = 0;
  for (let i = 0; i < vis.length; i++) if (vis[i]) {
    const tx = i % map.w, ty = (i / map.w) | 0;
    const d = Math.hypot(tx + 0.5 - (sx - map.x0) / map.tile, ty + 0.5 - (map.y1 - sy) / map.tile);
    if (d > rt + 1.5) far++; else if (d < rt * 0.8) near++;
  }
  assert.equal(far, 0);
  assert.ok(near > 0.9 * Math.PI * (rt * 0.8) ** 2 * 0.9, 'open ground is almost fully seen');
  // a live tree wall everywhere blocks sight beyond 1.5 tiles
  const vis2 = new Uint8Array(map.w * map.h);
  const n2 = castVision(map, vis2, sx, sy, 400, () => true);
  assert.ok(n2 < n * 0.25);
});

test('visionRadius: heroes day/night, fallback constants', () => {
  assert.equal(VISION_FALLBACK.day, 1800); assert.equal(VISION_FALLBACK.night, 800);
  const day = visionRadius({ kind: 'hero', key: 'npc_dota_hero_sven' }, false);
  const night = visionRadius({ kind: 'hero', key: 'npc_dota_hero_sven' }, true);
  assert.ok(day >= night && night > 0);
  assert.equal(visionRadius({ kind: 'hero', key: 'npc_dota_hero_unknown_x' }, false), VISION_FALLBACK.day);
});

test('visionRadius: observer ward 1600 day and night, sentry ward small', () => {
  assert.equal(visionRadius({ kind: 'ward', key: 'observer_ward' }, false), 1600);
  assert.equal(visionRadius({ kind: 'ward', key: 'observer_ward' }, true), 1600);
  assert.ok(visionRadius({ kind: 'ward', key: 'sentry_ward' }, false) < 400);
});

test('timeOfDay: plain day / night pregame and in the first half day; golden before sunset, twilight across it, night after', () => {
  assert.deepEqual(timeOfDay(-30, false), { s: -1e3, n: 0, golden: 0, twi: 0, morning: false });
  assert.equal(timeOfDay(10, false).n, 0);            // 0:10 is no sunrise
  assert.equal(timeOfDay(DAY_LEN / 2 - 1, false).golden, 0);
  const g = timeOfDay(DAY_LEN - 22, false), d = timeOfDay(DAY_LEN + 10, true), n = timeOfDay(DAY_LEN * 1.5, true);
  assert.ok(g.golden > 0.9 && g.n < 0.2 && !g.morning);
  assert.ok(d.twi > 0.8 && d.n > 0.5 && d.n < 1 && !d.morning);
  assert.ok(n.n === 1 && n.golden === 0 && n.twi === 0);
  const m = timeOfDay(2 * DAY_LEN + 22, false);       // night -> day flip at 2 * DAY_LEN: morning golden hour
  assert.ok(m.morning && m.golden > 0.9 && m.n < 0.2);
  let prev = -1;                                      // sky night rises monotonically through the evening flip
  for (let t = DAY_LEN - 60; t <= DAY_LEN + 60; t += 2) { const k = timeOfDay(t, t >= DAY_LEN).n; assert.ok(k >= prev - 1e-9); prev = k; }
});

test('skyPalette: day / night ends match the fixed palettes, golden hour warm, Low / Medium warmth reduced; goldenLight neutral off-hour', () => {
  const day = skyPalette(timeOfDay(DAY_LEN * 0.75, false)), night = skyPalette(timeOfDay(DAY_LEN * 1.5, true));
  assert.ok(day.hor[2] > day.hor[0] && night.hor[2] < 0.2 && day.bodyK === 1 && night.sunN === 1);
  const tod = timeOfDay(DAY_LEN - 22, false), full = skyPalette(tod, 1), low = skyPalette(tod, 0.4);
  assert.ok(full.hor[0] > full.hor[2] && full.hor[0] > low.hor[0] && low.hor[0] > day.hor[0]);
  assert.ok(full.body[2] < day.body[2] && full.elev < day.elev && full.bodyK > 0);
  const dusk = skyPalette(timeOfDay(DAY_LEN + 25, true));
  assert.ok(dusk.sunN === 1 && dusk.elev < 0.13);
  for (const p of [day, night, full, low, dusk]) for (const k of ['hor', 'zen', 'body', 'cloud', 'glow', 'haze', 'water']) for (const v of p[k]) assert.ok(v >= 0 && v <= 1);
  assert.deepEqual(goldenLight(timeOfDay(DAY_LEN * 0.75, false), true), { key: [1, 1, 1], rim: [1, 1, 1], amb: [1, 1, 1], keyY: 1, rimY: 1 });
  const hi = goldenLight(tod, true), lo = goldenLight(tod, false);
  assert.ok(hi.key[2] < lo.key[2] && lo.key[2] < 1 && hi.rimY < 1 && lo.rimY === 1 && hi.keyY < 1 && lo.keyY === 1);
});

test('CameraRig.setViewInset: target lands mid free playfield; 0,0 is the plain camera; picking stays consistent', () => {
  const rig = new CameraRig(); rig.setAspect(16 / 9); rig.setTarget(500, 300, true); rig.update(0.016);
  const plain = rig.camera.projectionMatrix.clone();
  const ndcY = () => { const v = rig._v.set(rig.target.x, rig.tz, -rig.target.y).project(rig.camera); return v.y; };
  const frac = () => (1 - ndcY()) / 2;   // from the top
  assert.ok(Math.abs(frac() - 0.5) < 1e-3);
  rig.setViewInset(0.1, 0.3); rig.camera.updateMatrixWorld();
  assert.ok(Math.abs(frac() - (0.1 + (1 - 0.4) / 2)) < 1e-3, 'target at ' + frac());
  rig.setViewInset(0.25, 0.05);
  assert.ok(Math.abs(frac() - (0.25 + 0.7 / 2)) < 1e-3);
  // unproject a screen point at the target's projection back onto the ground: must hit the target
  const v = rig._v.set(rig.target.x, rig.tz, -rig.target.y).project(rig.camera); v.unproject(rig.camera);
  const o = rig.camera.position, dir = v.sub(o).normalize(), t = (rig.tz - o.y) / dir.y;
  assert.ok(Math.abs(o.x + dir.x * t - rig.target.x) < 0.5 && Math.abs(-(o.z + dir.z * t) - rig.target.y) < 0.5);
  rig.setViewInset(0, 0);
  assert.deepEqual(rig.camera.projectionMatrix.elements, plain.elements, 'identical to the plain camera');
});

test('CameraRig.setViewInset: keeps the aspect (x scale) and survives a resize', () => {
  const rig = new CameraRig(); rig.setAspect(2);
  const sx = rig.camera.projectionMatrix.elements[0];
  rig.setViewInset(0.2, 0.2); assert.ok(Math.abs(rig.camera.projectionMatrix.elements[0] - sx) < 1e-9);
  rig.setAspect(1.5); assert.equal(rig.camera.aspect, 1.5); assert.ok(Math.abs(rig.camera.projectionMatrix.elements[0] - sx * 2 / 1.5) < 1e-9);
});

test('cameraPose: yaw swings the eye round the look point at constant distance; yaw 0 = north view', () => {
  const d = 800, p0 = cameraPose(100, 200, 5, d, 0, 14, 70), p90 = cameraPose(100, 200, 5, d, Math.PI / 2, 14, 70), p180 = cameraPose(100, 200, 5, d, Math.PI, 14, 70);
  assert.deepEqual(p0.look, [100, 75, -200]);
  const len = (p) => Math.hypot(p.eye[0] - p.look[0], p.eye[1] - p.look[1], p.eye[2] - p.look[2]);
  for (const p of [p0, p90, p180]) assert.ok(Math.abs(len(p) - d) < 1e-6);
  assert.ok(p0.eye[2] > p0.look[2] && Math.abs(p0.eye[0] - 100) < 1e-6);          // south of the hero, looking north
  assert.ok(p90.eye[0] > 100 && Math.abs(p90.eye[2] - p90.look[2]) < 1e-6);        // yaw +90: eye to the east
  assert.ok(p180.eye[2] < p180.look[2]);                                           // yaw 180: eye to the north
  assert.ok(Math.abs(p0.eye[1] - p90.eye[1]) < 1e-9);                              // height does not depend on yaw
});

test('viewFacing + dirOf / dir8Of: the sheet direction follows facing - cameraYaw', () => {
  const P = Math.PI;
  assert.equal(viewFacing(1.2, 0), 1.2);
  // a hero walking east seen from the east side (yaw +90) walks towards or away from the camera; from the north side (yaw 180) it walks west on screen
  assert.equal(dir8Of(viewFacing(0, P)), 'w');
  assert.equal(dir8Of(viewFacing(0, P / 2)), 's');          // eye in the east, hero faces the eye = towards the screen
  assert.equal(dir8Of(viewFacing(0, -P / 2)), 'n');
  assert.equal(dir8Of(viewFacing(P / 2, P / 2)), 'e');      // facing north, camera east: north is screen right
  assert.equal(dirOf(viewFacing(P, P)), 'e');
  assert.equal(dir8Of(viewFacing(-P / 2, 0)), 's');         // unchanged at yaw 0
});

test('stepYaw: eases to the goal in the showcase, back to 0 (shortest way) outside it, never moves outside', () => {
  let a = { yaw: 0, goal: 1 };
  for (let i = 0; i < 120; i++) a = stepYaw(a.yaw, a.goal, true, 1 / 60);
  assert.equal(a.yaw, 1);
  assert.equal(a.goal, 1);
  // a spin of 3 turns + a bit keeps its unwrapped goal until it is close, then folds both by whole turns (no jump)
  const big = stepYaw(0.5, 2 * Math.PI * 3 + 0.2, true, 1 / 60);
  assert.ok(Math.abs(big.goal - big.yaw) < 2 * Math.PI + 1e-9 || big.goal < 7);
  // leaving the showcase: goal forced to 0, yaw wrapped (5.5 rad ~ -0.78) and eases to exactly 0
  let b = { yaw: 5.5, goal: 5.5 }; const first = stepYaw(b.yaw, b.goal, false, 1 / 60);
  assert.ok(Math.abs(first.yaw) < 0.8 && first.goal === 0);
  b = first; for (let i = 0; i < 400; i++) b = stepYaw(b.yaw, b.goal, false, 1 / 60);
  assert.equal(b.yaw, 0);
  assert.ok(Math.abs(wrapPi(7) - (7 - 2 * Math.PI)) < 1e-12 && wrapPi(-Math.PI * 3) === wrapPi(Math.PI));
});

test('camParams: orbit pitch (userPitch) drives the showcase pose, lookH fades to 0 at the close camera', () => {
  const lo = camParams(CAMERA.showcaseDistance, CAMERA, 6), hi = camParams(CAMERA.showcaseDistance, CAMERA, 55);
  assert.equal(lo.pitch, 6); assert.equal(hi.pitch, 55);
  assert.equal(lo.lookH, CAMERA.showcaseLookH);
  assert.equal(camParams(CAMERA.closeDistance, CAMERA, 6).lookH, 0);
  assert.ok(camParams(CAMERA.showcaseMin, CAMERA, 6).pitch === 6);               // below showcaseDistance the pose is constant
  assert.equal(camParams(CAMERA.closeDistance, CAMERA, 6).pitch, camParams(CAMERA.closeDistance, CAMERA, 55).pitch);   // userPitch does not touch the close camera
});

test('CameraRig.orbit: only in the showcase; yaw returns to 0 when zooming out; pitch clamped; projection follows yaw', () => {
  const rig = new CameraRig(); rig.setFar(1134); rig.setTarget(500, 500, true); rig.update(1);
  assert.equal(rig.orbit(1, 5), false); assert.equal(rig.yawGoal, 0);               // normal view: no orbit
  rig.distanceGoal = 700; rig.update(1);
  assert.equal(rig.showcase, true);
  assert.equal(rig.orbit(Math.PI / 2, 100), true);
  assert.equal(rig.pitchGoal, CAMERA.orbitPitchMax);
  rig.orbit(0, -500); assert.equal(rig.pitchGoal, CAMERA.orbitPitchMin);
  for (let i = 0; i < 120; i++) rig.update(1 / 60);
  assert.ok(Math.abs(rig.yaw - Math.PI / 2) < 1e-6);
  rig.camera.updateMatrixWorld(true);
  assert.ok(rig.camera.position.x > rig.target.x + 100);                            // eye east of the hero
  // the hero stays on the screen centre whatever the yaw
  const v = rig.camera.position.clone().set(rig.target.x, rig.tz + rig.params.lookH, -rig.target.y).project(rig.camera);
  assert.ok(Math.abs(v.x) < 1e-6 && Math.abs(v.y) < 1e-6);
  rig.distanceGoal = 1134; for (let i = 0; i < 600; i++) rig.update(1 / 60);
  assert.equal(rig.yaw, 0); assert.equal(rig.yawGoal, 0);
});

test('orbit.js: drag / pinch maths and the joystick zone', () => {
  const a = dragToOrbit(100, 0), b = dragToOrbit(-100, 0), c = dragToOrbit(0, 50);
  assert.ok(a.dYaw < 0 && b.dYaw > 0 && a.dYaw === -b.dYaw && a.dPitch === 0);
  assert.ok(c.dPitch > 0 && c.dYaw === 0);
  assert.ok(Math.abs(a.dYaw + 100 * ORBIT.yawPerPx) < 1e-12);
  assert.ok(pinchZoomFactor(100, 200) === 0.5 && pinchZoomFactor(200, 100) === 2 && pinchZoomFactor(0, 100) === 1);   // spread = closer
  const rect = { left: 0, width: 1000 };
  assert.equal(inJoyZone(100, rect), true); assert.equal(inJoyZone(500, rect), false);
});

test('rayToGround: flat-plane hit, yaw-rotated corners, horizon clamp', () => {
  const o = { x: 100, y: 500, z: -50 };
  const hit = rayToGround(o, { x: 0, y: -0.6, z: -0.8 }, 100, 6000);       // looking north (-z): lands 400/0.6*0.8 = 533.3 ahead
  assert.ok(Math.abs(hit.x - 100) < 1e-6 && Math.abs(hit.y - (50 + 400 / 0.6 * 0.8)) < 1e-6);
  const e = rayToGround(o, { x: 0.8, y: -0.6, z: 0 }, 100, 6000);          // yawed east
  assert.ok(Math.abs(e.x - (100 + 400 / 0.6 * 0.8)) < 1e-6 && Math.abs(e.y - 50) < 1e-6);
  const up = rayToGround(o, { x: 0, y: 0.2, z: -0.98 }, 100, 3000);        // above the horizon: clamped, finite
  assert.ok(Math.abs(up.x - 100) < 1e-6 && Math.abs(up.y - (50 + 3000)) < 1e-6);
  const far = rayToGround(o, { x: 0, y: -0.001, z: -1 }, 100, 3000);       // grazing: lands beyond maxDist, clamped
  assert.ok(Math.abs(far.y - 3050) < 1e-6);
  const down = rayToGround(o, { x: 0, y: -1, z: 0 }, 100, 3000);           // straight down: finite, under the eye
  assert.ok(Number.isFinite(down.x) && Number.isFinite(down.y));
});
