// Touch controls, part 2: rangefinder near-plane clipping, attack drag aim, last hit, wheel reorder, HUD inset (pure logic, no DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TEAM, KIND, ST } from '../../shared/protocol.js';
import { CameraRig } from '../src/render/camera.js';
import {
  makeDepthFn, clipSegmentNear, clipPolyNear, normalizeOrder, swapOrder, loadWheelOrder, saveWheelOrder, wheelKey, nearestIndex, hudInset,
} from '../src/ui/targeting.js';
import { T, pickDragTarget, pickLastHit, heroDamage, arcLayout } from '../src/ui/touch.js';

const unit = (o) => Object.assign({ id: 'u', kind: KIND.CREEP, team: TEAM.DIRE, x: 0, y: 0, hp: 100, maxHp: 100, status: 0, respawn: 0 }, o);
const vis = () => true;

// ---------------------------------------------------------------------------------------------- rangefinder clipping
test('clipSegmentNear / clipPolyNear: linear depth, behind the near plane is cut', () => {
  const depth = (x) => x;                       // depth grows with x
  assert.deepEqual(clipSegmentNear([5, 0], [9, 0], depth, 2), [[5, 0], [9, 0]]);
  assert.equal(clipSegmentNear([-4, 0], [1, 5], depth, 2), null);
  const s = clipSegmentNear([-2, 0], [6, 8], depth, 2);                // crosses x = 2 at t = .5
  assert.deepEqual(s, [[2, 4], [6, 8]]);
  const s2 = clipSegmentNear([6, 8], [-2, 0], depth, 2);               // order kept
  assert.deepEqual(s2, [[6, 8], [2, 4]]);
  const sq = clipPolyNear([[0, 0], [4, 0], [4, 4], [0, 4]], depth, 2);   // square x 0..4 cut at x = 2
  assert.equal(sq.length, 4);
  assert.ok(sq.every((p) => p[0] >= 2 - 1e-9));
  assert.equal(clipPolyNear([[0, 0], [1, 0], [1, 1]], depth, 2).length, 0);
});

test('rangefinder: hero behind the camera (aim across the river) is clipped, never mirrored to the far side', () => {
  const rig = new CameraRig(); rig.setAspect(16 / 9); rig.setTarget(-3000, -3000, true); rig.update(0.016);
  const hero = [-7128, -7032], aim = [-3000, -3000];
  const depth = makeDepthFn(rig.camera, rig.tz), near = rig.camera.near * 2;
  assert.ok(depth(hero[0], hero[1]) < 0, 'the hero is behind the camera');
  assert.ok(depth(aim[0], aim[1]) > 0);
  const naive = new THREE.Vector3(hero[0], rig.tz, -hero[1]).project(rig.camera);
  const seg = clipSegmentNear(hero, aim, depth, near);
  assert.ok(seg, 'the part in front of the camera survives');
  assert.ok(depth(seg[0][0], seg[0][1]) >= near - 1e-6, 'the line now starts in front of the camera');
  const a = new THREE.Vector3(seg[0][0], rig.tz, -seg[0][1]).project(rig.camera), b = new THREE.Vector3(seg[1][0], rig.tz, -seg[1][1]).project(rig.camera);
  assert.ok(a.y < b.y, 'start lies toward the hero (south = bottom of the screen) of the aim point');
  assert.ok(Number.isFinite(a.x) && Math.abs(a.x) < 1e6);
  assert.ok(naive.y > 0 || naive.x !== a.x, 'sanity: the unclipped projection is the broken one');
  // a hero in front of the camera is untouched
  const front = [-3000, -3300];
  assert.deepEqual(clipSegmentNear(front, aim, depth, near), [front, aim]);
});

