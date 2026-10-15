// glb loader for the reference renderer: Source2Viewer-CLI glTF exports -> world-space triangle primitives, skinned at the first frame of
// the exported animation (or the bind pose). Y-up metres in the file, converted here to Source Z-up units, model facing +X. Morph targets, lights, cameras are ignored.
import fs from 'node:fs';
import path from 'node:path';
import { decodePng } from './pngdec.mjs';

const INCH = 1 / 0.0254;   // Source2Viewer exports metres; Source units are inches
const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const NORM = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };
const GET = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' };

export function loadGlb(file) {
  const d = fs.readFileSync(file), jl = d.readUInt32LE(12), json = JSON.parse(d.toString('utf8', 20, 20 + jl));
  return { json, bin: d.subarray(20 + jl + 8), dir: path.dirname(file) };
}

/** Accessor -> Float32Array (normalised ints scaled to 0..1) or the raw int array for plain ints; `n` components per element. */
export function accessor(g, i) {
  const memo = g.memo || (g.memo = new Map());
  if (!memo.has(i)) memo.set(i, readAccessor(g, i));
  return memo.get(i);
}
function readAccessor(g, i) {
  const a = g.json.accessors[i], bv = g.json.bufferViews[a.bufferView], n = NCOMP[a.type], T = COMP[a.componentType];
  const off = (bv.byteOffset || 0) + (a.byteOffset || 0), esz = T.BYTES_PER_ELEMENT, stride = bv.byteStride || n * esz;
  const out = new (a.componentType === 5126 || a.normalized ? Float32Array : T)(a.count * n);
  const dv = new DataView(g.bin.buffer, g.bin.byteOffset, g.bin.byteLength), get = GET[a.componentType], k = a.normalized ? 1 / NORM[a.componentType] : 1;
  for (let e = 0; e < a.count; e++) for (let c = 0; c < n; c++) {
    const v = dv[get](off + e * stride + c * esz, true);
    out[e * n + c] = a.normalized ? Math.max(-1, v * k) : v;
  }
  return { data: out, n, count: a.count };
}

// ---- 4x4 column-major matrices (glTF layout)
const I4 = () => Float64Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
function mul(a, b) {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; }
  return o;
}
function trs(t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = q, m = I4();
  m[0] = (1 - 2 * (y * y + z * z)) * s[0]; m[1] = 2 * (x * y + z * w) * s[0]; m[2] = 2 * (x * z - y * w) * s[0];
  m[4] = 2 * (x * y - z * w) * s[1]; m[5] = (1 - 2 * (x * x + z * z)) * s[1]; m[6] = 2 * (y * z + x * w) * s[1];
  m[8] = 2 * (x * z + y * w) * s[2]; m[9] = 2 * (y * z - x * w) * s[2]; m[10] = (1 - 2 * (x * x + y * y)) * s[2];
  m[12] = t[0]; m[13] = t[1]; m[14] = t[2];
  return m;
}

/** Duration (s) of animation `anim` (latest key time of any sampler). */
export function animDuration(g, anim) {
  const an = g.json.animations?.[anim]; let d = 0;
  if (an) for (const s of an.samplers) { const t = accessor(g, s.input).data; d = Math.max(d, t[t.length - 1] || 0); }
  return d;
}
/** Value of a channel at time t (clamped; linear, quaternions nlerp, STEP held). */
function sampleChannel(g, an, ch, t) {
  const s = an.samplers[ch.sampler], inp = accessor(g, s.input).data, out = accessor(g, s.output).data, n = ch.target.path === 'rotation' ? 4 : 3;
  const cubic = s.interpolation === 'CUBICSPLINE', at = k => cubic ? (3 * k + 1) * n : k * n, last = inp.length - 1;
  let lo = 0, hi = last;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (inp[m] <= t) lo = m; else hi = m; }
  if (t <= inp[0] || last === 0) return Array.from(out.subarray(at(0), at(0) + n));
  if (t >= inp[last]) return Array.from(out.subarray(at(last), at(last) + n));
  const a = Array.from(out.subarray(at(lo), at(lo) + n)), b = Array.from(out.subarray(at(lo + 1), at(lo + 1) + n)), f = s.interpolation === 'STEP' ? 0 : (t - inp[lo]) / (inp[lo + 1] - inp[lo]);
  if (n === 4) { const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3], sg = d < 0 ? -1 : 1, r = a.map((v, k) => v + (sg * b[k] - v) * f), l = Math.hypot(...r) || 1; return r.map(v => v / l); }
  return a.map((v, k) => v + (b[k] - v) * f);
}

/** World matrix of every node; `anim` = animation index sampled at time t seconds (null = bind pose). */
function worldMatrices(g, anim, t = 0) {
  const nodes = g.json.nodes, over = nodes.map(() => ({}));
  const an = anim == null ? null : g.json.animations?.[anim];
  if (an) for (const ch of an.channels) over[ch.target.node][ch.target.path] = sampleChannel(g, an, ch, t);
  const local = nodes.map((nd, i) => nd.matrix && !over[i].translation && !over[i].rotation && !over[i].scale ? Float64Array.from(nd.matrix)
    : trs(over[i].translation || nd.translation, over[i].rotation || nd.rotation, over[i].scale || nd.scale));
  const parent = nodes.map(() => -1); nodes.forEach((nd, i) => (nd.children || []).forEach(c => { parent[c] = i; }));
  const world = new Array(nodes.length);
  const get = i => world[i] || (world[i] = parent[i] < 0 ? local[i] : mul(get(parent[i]), local[i]));
  nodes.forEach((_, i) => get(i));
  return world;
}

