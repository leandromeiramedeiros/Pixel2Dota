// Instanced billboards. One draw call for every unit / tree / building sprite (alpha-cutout, depth writing) plus one for ground decals.
//
// 2.5D depth trick: each sprite is a camera-facing quad (so art keeps its authored look) but the fragment depth is NOT the quad's own
// depth: gl_Position.z is replaced by the NDC depth of the sprite's FOOT point (pulled DEPTH_PULL units toward the camera). That makes the
// whole sprite behave like a vertical plane standing at its feet: cliffs / terrain nearer to the camera than the feet hide it, taller
// ground behind it does not, and sprites sort against each other and against trees by foot depth exactly like classic 2D y-sorting.
// The foot is snapped to the render-target pixel grid and the art-pixel size is an integer number of RT pixels (unless perspective
// scaling is on), so sprites never shimmer or resample.
import * as THREE from 'three';
import { COMMON_GLSL, UNIFORMS_GLSL } from './shaderlib.js';

export const STRIDE = 24;                 // floats per sprite instance
export const MAX_SPRITES = 9000;
export const MAX_DECALS = 1024;
export const DEPTH_PULL = 12;             // world units toward the camera for the foot depth

const SPRITE_VERT = /* glsl */ `
${UNIFORMS_GLSL}
attribute vec2 corner;
attribute vec3 iPos;
attribute vec4 iRect, iSize, iTint, iOut, iMisc;
attribute float iDens;                                          // art pixels per 1x pixel (2 = hero sheets drawn at double resolution)
varying vec2 vTx;
varying float vDens;
varying vec3 vWorld, vFoot;
varying vec4 vRect, vSize, vTint, vOut, vMisc;
void main(){
  vec3 toCam = normalize(uCamPos - iPos);
  vec4 fc = projectionMatrix * viewMatrix * vec4(iPos + toCam * ${DEPTH_PULL.toFixed(1)}, 1.);
  vec4 fp = projectionMatrix * viewMatrix * vec4(iPos, 1.);
  float s = uArtPx * iMisc.w * mix(1., uRefW / fp.w, uPersp);
  s = mix(max(1., floor(s + .5)), s, uPersp) / iDens;
  vec2 rtpx = floor((fp.xy / fp.w * .5 + .5) * uRT + .5);
  vec2 local = mix(vec2(-iDens), iSize.xy + iDens, corner);      // art px, from frame top-left, 1 (1x) px margin for outline / rim
  vDens = iDens;
  vTx = local;
  vec2 off = vec2(local.x - (iSize.z + .5), -(local.y - (iSize.w + .5))) * s;
  vec2 ndc = (rtpx + off) / uRT * 2. - 1.;
  float wpp = 6. * iMisc.w / iDens;                                      // world units per art px (for lighting only)
  vWorld = iPos + uCamRight * ((local.x - iSize.z - .5) * wpp) + vec3(0., 1., 0.) * max((iSize.w + .5 - local.y) * wpp * .7, 0.);
  vFoot = iPos;
  vRect = iRect; vSize = iSize; vTint = iTint; vOut = iOut; vMisc = iMisc;
  gl_Position = vec4(ndc * fp.w, fc.z / fc.w * fp.w, fp.w);
}`;

