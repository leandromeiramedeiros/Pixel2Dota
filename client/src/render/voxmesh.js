// Voxel -> mesh: turns a shared/vox Vox (see shared/vox/lina.js) into a compact indexed BufferGeometry for voxactors.js (12 B / vertex with Int8 positions):
//   position: Int8 (Int16 if the model is > 127 stored units from the foot) xyz in stored units (q per voxel: 1, or 2 if cx / cy are not whole), w = aFace
//   aFace:    bits 0-2 face id = model axis * 2 + (side > 0) (flat normal: x 0/1, y 2/3, z 4/5 for -/+), bit 3 team (mat.team: tinted per instance),
//             bits 4-5 quad corner k (0..3 = o, o+t1, o+t1+t2, o+t2): the shader rebuilds the voxel centre from position + aFace (voxel death, no extra attribute)
//   aSm:      Int8 normalized smoothed per-voxel normal (light + outline hull push); w = aHash = (segment << 5 | hash5) - 128: hash5 is a per-voxel random 0..31 and segment (0..7, SEG) the ragdoll body the voxel belongs to (opts.joints; else 0), both the same on all its faces
//   aCol:     Uint8 normalized albedo / emit colour, w = aEmit: 0 = lit, else emit gain * 100 (HDR flames keep their exact gain)
// One shared index buffer per buildVoxFrames call (quads all use the same 0,1,2,0,2,3 pattern; drawRange = this frame's quads).
// g.userData: unit = model units per stored unit (multiply into the instance scale), q = stored units per voxel, quads,
//   fp = voxel footprint in model units (voxels x opts.unit): { min:[x,y,z], max:[x,y,z], top, r } (r = max horizontal reach from the foot axis).
//   joints = opts.joints (rig J, voxel coords) in model units (feet-centred, ground-shifted) for the ragdoll rest pose; null when the model has no rig.
// Model space = buildings3d convention: origin at the feet centre, +y up, front (-y in voxel space) = +z toward the camera.
import * as THREE from 'three';
import { Vox, smoothNormal } from '../../../shared/vox/vox.js';

export const F_TEAM = 8, F_CORNER = 16;   // aFace bit fields (face id in bits 0-2)
// Emissive tiers = starting gains (mats declare mat.tier): eyes / mouth <= 1, signature glow ~1.2, spell flames mildly HDR. A model may set its own
// mat.gain per part (Invoker's orbs, Rubick's staff tip): free inside EMIT_RANGE, the global cap that keeps bloom from whiting out.
export const TIER_K = { eye: 1, signature: 1.2, spell: 1.6 };
export const EMIT_RANGE = [0.5, 1.8];
const LEGACY_TIER = { shine: ['eye', 0.95], f1: ['signature', 1], f2: ['signature', 1.15], f3: ['spell', 1.5], f4: ['spell', 1.7] };   // Lina's tuned gains

/** Emit gain of an emissive material: mat.gain, else Lina's tuned value, else its tier's default (untiered = 1); clamped to EMIT_RANGE. */
export function emitGain(mat) {
  const L = LEGACY_TIER[mat.name], tier = mat.tier || (L && L[0]);
  const g = mat.gain ?? (L && L[0] === tier ? L[1] : TIER_K[tier] ?? 1);
  return Math.min(EMIT_RANGE[1], Math.max(EMIT_RANGE[0], g));
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

const hash5 = (x, y, z) => { let h = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791); h = Math.imul(h ^ (h >>> 13), 0x5bd1e995); return (h ^ (h >>> 15)) & 31; };

// Ragdoll segments of a biped: each voxel goes to the nearest bone capsule by distance / radius (radius ~ the limb's thickness, so a skirt or a ponytail
// lands on the torso / head, not on the thigh beside it). Radii are per joint (lerped along each bone): the head capsule is thin at the neck so it does
// not swallow the shoulders, the foot end is wide and runs on to a toe point so whole boots go with the leg. A voxel inside a limb capsule (d <= 1)
// belongs to that limb even when a fat torso / head capsule scores lower. Ids are the aHash bits 5-7 and the ragdoll's body order.
export const SEG = { head: 0, torso: 1, armR: 2, armL: 3, legR: 4, legL: 5 };
const TOE = 3.5;   // voxels: the toe point ahead of the foot joint (bipeds face -y)
const BONES = [   // [segment, joint chain, radius (voxels) per joint, first bone index that claims what is inside it (boots)]
  [0, ['neck', 'head'], [9.6, 9.6]], [1, ['hips', 'neck'], [7.5, 7.5]],
  [2, ['shoulderR', 'elbowR', 'handR'], [2.4, 2.4, 2.4]], [3, ['shoulderL', 'elbowL', 'handL'], [2.4, 2.4, 2.4]],
  [4, ['hipR', 'kneeR', 'ankleR', 'footR', 'toeR'], [2.4, 2.4, 2.4, 3.2, 3], 2], [5, ['hipL', 'kneeL', 'ankleL', 'footL', 'toeL'], [2.4, 2.4, 2.4, 3.2, 3], 2],
];
const jointOf = (J, n) => J[n] || (n[0] === 't' && J['foot' + n[3]] ? [J['foot' + n[3]][0], J['foot' + n[3]][1] - TOE, J['foot' + n[3]][2]] : null);
/** Segment (SEG id) of the voxel point p (voxel coords, cell centre) for a biped's joints J (shared/vox/rig.js solve()). The head only takes voxels
 *  above the neck plane (perpendicular to hips -> neck), so the big chibi head capsule leaves the shoulders, sleeves and the hair down the back to the torso. */
