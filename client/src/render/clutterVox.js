// Voxel clutter geometry: shared/vox/world/{clutter,rocks}.js builders -> a greedy-meshed, non-indexed layout clutter3d's shader expects
// (position in world units, flat normal, aCol / aCol2 albedo, aSw wind weight, aEmit night glow, aPart). One geometry per (variant, side, shape) "slot".
// Pure (no GL), so node tests cover it. Down faces are never emitted (the prop stands on the ground) and coplanar same-colour faces merge into
// rectangles: the triangle budget is the point. Merges never run vertically through the ground-contact ramp (y < CONTACT) or the wind ramp
// (y < swayH) of a colour, since the shader interpolates those per vertex.
import * as THREE from 'three';
import { Vox } from '../../../shared/vox/vox.js';
import { SPECS, buildProp, shapeOf } from '../../../shared/vox/world/clutter.js';

export { SPECS, shapeOf };
export const slotCount = (name) => SPECS[name].shapes * 2;
/** Slot of an instance: Radiant (side 0) shapes first, then Dire. side is the instance side field (any non-zero = Dire), ph its phase (0..2pi). */
export const slotOf = (name, side, ph) => (side ? SPECS[name].shapes : 0) + shapeOf(name, ph);

const CONTACT = 14;   // clutter3d: contact darkening = smoothstep(0, 14, y)
const key = (r, g, b) => r * 65536 + g * 256 + b;
const FACES = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]];   // [voxel axis, side]; voxel z is up, (z, -1) is the unseen bottom

/**
 * LOD 1: the grid at half resolution (2x2x2 blocks -> one voxel of the most common material; a block is solid at `min` or more of its 8 cells, ground blocks at 1).
 * Same foot centre and ground, so it drops in at unit * 2.
 */
export function halve(v, min = 3) {
  const o = new Vox(Math.ceil(v.X / 2), Math.ceil(v.Y / 2), Math.ceil(v.Z / 2)); o.mats = v.mats;
  const cnt = new Uint8Array(v.mats.length);
  for (let z = 0; z < o.Z; z++) for (let y = 0; y < o.Y; y++) for (let x = 0; x < o.X; x++) {
    cnt.fill(0); let n = 0;
    for (let k = 0; k < 8; k++) { const m = v.get(x * 2 + (k & 1), y * 2 + ((k >> 1) & 1), z * 2 + (k >> 2)); if (m) { cnt[m]++; n++; } }
    if (n < (z ? min : 1)) continue;   // the bottom layer keeps any foot: thin stems must still touch the ground
    let b = 0; for (let m = 1; m < cnt.length; m++) if (cnt[m] > cnt[b]) b = m;
    o.g[o.i(x, y, z)] = b;
  }
  return o;
}

/**
 * Geometry of one slot: { geo (non-indexed, ready for instancedGeo), tris, height (world units) }. lod 1 = half-resolution grid at twice the unit.
 * Wind weight per vertex = the material's sway x clamp(height / spec.swayH), so blades and cloth move at the tips and the roots stay put.
 */
