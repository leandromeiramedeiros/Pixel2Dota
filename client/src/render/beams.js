// Volumetric light shafts: soft, Bayer-dithered additive cones from practical lights (docs/ART-DIRECTION.md "Hero reference").
// One instanced open-frustum draw rendered INTO the scene target (depth-tested against buildings/trees, picked up by bloom / DOF /
// haze like everything else). Blending leaves the destination ALPHA alone: scene alpha is the water mask (see post.js).
// lights.js feeds it the finalised light list; the shaft kind is inferred from the light itself because building lights carry no tag
// (actors.js is read-only here). Callers may also pass an explicit `beam` hint on lights.add({ ..., beam: {...} }), see BEAM_KINDS.
import * as THREE from 'three';
import { COMMON_GLSL } from './shaderlib.js';

export const MAX_BEAMS = 16;
const SEG = 18;

// Shaft presets. Offsets are from the light position (three-style: world x, y up = world z, z = -world y), signed lengths: negative = down.
//   y0   start height relative to the light's z; len  signed axis length (world units); r0/r1 radius at the source / far end;
//   dy   world-y shift to the real fixture (actors.js pulls building lights toward the camera by this much); k brightness gain.
export const BEAM_KINDS = {   // fixture heights match buildings3d.js geometry * VSCALE 0.8; dy undoes actors.js pulling the light toward the camera
  tower:    { y0: 20, len: 260, r0: 16, r1: 5, dy: 130, k: 0.6 },       // thin beacon rising from the team crystal (y 366 * .8); a down cone would wrap the tower body
  lantern:  { y0: -64, len: -86, r0: 9, r1: 56, dy: 0, k: 0.85 },      // lamp box (y 94..122)
  barracks: { y0: -10, len: -160, r0: 8, r1: 70, dy: 150, k: 0.8 },    // ridge crystal (y 200)
  fountain: { y0: -9, len: 400, r0: 34, r1: 12, dy: 0, k: 0.85 },       // spray column rising from the spray head (y 176)
  ancient:  { y0: 60, len: 520, r0: 52, r1: 12, dy: 200, k: 0.9 },      // beacon shaft rising from the tip of the core (y 340 + 124)
};

/** Pure: pick a shaft kind for a light, or null. Explicit l.beam (string kind, or a custom preset object) wins. */
export function beamFor(l) {
  if (l.beam) return typeof l.beam === 'string' ? BEAM_KINDS[l.beam] || null : l.beam;
  const R = l.radius;
  if (R >= 600 && R <= 660 && l.b > l.r) return BEAM_KINDS.fountain;
  if (R >= 550 && R <= 600) return BEAM_KINDS.ancient;
  if (R >= 410 && R <= 450) return BEAM_KINDS.tower;
  if (R >= 250 && R <= 280) return l.g < 0.66 ? BEAM_KINDS.lantern : null;   // barracks: a cone through the roof reads wrong, no shaft
  return null;
}

const VERT = /* glsl */ `
attribute vec3 aRing;      // x = cos, y = sin, z = t along the axis (0 = source end, 1 = far end)
attribute vec4 aS;         // source position (three coords), signed axis length
attribute vec4 aD;         // r0, r1, seed, brightness
attribute vec3 aC;         // colour (HDR, includes the light's intensity and flicker)
varying vec3 vN, vW, vC; varying float vT, vSeed, vK;
void main(){
  float t = aRing.z;
  float rad = mix(aD.x, aD.y, t);
  vec3 wp = aS.xyz + vec3(aRing.x * rad, aS.w * t, aRing.y * rad);
  vN = normalize(vec3(aRing.x, -(aD.y - aD.x) / aS.w, aRing.y));
  vW = wp; vC = aC; vT = t; vSeed = aD.z; vK = aD.w;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.);
}`;

