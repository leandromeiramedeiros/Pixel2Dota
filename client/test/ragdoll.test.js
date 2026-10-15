// Hero ragdoll (client/src/render/ragdoll.js): verlet skeleton on real voxel Lina joints, flat ground. Pure maths.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRagdoll, launchOf, rotQ, RAG_T, RAG_JOINTS, LAUNCH_MAX } from '../src/render/ragdoll.js';
import { KIND, launchAt, windAt, dmgStrength, BOOST, strikeLaunch, strongerLaunch } from '../src/render/wind.js';
import { VOX } from '../../shared/vox/index.js';
import { buildVoxFrames } from '../src/render/voxmesh.js';

const lina = VOX.lina.mod, SC = 4.2;
const geo = buildVoxFrames(lina.build, { stunned: [lina.ANIMS.stunned[0]] }, { cx: lina.META.cx, cy: lina.META.cy, jointsOf: lina.rigOf }).stunned[0];
const rest = {}; for (const k of Object.keys(geo.userData.joints)) rest[k] = geo.userData.joints[k].map(x => x * SC);
const run = (o, n = 240, each) => { const r = createRagdoll(rest, { scale: SC, ...o }); for (let i = 0; i < n; i++) { r.advance(1 / 120); if (each) each(r); } return r; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const J = (r, n) => r.P[RAG_JOINTS.indexOf(n)];
const hip = r => [(r.P[0][0] + r.P[1][0]) / 2, (r.P[0][1] + r.P[1][1]) / 2, (r.P[0][2] + r.P[1][2]) / 2];
const strike = (d, crit) => launchOf(strikeLaunch(d, crit, 100, 0, 0, 0));   // victim +x of the attacker
const peak = (o) => { let y = 0; const r = run(o, 240, (q) => { y = Math.max(y, hip(q)[1]); }); return { r, y }; };

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
    assert.ok(Math.abs(dist(J(r, a), J(r, b)) - L(a, b)) < 0.06 * L(a, b), `${a}-${b} length`);
  }
  assert.ok(r.P.every(p => p[1] > -0.01), 'above ground');
  assert.ok(r.time >= RAG_T - 0.01 && r.speed() < 12, `settled (${r.speed().toFixed(1)} u/s)`);
  const head = J(r, 'head');
  assert.ok(head[0] > 45 && head[1] < 40, `head fell +x and lies low (${head.map(Math.round)})`);
});

test('ragdoll: a stronger finishing strike flies farther and higher, tumbles, still lands and settles by RAG_T; the cap holds', () => {
  const weak = peak(strike(60)), normal = peak(strike(150)), crit = peak(strike(300, true)), max = peak(strike(2000, true));
  const x = (p) => hip(p.r)[0];
  assert.ok(x(weak) > 0 && x(weak) < 80, `a weak last hit is a short knock (${x(weak).toFixed(0)})`);
  assert.ok(x(weak) < x(normal) && x(normal) < x(crit) && x(crit) < x(max), `farther with power ${[weak, normal, crit, max].map(x).map(Math.round)}`);
  assert.ok(weak.y <= normal.y + 1 && normal.y < crit.y && crit.y < max.y, `higher with power ${[weak, normal, crit, max].map(p => Math.round(p.y))}`);
  assert.ok(x(max) > 300 && max.y > 100, `a max strike sends the hero flying (${x(max).toFixed(0)} u, peak ${max.y.toFixed(0)})`);
  for (const p of [weak, normal, crit, max]) {
    assert.ok(p.r.speed() < 12, `settled (${p.r.speed().toFixed(1)} u/s)`);
    assert.ok(p.r.P.every(q => q[1] > -0.01), 'landed on the ground, not under it');
  }
  // tumble: the torso turns well past lying flat during a max launch (head over heels), only topples for a weak one
  const rot = (o) => { let m = 0; run(o, 240, (r) => { const h = hip(r), n = J(r, 'neck'), u = [n[0] - h[0], n[1] - h[1], n[2] - h[2]]; m = Math.max(m, Math.acos(u[1] / Math.hypot(...u)) * 180 / Math.PI); }); return m; };
  assert.ok(rot(strike(2000, true)) > 130, 'max strike tumbles');
  assert.deepEqual(launchOf({ dx: 1, dy: 0, mag: 99 }), launchOf({ dx: 1, dy: 0, mag: LAUNCH_MAX }), 'LAUNCH_MAX caps the strength');
  assert.ok(launchOf({ dx: 0, dy: -1, mag: 1 }).vel[2] > 0, 'game -y is plane +z');
  assert.ok(Math.abs(hip(run(launchOf(null, [0, 1])))[0]) < 60, 'plain collapse stays close');
});

test('ragdoll: limbs move relative to the torso (lag, whip), the hands more than the body', () => {
  const up = (r) => { const h = hip(r), n = J(r, 'neck'); return [n[0] - h[0], n[1] - h[1], n[2] - h[2]]; };
  const ang = (r, a, b) => { const u = up(r), A = J(r, a), B = J(r, b), d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]]; return Math.acos((d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) / Math.hypot(...d) / Math.hypot(...u)) * 180 / Math.PI; };
  const a0 = ang(createRagdoll(rest, { scale: SC }), 'shoulderR', 'handR'), l0 = ang(createRagdoll(rest, { scale: SC }), 'hipR', 'ankleR');
  let arm = 0, leg = 0;
  run(strike(300, true), 120, (r) => { arm = Math.max(arm, Math.abs(ang(r, 'shoulderR', 'handR') - a0)); leg = Math.max(leg, Math.abs(ang(r, 'hipR', 'ankleR') - l0)); });
  assert.ok(arm > 45 && leg > 30, `limbs swing in their sockets (arm ${arm.toFixed(0)} deg, leg ${leg.toFixed(0)} deg)`);
});

