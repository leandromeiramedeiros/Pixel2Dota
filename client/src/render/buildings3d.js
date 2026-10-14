// 3D buildings: simple low-poly procedural meshes (tower, barracks, ancient, fountain, shop, lantern, filler house), one merged geometry per
// type, ONE instanced draw per type plus one inverted-hull outline draw. They are lit / fogged / Bayer-quantised exactly like the terrain
// (same uniforms + shaderlib functions) and render into the same low-res target, so they pixelate like everything else.
//   instance = position, yaw, scale, team (0 Radiant / 1 Dire), hp fraction (cracks), destroyed 0..1 (collapse to rubble), flash, highlight.
import * as THREE from 'three';
import { COMMON_GLSL } from './shaderlib.js';
import { DEPTH_FRAG } from './shadow.js';
import { createKit, hash01, instancedGeo, flushInstances, silhouetteFrame, DEPTH_GLSL } from './mesh3d.js';

// ---- palette: [Radiant, Dire] --------------------------------------------------------------------------------------------------------
const ST = { c: 0xbdbfb0, d: 0x4d3231 };      // stone
const SD = { c: 0x878a82, d: 0x2f1e1f };      // dark stone
const TR = { c: 0x2f9a86, d: 0xa8301f };      // trim / banners (lit)
const GD = { c: 0xe8bb4c, d: 0xc9601f };      // gold / rust-orange
const RF = { c: 0x2e7664, d: 0x521e1b };      // roof
const WD = { c: 0x75573a, d: 0x3d2a21 };      // wood
const IR = { c: 0x34343e, d: 0x201b1d };      // iron
const CRY = { c: [0.35, 2.5, 1.8], d: [2.9, 0.55, 0.24] };      // team crystal (HDR, blooms)
const WIN = { c: [1.9, 1.5, 0.65], d: [2.2, 0.85, 0.3] };      // lit windows
const LAMP = { c: [2.6, 1.6, 0.6], d: [2.6, 1.4, 0.5] };         // lantern flame
const WAT = { c: [0.25, 1.05, 1.3], d: [1.3, 0.55, 0.25] };      // fountain basin water (just under the bloom threshold)
const COL = { c: [0.55, 2.1, 2.6], d: [2.8, 1.1, 0.4] };         // fountain column
const S = (m, o = {}) => ({ ...m, ...o });
const E = (m, o = {}) => ({ ...m, e: 1, ...o });

function rubble(kit, R, n, seed) {
  for (let i = 0; i < n; i++) {
    const a = hash01(seed + i * 7) * Math.PI * 2, r = R * (0.12 + 0.8 * hash01(seed + i * 13 + 1));
    const s = 16 + 34 * hash01(seed + i * 17 + 2);
    kit.box(s, s * 0.6, s * 0.85, { ...(i % 3 ? SD : ST), part: 2, ctr: true, x: Math.cos(a) * r, z: Math.sin(a) * r, y: s * 0.22, ry: a * 3, rx: (hash01(seed + i) - 0.5) * 0.7, rz: (hash01(seed + i * 5) - 0.5) * 0.7 });
  }
}

// ---- models (origin = ground centre, +y up, front = +z = south = toward the camera) ------------------------------------------------------
function buildTower(k) {
  k.cyl(92, 92, 44, 8, S(SD, { y: -44 }));                               // foundation (underground)
  k.cyl(80, 88, 30, 8, S(SD));                                           // plinth
  k.cyl(50, 64, 130, 8, S(ST, { y: 30 }));                               // lower shaft
  k.cyl(56, 56, 12, 8, S(GD, { y: 156 }));                               // gold band
  k.cyl(44, 52, 104, 8, S(ST, { y: 168 }));                              // upper shaft
  k.cyl(53, 53, 8, 8, S(TR, { y: 100 }));                                // team band
  for (let q = 0; q < 4; q++) {                                          // lit slits on the four faces
    const a = q * Math.PI / 2, x = Math.sin(a), z = Math.cos(a);
    k.box(12, 36, 8, E(WIN, { x: x * 56, z: z * 56, y: 64, ry: a }));
    k.box(10, 30, 8, E(WIN, { x: x * 47, z: z * 47, y: 200, ry: a }));
  }
  k.cyl(72, 46, 26, 8, S(TR, { y: 272 }));                               // corbel
  k.cyl(72, 72, 8, 8, S(SD, { y: 298 }));                                // deck
  for (let q = 0; q < 8; q++) {                                          // merlons
    const a = q * Math.PI / 4;
    k.box(30, 26, 20, S(ST, { x: Math.sin(a) * 61, z: Math.cos(a) * 61, y: 306, ry: a }));
  }
  k.cyl(18, 24, 14, 8, S(IR, { y: 306 }));                               // brazier
  k.oct(22, 46, 22, E(CRY, { y: 366, ry: 0.4 }));                        // glowing team crystal
  for (let q = 0; q < 3; q++) { const a = q * 2.09 + 0.5; k.oct(7, 15, 7, E(CRY, { x: Math.cos(a) * 36, z: Math.sin(a) * 36, y: 346 + q * 6, rz: 0.2 })); }
  rubble(k, 90, 9, 11);
}

