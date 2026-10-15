// Sanity check for the game mesher: meshes every ANIMS frame of voxel Lina (client/src/render/voxmesh.js, buildVoxFrames like voxactors.js) and prints
// voxel / triangle counts + bbox in model units. Asserts: compact layout (attribute set, int types, shared Uint16 index in range), feet at y = 0,
// face (eye voxels) on +z, CCW winding matches the decoded face normals, smooth normals ~unit, emit gains present, no NaN,
// GPU bytes < 3 MB for the hero. CI runs the same checks (+ team flag, tiers, voxel centres, footprint) in client/test/voxmesh.test.js.
import * as THREE from 'three';
import { buildLina, ANIMS, META } from './lina_vox.mjs';
import { buildVoxFrames, faceNormal } from '../../../client/src/render/voxmesh.js';

const fail = [], ok = (c, msg) => { if (!c) fail.push(msg); };
const ATTRS = 'aCol,aEmit,aFace,aHash,aSm,position', GAINS = new Set([0, 95, 100, 115, 150, 170]);
const EYE = new Set(['lash', 'irisD', 'iris', 'irisL', 'pupil', 'shine']), f = x => x.toFixed(1);
const t0 = performance.now(), frames = buildVoxFrames(buildLina, ANIMS, { cx: META.cx, cy: META.cy }), ms = performance.now() - t0;
const arrays = new Set(); let nf = 0, tsum = 0, ix0 = null;
for (const [anim, poses] of Object.entries(ANIMS)) poses.forEach((pose, i) => {
  const v = buildLina(pose), g = frames[anim][i], tag = `${anim}[${i}]`, u = g.userData.unit;
  let nv = 0, ez = 0, en = 0, az = 0;
  for (let z = 0; z < v.Z; z++) for (let y = 0; y < v.Y; y++) for (let x = 0; x < v.X; x++) {
    const m = v.g[v.i(x, y, z)]; if (!m) continue; nv++; az += META.cy - y - 0.5;
    if (EYE.has(v.mats[m].name)) { ez += META.cy - y - 0.5; en++; }
  }
  const P = g.attributes.position, F = g.attributes.aFace, S = g.attributes.aSm, E = g.attributes.aEmit, I = g.index, cnt = g.drawRange.count, tris = cnt / 3;
  const b = g.boundingBox.clone(); b.min.multiplyScalar(u); b.max.multiplyScalar(u);
  console.log(`${tag.padEnd(11)} voxels ${String(nv).padStart(5)}  tris ${String(tris).padStart(5)}  verts ${String(P.count).padStart(5)}  bbox x[${f(b.min.x)},${f(b.max.x)}] y[${f(b.min.y)},${f(b.max.y)}] z[${f(b.min.z)},${f(b.max.z)}]`);
  nf++; tsum += tris;
  for (const a of [...Object.values(g.attributes), I]) arrays.add(a.isInterleavedBufferAttribute ? a.data.array : a.array);
  ok(Object.keys(g.attributes).sort().join() === ATTRS, `${tag}: attributes ${Object.keys(g.attributes).sort()} != ${ATTRS}`);
  ok(P.data.array instanceof Int8Array || P.data.array instanceof Int16Array, `${tag}: position not Int8/Int16`);
  ok(S.data.array instanceof Int8Array && S.normalized && g.attributes.aCol.data.array instanceof Uint8Array && g.attributes.aCol.normalized, `${tag}: aSm / aCol types`);
  ok(I && (ix0 ??= I) === I, `${tag}: index missing or not shared`);
  ok(I.array instanceof (I.count / 6 * 4 <= 65536 ? Uint16Array : Uint32Array), `${tag}: index type ${I.array.constructor.name} for ${I.count / 6 * 4} shared verts`);
  ok(cnt === P.count / 4 * 6 && cnt <= I.count, `${tag}: drawRange ${cnt} vs ${P.count} verts`);
  for (let k = 0; k < cnt; k++) if (I.getX(k) >= P.count) { ok(false, `${tag}: index ${I.getX(k)} out of range`); break; }
  for (const k in g.attributes) { const a = g.attributes[k]; let bad = false; for (let j = 0; j < a.count && !bad; j++) for (let c = 0; c < a.itemSize; c++) if (!Number.isFinite(a.getComponent(j, c))) bad = true; ok(!bad, `${tag}: NaN/inf in ${k}`); }
  ok(Math.abs(b.min.y) < 1e-6, `${tag}: feet min y = ${b.min.y}`);
  ok(en > 0 && ez / en > az / nv, `${tag}: eyes not on +z (eye z ${f(ez / en)} vs body ${f(az / nv)})`);
  let lit = 0, emit = 0, odd = 0;
  for (let j = 0; j < E.count; j++) { const e = E.getX(j); if (!GAINS.has(e)) odd++; if (e) emit++; else lit++; }
  ok(!odd && emit > 0 && lit > 0, `${tag}: emit gains (${odd} unknown, ${emit} emit, ${lit} lit verts)`);
  const a = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3(), n = new THREE.Vector3(), fn = new THREE.Vector3(); let bad = 0, sm = 0;
  for (let t = 0; t < tris; t++) {
    const i0 = I.getX(t * 3), i1 = I.getX(t * 3 + 1), i2 = I.getX(t * 3 + 2);
    a.fromBufferAttribute(P, i0); c.fromBufferAttribute(P, i1).sub(a); d.fromBufferAttribute(P, i2).sub(a);
    n.crossVectors(c, d); if (n.dot(fn.fromArray(faceNormal(F.getX(i0)))) <= 0 || (F.getX(i1) & 15) !== (F.getX(i0) & 15) || (F.getX(i2) & 15) !== (F.getX(i0) & 15)) bad++;
  }
  for (let j = 0; j < S.count; j++) { const l = n.fromBufferAttribute(S, j).length(); if (l > 1e-6 && Math.abs(l - 1) > 0.02) sm++; }
  ok(bad === 0, `${tag}: ${bad} tris wound CW vs face normal`);
  ok(sm === 0, `${tag}: ${sm} smooth normals off unit length`);
});
const bytes = [...arrays].reduce((s, a) => s + a.byteLength, 0);
console.log(`frames ${nf}  build ${ms.toFixed(0)} ms  tris/frame ${Math.round(tsum / nf)}  GPU ${(bytes / 1048576).toFixed(2)} MB (${bytes} B)`);
ok(bytes < 3 * 1048576, `GPU bytes ${bytes} >= 3 MB`);
if (fail.length) { console.log('FAIL\n' + fail.join('\n')); process.exit(1); }
console.log('OK: all assertions passed');
