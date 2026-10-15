// Voxel units drawn as real 3D meshes (model: shared/vox/<name>.js, mesher: voxmesh.js). One instanced geometry per pose frame, lit like
// buildings3d.js (shadow map, key + point lights, Bayer-quantised light, fog grade). Outline: an ID pass (idScene: outline colour + per-instance id, same vertex
// shader and depth) that post.js turns into a 1-art-px silhouette line (render/post.js OUTLINE), so inner depth steps never get a line.
// What makes a ~44-voxel chibi read from the 60 deg game camera:
//   - lean: the model tilts back about its feet, away from the camera (along its view direction, the same for every unit: leanOf), so the camera sees it from ~LEAN_TO deg like the offline renders
//     (pitch 30), not from above (top of the hair, no face). Shadow passes use the same lean, so self-shadow lands where it is drawn.
//   - smooth per-voxel normals (aSm) for the light, so the blocks shade like rounded forms; faces stay voxel-crisp.
//   - depth = sprites: the foot point (propDepth), so units sort like the 2D sheets.
// Team tint: voxels of `team` mats (aFace bit 3) take the instance team colour at their own ramp luminance. Death: the model breaks into its
// voxels (centre rebuilt from position + aFace corner bits, random from aHash): they burst out, fall, bounce once and dissolve (DIE_*).
// Heroes (models with a rig, voxmesh.js segments in aHash bits 5-7) ragdoll first: ragdoll.js simulates a verlet skeleton on the CPU for RAG_T seconds and
// uploads one rotation + translation per body segment to the uRag texture (row = ragdoll slot, iMs.z); the shader moves each voxel with its segment
// (the live spell gusts push / pull the body for the whole ragdoll, same field and WIND_K scale as the debris),
// then the dissolve below starts from the settled pose.
// Picks, HP bars and decals use the voxel footprint of the drawn pose frame (frame.pf, a sprite-like box; see actors.js / index.js).
// Lazy: a model's frames are meshed on its first add() (or prepare()); Lina ~150 ms, synchronous. The Mesh objects exist from the start
// (empty geometry, hidden) because index.js registers the shadow casters once at creation.
import * as THREE from 'three';
import { ART_UNITS_PER_PX } from '../../../shared/constants.js';
import { COMMON_GLSL } from './shaderlib.js';
import { WIND_GLSL, windAt } from './wind.js';
import { DEPTH_FRAG } from './shadow.js';
import { ID_BIAS } from './post.js';
import { instancedGeo, flushInstances, DEPTH_GLSL } from './mesh3d.js';
import { buildVoxFrames } from './voxmesh.js';
import { createRagdoll, launchOf, RAG_T, RAG_JOINTS } from './ragdoll.js';
import * as AXE from '../../../shared/vox/heroes/axe.js';
import * as CRYSTAL_MAIDEN from '../../../shared/vox/heroes/crystal_maiden.js';
import * as INVOKER from '../../../shared/vox/heroes/invoker.js';
import * as SPIRIT from '../../../shared/vox/creeps/invoker_forged_spirit.js';
import * as JUGGERNAUT from '../../../shared/vox/heroes/juggernaut.js';
import * as HEALING_WARD from '../../../shared/vox/creeps/juggernaut_healing_ward.js';
import * as LINA from '../../../shared/vox/lina.js';
import * as LION from '../../../shared/vox/heroes/lion.js';
import * as MELEE_D from '../../../shared/vox/creeps/melee_dire.js';
import * as MELEE_R from '../../../shared/vox/creeps/melee_radiant.js';
import * as PUDGE from '../../../shared/vox/heroes/pudge.js';
import * as SVEN from '../../../shared/vox/heroes/sven.js';

export const CHAR_UNIT = 4.2, WORLD_UNIT = 8.4;   // world units per voxel: characters (heroes, creeps, neutrals, Roshan) / world (buildings, trees, clutter, terrain)
/**
 * Every voxel unit, keyed by short name (hero short, 'melee' / 'ranged' / 'siege' for lane creeps of both teams, 'neutral_<x>', 'roshan', ...):
 * { build(pose) -> Vox, anims: { name: [pose] }, cx, cy (voxel foot centre), unit (CHAR_UNIT | WORLD_UNIT), max (instances per pose frame; creeps >= 64),
 *   lean (characters true, buildings false), rig (class, informational: META.rig, e.g. 'biped' | 'quadruped' | 'flyer' | 'big' | 'static'), keys?: [extra unit keys] }
 */
