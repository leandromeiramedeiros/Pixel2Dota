// Voxel mesher checks (client/src/render/voxmesh.js): every pose frame of every shared/vox model in the game, plus a synthetic model for the
// team flag, emissive tiers, the voxel centre (corner bits) and the footprint. Offline stats / standalone run: tools/art/heroes/lina_vox_mesh_check.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Vox } from '../../shared/vox/vox.js';
import * as LINA from '../../shared/vox/lina.js';
import { meshVox, buildVoxFrames, faceNormal, voxCentre, emitGain, F_TEAM, F_CORNER, TIER_K } from '../src/render/voxmesh.js';

const MODELS = [{ name: 'lina', build: LINA.build || LINA.buildLina, anims: LINA.ANIMS, cx: 17, cy: 15, eyes: true }];
const EYE = /^(lash|iris|pupil|shine|eye)/;

/** Brute-force footprint of a Vox (model units, unit 1, grounded) for comparison with userData.fp. */
function footOf(v, cx, cy) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; let r = 0;
  for (let z = 0; z < v.Z; z++) for (let y = 0; y < v.Y; y++) for (let x = 0; x < v.X; x++) if (v.get(x, y, z)) {
    const lo = [x - cx, z, cy - y - 1];
    for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], lo[i]); mx[i] = Math.max(mx[i], lo[i] + 1); }
    r = Math.max(r, Math.hypot(Math.abs(lo[0] + 0.5) + 0.5, Math.abs(lo[2] + 0.5) + 0.5));
  }
  return { mn, mx, top: mx[1] - mn[1], r };
}

/** Layout checks shared by every geometry: attribute set + types, index, winding vs decoded face, corner order, voxel centres, no NaN. */
function checkLayout(g, tag) {
  const keys = Object.keys(g.attributes).sort().join();
  assert.equal(keys, 'aCol,aEmit,aFace,aHash,aSm,position', `${tag}: attributes`);
  const P = g.attributes.position, F = g.attributes.aFace, S = g.attributes.aSm, I = g.index, q = g.userData.q, cnt = g.drawRange.count;
  assert.ok(P.data.array instanceof Int8Array || P.data.array instanceof Int16Array, `${tag}: position Int8/Int16`);
  assert.ok(S.data.array instanceof Int8Array && S.normalized && g.attributes.aCol.data.array instanceof Uint8Array && g.attributes.aCol.normalized, `${tag}: aSm / aCol types`);
  assert.equal(P.data.stride * P.data.array.BYTES_PER_ELEMENT + 8, P.data.array instanceof Int8Array ? 12 : 16, `${tag}: bytes / vertex`);
  assert.equal(cnt, P.count / 4 * 6, `${tag}: drawRange`);
  const a = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3(), n = new THREE.Vector3(), fn = new THREE.Vector3();
  let bad = 0, sm = 0, corner = 0, cen = 0, hash = 0;
  for (let t = 0; t < cnt / 3; t++) {
    const i0 = I.getX(t * 3), i1 = I.getX(t * 3 + 1), i2 = I.getX(t * 3 + 2);
    assert.ok(i0 < P.count && i1 < P.count && i2 < P.count, `${tag}: index out of range`);
    a.fromBufferAttribute(P, i0); c.fromBufferAttribute(P, i1).sub(a); d.fromBufferAttribute(P, i2).sub(a);
    n.crossVectors(c, d); if (n.dot(fn.fromArray(faceNormal(F.getX(i0)))) <= 0 || (F.getX(i1) & 15) !== (F.getX(i0) & 15) || (F.getX(i2) & 15) !== (F.getX(i0) & 15)) bad++;
  }
  for (let j = 0; j < P.count; j++) {
    const f = F.getX(j); if ((f & 7) > 5 || f >> 4 !== (j & 3)) corner++;
    const p = [P.getX(j), P.getY(j), P.getZ(j)], ce = voxCentre(p, f, q), q0 = j & ~3;
    // all 4 verts of a quad share one centre, half a voxel from each face plane, every corner sqrt(3)/2 voxel away
    const c0 = voxCentre([P.getX(q0), P.getY(q0), P.getZ(q0)], F.getX(q0), q);
    if (ce.some((x, i) => Math.abs(x - c0[i]) > 1e-6) || Math.abs(Math.hypot(p[0] - ce[0], p[1] - ce[1], p[2] - ce[2]) - q * Math.sqrt(3) / 2) > 1e-6) cen++;
    if (S.data.array[j * 4 + 3] !== S.data.array[q0 * 4 + 3]) hash++;
    const l = n.fromBufferAttribute(S, j).length(); if (l > 1e-6 && Math.abs(l - 1) > 0.02) sm++;
    for (const k in g.attributes) { const at = g.attributes[k]; for (let e = 0; e < at.itemSize; e++) assert.ok(Number.isFinite(at.getComponent(j, e)), `${tag}: NaN in ${k}`); }
  }
  assert.equal(bad, 0, `${tag}: tris wound CW vs face normal`);
  assert.equal(corner, 0, `${tag}: face id / corner bits`);
  assert.equal(cen, 0, `${tag}: voxel centres from corner bits`);
  assert.equal(hash, 0, `${tag}: hash differs within a quad`);
  assert.equal(sm, 0, `${tag}: smooth normals off unit length`);
}

