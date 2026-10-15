// Voxel -> mesh: turns a shared/vox Vox (see shared/vox/lina.js) into a compact indexed BufferGeometry for voxactors.js (12 B / vertex with Int8 positions):
//   position: Int8 (Int16 if the model is > 127 stored units from the foot) xyz in stored units (q per voxel: 1, or 2 if cx / cy are not whole), w = aFace
//   aFace:    bits 0-2 face id = model axis * 2 + (side > 0) (flat normal: x 0/1, y 2/3, z 4/5 for -/+), bit 3 team (mat.team: tinted per instance),
//             bits 4-5 quad corner k (0..3 = o, o+t1, o+t1+t2, o+t2): the shader rebuilds the voxel centre from position + aFace (voxel death, no extra attribute)
//   aSm:      Int8 normalized smoothed per-voxel normal (light + outline hull push); w = aHash, a per-voxel random Int8 (same on all its faces)
//   aCol:     Uint8 normalized albedo / emit colour, w = aEmit: 0 = lit, else emit gain * 100 (HDR flames keep their exact gain)
// One shared index buffer per buildVoxFrames call (quads all use the same 0,1,2,0,2,3 pattern; drawRange = this frame's quads).
// g.userData: unit = model units per stored unit (multiply into the instance scale), q = stored units per voxel, quads,
//   fp = voxel footprint in model units (voxels x opts.unit): { min:[x,y,z], max:[x,y,z], top, r } (r = max horizontal reach from the foot axis).
// Model space = buildings3d convention: origin at the feet centre, +y up, front (-y in voxel space) = +z toward the camera.
import * as THREE from 'three';
import { smoothNormal } from '../../../shared/vox/vox.js';

export const F_TEAM = 8, F_CORNER = 16;   // aFace bit fields (face id in bits 0-2)
// Emissive tiers (mats declare mat.tier; optional mat.gain fine-tunes inside the tier band): eyes / mouth <= 1, signature glow ~1.2, spell flames mildly HDR.
export const TIER_K = { eye: 1, signature: 1.2, spell: 1.6 };
const TIER_BAND = { eye: [0.5, 1], signature: [1, 1.35], spell: [1.35, 1.8] };
const LEGACY_TIER = { shine: ['eye', 0.95], f1: ['signature', 1], f2: ['signature', 1.15], f3: ['spell', 1.5], f4: ['spell', 1.7] };   // Lina's pre-tier names keep their exact gains

/** Emit gain of an emissive material: its tier (or the legacy name table), clamped to the tier band; untiered = 1. */
export function emitGain(mat) {
  const L = LEGACY_TIER[mat.name], tier = mat.tier || (L && L[0]); if (!TIER_K[tier]) return 1;
  const b = TIER_BAND[tier], g = mat.gain ?? (L && L[0] === tier ? L[1] : TIER_K[tier]);
  return Math.min(b[1], Math.max(b[0], g));
}

/** Default colour hook: lit mats -> light ramp step (ramp[2]) as albedo, emissive mats -> emit colour, tier gain. Colours are /255 floats. */
export function defaultColorOf(mat) {
  if (mat.emit) return { c: mat.rgb[0].map(x => x / 255), emit: true, gain: emitGain(mat) };
  return { c: mat.rgb[2].map(x => x / 255), emit: false };
}

/** Quad index buffer (corners o, o+t1, o+t1+t2, o+t2 -> 0,1,2 0,2,3: CCW seen from outside) for `quads` quads; Uint16 when it fits. */
export function quadIndex(quads) {
  const ix = new (quads * 4 > 65536 ? Uint32Array : Uint16Array)(quads * 6);
  for (let q = 0, i = 0; q < quads; q++, i += 6) { const b = q * 4; ix[i] = b; ix[i + 1] = b + 1; ix[i + 2] = b + 2; ix[i + 3] = b; ix[i + 4] = b + 2; ix[i + 5] = b + 3; }
  return new THREE.BufferAttribute(ix, 1);
}

/** Model-space flat normal of an aFace value (team / corner bits ignored). */
export function faceNormal(f) { f &= 7; const n = [0, 0, 0]; n[f >> 1] = f & 1 ? 1 : -1; return n; }