function buildBarracks(k) {
  k.box(272, 26, 204, S(SD, { y: -26 }));                                // foundation
  k.box(262, 22, 196, S(SD));                                            // plinth
  k.box(236, 86, 168, S(ST, { y: 22 }));                                 // walls
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(30, 104, 30, S(SD, { x: sx * 118, z: sz * 84, y: 22 }));   // corner pillars
  k.box(246, 10, 178, S(TR, { y: 96 }));                                 // team band
  k.cone(100, 78, 4, S(RF, { y: 108, t0: Math.PI / 4, sx: 1.98, sz: 1.42 }));   // hip roof
  k.box(250, 6, 182, S(IR, { y: 106 }));                                 // eaves
  k.box(40, 58, 8, S(WD, { z: 86, y: 22 }));                             // door
  k.box(50, 8, 12, S(GD, { z: 88, y: 80 }));                             // lintel
  for (const x of [-78, 78]) { k.box(26, 30, 6, E(WIN, { x, z: 85, y: 52 })); k.box(10, 56, 4, S(TR, { x: x * 0.58, z: 87, y: 26 })); }   // windows + banners
  for (const s of [-1, 1]) { k.box(6, 28, 24, E(WIN, { x: s * 119, z: 20, y: 52 })); }
  k.box(22, 50, 22, S(SD, { x: -70, z: -40, y: 140 }));                  // chimney
  k.oct(12, 28, 12, E(CRY, { y: 200 }));                                 // ridge crystal
  k.box(5, 36, 5, S(IR, { y: 176 }));
  rubble(k, 130, 12, 23);
}

function buildFort(k) {
  k.cyl(204, 204, 44, 8, S(SD, { y: -44 }));
  k.cyl(176, 202, 40, 8, S(SD));                                         // tier 1
  k.cyl(140, 168, 70, 8, S(ST, { y: 40 }));                              // tier 2
  k.cyl(152, 152, 9, 8, S(GD, { y: 108 }));                              // gold ring
  k.cyl(100, 126, 80, 8, S(ST, { y: 117 }));                             // tier 3
  k.cyl(104, 104, 10, 8, S(TR, { y: 150 }));                             // team band
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {                  // columns
    k.box(28, 124, 28, S(SD, { x: sx * 120, z: sz * 120, y: 40 }));
    k.box(38, 10, 38, S(GD, { x: sx * 120, z: sz * 120, y: 164 }));
    k.oct(8, 16, 8, E(CRY, { x: sx * 120, z: sz * 120, y: 188 }));
  }
  k.cyl(98, 98, 14, 8, S(TR, { y: 197 }));                               // crown ring
  k.cyl(62, 88, 30, 8, S(IR, { y: 211 }));                               // pedestal
  k.oct(58, 124, 58, E(CRY, { y: 340, ry: 0.3 }));                       // the core
  for (let q = 0; q < 4; q++) { const a = q * Math.PI / 2 + 0.78; k.oct(13, 38, 13, E(CRY, { x: Math.cos(a) * 92, z: Math.sin(a) * 92, y: 284, rz: Math.cos(a) * 0.25, rx: Math.sin(a) * 0.25 })); }
  k.box(54, 64, 10, S(WD, { z: 125, y: 40 }));                           // door
  for (const x of [-60, 60]) k.box(22, 34, 8, E(WIN, { x, z: 128, y: 62 }));
  for (const x of [-52, 52]) k.box(18, 30, 8, E(WIN, { x, z: 100, y: 142 }));
  rubble(k, 180, 18, 37);
}

