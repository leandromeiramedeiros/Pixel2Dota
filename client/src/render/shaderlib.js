// Shared GLSL chunks + the shared uniform bag (the same Uniform objects are referenced by terrain / sprite / decal / particle materials).
import * as THREE from 'three';
import { MAX_GUSTS } from './wind.js';

export const MAX_LIGHTS = 32;
export const LIGHT_LEVELS = 9;    // quantisation steps per 1.0 of light (trainer: 9-level Bayer)
/** Spell lights (lights.js `cast`) light surfaces this much farther than their authored radius, with a broad (1 - x^2)^2 falloff instead
 *  of the lantern (1 - x)^2, so a blast lights and shadows the towers and units around it. Surface lighting only: glints / bokeh in
 *  post.js still use the authored radius and colour, so the effect itself does not get bigger or brighter. */
export const SPELL_REACH = 1.5;
export const MAX_PS = 10;   // spell lights with a real cube shadow at once (shadow.js renderPoints); the rest fall back to hfShadow
export let SPELL_GAIN = 1.5;
export function setSpellGain(g) { SPELL_GAIN = g; }

export function createSharedUniforms() {
  const fogTex = new THREE.DataTexture(new Uint8Array([255, 255, 0, 0]), 1, 1, THREE.RGFormat, THREE.UnsignedByteType);
  fogTex.needsUpdate = true;
  const voidTex = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat, THREE.UnsignedByteType);
  voidTex.needsUpdate = true;
  return {
    uTime: { value: 0 },
    uAmb: { value: new THREE.Vector3(1, 1, 1) },
    uKeyDir: { value: new THREE.Vector3(-0.5, 0.75, 0.45).normalize() },   // toward the key light (sun/moon), three coords
    uKeyCol: { value: new THREE.Vector3(0.18, 0.16, 0.1) },
    uRimKey: { value: new THREE.Vector3(0.5, 0.45, 0.3) },                  // key rim colour * strength
    uKeyRimDir: { value: new THREE.Vector2(-0.6, 0.8) },                    // key light direction in sprite plane (x right, y up)
    uNight: { value: 0 },
    uLN: { value: 0 },
    uLP: { value: new Float32Array(MAX_LIGHTS * 4) },
    uLC: { value: new Float32Array(MAX_LIGHTS * 4) },
    uLevels: { value: LIGHT_LEVELS },
    uFog: { value: fogTex },
    uFogMap: { value: new THREE.Vector4(-8832, 8832, 17664, 0) },           // x0, y1, size (world), enabled
    uGround: { value: 3 },                                                  // terrain ground detail tier (quality preset `ground`, terrain.js)
    uFogMist: { value: 1 },                                                 // fog-of-war mist on (atmos >= 1: medium and up)
    uVoid: { value: voidTex },                                              // static mist over the dead ground behind the fountains + map rim (fog.js voidMask)
    uFogLv: { value: new THREE.Vector3(0.5, 0.41, 0.6) },                   // fogged (explored) brightness, never-seen brightness, fogged desaturation; fog.js sets these from FOG_LEVEL / FOG_UNSEEN_DARKEN / FOG_DESAT
    uCamRight: { value: new THREE.Vector3(1, 0, 0) },
    uCamUp: { value: new THREE.Vector3(0, 1, 0) },
    uCamPos: { value: new THREE.Vector3() },
    uRT: { value: new THREE.Vector2(640, 360) },                            // render target size in px
    uPxK: { value: 1 },                                                     // 0.5 * RTheight * P11: px per world unit = uPxK / viewDepth
    uArtPx: { value: 2 },                                                   // RT px per art px at the reference distance
    uRefW: { value: 1134 },                                                 // reference clip.w (camera distance to target)
    uPersp: { value: 0 },                                                   // 0 = constant sprite scale, 1 = perspective scale
    uShadowMap: { value: null },                                            // key-light depth map (shadow.js)
    uShadowM: { value: new THREE.Matrix4() },                               // world (three coords) -> shadow map uv + depth
    uPSMap: { value: null },                                                // spell-light cube shadows: atlas of MAX_PS rows x 6 faces (shadow.js renderPoints)
    uPSR: { value: [0, 1, 2, 3, 4, 5].map(() => new THREE.Matrix3()) },     // per face: world direction -> face view space
    uPSS: { value: new Float32Array(MAX_LIGHTS) },                          // per light: cube shadow slot + 1 (0 = none), set by lights.js
    uPSL: { value: new Float32Array(MAX_PS * 4) },                          // per slot: far, fade weight, -, -
    uSL: { value: new THREE.Vector4(0, 1, 0, 0) },                         // light of the shadow pass being drawn: xyz = dir toward it (w 0) or its position (w 1)
    uHF: { value: null },                                                   // top-down height field (shadow.js renderHeight): depth of the highest caster
    uHFM: { value: new THREE.Vector4(0, 0, 1, 0) },                         // xz -> uv: u = (x - .x) * .z, v = (.y - z) * .z
    uHFZ: { value: new THREE.Vector4(0, 1, 2, 0) },                         // camera y, near, far, strength (0 = off)
    uLB: { value: new Float32Array(MAX_LIGHTS * 4) },                       // per light: bounce colour (light * ground albedo), w = ground y (three)
    uBounceK: { value: 0.4 },                                               // bounce strength
    uKnee: { value: new THREE.Vector2(1.1, 0.5) },                          // stacked spell light: untouched up to x, then rolls off to at most x + y (y 0 = off)
    // spell wind (wind.js): uWind = base sway + gust gain (0 = static), then up to MAX_GUSTS packed gusts
    uWind: { value: 1 }, uWN: { value: 0 },
    uWA: { value: new Float32Array(MAX_GUSTS * 4) }, uWB: { value: new Float32Array(MAX_GUSTS * 4) }, uWC: { value: new Float32Array(MAX_GUSTS * 4) },
    uShadowP: { value: new THREE.Vector4(1 / 1024, 1, 0.0009, 0) },         // texel, strength, depth bias, enabled
  };
}

