// Order path preview + touch edge pan: pure helpers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { trimPath, densify, pathAlpha, PATH, PATH_COL } from '../src/ui/orderpath.js';
import { edgePanDir } from '../src/ui/touch.js';
import { ORDER } from '../../shared/protocol.js';

test('order path colours: move green, attack red', () => {
  assert.equal(PATH_COL[ORDER.MOVE], '93,255,122');
  assert.equal(PATH_COL[ORDER.ATTACK], '255,106,88');
  assert.equal(PATH_COL[ORDER.STOP], undefined, 'stop draws nothing');
});

test('trimPath drops the waypoints the walker is already past', () => {
  const pts = [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 500 }];
  assert.equal(trimPath(pts, -100, 0), pts, 'not started: unchanged');
  assert.deepEqual(trimPath(pts, 300, 0), pts.slice(1), 'past the first corner start');
  assert.deepEqual(trimPath(pts, 500, 300), pts.slice(2), 'round the second corner');
  assert.equal(trimPath(pts, 500, 480).length, 1, 'the end is always kept');
});

test('densify: samples no more than `step` apart, endpoints kept', () => {
  const out = densify([{ x: 0, y: 0 }, { x: 300, y: 0 }], 64);
  assert.deepEqual(out[0], { x: 0, y: 0 }); assert.deepEqual(out[out.length - 1], { x: 300, y: 0 });
  for (let i = 1; i < out.length; i++) assert.ok(out[i].x - out[i - 1].x <= 75 + 1e-9);
  assert.equal(densify([{ x: 1, y: 1 }]).length, 1);
});

test('pathAlpha: solid, then a FADE ms fade, gone at LIFE', () => {
  assert.equal(pathAlpha(0), 1);
  assert.equal(pathAlpha(PATH.LIFE - PATH.FADE), 1);
  assert.equal(pathAlpha(PATH.LIFE - PATH.FADE / 2), 0.5);
  assert.equal(pathAlpha(PATH.LIFE), 0);
});

test('edgePanDir: zero in the middle, ramps to +-1 at the edges, corners pan diagonally', () => {
  assert.deepEqual(edgePanDir(400, 200, 800, 400, 50), { x: 0, y: 0 });
  assert.deepEqual(edgePanDir(0, 200, 800, 400, 50), { x: -1, y: 0 });
  assert.deepEqual(edgePanDir(800, 200, 800, 400, 50), { x: 1, y: 0 });
  assert.equal(edgePanDir(775, 200, 800, 400, 50).x, 0.5);
  assert.deepEqual(edgePanDir(0, 400, 800, 400, 50), { x: -1, y: 1 }, 'bottom-left corner');
  assert.deepEqual(edgePanDir(-30, -30, 800, 400, 50), { x: -1, y: -1 }, 'off-screen clamps');
});
