// GPU particle pool. A ring buffer of 32768 particles; every particle is a camera-facing quad integrated ANALYTICALLY in the vertex shader
// from its birth data (position, velocity, gravity, linear drag, rotation/spin, size and colour lerp). The CPU only writes newly spawned
// slots (addUpdateRange), never touches live particles. Additive blending, depth-tested (no depth write), HDR colours feed the bloom.
//
//   particles.burst({ x,y,z, count, ... })          one-shot
//   particles.emitter({ x,y,z, rate, duration, ... }) -> { set(x,y,z), stop(), alive }   continuous (rate = particles/s)
//   particles.spawn(p)                              a single particle
// Shared options (all optional; scalars or [min,max] ranges):
//   speed, life, size0/size1 (world units), col0/col1 ([r,g,b], HDR), a0/a1 (alpha), gravity (accel along +z up, negative falls),
//   drag (1/s), spin (rad/s), rot, shape 'point'|'sphere'|'disc'|'ring'|'cone'|'line', radius, dir [dx,dy,dz], spread (rad, cone),
//   up (extra initial z speed), x2/y2/z2 (line end), mode 'glow'|'square'|'stamp', stamp ('p_spark', ... from the fx sheet), delay.
import * as THREE from 'three';
import { COMMON_GLSL, UNIFORMS_GLSL } from './shaderlib.js';

export const POOL = 32768;
const STRIDE = 28;

