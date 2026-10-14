// GPU particle pool. A ring buffer of 32768 particles; every particle is a camera-facing quad integrated ANALYTICALLY in the vertex shader
// from its birth data (position, velocity, gravity, linear drag, rotation/spin, size and colour lerp). The CPU only writes newly spawned
// slots (addUpdateRange), never touches live particles. Additive blending, depth-tested (no depth write), HDR colours feed the bloom.
//
//   particles.burst({ x,y,z, count, ... })          one-shot
//   particles.emitter({ x,y,z, rate, duration, ... }) -> { set(x,y,z), stop(), alive }   continuous (rate = particles/s)
//   particles.spawn(p)                              a single particle
// Shared options (all optional; scalars or [min,max] ranges):
//   speed, life, size0/size1 (world units), px/px1 (size in ART pixels), col0/col1 ([r,g,b], HDR), a0/a1 (alpha),
//   gravity (accel along +z up, negative falls), drag (1/s), spin (rad/s), rot, shape 'point'|'sphere'|'disc'|'ring'|'cone'|'line',
//   radius, dir [dx,dy,dz], spread (rad, cone), up (extra initial z speed), x2/y2/z2 (line end), mode 'glow'|'square'|'stamp',
//   stamp ('p_spark', ... from the fx sheet), delay.
// Pixel look (Noita):
//   mode 'square' snaps the quad to whole art pixels (min 1 art px) on the render-target pixel grid, so small sparks are exact 1-2 px squares.
//   o.px sets the size directly in art pixels (implies mode 'square' unless a mode / stamp is given).
//   o.ramp: stepped cooling ramp name (see RAMPS): 5 colours hot -> cold picked by age, NO lerp, dithers out over the last fifth of life.
//     o.rampTint [r,g,b] multiplies the ramp (e.g. a brighter or dimmer heat).
//   o.settle: a particle with negative gravity lands on the terrain at its spawn xy (landing time solved on the CPU), freezes there
//     ("settled grain"), keeps cooling and dithers away. Default ON for non-glow particles with negative gravity; o.settle=false disables.
//     Lifetime is stretched to (landing + o.linger, default 0.35-0.9 s) when it would end earlier. o.bounce = one hop on landing
//     (default: ~30% of square sparks). o.keep = never thinned by the pool budget.
import * as THREE from 'three';
import { COMMON_GLSL, UNIFORMS_GLSL } from './shaderlib.js';

export const POOL = 32768;
const STRIDE = 32;
const GROUND_EPS = 1.5;      // settled grains sit this far above the terrain height (world units)
const MAX_LIFE = 4.5;        // seconds: cap for settle-stretched lifetimes
const BUDGET = 20000;        // decayed spawn count above which new particles are thinned (see density)

/** Stepped cooling ramps, hot -> cold. Only the first two steps are HDR (they bloom); the rest sit below the bloom threshold. */
export const RAMPS = {
  fire:   [[5.0, 3.6, 1.6], [3.4, 1.7, 0.45], [1.25, 0.5, 0.1], [0.62, 0.12, 0.04], [0.2, 0.05, 0.03]],
  spark:  [[5.4, 5.0, 3.8], [4.0, 2.9, 0.8], [1.3, 0.62, 0.12], [0.7, 0.14, 0.05], [0.24, 0.06, 0.04]],
  ice:    [[4.4, 5.6, 6.2], [1.9, 3.6, 5.2], [0.55, 1.15, 1.2], [0.22, 0.5, 0.95], [0.08, 0.2, 0.42]],
  arcane: [[5.0, 3.6, 6.2], [3.0, 1.5, 5.4], [1.15, 0.45, 1.25], [0.5, 0.18, 0.95], [0.16, 0.07, 0.4]],
  poison: [[3.2, 5.8, 3.0], [1.9, 4.2, 0.9], [0.65, 1.2, 0.2], [0.28, 0.6, 0.12], [0.1, 0.22, 0.07]],
  holy:   [[6.0, 5.6, 4.0], [5.0, 3.8, 1.2], [1.35, 0.95, 0.3], [0.8, 0.5, 0.12], [0.3, 0.2, 0.08]],
  blood:  [[5.0, 1.7, 1.2], [3.4, 0.55, 0.4], [1.15, 0.2, 0.12], [0.58, 0.08, 0.06], [0.2, 0.03, 0.03]],
  volt:   [[5.6, 5.9, 6.4], [2.6, 3.8, 6.0], [0.7, 1.15, 1.3], [0.3, 0.5, 1.0], [0.1, 0.18, 0.45]],
  dark:   [[4.6, 2.0, 5.2], [2.9, 0.9, 4.2], [1.1, 0.3, 1.2], [0.5, 0.12, 0.85], [0.14, 0.04, 0.32]],
  steel:  [[5.6, 6.0, 6.4], [3.4, 3.7, 4.6], [1.2, 1.3, 1.35], [0.6, 0.65, 0.8], [0.22, 0.24, 0.32]],
  pink:   [[6.0, 3.6, 4.6], [4.0, 1.5, 3.0], [1.3, 0.4, 0.85], [0.65, 0.16, 0.45], [0.22, 0.06, 0.18]],
  earth:  [[3.6, 3.0, 2.0], [2.2, 1.6, 0.8], [0.95, 0.7, 0.34], [0.5, 0.36, 0.2], [0.2, 0.15, 0.1]],
};
export const RAMP_NAMES = Object.keys(RAMPS);
const RAMP_ID = Object.fromEntries(RAMP_NAMES.map((n, i) => [n, i]));
// age fractions at which the ramp advances to the next colour (the hot colours are short-lived)
const RT = [0.1, 0.26, 0.5, 0.76].map((v) => v.toFixed(3));

