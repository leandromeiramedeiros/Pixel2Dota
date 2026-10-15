// Hero ragdoll (client/src/render/ragdoll.js): verlet skeleton on real voxel Lina joints, flat ground. Pure maths.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRagdoll, launchOf, rotQ, RAG_T, RAG_JOINTS, LAUNCH_MAX } from '../src/render/ragdoll.js';
import { VOX } from '../../shared/vox/index.js';
import { buildVoxFrames } from '../src/render/voxmesh.js';

const lina = VOX.lina.mod, SC = 4.2;
const geo = buildVoxFrames(lina.build, { stunned: [lina.ANIMS.stunned[0]] }, { cx: lina.META.cx, cy: lina.META.cy, jointsOf: lina.rigOf }).stunned[0];
const rest = {}; for (const k of Object.keys(geo.userData.joints)) rest[k] = geo.userData.joints[k].map(x => x * SC);
const run = (o) => { const r = createRagdoll(rest, { scale: SC, ...o }); for (let i = 0; i < 240; i++) r.advance(1 / 120); return r; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const hip = r => [(r.P[0][0] + r.P[1][0]) / 2, 0, (r.P[0][2] + r.P[1][2]) / 2];

test('ragdoll: segment transforms at rest are the identity', () => {
  const r = createRagdoll(rest, { scale: SC }), out = r.segments();
  for (let s = 0; s < 6; s++) {
    assert.ok(Math.abs(out[s * 8 + 3]) > 0.9999, `seg ${s} quat w`);
    assert.ok(Math.hypot(out[s * 8 + 4], out[s * 8 + 5], out[s * 8 + 6]) < 1e-3, `seg ${s} T`);
  }
});

test('ragdoll: limbs keep their lengths, nothing sinks, it settles by RAG_T and the body topples toward the tilt', () => {
  const r = run({ tilt: [1, 0] }), L = (a, b) => dist(rest[a], rest[b]);
  for (const [a, b] of [['neck', 'head'], ['shoulderR', 'handR'], ['hipL', 'ankleL'], ['hipR', 'shoulderL'], ['hipR', 'ankleR']]) {
    const i = RAG_JOINTS.indexOf(a), j = RAG_JOINTS.indexOf(b);
    assert.ok(Math.abs(dist(r.P[i], r.P[j]) - L(a, b)) < 0.06 * L(a, b), `${a}-${b} length`);
  }
  assert.ok(r.P.every(p => p[1] > -0.01), 'above ground');
  assert.ok(r.time >= RAG_T - 0.01 && r.speed() < 12, `settled (${r.speed().toFixed(1)} u/s)`);
  const head = r.P[RAG_JOINTS.indexOf('head')];
  assert.ok(head[0] > 60 && head[1] < 40, `head fell +x and lies low (${head.map(Math.round)})`);
});

test('ragdoll: launch distance is capped and follows the wind direction', () => {
  const far = run(launchOf({ dx: 1, dy: 0, mag: 5 })), near = run(launchOf({ dx: 1, dy: 0, mag: 0.3 })), plain = run(launchOf(null, [0, 1]));
  const dFar = hip(far)[0], dNear = hip(near)[0];
  assert.ok(dFar > 90 && dFar < 300, `hip travel at the cap ${dFar.toFixed(0)}`); assert.ok(dNear > 0 && dNear < dFar * 0.6, `weaker wind travels less (${dNear.toFixed(0)})`);
  assert.ok(Math.abs(hip(plain)[0]) < 60 && hip(plain)[2] < 60, 'plain collapse stays close');
  assert.deepEqual(launchOf({ dx: 0, dy: -1, mag: 9 }).vel[2] > 0, true, 'game -y is plane +z');
  assert.ok(launchOf({ dx: 1, dy: 0, mag: 99 }).vel[0] <= 230 * LAUNCH_MAX + 1e-6);
});

test('ragdoll: segment transforms move rest voxels with the joints (rod ends land on the particles)', () => {
  const r = run(launchOf({ dx: 0.6, dy: 0.8, mag: 1 })), out = r.segments();
  const at = (seg, v) => { const q = [out[seg * 8], out[seg * 8 + 1], out[seg * 8 + 2], out[seg * 8 + 3]], p = rotQ(q, v); return [p[0] + out[seg * 8 + 4], p[1] + out[seg * 8 + 5], p[2] + out[seg * 8 + 6]]; };
  const P = (n) => r.P[RAG_JOINTS.indexOf(n)];
  assert.ok(dist(at(0, rest.head), P('head')) < 1, 'head'); assert.ok(dist(at(2, rest.handR), P('handR')) < 1, 'armR hand');
  assert.ok(dist(at(5, rest.ankleL), P('ankleL')) < 1, 'legL ankle'); assert.ok(dist(at(1, rest.neck), P('neck')) < 1, 'torso neck');
  const run2 = run(launchOf({ dx: 0.6, dy: 0.8, mag: 1 })).segments();
  assert.deepEqual([...run2], [...out], 'deterministic');
});

test('ragdoll: the runtime import path of every hero model exposes rigOf (voxactors reads shared/vox/<short>.js)', async () => {
  const m = await import('../../shared/vox/lina.js');
  assert.equal(typeof m.rigOf, 'function');
});