const texCache = new Map();
function loadTex(dir, uri) {
  const f = path.join(dir, decodeURIComponent(uri));
  if (!texCache.has(f)) texCache.set(f, fs.existsSync(f) ? decodePng(fs.readFileSync(f)) : null);
  return texCache.get(f);
}

/**
 * Primitives of a glb in world space, skinned at time `t` of animation `anim` (or the bind pose).
 * `boneWorld` (Map jointName -> 4x4, optional) drives joints of the same name (wearables follow the hero skeleton).
 * Returns { prims: [{ pos, nrm, uv, idx, mesh, mat: { name, tex, factor, mask, cutoff } }], bones: Map name -> world matrix }.
 * Only lod0 meshes are kept when the file has them.
 */
export function scene(g, { anim = null, t = 0, boneWorld = null } = {}) {
  const J = g.json, world = worldMatrices(g, anim, t), prims = [], bones = new Map();
  J.nodes.forEach((nd, i) => bones.set(nd.name, world[i]));
  const lod0 = J.nodes.some(nd => nd.mesh != null && /lod0/i.test(J.meshes[nd.mesh].name || nd.name || ''));
  J.nodes.forEach((nd, ni) => {
    if (nd.mesh == null) return;
    const mesh = J.meshes[nd.mesh];
    if (lod0 && !/lod0/i.test(mesh.name || nd.name || '')) return;
    let jm = null;   // per-joint skin matrices
    if (nd.skin != null) {
      const sk = J.skins[nd.skin], ibm = accessor(g, sk.inverseBindMatrices).data;
      jm = sk.joints.map((j, k) => mul(boneWorld?.get(J.nodes[j].name) || world[j], Float64Array.from(ibm.subarray(k * 16, k * 16 + 16))));
    }
    for (const pr of mesh.primitives) {
      if (pr.mode != null && pr.mode !== 4) continue;
      const P = accessor(g, pr.attributes.POSITION).data, N = pr.attributes.NORMAL != null ? accessor(g, pr.attributes.NORMAL).data : null;
      const UV = pr.attributes.TEXCOORD_0 != null ? accessor(g, pr.attributes.TEXCOORD_0).data : null;
      const nv = P.length / 3, pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3);
      const JW = jm ? accessor(g, pr.attributes.JOINTS_0) : null, WT = jm ? accessor(g, pr.attributes.WEIGHTS_0).data : null;
      for (let v = 0; v < nv; v++) {
        const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2], nx = N ? N[v * 3] : 0, ny = N ? N[v * 3 + 1] : 0, nz = N ? N[v * 3 + 2] : 0;
        let px = 0, py = 0, pz = 0, qx = 0, qy = 0, qz = 0;
        const apply = (m, w) => {
          px += w * (m[0] * x + m[4] * y + m[8] * z + m[12]); py += w * (m[1] * x + m[5] * y + m[9] * z + m[13]); pz += w * (m[2] * x + m[6] * y + m[10] * z + m[14]);
          qx += w * (m[0] * nx + m[4] * ny + m[8] * nz); qy += w * (m[1] * nx + m[5] * ny + m[9] * nz); qz += w * (m[2] * nx + m[6] * ny + m[10] * nz);
        };
        if (jm) { let ws = 0; for (let k = 0; k < 4; k++) { const w = WT[v * 4 + k]; if (w > 0) { apply(jm[JW.data[v * 4 + k]], w); ws += w; } } if (ws === 0) apply(world[ni], 1); }
        else apply(world[ni], 1);
        pos[v * 3] = pz * INCH; pos[v * 3 + 1] = px * INCH; pos[v * 3 + 2] = py * INCH;   // glTF (Y up, metres) -> Source (Z up, game units), the model faces +X
        const l = Math.hypot(qx, qy, qz) || 1; nrm[v * 3] = qz / l; nrm[v * 3 + 1] = qx / l; nrm[v * 3 + 2] = qy / l;
      }
      const idx = pr.indices != null ? Uint32Array.from(accessor(g, pr.indices).data) : Uint32Array.from({ length: nv }, (_, i) => i);
      const m = pr.material != null ? J.materials[pr.material] : {}, bc = m.pbrMetallicRoughness?.baseColorTexture;
      const uri = bc != null ? J.images[J.textures[bc.index].source].uri : null;
      prims.push({ pos, nrm: N ? nrm : null, uv: UV, idx, mesh: mesh.name || '', mat: {
        name: m.name || 'mat', tex: uri ? loadTex(g.dir, uri) : null, factor: m.pbrMetallicRoughness?.baseColorFactor || [1, 1, 1, 1],
        mask: m.alphaMode === 'MASK' || m.alphaMode === 'BLEND', cutoff: m.alphaCutoff ?? 0.5 } });
    }
  });
  return { prims, bones };
}