export const VOX_UNITS = {   // heroes + their summons, then creeps; alphabetical within each group (parallel branches merge clean)
  axe: voxEntry(AXE, { unit: CHAR_UNIT, max: 10 }),
  crystal_maiden: voxEntry(CRYSTAL_MAIDEN, { unit: CHAR_UNIT, max: 10 }),
  invoker: voxEntry(INVOKER, { unit: CHAR_UNIT, max: 10 }),
  invoker_forged_spirit: voxEntry(SPIRIT, { unit: CHAR_UNIT, max: 24, night: 0.25 }),   // summon: up to 2 per Invoker (+ Sun Strike shard spirits); lava glows +25% at night
  juggernaut: voxEntry(JUGGERNAUT, { unit: CHAR_UNIT, max: 10 }),
  juggernaut_healing_ward: voxEntry(HEALING_WARD, { unit: CHAR_UNIT, max: 10, keys: ['npc_dota_juggernaut_healing_ward'] }),   // summon (sim key juggernaut_healing_ward); static, lean off
  lina: voxEntry(LINA, { unit: CHAR_UNIT, max: 10 }),
  lion: voxEntry(LION, { unit: CHAR_UNIT, max: 10 }),
  pudge: voxEntry(PUDGE, { unit: CHAR_UNIT, max: 10 }),
  sven: voxEntry(SVEN, { unit: CHAR_UNIT, max: 10 }),
  // lane creeps: Radiant and Dire are separate models (Dota 2), no team tint
  melee_dire: voxEntry(MELEE_D, { unit: CHAR_UNIT, max: 64, keys: ['npc_dota_creep_badguys_melee'] }),
  melee_radiant: voxEntry(MELEE_R, { unit: CHAR_UNIT, max: 64, keys: ['npc_dota_creep_goodguys_melee'] }),
};
/** Registry entry from a model module ({ build, ANIMS, META: { cx, cy, rig } }); o overrides (unit, max, lean, keys, night = extra emissive gain at full night, ...). */
export function voxEntry(mod, o = {}) {
  const M = mod.META || {};
  return { build: mod.build, rigOf: mod.rigOf, anims: mod.ANIMS, cx: M.cx, cy: M.cy, unit: CHAR_UNIT, max: 16, lean: M.rig !== 'static', rig: M.rig || 'biped', ...o };
}
export const VOX_HEROES = VOX_UNITS;   // old name
export const LEAN_TO = 30 * Math.PI / 180;    // view pitch the model is shown at (deg above the horizon)
export const LEAN_K = 1;                      // share of (camera pitch - LEAN_TO) taken by the lean
const _lean = { dx: 0, dy: 1, th: 0 };
/** The voxel lean, one for every unit on screen (the VERT shader does the same): tilt th about the feet along (dx, dy) in game coords = the view
 *  camera's horizontal forward, by (camera pitch - LEAN_TO). From the camera up vector (uniforms.uCamUp). Not per unit: a unit off the screen
 *  centre would lean along its own camera ray (sideways on screen). Shared result object. */