const FRAG = /* glsl */ `
precision highp float;
${COMMON_GLSL}
uniform float uBeamK;
varying vec3 vN, vW, vC; varying float vT, vSeed, vK;
void main(){
  vec3 V = normalize(uCamPos - vW);
  float ndv = abs(dot(normalize(vN), V));
  float body = ndv * ndv * (.45 + .55 * ndv);                                   // thick through the middle of the cone, thin at the silhouette
  float along = (1. - smoothstep(0., 1., vT)) * .85 + .15 * (1. - smoothstep(.8, 1., vT));   // dense at the fixture, gone before the ground / sky end
  float drift = .88 + .12 * sin(uTime * 1.7 + vSeed * 6.283 + vT * 9.) * sin(uTime * .9 - vSeed * 3.1 + vT * 4.);
  float v = body * along * drift * vK * uBeamK;
  float fb = fogBright(vW, gl_FragCoord.xy);
  v *= clamp((fb - uFogLv.x) / (1. - uFogLv.x), 0., 1.);
  v = floor(v * 6. + bayer4(gl_FragCoord.xy)) / 6.;                             // Bayer-quantised: dithered edges, no smooth gradient
  if (v <= 0.) discard;
  gl_FragColor = vec4(vC * (v * 3.6), 0.);
}`;

export function createBeams(scene, shared) {
  const ring = [];
  const idx = [];
  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    ring.push(Math.cos(a), Math.sin(a), 0, Math.cos(a), Math.sin(a), 1);
  }
  for (let i = 0; i < SEG; i++) {
    const j = (i + 1) % SEG, a0 = i * 2, a1 = i * 2 + 1, b0 = j * 2, b1 = j * 2 + 1;
    idx.push(a0, b0, a1, b0, b1, a1);
  }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ring.length), 3));   // unused, keeps three's bounds code happy
  geo.setAttribute('aRing', new THREE.BufferAttribute(new Float32Array(ring), 3));
  geo.setIndex(idx);
  const aS = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BEAMS * 4), 4); aS.setUsage(THREE.DynamicDrawUsage);
  const aD = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BEAMS * 4), 4); aD.setUsage(THREE.DynamicDrawUsage);
  const aC = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BEAMS * 3), 3); aC.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aS', aS); geo.setAttribute('aD', aD); geo.setAttribute('aC', aC);
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: { uTime: shared.uTime, uCamPos: shared.uCamPos, uFog: shared.uFog, uFogMap: shared.uFogMap, uFogLv: shared.uFogLv, uBeamK: { value: 1 } },
    transparent: true, depthTest: true, depthWrite: false, side: THREE.FrontSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.visible = false;
  if (scene) scene.add(mesh);
  const state = { enabled: true, strength: 1, count: 0 };

  /** sel = lights.finalize() result (objects in world coords), C = shared.uLC (flicker-applied colours, same order). */
  function update(sel, C, night) {
    let n = 0;
    if (state.enabled) {
      for (let i = 0; i < sel.length && n < MAX_BEAMS; i++) {
        const l = sel[i], bk = beamFor(l);
        if (!bk) continue;
        const cr = C[i * 4], cg = C[i * 4 + 1], cb = C[i * 4 + 2];
        if (Math.max(cr, cg, cb) < 0.05) continue;
        // three coords: x, z-up -> y, -world y -> z
        aS.array.set([l.x, l.z + bk.y0, -(l.y + bk.dy), bk.len], n * 4);
        aD.array.set([bk.r0, bk.r1, ((l.x * 0.0137 + l.y * 0.0071) % 1 + 1) % 1, bk.k], n * 4);
        aC.array.set([cr * 0.9, cg * 0.9, cb * 0.9], n * 3);
        n++;
      }
    }
    state.count = n; geo.instanceCount = n; mesh.visible = n > 0;
    if (n) { aS.needsUpdate = true; aD.needsUpdate = true; aC.needsUpdate = true; }
    mat.uniforms.uBeamK.value = state.strength * (0.2 + 0.8 * night);       // subtle by day, clearly visible at night
  }

  return { state, update, mesh, dispose() { geo.dispose(); mat.dispose(); if (scene) scene.remove(mesh); } };
}
