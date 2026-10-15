// 3D spell geometry for the fx module ("VFX in 3D WITH particles"): instanced, pooled, immediate-mode batches that draw INTO the same
// low-res scene target as terrain / sprites / particles, so everything pixelates together. The primitive set (decided once, every spell
// builds from it; no per-spell meshes):
//   tube    open cylinder / cone / ring band, any axis, optional arc (sweep < TAU): light columns, funnels, expanding rope rings, crescent
//           wave fronts, trailing fire cones. Fresnel body, spiral energy bands, descending front, soft arc ends
//   disc    flat ground quad shaded in the fragment: ring, targeting circle, shockwave, frost/glow fill   (modes 0..3, see DISC)
//   bolt    camera-facing ribbon strips (lightning): main path + forks, segments re-randomised by the caller every few frames
//   orb     flat-shaded low-poly icosphere, oriented + non-uniformly scaled: energy spheres (GLOW), ice blobs / chunks (ICE)
//   shard   flat-shaded hexagonal bipyramid (long crystal), oriented + scaled: icicles, ice spikes (ICE) or glowing slivers (GLOW)
//   rock    the orb mesh drawn OPAQUE (lit dark body + HDR lava cracks): the only non-additive primitive (additive cannot make dark);
//           writes depth, never the alpha channel
// Immediate mode like quads.js: call G.* every frame from a c.run callback; G.begin() / G.end() bracket the frame (fx/index.js).
// Nothing is allocated per frame: pass shared option bags (made once per cast) and colour arrays (made once).
// Look: additive, stepped quantised intensity (no smooth fades), alpha channel left alone (scene alpha = water mask, see beams.js),
// depth-tested, fog-of-war aware. Shells stay below the 1.4 bloom threshold, HDR cores (colour > 1.4) bloom.
// Quality: G.lod follows the particle density preset (quality.js particles: low .3 -> 0, medium .6 -> 1, high/ultra 1 -> 2). lod 0 swaps
// tubes to 12 sides and orbs / rocks to the bare icosahedron (20 faces); recipes read G.lod to drop counts / outer shells.
// Coordinates are WORLD (x east, y north, z up); the batches convert to three (x, z, -y).
import * as THREE from 'three';
import { COMMON_GLSL, UNIFORMS_GLSL } from '../shaderlib.js';

export const MAX_TUBES = 48;
export const MAX_DISCS = 64;
export const MAX_RIB = 1024;         // ribbon instances (2 per bolt segment: glow + core)
export const MAX_BOLT_SEG = 56;
export const MAX_ORBS = 128;
export const MAX_SHARDS = 96;
export const MAX_ROCKS = 4;
const BOLTS = 20;
const STRIDE = 16;                   // 4 vec4 per instance (disc, ribbon)
const TUBE_STRIDE = 24;              // 6 vec4
const SOLID_STRIDE = 24;             // 6 vec4 (orb, shard, rock)
const TUBE_SEG = 24;
const TAU = Math.PI * 2;
/** solid shading modes */
export const GLOW = 0, ICE = 1, MOLTEN = 2;

// ------------------------------------------------------------------------------------------------------------------------------ shaders
const HASH = /* glsl */ `float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`;
// fog-of-war dim, same remap particles.js uses
const FOGK = /* glsl */ `float fogK(vec3 w){ float fb = fogBright(w, gl_FragCoord.xy); return clamp((fb - uFogLv.x) / (1. - uFogLv.x), 0., 1.); }`;
const OUT = /* glsl */ `
vec4 outCol(vec3 col, float v, float n){            // stepped intensity bands (no ordered dither: it read as a fine white grid), faint tail stays smooth; alpha untouched
  float q = floor(v * n + .5) / n; if (q < .5 / n) q = v;
  return vec4(col * q, 0.);
}`;