export function leanOf(up) {
  const hl = Math.hypot(up.x, up.z);
  if (hl < 1e-6) { _lean.dx = 0; _lean.dy = 1; _lean.th = 0; return _lean; }
  _lean.dx = up.x / hl; _lean.dy = -up.z / hl; _lean.th = Math.max(0, Math.atan2(hl, up.y) - LEAN_TO) * LEAN_K;
  return _lean;
}
// voxel death (world units, seconds): burst speed out / up, gravity, bounce restitution, ground slide kept after the bounce, launch stagger,
// lean release, dissolve start (+ up to DIE_FADE_J per voxel) -> fully gone at DIE_T
export const DIE_T = 1.45;   // dissolve length, counted from the end of the ragdoll (RAG_T) for heroes
const RAG_SLOTS = 16;         // simultaneous ragdolls (a texture row each)
// debris in the wind: spell gusts (wind.js gustAt, push and pull) + a faint breeze nudge the voxels, grass-scale (WIND_K u per unit gust, clutter3d uses 40, debris is light and moves further)
const WIND_K = 60, WIND_BREEZE = 6, WIND_SETTLED = 0.35, WIND_RAMP = 0.5;
const DIE_OUT = 45, DIE_UP = 80, DIE_G = 1100, DIE_BOUNCE = 0.35, DIE_FRIC = 0.4, DIE_DELAY = 0.08, DIE_LEAN = 0.2, DIE_FADE = 0.8, DIE_FADE_J = 0.3;

/** `?vox=0` turns voxel units off (sprite sheets again). */
export const voxEnabled = typeof location === 'undefined' || new URLSearchParams(location.search).get('vox') !== '0';
const ALIAS = new Map();
for (const n in VOX_UNITS) for (const k of VOX_UNITS[n].keys || []) ALIAS.set(k, n);
/** Registry name for a unit key (npc_dota_hero_lina -> lina, npc_dota_creep_badguys_melee -> melee, npc_dota_neutral_kobold -> neutral_kobold), or ''. */
export function voxNameOf(key) {
  if (!voxEnabled || !key) return '';
  if (VOX_UNITS[key]) return key;
  if (ALIAS.has(key)) return ALIAS.get(key);
  const s = key.replace(/^npc_dota_(hero_|creep_)?/, '').replace(/(^|_)(good|bad)guys_/, '$1');
  return VOX_UNITS[s] ? s : '';
}
export function voxModelOf(short) { return voxNameOf(short); }