export const UNIFORMS_GLSL = /* glsl */ `
uniform float uTime;
uniform vec3 uAmb, uKeyDir, uKeyCol, uRimKey;
uniform vec2 uKeyRimDir;
uniform float uNight, uLevels;
uniform int uLN;
uniform vec4 uLP[${MAX_LIGHTS}];
uniform vec4 uLC[${MAX_LIGHTS}];
uniform sampler2D uFog, uVoid;
uniform vec4 uFogMap;
uniform vec3 uFogLv;
uniform float uFogMist;
uniform vec3 uCamRight, uCamUp, uCamPos;
uniform vec2 uRT;
uniform float uPxK, uArtPx, uRefW, uPersp;
`;

export const COMMON_GLSL = UNIFORMS_GLSL + /* glsl */ `

float bayer4(vec2 p){
  vec2 b = mod(floor(p), 4.);
  vec4 r = b.y < .5 ? vec4(0.,8.,2.,10.) : b.y < 1.5 ? vec4(12.,4.,14.,6.) : b.y < 2.5 ? vec4(3.,11.,1.,9.) : vec4(15.,7.,13.,5.);
  float v = b.x < .5 ? r.x : b.x < 1.5 ? r.y : b.x < 2.5 ? r.z : r.w;
  return (v + .5) / 16.;
}
// light quantised to uLevels steps with ordered dither (dp = stable art-pixel coordinate)
vec3 quantL(vec3 l, vec2 dp){ float bay = bayer4(dp); return min(floor(l * uLevels + bay) / uLevels, vec3(1.7)); }

// fog brightness at world point p (three coords): 1 visible, uFogLv.x fogged (explored), uFogLv.y never seen (<= x). Fog texture: R = visible
// (eased + blurred CPU side = soft, animated edge), G = explored. Visibility is quantised to uLevels Bayer-dithered steps (soft pixel-art edge).
float fogVis(vec3 p, vec2 dp){
  if (uFogMap.w < .5) return 1.;
  vec2 uv = vec2((p.x - uFogMap.x) / uFogMap.z, (p.z + uFogMap.y) / uFogMap.z);
  vec2 f = texture2D(uFog, uv).rg;
  float b = bayer4(dp);
  float seen = clamp(floor(f.g * 4. + b) / 4., 0., 1.);
  float v = clamp(floor(f.r * uLevels + b) / uLevels, 0., 1.);
  return mix(mix(uFogLv.y, uFogLv.x, seen), 1., v);
}
// void mist (scenery, independent of fog of war): dense dark cloud over the dead ground far from any walkable tile (behind the fountains,
// the map rim). 0 = clear .. 1 = buried. Slow two-octave drift, quantised to 4 Bayer-dithered steps; dark and cool, never a whiteout.
float voidAmt(vec3 p, vec2 dp){
  float v = texture2D(uVoid, vec2((p.x - uFogMap.x) / uFogMap.z, (p.z + uFogMap.y) / uFogMap.z)).r;
  if (v <= 0.) return 0.;
  float n = sin(p.x * .0021 + uTime * .07) * sin(p.z * .0017 - uTime * .05) + .5 * sin((p.x - p.z) * .0047 + uTime * .09);
  return clamp(floor(clamp(v * (1. + .22 * n), 0., 1.) * 4. + bayer4(dp + 5.)) / 4., 0., 1.);
}
vec3 voidCol(vec3 p, vec2 dp){                                          // billowing cloud: two drifting octaves, 3 dithered shades
  float n = .5 + .3 * sin(p.x * .0026 - uTime * .05) * sin(p.z * .0031 + uTime * .04) + .2 * sin(p.x * .0071 + p.z * .0053 + uTime * .08);
  n = floor(n * 3. + bayer4(dp + 9.)) / 3.;
  return mix(vec3(.11, .12, .145), vec3(.04, .045, .07), uNight) * (.75 + .5 * n);
}
float fogBright(vec3 p, vec2 dp){ return fogVis(p, dp) * (1. - .85 * voidAmt(p, dp)); }
// graded fog colour (Dota look): visible = untouched; fogged = darkened, desaturated (uFogLv.z), cool blue, with a faint slow drifting cloud.
vec3 fogGrade(vec3 col, vec3 p, vec2 dp){
  float fb = fogVis(p, dp);
  float amt = 1. - smoothstep(uFogLv.x, 1., fb);
  if (amt > 0.) {
    float l = dot(col, vec3(.299, .587, .114));
    col = mix(col, vec3(l) * vec3(.78, .92, 1.14), amt * uFogLv.z);
    float n = .5 + .25 * sin(p.x * .0034 + uTime * .11) * sin(p.z * .0029 - uTime * .08) + .25 * sin((p.x + p.z) * .0061 - uTime * .05);
    float cl = (floor(n * 3. + bayer4(dp + 3.)) / 3. - .5) * .12;
    col *= 1. + amt * cl;
  }
  col *= fb;
  if (uFogMist > .5 && uFogMap.w > .5) {                                  // fog mist (looks only): drifting cloud over unseen ground, B = slow eased mist
    float m = texture2D(uFog, vec2((p.x - uFogMap.x) / uFogMap.z, (p.z + uFogMap.y) / uFogMap.z)).b;
    if (m > .01) {
      float n = .5 + .3 * sin(p.x * .0019 + uTime * .06) * sin(p.z * .0023 - uTime * .045) + .2 * sin(p.x * .0057 - p.z * .0043 + uTime * .1);
      float cv = clamp(m * 1.7 - .7 + (n - .5) * 1.1, 0., 1.);          // thinning mist breaks into drifting patches before it is gone
      cv = floor(cv * 4. + bayer4(dp + 11.)) / 4.;
      col = mix(col, voidCol(p, dp) * 1.35, cv * .45);
    }
  }
  float vm = voidAmt(p, dp);
  return vm > 0. ? mix(col, voidCol(p, dp), vm) : col;
}

// key-light visibility at world point p (1 lit .. 1-strength shadowed). Normal offset + 4 Bayer-jittered taps give a dithered,
// pixel-crisp penumbra; fades out toward the map border. Multiply the key term (and key rim) with it, and the ambient with shadowAmb().
uniform sampler2D uShadowMap;
uniform mat4 uShadowM;
uniform vec4 uShadowP;
float shadowAt(vec3 p, vec3 n, vec2 dp){
  if (uShadowP.w < .5) return 1.;
  vec4 s = uShadowM * vec4(p + n * 5. + vec3(0., 2., 0.), 1.);
  vec2 e = min(s.xy, 1. - s.xy);
  if (min(e.x, e.y) <= 0.) return 1.;
  float j = bayer4(dp) - .5, r = uShadowP.x * 1.5, z = s.z - uShadowP.z, v = 0.;
  v += step(z, texture2D(uShadowMap, s.xy + vec2(-r, -r * .3) + j * r).r);
  v += step(z, texture2D(uShadowMap, s.xy + vec2( r,  r * .3) - j * r).r);
  v += step(z, texture2D(uShadowMap, s.xy + vec2( r * .3, -r) + j * r).r);
  v += step(z, texture2D(uShadowMap, s.xy + vec2(-r * .3,  r) - j * r).r);
  v = floor(v * .25 * 2. + bayer4(dp + 7.)) * .5;                       // 3 levels, ordered dither
  v = mix(1., v, smoothstep(0., .06, min(e.x, e.y)));
  return mix(1. - uShadowP.y, 1., v);
}

// ambient occlusion by the key shadow: open-sky light is also partly blocked by the caster
vec3 shadowAmb(float sh){ return uAmb * mix(.8, 1., sh); }

// cube shadow of the light in atlas row 'slot' at p: the face is the major axis of p - lp (90 deg perspective), its view depth is that
// axis length. Faces are laid out 6 per row, one row per slot (shadow.js renderPoints); near 8, depth bias 10 world units.
uniform sampler2D uPSMap;
uniform mat3 uPSR[6];
uniform vec4 uPSS[${MAX_LIGHTS / 4}];   // packed 4 per vec4 (keeps the fragment uniform count low)
uniform vec4 uPSL[${MAX_PS}];
float pointShadow(vec3 p, vec3 lp, int slot, float far){
  vec3 d = p - lp, a = abs(d);
  int f; float z;
  if (a.x >= a.y && a.x >= a.z) { f = d.x > 0. ? 0 : 1; z = a.x; }
  else if (a.y >= a.z) { f = d.y > 0. ? 2 : 3; z = a.y; }
  else { f = d.z > 0. ? 4 : 5; z = a.z; }
  if (z >= far) return 1.;
  vec3 v = uPSR[f] * d;
  vec2 uv = clamp(v.xy / max(-v.z, 1e-3) * .5 + .5, .004, .996);
  float zd = texture2D(uPSMap, vec2((float(f) + uv.x) / 6., (float(slot) + uv.y) / ${MAX_PS}.)).r;
  float lin = 8. * far / (far - zd * (far - 8.));
  return step(z - 10., lin);
}

// sum of point lights at world point p with surface normal n; soft = how much of each light ignores the normal
// distance falloff of light i: w = uLC[i].w (1 = lantern; 1 + gain = spell light, see SPELL_REACH)
float lightFall(float dist, float R, float w){
  if (w > 1.5) { float x = dist / (R * ${SPELL_REACH.toFixed(2)}); if (x >= 1.) return 0.; float q = 1. - x * x; return q * q * (w - 1.); }
  float a = 1. - dist / R; return a > 0. ? a * a : 0.;
}
float gPSh = 1.;
// every non-cube spell light: march 12 steps toward it through the height field (terrain, buildings, trees, clutter, unit pillars).
// Starts one tile out so a receiver never reads its own column; penumbra widens with distance.
uniform sampler2D uHF;
uniform vec4 uHFM, uHFZ;
uniform vec4 uLB[${MAX_LIGHTS}];
uniform float uBounceK; uniform vec2 uKnee;
float hfShadow(vec3 p, vec3 lp){
  vec3 d = lp - p; float L = length(d.xz);
  float t0 = gPSh > .5 ? 48. : 110.;   // sprites start past their own pillar disc
  if (L < t0 + 24.) return 1.;
  float vis = 1.;
  for (int s = 0; s < 12; s++){
    float t = t0 + (L - t0 - 24.) * (float(s) + .5) / 12.;
    vec3 q = p + d * (t / L);
    vec2 uv = vec2((q.x - uHFM.x) * uHFM.z, (uHFM.y - q.z) * uHFM.z);
    if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) break;
    float hh = uHFZ.x - (uHFZ.y + texture2D(uHF, uv).r * (uHFZ.z - uHFZ.y));
    vis = min(vis, clamp((q.y + 6. - hh) / (6. + .06 * t), 0., 1.));
  }
  return vis;
}   // receivers that also cast as billboards (sprites) set 0: their own light-facing card would self-shadow them
vec3 pointLights(vec3 p, vec3 n, float soft){
  vec3 acc = vec3(0.), sp = vec3(0.), hw = vec3(0.);   // sp: spell light, compressed as a whole so a stacked teamfight doesn't blow out to white
  float ws = 0.;                                         // hw / ws: colour weighted by each light's own brightness (local dominant hue)
  for (int i = 0; i < ${MAX_LIGHTS}; i++){
    if (i >= uLN) break;
    vec3 d = uLP[i].xyz - p;
    float dist = length(d);
    float a = lightFall(dist, uLP[i].w, uLC[i].w);
    if (a <= 0.) continue;
    bool spell = uLC[i].w > 1.5;
    int slot = int(uPSS[i / 4][i - (i / 4) * 4]) - 1;
    if (slot >= 0) { if (gPSh > .5) a *= mix(1., mix(.03, 1., pointShadow(p, uLP[i].xyz, slot, uPSL[slot].x)), uPSL[slot].y); }
    else if (spell && uHFZ.w > 0.) a *= mix(1., mix(.1, 1., hfShadow(p, uLP[i].xyz)), uHFZ.w);
    if (spell) {   // one-bounce fake GI: the spell colour reflected off the ground under it, lighting what faces it (unit fronts, tower bases)
      vec3 db = vec3(uLP[i].x, uLB[i].w, uLP[i].z) - p; float bd = length(db), bx = bd / (uLP[i].w * ${SPELL_REACH.toFixed(2)}), bf = 1. - bx * bx;
      if (bf > 0.) sp += uLB[i].rgb * (uBounceK * bf *mix(max(dot(n, db / max(bd, 1.)), 0.), 1., .15));
    }
    float ndl = max(dot(n, d / max(dist, 1.)), 0.);
    vec3 c = uLC[i].rgb * (a * mix(ndl, 1., spell ? max(soft, .7) : soft));   // spell lights stay strong at grazing angles
    if (spell) { sp += c; float w = max(c.r, max(c.g, c.b)); hw += c * w; ws += w; } else acc += c;
  }
  // overlapping spells: pull the summed colour toward the locally dominant light's hue (a plain sum of 20 colours is a muddy lavender)
  if (ws > 1e-3) { vec3 hc = hw / ws; float mh = max(hc.r, max(hc.g, hc.b)), ms = max(sp.r, max(sp.g, sp.b)); if (mh > 1e-4) sp = mix(sp, hc * (ms / mh), .6); }
  float m = max(sp.r, max(sp.g, sp.b)), o = m - uKnee.x;
  if (uKnee.y > 0. && o > 0.) sp *= (uKnee.x + o / (1. + o / uKnee.y)) / m;   // hue-preserving soft knee on the brightest channel
  return acc + sp;
}
`;