const TUBE_VERT = /* glsl */ `
attribute vec2 aRing;      // u around (0..1 of the sweep), t along the axis (0 = base, 1 = top)
attribute vec4 aP;         // base (three coords), height
attribute vec4 aR;         // r0, r1, seed, fresnel power
attribute vec4 aC;         // rgb (HDR), alpha gain
attribute vec4 aS;         // front (0..1: fragment hidden below it, a descending head), swirl amount, phase, top-fade start
attribute vec4 aQ;         // axis (three coords, unit), sweep (rad, TAU = closed)
attribute vec4 aU;         // start angle (world yaw for a vertical axis), arc end fade (fraction of the sweep), -, -
varying vec3 vN, vW, vC; varying float vT, vH, vA, vK, vU; varying vec4 vS, vR, vQ;
void main(){
  float t = aRing.y;
  float rad = mix(aR.x, aR.y, t);
  vec3 A = aQ.xyz;
  vec3 e1 = abs(A.y) > .999 ? vec3(1., 0., 0.) : normalize(cross(A, vec3(0., 1., 0.)));
  vec3 e2 = cross(A, e1);                                                       // vertical axis: e1 cos + e2 sin = world yaw (x, -z)
  float ang = aU.x + aRing.x * aQ.w;
  vec3 dir = e1 * cos(ang) + e2 * sin(ang);
  vec3 wp = aP.xyz + A * (aP.w * t) + dir * rad;
  vN = dir;
  vW = wp; vC = aC.rgb; vK = aC.w; vT = t; vH = aP.w; vS = aS; vR = aR; vU = aRing.x; vQ = vec4(aQ.w, aU.y, 0., 0.);
  vA = ang;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.);
}`;
const TUBE_FRAG = /* glsl */ `
precision highp float;
${COMMON_GLSL}
${FOGK}
${OUT}
varying vec3 vN, vW, vC; varying float vT, vH, vA, vK, vU; varying vec4 vS, vR, vQ;
void main(){
  if (vT < vS.x) discard;
  vec3 V = normalize(uCamPos - vW);
  float ndv = abs(dot(vN, V));
  float v = pow(ndv, vR.w);                                                     // thick through the middle, dithers away at the silhouette
  v *= 1. - smoothstep(vS.w, 1., vT);                                           // gone before the sky end
  if (vQ.x < 6.28) { float e = max(vQ.y, .001); v *= smoothstep(0., e, vU) * smoothstep(0., e, 1. - vU); }   // soft arc ends
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

// solids (orb / shard / rock): same instance layout, flat facets from screen derivatives
const SOLID_VERT = /* glsl */ `
attribute vec4 aP;         // centre / base (three coords), size (radius; shard: length)
attribute vec4 aQ;         // orientation quaternion (three space)
attribute vec4 aS;         // local stretch x, y (long axis), z; lump amount (vertex noise, fraction of size)
attribute vec4 aC;         // rgb (HDR), alpha gain
attribute vec4 aM;         // mode (0 GLOW, 1 ICE, 2 MOLTEN), seed, p1, p2
attribute vec4 aD;         // sprite depth: x = ground height (three y), y = on (> .5), z = pull toward the camera (world units)
varying vec3 vW, vL, vC; varying float vK; varying vec4 vM;
vec3 qrot(vec4 q, vec3 v){ return v + 2. * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
float h31(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main(){
  vec3 lp = position * (1. + aS.w * (h31(position * 3.1 + aM.y) - .5));       // shared vertices move together: lumpy, never cracked
  vec3 wp = aP.xyz + qrot(aQ, lp * aS.xyz * aP.w);
  vW = wp; vL = position; vC = aC.rgb; vK = aC.w; vM = aM;
  vec4 cr = projectionMatrix * viewMatrix * vec4(wp, 1.);
  if (aD.y > .5) {   // one depth for the whole solid: its centre dropped to the ground, like a sprite / voxel unit foot (mesh3d DEPTH_GLSL)
    vec4 cf = projectionMatrix * viewMatrix * vec4(aP.x, aD.x, aP.z + aD.z, 1.);
    cr.z = cf.z / cf.w * cr.w;
  }
  gl_Position = cr;
}`;
const FACET = /* glsl */ `
vec3 facetN(vec3 w){ vec3 c = cross(dFdx(w), dFdy(w)), V = uCamPos - w; float l = length(c);   // edge-on facets: zero cross -> NaN -> poisons bloom
  if (!(l > 1e-6)) return normalize(V); vec3 n = c / l; return dot(n, V) < 0. ? -n : n; }`;
// additive: GLOW = fresnel energy shell (p2 = centre fill 0..1), ICE = facets catch the key light + rim + a few glinting faces (p1 = glint share)
const SOLID_FRAG = /* glsl */ `
precision highp float;
${COMMON_GLSL}
${FOGK}
${OUT}
${HASH}
${FACET}
varying vec3 vW, vL, vC; varying float vK; varying vec4 vM;
void main(){
  vec3 n = facetN(vW);
  float ndv = clamp(dot(n, normalize(uCamPos - vW)), 0., 1.);
  float fh = hash21(vec2(dot(n, vec3(12.3, 45.6, 78.9)), vM.y));               // per-facet constant
  float v;
  if (vM.x < .5) v = mix(vM.w, 1., pow(1. - ndv, 1.6)) * (.8 + .4 * fh);
  else v = .22 + .45 * max(dot(n, uKeyDir), 0.) + .6 * pow(1. - ndv, 3.) + .5 * step(1. - vM.z, fh);
  v *= vK * fogK(vW);
  if (v <= .02) discard;
  gl_FragColor = outCol(vC, v, 5.);
}`;
// opaque rock: lit dark body + stepped HDR lava cracks (vC = lava colour, p1 = heat 0..1, p2 = crack scroll)
const ROCK_FRAG = /* glsl */ `
precision highp float;
${COMMON_GLSL}
${FOGK}
${FACET}
varying vec3 vW, vL, vC; varying float vK; varying vec4 vM;
void main(){
  vec3 n = facetN(vW);
  float ndv = clamp(dot(n, normalize(uCamPos - vW)), 0., 1.);
  vec3 body = vec3(.11, .075, .06) * (uAmb + uKeyCol * max(dot(n, uKeyDir), 0.));
  vec3 p = vL * 2.2 + vM.y;
  p += .45 * sin(p.yzx * 2.3 + vM.y);                                           // warped plane families -> irregular crack network
  vec3 sn = abs(sin(p * vec3(3.1, 2.7, 3.3) + vec3(vM.w, -vM.w * .7, 1.7)));
  float d = min(sn.x, min(sn.y, sn.z));                                          // distance-ish to the nearest crack line
  float crack = 1. - smoothstep(.07, .1 + .14 * vM.z, d);
  float e = crack * (.3 + .7 * vM.z) + vM.z * (.1 + .18 * pow(1. - ndv, 2.));    // cracks carry the heat; a faint hot rim
  e = floor(e * 4. + .5) / 4.;
  vec3 col = body + vC * e;
  col *= mix(.25, 1., fogK(vW)) * vK;
  gl_FragColor = vec4(col, 1.);
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
function makeBatch(geo, names, max, stride = STRIDE) {
  const data = new Float32Array(max * stride);
  const buf = new THREE.InstancedInterleavedBuffer(data, stride, 1); buf.setUsage(THREE.DynamicDrawUsage);
  names.forEach((nm, i) => geo.setAttribute(nm, new THREE.InterleavedBufferAttribute(buf, 4, i * 4)));
  geo.instanceCount = 0;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
  return { data, buf, n: 0, max, stride };
}
function material(vs, fs, uniforms, opaque) {
  return new THREE.ShaderMaterial({
    vertexShader: vs, fragmentShader: fs, uniforms: { ...uniforms },
    transparent: !opaque, depthTest: true, depthWrite: !!opaque, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: opaque ? THREE.ZeroFactor : THREE.OneFactor,
    blendSrcAlpha: opaque ? THREE.OneFactor : THREE.ZeroFactor, blendDstAlpha: opaque ? THREE.ZeroFactor : THREE.OneFactor,   // scene alpha = water mask: additive never writes it, the opaque rock covers it (alpha 1)
  });
}
/** Icosphere (subdivided once). The first 12 vertices are the icosahedron, so lod 0 swaps to idx0 (20 faces) with the same vertices. */
function icoGeo() {
  const t = (1 + Math.sqrt(5)) / 2;
  const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map((p) => { const l = Math.hypot(...p); return p.map((x) => x / l); });
  const f0 = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  const mid = new Map();
  const m = (a, b) => { const k = a < b ? a + '_' + b : b + '_' + a; if (mid.has(k)) return mid.get(k); const p = [0, 1, 2].map((i) => v[a][i] + v[b][i]); const l = Math.hypot(...p); v.push(p.map((x) => x / l)); mid.set(k, v.length - 1); return v.length - 1; };
  const f1 = [];
  for (const [a, b, c] of f0) { const ab = m(a, b), bc = m(b, c), ca = m(c, a); f1.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v.flat()), 3));
  const idx1 = new THREE.BufferAttribute(new Uint16Array(f1.flat()), 1), idx0 = new THREE.BufferAttribute(new Uint16Array(f0.flat()), 1);
  g.setIndex(idx1);
  return { g, idx0, idx1 };
}
/** Hexagonal bipyramid from its base point (y = 0) to the tip (y = 1): a long crystal. Radius 1 at the shoulder (stretch x/z = width). */
function shardGeo() {
  const v = [[0, 0, 0]], idx = [];
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; v.push([Math.cos(a) * 0.8, 0.18, Math.sin(a) * 0.8]); }
  for (let i = 0; i < 6; i++) { const a = (i / 6 + 1 / 12) * TAU; v.push([Math.cos(a), 0.62, Math.sin(a)]); }
  v.push([0, 1, 0]);
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6, l0 = 1 + i, l1 = 1 + j, u0 = 7 + i, u1 = 7 + j;
    idx.push(0, l1, l0, l0, l1, u0, l1, u1, u0, u0, u1, 13);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v.flat()), 3));
  g.setIndex(idx);
  return g;
}
const QUAD = () => {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('corner', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
};

const DEF = {};
// orientation scratch (no allocation): quaternion of yaw (world z) * pitch (tilt of the long axis toward the yaw direction) * roll (about the long axis)
const _q = [0, 0, 0, 1];
function quat(yaw, pitch, roll) {
  const ys = Math.sin(yaw / 2), yc = Math.cos(yaw / 2), ps = Math.sin(-pitch / 2), pc = Math.cos(-pitch / 2), rs2 = Math.sin(roll / 2), rc = Math.cos(roll / 2);
  // a = yaw (about three Y) * pitch (about three Z)
  const ax = ys * ps, ay = ys * pc, az = yc * ps, aw = yc * pc;
  // a * roll (about three Y)
  _q[0] = ax * rc - az * rs2; _q[1] = aw * rs2 + ay * rc; _q[2] = az * rc + ax * rs2; _q[3] = aw * rc - ay * rs2;
  return _q;
}
export function createGeo3d({ scene, uniforms, particles }) {
  // tube: (TUBE_SEG + 1) columns, no wrap index, so an arc (sweep < TAU) never closes with a chord; lod 0 uses every other column
  const tg = new THREE.InstancedBufferGeometry();
  const ring = [], tIdx1 = [], tIdx0 = [];
  for (let i = 0; i <= TUBE_SEG; i++) { const u = i / TUBE_SEG; ring.push(u, 0, u, 1); }
  for (let i = 0; i < TUBE_SEG; i++) { const a0 = i * 2, a1 = a0 + 1, b0 = a0 + 2, b1 = a0 + 3; tIdx1.push(a0, b0, a1, b0, b1, a1); }
  for (let i = 0; i < TUBE_SEG; i += 2) { const a0 = i * 2, a1 = a0 + 1, b0 = a0 + 4, b1 = a0 + 5; tIdx0.push(a0, b0, a1, b0, b1, a1); }
  tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array((ring.length / 2) * 3), 3));
  tg.setAttribute('aRing', new THREE.BufferAttribute(new Float32Array(ring), 2));
  const tI1 = new THREE.BufferAttribute(new Uint16Array(tIdx1), 1), tI0 = new THREE.BufferAttribute(new Uint16Array(tIdx0), 1);
  tg.setIndex(tI1);
  const T = makeBatch(tg, ['aP', 'aR', 'aC', 'aS', 'aQ', 'aU'], MAX_TUBES, TUBE_STRIDE);
  // disc
  const dg = QUAD(); const D = makeBatch(dg, ['aP', 'aR', 'aC', 'aS'], MAX_DISCS);
  // ribbon
  const rg = QUAD(); const Rb = makeBatch(rg, ['aA', 'aB', 'aC', 'aM'], MAX_RIB);
  // solids
  const SOL = ['aP', 'aQ', 'aS', 'aC', 'aM', 'aD'];
  const ico = icoGeo(), ico2 = icoGeo();
  const O = makeBatch(ico.g, SOL, MAX_ORBS, SOLID_STRIDE);
  const sg = shardGeo(); const S = makeBatch(sg, SOL, MAX_SHARDS, SOLID_STRIDE);
  const K = makeBatch(ico2.g, SOL, MAX_ROCKS, SOLID_STRIDE);

  const meshes = [
    [tg, TUBE_VERT, TUBE_FRAG, 'fx3d_tube', 16.5], [dg, DISC_VERT, DISC_FRAG, 'fx3d_disc', 16.2], [rg, RIB_VERT, RIB_FRAG, 'fx3d_bolt', 17],
    [ico.g, SOLID_VERT, SOLID_FRAG, 'fx3d_orb', 16.4], [sg, SOLID_VERT, SOLID_FRAG, 'fx3d_shard', 16.3], [ico2.g, SOLID_VERT, ROCK_FRAG, 'fx3d_rock', 16.1, true],
  ].map(([g, vs, fs, name, ro, opaque]) => {
    const m = new THREE.Mesh(g, material(vs, fs, uniforms, opaque)); m.frustumCulled = false; m.renderOrder = ro; m.name = name; m.visible = false;
    if (scene) scene.add(m);
    return m;
  });
  const batches = [T, D, Rb, O, S, K];

  // quality: particle density preset -> lod (0 low, 1 medium, 2 high / ultra)
  let lod = 2;
  function setLod() {
    const v = particles && particles.scale ? particles.scale.v : 1;
    const l = v < 0.45 ? 0 : v < 0.8 ? 1 : 2;
    if (l === lod) return;
    lod = l;
    tg.setIndex(l ? tI1 : tI0); ico.g.setIndex(l ? ico.idx1 : ico.idx0); ico2.g.setIndex(l ? ico2.idx1 : ico2.idx0);
  }

  /** Column / cone / beam / ring band / arc. (x,y,z) = base centre in world coords, h = height along the axis, r0/r1 = base/top radius,
   *  col = [r,g,b] HDR, a = alpha gain (dithers).
   *  o: {front (0..1, hides everything below it: a column dropping from the sky), swirl (0..1 spiral bands), phase (spiral scroll), pow (fresnel power, 2 = soft shell, 0.6 = solid core, 0 = flat),
   *      flare (1 = ground flare at the base), top (fade start 0..1),
   *      axis [x,y,z] (world, unit; default up), sweep (rad, default TAU = closed), start (rad, world yaw of the arc start), edge (arc end fade, fraction of the sweep, default .2)} */
  function tube(x, y, z, h, r0, r1, col, a, o) {
    if (T.n >= T.max || a <= 0 || (window.__gm & 1)) return false;
    o = o || DEF;
    const d = T.data, i = T.n++ * TUBE_STRIDE;
    d[i] = x; d[i + 1] = z; d[i + 2] = -y; d[i + 3] = h;
    d[i + 4] = r0; d[i + 5] = r1; d[i + 6] = o.flare ? 1 : 0; d[i + 7] = o.pow == null ? 2 : o.pow;
    d[i + 8] = col[0]; d[i + 9] = col[1]; d[i + 10] = col[2]; d[i + 11] = a;
    d[i + 12] = o.front || 0; d[i + 13] = o.swirl || 0; d[i + 14] = o.phase || 0; d[i + 15] = o.top == null ? 0.85 : o.top;
    const ax = o.axis;
    if (ax) { d[i + 16] = ax[0]; d[i + 17] = ax[2]; d[i + 18] = -ax[1]; } else { d[i + 16] = 0; d[i + 17] = 1; d[i + 18] = 0; }
    d[i + 19] = o.sweep || TAU; d[i + 20] = o.start || 0; d[i + 21] = o.edge == null ? 0.2 : o.edge; d[i + 22] = 0; d[i + 23] = 0;
    return true;
  }
  function solid(B, x, y, z, size, sx, sy, sz, yaw, pitch, roll, col, a, mode, o) {
    if (B.n >= B.max || a <= 0 || size <= 0 || (window.__gm & (B === K ? 2 : 4))) return false;
    o = o || DEF;
    const q = quat(yaw || 0, pitch || 0, roll || 0), d = B.data, i = B.n++ * SOLID_STRIDE;
    d[i] = x; d[i + 1] = z; d[i + 2] = -y; d[i + 3] = size;
    d[i + 4] = q[0]; d[i + 5] = q[1]; d[i + 6] = q[2]; d[i + 7] = q[3];
    d[i + 8] = sx; d[i + 9] = sy; d[i + 10] = sz; d[i + 11] = o.lump || 0;
    d[i + 12] = col[0]; d[i + 13] = col[1]; d[i + 14] = col[2]; d[i + 15] = a;
    d[i + 16] = mode; d[i + 17] = o.seed || 0; d[i + 18] = o.p1 || 0; d[i + 19] = o.p2 || 0;
    if (o.foot != null) { d[i + 20] = o.foot; d[i + 21] = 1; d[i + 22] = o.footPull == null ? 8 : o.footPull; } else { d[i + 20] = 0; d[i + 21] = 0; d[i + 22] = 0; }
    d[i + 23] = 0;
    return true;
  }
  /** Low-poly sphere / ellipsoid at its centre (x,y,z), radius R. mode GLOW (fresnel shell, o.p2 = centre fill) or ICE (lit facets, o.p1 = glint share).
   *  o: {sx, sy (long / vertical axis), sz (stretch, default 1), yaw, pitch, roll, lump (vertex noise, fraction of R), seed, p1, p2,
   *      foot (world z of the ground: sprite depth, see below), footPull (default 8)}
   *  foot (all solids): voxel units / props write the depth of their FOOT (mesh3d propDepth), not of each voxel, so a solid floating at body
   *  height would win the depth test even behind them. With o.foot the whole solid takes the depth of its centre's ground point pulled
   *  o.footPull toward the camera (+z): it is hidden whole by a unit iff it sits behind that unit's foot card (voxel units: foot + 20),
   *  never cut in half by the body (Invoker orbs, anything circling a hero). */
  function orb(x, y, z, R, col, a, mode, o) {
    o = o || DEF;
    return solid(O, x, y, z, R, o.sx || 1, o.sy || 1, o.sz || 1, o.yaw, o.pitch, o.roll, col, a, mode || 0, o);
  }
  /** Long crystal from its base point (x,y,z) to the tip, length L, shoulder radius w. yaw = world heading of the lean, pitch = lean from vertical
   *  (0 upright, PI/2 lying along yaw), roll = spin about its own axis. mode ICE / GLOW, o: {lump, seed, p1, p2} */
  function shard(x, y, z, L, w, yaw, pitch, roll, col, a, mode, o) {
    return solid(S, x, y, z, L, w / L, 1, w / L, yaw, pitch, roll, col, a, mode == null ? 1 : mode, o);
  }
  /** Opaque lava rock at its centre: radius R, lava = HDR crack colour, heat 0..1 (crack width / glow), spin = crack scroll phase. o: {sx, sy, sz, yaw, pitch, roll, lump, seed} */
  function rock(x, y, z, R, lava, heat, spin, a, o) {
    o = o || DEF;
    if (K.n >= K.max) return false;
    const ok = solid(K, x, y, z, R, o.sx || 1, o.sy || 1, o.sz || 1, o.yaw, o.pitch, o.roll, lava, a == null ? 1 : a, 2, o);
    if (ok) { const i = (K.n - 1) * SOLID_STRIDE; K.data[i + 18] = heat; K.data[i + 19] = spin || 0; }
    return ok;
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
  for (let i = 0; i < BOLTS; i++) { const b = mkBolt(); b.id = i + 1; bfree.push(b); }
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

  return {
    tube, disc, bolt, newBolt, free, genBolt, orb, shard, rock, meshes, GLOW, ICE,
    /** 0 low, 1 medium, 2 high / ultra (from the particle density preset) */
    get lod() { return lod; },
    begin() { setLod(); for (let i = 0; i < batches.length; i++) batches[i].n = 0; },
    end() {
      for (let i = 0; i < batches.length; i++) {
        const b = batches[i], m = meshes[i];
        m.geometry.instanceCount = b.n; m.visible = b.n > 0;
        if (b.n) { b.buf.clearUpdateRanges(); b.buf.addUpdateRange(0, b.n * b.stride); b.buf.needsUpdate = true; }
      }
    },
    get stats() { return { tubes: T.n, discs: D.n, ribbons: Rb.n, orbs: O.n, shards: S.n, rocks: K.n }; },
    dispose() { for (const m of meshes) { m.geometry.dispose(); m.material.dispose(); if (scene) scene.remove(m); } },
  };
}