const VERT = /* glsl */ `
${COMMON_GLSL.split('float bayer4')[0]}
${WIND_GLSL}
attribute vec3 aCol, aSm;
attribute float aEmit, aFace, aHash;                             // voxmesh.js: aEmit 0 = lit, else gain * 100; aFace = face id | team 8 | corner * 16; aHash = (segment * 32 + random 0..31) - 128
attribute vec3 iPos;
attribute vec4 iXf, iTi, iHi, iMs, iTm;
uniform float uPull, uLeanTo, uLeanK, uQ;
uniform sampler2D uRag;                                          // ragdoll: row = slot, texel 2s = segment s quaternion, 2s+1 = translation + ground height
varying vec3 vW, vN, vFoot, vCol;
varying float vE;
varying vec4 vTi, vHi, vMs;
${DEPTH_GLSL}
vec3 rotY(vec3 v, float c, float s){ return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }
// tilt about the foot in the vertical plane through the camera: +y goes toward h (horizontal unit vector away from the camera)
vec3 lean(vec3 v, vec2 h, float c, float s){ float a = dot(v.xz, h); vec2 xz = v.xz - h * a + h * (a * c + v.y * s); return vec3(xz.x, v.y * c - a * s, xz.y); }
vec3 rotQ(vec4 q, vec3 v){ return v + 2. * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
vec3 ax3(float i){ return vec3(i < .5, abs(i - 1.) < .5, i > 1.5); }
vec3 rotAx(vec3 v, vec3 k, float a){ float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1. - c); }
void main(){
  float kc = floor(aFace / 16. + .01), rem = aFace - kc * 16., tm = step(7.5, rem), fid = rem - tm * 8.;
  float fa = floor(fid * .5 + .1), sd = fid - fa * 2.;
  vec3 nf = (sd > .5 ? 1. : -1.) * ax3(fa);
  vec3 p = position;
  float sc = iXf.y;
  float c = cos(iXf.x), s = sin(iXf.x);
  vec3 n = rotY(normalize(mix(nf, aSm, .7)), c, s), o;
  float dt = iTm.w, die = step(0., dt), dieO = die, alpha = iTi.a;
  if (dt >= 0.) {                                                // voxel death: rigid voxels on ballistic paths
    vec3 t1 = ax3(sd > .5 ? mod(fa + 1., 3.) : mod(fa + 2., 3.)), t2 = ax3(sd > .5 ? mod(fa + 2., 3.) : mod(fa + 1., 3.));
    vec3 cS = position - uQ * (t1 * float(abs(kc - 1.5) < .6) + t2 * float(kc > 1.5) + ax3(fa) * sd) + .5 * uQ;   // voxel centre (stored units)
    vec3 wc = rotY(cS, c, s) * sc, wo = rotY(p - cS, c, s) * sc;
    float u8 = aHash + 128., sg = floor(u8 / 32. + .001), hh = fract(sin(dot(cS, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float r0 = (u8 - sg * 32. + hh) / 32., r1 = fract(r0 * 7.13 + .31), r2 = fract(r0 * 13.7 + .77);
    float td = dt, gOff = 0.;
    int sl = int(iMs.z + .5) - 1;
    if (sl >= 0) {                                                // ragdoll: this voxel's segment pose, then the dissolve from the settled body
      ivec2 tp = ivec2(int(sg + .5) * 2, sl);
      vec4 qa = texelFetch(uRag, tp, 0), tb = texelFetch(uRag, tp + ivec2(1, 0), 0);
      wc = rotQ(qa, wc) + tb.xyz; wo = rotQ(qa, wo); n = rotQ(qa, n); gOff = tb.w; td = dt - ${RAG_T.toFixed(3)};
      dieO = step(0., td);
    }
    if (td < 0.) o = wc + wo;
    else {
    float t = max(0., td - r2 * ${DIE_DELAY.toFixed(3)}), hv = .5 * uQ * sc, a0 = r1 * 6.2832;
    vec2 rd = vec2(cos(a0), sin(a0)), dh = wc.xz, dir = normalize((length(dh) > 1e-3 ? normalize(dh) : rd) * .7 + rd * .3 + 1e-4);
    float vh = ${DIE_OUT.toFixed(1)} * (.4 + .9 * r0), vy = ${DIE_UP.toFixed(1)} * (.35 + .9 * r1), G = ${DIE_G.toFixed(1)};
    float y0 = max(0., wc.y - gOff - hv), ta = (vy + sqrt(vy * vy + 2. * G * y0)) / G, vb = (G * ta - vy) * ${DIE_BOUNCE.toFixed(3)}, tb = 2. * vb / G, y, d;
    if (t < ta) { y = y0 + vy * t - .5 * G * t * t; d = vh * t; }
    else { float u = min(t - ta, tb); y = max(0., vb * u - .5 * G * u * u); d = vh * ta + vh * ${DIE_FRIC.toFixed(3)} * u; }
    vec3 k = vec3(dir.y, 0., -dir.x);                             // roll axis (up x dir): tumbles forward, lands on a face (whole quarter turns)
    float ang = (floor(1. + r2 * 3.) * (r1 > .5 ? 1. : -1.)) * 1.5708 * min(t / (ta + tb), 1.);
    o = vec3(wc.x + dir.x * d, y + hv + gOff, wc.z + dir.y * d) + rotAx(wo, k, ang); n = rotAx(n, k, ang);
    if (uWind > 0.) {                                             // wind: same gust field as the plants, strongest while airborne, per-voxel varied; outside SHADOW so the shadow pass matches
      float air = mix(${WIND_SETTLED.toFixed(2)}, 1., smoothstep(0., 30., y)) * (.65 + .7 * r1) * smoothstep(0., ${WIND_RAMP.toFixed(2)}, t);
      vec2 g = uWN > 0 ? gustAt(iPos.xz + o.xz) : vec2(0.);
      vec2 br = vec2(sin(uTime * 1.7 + r0 * 40.), sin(uTime * 1.3 + r2 * 40.) * .6);
      vec2 wd = (g * ${WIND_K.toFixed(1)} + br * ${WIND_BREEZE.toFixed(1)}) * uWind * air;
      o.xz += wd;
    }
    }
    alpha *= 1. - smoothstep(${DIE_FADE.toFixed(3)} + ${DIE_FADE_J.toFixed(3)} * r0, ${DIE_T.toFixed(3)}, td);
  } else o = rotY(p, c, s) * sc;
  float hl = length(uCamUp.xz);                                 // view camera forward (its up vector tilts along it): one lean for every unit (leanOf);
  vec2 h = hl > 1e-6 ? uCamUp.xz / hl : vec2(0., -1.);           // shadow passes lean too (uCamUp = view camera), so self-shadow matches the drawn body
  float th = max(0., atan(hl, uCamUp.y) - uLeanTo) * uLeanK * (1. - die * smoothstep(0., ${DIE_LEAN.toFixed(3)}, dt)), lc = cos(th), ls = sin(th);
  o = lean(o, h, lc, ls); n = lean(n, h, lc, ls);
  vec3 w = iPos + o;
  vec3 al = aCol;                                                // team voxels: the team colour at the voxel's own ramp luminance
  float tf = tm * step(1e-3, iTm.r + iTm.g + iTm.b);
  const vec3 LUM = vec3(.299, .587, .114);
  al = mix(al, min(iTm.rgb * (dot(al, LUM) / max(dot(iTm.rgb, LUM), .05)), vec3(1.)), tf);
  vW = w; vN = n; vFoot = iPos; vE = aEmit > .5 ? 1. : 0.; vCol = al * iTi.rgb * mix(1., aEmit * .01, vE); vTi = vec4(iXf.w, alpha, iMs.x, iMs.y); vMs = iMs;
  vHi = vec4(iHi.rgb, iHi.a * (1. - dieO));                      // iHi.a = outline id (k / 256); 0 on flying voxels (a ragdoll keeps its line)
  vec4 cr = projectionMatrix * viewMatrix * vec4(w, 1.);
#ifdef SHADOW
  gl_Position = die * alpha < .5 * die ? vec4(2., 2., 2., 1.) : cr;   // dissolved death voxels stop casting
#else
  gl_Position = propDepth(cr, iPos, uPull);
#endif
#ifdef ID
  gl_Position.z -= ${(2 * ID_BIAS).toExponential()} * gl_Position.w;   // toward the camera: passes against the copied scene depth (post.js OUTLINE)
#endif
}`;