const VERT = /* glsl */ `
${UNIFORMS_GLSL}
uniform vec3 uRamp[${RAMP_NAMES.length * 5}];
attribute vec2 corner;
attribute vec4 aP0;      // birth pos xyz, birth time
attribute vec4 aV0;      // birth vel xyz, life
attribute vec4 aSz;      // size0, size1, rot0, spin
attribute vec4 aPh;      // gravity, drag, mode, alpha0
attribute vec4 aC0;      // rgb0, alpha1
attribute vec4 aC1;      // rgb1 (ramp: tint), env flag
attribute vec4 aUv;      // uv rect
attribute vec4 aG;       // ground height (three y), flags (1 settle, 2 px-size, 4 bounce), ramp id (-1 none), landing time (-1 never)
varying vec2 vQ;
varying vec4 vC;
varying vec4 vUv;
varying float vMode;
varying vec3 vWorld;
varying float vD;
void main(){
  float age = uTime - aP0.w;
  float life = aV0.w;
  vD = 1.;
  if (age < 0. || age >= life) { gl_Position = vec4(2., 2., 2., 1.); vC = vec4(0.); vQ = vec2(0.); vUv = aUv; vMode = 0.; vWorld = vec3(0.); return; }
  float g = aPh.x, d = aPh.y;
  float fl = aG.y;
  bool settle = mod(fl, 2.) > .5, pxs = mod(floor(fl / 2.), 2.) > .5, bounce = mod(floor(fl / 4.), 2.) > .5;
  float tl = aG.w;
  vec3 gv = vec3(0., g, 0.);
  float ta = (settle && tl >= 0.) ? min(age, tl) : age;
  vec3 p;
  if (d < 1e-3) p = aP0.xyz + aV0.xyz * ta + .5 * gv * ta * ta;
  else {
    float e = exp(-d * ta);
    p = aP0.xyz + gv * (ta / d) + (aV0.xyz - gv / d) * ((1. - e) / d);
  }
  if (settle) {
    if (bounce && tl >= 0. && age > tl && g < 0.) {              // one hop after landing, then freeze
      vec3 v = d < 1e-3 ? aV0.xyz + gv * tl : (aV0.xyz - gv / d) * exp(-d * tl) + gv / d;
      float vb = -v.y * .36;
      float tb = min(age - tl, 2. * vb / -g);
      p.xz += v.xz * .45 * tb;
      p.y = aG.x + vb * tb + .5 * g * tb * tb;
    }
    p.y = max(p.y, aG.x);
  }
  float k = age / life;
  float size = mix(aSz.x, aSz.y, k);
  vec3 col; float a;
  if (aG.z > -.5) {                                   // stepped cooling ramp, no lerp
    int st = k < ${RT[0]} ? 0 : k < ${RT[1]} ? 1 : k < ${RT[2]} ? 2 : k < ${RT[3]} ? 3 : 4;
    col = uRamp[int(aG.z + .5) * 5 + st] * aC1.rgb;
    a = aPh.w; vD = clamp((1. - k) / .2, 0., 1.);
  } else {
    col = mix(aC0.rgb, aC1.rgb, k);
    a = mix(aPh.w, aC0.w, k);
    if (aC1.w > .5) a *= sin(3.14159 * k);
    if (settle) { a = aPh.w; vD = clamp((1. - k) / .25, 0., 1.); }
  }
  vC = vec4(col, a);
  vUv = aUv; vMode = aPh.z; vWorld = p; vQ = corner;
  bool pix = pxs || (aPh.z > .5 && aPh.z < 1.5);
  if (pix) {                                          // pixel-grid snapped square, whole art pixels, min 1
    p += normalize(uCamPos - p) * 2.5;
    vec4 cp = projectionMatrix * viewMatrix * vec4(p, 1.);
    if (cp.w <= 0.) { gl_Position = vec4(2., 2., 2., 1.); return; }
    float apx = max(1., floor(uArtPx + .5));          // render-target px per art px
    float n = pxs ? max(1., floor(size * 2. + .5)) : max(1., floor(size * 2. * uPxK / cp.w / apx + .5));
    float wpx = n * apx;
    vec2 c = (cp.xy / cp.w * .5 + .5) * uRT;
    vec2 lo = floor(c - wpx * .5 + .5);
    vec2 ndc = (lo + corner * wpx) / uRT * 2. - 1.;
    gl_Position = vec4(ndc * cp.w, cp.z, cp.w);
    return;
  }
  float rot = aSz.z + aSz.w * age;
  vec2 q = corner * 2. - 1.;
  float cs = cos(rot), sn = sin(rot);
  vec2 qr = vec2(q.x * cs - q.y * sn, q.x * sn + q.y * cs);
  vec3 w = p + (uCamRight * qr.x + uCamUp * qr.y) * size;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.);
}`;

