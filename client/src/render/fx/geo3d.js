// 3D spell geometry for the fx module ("VFX in 3D WITH particles"): three instanced, pooled, immediate-mode batches that draw INTO the same
// low-res scene target as terrain / sprites / particles, so everything pixelates together.
//   tube    open cylinder / cone shaft (light columns, falling shards, beams): fresnel body, spiral energy bands, descending front
//   disc    flat ground quad shaded in the fragment: ring, targeting circle, shockwave, frost/glow fill   (modes 0..3, see DISC)
//   bolt    camera-facing ribbon strips (lightning): main path + forks, segments re-randomised by the caller every few frames
// Immediate mode like quads.js: call G.tube / G.disc / G.bolt every frame from a c.run callback; G.begin() / G.end() bracket the frame
// (fx/index.js). Nothing is allocated per frame: pass shared option bags (made once per cast) and colour arrays (made once).
// Look: additive, Bayer-dithered quantised intensity (no smooth fades), alpha channel left alone (scene alpha = water mask, see beams.js),
// depth-tested, fog-of-war aware. Shells stay below the 1.4 bloom threshold, HDR cores (colour > 1.4) bloom.
// Coordinates are WORLD (x east, y north, z up); the batches convert to three (x, z, -y).
import * as THREE from 'three';
import { COMMON_GLSL, UNIFORMS_GLSL } from '../shaderlib.js';

export const MAX_TUBES = 24;
export const MAX_DISCS = 32;
export const MAX_RIB = 480;          // ribbon instances (2 per bolt segment: glow + core)
export const MAX_BOLT_SEG = 56;
const STRIDE = 16;                   // 4 vec4 per instance in every batch
const TUBE_SEG = 24;
const TAU = Math.PI * 2;

// ------------------------------------------------------------------------------------------------------------------------------ shaders
const HASH = /* glsl */ `float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`;
// fog-of-war dim, same remap particles.js uses
const FOGK = /* glsl */ `float fogK(vec3 w){ float fb = fogBright(w, gl_FragCoord.xy); return clamp((fb - uFogLv.x) / (1. - uFogLv.x), 0., 1.); }`;
const OUT = /* glsl */ `
vec4 outCol(vec3 col, float v, float n){            // Bayer-quantised intensity: floor(v*n + bayer)/n, alpha channel untouched
  float q = floor(v * n + bayer4(gl_FragCoord.xy)) / n;
  return vec4(col * q, 0.);
}`;

const TUBE_VERT = /* glsl */ `
attribute vec3 aRing;      // cos, sin, t along the axis (0 = base, 1 = top)
attribute vec4 aP;         // base (three coords), height
attribute vec4 aR;         // r0, r1, seed, fresnel power
attribute vec4 aC;         // rgb (HDR), alpha gain
attribute vec4 aS;         // front (0..1: fragment hidden below it, a descending head), swirl amount, phase, top-fade start
varying vec3 vN, vW, vC; varying float vT, vH, vA, vK; varying vec4 vS, vR;
void main(){
  float t = aRing.z;
  float rad = mix(aR.x, aR.y, t);
  vec3 wp = aP.xyz + vec3(aRing.x * rad, aP.w * t, aRing.y * rad);
  vN = normalize(vec3(aRing.x, 0., aRing.y));
  vW = wp; vC = aC.rgb; vK = aC.w; vT = t; vH = aP.w; vS = aS; vR = aR;
  vA = atan(aRing.y, aRing.x);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.);
}`;
const TUBE_FRAG = /* glsl */ `
precision highp float;
${COMMON_GLSL}
${FOGK}
${OUT}
varying vec3 vN, vW, vC; varying float vT, vH, vA, vK; varying vec4 vS, vR;
void main(){
  if (vT < vS.x) discard;
  vec3 V = normalize(uCamPos - vW);
  float ndv = abs(dot(vN, V));
  float v = pow(ndv, vR.w);                                                     // thick through the middle, dithers away at the silhouette
  v *= 1. - smoothstep(vS.w, 1., vT);                                           // gone before the sky end
  float hw = vT * vH;                                                           // world height above the base
  v *= 1. + .7 * exp(-hw / 60.) * step(0.5, vR.z);                             // seed>0.5 = ground flare at the base
  float st = .5 + .5 * sin(vA * 3. + hw * .02 - vS.z);                          // spiral energy bands climbing the column
  v *= mix(1., .15 + 1.05 * st, vS.y);
  if (vS.x > .001) v *= 1. + 1.6 * exp(-(vT - vS.x) * vH / 45.);                // bright head while the column drops
  v *= vK * fogK(vW);
  if (v <= .02) discard;
  gl_FragColor = outCol(vC, v, 5.);
}`;