/** Voxel centre (stored units) of a vertex from its position p and aFace f; q = stored units per voxel. Mirrors voxCentre() in the voxactors.js shader. */
export function voxCentre(p, f, q) {
  const fid = f & 7, a = fid >> 1, s = fid & 1, k = (f >> 4) & 3, A = (a + 1) % 3, B = (a + 2) % 3, t1 = s ? A : B, t2 = s ? B : A, c = [p[0], p[1], p[2]];
  if (k === 1 || k === 2) c[t1] -= q;
  if (k === 2 || k === 3) c[t2] -= q;
  if (s) c[a] -= q;
  return c.map(x => x + q / 2);
}

const hash8 = (x, y, z) => { let h = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791); h = Math.imul(h ^ (h >>> 13), 0x5bd1e995); return ((h ^ (h >>> 15)) & 255) - 128; };

/**
 * meshVox(v, opts): one quad per exposed voxel face (neighbour cell empty), 4 verts + 6 indices, flat face normals, no merging.
 * opts: { cx, cy (voxel-space foot centre, default = grid centre: 17,15 for Lina), unit (model units per voxel, default 1: -> userData.unit / fp),
 *   colorOf(mat, v) -> { c:[r,g,b] (0..1, a lit colour > 1 clamps), emit:bool, gain (emit only, default 1) },
 *   ground (default true): shift the mesh so its lowest point is y = 0 (walk frames with both feet lifted would otherwise float),
 *   index: a quadIndex() to share (used if it holds this mesh's quads; false = none, the caller sets it) }. Model = ((vx - cx), vz, (cy - vy)) * unit, a proper rotation (det +1): voxel -y (front) -> +z.
 */
