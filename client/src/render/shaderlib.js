// Shared GLSL chunks + the shared uniform bag (the same Uniform objects are referenced by terrain / sprite / decal / particle materials).
import * as THREE from 'three';

export const MAX_LIGHTS = 32;
export const LIGHT_LEVELS = 9;    // quantisation steps per 1.0 of light (trainer: 9-level Bayer)

export function createSharedUniforms() {
  const fogTex = new THREE.DataTexture(new Uint8Array([255, 255, 0, 0]), 1, 1, THREE.RGFormat, THREE.UnsignedByteType);
  fogTex.needsUpdate = true;
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
    uFogLv: { value: new THREE.Vector3(0.34, 0.6, 1) },                    // unexplored, explored brightness (v2: never pure black)
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
    uPSMap: { value: null },                                                // spell-light cube shadow, 3x2 face atlas (shadow.js renderPoint)
    uPSM: { value: [0, 1, 2, 3, 4, 5].map(() => new THREE.Matrix4()) },     // per face: world -> atlas uv (xy / w)
    uPSIdx: { value: -1 },                                                  // index into uLP of the shadow-casting light, -1 = none
    uPSP: { value: new THREE.Vector4(8, 600, 10, 0) },                     // near, far, bias (world units), fade weight
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
uniform sampler2D uFog;
uniform vec4 uFogMap;
uniform vec3 uFogLv;
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

// fog brightness at world point p (three coords), 5-step dithered edge
float fogBright(vec3 p, vec2 dp){
  if (uFogMap.w < .5) return 1.;
  vec2 uv = vec2((p.x - uFogMap.x) / uFogMap.z, (p.z + uFogMap.y) / uFogMap.z);
  vec2 f = texture2D(uFog, uv).rg;
  float lo = uFogLv.x;
  float t = mix(mix(lo, uFogLv.y, f.g), 1., f.r);
  t = (t - lo) / (1. - lo);
  t = floor(t * 5. + bayer4(dp)) / 5.;
  return lo + clamp(t, 0., 1.) * (1. - lo);
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

// shadow of the ONE casting point light (uPSIdx) at p: the cube face is the major axis of p - lp, its view depth is that axis length
uniform sampler2D uPSMap;
uniform mat4 uPSM[6];
uniform int uPSIdx;
uniform vec4 uPSP;
float pointShadow(vec3 p, vec3 lp){
  vec3 d = p - lp, a = abs(d);
  mat4 M; float z;
  if (a.x >= a.y && a.x >= a.z) { M = d.x > 0. ? uPSM[0] : uPSM[1]; z = a.x; }
  else if (a.y >= a.z) { M = d.y > 0. ? uPSM[2] : uPSM[3]; z = a.y; }
  else { M = d.z > 0. ? uPSM[4] : uPSM[5]; z = a.z; }
  vec4 s = M * vec4(p, 1.);
  float zd = texture2D(uPSMap, s.xy / s.w).r;
  float lin = uPSP.x * uPSP.y / (uPSP.y - zd * (uPSP.y - uPSP.x));
  return step(z - uPSP.z, lin);
}

// sum of point lights at world point p with surface normal n; soft = how much of each light ignores the normal
vec3 pointLights(vec3 p, vec3 n, float soft){
  vec3 acc = vec3(0.);
  for (int i = 0; i < ${MAX_LIGHTS}; i++){
    if (i >= uLN) break;
    vec3 d = uLP[i].xyz - p;
    float dist = length(d);
    float a = 1. - dist / uLP[i].w;
    if (a <= 0.) continue;
    a *= a;
    if (i == uPSIdx) a *= mix(1., mix(.15, 1., pointShadow(p, uLP[i].xyz)), uPSP.w);
    float ndl = max(dot(n, d / max(dist, 1.)), 0.);
    acc += uLC[i].rgb * (a * mix(ndl, 1., soft));
  }
  return acc;
}
`;