// Shadow-caster variant: the same instances as vertical cards standing at the foot, turned to face the light of the pass (uSL: sun
// direction or spell-light position), alpha-tested against the atlas, so units throw their real silhouette onto terrain and buildings.
// uSL.w == 2 (top-down height-field pass): a flat disc at ~70% of the unit height instead, so marched spell shadows see a pillar.
const SPRITE_DEPTH_VERT = /* glsl */ `
uniform vec4 uSL;
attribute vec2 corner;
attribute vec3 iPos;
attribute vec4 iRect, iSize, iMisc;
attribute float iDens;
varying vec2 vTx, vDisc;
varying vec4 vRect, vSize, vMisc;
void main(){
  vec2 local = corner * iSize.xy;
  float wpp = 6. * iMisc.w / iDens;
  vTx = local; vRect = iRect; vSize = iSize; vMisc = iMisc; vDisc = vec2(0., -1.);
  if (uSL.w > 1.5) {   // top-down heightfield pass (shadow.js renderHeight): a flat disc at ~70% of the unit's height (pillar occluder)
    float ht = iSize.w * wpp * .85, rad = min(.3 * iSize.x * wpp, 40.);
    vDisc = corner - .5;
    gl_Position = projectionMatrix * viewMatrix * vec4(iPos + vec3(vDisc.x * 2. * rad, ht * .7, vDisc.y * 2. * rad), 1.);
    return;
  }
  vec3 tl = uSL.w > .5 ? uSL.xyz - iPos : uSL.xyz;
  vec2 h = tl.xz; h = dot(h, h) > 1e-6 ? normalize(h) : vec2(0., 1.);
  vec3 right = vec3(-h.y, 0., h.x);
  vec3 w = iPos + right * ((local.x - iSize.z - .5) * wpp) + vec3(0., 1., 0.) * ((iSize.w + .5 - local.y) * wpp * .85) + vec3(h.x, 0., h.y) * 4.;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.);
}`;
const SPRITE_DEPTH_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tAtlas;
varying vec2 vTx, vDisc;
varying vec4 vRect, vSize, vMisc;
void main(){
  if (vMisc.w < .3 || vMisc.x < .5) discard;                       // tiny props / fading units do not cast
  if (vDisc.y > -.75) { if (dot(vDisc, vDisc) > .25) discard; gl_FragColor = vec4(1.); return; }
  vec2 ip = floor(vTx);
  vec4 c = texture2D(tAtlas, vec2(mix(vRect.x, vRect.z, (ip.x + .5) / vSize.x), mix(vRect.y, vRect.w, (ip.y + .5) / vSize.y)));
  if (c.a < .5) discard;
  gl_FragColor = vec4(1.);
}`;

const SPRITE_FRAG = /* glsl */ `
precision highp float;
${COMMON_GLSL}
uniform sampler2D tAtlas, tEmit;
uniform float uRimOn;
varying vec2 vTx;
varying float vDens;
varying vec3 vWorld, vFoot;
varying vec4 vRect, vSize, vTint, vOut, vMisc;

