// Shared helpers for the 3D props (buildings3d.js, trees3d.js): a low-poly geometry kit (flat shaded, vertex colours for both teams),
// an instanced-geometry factory, the sprite-compatible depth trick, and a silhouette rasteriser that makes pick masks.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ART_UNITS_PER_PX, CAMERA, vfov } from '../../../shared/constants.js';

export const rgb = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const cv = (c) => (Array.isArray(c) ? c : rgb(c));

/**
 * Geometry kit. Every piece gets: aCol (Radiant colour), aCol2 (Dire colour), aEmit (1 = emissive: colour is used unlit, may be HDR),
 * aSm (smooth outward direction for the outline hull), aPart (module specific flag), aSw (wind sway weight).
 * Colours are 0xRRGGBB ints (lit albedo) or [r,g,b] arrays (HDR, for emissive parts). Primitives sit with their base at o.y.
 */
export function createKit(vs = 1) {   // vs: vertical exaggeration (the 60 deg camera foreshortens heights by ~0.5, sprites do not)
  const list = [];
  const VS = new THREE.Matrix4(), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3(), C = new THREE.Vector3();
  function add(geo, o) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.deleteAttribute('uv'); g.deleteAttribute('normal');
    E.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ'); Q.setFromEuler(E);
    P.set(o.x || 0, o.y || 0, o.z || 0); S.set(o.sx || 1, o.sy || 1, o.sz || 1);
    M.compose(P, Q, S); if (vs !== 1) M.premultiply(VS.makeScale(1, vs, 1)); g.applyMatrix4(M);
    g.computeVertexNormals();                                  // non-indexed -> flat per-triangle normals
    g.computeBoundingBox(); g.boundingBox.getCenter(C);
    const pos = g.attributes.position, n = pos.count;
    const col = new Float32Array(n * 3), col2 = new Float32Array(n * 3), sm = new Float32Array(n * 3);
    const em = new Float32Array(n).fill(o.e ? 1 : 0), part = new Float32Array(n).fill(o.part || 0), sw = new Float32Array(n).fill(o.sw || 0);
    const c1 = cv(o.c), c2 = o.d != null ? cv(o.d) : c1;
    for (let i = 0; i < n; i++) {
      col.set(c1, i * 3); col2.set(c2, i * 3);
      let dx = pos.getX(i) - C.x, dy = pos.getY(i) - C.y, dz = pos.getZ(i) - C.z;
      const l = Math.hypot(dx, dy, dz) || 1;
      sm[i * 3] = dx / l; sm[i * 3 + 1] = dy / l; sm[i * 3 + 2] = dz / l;
    }
    g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aCol2', new THREE.BufferAttribute(col2, 3));
    g.setAttribute('aSm', new THREE.BufferAttribute(sm, 3));
    g.setAttribute('aEmit', new THREE.BufferAttribute(em, 1));
    g.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
    g.setAttribute('aSw', new THREE.BufferAttribute(sw, 1));
    list.push(g);
  }
  const kit = {
    add,
    box(w, h, d, o = {}) { add(new THREE.BoxGeometry(w, h, d), { ...o, y: (o.y || 0) + (o.ctr ? 0 : h / 2) }); },
    /** cylinder (rTop, rBottom, height, sides). Default yaw puts flat faces on the axes. */
    cyl(rt, rb, h, seg, o = {}, open = false) { add(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), { ry: Math.PI / seg, ...o, y: (o.y || 0) + (o.ctr ? 0 : h / 2) }); },
    /** open-bottom cone / pyramid (seg 4 = pyramid; scale it with sx / sz for a rectangular roof: o.t0 = PI/4 puts the corners on the diagonals
     *  BEFORE the scale, so the roof stays a rectangle; a yaw ry would be applied after the scale and shear it into a rhombus) */
    cone(r, h, seg, o = {}) { add(new THREE.CylinderGeometry(0, r, h, seg, 1, true, o.t0 || 0), { ...o, y: (o.y || 0) + (o.ctr ? 0 : h / 2) }); },
    /** octahedron crystal, centred at o.y, radii rx / ry / rz */
    oct(rx, ry, rz, o = {}) { add(new THREE.OctahedronGeometry(1, 0), { ...o, sx: rx, sy: ry, sz: rz }); },
    /** icosahedron blob, centred at o.y */
    ico(r, o = {}) { add(new THREE.IcosahedronGeometry(1, 0), { ...o, sx: r * (o.sx || 1), sy: r * (o.sy || 1), sz: r * (o.sz || 1) }); },
    build() { return mergeGeometries(list, false); },
  };
  return kit;
}

