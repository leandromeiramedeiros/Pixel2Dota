// 3D trees: low-poly flat-shaded variants (2 pines, 2 broadleaf, 1 stump), ONE instanced draw per variant, no outline pass (rim light on the
// canopy instead). Lit / fogged / Bayer-quantised like the terrain and buildings; renders into the low-res target. Gentle vertex wind sway.
// The caller (actors.js) fills the instance buffers each frame for the trees in visible 512u cells only.
import * as THREE from 'three';
import { COMMON_GLSL } from './shaderlib.js';
import { createKit, instancedGeo, flushInstances, silhouetteFrame, DEPTH_GLSL } from './mesh3d.js';

const VSCALE = 1.15;      // vertical exaggeration (see buildings3d.js)
const WD = { c: 0x6a4b30, d: 0x2d2027 };
const g = (c, d, sw, o = {}) => ({ c, d, sw, ...o });

function pineA(k) {
  k.cyl(9, 13, 56, 5, { ...WD, y: -4 });
  k.cone(96, 150, 6, g(0x27654a, 0x4a2d45, 0.2, { y: 30, ry: 0.3 }));
  k.cone(76, 132, 6, g(0x2f7650, 0x58334e, 0.4, { y: 108, ry: 0.9 }));
  k.cone(54, 112, 6, g(0x3a8a5c, 0x663c58, 0.7, { y: 184, ry: 0.1 }));
  k.cone(32, 92, 6, g(0x4b9f6a, 0x7a4b69, 1, { y: 250, ry: 0.6 }));
}
function pineB(k) {
  k.cyl(10, 14, 48, 5, { ...WD, y: -4 });
  k.cone(106, 128, 6, g(0x24604f, 0x45283f, 0.2, { y: 24, ry: 0.5 }));
  k.cone(80, 118, 6, g(0x2c7358, 0x543049, 0.5, { y: 98, ry: 0.1 }));
  k.cone(52, 106, 6, g(0x388662, 0x633a55, 0.9, { y: 168, ry: 0.8 }));
}
function broadA(k) {
  k.cyl(11, 16, 112, 5, { ...WD, y: -4 });
  k.ico(68, g(0x4b9a55, 0x68405c, 0.7, { y: 160, sy: 0.9 }));
  k.ico(47, g(0x3f8848, 0x583650, 0.6, { x: -48, y: 138, z: 18 }));
  k.ico(45, g(0x5cb062, 0x7c5070, 1, { x: 46, y: 150, z: -20 }));
}
function broadB(k) {
  k.cyl(9, 14, 140, 5, { ...WD, y: -4 });
  k.ico(64, g(0x70ac4c, 0x62405a, 0.7, { y: 190, sy: 0.9 }));
  k.ico(43, g(0x5c9a44, 0x7a4c6c, 0.9, { x: 38, y: 158, z: 24 }));
  k.ico(40, g(0x85bf58, 0x8e5e7e, 1, { x: -34, y: 220, z: -14 }));
}
function stump(k) {
  k.cyl(20, 26, 26, 6, { ...WD });
  k.cyl(19, 19, 3, 6, { c: 0xb09468, d: 0x6b5160, y: 26 });
}
const VARIANTS = [pineA, pineB, broadA, broadB, stump];
export const STUMP = 4;

const VERT = /* glsl */ `
${COMMON_GLSL.split('float bayer4')[0]}
attribute vec3 aCol, aCol2;
attribute float aSw;
attribute vec3 iPos;
attribute vec4 iXf;
uniform float uPull;
varying vec3 vW, vN, vFoot, vCol;
varying float vLY, vPh, vSw;
${DEPTH_GLSL}
void main(){
  vec3 p = position;
  float ph = iXf.z;
  float sw = aSw * aSw;
  p.x += sw * 7. * sin(uTime * 1.5 + ph + position.y * .012);
  p.z += sw * 4. * sin(uTime * 1.15 + ph * 1.7);
  float c = cos(iXf.x), s = sin(iXf.x);
  vec3 w = iPos + vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c) * iXf.y;
  vW = w; vN = vec3(normal.x * c + normal.z * s, normal.y, -normal.x * s + normal.z * c); vFoot = iPos;
  vLY = position.y; vPh = ph; vSw = aSw;
  vCol = mix(aCol, aCol2, iXf.w);
  vec4 cr = projectionMatrix * viewMatrix * vec4(w, 1.);
  gl_Position = propDepth(cr, iPos, uPull * iXf.y);
}`;