export function segmentOf(J, p) {
  const up = [J.neck[0] - J.hips[0], J.neck[1] - J.hips[1], J.neck[2] - J.hips[2]], ul = Math.hypot(up[0], up[1], up[2]) || 1;
  const above = ((p[0] - J.neck[0]) * up[0] + (p[1] - J.neck[1]) * up[1] + (p[2] - J.neck[2]) * up[2]) / ul > -0.5;
  let best = 1, bd = Infinity, own = -1, od = 1;
  for (const [id, chain, rad, claim] of BONES) {
    if (id === 0 && !above) continue;
    for (let i = 0; i + 1 < chain.length; i++) {
      const a = jointOf(J, chain[i]), b = jointOf(J, chain[i + 1]); if (!a || !b) continue;
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
      const t = l2 > 1e-9 ? Math.min(1, Math.max(0, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / l2)) : 0;
      const d = Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t, p[2] - a[2] - ab[2] * t) / (rad[i] + (rad[i + 1] - rad[i]) * t);
      if (d < bd) { bd = d; best = id; }
      if (claim != null && i >= claim && d <= od) { od = d; own = id; }
    }
  }
  return own >= 0 ? own : best;
}

/**
 * meshVox(v, opts): one quad per exposed voxel face (neighbour cell empty), 4 verts + 6 indices, flat face normals, no merging.
 * opts: { cx, cy (voxel-space foot centre, default = grid centre: 17,15 for Lina), unit (model units per voxel, default 1: -> userData.unit / fp),
 *   colorOf(mat, v) -> { c:[r,g,b] (0..1, a lit colour > 1 clamps), emit:bool, gain (emit only, default 1) },
 *   ground (default true): shift the mesh so its lowest point is y = 0 (walk frames with both feet lifted would otherwise float),
 *   joints: rig J (voxel coords) -> per-voxel ragdoll segment (segmentOf) + userData.joints,
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
        s4 = l > 1e-6 ? w.map(e => Math.round(e / l * 127)) : [0, 0, 0]; s4[3] = ((opts.joints ? segmentOf(opts.joints, [x + 0.5, y + 0.5, z + 0.5]) : 0) << 5 | hash5(x, y, z)) - 128;
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
  if (opts.joints) {   // rig joints -> model units, the same frame as the mesh (feet-centred, ground-shifted)
    g.userData.joints = {}; for (const k in opts.joints) { const j = opts.joints[k]; g.userData.joints[k] = [(j[0] - cx) * unit, (j[2] - gy) * unit, (cy - j[1]) * unit]; }
  }
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

/** build(pose) -> Vox; anims = { name: [pose, ...] } (e.g. ANIMS). Returns { name: [geometry, ...] }, one geometry per pose, all sharing one index buffer. */
export function buildVoxFrames(build, anims, opts = {}) {   // opts.jointsOf(pose) -> rig J (optional, ragdoll segments)
  const out = {}, all = [];
  for (const k in anims) out[k] = anims[k].map((p) => { const g = meshVox(build(p), { ...opts, joints: opts.jointsOf && opts.jointsOf(p), index: false }); all.push(g); return g; });
  const ix = quadIndex(all.reduce((m, g) => Math.max(m, g.userData.quads), 0));
  for (const g of all) g.setIndex(ix);   // drawRange already = own quads * 6
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Static props (trees3d.js): greedy quads in the mesh3d kit layout (non-indexed float triangles), no per-voxel attributes.
/**
 * greedyVox(v, opts) -> { pos, nrm, col (Float32Array, 3 per vertex, 6 vertices per quad), quads }. Model space = meshVox's ((x - cx), z, (cy - y)) * unit.
 * Same-material exposed faces merge into rectangles (both in-plane directions; `rows: true` keeps side quads one voxel tall). Wind bends a vertex by
 * a function of its height only, so T-junctions on horizontal edges never open; the ones on vertical edges open by well under a unit at full bend.
 * opts: { cx, cy, unit (default 1), colorOf(mat) -> [r,g,b], extraOf(mat) -> number (per-vertex `ext`), rows }.
 */
export function greedyVox(v, opts = {}) {
  const { cx = v.X / 2, cy = v.Y / 2, unit = 1, colorOf = (m) => defaultColorOf(m).c, extraOf = () => 0, rows = false } = opts;
  const cc = v.mats.map(m => (m ? colorOf(m) : null)), ce = v.mats.map(m => (m ? extraOf(m) : 0));
  const N = [v.X, v.Y, v.Z], pos = [], nrm = [], col = [], ext = [];
  const mp = (p) => [(p[0] - cx) * unit, p[2] * unit, (cy - p[1]) * unit];
  let quads = 0;
  for (let d = 0; d < 3; d++) for (const s of [-1, 1]) {
    const uu = d === 0 ? 1 : 0, ww = d === 2 ? 1 : 2;   // uu = the run axis, ww = the other in-plane axis (z for side faces: no merging along it)
    const nv = [0, 0, 0]; nv[d] = s; const nm = [nv[0], nv[2], -nv[1]];
    const NU = N[uu], NW = N[ww], mask = new Int16Array(NU * NW), p = [0, 0, 0];
    for (let c = 0; c < N[d]; c++) {
      mask.fill(0);
      for (let b = 0; b < NW; b++) for (let a = 0; a < NU; a++) {
        p[d] = c; p[uu] = a; p[ww] = b;
        const id = v.get(p[0], p[1], p[2]); if (!id) continue;
        p[d] = c + s; if (v.get(p[0], p[1], p[2])) continue;
        mask[b * NU + a] = id;
      }
      const full = d === 2 || !rows;
      for (let b = 0; b < NW; b++) for (let a = 0; a < NU;) {
        const id = mask[b * NU + a]; if (!id) { a++; continue; }
        let wu = 1; while (a + wu < NU && mask[b * NU + a + wu] === id) wu++;
        let hw = 1;
        if (full) outer: while (b + hw < NW) { for (let k = 0; k < wu; k++) if (mask[(b + hw) * NU + a + k] !== id) break outer; hw++; }
        for (let j = 0; j < hw; j++) for (let k = 0; k < wu; k++) mask[(b + j) * NU + a + k] = 0;
        const plane = c + (s > 0 ? 1 : 0), q = (da, db) => { const r = [0, 0, 0]; r[d] = plane; r[uu] = a + da; r[ww] = b + db; return mp(r); };
        let P = [q(0, 0), q(wu, 0), q(wu, hw), q(0, hw)];
        const e1 = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], e2 = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]];
        const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        if (cr[0] * nm[0] + cr[1] * nm[1] + cr[2] * nm[2] < 0) P = [P[0], P[3], P[2], P[1]];   // CCW seen from outside
        for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(...P[k]); nrm.push(...nm); col.push(...cc[id]); ext.push(ce[id]); }
        quads++; a += wu;
      }
    }
  }
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), col: new Float32Array(col), ext: new Float32Array(ext), quads };
}