// vTi = (flash, alpha, emit gain, rim)
const FRAG = /* glsl */ `
precision highp float;
${COMMON_GLSL}
uniform float uRimOn, uNightGlow;
varying vec3 vW, vN, vFoot, vCol;
varying float vE;
varying vec4 vTi, vHi, vMs;
void main(){
  vec2 dp = floor(gl_FragCoord.xy);
  if (vTi.y < 1. && bayer4(dp) > vTi.y) discard;               // fade = Bayer dissolve, like the sprites
#ifdef ID
  if (vHi.a <= 0.) discard;
  gl_FragColor = vec4(fogGrade(vHi.rgb, vFoot, dp), vHi.a);       // outline colour (fog-graded where the unit stands) + instance id
#else
  vec3 n = normalize(vN);
  float em = vE;
  vec3 alb = vCol;
  vec3 pl = pointLights(vW + n * 6., n, .5);
  float sh = mix(.65, 1., shadowAt(vW, n, dp));                 // units stay readable in tree / building shadow
  vec3 L = shadowAmb(sh) + uKeyCol * ((.3 + .55 * max(dot(n, uKeyDir), 0.)) * sh) + pl;   // .3 floor: the side away from the sun stays readable (sprites: flat .55)
  L = min(quantL(L, dp), vec3(1.2));                            // never washes out under stacked lights (sprites clamp the same)
  vec3 col = alb * L;
  col = mix(col, alb * vTi.z * (1. + uNightGlow * uNight), em);   // registry night: emissives burn a bit hotter at night (lava units)
  vec3 v = normalize(uCamPos - vW);
  float fr = pow(1. - max(dot(n, v), 0.), 3.);
  float kf = smoothstep(-.1, .6, dot(n, uKeyDir)) * mix(.35, 1., sh);
  col += uRimOn * vTi.w * (uRimKey * fr * (.3 + kf) + pl * fr * 1.1) * (1. - em);
  col = mix(col, vec3(1.5, 1.45, 1.35), vTi.x * .7);
  gl_FragColor = vec4(fogGrade(col, vFoot, dp), 1.);
#endif
}`;