test('ragdoll: the launch is the stronger of wind and strike; a pull gust launches the body toward the pull centre', () => {
  const G = (o) => ({ x: 0, y: 0, dx: 1, dy: 0, len: 0, radius: 600, strength: 0.8, kind: KIND.BURST, pull: 0, life: 4, age: 0, key: 'k', src: 'a', ...o });
  const pull = launchAt([G({ pull: 1 })], 300, 0), push = launchAt([G()], 300, 0);
  const pr = run(launchOf(pull)), ps = run(launchOf(push));
  assert.ok(hip(pr)[0] < -20, `pull drags the hero toward the centre (-x): ${hip(pr)[0].toFixed(0)}`);
  assert.ok(hip(ps)[0] > 20, `push throws it away (+x): ${hip(ps)[0].toFixed(0)}`);
  const s = strikeLaunch(150, false, 0, 100, 0, 0);   // attacker below: knock +y
  assert.ok(Math.abs(s.mag - dmgStrength(150)) < 1e-9 && Math.abs(strikeLaunch(150, true, 0, 1, 0, 0).mag - dmgStrength(150) * BOOST) < 1e-9, 'same damage curve, crit boost');
  assert.equal(strongerLaunch(pull, s), pull.mag > s.mag ? pull : s); assert.equal(strongerLaunch(null, s), s); assert.equal(strongerLaunch(null, null), null);
  assert.equal(strikeLaunch(0, false, 1, 0, 0, 0), null, 'no damage, no strike');
});

test('ragdoll: live wind pushes a downed body away from a push gust and drags it toward a pull gust (also mid-air)', () => {
  const A = new Float32Array(4), B = new Float32Array(4), C = new Float32Array(4);
  const field = (pull) => (x, z, t) => {   // a burst centred 300 u to the -x of the body, arriving at t = 1 s (the body already lies there)
    if (t < 1) return [0, 0];
    A.set([-300, 0, 700, 0.8]); B.set([1, 0, KIND.BURST, 0]); C.set([t, pull, 0, 0]);
    return windAt(A, B, C, 1, x, z).map(v => v * 60);   // debris scale (voxactors.js WIND_K)
  };
  const base = hip(run({ tilt: [0, 1] }))[0], pushed = hip(run({ tilt: [0, 1], wind: field(0) }))[0], pulled = hip(run({ tilt: [0, 1], wind: field(1) }))[0];
  assert.ok(pushed > base + 15, `push shoves it away (${base.toFixed(0)} -> ${pushed.toFixed(0)})`);
  assert.ok(pulled < base - 15, `pull drags it in (${base.toFixed(0)} -> ${pulled.toFixed(0)})`);
  // mid-air: a body launched +x by a strike is dragged back by a pull toward -x
  const fly = launchOf({ dx: 1, dy: 0, mag: 1 }), air = (t) => (t < 0.6 ? [-120, 0] : [0, 0]);
  assert.ok(hip(run({ ...fly, wind: air }))[0] < hip(run(fly))[0] - 20, 'pull drags a flying body back');
});

test('ragdoll: a cliff face stops the body instead of lifting it onto the cliff', () => {
  const cliff = (x) => (x > 150 ? 220 : 0);
  const r = run({ ...launchOf({ dx: 1, dy: 0, mag: LAUNCH_MAX }), ground: (x) => cliff(x) });
  assert.ok(r.P.every(p => p[1] < 200), `stays below the cliff top (${Math.max(...r.P.map(p => p[1])).toFixed(0)})`);
  assert.ok(hip(r)[0] < 160, `stopped at the cliff (${hip(r)[0].toFixed(0)})`);
});

test('ragdoll: segment transforms move rest voxels with the joints (rod ends land on the particles)', () => {
  const r = run(launchOf({ dx: 0.6, dy: 0.8, mag: 1 })), out = r.segments();
  const at = (seg, v) => { const q = [out[seg * 8], out[seg * 8 + 1], out[seg * 8 + 2], out[seg * 8 + 3]], p = rotQ(q, v); return [p[0] + out[seg * 8 + 4], p[1] + out[seg * 8 + 5], p[2] + out[seg * 8 + 6]]; };
  assert.ok(dist(at(0, rest.head), J(r, 'head')) < 1, 'head'); assert.ok(dist(at(2, rest.handR), J(r, 'handR')) < 1, 'armR hand');
  assert.ok(dist(at(5, rest.ankleL), J(r, 'ankleL')) < 1, 'legL ankle'); assert.ok(dist(at(1, rest.neck), J(r, 'neck')) < 1, 'torso neck');
  const run2 = run(launchOf({ dx: 0.6, dy: 0.8, mag: 1 })).segments();
  assert.deepEqual([...run2], [...out], 'deterministic');
});

test('ragdoll: the runtime import path of every hero model exposes rigOf (voxactors reads shared/vox/<short>.js)', async () => {
  const m = await import('../../shared/vox/lina.js');
  assert.equal(typeof m.rigOf, 'function');
});