/**
 * LOD helper: a k x k x k block downsample of a Vox. A block is filled when >= `fill` of its cells are, with its most common material; a sparser block
 * still keeps a `thin` material (branches, stalks, trunks), so a bare tree does not vanish at the far LOD. Returns a new Vox sharing the materials.
 */
export function downsampleVox(v, k = 2, fill = 3) {
  const X = Math.ceil(v.X / k), Y = Math.ceil(v.Y / k), Z = Math.ceil(v.Z / k), o = new Vox(X, Y, Z);
  o.mats = v.mats; o.ids = v.ids;
  const cnt = new Map();
  for (let z = 0; z < Z; z++) for (let y = 0; y < Y; y++) for (let x = 0; x < X; x++) {
    cnt.clear(); let n = 0;
    for (let dz = 0; dz < k; dz++) for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) { const m = v.get(x * k + dx, y * k + dy, z * k + dz); if (m) { n++; cnt.set(m, (cnt.get(m) || 0) + 1); } }
    if (!n) continue;
    let best = 0, bc = 0, thin = 0, tc = 0;
    for (const [m, c] of cnt) { if (c > bc) { bc = c; best = m; } if (v.mats[m].thin && c > tc) { tc = c; thin = m; } }
    if (n >= fill) o.set(x, y, z, best); else if (thin) o.set(x, y, z, thin);
  }
  return o;
}