function buildFountain(k) {
  k.cyl(142, 142, 34, 10, S(SD, { y: -34 }));
  k.cyl(126, 134, 40, 10, S(ST));                                        // basin wall
  k.cyl(130, 130, 8, 10, S(GD, { y: 40 }));                              // rim
  k.cyl(112, 112, 4, 10, E(WAT, { y: 38 }));                             // water surface
  k.cyl(36, 46, 38, 10, S(ST, { y: 36 }));                               // pedestal
  k.cyl(14, 22, 100, 8, E(COL, { y: 70 }));                              // water column
  k.oct(26, 20, 26, E(COL, { y: 176 }));                                 // spray
  for (let q = 0; q < 4; q++) {                                          // lamp posts
    const a = q * Math.PI / 2 + Math.PI / 4;
    k.box(14, 54, 14, S(SD, { x: Math.cos(a) * 122, z: Math.sin(a) * 122, y: 44 }));
    k.oct(8, 12, 8, E(CRY, { x: Math.cos(a) * 122, z: Math.sin(a) * 122, y: 108 }));
  }
  rubble(k, 120, 6, 5);
}

function buildShop(k) {
  k.box(190, 14, 140, S(WD, { y: -4 }));                                 // platform
  k.box(150, 74, 10, S(WD, { y: 10, z: -48 }));                          // back wall
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(10, 96, 10, S(IR, { x: sx * 76, z: sz * 50, y: 10 }));   // posts
  k.box(146, 36, 38, S(ST, { y: 10, z: 28 }));                           // counter
  k.box(150, 6, 44, S(WD, { y: 46, z: 28 }));                            // counter top
  for (let q = 0; q < 5; q++) {                                          // striped awning
    k.box(32, 5, 112, { ...(q % 2 ? { c: 0xe9dfc2, d: 0x8a7a66 } : TR), x: -64 + q * 32, y: 110, z: 2, ctr: true, rx: 0.3 });
  }
  k.box(160, 12, 8, S(TR, { y: 90, z: 58 }));                            // valance
  for (const x of [-48, 0, 48]) k.box(14, 18, 14, E(x ? WIN : CRY, { x, y: 56, z: 30 }));   // wares
  for (const sx of [-1, 1]) k.oct(7, 10, 7, E(LAMP, { x: sx * 74, y: 82, z: 56 }));        // hanging lanterns
}

function buildLantern(k) {
  k.box(24, 12, 24, S(SD));
  k.cyl(4, 6, 84, 6, S(IR, { y: 12 }));
  k.box(22, 28, 22, E(LAMP, { y: 94 }));
  k.box(28, 4, 28, S(IR, { y: 92 }));
  k.cone(20, 16, 4, S(IR, { y: 122, ry: Math.PI / 4 }));
}

function buildFiller(k) {
  k.box(144, 24, 124, S(SD, { y: -14 }));
  k.box(128, 72, 108, S(ST, { y: 2 }));                                  // walls
  k.box(134, 8, 114, S(TR, { y: 52 }));                                  // band
  k.cone(72, 56, 4, S(RF, { y: 74, t0: Math.PI / 4, sx: 1.6, sz: 1.34 }));   // roof
  k.box(26, 42, 6, S(WD, { y: 2, z: 56 }));                              // door
  for (const x of [-40, 40]) k.box(20, 20, 6, E(WIN, { x, y: 38, z: 56 }));
  k.box(6, 20, 20, E(WIN, { x: 64, y: 38, z: 10 }));
  k.box(16, 38, 16, S(SD, { x: 34, z: -20, y: 90 }));                    // chimney
}

const VSCALE = 0.8;       // squat: tall props smear toward the camera under the 70 deg FOV perspective
export const INFO = {
  tower:    { R: 84, H: 490, pull: 70, max: 40, build: buildTower },
  barracks: { R: 150, H: 280, pull: 98, max: 24, build: buildBarracks },
  fort:     { R: 205, H: 550, pull: 150, max: 4, build: buildFort },
  fountain: { R: 140, H: 240, pull: 125, max: 4, build: buildFountain },
  shop:     { R: 100, H: 150, pull: 64, max: 16, build: buildShop },
  lantern:  { R: 16, H: 160, pull: 10, max: 32, build: buildLantern },
  filler:   { R: 80, H: 155, pull: 55, max: 64, build: buildFiller },
};