const DISC_VERT = /* glsl */ `
attribute vec2 corner;
attribute vec4 aP;         // centre (three coords), radius
attribute vec4 aR;         // rin / spoke amount, n (dashes, spokes, cells), seed, mode
attribute vec4 aC;         // rgb (HDR), alpha gain
attribute vec4 aS;         // p0..p3 (mode specific)
varying vec2 vL; varying vec3 vW, vC; varying float vK; varying vec4 vS, vR;
void main(){
  vL = corner * 2. - 1.;
  vec3 wp = aP.xyz + vec3(vL.x, 0., vL.y) * aP.w;
  vW = wp; vC = aC.rgb; vK = aC.w; vS = aS; vR = aR;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.);
}`;
// modes (vR.w):  p0..p3 = vS.xyzw
//  0 RING     band from rin..1:  p1 = gradient power (0 = flat), p2 = bright rim boost
//  1 TARGET   Dota-style targeting circle: rim ring, dashed ring (n dashes), inner ring, sun rays, core. p0 = rotation phase, p1 = fill, p2 = rays amount
//  2 SHOCK    expanding wave: p0 = front radius (0..1), p1 = band thickness, p2 = trailing mist; n = ragged cells
//  3 FILL     radial glow / aura / afterglow: p0 = spoke phase, p1 = radial falloff power, p2 = pixel noise amount, p3 = rim line boost; rin = spokes amount, n = spokes
const DISC_FRAG = /* glsl */ `
precision highp float;
${COMMON_GLSL}
${FOGK}
${OUT}
${HASH}
varying vec2 vL; varying vec3 vW, vC; varying float vK; varying vec4 vS, vR;
void main(){
  float r = length(vL);
  if (r > 1.) discard;
  float ang = atan(vL.y, vL.x);
  float mode = vR.w;
  float v = 0.;
  if (mode < .5) {
    float u = (r - vR.x) / max(1. - vR.x, 1e-3);
    if (u < 0.) discard;
    v = vS.y > .01 ? pow(max(u, 1e-3), vS.y) : 1.;
    v += vS.z * smoothstep(.88, 1., u);
  } else if (mode < 1.5) {
    float ph = vS.x;
    v += step(.89, r);                                                                          // outer rim
    v += .9 * step(.7, r) * step(r, .78) * step(.5, fract((ang + ph) / ${TAU.toFixed(4)} * vR.y));       // dashed ring, turns with the phase
    v += .7 * step(.38, r) * step(r, .46) * step(.35, fract((ang - ph * 1.6) / ${TAU.toFixed(4)} * vR.y * .5));
    float ray = step(.86, cos((ang + ph * .5) * 8.));                                           // 8 sun rays
    v += vS.z * ray * step(.09, r) * step(r, .33) * (1. - r * 2.);
    v += step(r, .1);
    v += vS.y * (1. - r) * (1. - r) * (.55 + .45 * hash21(floor(vW.xz / 6.) + vR.z));          // faint pixel-noisy fill
  } else if (mode < 2.5) {
    float f = vS.x, th = vS.y;
    if (r > f) discard;
    float u = (r - (f - th)) / th;
    float cell = hash21(vec2(floor(ang / ${TAU.toFixed(4)} * vR.y), vR.z));
    v = u > 0. ? pow(u, 2.2) * (.8 + .2 * cell) : vS.z * (r / max(f, .01)) * (.5 + .5 * cell);
    v += step(.9, u) * .5;                                                                      // hot leading edge
  } else {
    v = pow(1. - r, max(vS.y, .01));
    v *= mix(1., hash21(floor(vW.xz / 6.) + vR.z), vS.z);
    v += vS.w * step(.955, r);                                                                  // crisp rim line
    if (vR.y > .5) {
      float sp = abs(fract((ang / ${TAU.toFixed(4)}) * vR.y + vS.x) - .5);
      v += vR.x * step(sp, .006 / max(r, .12)) * step(.1, r) * (1. - r);                         // thin crystal spokes
    }
  }
  v *= vK * fogK(vW);
  if (v <= .02) discard;
  gl_FragColor = outCol(vC, v, 5.);
}`;