for (const M of MODELS) test(`voxmesh: ${M.name} every pose frame`, () => {
  const frames = buildVoxFrames(M.build, M.anims, { cx: M.cx, cy: M.cy }), arrays = new Set(); let ix0 = null;
  for (const [anim, poses] of Object.entries(M.anims)) poses.forEach((pose, i) => {
    const v = M.build(pose), g = frames[anim][i], tag = `${M.name} ${anim}[${i}]`, u = g.userData.unit;
    checkLayout(g, tag);
    assert.ok(g.index && (ix0 ??= g.index) === g.index, `${tag}: index not shared`);
    for (const k in g.attributes) arrays.add(g.attributes[k].data.array);
    const b = g.boundingBox.clone(); b.min.multiplyScalar(u); b.max.multiplyScalar(u);
    assert.ok(Math.abs(b.min.y) < 1e-6, `${tag}: feet at y = 0 (${b.min.y})`);
    // footprint = brute force over the voxels = mesh bbox
    const fp = g.userData.fp, bf = footOf(v, M.cx, M.cy);
    assert.equal(fp.top, bf.top, `${tag}: fp.top`); assert.ok(Math.abs(fp.r - bf.r) < 1e-9, `${tag}: fp.r`);
    assert.ok(Math.abs(fp.top - b.max.y) < 1e-6 && Math.abs(fp.min[0] - b.min.x) < 1e-6 && Math.abs(fp.max[2] - b.max.z) < 1e-6, `${tag}: fp vs bbox`);
    // face toward +z (front), raised hand on +x, emissive + lit present
    let ez = 0, en = 0, az = 0, nv = 0;
    for (let z = 0; z < v.Z; z++) for (let y = 0; y < v.Y; y++) for (let x = 0; x < v.X; x++) { const m = v.get(x, y, z); if (!m) continue; nv++; az += M.cy - y - 0.5; if (EYE.test(v.mats[m].name)) { ez += M.cy - y - 0.5; en++; } }
    if (M.eyes) assert.ok(en > 0 && ez / en > az / nv, `${tag}: eyes not on +z`);
    if (M.name === 'lina' && (!pose.arm || pose.arm === 'raise')) assert.ok(b.max.x > -b.min.x, `${tag}: raised hand not on +x`);
    const E = g.attributes.aEmit; let lit = 0, emit = 0, odd = 0;
    for (let j = 0; j < E.count; j++) { const e = E.getX(j); if (e) { emit++; if (e < 50 || e > 180) odd++; } else lit++; }
    assert.ok(!odd && emit > 0 && lit > 0, `${tag}: emit gains (${odd} out of band, ${emit} emit, ${lit} lit)`);
  });
  const bytes = [...arrays].reduce((s, a) => s + a.byteLength, 0) + ix0.array.byteLength;
  assert.ok(bytes < 3 * 1048576, `${M.name}: GPU bytes ${bytes} >= 3 MB`);
});