export function slotGeo(name, side, shape, lod = 0) {
  const spec = SPECS[name], v = lod ? halve(buildProp(name, side, shape), spec.lodMin || 3) : buildProp(name, side, shape), unit = spec.unit * (lod ? 2 : 1), sh = spec.swayH || 0;
  const cx = v.X / 2, cy = v.Y / 2, X = v.X, Y = v.Y, Z = v.Z;
  // the materials' wind / night flags are looked up by colour (the palettes give every flagged mat its own colour)
  const flags = new Map(), rgbOf = [];
  v.mats.forEach((m, i) => {
    if (!m) return;
    const c = m.rgb[2].map((x) => Math.round(x)), k = key(c[0], c[1], c[2]);
    rgbOf[i] = { k, c: c.map((x) => x / 255) };
    if (m.emit) return;
    const o = flags.get(k) || { sway: 0, night: 0 };
    o.sway = Math.max(o.sway, m.sway || 0); o.night = Math.max(o.night, m.night || 0); flags.set(k, o);
  });
  const dims = [X, Y, Z], pos = [], nor = [], col = [], sw = [], em = [];
  let maxY = 0;
  const co = [0, 0, 0], P = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const [a, s] of FACES) {
    if (a === 2 && s < 0) continue;
    const U = a === 0 ? 1 : 0, W = a === 2 ? 1 : 2;   // in-plane voxel axes: u (horizontal), w (z for the side faces)
    const nU = dims[U], nW = dims[W], nA = dims[a];
    const n = a === 0 ? [s, 0, 0] : a === 1 ? [0, 0, -s] : [0, s, 0];   // model-space normal
    const mask = new Int32Array(nU * nW), done = new Uint8Array(nU * nW);
    for (let k = 0; k < nA; k++) {
      let any = false;
      for (let w = 0; w < nW; w++) for (let u = 0; u < nU; u++) {
        co[a] = k; co[U] = u; co[W] = w;
        const m = v.g[v.i(co[0], co[1], co[2])];
        let id = -1;
        if (m) { co[a] = k + s; if (!v.get(co[0], co[1], co[2])) { id = m; any = true; } }
        mask[u + w * nU] = id; done[u + w * nU] = 0;
      }
      if (!any) continue;
      for (let w = 0; w < nW; w++) for (let u = 0; u < nU; u++) {
        const id = mask[u + w * nU]; if (id < 0 || done[u + w * nU]) continue;
        const r = rgbOf[id], f = flags.get(r.k) || { sway: 0, night: 0 };
        let w1 = 1, u1 = 1;
        while (u + u1 < nU && !done[u + u1 + w * nU] && rgbOf[mask[u + u1 + w * nU]]?.k === r.k) u1++;
        // top faces (a = 2) sit at one height: merge both ways; side faces merge upward only above both ramps
        // (the wind ramp is linear up to swayH, so a quad may span it as long as it stops at swayH)
        const ws = f.sway && sh ? sh : 0;
        if (a === 2 || w * unit >= CONTACT) {
          grow: while (w + w1 < nW) {
            if (a !== 2 && w * unit < ws && (w + w1 + 1) * unit > ws) break;
            for (let i = 0; i < u1; i++) if (done[u + i + (w + w1) * nU] || rgbOf[mask[u + i + (w + w1) * nU]]?.k !== r.k) break grow;
            w1++;
          }
        }
        for (let j = 0; j < w1; j++) for (let i = 0; i < u1; i++) done[u + i + (w + j) * nU] = 1;
        // corners in voxel space -> model space (x - cx, z, cy - y), wound CCW seen from outside
        const plane = k + (s > 0 ? 1 : 0), cu = [u, u + u1, u + u1, u], cw = [w, w, w + w1, w + w1];
        for (let q = 0; q < 4; q++) {
          co[a] = plane; co[U] = cu[q]; co[W] = cw[q];
          P[q][0] = (co[0] - cx) * unit; P[q][1] = co[2] * unit; P[q][2] = (cy - co[1]) * unit;
        }
        const e1 = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], e2 = [P[2][0] - P[1][0], P[2][1] - P[1][1], P[2][2] - P[1][2]];
        const dot = (e1[1] * e2[2] - e1[2] * e2[1]) * n[0] + (e1[2] * e2[0] - e1[0] * e2[2]) * n[1] + (e1[0] * e2[1] - e1[1] * e2[0]) * n[2];
        const order = dot > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
        for (const q of order) {
          const y = P[q][1]; if (y > maxY) maxY = y;
          pos.push(P[q][0], y, P[q][2]); nor.push(n[0], n[1], n[2]); col.push(r.c[0], r.c[1], r.c[2]);
          sw.push(sh ? f.sway * Math.min(1, y / sh) : 0); em.push(f.night);
        }
      }
    }
  }
  const out = new THREE.BufferGeometry(), nv = pos.length / 3, cA = new Float32Array(col);
  out.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  out.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  out.setAttribute('aCol', new THREE.BufferAttribute(cA, 3));
  out.setAttribute('aCol2', new THREE.BufferAttribute(cA, 3));
  out.setAttribute('aSw', new THREE.BufferAttribute(new Float32Array(sw), 1));
  out.setAttribute('aEmit', new THREE.BufferAttribute(new Float32Array(em), 1));
  out.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(nv), 1));
  return { geo: out, tris: nv / 3, height: maxY };
}
