// FX quads: instanced atlas-frame quads that can ROTATE (projectiles, spinning stars) or lie flat on the ground (decals), pixel-art style.
// The renderer's sprite mesh can't rotate and particle stamps are square, so this is the small own mesh the fx module draws projectiles with.
//   billboard: foot-snapped to the RT pixel grid, integer RT px per art px (like sprites.js), rotated by the screen projection of a world dir
//   ground:    flat quad on the terrain, size in art px * 6 world units * scale
// Opaque + alpha-test (+ Bayer dither fade), HDR: colour = tex * tint * (bright + emit*4), so emissive pixels bloom.
import * as THREE from 'three';
import { COMMON_GLSL, UNIFORMS_GLSL } from '../shaderlib.js';

export const MAX_QUADS = 768;
const STRIDE = 23;

const VERT = /* glsl */ `
${UNIFORMS_GLSL}
attribute vec2 corner;
attribute vec3 iPos;
attribute vec4 iRect, iSize, iTint, iDir, iMisc;
varying vec2 vTx;
varying vec3 vWorld;
varying vec4 vRect, vSize, vTint, vMisc;
void main(){
  vec2 local = mix(vec2(-1.), iSize.xy + 1., corner);
  vTx = local; vRect = iRect; vSize = iSize; vTint = iTint; vMisc = iMisc;
  vec2 d = vec2(local.x - (iSize.z + .5), -(local.y - (iSize.w + .5)));
  float ang = iMisc.z;
  if (iMisc.y < .5) {
    vec3 d3 = iDir.xyz;
    if (dot(d3, d3) > 1e-4) {
      ang += atan(dot(d3, uCamUp), dot(d3, uCamRight));
      if (cos(ang) < 0.) d.y = -d.y;                       // keep art upright when flying left
    }
    float c = cos(ang), sn = sin(ang);
    vec2 r = vec2(c * d.x - sn * d.y, sn * d.x + c * d.y);
    vec3 toCam = normalize(uCamPos - iPos);
    vec4 fc = projectionMatrix * viewMatrix * vec4(iPos + toCam * 10., 1.);
    vec4 fp = projectionMatrix * viewMatrix * vec4(iPos, 1.);
    float s = uArtPx * iDir.w * mix(1., uRefW / fp.w, uPersp);
    s = mix(max(1., floor(s + .5)), s, uPersp);
    vec2 rtpx = floor((fp.xy / fp.w * .5 + .5) * uRT + .5);
    vec2 ndc = (rtpx + r * s) / uRT * 2. - 1.;
    vWorld = iPos;
    gl_Position = vec4(ndc * fp.w, fc.z / fc.w * fp.w, fp.w);
  } else {
    float c = cos(ang), sn = sin(ang);
    vec2 r = vec2(c * d.x - sn * d.y, sn * d.x + c * d.y) * 6. * iDir.w;
    vec3 w = vec3(iPos.x + r.x, iPos.y + 3., iPos.z - r.y);
    vWorld = w;
    gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.);
  }
}`;

const FRAG = /* glsl */ `
precision highp float;
${COMMON_GLSL}
uniform sampler2D tAtlas, tEmit;
varying vec2 vTx;
varying vec3 vWorld;
varying vec4 vRect, vSize, vTint, vMisc;
void main(){
  vec2 ip = floor(vTx);
  if (ip.x < 0. || ip.y < 0. || ip.x >= vSize.x || ip.y >= vSize.y) discard;
  vec2 uv = vec2(mix(vRect.x, vRect.z, (ip.x + .5) / vSize.x), mix(vRect.y, vRect.w, (ip.y + .5) / vSize.y));
  vec4 c = texture2D(tAtlas, uv);
  if (c.a < .5) discard;
  if (vTint.w < 1. && bayer4(gl_FragCoord.xy) > vTint.w) discard;
  float em = texture2D(tEmit, uv).a * 4.;
  vec3 col;
  if (vMisc.y < .5) {
    col = c.rgb * vTint.rgb * (vMisc.w + em * vMisc.x);
  } else {
    vec3 L = quantL(uAmb + uKeyCol * .5 + pointLights(vWorld + vec3(0., 6., 0.), vec3(0., 1., 0.), 1.), floor(vWorld.xz / 6.));
    col = c.rgb * vTint.rgb * (L * vMisc.w + em * vMisc.x);
  }
  col *= fogBright(vWorld, ip);
  gl_FragColor = vec4(col, 1.);
}`;

export function createQuads({ scene, uniforms, atlas }) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('corner', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const data = new Float32Array(MAX_QUADS * STRIDE);
  const buf = new THREE.InstancedInterleavedBuffer(data, STRIDE, 1); buf.setUsage(THREE.DynamicDrawUsage);
  [['iPos', 3], ['iRect', 4], ['iSize', 4], ['iTint', 4], ['iDir', 4], ['iMisc', 4]].reduce((off, [n, s]) => { geo.setAttribute(n, new THREE.InterleavedBufferAttribute(buf, s, off)); return off + s; }, 0);
  geo.instanceCount = 0;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide, depthWrite: false, depthTest: true,
    uniforms: { ...uniforms, tAtlas: { value: atlas.texture }, tEmit: { value: atlas.emitTexture } },
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 15; mesh.name = 'fxquads';
  scene.add(mesh);
  let n = 0;

  /** Push one quad. f = atlas frame. (dx,dy,dz) = world direction the frame's +x should point to (billboard), roll = extra screen/ground rotation.
   *  tint rgb may exceed 1 (HDR). a<1 dithers away. emit = emissive multiplier, bright = flat brightness (billboards) / light multiplier (ground). */
  // NOTE: emit is scaled by 0.3 (shader adds emitMask*4*emit), so callers use 0.5..3.
  function put(x, y, z, f, scale, r, g, b, a, emit, dx, dy, dz, roll, ground, bright) {
    if (!f || n >= MAX_QUADS) return false;
    const i = n++ * STRIDE;
    data[i] = x; data[i + 1] = z; data[i + 2] = -y;
    data[i + 3] = f.u0; data[i + 4] = f.v0; data[i + 5] = f.u1; data[i + 6] = f.v1;
    data[i + 7] = f.w; data[i + 8] = f.h; data[i + 9] = f.ax; data[i + 10] = f.ay;
    data[i + 11] = r; data[i + 12] = g; data[i + 13] = b; data[i + 14] = a;
    data[i + 15] = dx; data[i + 16] = dz; data[i + 17] = -dy; data[i + 18] = scale;
    data[i + 19] = emit * 0.3; data[i + 20] = ground ? 1 : 0; data[i + 21] = roll; data[i + 22] = bright;
    return true;
  }
  return {
    mesh, put,
    begin() { n = 0; },
    end() { geo.instanceCount = n; buf.needsUpdate = true; },
    get count() { return n; },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}