const FRAG = /* glsl */ `
precision highp float;
${COMMON_GLSL}
uniform float uRimOn;
varying vec3 vW, vN, vFoot, vCol;
varying float vLY, vPh, vSw;
void main(){
  vec3 n = normalize(vN);
  bool top = abs(n.y) > .6;
  vec2 dp = top ? floor(vW.xz / 6.) : vec2(floor((vW.x + vW.z) / 6.), floor(vW.y / 6.));
  vec3 alb = vCol;
  float hv = fract(sin(vPh * 91.7) * 4375.5);
  alb *= .86 + .28 * hv;                                              // per-tree tint
  float hs = fract(sin(dot(floor(dp / 2.), vec2(12.9898, 78.233))) * 43758.5453);
  alb *= .94 + .12 * hs;                                              // dither-scale speckle (leaf texture)
  alb *= mix(.7, 1., smoothstep(0., 130., vLY));                     // dark under the canopy
  vec3 pl = pointLights(vW + n * 8., n, .5);
  vec3 L = quantL(uAmb + uKeyCol * max(dot(n, uKeyDir), 0.) + pl, dp);
  vec3 col = alb * L;
  vec3 v = normalize(uCamPos - vW);
  float fr = pow(1. - max(dot(n, v), 0.), 3.);
  float kf = smoothstep(-.1, .6, dot(n, uKeyDir));
  col += uRimOn * step(.05, vSw) * (uRimKey * fr * (.3 + kf) + pl * fr * .5);
  gl_FragColor = vec4(col * fogBright(vFoot, dp), 1.);
}`;

const IFLOATS = [['iPos', 3], ['iXf', 4]];

export function createTrees3d({ scene, uniforms, max = 2400 }) {
  const rimU = { value: 1 };
  const group = new THREE.Group(); group.name = 'trees3d'; scene.add(group);
  const vars = [];
  const stats = { draws: 0, tris: 0, instances: 0 };
  for (let v = 0; v < VARIANTS.length; v++) {
    const kit = createKit(VSCALE); VARIANTS[v](kit);
    const merged = kit.build();
    const inst = instancedGeo(merged, max, IFLOATS);
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { ...uniforms, uPull: { value: v === STUMP ? 8 : 30 }, uRimOn: rimU }, side: THREE.FrontSide });
    const mesh = new THREE.Mesh(inst.geo, mat); mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.name = 'tree3d_' + v; mesh.renderOrder = 1;
    group.add(mesh);
    vars.push({ inst, mesh, n: 0, frame: silhouetteFrame(merged, { grow: 1 }), tris: inst.tris });
  }
  return {
    group, stats, variants: vars.length,
    begin() { for (const t of vars) t.n = 0; },
    /** v: 0..3 tree variant, 4 stump; side 0 Radiant / 1 Dire; scale includes the model scale */
    add(v, x, y, z, side, scale, yaw, phase) {
      const t = vars[v]; if (!t || t.n >= t.inst.max) return false;
      const d = t.inst.data, i = t.n++ * t.inst.stride;
      d[i] = x; d[i + 1] = z; d[i + 2] = -y; d[i + 3] = yaw; d[i + 4] = scale; d[i + 5] = phase; d[i + 6] = side ? 1 : 0;
      return true;
    },
    end() {
      let tris = 0, draws = 0, inst = 0;
      for (const t of vars) { flushInstances(t.inst, t.n); t.mesh.visible = t.n > 0; if (t.n) { tris += t.n * t.tris; draws++; inst += t.n; } }
      stats.tris = tris; stats.draws = draws; stats.instances = inst;
    },
    frame(v) { return vars[v] && vars[v].frame; },
    setRim(on) { rimU.value = on ? 1 : 0; },
    dispose() { for (const t of vars) { t.inst.geo.dispose(); t.mesh.material.dispose(); } scene.remove(group); },
  };
}