const RIB_VERT = /* glsl */ `
${UNIFORMS_GLSL}
attribute vec2 corner;     // x: 0..1 along, y: 0..1 across
attribute vec4 aA;         // start (three coords), width in art px
attribute vec4 aB;         // end, width
attribute vec4 aC;         // rgb (HDR), alpha
attribute vec4 aM;         // kind (0 glow, 1 core), seed, brightness
varying vec3 vC, vW; varying float vS, vA, vKind, vB;
void main(){
  vec3 pa = aA.xyz, pb = aB.xyz;
  pa += normalize(uCamPos - pa) * 12.; pb += normalize(uCamPos - pb) * 12.;     // keep the strip in front of billboards it overlaps
  vec4 ca = projectionMatrix * viewMatrix * vec4(pa, 1.);
  vec4 cb = projectionMatrix * viewMatrix * vec4(pb, 1.);
  if (ca.w <= 0. || cb.w <= 0.) { gl_Position = vec4(2., 2., 2., 1.); return; }
  vec4 cm = mix(ca, cb, corner.x);
  vec2 sa = ca.xy / ca.w * uRT * .5, sb = cb.xy / cb.w * uRT * .5;
  vec2 d = sb - sa; float L = length(d); d = L > 1e-3 ? d / L : vec2(1., 0.);
  vec2 n = vec2(-d.y, d.x);
  float apx = max(1., floor(uArtPx + .5));
  float w = max(1., floor(mix(aA.w, aB.w, corner.x) + .5)) * apx;                 // whole art pixels
  float s = corner.y * 2. - 1.;
  vec2 off = (n * s * w * .5 + d * (corner.x * 2. - 1.) * w * .5) / (uRT * .5);
  gl_Position = vec4(cm.xy + off * cm.w, cm.z, cm.w);
  vS = s; vC = aC.rgb; vA = aC.w; vKind = aM.x; vB = aM.z; vW = mix(pa, pb, corner.x);
}`;
const RIB_FRAG = /* glsl */ `
precision highp float;
${COMMON_GLSL}
${FOGK}
${OUT}
varying vec3 vC, vW; varying float vS, vA, vKind, vB;
void main(){
  float fk = fogK(vW);
  if (vKind > .5) {                                                              // hot core: crisp, only dither-faded by alpha
    if (bayer4(gl_FragCoord.xy) > vA * fk) discard;
    gl_FragColor = vec4(vC * vB, 0.);
  } else {                                                                       // glow sheath: quantised falloff across the strip
    float a = 1. - abs(vS);
    float v = a * a * vA * vB * fk;
    if (v <= .02) discard;
    gl_FragColor = outCol(vC, v, 4.);
  }
}`;