// ---- shaders -----------------------------------------------------------------------------------------------------------------------------
const VERT = /* glsl */ `
${COMMON_GLSL.split('float bayer4')[0]}
attribute vec3 aCol, aCol2, aSm;
attribute float aEmit, aPart;
attribute vec3 iPos;
attribute vec4 iXf, iSt, iHi;
uniform float uPull, uOutW;
varying vec3 vW, vN, vFoot, vCol;
varying float vE, vLY, vPh;
varying vec4 vSt, vHi;
${DEPTH_GLSL}
vec3 rotY(vec3 v, float c, float s){ return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }
void main(){
  float d = iSt.y;
  vec3 p = position;
  if (aPart > 1.5) p *= d;                                      // rubble chunks appear as the building collapses
  else {
    p.y *= mix(1., .17, d);
    p.y += d * fract(sin(dot(p.xz, vec2(12.9, 78.2))) * 43758.5) * 12.;
    p.xz *= 1. + .06 * d;
  }
#ifdef HULL
  p += aSm * (uOutW / iXf.y);
#endif
  float c = cos(iXf.x), s = sin(iXf.x);
  vec3 w = iPos + rotY(p, c, s) * iXf.y;
  vW = w; vN = rotY(normal, c, s); vFoot = iPos; vLY = position.y; vPh = iXf.z;
  vec3 col = mix(aCol, aCol2, iXf.w);
  vE = aEmit * (1. - d);
  col = mix(col, vec3(dot(col, vec3(.33))) * .42, d * .85 * (1. - aEmit));
  vCol = col; vSt = iSt; vHi = iHi;
  vec4 cr = projectionMatrix * viewMatrix * vec4(w, 1.);
#ifdef SHADOW
  gl_Position = cr;                                             // shadow caster: real depth from the light
#else
  gl_Position = propDepth(cr, iPos, uPull * iXf.y);
#endif
#ifdef HULL
  gl_Position.z += 1e-4 * gl_Position.w;
#endif
}`;

const FRAG = /* glsl */ `
precision highp float;
${COMMON_GLSL}
uniform float uRimOn;
varying vec3 vW, vN, vFoot, vCol;
varying float vE, vLY, vPh;
varying vec4 vSt, vHi;
void main(){
  vec3 n = normalize(vN);
  bool top = abs(n.y) > .6;
  vec2 dp = top ? floor(vW.xz / 6.) : vec2(floor((vW.x + vW.z) / 6.), floor(vW.y / 6.));
#ifdef HULL
  gl_FragColor = vec4(mix(vec3(.02, .017, .028), vHi.rgb, vHi.a) * fogBright(vFoot, dp), 1.);
#else
  float em = vE;
  vec3 alb = vCol * mix(1.2, 1., em);
  float hs = fract(sin(dot(floor(dp / 3.), vec2(12.9898, 78.233))) * 43758.5453);
  alb *= 1. + (hs - .5) * .16 * (1. - em);
  alb *= mix(mix(.62, 1., smoothstep(0., 90., vLY)), 1., em);          // dark at the foot
  float dmg = 1. - vSt.x;
  float h2 = fract(sin(dot(floor(dp / 2.), vec2(39.3, 11.7))) * 24634.63);
  alb *= 1. - .5 * step(h2, dmg * .85) * step(.02, dmg) * (1. - em);   // cracks / scorch
  vec3 pl = pointLights(vW + n * 6., n, .35);
  float sh = shadowAt(vW, n, dp);
  vec3 L = quantL(shadowAmb(sh) + uKeyCol * (max(dot(n, uKeyDir), 0.) * sh) + pl, dp);
  vec3 col = alb * L;
  float pulse = 1. + .12 * sin(uTime * 2.3 + vPh) + .25 * step(.5, dmg) * sin(uTime * 17. + vPh);
  col = mix(col, alb * pulse * (1. + .35 * uNight), em);
  vec3 v = normalize(uCamPos - vW);
  float fr = pow(1. - max(dot(n, v), 0.), 3.);
  float kf = smoothstep(-.1, .6, dot(n, uKeyDir)) * mix(.35, 1., sh);
  col += uRimOn * (uRimKey * fr * (.3 + kf) + pl * fr * 1.1) * (1. - em);
  col += vHi.rgb * vHi.a * (.03 + fr * .8);
  col = mix(col, vec3(1.5, 1.45, 1.35), vSt.z * .7);
  gl_FragColor = vec4(col * fogBright(vFoot, dp), 1.);
#endif
}`;