test('rangefinder: a circle around a hero behind the camera keeps only the visible arc (all points in front)', () => {
  const rig = new CameraRig(); rig.setAspect(16 / 9); rig.setTarget(0, 0, true); rig.update(0.016);
  const depth = makeDepthFn(rig.camera, rig.tz), near = rig.camera.near * 2;
  const cx = 0, cy = -1500, r = 900, pts = [];
  for (let k = 0; k < 64; k++) { const a = (k / 64) * Math.PI * 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  assert.ok(pts.some((p) => depth(p[0], p[1]) < near), 'part of the ring is behind the near plane');
  const out = clipPolyNear(pts, depth, near);
  assert.ok(out.length >= 3 && out.every((p) => depth(p[0], p[1]) >= near - 1e-6));
});

// ---------------------------------------------------------------------------------------------- attack drag aim
test('pickDragTarget: closest enemy to the aim point, heroes win ties; reach = attack range + 300', () => {
  const hero = { x: 0, y: 0, atkRange: 150 };
  const units = [
    unit({ id: 'c1', x: 300, y: 0 }),
    unit({ id: 'h1', kind: KIND.HERO, x: 380, y: 60 }),
    unit({ id: 'c2', x: 0, y: 380 }),
    unit({ id: 'ally', team: TEAM.RADIANT, x: 310, y: 0 }),
    unit({ id: 'far', x: 700, y: 0 }),
  ];
  assert.equal(pickDragTarget(units, hero, 340, 30, TEAM.RADIANT, vis), 'h1', 'hero 50 away beats the creep 41 away (bias)');
  assert.equal(pickDragTarget(units, hero, 0, 330, TEAM.RADIANT, vis), 'c2');
  assert.equal(pickDragTarget(units, hero, 700, 0, TEAM.RADIANT, vis) !== 'far', true, 'out of reach is never picked');
  assert.equal(pickDragTarget(units.filter((u) => u.id === 'ally'), hero, 310, 0, TEAM.RADIANT, vis), null, 'allies are not attack targets');
  assert.equal(pickDragTarget([unit({ id: 'fog', x: 300 })], hero, 300, 0, TEAM.RADIANT, () => false), null);
  assert.equal(pickDragTarget([unit({ id: 'inv', x: 300, status: ST.INVULN })], hero, 300, 0, TEAM.RADIANT, vis), null);
});

test('pickDragTarget: nothing near the aim point falls back to the enemy nearest the drag direction (cone)', () => {
  const hero = { x: 0, y: 0, atkRange: 400 };
  const units = [unit({ id: 'e', x: 650, y: 80 }), unit({ id: 'n', x: 0, y: 600 })];
  // aim point (the drag clamp) 100 units from nobody within snap, but the direction points at 'e'
  assert.equal(pickDragTarget(units, hero, 100, 0, TEAM.RADIANT, vis, { snap: 60 }), 'e');
  assert.equal(pickDragTarget(units, hero, 0, 100, TEAM.RADIANT, vis, { snap: 60 }), 'n');
  assert.equal(pickDragTarget(units, hero, -100, 0, TEAM.RADIANT, vis, { snap: 60 }), null, 'opposite direction: no one');
  assert.ok(T.ATK_CONE > 0 && T.ATK_SNAP > 0);
});

// ---------------------------------------------------------------------------------------------- last hit
test('pickLastHit: killable enemy creep first (lowest hp), then deny, then the weakest creep, then a structure', () => {
  const hero = { x: 0, y: 0, atkRange: 150, dmgMin: 50, dmgMax: 60, dmgBonus: 10 };
  assert.equal(heroDamage(hero), 65);
  const units = [
    unit({ id: 'full', x: 100, hp: 300, maxHp: 300 }),
    unit({ id: 'low', x: 200, hp: 60 }),
    unit({ id: 'lower', x: 250, hp: 30 }),
    unit({ id: 'denyme', team: TEAM.RADIANT, x: 90, hp: 20 }),
    unit({ id: 'tower', kind: KIND.TOWER, x: 150, hp: 500 }),
  ];
  assert.equal(pickLastHit(units, hero, TEAM.RADIANT, vis), 'lower');
  assert.equal(pickLastHit(units.filter((u) => u.id !== 'lower' && u.id !== 'low'), hero, TEAM.RADIANT, vis), 'denyme', 'no enemy kill: deny the hurt ally');
  assert.equal(pickLastHit(units.filter((u) => u.id === 'full' || u.id === 'tower'), hero, TEAM.RADIANT, vis), 'full', 'nothing killable: the weakest enemy creep');
  assert.equal(pickLastHit(units.filter((u) => u.id === 'tower'), hero, TEAM.RADIANT, vis), 'tower', 'only a structure: the structure');
  assert.equal(pickLastHit([unit({ id: 'far', x: 900 })], hero, TEAM.RADIANT, vis), null);
  assert.equal(pickLastHit([unit({ id: 'healthyally', team: TEAM.RADIANT, x: 90, hp: 90 })], hero, TEAM.RADIANT, vis), null, 'healthy allies are not denied');
  assert.equal(pickLastHit([unit({ id: 'fog', x: 100, hp: 10 })], hero, TEAM.RADIANT, () => false), null);
});

// ---------------------------------------------------------------------------------------------- reorder
test('normalizeOrder / swapOrder: only valid permutations survive', () => {
  assert.deepEqual(normalizeOrder(null, 4), [0, 1, 2, 3]);
  assert.deepEqual(normalizeOrder([2, 0, 1, 3], 4), [2, 0, 1, 3]);
  assert.deepEqual(normalizeOrder([0, 0, 1, 3], 4), [0, 1, 2, 3], 'duplicates');
  assert.deepEqual(normalizeOrder([0, 1, 2], 4), [0, 1, 2, 3], 'wrong length');
  assert.deepEqual(normalizeOrder([0, 1, 2, 9], 4), [0, 1, 2, 3], 'out of range');
  assert.deepEqual(normalizeOrder(['a', 1, 2, 3], 4), [0, 1, 2, 3]);
  const o = [0, 1, 2, 3];
  assert.deepEqual(swapOrder(o, 0, 3), [3, 1, 2, 0]);
  assert.deepEqual(o, [0, 1, 2, 3], 'does not mutate');
  assert.deepEqual(swapOrder(o, 1, 1), o);
  assert.deepEqual(swapOrder(o, 1, 9), o);
});

test('wheel order persists per hero in storage and survives broken storage', () => {
  const mem = new Map();
  const st = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  assert.deepEqual(loadWheelOrder(st, 'invoker', 6), [0, 1, 2, 3, 4, 5]);
  assert.equal(saveWheelOrder(st, 'invoker', [1, 0, 2, 3, 4, 5]), true);
  assert.deepEqual(loadWheelOrder(st, 'invoker', 6), [1, 0, 2, 3, 4, 5]);
  assert.deepEqual(loadWheelOrder(st, 'sven', 4), [0, 1, 2, 3], 'other heroes untouched');
  assert.deepEqual(loadWheelOrder(st, 'invoker', 4), [0, 1, 2, 3], 'ability count changed: back to default');
  saveWheelOrder(st, 'invoker', [0, 1, 2, 3, 4, 5]);
  assert.equal(mem.has(wheelKey('invoker')), false, 'identity is not stored');
  mem.set(wheelKey('sven'), '{not json');
  assert.deepEqual(loadWheelOrder(st, 'sven', 4), [0, 1, 2, 3]);
  const boom = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.deepEqual(loadWheelOrder(boom, 'x', 3), [0, 1, 2]);
  assert.equal(saveWheelOrder(boom, 'x', [1, 0, 2]), false);
  assert.deepEqual(loadWheelOrder(null, 'x', 3), [0, 1, 2]);
});

test('wheel reorder: a swap moves only positions (slot -> polar via the order)', () => {
  const slots = arcLayout(4);
  const order = swapOrder([0, 1, 2, 3], 0, 2);                       // slot 0 and slot 2 trade places
  const polarOf = (slot) => slots[order.indexOf(slot)];
  assert.deepEqual(polarOf(0), slots[2]);
  assert.deepEqual(polarOf(2), slots[0]);
  assert.deepEqual(polarOf(1), slots[1]);
  assert.deepEqual(polarOf(3), slots[3]);
});

test('nearestIndex: closest point within the radius', () => {
  const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }];
  assert.equal(nearestIndex(pts, 90, 10, 50), 1);
  assert.equal(nearestIndex(pts, 500, 0, 50), -1);
  assert.equal(nearestIndex([], 0, 0, 50), -1);
});

// ---------------------------------------------------------------------------------------------- camera HUD inset
test('hudInset: fractions of the screen height covered at the top / bottom', () => {
  assert.deepEqual(hudInset(39, 312, 390), { top: 0.1, bottom: 0.2 });
  assert.deepEqual(hudInset(0, null, 390), { top: 0, bottom: 0 });
  assert.deepEqual(hudInset(40, 390, 390), { top: 40 / 390, bottom: 0 }, 'a panel that starts at the bottom edge covers nothing');
  assert.deepEqual(hudInset(10, 10, 0), { top: 0, bottom: 0 });
  assert.deepEqual(hudInset(900, 0, 390), { top: 0.2, bottom: 0.35 }, 'capped: a huge rect never frames the hero at the screen bottom');
});

test('touch camera starts at the furthest distance (director: 1450)', () => {
  assert.equal(T.ZOOM_START, 1450);
  assert.equal(T.ZOOM_START, T.ZOOM_FAR);
});
