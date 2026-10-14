// Pure render-module tests (no WebGL): atlas packing / animation key resolution, camera params, light selection, terrain geometry, fog LOS.
import test from 'node:test';
import assert from 'node:assert/strict';
import { shelfPack, nextPow2, resolveKey, indexSheet } from '../src/art/atlas.js';
import { camParams, visibleHeight } from '../src/render/camera.js';
import { selectLights } from '../src/render/lights.js';
import { castVision, visionRadius, VISION_FALLBACK } from '../src/render/fog.js';
import { buildChunk, hash2, CHUNK } from '../src/render/terrainGeo.js';
import { dirOf, dir8Of } from '../src/render/actors.js';
import { getMap, TT } from '../../shared/map.js';
import { CAMERA } from '../../shared/constants.js';

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