const VERT = /* glsl */ `
${UNIFORMS_GLSL}
attribute vec2 corner;
attribute vec4 aP0;      // birth pos xyz, birth time
attribute vec4 aV0;      // birth vel xyz, life
attribute vec4 aSz;      // size0, size1, rot0, spin
attribute vec4 aPh;      // gravity, drag, mode, alpha0
attribute vec4 aC0;      // rgb0, alpha1
attribute vec4 aC1;      // rgb1, unused
attribute vec4 aUv;      // uv rect
varying vec2 vQ;
varying vec4 vC;
varying vec4 vUv;
varying float vMode;
varying vec3 vWorld;
void main(){
  float age = uTime - aP0.w;
  float life = aV0.w;
  if (age < 0. || age >= life) { gl_Position = vec4(2., 2., 2., 1.); vC = vec4(0.); vQ = vec2(0.); vUv = aUv; vMode = 0.; vWorld = vec3(0.); return; }
  float g = aPh.x, d = aPh.y;
  vec3 gv = vec3(0., g, 0.);
  vec3 p;
  if (d < 1e-3) p = aP0.xyz + aV0.xyz * age + .5 * gv * age * age;
  else {
    float e = exp(-d * age);
    p = aP0.xyz + gv * (age / d) + (aV0.xyz - gv / d) * ((1. - e) / d);
  }
  float k = age / life;
  float size = mix(aSz.x, aSz.y, k);
  float rot = aSz.z + aSz.w * age;
  vec2 q = corner * 2. - 1.;
  float cs = cos(rot), sn = sin(rot);
  vec2 qr = vec2(q.x * cs - q.y * sn, q.x * sn + q.y * cs);
  vec3 w = p + (uCamRight * qr.x + uCamUp * qr.y) * size;
  vQ = corner;
  vec3 col = mix(aC0.rgb, aC1.rgb, k);
  float a = mix(aPh.w, aC0.w, k);
  if (aC1.w > .5) a *= sin(3.14159 * k);
  vC = vec4(col, a);
  vUv = aUv; vMode = aPh.z; vWorld = p;
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
void main(){
  if (vC.a <= 0.002) discard;
  vec3 col = vC.rgb; float a = vC.a;
  vec2 dp = floor(gl_FragCoord.xy);
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

export function createParticles({ scene, uniforms, atlas, heightAt, getView }) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('corner', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const data = new Float32Array(POOL * STRIDE);
  const buf = new THREE.InstancedInterleavedBuffer(data, STRIDE, 1); buf.setUsage(THREE.DynamicDrawUsage);
  const names = ['aP0', 'aV0', 'aSz', 'aPh', 'aC0', 'aC1', 'aUv'];
  names.forEach((n, i) => geo.setAttribute(n, new THREE.InterleavedBufferAttribute(buf, 4, i * 4)));
  geo.instanceCount = POOL;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { ...uniforms, tAtlas: { value: atlas.texture } },
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
  const total = { spawned: 0 };
  const emitters = [];
  const scale = { v: 1 };      // global density multiplier (setting "particles")

  function mark(i) { if (dirtyFrom < 0) { dirtyFrom = i; dirtyTo = i + 1; } else { if (i < dirtyFrom) dirtyFrom = i; if (i + 1 > dirtyTo) dirtyTo = i + 1; } }

  /** Write one particle. Position/velocity in WORLD coords (x east, y north, z up); stored as three coords. */
  function put(x, y, z, vx, vy, vz, o) {
    const i = head; head = (head + 1) % POOL;
    if (head === 0) { /* wrapped: a single dirty span would cover the whole pool; flush the pair as two ranges */ flushRange(); }
    const b = i * STRIDE;
    const life = num(o.life, 1);
    const mode = o.mode === 'stamp' || o.stamp ? 2 : o.mode === 'square' ? 1 : 0;
    const uv = mode === 2 ? stampUv(o.stamp || 'p_spark') : null;
    const s0 = num(o.size0 != null ? o.size0 : o.size, 12), s1 = num(o.size1 != null ? o.size1 : o.size0 != null ? o.size0 : o.size, s0);
    const c0 = o.col0 || o.col || [1, 1, 1], c1 = o.col1 || c0;
    data[b] = x; data[b + 1] = z; data[b + 2] = -y; data[b + 3] = now + (o.delay || 0);
    data[b + 4] = vx; data[b + 5] = vz; data[b + 6] = -vy; data[b + 7] = life;
    const sz = mode === 2 ? s0 * 0.5 : s0 * 0.5;
    data[b + 8] = sz; data[b + 9] = s1 * 0.5; data[b + 10] = num(o.rot, 0); data[b + 11] = num(o.spin, 0);
    data[b + 12] = o.gravity == null ? 0 : o.gravity; data[b + 13] = o.drag || 0; data[b + 14] = mode; data[b + 15] = o.a0 == null ? 1 : o.a0;
    data[b + 16] = c0[0]; data[b + 17] = c0[1]; data[b + 18] = c0[2]; data[b + 19] = o.a1 == null ? 0 : o.a1;
    data[b + 20] = c1[0]; data[b + 21] = c1[1]; data[b + 22] = c1[2]; data[b + 23] = o.env ? 1 : 0;
    if (uv) { data[b + 24] = uv[0]; data[b + 25] = uv[1]; data[b + 26] = uv[2]; data[b + 27] = uv[3]; } else { data[b + 24] = 0; data[b + 25] = 0; data[b + 26] = 1; data[b + 27] = 1; }
    mark(i);
    if (live < POOL) live++;
    spawnedFrame++; total.spawned++;
  }
  function flushRange() {
    if (dirtyFrom < 0) return;
    buf.addUpdateRange(dirtyFrom * STRIDE, (dirtyTo - dirtyFrom) * STRIDE);
    buf.needsUpdate = true; dirtyFrom = -1; dirtyTo = -1;
  }

  const TMP = [0, 0, 0];
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
      for (let i = emitters.length - 1; i >= 0; i--) {
        const e = emitters[i], o = e.o;
        if (!e.alive) { emitters.splice(i, 1); continue; }
        if (o.follow) { const p = o.follow(); if (p) { e.x = p.x; e.y = p.y; if (p.z != null) e.z = p.z; } else e.alive = false; }
        e.t += dt;
        if (o.duration != null && e.t > o.duration) { e.alive = false; continue; }
        e.acc += (o.rate || 20) * scale.v * dt;
        let n = Math.floor(e.acc); e.acc -= n; if (n > 400) n = 400;
        for (let k = 0; k < n; k++) spawn(o, e.x, e.y, e.z);
      }
    },
    /** upload new slots. Call once per frame after all spawns. */
    flush() { flushRange(); const s = spawnedFrame; spawnedFrame = 0; return s; },
    setTime(t) { now = t; },
    get time() { return now; },
    get emitterCount() { return emitters.length; },
    get spawned() { return total.spawned; },
    get capacity() { return POOL; },
    clear() { data.fill(0); buf.addUpdateRange(0, data.length); buf.needsUpdate = true; emitters.length = 0; live = 0; },
    dispose() { geo.dispose(); mat.dispose(); },
  };
  // first upload: whole buffer
  buf.needsUpdate = true;
  return api;
}

/** Ambient life around the camera: day dust motes + drifting leaves, night fireflies + cold mist motes. */
export function createAmbient(particles, getHeight) {
  let acc = 0, accL = 0;
  return {
    update(dt, cx, cy, halfW, halfH, night) {
      const area = (halfW * 2) * (halfH * 2) / 1e6;       // million square units
      acc += dt * (night ? 7 : 4) * area; accL += dt * (night ? 0 : 0.7) * area;
      let n = Math.floor(acc); acc -= n; if (n > 40) n = 40;
      for (let i = 0; i < n; i++) {
        const x = cx + rnd(-halfW, halfW), y = cy + rnd(-halfH, halfH), z = getHeight(x, y) + rnd(10, 120);
        if (night > 0.5) {
          if (Math.random() < 0.55) particles.spawn({ x, y, z, life: [4, 9], size0: [10, 16], size1: 10, col0: [2.6, 3.2, 0.7], col1: [0.8, 2.2, 0.3], a0: 1, a1: 1, env: true, speed: [4, 14], gravity: 0, drag: 0.4, mode: 'glow', jitter: 6, delay: 0 });
          else particles.spawn({ x, y, z: z - 40, life: [6, 11], size0: [60, 110], size1: [90, 150], col0: [0.14, 0.2, 0.42], col1: [0.1, 0.14, 0.3], a0: 1, a1: 1, env: true, speed: [3, 9], drag: 0.2, mode: 'glow', flat: true });
        } else {
          particles.spawn({ x, y, z, life: [5, 10], size0: [5, 9], size1: 6, col0: [1.0, 0.92, 0.7], col1: [0.8, 0.75, 0.55], a0: 1, a1: 1, env: true, speed: [2, 8], drag: 0.3, mode: 'square', jitter: 3 });
        }
      }
      let m = Math.floor(accL); accL -= m; if (m > 6) m = 6;
      for (let i = 0; i < m; i++) {
        const x = cx + rnd(-halfW, halfW), y = cy + rnd(-halfH, halfH);
        particles.spawn({ x, y, z: getHeight(x, y) + rnd(120, 260), life: [5, 9], size0: 16, size1: 16, col0: [0.45, 0.62, 0.28], col1: [0.5, 0.55, 0.25], a0: 0.9, a1: 0.9, vel: [rnd(15, 40), rnd(-15, 15), 0], speed: 0, gravity: -9, drag: 0.5, spin: rnd(-2, 2), stamp: 'p_leaf', rot: rnd(0, 6) });
      }
    },
  };
}