const FRAG = /* glsl */ `
precision highp float;
${COMMON_GLSL}
uniform sampler2D tAtlas;
varying vec2 vQ;
varying vec4 vC;
varying vec4 vUv;
varying float vMode;
varying vec3 vWorld;
varying float vD;
void main(){
  if (vC.a <= 0.002) discard;
  vec3 col = vC.rgb; float a = vC.a;
  vec2 dp = floor(gl_FragCoord.xy);
  if (vD < 1. && bayer4(dp) >= vD) discard;     // ordered-dither fade-out (settled grains and ramp particles)
  if (vMode < .5) {                       // soft round glow, dithered to 5 steps
    float r = length(vQ * 2. - 1.);
    if (r >= 1.) discard;
    float f = (1. - r); f = f * f;
    a *= floor(f * 5. + bayer4(dp)) / 5.;
    if (a <= 0.) discard;
  } else if (vMode < 1.5) {               // hard square (pixel spark)
    // nothing: full quad
  } else {                                // stamp from the fx sheet (white, tinted)
    vec4 t = texture2D(tAtlas, vec2(mix(vUv.x, vUv.z, vQ.x), mix(vUv.y, vUv.w, 1. - vQ.y)));
    if (t.a < .5) discard;
    col *= t.rgb;
  }
  float fg = fogBright(vWorld, dp);
  fg = clamp((fg - uFogLv.x) / (1. - uFogLv.x), 0., 1.);
  gl_FragColor = vec4(col * a * fg, 1.);
}`;

const rnd = (a, b) => a + Math.random() * (b - a);
const num = (v, d) => (v == null ? d : Array.isArray(v) ? rnd(v[0], v[1]) : v);

/** Time (from birth) at which a particle starting at height z0 with vertical speed vz, gravity g (<0 falls) and drag d reaches height G; -1 = never within T. */
function landTime(z0, vz, g, d, G, T) {
  if (z0 <= G) return 0;
  if (d < 1e-3) {
    if (g < -1e-6) { const D = vz * vz - 2 * g * (z0 - G); return (-vz - Math.sqrt(D)) / g; }
    return vz < -1e-6 ? (z0 - G) / -vz : -1;
  }
  const zf = (t) => z0 + g * (t / d) + (vz - g / d) * ((1 - Math.exp(-d * t)) / d);
  if (zf(T) > G) return -1;
  let a = 0, b = T;
  for (let i = 0; i < 14; i++) { const m = (a + b) * 0.5; if (zf(m) > G) a = m; else b = m; }
  return b;
}