const IFLOATS = [['iPos', 3], ['iXf', 4], ['iSt', 4], ['iHi', 4]];

export function createBuildings3d({ scene, uniforms }) {
  const rimU = { value: 1 }, outU = { value: 6.5 };
  const types = {};
  const group = new THREE.Group(); group.name = 'buildings3d'; scene.add(group);
  const stats = { draws: 0, tris: 0, instances: 0 };
  for (const name in INFO) {
    const inf = INFO[name];
    const kit = createKit(VSCALE); inf.build(kit);
    const merged = kit.build();
    const inst = instancedGeo(merged, inf.max, IFLOATS);
    const un = { ...uniforms, uPull: { value: inf.pull }, uOutW: outU, uRimOn: rimU };
    const body = new THREE.Mesh(inst.geo, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: un, side: THREE.FrontSide }));
    const hull = new THREE.Mesh(inst.geo, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: un, side: THREE.BackSide, defines: { HULL: 1 } }));
    body.userData.depthMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: DEPTH_FRAG, uniforms: un, side: THREE.DoubleSide, defines: { SHADOW: 1 } });
    for (const m of [body, hull]) { m.frustumCulled = false; m.matrixAutoUpdate = false; group.add(m); }
    body.renderOrder = 1; hull.renderOrder = 2; body.name = 'b3d_' + name; hull.name = 'b3d_hull_' + name;
    const frame = silhouetteFrame(merged, { minAy: inf.H / 5.52 + 1, skipPart: 2 });
    types[name] = { inf, inst, n: 0, body, hull, frame, tris: inst.tris };
  }
  const _hi = [0, 0, 0, 0];
  return {
    types, group, stats, info: INFO,
    begin() { for (const k in types) types[k].n = 0; },
    /** o: { team 0|1, hp 0..1, destroyed 0..1, flash 0..1, hi [r,g,b,a], yaw, scale, phase } */
    add(name, x, y, z, o) {
      const t = types[name]; if (!t || t.n >= t.inst.max) return false;
      const d = t.inst.data, i = t.n++ * t.inst.stride;
      const hi = (o && o.hi) || _hi;
      d[i] = x; d[i + 1] = z; d[i + 2] = -y;
      d[i + 3] = (o && o.yaw) || 0; d[i + 4] = (o && o.scale) || 1; d[i + 5] = (o && o.phase) || ((x * 0.013 + y * 0.007) % 6.28); d[i + 6] = o && o.team ? 1 : 0;
      d[i + 7] = o && o.hp != null ? o.hp : 1; d[i + 8] = (o && o.destroyed) || 0; d[i + 9] = (o && o.flash) || 0; d[i + 10] = 0;
      d[i + 11] = hi[0]; d[i + 12] = hi[1]; d[i + 13] = hi[2]; d[i + 14] = hi[3];
      return true;
    },
    end() {
      let tris = 0, draws = 0, inst = 0;
      for (const k in types) { const t = types[k]; flushInstances(t.inst, t.n); t.body.visible = t.hull.visible = t.n > 0; if (t.n) { tris += t.n * t.tris * 2; draws += 2; inst += t.n; } }
      stats.tris = tris; stats.draws = draws; stats.instances = inst;
    },
    /** sprite-like pick / bar frame for a building type (see mesh3d.silhouetteFrame) */
    frame(name) { return types[name] && types[name].frame; },
    /** shadow casters: [{ mesh, mat }] (shadow.js) */
    casters() { return Object.values(types).map((t) => ({ mesh: t.body, mat: t.body.userData.depthMat })); },
    setRim(on) { rimU.value = on ? 1 : 0; },
    dispose() { for (const k in types) { types[k].inst.geo.dispose(); types[k].body.material.dispose(); types[k].hull.material.dispose(); } scene.remove(group); },
  };
}