test('voxmesh: emissive tiers (+ legacy Lina names) and team flag', () => {
  assert.equal(emitGain({ name: 'x', tier: 'eye' }), TIER_K.eye);
  assert.equal(emitGain({ name: 'x', tier: 'signature' }), TIER_K.signature);
  assert.equal(emitGain({ name: 'x', tier: 'spell' }), TIER_K.spell);
  assert.equal(emitGain({ name: 'x', tier: 'eye', gain: 3 }), 1);           // gain clamped into the tier band
  assert.equal(emitGain({ name: 'x' }), 1);                                 // untiered
  assert.equal(emitGain({ name: 'f4' }), 1.7); assert.equal(emitGain({ name: 'shine' }), 0.95);   // legacy names keep their gains
  assert.equal(emitGain({ name: 'f3', tier: 'spell' }), 1.5);               // ... also once the model declares the same tier

  const v = new Vox(6, 6, 6);
  const body = v.mat('body', { ramp: ['#202020', '#404040', '#808080', '#c0c0c0'] }), trim = v.mat('trim', { ramp: ['#202020', '#404040', '#a0a0a0', '#e0e0e0'], team: true });
  const fire = v.mat('fire', { emit: '#ff8020', tier: 'spell' }), eye = v.mat('eyeL', { emit: '#ffffff', tier: 'eye' }), sig = v.mat('glow', { emit: '#40a0ff', tier: 'signature', gain: 1.3 });
  for (let z = 0; z < 3; z++) for (let y = 2; y < 4; y++) for (let x = 2; x < 4; x++) v.set(x, y, z, body);
  v.set(2, 2, 3, trim); v.set(3, 2, 3, fire); v.set(2, 3, 3, eye); v.set(3, 3, 3, sig); v.set(2, 1, 1, trim);
  const g = meshVox(v, { cx: 3, cy: 3, unit: 2 });
  checkLayout(g, 'synthetic');
  const P = g.attributes.position, F = g.attributes.aFace, C = g.attributes.aCol, E = g.attributes.aEmit, q = g.userData.q;
  const gains = new Set(), cells = new Map();
  for (let j = 0; j < P.count; j++) {
    const ce = voxCentre([P.getX(j), P.getY(j), P.getZ(j)], F.getX(j), q).map(x => x / q);
    const vx = Math.floor(ce[0] + 3), vz = Math.floor(ce[1]), vy = Math.floor(3 - ce[2]);   // model -> voxel cell (ground shift 0: body from z 0)
    const m = v.get(vx, vy, vz); assert.ok(m, `vertex ${j}: centre ${ce} not in a filled voxel`);
    assert.equal(!!(F.getX(j) & F_TEAM), m === trim, `vertex ${j}: team bit vs mat ${v.mats[m].name}`);
    if (E.getX(j)) gains.add(`${v.mats[m].name}:${E.getX(j)}`);
    cells.set(`${vx},${vy},${vz}`, (cells.get(`${vx},${vy},${vz}`) || 0) + 1);
    assert.ok(F.getX(j) < 4 * F_CORNER, 'aFace fits 6 bits');
    if (m === trim) assert.ok(Math.abs(C.getX(j) - 0xa0 / 255) < 1e-6, 'team voxels keep their ramp albedo (tinted in the shader)');
  }
  assert.deepEqual([...gains].sort(), ['eyeL:100', 'fire:160', 'glow:130']);
  assert.equal(cells.size, 2 * 2 * 3 + 5, 'every filled voxel has faces');
  const fp = g.userData.fp;
  assert.deepEqual(fp.min, [-2, 0, -2]); assert.deepEqual(fp.max, [2, 8, 4]); assert.equal(fp.top, 8);   // unit 2: trim at (2,1,1) sticks out to +z
  assert.ok(Math.abs(fp.r - 2 * Math.hypot(1, 2)) < 1e-9, 'fp.r');
});