/** deterministic pseudo random in [0,1) */
export function hash01(n) { let h = Math.imul((n | 0) + 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; }

/**
 * Instanced geometry: all attributes of `merged` plus an interleaved per-instance buffer. attrs = [[name, size], ...].
 */
export function instancedGeo(merged, max, attrs) {
  const g = new THREE.InstancedBufferGeometry();
  for (const k in merged.attributes) g.setAttribute(k, merged.attributes[k]);
  const stride = attrs.reduce((s, a) => s + a[1], 0);
  const data = new Float32Array(max * stride);
  const buf = new THREE.InstancedInterleavedBuffer(data, stride, 1); buf.setUsage(THREE.DynamicDrawUsage);
  let off = 0;
  for (const [name, size] of attrs) { g.setAttribute(name, new THREE.InterleavedBufferAttribute(buf, size, off)); off += size; }
  g.instanceCount = 0;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
  return { geo: g, buf, data, stride, max, tris: merged.attributes.position.count / 3 };
}

/** push the used range of an interleaved buffer to the GPU */
export function flushInstances(inst, n) {
  inst.geo.instanceCount = n;
  inst.buf.clearUpdateRanges(); if (n > 0) inst.buf.addUpdateRange(0, n * inst.stride); inst.buf.needsUpdate = n > 0;
}

/**
 * GLSL: sprites (sprites.js) write the depth of their FOOT point, so a unit standing south of a building is never clipped by it.
 * 3D props do the same: depth = mix(depth of the footprint's front edge, real depth, EPS). Real depth keeps intra-mesh ordering
 * (crystal in front of battlements, outline hull behind the body); the front-edge reference keeps the lower body above the terrain.
 * `foot` = instance ground centre (three coords), `pull` = footprint half depth (world units, toward the camera = +z).
 */
export const DEPTH_GLSL = /* glsl */ `
vec4 propDepth(vec4 cr, vec3 foot, float pull){
  vec4 cf = projectionMatrix * viewMatrix * vec4(foot + vec3(0., 0., pull + 8.), 1.);
  float zn = mix(cf.z / cf.w, cr.z / cr.w, .08);
  return vec4(cr.xy, zn * cr.w, cr.w);
}`;

/**
 * Rasterise the silhouette of a geometry as the game camera sees it (60 deg pitch, 6 world units per art px) into a sprite-like frame
 * { w, h, ax, ay, rows, def } that atlas.texel() / renderer.pickSprite understand. (ax, ay) = foot pixel. `minAy` pads the top so
 * the HP bar (placed at p.z + ay * 6 * 0.92 world units) lands at the top of the prop.
 */
export function silhouetteFrame(geo, { pitch = CAMERA.pitch, minAy = 0, grow = 1, skipPart = -1 } = {}) {
  // project through the real game camera (foot at the screen centre): the wide fov enlarges tall things a lot, an orthographic guess is far off
  const fv = vfov(CAMERA.fovH43), cam = new THREE.PerspectiveCamera(fv, 16 / 9, 100, 5500), pr = pitch * Math.PI / 180;
  cam.position.set(0, CAMERA.distance * Math.sin(pr), CAMERA.distance * Math.cos(pr)); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const visArt = 2 * CAMERA.distance * Math.tan(fv * Math.PI / 360) / ART_UNITS_PER_PX, V = new THREE.Vector3();
  const pos = geo.attributes.position, n = pos.count, partA = geo.attributes.aPart;
  const sx = new Float32Array(n), sy = new Float32Array(n);    // art px offsets from the foot, y up
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (let i = 0; i < n; i++) {
    V.set(pos.getX(i), pos.getY(i), pos.getZ(i)).project(cam);
    const x = V.x * visArt * (16 / 9) / 2, y = V.y * visArt / 2;
    sx[i] = x; sy[i] = y;
    if (skipPart >= 0 && partA && partA.getX(i) === skipPart) continue;
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const ax = Math.ceil(-minX) + 2, up = Math.ceil(maxY) + 2, down = Math.ceil(-minY) + 2;
  const ay = Math.max(up, Math.ceil(minAy));
  const w = ax + Math.ceil(maxX) + 3, h = ay + Math.max(down, 2) + 1;
  const mask = new Uint8Array(w * h);
  for (let t = 0; t < n; t += 3) {
    if (skipPart >= 0 && partA && partA.getX(t) === skipPart) continue;
    const x0 = sx[t], y0 = sy[t], x1 = sx[t + 1], y1 = sy[t + 1], x2 = sx[t + 2], y2 = sy[t + 2];
    const den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
    if (Math.abs(den) < 1e-6) continue;
    const bx0 = Math.floor(Math.min(x0, x1, x2)), bx1 = Math.ceil(Math.max(x0, x1, x2));
    const by0 = Math.floor(Math.min(y0, y1, y2)), by1 = Math.ceil(Math.max(y0, y1, y2));
    for (let py = by0; py <= by1; py++) for (let px = bx0; px <= bx1; px++) {
      const a = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / den, b = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / den, c = 1 - a - b;
      const e = -0.45;
      if (a < e || b < e || c < e) continue;
      const lx = px + ax, ly = ay - py;
      if (lx >= 0 && lx < w && ly >= 0 && ly < h) mask[ly * w + lx] = 1;
    }
  }
  if (grow > 0) {   // dilate (thin parts stay clickable)
    for (let pass = 0; pass < grow; pass++) {
      const src = mask.slice();
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!src[y * w + x] && ((x > 0 && src[y * w + x - 1]) || (x < w - 1 && src[y * w + x + 1]) || (y > 0 && src[(y - 1) * w + x]) || (y < h - 1 && src[(y + 1) * w + x]))) mask[y * w + x] = 1;
    }
  }
  const rows = [];
  for (let y = 0; y < h; y++) { let s = ''; for (let x = 0; x < w; x++) s += mask[y * w + x] ? 'X' : '.'; rows.push(s); }
  return { key: 'mesh3d', w, h, ax, ay, flip: false, rows, def: { pal: { X: '#ffffff' } } };
}