vec4 fetchA(vec2 q){
  if (q.x < 0. || q.y < 0. || q.x >= vSize.x || q.y >= vSize.y) return vec4(0.);
  return texture2D(tAtlas, vec2(mix(vRect.x, vRect.z, (q.x + .5) / vSize.x), mix(vRect.y, vRect.w, (q.y + .5) / vSize.y)));
}
float fetchE(vec2 q){
  return texture2D(tEmit, vec2(mix(vRect.x, vRect.z, (q.x + .5) / vSize.x), mix(vRect.y, vRect.w, (q.y + .5) / vSize.y))).a;
}
vec2 stepDir(vec2 d){   // sprite-plane direction (x right, y up) -> 8-way texel step (y down)
  vec2 n = d / max(length(d), 1e-4);
  return vec2(abs(n.x) > .38 ? sign(n.x) : 0., abs(n.y) > .38 ? -sign(n.y) : 0.);
}
void main(){
  vec2 ip = floor(vTx);
  vec4 c = fetchA(ip);
  if (vMisc.x < 1. && bayer4(ip + floor(vFoot.xz / 6.)) > vMisc.x) discard;
  if (c.a < .5) {
    // 1 px outline (team / selection colour)
    if (vOut.a > 0.) {
      float nb = fetchA(ip + vec2(vDens, 0.)).a + fetchA(ip - vec2(vDens, 0.)).a + fetchA(ip + vec2(0., vDens)).a + fetchA(ip - vec2(0., vDens)).a;
      if (vDens > 1.5) nb += fetchA(ip + vec2(1., 0.)).a + fetchA(ip - vec2(1., 0.)).a + fetchA(ip + vec2(0., 1.)).a + fetchA(ip - vec2(0., 1.)).a;   // outline stays 1 (1x) px thick on dense sheets
      if (nb > .5) { gl_FragColor = vec4(vOut.rgb * fogBright(vFoot, ip), 1.); return; }
    }
    discard;
  }
  vec3 n = normalize(vec3(0., .55, .83));
  gPSh = 0.;
  vec3 L = uAmb + uKeyCol * .55 + pointLights(vWorld + n * 8., n, .65);
  L = min(quantL(L, ip), vec3(1.2));   // units never wash out under stacked tower / hero / spell lights (readability)
  vec3 alb = c.rgb * vTint.rgb;
  vec3 col = alb * L;
  float em = fetchE(ip) * 4.;
  col += alb * em * vMisc.y;
  // rim: silhouette pixels facing the key light / the strongest point light
  if (uRimOn > .5 && vMisc.z > 0.) {
    vec3 rimc = vec3(0.);
    vec2 sk = stepDir(uKeyRimDir);
    float e1 = 1. - step(.5, fetchA(ip + sk).a);
    float e2 = e1 > 0. ? 1. : 1. - step(.5, fetchA(ip + sk * 2.).a);
    rimc += uRimKey * (e1 > 0. ? 1. : e2 * .45);
    vec2 sd = vec2(0.); vec3 sc = vec3(0.);
    for (int i = 0; i < ${32}; i++){
      if (i >= uLN) break;
      vec3 d = uLP[i].xyz - vWorld;
      float dist = length(d);
      float a = lightFall(dist, uLP[i].w * 1.15, uLC[i].w);
      if (a <= 0.) continue;
      vec2 pd = vec2(dot(d, uCamRight), dot(d, uCamUp));
      sd += normalize(pd + 1e-3) * a * dot(uLC[i].rgb, vec3(.33));
      sc += uLC[i].rgb * a;
    }
    if (dot(sd, sd) > 1e-6) {
      vec2 st = stepDir(sd);
      float p1 = 1. - step(.5, fetchA(ip + st).a);
      float p2 = p1 > 0. ? 1. : 1. - step(.5, fetchA(ip + st * 2.).a);
      float pl = p1 > 0. ? 1. : p2 * .7;
      rimc += mix(sc, vec3(max(sc.r, max(sc.g, sc.b))), .5) * pl * 1.8;   // spell / lantern light wraps the silhouette
    }
    col += rimc * vMisc.z * (.4 + .6 * c.a);
  }
  col = mix(col, vec3(1.5, 1.45, 1.35), vTint.w);
  col *= fogBright(vFoot, ip);
  gl_FragColor = vec4(col, 1.);
}`;

const DECAL_VERT = /* glsl */ `
${UNIFORMS_GLSL}
attribute vec2 corner;
attribute vec3 iPos;
attribute vec4 iRad, iCol, iH;
varying vec2 vP;
varying vec4 vRad, vCol;
varying vec3 vWorld;
void main(){
  vec2 q = corner * 2. - 1.;
  float h = mix(mix(iH.x, iH.y, corner.x), mix(iH.z, iH.w, corner.x), corner.y);
  vec3 w = vec3(iPos.x + q.x * iRad.x, h + 2.5, iPos.z + q.y * iRad.x * iRad.w);
  vP = q; vRad = iRad; vCol = iCol; vWorld = w;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.);
}`;

const DECAL_FRAG = /* glsl */ `
precision highp float;
${COMMON_GLSL}
varying vec2 vP;
varying vec4 vRad, vCol;
varying vec3 vWorld;
void main(){
  vec2 dp = floor(vWorld.xz / 6.);
  float r = length(vP);
  float a = 0.;
  if (vRad.y < .5) {            // blob shadow: dithered ellipse
    a = vCol.a * (1. - smoothstep(.35, 1., r));
    a = step(bayer4(dp), a) * vCol.a;
  } else {                      // ring: 1.5 px thick at the rim
    float px = 6. / vRad.x;
    float ring = step(1. - 2. * px, r) * step(r, 1.);
    float dash = vRad.z > .5 ? step(.5, fract(atan(vP.y, vP.x) * 2.5 + uTime * .8)) : 1.;
    a = ring * dash * vCol.a;
    if (a < .5) discard;
    gl_FragColor = vec4(vCol.rgb * fogBright(vWorld, dp), 1.);
    return;
  }
  if (a < .05) discard;
  float fg = fogBright(vWorld, dp);
  gl_FragColor = vec4(vCol.rgb * fg, a);
}`;

function quadGeo(maxInstances, attrs) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('corner', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));   // unused, keeps three happy
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const stride = attrs.reduce((s, a) => s + a[1], 0);
  const data = new Float32Array(maxInstances * stride);
  const buf = new THREE.InstancedInterleavedBuffer(data, stride, 1); buf.setUsage(THREE.DynamicDrawUsage);
  let off = 0;
  for (const [name, size] of attrs) { g.setAttribute(name, new THREE.InterleavedBufferAttribute(buf, size, off)); off += size; }
  g.instanceCount = 0;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
  return { geo: g, buf, data, stride };
}

export function createSprites({ scene, uniforms, atlas }) {
  const S = quadGeo(MAX_SPRITES, [['iPos', 3], ['iRect', 4], ['iSize', 4], ['iTint', 4], ['iOut', 4], ['iMisc', 4], ['iDens', 1]]);
  const matS = new THREE.ShaderMaterial({
    vertexShader: SPRITE_VERT, fragmentShader: SPRITE_FRAG, side: THREE.DoubleSide,
    uniforms: { ...uniforms, tAtlas: { value: atlas.texture }, tEmit: { value: atlas.emitTexture }, uRimOn: { value: 1 } },
  });
  const sprites = new THREE.Mesh(S.geo, matS); sprites.frustumCulled = false; sprites.renderOrder = 10; sprites.name = 'sprites';
  const depthMat = new THREE.ShaderMaterial({ vertexShader: SPRITE_DEPTH_VERT, fragmentShader: SPRITE_DEPTH_FRAG, side: THREE.DoubleSide, uniforms: { uSL: uniforms.uSL, tAtlas: { value: atlas.texture } } });

  const D = quadGeo(MAX_DECALS, [['iPos', 3], ['iRad', 4], ['iCol', 4], ['iH', 4]]);
  const matD = new THREE.ShaderMaterial({
    vertexShader: DECAL_VERT, fragmentShader: DECAL_FRAG, side: THREE.DoubleSide, transparent: true, depthWrite: false, depthTest: true,
    uniforms: { ...uniforms },
  });
  const decals = new THREE.Mesh(D.geo, matD); decals.frustumCulled = false; decals.renderOrder = 5; decals.name = 'decals';
  scene.add(decals, sprites);

  let ns = 0, nd = 0;
  const sd = S.data, dd = D.data;
  return {
    sprites, decals, matS,
    /** shadow caster (shadow.addCaster) */
    caster: { mesh: sprites, mat: depthMat },
    begin() { ns = 0; nd = 0; },
    /** Push one sprite. f = atlas frame. Returns false when full. */
    sprite(x, y, z, f, o) {
      if (ns >= MAX_SPRITES) return false;
      const i = ns++ * STRIDE;
      sd[i] = x; sd[i + 1] = z; sd[i + 2] = -y;                       // three coords
      sd[i + 3] = f.u0; sd[i + 4] = f.v0; sd[i + 5] = f.u1; sd[i + 6] = f.v1;
      sd[i + 7] = f.w; sd[i + 8] = f.h; sd[i + 9] = f.ax; sd[i + 10] = f.ay;
      if (o) {
        const t = o.tint;
        sd[i + 11] = t ? t[0] : 1; sd[i + 12] = t ? t[1] : 1; sd[i + 13] = t ? t[2] : 1; sd[i + 14] = o.flash || 0;
        const ol = o.outline;
        sd[i + 15] = ol ? ol[0] : 0; sd[i + 16] = ol ? ol[1] : 0; sd[i + 17] = ol ? ol[2] : 0; sd[i + 18] = ol ? (ol[3] == null ? 1 : ol[3]) : 0;
        sd[i + 19] = o.alpha == null ? 1 : o.alpha; sd[i + 20] = o.emit == null ? 1 : o.emit; sd[i + 21] = o.rim == null ? 1 : o.rim; sd[i + 22] = o.scale || 1;
      } else {
        sd[i + 11] = 1; sd[i + 12] = 1; sd[i + 13] = 1; sd[i + 14] = 0; sd[i + 15] = 0; sd[i + 16] = 0; sd[i + 17] = 0; sd[i + 18] = 0;
        sd[i + 19] = 1; sd[i + 20] = 1; sd[i + 21] = 1; sd[i + 22] = 1;
      }
      sd[i + 23] = f.dens || 1;
      return true;
    },
    /** Ground decal: kind 0 blob shadow, 1 ring (dashed if dash). h = 4 corner heights nw,ne,sw,se. */
    decal(x, y, radius, kind, r, g, b, a, h, dash, aspect) {
      if (nd >= MAX_DECALS) return false;
      const i = nd++ * 15;
      dd[i] = x; dd[i + 1] = 0; dd[i + 2] = -y;
      dd[i + 3] = radius; dd[i + 4] = kind; dd[i + 5] = dash ? 1 : 0; dd[i + 6] = aspect || 1;
      dd[i + 7] = r; dd[i + 8] = g; dd[i + 9] = b; dd[i + 10] = a;
      dd[i + 11] = h[0]; dd[i + 12] = h[1]; dd[i + 13] = h[2]; dd[i + 14] = h[3];
      return true;
    },
    end() { S.geo.instanceCount = ns; S.buf.needsUpdate = true; D.geo.instanceCount = nd; D.buf.needsUpdate = true; },
    get count() { return ns; }, get decalCount() { return nd; },
    setRim(on) { matS.uniforms.uRimOn.value = on ? 1 : 0; },
    dispose() { S.geo.dispose(); D.geo.dispose(); matS.dispose(); matD.dispose(); depthMat.dispose(); },
  };
}