// ------------------------------------------------------------------------------------------------------------------------------ bolts (CPU)
let _s = 1;
const rr = () => { _s = (_s + 0x6D2B79F5) | 0; let t = Math.imul(_s ^ (_s >>> 15), 1 | _s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rs = (a, b) => a + rr() * (b - a);
const _pts = new Float32Array((32 + 1) * 3);
const BSTRIDE = 8;      // ax ay az bx by bz widthMul brightness   (three coords)

/**
 * Pure: write a jagged forked bolt into `out` (Float32Array, BSTRIDE floats per segment, three coords) and return the segment count.
 * Midpoint displacement for the main path, then o.branches short forks that peel off forward. Deterministic for a given seed.
 * o: {depth=4 (2^depth main segments), jag (world units, default 10% of length, max 80), branches=4, branchLen=0.18 (fraction of length), branchJag}
 */
export function genBolt(out, x0, y0, z0, x1, y1, z1, o, seed) {
  _s = (seed | 0) * 2654435761 + 12345;
  const depth = Math.min(5, (o && o.depth) || 4), n = 1 << depth;
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, len = Math.hypot(dx, dy, dz) || 1;
  const jag = o && o.jag != null ? o.jag : Math.min(80, len * 0.1);
  const fx = dx / len, fy = dy / len, fz = dz / len;
  // perpendicular basis u (horizontal-ish) and v
  let ux = -fy, uy = fx, uz = 0, ul = Math.hypot(ux, uy);
  if (ul < 1e-3) { ux = 1; uy = 0; ul = 1; }
  ux /= ul; uy /= ul;
  const vx = fy * uz - fz * uy, vy = fz * ux - fx * uz, vz = fx * uy - fy * ux;
  _pts[0] = x0; _pts[1] = y0; _pts[2] = z0; _pts[n * 3] = x1; _pts[n * 3 + 1] = y1; _pts[n * 3 + 2] = z1;
  let amp = jag;
  for (let step = n; step > 1; step >>= 1, amp *= 0.58) {
    const h = step >> 1;
    for (let i = h; i < n; i += step) {
      const a = (i - h) * 3, b = (i + h) * 3, p = i * 3, j = rs(-amp, amp), k = rs(-amp, amp) * 0.6;
      _pts[p] = (_pts[a] + _pts[b]) * 0.5 + ux * j + vx * k;
      _pts[p + 1] = (_pts[a + 1] + _pts[b + 1]) * 0.5 + uy * j + vy * k;
      _pts[p + 2] = (_pts[a + 2] + _pts[b + 2]) * 0.5 + uz * j + vz * k;
    }
  }
  let m = 0;
  const cap = out.length / BSTRIDE;
  const put = (ax, ay, az, bx, by, bz, wm, br) => {
    if (m >= cap) return;
    const i = m++ * BSTRIDE;
    out[i] = ax; out[i + 1] = az; out[i + 2] = -ay; out[i + 3] = bx; out[i + 4] = bz; out[i + 5] = -by; out[i + 6] = wm; out[i + 7] = br;
  };
  for (let i = 0; i < n; i++) put(_pts[i * 3], _pts[i * 3 + 1], _pts[i * 3 + 2], _pts[i * 3 + 3], _pts[i * 3 + 4], _pts[i * 3 + 5], 1, 0.85 + rr() * 0.3);
  const nb = o && o.branches != null ? o.branches : 4, bl = (o && o.branchLen) || 0.18, bj = o && o.branchJag != null ? o.branchJag : jag * 0.5;
  for (let b = 0; b < nb; b++) {
    const idx = 2 + Math.floor(rr() * (n - 3)), p = idx * 3, sgn = rr() < 0.5 ? -1 : 1, su = sgn * rs(0.5, 1), sv = rs(-0.4, 0.4);
    let ex = fx * 0.75 + ux * su + vx * sv, ey = fy * 0.75 + uy * su + vy * sv, ez = fz * 0.75 + uz * su + vz * sv;
    const el = Math.hypot(ex, ey, ez) || 1; ex /= el; ey /= el; ez /= el;
    const L = len * bl * rs(0.6, 1.2), segs = 4;
    let px = _pts[p], py = _pts[p + 1], pz = _pts[p + 2];
    for (let s = 1; s <= segs; s++) {
      const k = s / segs, j = rs(-bj, bj), kk = rs(-bj, bj) * 0.6;
      const qx = _pts[p] + ex * L * k + ux * j + vx * kk, qy = _pts[p + 1] + ey * L * k + uy * j + vy * kk, qz = _pts[p + 2] + ez * L * k + uz * j + vz * kk;
      put(px, py, pz, qx, qy, qz, 0.6 - 0.1 * s / segs, 0.7 - 0.12 * s);
      px = qx; py = qy; pz = qz;
    }
  }
  return m;
}

// ------------------------------------------------------------------------------------------------------------------------------ batches
function makeBatch(geo, names, max) {
  const data = new Float32Array(max * STRIDE);
  const buf = new THREE.InstancedInterleavedBuffer(data, STRIDE, 1); buf.setUsage(THREE.DynamicDrawUsage);
  names.forEach((nm, i) => geo.setAttribute(nm, new THREE.InterleavedBufferAttribute(buf, 4, i * 4)));
  geo.instanceCount = 0;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
  return { data, buf, n: 0, max };
}
function material(vs, fs, uniforms) {
  return new THREE.ShaderMaterial({
    vertexShader: vs, fragmentShader: fs, uniforms: { ...uniforms },
    transparent: true, depthTest: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,       // scene alpha is the water mask: never write it
  });
}
const QUAD = () => {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('corner', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
};

const DEF = {};
export function createGeo3d({ scene, uniforms }) {
  // tube
  const tg = new THREE.InstancedBufferGeometry();
  const ring = [], idx = [];
  for (let i = 0; i < TUBE_SEG; i++) { const a = (i / TUBE_SEG) * TAU; ring.push(Math.cos(a), Math.sin(a), 0, Math.cos(a), Math.sin(a), 1); }
  for (let i = 0; i < TUBE_SEG; i++) { const j = (i + 1) % TUBE_SEG, a0 = i * 2, a1 = i * 2 + 1, b0 = j * 2, b1 = j * 2 + 1; idx.push(a0, b0, a1, b0, b1, a1); }
  tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ring.length), 3));
  tg.setAttribute('aRing', new THREE.BufferAttribute(new Float32Array(ring), 3));
  tg.setIndex(idx);
  const T = makeBatch(tg, ['aP', 'aR', 'aC', 'aS'], MAX_TUBES);
  // disc
  const dg = QUAD(); const D = makeBatch(dg, ['aP', 'aR', 'aC', 'aS'], MAX_DISCS);
  // ribbon
  const rg = QUAD(); const Rb = makeBatch(rg, ['aA', 'aB', 'aC', 'aM'], MAX_RIB);

  const meshes = [[tg, TUBE_VERT, TUBE_FRAG, 'fx3d_tube', 16.5], [dg, DISC_VERT, DISC_FRAG, 'fx3d_disc', 16.2], [rg, RIB_VERT, RIB_FRAG, 'fx3d_bolt', 17]].map(([g, vs, fs, name, ro]) => {
    const m = new THREE.Mesh(g, material(vs, fs, uniforms)); m.frustumCulled = false; m.renderOrder = ro; m.name = name; m.visible = false;
    if (scene) scene.add(m);
    return m;
  });

  /** Column / cone / beam. (x,y,z) = base centre in world coords, h = height, r0/r1 = base/top radius, col = [r,g,b] HDR, a = alpha gain (dithers).
   *  o: {front (0..1, hides everything below it: a column dropping from the sky), swirl (0..1 spiral bands), phase (spiral scroll), pow (fresnel power, 2 = soft shell, 0.6 = solid core),
   *      flare (1 = ground flare at the base), top (fade start 0..1)} */
  function tube(x, y, z, h, r0, r1, col, a, o) {
    if (T.n >= T.max || a <= 0) return false;
    o = o || DEF;
    const d = T.data, i = T.n++ * STRIDE;
    d[i] = x; d[i + 1] = z; d[i + 2] = -y; d[i + 3] = h;
    d[i + 4] = r0; d[i + 5] = r1; d[i + 6] = o.flare ? 1 : 0; d[i + 7] = o.pow == null ? 2 : o.pow;
    d[i + 8] = col[0]; d[i + 9] = col[1]; d[i + 10] = col[2]; d[i + 11] = a;
    d[i + 12] = o.front || 0; d[i + 13] = o.swirl || 0; d[i + 14] = o.phase || 0; d[i + 15] = o.top == null ? 0.85 : o.top;
    return true;
  }
  /** Flat ground quad. (x,y,z) = centre (z = ground height, lifted a hair), R = outer radius. mode 0 RING, 1 TARGET, 2 SHOCK, 3 FILL (see DISC_FRAG).
   *  o: {rin, n, seed, p0, p1, p2, p3} */
  function disc(x, y, z, R, mode, col, a, o) {
    if (D.n >= D.max || a <= 0) return false;
    o = o || DEF;
    const d = D.data, i = D.n++ * STRIDE;
    d[i] = x; d[i + 1] = z + 4; d[i + 2] = -y; d[i + 3] = R;
    d[i + 4] = o.rin || 0; d[i + 5] = o.n == null ? 8 : o.n; d[i + 6] = o.seed || 0; d[i + 7] = mode;
    d[i + 8] = col[0]; d[i + 9] = col[1]; d[i + 10] = col[2]; d[i + 11] = a;
    d[i + 12] = o.p0 || 0; d[i + 13] = o.p1 || 0; d[i + 14] = o.p2 || 0; d[i + 15] = o.p3 || 0;
    return true;
  }

  // ---- pooled bolts: a bolt owns its segment array; re-roll with bolt.roll(...) every few frames, draw with G.bolt(b, ...) each frame
  const bfree = [];
  const mkBolt = () => ({ seg: new Float32Array(MAX_BOLT_SEG * BSTRIDE), n: 0, last: -1e9, ctr: 0, used: false,
    /** Re-roll if `period` seconds passed since the last roll (T = c.T). Deterministic seed from the roll counter. */
    roll(T0, period, x0, y0, z0, x1, y1, z1, o) {
      if (T0 - this.last < period && this.n) return false;
      this.last = T0; this.n = genBolt(this.seg, x0, y0, z0, x1, y1, z1, o, (this.ctr++) * 7919 + this.id * 104729); return true;
    }, id: 0 });
  for (let i = 0; i < 10; i++) { const b = mkBolt(); b.id = i + 1; bfree.push(b); }
  /** Acquire a pooled bolt (null if exhausted). Release with G.free(b) when the spell ends. */
  function newBolt() { const b = bfree.pop() || null; if (b) { b.used = true; b.n = 0; b.last = -1e9; } return b; }
  function free(b) { if (b && b.used) { b.used = false; bfree.push(b); } }
  /** Draw a bolt: glow sheath (colour gcol, glowPx art px wide) + hot core (ccol, corePx). a = dither alpha. */
  function bolt(b, gcol, glowPx, ccol, corePx, a) {
    if (!b || !b.n || a <= 0) return;
    const d = Rb.data;
    for (let s = 0; s < b.n; s++) {
      if (Rb.n + 2 > Rb.max) return;
      const o = s * BSTRIDE, wm = b.seg[o + 6], br = b.seg[o + 7];
      for (let k = 0; k < 2; k++) {
        const i = Rb.n++ * STRIDE, w = (k ? corePx : glowPx) * wm, c = k ? ccol : gcol;
        d[i] = b.seg[o]; d[i + 1] = b.seg[o + 1]; d[i + 2] = b.seg[o + 2]; d[i + 3] = w;
        d[i + 4] = b.seg[o + 3]; d[i + 5] = b.seg[o + 4]; d[i + 6] = b.seg[o + 5]; d[i + 7] = w;
        d[i + 8] = c[0]; d[i + 9] = c[1]; d[i + 10] = c[2]; d[i + 11] = a;
        d[i + 12] = k; d[i + 13] = 0; d[i + 14] = br; d[i + 15] = 0;
      }
    }
  }

  const batches = [T, D, Rb];
  return {
    tube, disc, bolt, newBolt, free, genBolt, meshes,
    begin() { T.n = 0; D.n = 0; Rb.n = 0; },
    end() {
      for (let i = 0; i < 3; i++) {
        const b = batches[i], m = meshes[i];
        m.geometry.instanceCount = b.n; m.visible = b.n > 0;
        if (b.n) { b.buf.clearUpdateRanges(); b.buf.addUpdateRange(0, b.n * STRIDE); b.buf.needsUpdate = true; }
      }
    },
    get stats() { return { tubes: T.n, discs: D.n, ribbons: Rb.n }; },
    dispose() { for (const m of meshes) { m.geometry.dispose(); m.material.dispose(); if (scene) scene.remove(m); } },
  };
}