export function createParticles({ scene, uniforms, atlas, heightAt, getView }) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('corner', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const data = new Float32Array(POOL * STRIDE);
  const buf = new THREE.InstancedInterleavedBuffer(data, STRIDE, 1); buf.setUsage(THREE.DynamicDrawUsage);
  const names = ['aP0', 'aV0', 'aSz', 'aPh', 'aC0', 'aC1', 'aUv', 'aG'];
  names.forEach((n, i) => geo.setAttribute(n, new THREE.InterleavedBufferAttribute(buf, 4, i * 4)));
  geo.instanceCount = POOL;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
  const rampData = new Float32Array(RAMP_NAMES.length * 15);
  RAMP_NAMES.forEach((n, i) => RAMPS[n].forEach((c, j) => rampData.set(c, i * 15 + j * 3)));
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { ...uniforms, tAtlas: { value: atlas.texture }, uRamp: { value: rampData } },
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 20; mesh.name = 'particles';
  scene.add(mesh);

  const uvCache = new Map();
  function stampUv(name) {
    let r = uvCache.get(name); if (r) return r;
    const f = atlas.frame('fx', name);
    r = f ? [f.u0, f.v0, f.u1, f.v1, f.w] : [0, 0, 1, 1, 8];
    uvCache.set(name, r); return r;
  }

  let head = 0, live = 0, now = 0, spawnedFrame = 0, dirtyFrom = -1, dirtyTo = -1;
  const total = { spawned: 0, thinned: 0 };
  const emitters = [];
  const scale = { v: 1 };      // global density multiplier (setting "particles")
  let win = 0, density = 1;    // decayed spawn counter -> density (1 = full, <1 = thin new non-keep particles so the ring never eats live ones)
  let gx = 1e9, gy = 1e9, gz = 0;
  const ground = (x, y) => {     // terrain height with a tiny memo (bursts spawn clustered)
    if (!heightAt) return 0;
    if (Math.abs(x - gx) < 30 && Math.abs(y - gy) < 30) return gz;
    gx = x; gy = y; gz = heightAt(x, y); return gz;
  };

  function mark(i) { if (dirtyFrom < 0) { dirtyFrom = i; dirtyTo = i + 1; } else { if (i < dirtyFrom) dirtyFrom = i; if (i + 1 > dirtyTo) dirtyTo = i + 1; } }

  /** Write one particle. Position/velocity in WORLD coords (x east, y north, z up); stored as three coords. */
  function put(x, y, z, vx, vy, vz, o) {
    if (density < 1 && !o.keep && Math.random() > density) { total.thinned++; return; }
    win++;
    const i = head; head = (head + 1) % POOL;
    if (head === 0) { /* wrapped: a single dirty span would cover the whole pool; flush the pair as two ranges */ flushRange(); }
    const b = i * STRIDE;
    const pxMode = o.px != null;
    let mode = o.mode === 'stamp' || o.stamp ? 2 : o.mode === 'square' || (pxMode && !o.mode) ? 1 : 0;
    const uv = mode === 2 ? stampUv(o.stamp || 'p_spark') : null;
    const g = o.gravity == null ? 0 : o.gravity, drag = o.drag || 0;
    let s0, s1;
    if (pxMode) { s0 = num(o.px, 1); s1 = o.px1 != null ? num(o.px1, s0) : s0; }
    else { s0 = num(o.size0 != null ? o.size0 : o.size, 12); s1 = num(o.size1 != null ? o.size1 : o.size0 != null ? o.size0 : o.size, s0); }
    // ground settling
    const settle = o.settle != null ? !!o.settle : g < 0 && mode !== 0;
    let life = num(o.life, 1), flags = pxMode ? 2 : 0, gy0 = 0, tl = -1;
    if (settle) {
      flags |= 1;
      const G = ground(x, y) + GROUND_EPS; gy0 = G;
      tl = landTime(z, vz, g, drag, G, MAX_LIFE);
      if (tl >= 0) {
        if (g < 0 && (o.bounce != null ? o.bounce : mode === 1 && Math.random() < 0.3)) flags |= 4;
        const want = tl + num(o.linger, [0.35, 0.9]);
        if (want > life) life = Math.min(want, Math.max(life, MAX_LIFE));
      }
    }
    const ramp = o.ramp != null ? RAMP_ID[o.ramp] : undefined;
    const c0 = o.col0 || o.col || [1, 1, 1], c1 = ramp != null ? (o.rampTint || [1, 1, 1]) : (o.col1 || c0);
    data[b] = x; data[b + 1] = z; data[b + 2] = -y; data[b + 3] = now + (o.delay || 0);
    data[b + 4] = vx; data[b + 5] = vz; data[b + 6] = -vy; data[b + 7] = life;
    data[b + 8] = s0 * 0.5; data[b + 9] = s1 * 0.5; data[b + 10] = num(o.rot, 0); data[b + 11] = num(o.spin, 0);
    data[b + 12] = g; data[b + 13] = drag; data[b + 14] = mode; data[b + 15] = o.a0 == null ? 1 : o.a0;
    data[b + 16] = c0[0]; data[b + 17] = c0[1]; data[b + 18] = c0[2]; data[b + 19] = o.a1 == null ? 0 : o.a1;
    data[b + 20] = c1[0]; data[b + 21] = c1[1]; data[b + 22] = c1[2]; data[b + 23] = o.env ? 1 : 0;
    if (uv) { data[b + 24] = uv[0]; data[b + 25] = uv[1]; data[b + 26] = uv[2]; data[b + 27] = uv[3]; } else { data[b + 24] = 0; data[b + 25] = 0; data[b + 26] = 1; data[b + 27] = 1; }
    data[b + 28] = gy0; data[b + 29] = flags; data[b + 30] = ramp != null ? ramp : -1; data[b + 31] = tl;
    mark(i);
    if (live < POOL) live++;
    spawnedFrame++; total.spawned++;
  }
  function flushRange() {
    if (dirtyFrom < 0) return;
    buf.addUpdateRange(dirtyFrom * STRIDE, (dirtyTo - dirtyFrom) * STRIDE);
    buf.needsUpdate = true; dirtyFrom = -1; dirtyTo = -1;
  }

  function dirVec(o) {
    const d = o.dir || [0, 0, 1];
    let l = Math.hypot(d[0], d[1], d[2]) || 1;
    return [d[0] / l, d[1] / l, d[2] / l];
  }

  /** Spawn one particle with the shared option set, anchored at (x,y,z). */
  function spawn(o, x, y, z) {
    const shape = o.shape || 'point', R = num(o.radius, 0);
    let px = x, py = y, pz = z, dx = 0, dy = 0, dz = 0;
    switch (shape) {
      case 'sphere': { const u = Math.random() * 2 - 1, t = Math.random() * 6.2832, s = Math.sqrt(1 - u * u), r = R * Math.cbrt(Math.random()); dx = s * Math.cos(t); dy = s * Math.sin(t); dz = u; px += dx * r; py += dy * r; pz += dz * r; break; }
      case 'disc': { const t = Math.random() * 6.2832, r = R * Math.sqrt(Math.random()); dx = Math.cos(t); dy = Math.sin(t); px += dx * r; py += dy * r; break; }
      case 'ring': { const t = Math.random() * 6.2832; dx = Math.cos(t); dy = Math.sin(t); px += dx * R; py += dy * R; break; }
      case 'line': { const f = Math.random(); px = x + ((o.x2 != null ? o.x2 : x) - x) * f; py = y + ((o.y2 != null ? o.y2 : y) - y) * f; pz = z + ((o.z2 != null ? o.z2 : z) - z) * f; const t = Math.random() * 6.2832, u = Math.random() * 2 - 1, s = Math.sqrt(1 - u * u); dx = s * Math.cos(t); dy = s * Math.sin(t); dz = u; break; }
      case 'cone': {
        const D = dirVec(o), sp = o.spread == null ? 0.5 : o.spread;
        const t = Math.random() * 6.2832, a = Math.acos(1 - Math.random() * (1 - Math.cos(sp)));
        // basis around D
        const ax = Math.abs(D[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
        let ux = D[1] * ax[2] - D[2] * ax[1], uy = D[2] * ax[0] - D[0] * ax[2], uz = D[0] * ax[1] - D[1] * ax[0];
        const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
        const vx = D[1] * uz - D[2] * uy, vy = D[2] * ux - D[0] * uz, vz = D[0] * uy - D[1] * ux;
        const sa = Math.sin(a), ca = Math.cos(a), ct = Math.cos(t), st = Math.sin(t);
        dx = D[0] * ca + (ux * ct + vx * st) * sa; dy = D[1] * ca + (uy * ct + vy * st) * sa; dz = D[2] * ca + (uz * ct + vz * st) * sa;
        if (R) { px += dx * R; py += dy * R; pz += dz * R; }
        break;
      }
      default: { const t = Math.random() * 6.2832, u = Math.random() * 2 - 1, s = Math.sqrt(1 - u * u); dx = s * Math.cos(t); dy = s * Math.sin(t); dz = u; }
    }
    const sp = num(o.speed, 0);
    let vx = dx * sp, vy = dy * sp, vz = dz * sp;
    if (o.flat) vz = 0;
    if (o.up) vz += num(o.up, 0);
    if (o.vel) { vx += o.vel[0]; vy += o.vel[1]; vz += o.vel[2]; }
    if (o.jitter) { vx += rnd(-o.jitter, o.jitter); vy += rnd(-o.jitter, o.jitter); vz += rnd(-o.jitter, o.jitter); }
    put(px, py, pz, vx, vy, vz, o);
  }

  const api = {
    mesh, scale,
    spawn(o) { spawn(o, o.x, o.y, o.z || 0); },
    burst(o) {
      const n = Math.max(0, Math.round((o.count == null ? 10 : o.count) * (o.noScale ? 1 : scale.v)));
      const z = o.z != null ? o.z : heightAt ? heightAt(o.x, o.y) : 0;
      for (let i = 0; i < n; i++) spawn(o, o.x, o.y, z);
    },
    /** continuous emitter; o.rate = particles per second, o.duration seconds (default forever). o.follow() -> {x,y,z} updates the anchor. */
    emitter(o) {
      const e = { o, x: o.x, y: o.y, z: o.z != null ? o.z : (heightAt ? heightAt(o.x, o.y) : 0), t: 0, acc: 0, alive: true,
        set(x, y, z) { e.x = x; e.y = y; if (z != null) e.z = z; return e; },
        stop() { e.alive = false; } };
      emitters.push(e); return e;
    },
    /** advance emitters; time = renderer clock (the same value as uTime) */
    update(dt, time) {
      now = time;
      win *= Math.exp(-dt / 1.5);
      density = win > BUDGET ? BUDGET / win : 1;
      for (let i = emitters.length - 1; i >= 0; i--) {
        const e = emitters[i], o = e.o;
        if (!e.alive) { emitters.splice(i, 1); continue; }
        if (o.follow) { const p = o.follow(); if (p) { e.x = p.x; e.y = p.y; if (p.z != null) e.z = p.z; } else e.alive = false; }
        e.t += dt;
        if (o.duration != null && e.t > o.duration) { e.alive = false; continue; }
        e.acc += (o.rate || 20) * scale.v * dt;
        let n = Math.floor(e.acc); e.acc -= n; if (n > 600) n = 600;
        for (let k = 0; k < n; k++) spawn(o, e.x, e.y, e.z);
      }
    },
    /** upload new slots. Call once per frame after all spawns. */
    flush() { flushRange(); const s = spawnedFrame; spawnedFrame = 0; return s; },
    setTime(t) { now = t; },
    get time() { return now; },
    get emitterCount() { return emitters.length; },
    get spawned() { return total.spawned; },
    get thinned() { return total.thinned; },
    get density() { return density; },
    get pressure() { return win / BUDGET; },     // 1 = thinning starts
    get capacity() { return POOL; },
    clear() { data.fill(0); buf.addUpdateRange(0, data.length); buf.needsUpdate = true; emitters.length = 0; live = 0; win = 0; density = 1; },
    dispose() { geo.dispose(); mat.dispose(); },
  };
  // first upload: whole buffer
  buf.needsUpdate = true;
  return api;
}

// Base life: the map's ancients, fountains, lanterns and the buildings within BASE_R of an ancient. Read once from the map.
import { getMap, sideOf } from '../../../shared/map.js';
const BASE_R = 1500;   // base area radius around each ancient (world units)
const CULL = 300;      // anchors this far outside the camera rect are skipped

let layout = null;
function baseLayout() {
  if (layout) return layout;
  const E = getMap().ents;
  const sideOfEnt = (e) => (/bad/.test(e.name || '') ? 1 : /good/.test(e.name || '') ? 0 : sideOf(e.x, e.y));   // 0 Radiant, 1 Dire
  const ancients = (E.fort || []).map((e) => ({ x: e.x, y: e.y, side: sideOfEnt(e) }));
  const near = (e) => ancients.some((a) => Math.hypot(e.x - a.x, e.y - a.y) <= BASE_R);
  const bldgs = [...(E.tower || []), ...(E.barracks || []), ...(E.filler || [])].filter(near).map((e) => ({ x: e.x, y: e.y, side: sideOfEnt(e) }));
  layout = {
    ancients,
    fountains: (E.fountain || []).map((e) => ({ x: e.x, y: e.y, side: sideOfEnt(e) })),
    lanterns: (E.lantern || []).map((e) => ({ x: e.x, y: e.y })),
    bldgs,
  };
  return layout;
}

// Single base-life particles. Each takes the shared spawn options; positions are world coords (z up).
const radiantFirefly = (particles, cx, cy, cz) => {     // slow orbit around the crystal core
  const t = Math.random() * 6.2832, r = rnd(110, 260), s = rnd(10, 18) * (Math.random() < 0.5 ? -1 : 1);
  const teal = Math.random() < 0.6;
  particles.spawn({ x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r, z: cz + rnd(-60, 120), vel: [-Math.sin(t) * s, Math.cos(t) * s, 0],
    life: [5, 9], size0: [8, 12], size1: 8, col0: teal ? [0.5, 2.2, 1.6] : [0.9, 2.5, 0.6], col1: [0.4, 1.2, 0.8], a0: 1, a1: 1, env: true, mode: 'glow', drag: 0.25 });
};
const radiantMote = (particles, cx, cy, cz) => {        // pale motes lifting off the core
  particles.spawn({ x: cx + rnd(-30, 30), y: cy + rnd(-30, 30), z: cz + rnd(-20, 20), vel: [rnd(-3, 3), rnd(-3, 3), 0], up: rnd(16, 26), gravity: 2, drag: 0.35,
    life: [4, 7], size0: [5, 8], size1: 5, col0: [1.6, 1.9, 1.8], col1: [0.8, 1.0, 1.0], a0: 0.9, a1: 0, mode: 'glow', env: true });
};
const direEmber = (particles, cx, cy, cz) => {          // embers rising off the Dire ancient
  particles.spawn({ x: cx + rnd(-40, 40), y: cy + rnd(-40, 40), z: cz + rnd(-20, 20), vel: [rnd(-4, 4), rnd(-4, 4), 0], up: rnd(20, 32), gravity: 3, drag: 0.5,
    life: [2.2, 3.6], px: [1, 2], ramp: 'fire', a0: 1, a1: 1, env: true });
};
const direAsh = (particles, cx, cy, cz) => {            // grey ash drifting up
  particles.spawn({ x: cx + rnd(-60, 60), y: cy + rnd(-60, 60), z: cz + rnd(-30, 30), vel: [rnd(-5, 5), rnd(-5, 5), 0], up: rnd(5, 10), gravity: 0.6, drag: 0.4,
    life: [5, 8], px: [1.5, 2.5], col0: [0.42, 0.4, 0.38], col1: [0.22, 0.21, 0.2], a0: 0.8, a1: 0, env: true, settle: false });
};
const direFlicker = (particles, cx, cy, cz) => {        // faint red glow puffs that flicker in and out
  particles.spawn({ x: cx + rnd(-80, 80), y: cy + rnd(-80, 80), z: cz + rnd(-60, 40), life: [0.3, 0.8], size0: [60, 110], size1: 40,
    col0: [1.4, 0.2, 0.1], col1: [0.5, 0.06, 0.04], a0: 0.25, a1: 0, mode: 'glow', env: true });
};
const spray = (particles, x, y, z) => {                 // fine sparkling fountain spray
  particles.spawn({ x: x + rnd(-30, 30), y: y + rnd(-30, 30), z, shape: 'cone', dir: [0, 0, 1], spread: 0.5, speed: [50, 90], gravity: -90, drag: 0.1,
    life: [0.9, 1.6], px: [1, 2], col0: [0.7, 1.7, 2.2], col1: [0.4, 0.9, 1.3], a0: 1, a1: 0.2, env: true, settle: false });
};
const lanternSpark = (particles, x, y, z) => {          // tiny ember sparks off lanterns and braziers
  particles.spawn({ x: x + rnd(-6, 6), y: y + rnd(-6, 6), z, vel: [rnd(-3, 3), rnd(-3, 3), 0], up: rnd(12, 22), gravity: 1, drag: 0.7,
    life: [1.4, 2.4], px: [1, 1.5], ramp: 'fire', a0: 1, a1: 1, env: true });
};
const nightFly = (particles, x, y, z, col) => {         // base-area fireflies at night
  particles.spawn({ x, y, z, life: [4, 9], size0: [8, 12], size1: 8, col0: col, col1: [col[0] * 0.6, col[1] * 0.5, col[2] * 0.6], a0: 1, a1: 1, env: true,
    speed: [3, 9], drag: 0.4, mode: 'glow', jitter: 4 });
};
const basePollen = (particles, x, y, z) => {            // Radiant dust/pollen by day
  particles.spawn({ x, y, z, life: [5, 9], size0: [3, 5], size1: 3, col0: [0.95, 0.92, 0.55], col1: [0.7, 0.75, 0.4], a0: 0.9, a1: 0.9, env: true,
    speed: [2, 6], drag: 0.3, mode: 'square', jitter: 2, keep: true });
};
const baseAsh = (particles, x, y, z) => {               // Dire ash flakes, slowly falling
  particles.spawn({ x, y, z, life: [6, 10], px: [1, 2], col0: [0.45, 0.43, 0.41], col1: [0.25, 0.24, 0.23], a0: 0.8, a1: 0, env: true,
    speed: [2, 6], gravity: -2, drag: 0.3, settle: false });
};

/** Ambient life around the camera: day dust motes + drifting leaves, night fireflies + cold mist motes.
 *  Base life: teal fireflies and pale motes at the Radiant ancient, embers and ash and a red flicker at the Dire one,
 *  spray at fountains, ember sparks at lanterns, and dust / ash / night fireflies among the buildings within BASE_R of an ancient. */
export function createAmbient(particles, getHeight) {
  let acc = 0, accL = 0;
  const L = baseLayout();
  const anc = L.ancients.map((a) => ({ ...a, acc: [] }));
  const fnt = L.fountains.map((f) => ({ ...f, acc: [] }));
  const lan = L.lanterns.map((l) => ({ ...l, acc: [] }));
  const bld = [[], []], bacc = [[], []];
  for (const b of L.bldgs) bld[b.side].push(b);
  const V = { x0: 0, x1: 0, y0: 0, y1: 0 };       // camera rect of the current frame
  const vis = (x, y, m) => x > V.x0 - m && x < V.x1 + m && y > V.y0 - m && y < V.y1 + m;
  // n spawns this frame for `rate` per second; the fraction carries in A[i]. Capped so a stalled frame cannot burst.
  const take = (A, i, rate, dt) => { const v = (A[i] || 0) + rate * dt, n = Math.floor(v); A[i] = Math.min(v - n, 1); return Math.min(n, 6); };
  const bldgPoint = (list) => {
    const b = list[(Math.random() * list.length) | 0], t = Math.random() * 6.2832, r = Math.sqrt(Math.random()) * 400;
    return [b.x + Math.cos(t) * r, b.y + Math.sin(t) * r];
  };
  function baseLife(dt, night) {
    for (const a of anc) {
      const cx = a.x, cy = a.y - 200, cz = getHeight(a.x, a.y) + 300;     // crystal core (matches the ancient's light)
      if (!vis(cx, cy, CULL)) continue;
      if (a.side === 0) {
        for (let n = take(a.acc, 0, 1.2, dt); n > 0; n--) radiantFirefly(particles, cx, cy, cz);
        for (let n = take(a.acc, 1, 1, dt); n > 0; n--) radiantMote(particles, cx, cy, cz);
      } else {
        for (let n = take(a.acc, 0, 2, dt); n > 0; n--) direEmber(particles, cx, cy, cz);
        for (let n = take(a.acc, 1, 1, dt); n > 0; n--) direAsh(particles, cx, cy, cz);
        for (let n = take(a.acc, 2, 1, dt); n > 0; n--) direFlicker(particles, cx, cy, cz);
      }
    }
    for (const f of fnt) {
      if (!vis(f.x, f.y, CULL)) continue;
      for (let n = take(f.acc, 0, 3, dt); n > 0; n--) spray(particles, f.x, f.y, getHeight(f.x, f.y) + 150);
    }
    for (const l of lan) {
      if (!vis(l.x, l.y, CULL)) continue;
      for (let n = take(l.acc, 0, 0.5, dt); n > 0; n--) lanternSpark(particles, l.x, l.y, getHeight(l.x, l.y) + rnd(90, 130));
    }
    for (let s = 0; s < 2; s++) {
      const list = bld[s];
      if (!list.length) continue;
      const col = s === 0 ? [0.5, 2.2, 1.6] : [2.4, 1.3, 0.4];          // teal-green Radiant, amber Dire
      for (let n = take(bacc[s], 0, 3 * night, dt); n > 0; n--) {
        const [x, y] = bldgPoint(list); if (!vis(x, y, 0)) continue;
        nightFly(particles, x, y, getHeight(x, y) + rnd(20, 120), col);
      }
      for (let n = take(bacc[s], 1, s === 0 ? 2 * (1 - night) : 1.5, dt); n > 0; n--) {
        const [x, y] = bldgPoint(list); if (!vis(x, y, 0)) continue;
        const z = getHeight(x, y) + rnd(10, 120);
        if (s === 0) basePollen(particles, x, y, z); else baseAsh(particles, x, y, z);
      }
    }
  }
  return {
    update(dt, cx, cy, halfW, halfH, night) {
      V.x0 = cx - halfW; V.x1 = cx + halfW; V.y0 = cy - halfH; V.y1 = cy + halfH;
      const area = (halfW * 2) * (halfH * 2) / 1e6;       // million square units
      acc += dt * (night ? 7 : 4) * area; accL += dt * (night ? 0 : 0.7) * area;
      let n = Math.floor(acc); acc -= n; if (n > 40) n = 40;
      for (let i = 0; i < n; i++) {
        const x = cx + rnd(-halfW, halfW), y = cy + rnd(-halfH, halfH), z = getHeight(x, y) + rnd(10, 120);
        if (night > 0.5) {
          if (Math.random() < 0.85) particles.spawn({ x, y, z, life: [4, 9], size0: [10, 16], size1: 10, col0: [2.6, 3.2, 0.7], col1: [0.8, 2.2, 0.3], a0: 1, a1: 1, env: true, speed: [4, 14], gravity: 0, drag: 0.4, mode: 'glow', jitter: 6, delay: 0 });
          else particles.spawn({ x, y, z: z - 40, life: [6, 11], size0: [3, 5], size1: 3, col0: [0.5, 1.6, 1.8], col1: [0.2, 0.6, 0.8], a0: 1, a1: 1, env: true, speed: [3, 9], drag: 0.2, mode: 'glow', flat: true });
        } else {
          particles.spawn({ x, y, z, life: [5, 10], size0: [5, 9], size1: 6, col0: [1.0, 0.92, 0.7], col1: [0.8, 0.75, 0.55], a0: 1, a1: 1, env: true, speed: [2, 8], drag: 0.3, mode: 'square', jitter: 3, keep: true });
        }
      }
      let m = Math.floor(accL); accL -= m; if (m > 6) m = 6;
      for (let i = 0; i < m; i++) {
        const x = cx + rnd(-halfW, halfW), y = cy + rnd(-halfH, halfH);
        particles.spawn({ x, y, z: getHeight(x, y) + rnd(120, 260), life: [5, 9], size0: 16, size1: 16, col0: [0.45, 0.62, 0.28], col1: [0.5, 0.55, 0.25], a0: 0.9, a1: 0.9, vel: [rnd(15, 40), rnd(-15, 15), 0], speed: 0, gravity: -9, drag: 0.5, spin: rnd(-2, 2), stamp: 'p_leaf', rot: rnd(0, 6), settle: false, keep: true });
      }
      baseLife(dt, night);
    },
  };
}