const IFLOATS = [['iPos', 3], ['iXf', 4], ['iTi', 4], ['iHi', 4], ['iMs', 4], ['iTm', 4]];

/** Sprite-like pick / bar frame from a voxel footprint (model units x world unit): art px box, foot at (ax, ay); `vox` = solid box hit test. */
function footFrame(fp, unit) {
  const r = fp.r * unit / ART_UNITS_PER_PX, h = fp.top * unit / ART_UNITS_PER_PX;
  return { w: Math.max(1, Math.round(r * 2)), h: Math.max(1, Math.round(h)), ax: r, ay: h, dens: 1, vox: true, r: fp.r * unit, top: fp.top * unit, hw: (fp.max[0] - fp.min[0] + fp.max[2] - fp.min[2]) / 4 * unit };
}

/** ground(x, z) = terrain height at plane coords (x, z = -game y), for the ragdolls. */
export function createVoxActors({ scene, uniforms, ground = () => 0 }) {
  const rimU = { value: 1 }, leanU = { value: LEAN_TO };
  const group = new THREE.Group(); group.name = 'voxactors'; scene.add(group);
  const idScene = new THREE.Scene(); idScene.name = 'vox_ids';   // outline ID pass (post.js), never in the main scene
  let nid = 0;
  const stats = { draws: 0, tris: 0, instances: 0, buildMs: 0 };
  const models = {}, all = [], empty = new THREE.BufferGeometry();
  const ragData = new Float32Array(12 * 4 * RAG_SLOTS), ragTex = new THREE.DataTexture(ragData, 12, RAG_SLOTS, THREE.RGBAFormat, THREE.FloatType);
  ragTex.minFilter = ragTex.magFilter = THREE.NearestFilter; ragTex.needsUpdate = true;
  const ragU = { value: ragTex }, rags = new Map(), ragSlot = new Array(RAG_SLOTS).fill(null), segBuf = new Float32Array(48), W0 = [0, 0];
  if (voxEnabled) for (const name in VOX_UNITS) {
    const h = VOX_UNITS[name], m = models[name] = { h, anims: {}, built: false, vu: 1, radius: 0, qU: { value: 1 } };
    const un = { ...uniforms, uPull: { value: 12 }, uRimOn: rimU, uLeanTo: leanU, uLeanK: { value: h.lean === false ? 0 : LEAN_K }, uQ: m.qU, uRag: ragU, uNightGlow: { value: h.night || 0 } };
    for (const anim in h.anims) m.anims[anim] = h.anims[anim].map((_, i) => {
      const body = new THREE.Mesh(empty, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: un, side: THREE.FrontSide }));
      const ids = new THREE.Mesh(empty, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: un, side: THREE.FrontSide, defines: { ID: 1 } }));
      body.userData.depthMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: DEPTH_FRAG, uniforms: un, side: THREE.DoubleSide, defines: { SHADOW: 1 } });
      for (const o of [body, ids]) { o.frustumCulled = false; o.matrixAutoUpdate = false; o.visible = false; }
      group.add(body); idScene.add(ids);
      body.renderOrder = 1; body.name = `vox_${name}_${anim}${i}`; ids.name = `vox_id_${name}_${anim}${i}`;
      const fr = { inst: null, n: 0, body, ids, tris: 0, pf: null };
      all.push(fr);
      return fr;
    });
  }

  /** Mesh a model's pose frames (first sight). */
  function build(m) {
    const t0 = performance.now(), h = m.h;
    const frames = buildVoxFrames(h.build, h.anims, { cx: h.cx, cy: h.cy, jointsOf: h.rigOf });
    for (const anim in frames) frames[anim].forEach((geo, i) => {
      const f = m.anims[anim][i], inst = f.inst = instancedGeo(geo, h.max, IFLOATS);
      inst.geo.setIndex(geo.index); inst.geo.setDrawRange(0, geo.drawRange.count);
      f.tris = inst.tris = geo.drawRange.count / 3; f.body.geometry = f.ids.geometry = inst.geo; m.vu = geo.userData.unit; m.qU.value = geo.userData.q;
      f.pf = footFrame(geo.userData.fp, h.unit); f.joints = geo.userData.joints || null;
    });
    const idle = (m.anims.idle || Object.values(m.anims)[0])[0];
    for (const anim in m.anims) for (const f of m.anims[anim]) { f.pf.hw = idle.pf.hw; f.pf.ptop = idle.pf.top; f.pf.lean = h.lean !== false; }   // pick box: one stable body size per model (raised arms / walk frames do not change it)
    m.radius = idle.pf.r;   // decal radius: one stable value per model (per-frame reach jumps with raised arms)
    m.built = true; stats.buildMs = performance.now() - t0;
  }

  /** Pose frame for an anim (sprite anim names: channel -> cast, death / dead -> held stunned pose; loops idle / walk / stunned, else holds the last). */
  function pick(m, anim, idx) {
    const dead = anim === 'death' || anim === 'dead';
    const a = anim === 'channel' ? 'cast' : dead ? 'stunned' : anim;
    const list = m.anims[a] || m.anims.idle || Object.values(m.anims)[0];
    const loop = !dead && (a === 'idle' || a === 'walk' || a === 'stunned');
    const n = list.length;
    return list[loop ? ((idx % n) + n) % n : Math.min(Math.max(idx, 0), n - 1)];
  }

  /** Free the slot of a ragdoll (also on revive). */
  function ragEnd(key) { const r = rags.get(key); if (r) { ragSlot[r.slot] = null; rags.delete(key); } }
  /**
   * Start the ragdoll of a dying unit (key = unit id) from the pose frame it is drawn in. o: { anim, idx, facing (game radians), scale, launch: wind sample
   * { dx, dy (game), mag } | null, fall: [x, z] plane direction of a plain collapse, age: seconds already dead (late sight: fast-forward) }.
   * Returns false when the model has no rig (creeps: voxel dissolve only).
   */
  function ragStart(key, name, x, y, z, o = {}) {
    const m = models[name]; if (!m || !m.built || rags.has(key)) return rags.has(key);
    const f = pick(m, o.anim || 'death', o.idx | 0), J = f && f.joints; if (!J) return false;
    let slot = ragSlot.indexOf(null); if (slot < 0) { let oldest = null; for (const [k, r] of rags) if (!oldest || r.age > oldest.age) oldest = r; ragEnd(oldest.key); slot = ragSlot.indexOf(null); }
    const k = m.h.unit * (o.scale || 1), a = (o.facing || 0) + Math.PI / 2, c = Math.cos(a), s = Math.sin(a), rest = {};
    for (const n in J) { const j = J[n]; rest[n] = [(j[0] * c + j[2] * s) * k, j[1] * k, (-j[0] * s + j[2] * c) * k]; }   // rotY of the shader
    const px = x, pz = -y, L = launchOf(o.launch, o.fall);
    const wind = (ox, oz) => { const n = uniforms.uWN ? uniforms.uWN.value : 0; if (!(n > 0) || !(uniforms.uWind.value > 0)) return W0; const g = windAt(uniforms.uWA.value, uniforms.uWB.value, uniforms.uWC.value, n, px + ox, pz + oz), kw = WIND_K * uniforms.uWind.value; g[0] *= kw; g[1] *= kw; return g; };   // the debris' gust field, live for the whole ragdoll
    const rd = createRagdoll(rest, { ...L, scale: k, ground: (ox, oz) => ground(px + ox, pz + oz) - z, wind });
    const r = { key, slot, rd, age: 0, done: false };
    ragSlot[slot] = key; rags.set(key, r);
    if (o.age > 0) rd.advance(Math.min(o.age, RAG_T));
    r.age = o.age || 0; writeRag(r); ragTex.needsUpdate = true;
    return true;
  }
  function writeRag(r) { r.rd.segments(segBuf); ragData.set(segBuf, r.slot * 48); if (r.rd.time >= RAG_T - 1e-6) r.done = true; }
  /** Advance every live ragdoll by dt and refresh the texture; a ragdoll is dropped once its dissolve is over. */
  function ragStep(dt) {
    if (!rags.size) return;
    dt = Math.min(dt, 0.1);
    for (const [key, r] of rags) {
      r.age += dt;
      if (r.age > RAG_T + DIE_T + 0.5) { ragEnd(key); continue; }
      if (!r.done) { r.rd.advance(dt); writeRag(r); }
    }
    ragTex.needsUpdate = true;
  }

  const _w = [1, 1, 1];
  return {
    group, idScene, stats, models,
    has(name) { return !!models[name]; },
    nameOf: voxNameOf,
    /** decal radius of a model (world units at scale 1, its idle footprint); 0 until built */
    radius(name) { const m = models[name]; return m ? m.radius : 0; },
    dieT: DIE_T, ragT: RAG_T, ragStart, ragEnd, ragStep, hasRag: (key) => rags.has(key),
    /** mesh these models now (e.g. on match load) instead of on first sight */
    prepare(names) { for (const n of names) { const m = models[n]; if (m && !m.built) build(m); } },
    begin() { for (const f of all) f.n = 0; nid = 0; },
    /**
     * o: { anim, idx, facing (game radians), tint [r,g,b], alpha, flash, outline [r,g,b,a] | null, emit, rim, scale, team [r,g,b] | null (tints mat.team voxels),
     *   death (seconds since death; < 0 or null = alive) }. Returns the pose frame drawn ({ pf: footprint frame, ... }) or null (unknown / instance cap).
     */
    add(name, x, y, z, o) {
      const m = models[name]; if (!m) return null; if (!m.built) build(m);
      const f = pick(m, o.anim || 'idle', o.idx | 0); if (!f || f.n >= f.inst.max) return null;
      const d = f.inst.data, i = f.n++ * f.inst.stride, t = o.tint || _w, ol = o.outline, tc = o.team;
      d[i] = x; d[i + 1] = z; d[i + 2] = -y;
      d[i + 3] = (o.facing || 0) + Math.PI / 2;      // model front (+z) = game facing
      d[i + 4] = m.h.unit * m.vu * (o.scale || 1); d[i + 5] = 0; d[i + 6] = o.flash || 0;
      d[i + 7] = t[0]; d[i + 8] = t[1]; d[i + 9] = t[2]; d[i + 10] = o.alpha == null ? 1 : o.alpha;
      d[i + 11] = ol ? ol[0] : 0.07; d[i + 12] = ol ? ol[1] : 0.03; d[i + 13] = ol ? ol[2] : 0.06; d[i + 14] = (nid++ % 255 + 1) / 256;   // dark line unless hovered / selected; a = outline id 1..255 (post.js: a line where it changes)
      d[i + 15] = o.emit == null ? 1 : o.emit; d[i + 16] = o.rim == null ? 1 : o.rim; d[i + 17] = 0; d[i + 18] = 0;   // iMs.z = ragdoll slot + 1 (0 = none)
      d[i + 19] = tc ? tc[0] : 0; d[i + 20] = tc ? tc[1] : 0; d[i + 21] = tc ? tc[2] : 0; d[i + 22] = o.death == null || o.death < 0 ? -1 : o.death;
      if (o.rag != null && o.death >= 0) { const r = rags.get(o.rag); if (r) d[i + 17] = r.slot + 1; }
      return f;
    },
    end() {
      let tris = 0, draws = 0, n = 0;
      for (const f of all) { if (!f.inst) continue; flushInstances(f.inst, f.n); f.body.visible = f.ids.visible = f.n > 0; if (f.n) { tris += f.n * f.tris * 2; draws += 2; n += f.n; } }
      stats.tris = tris; stats.draws = draws; stats.instances = n;
    },
    casters() { return all.map((f) => ({ mesh: f.body, mat: f.body.userData.depthMat })); },
    setRim(on) { rimU.value = on ? 1 : 0; },
    dispose() { ragTex.dispose(); for (const f of all) { if (f.inst) f.inst.geo.dispose(); f.body.material.dispose(); f.ids.material.dispose(); f.body.userData.depthMat.dispose(); } scene.remove(group); },
  };
}
