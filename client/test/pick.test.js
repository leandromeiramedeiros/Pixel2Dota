import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickAt, bodyBox, cylinderBox, MIN_HW, MIN_HH, TOUCH_MIN_HW, TOUCH_MIN_HH } from '../src/render/pick.js';

// fake game camera: 60 deg top-down-ish, k css px per world unit, depth w grows with game y (north = away from the camera)
const K = 0.1, PITCH = 60 * Math.PI / 180;
const project = (x, y, z) => ({ sx: 500 + x * K, sy: 400 - (y * Math.sin(PITCH) + z * Math.cos(PITCH)) * K, w: 1000 + y, k: K });
const unit = (id, x, y, o = {}) => ({ id, building: false, ...cylinderBox(project, x, y, 0, o.r || 30, o.h || 120), ...o.extra });
const ids = (cands, x, y) => { const r = pickAt(cands, x, y); return r.unit ? r.unit.id : null; };

test('cylinderBox: foot, head, half-width follow the projection', () => {
  const b = cylinderBox(project, 0, 0, 0, 30, 120);
  assert.ok(b.x1 - b.x0 >= 2 * MIN_HW && b.y1 - b.y0 >= 2 * MIN_HH);
  assert.ok(Math.abs((b.x0 + b.x1) / 2 - 500) < 1e-9);
  assert.equal(b.w, 1000);
  assert.equal(cylinderBox(() => null, 0, 0, 0, 1, 1), null);   // behind the camera
});

test('3 overlapping creeps at equal depth: the one the cursor is nearest the centre of wins', () => {
  // equal w (same y), x spaced less than a box width apart
  const mk = (id, x) => ({ id, building: false, x0: x - 12, x1: x + 12, y0: 300, y1: 340, w: 1000 });
  const cs = [mk('b', 520), mk('a', 500), mk('c', 540)];
  assert.equal(ids(cs, 498, 320), 'a');
  assert.equal(ids(cs, 523, 320), 'b');
  assert.equal(ids(cs, 541, 320), 'c');
  assert.equal(ids(cs.slice().reverse(), 523, 320), 'b');   // list order never decides
  assert.equal(ids(cs, 400, 320), null);
});

test('tower behind a creep: creep wins in the overlap, tower wins on the rest of its body', () => {
  const tower = { id: 'tw', building: true, x0: 460, x1: 540, y0: 200, y1: 330, w: 1100 };
  const creep = { id: 'cr', building: false, x0: 490, x1: 510, y0: 290, y1: 330, w: 900 };
  assert.equal(ids([tower, creep], 500, 310), 'cr');
  assert.equal(ids([creep, tower], 500, 310), 'cr');
  // the creep wins even when the cursor is nearer the tower's centre and the tower is the nearer one to the camera
  assert.equal(ids([{ ...tower, w: 800 }, creep], 500, 265), 'tw');
  assert.equal(ids([{ ...tower, w: 800 }, creep], 500, 300), 'cr');
  assert.equal(ids([tower, creep], 470, 230), 'tw');
  assert.equal(ids([tower, creep], 480, 320), 'tw');
});

test('dead units are not candidates (actors.js addPick): the creep behind is reachable', () => {
  // the picks list only ever holds live units; a dying creep in front adds nothing
  const behind = unit('live', 0, 0);
  assert.equal(ids([behind], 500, behind.y0 + 10), 'live');
  assert.equal(pickAt([], 500, 300).unit, null);
});

test('tiny far unit gets the minimum box (css px), touch gets a bigger one', () => {
  const far = cylinderBox(project, 0, 0, 0, 1, 2);   // 0.1 css px wide
  assert.equal(far.x1 - far.x0, 2 * MIN_HW);
  assert.equal(far.y1 - far.y0, 2 * MIN_HH);
  const fat = cylinderBox(project, 0, 0, 0, 1, 2, { touch: true });
  assert.equal(fat.x1 - fat.x0, 2 * TOUCH_MIN_HW);
  assert.equal(fat.y1 - fat.y0, 2 * TOUCH_MIN_HH);
  assert.equal(ids([{ id: 'far', building: false, ...far }], 500 + MIN_HW - 1, (far.y0 + far.y1) / 2), 'far');
  assert.equal(ids([{ id: 'far', building: false, ...far }], 500 + MIN_HW + 1, (far.y0 + far.y1) / 2), null);
  // a body already larger than the minimum is not changed
  const big = bodyBox(0, 100, 0, 0, 40);
  assert.equal(big.x1 - big.x0, 80);
});

test('deterministic tie-break: score, then nearest to the camera, then id; independent of list order', () => {
  const mk = (id, w) => ({ id, building: false, x0: 490, x1: 510, y0: 300, y1: 340, w });
  const same = [mk('b', 1000), mk('a', 1000), mk('c', 1000)];
  assert.equal(ids(same, 500, 320), 'a');                              // identical boxes + depth: smallest id
  assert.equal(ids(same.slice().reverse(), 500, 320), 'a');
  const depth = [mk('a', 1200), mk('b', 1000), mk('c', 1100)];
  assert.equal(ids(depth, 500, 320), 'b');                              // identical boxes: nearest to the camera
  // sub-1/1000-box differences in the score do not decide: depth does
  const eps = [{ ...mk('x', 900), x0: 490, x1: 510.00001 }, mk('y', 800)];
  assert.equal(ids(eps, 500, 320), 'y');
  for (let i = 0; i < 20; i++) assert.equal(ids(same.sort(() => Math.random() - 0.5), 500, 320), 'a');
});

test('trees only when no unit is hit', () => {
  const tree = { tree: 7 };
  const u = { id: 'u', building: false, x0: 0, x1: 20, y0: 0, y1: 20, w: 1 };
  assert.equal(pickAt([u], 10, 10, () => tree).tree, null);
  assert.equal(pickAt([u], 10, 10, () => tree).unit.id, 'u');
  const r = pickAt([u], 100, 100, () => tree);
  assert.equal(r.unit, null); assert.equal(r.tree, tree);
});

test('lean moves the head up the screen along the tilt', () => {
  const up = cylinderBox(project, 0, 0, 0, 20, 1000);
  const lean = cylinderBox(project, 0, 0, 0, 20, 1000, { lean: { dx: 0, dy: 1, th: 0.5 } });
  assert.ok(lean.y0 !== up.y0 && lean.y1 === up.y1 && Math.abs(lean.y0 - up.y0) > 5);
});