export function meshVox(v, opts = {}) {
  const { cx = v.X / 2, cy = v.Y / 2, unit = 1, colorOf = defaultColorOf, ground = true } = opts;
  const Q = Number.isInteger(cx) && Number.isInteger(cy) ? 1 : 2;   // stored units per voxel
  const pos = [], sm = [], col = [];
  const cc = v.mats.map((m) => {
    if (!m) return null;
    const { c, emit, gain = 1 } = colorOf(m, v), k = Math.max(1, c[0], c[1], c[2]);   // an HDR emit colour folds its excess into the gain
    return [...c.map(x => Math.round(Math.min(1, Math.max(0, x / (emit ? k : 1))) * 255)), emit ? Math.min(255, Math.max(1, Math.round(gain * k * 100))) : 0];
  });
  const tm = v.mats.map(m => (m && m.team ? F_TEAM : 0));
  const vn = [0, 0, 0];   // voxel-space neighbour offset of a model axis (a) direction (s)
  const nb = (a, s) => { vn[0] = vn[1] = vn[2] = 0; if (a === 0) vn[0] = s; else if (a === 1) vn[2] = s; else vn[1] = -s; return vn; };
  const lo = [0, 0, 0], t1 = [0, 0, 0], t2 = [0, 0, 0], o = [0, 0, 0], bmn = [Infinity, Infinity, Infinity], bmx = [-Infinity, -Infinity, -Infinity];
  let r2 = 0;
  for (let z = 0; z < v.Z; z++) for (let y = 0; y < v.Y; y++) for (let x = 0; x < v.X; x++) {
    const m = v.g[v.i(x, y, z)]; if (!m) continue;
    const c4 = cc[m];
    lo[0] = x - cx; lo[1] = z; lo[2] = cy - y - 1;   // model-space min corner of the cell (unit voxels)
    let s4 = null;
    for (let a = 0; a < 3; a++) for (const s of [-1, 1]) {
      const d = nb(a, s); if (v.get(x + d[0], y + d[1], z + d[2])) continue;
      // quad on the face of axis a, side s: t1 x t2 = +e_a for s > 0 (swapped for s < 0) -> CCW seen from outside
      const A = (a + 1) % 3, B = (a + 2) % 3;
      t1.fill(0); t2.fill(0);
      if (s > 0) { t1[A] = 1; t2[B] = 1; } else { t1[B] = 1; t2[A] = 1; }
      o[0] = lo[0]; o[1] = lo[1]; o[2] = lo[2]; if (s > 0) o[a] += 1;
      if (!s4) {   // first exposed face of this voxel: smooth normal + hash, footprint
        const q = smoothNormal(v, x, y, z); const w = [q[0], q[2], -q[1]], l = Math.hypot(w[0], w[1], w[2]);
        s4 = l > 1e-6 ? w.map(e => Math.round(e / l * 127)) : [0, 0, 0]; s4[3] = hash8(x, y, z);
        for (let i = 0; i < 3; i++) { bmn[i] = Math.min(bmn[i], lo[i]); bmx[i] = Math.max(bmx[i], lo[i] + 1); }
        r2 = Math.max(r2, (Math.abs(lo[0] + 0.5) + 0.5) ** 2 + (Math.abs(lo[2] + 0.5) + 0.5) ** 2);
      }
      const f = a * 2 + (s > 0 ? 1 : 0) + tm[m];
      for (let k = 0; k < 4; k++) {   // corners: o, o+t1, o+t1+t2, o+t2
        for (let i = 0; i < 3; i++) pos.push((o[i] + (k === 1 || k === 2 ? t1[i] : 0) + (k === 2 || k === 3 ? t2[i] : 0)) * Q);
        pos.push(f + k * F_CORNER); sm.push(s4[0], s4[1], s4[2], s4[3]); col.push(c4[0], c4[1], c4[2], c4[3]);
      }
    }
  }
  let mn = 0, mx = 0;
  if (ground && pos.length) { mn = Infinity; for (let i = 1; i < pos.length; i += 4) mn = Math.min(mn, pos[i]); if (mn) for (let i = 1; i < pos.length; i += 4) pos[i] -= mn; }
  for (let i = 0; i < pos.length; i++) if ((i & 3) !== 3) mx = Math.max(mx, Math.abs(pos[i]));
  const quads = pos.length / 16, g = new THREE.BufferGeometry();
  const P = new THREE.InterleavedBuffer(new (mx <= 127 ? Int8Array : Int16Array)(pos), 4);
  const S = new THREE.InterleavedBuffer(new Int8Array(sm), 4), C = new THREE.InterleavedBuffer(new Uint8Array(col), 4);
  g.setAttribute('position', new THREE.InterleavedBufferAttribute(P, 3, 0));
  g.setAttribute('aFace', new THREE.InterleavedBufferAttribute(P, 1, 3));
  g.setAttribute('aSm', new THREE.InterleavedBufferAttribute(S, 3, 0, true));
  g.setAttribute('aHash', new THREE.InterleavedBufferAttribute(S, 1, 3));
  g.setAttribute('aCol', new THREE.InterleavedBufferAttribute(C, 3, 0, true));
  g.setAttribute('aEmit', new THREE.InterleavedBufferAttribute(C, 1, 3));
  if (opts.index !== false) g.setIndex(opts.index && opts.index.count >= quads * 6 ? opts.index : quadIndex(quads));
  g.setDrawRange(0, quads * 6);
  const gy = mn / Q, u = quads ? unit : 0;   // ground shift in voxels; empty mesh -> zero footprint
  g.userData.unit = unit / Q; g.userData.q = Q; g.userData.quads = quads;
  g.userData.fp = { min: [bmn[0] * u, (bmn[1] - gy) * u, bmn[2] * u], max: [bmx[0] * u, (bmx[1] - gy) * u, bmx[2] * u], top: (bmx[1] - gy) * u, r: Math.sqrt(r2) * u };
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

/** build(pose) -> Vox; anims = { name: [pose, ...] } (e.g. ANIMS). Returns { name: [geometry, ...] }, one geometry per pose, all sharing one index buffer. */
export function buildVoxFrames(build, anims, opts = {}) {
  const out = {}, all = [];
  for (const k in anims) out[k] = anims[k].map((p) => { const g = meshVox(build(p), { ...opts, index: false }); all.push(g); return g; });
  const ix = quadIndex(all.reduce((m, g) => Math.max(m, g.userData.quads), 0));
  for (const g of all) g.setIndex(ix);   // drawRange already = own quads * 6
  return out;
}
