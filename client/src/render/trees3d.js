// 3D trees: the voxel models of shared/vox/world/trees.js (chibi reads of the Dota trees; Radiant leafy, Dire dead), greedy-meshed at world density
// (8.4 u / voxel), two LODs each (LOD1 = 2x2x2 downsample), ONE instanced draw per model x LOD, no outline pass (rim light instead). Lit / fogged /
// Bayer-quantised like the terrain and buildings; renders into the low-res target. Vertex wind sway + spell gusts (wind.js: push and pull).
// Shadow casters are separate coarse meshes holding every drawn tree (4x downsample for canopies, 2x for bare Dire trees: the sun shadow is a blob
// at any zoom, and this keeps the shadow pass a fraction of the main one).
// A cut tree dissolves voxel by voxel (iDis 0..1, top first) over its stump. The caller (actors.js) fills the instance buffers each frame.
import * as THREE from 'three';
import { COMMON_GLSL } from './shaderlib.js';
import { SHADOW_LAYER } from './shadow.js';
import { WIND_GLSL } from './wind.js';
import { instancedGeo, flushInstances, silhouetteFrame, DEPTH_GLSL } from './mesh3d.js';
import { greedyVox, downsampleVox } from './voxmesh.js';
import { TREES, TREE_KEYS, STUMPS } from '../../../shared/vox/world/trees.js';

export const UNIT = 8.4;                                       // world units per voxel (docs/VOXEL.md world density)
export const TREE_INDEX = Object.fromEntries(TREE_KEYS.map((k, i) => [k, i]));
export const STUMP_OF = STUMPS.map((k) => TREE_INDEX[k]);      // [Radiant stump, Dire stump] model index

/** Pure: geometry arrays of one model at one LOD (0 full, 1 = 2x, 2 = 4x downsample) -> { pos, nrm, col, ext (1 = leaf), sw (sway weight), quads, top (model units) }. */
export function treeGeometry(key, lod = 0) {
  const T = TREES[key], v0 = T.build(), k = 1 << lod;
  const v = lod ? downsampleVox(v0, k, lod > 1 ? 20 : 3) : v0;
  const g = greedyVox(v, { cx: T.META.cx / k, cy: T.META.cy / k, unit: UNIT * k, colorOf: (m) => hex3(m.ramp[1]), extraOf: (m) => (m.leaf ? 1 : 0) });
  let top = 0; for (let i = 1; i < g.pos.length; i += 3) top = Math.max(top, g.pos[i]);
  const stump = STUMPS.includes(key), z0 = 3 * UNIT, sw = new Float32Array(g.pos.length / 3);
  if (!stump) for (let i = 0; i < sw.length; i++) sw[i] = Math.min(1, Math.max(0, (g.pos[i * 3 + 1] - z0) / Math.max(1, top - z0)));   // height only: T-junctions stay shut
  return { ...g, sw, top };
}
function hex3(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }

const VERT = /* glsl */ `
${COMMON_GLSL.split('float bayer4')[0]}
attribute vec3 aCol;
attribute float aSw, aLf;
attribute vec3 iPos;
attribute vec4 iXf;
uniform float uPull;
varying vec3 vW, vN, vFoot, vCol, vLoc;
varying float vLY, vPh, vSw, vLf, vDis;
${DEPTH_GLSL}
${WIND_GLSL}
void main(){
  vec3 p = position;
  float ph = iXf.z;
  float sw = aSw * aSw;
  if (uWind > 0.) {                                             // base breeze (wind off at low quality: no sway maths at all)
    p.x += uWind * sw * 7. * sin(uTime * 1.5 + ph + position.y * .012);
    p.z += uWind * sw * 4. * sin(uTime * 1.15 + ph * 1.7);
  }
  float c = cos(iXf.x), s = sin(iXf.x);
  vec3 w = iPos + vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c) * iXf.y;
  if (uWind > 0. && uWN > 0 && sw > 0.) {                       // spell gusts (wind.js): world-space push / pull of the canopy, trunks stay planted
    vec2 g = gustAt(iPos.xz) * (.85 + .3 * sin(uTime * 5. + ph * 3.)) * (uWind * sw * 220. * iXf.y);   // up to ~220 u at the crown: a hard bend
    float h = max(position.y * iXf.y, 30.);
    w.xz += g; w.y -= min(dot(g, g) / (2. * h), h * .55);   // the crown swings on an arc (keeps its length) instead of shearing
  }
  vW = w; vN = vec3(normal.x * c + normal.z * s, normal.y, -normal.x * s + normal.z * c); vFoot = iPos;
  vLoc = position - normal * .01; vLY = position.y; vPh = ph; vSw = aSw; vLf = aLf; vDis = iXf.w;
  vCol = aCol;
  vec4 cr = projectionMatrix * viewMatrix * vec4(w, 1.);
#ifdef SHADOW
  gl_Position = cr;                                             // shadow caster: real depth from the light
#else
  gl_Position = propDepth(cr, iPos, uPull * iXf.y);
#endif
}`;

// voxel cell of the fragment (pre-wind model space, so the pattern rides the bend) + its dissolve key: hashed, top voxels first
const CELL_GLSL = /* glsl */ `
uniform float uCell, uTop;
uniform vec3 uOff;
vec3 cellOf(vec3 loc){ return floor(loc / uCell + uOff); }
float cellHash(vec3 q){ return fract(sin(dot(q, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float disKey(vec3 cell){ return cellHash(cell + 3.1) * .7 + .3 * (1. - clamp(cell.y * uCell / uTop, 0., 1.)); }`;

const FRAG = /* glsl */ `
precision highp float;
${COMMON_GLSL}
${CELL_GLSL}
uniform float uRimOn;
varying vec3 vW, vN, vFoot, vCol, vLoc;
varying float vLY, vPh, vSw, vLf, vDis;
void main(){
  vec3 cell = cellOf(vLoc);
  float dk = disKey(cell);
  if (vDis > 0. && dk < vDis) discard;
  vec3 n = normalize(vN);
  bool top = abs(n.y) > .6;
  vec2 dp = top ? floor(vW.xz / 6.) : vec2(floor((vW.x + vW.z) / 6.), floor(vW.y / 6.));
  vec3 alb = vCol;
  float hv = fract(sin(vPh * 91.7) * 4375.5);
  alb *= .9 + .2 * hv;                                                // per-tree tint
  float hc = cellHash(cell);
  alb *= mix(.95 + .1 * hc, .86 + .26 * hc, vLf);                    // per-voxel tint (needle / leaf clumps read as voxels)
  alb *= 1. + vLf * (n.y > .6 ? .26 : n.y < -.6 ? -.22 : 0.);        // foliage: sky-lit tops, dark undersides (tiered canopies)
  alb *= mix(.72, 1., smoothstep(0., 130., vLY));                    // dark under the canopy
  vec3 pl = pointLights(vW + n * 8., n, .5);
  float sh = shadowAt(vW, n, dp);
  vec3 L = quantL(shadowAmb(sh) + uKeyCol * (max(dot(n, uKeyDir), 0.) * sh) + pl, dp);
  vec3 col = alb * L;
  vec3 v = normalize(uCamPos - vW);
  float fr = pow(1. - max(dot(n, v), 0.), 3.);
  float kf = smoothstep(-.1, .6, dot(n, uKeyDir)) * mix(.35, 1., sh);
  col += uRimOn * (step(.05, vSw) * uRimKey * fr * (.3 + kf) + pl * fr * .9);   // spell / practical light rims trunks too
  if (vDis > 0.) col += vec3(1., .86, .6) * .5 * (1. - smoothstep(0., .07, dk - vDis));   // the dissolve edge glints
  gl_FragColor = vec4(fogGrade(col, vFoot, dp), 1.);
}`;

const DEPTH_FRAG_DIS = /* glsl */ `
precision highp float;
${CELL_GLSL}
varying vec3 vLoc;
varying float vDis;
void main(){
  if (vDis > 0. && disKey(cellOf(vLoc)) < vDis) discard;
  gl_FragColor = vec4(1.);
}`;

const IFLOATS = [['iPos', 3], ['iXf', 4]];   // iXf = (yaw, scale, phase, dissolve 0..1)

function bufferGeo(G) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(G.pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(G.nrm, 3));
  geo.setAttribute('aCol', new THREE.BufferAttribute(G.col, 3));
  geo.setAttribute('aLf', new THREE.BufferAttribute(G.ext, 1));
  geo.setAttribute('aSw', new THREE.BufferAttribute(G.sw, 1));
  return geo;
}

export function createTrees3d({ scene, uniforms, max = 2400 }) {
  const rimU = { value: 1 };
  const group = new THREE.Group(); group.name = 'trees3d'; scene.add(group);
  const vars = [];                 // per model: { lods: [{ inst, mesh, n, tris }, ...], shadow: { inst, mesh, n }, frame }
  const stats = { draws: 0, tris: 0, instances: 0, lod0: 0 };
  const mkMesh = (geo, uni, name, shadowOnly) => {
    const inst = instancedGeo(geo, max, IFLOATS);
    const depthMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: DEPTH_FRAG_DIS, uniforms: uni, side: THREE.DoubleSide, defines: { SHADOW: 1 } });
    const mat = shadowOnly ? depthMat : new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: uni, side: THREE.FrontSide });
    const mesh = new THREE.Mesh(inst.geo, mat); mesh.userData.depthMat = depthMat; mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.name = name; mesh.renderOrder = 1;
    if (shadowOnly) mesh.layers.set(SHADOW_LAYER);   // never drawn by the view camera
    group.add(mesh);
    return { inst, mesh, n: 0, tris: inst.tris };
  };
  TREE_KEYS.forEach((key, v) => {
    const stump = STUMPS.includes(key), lods = [], leafy = !stump && TREES[key].side === 0;
    const G = [treeGeometry(key, 0), treeGeometry(key, 1), treeGeometry(key, leafy ? 2 : 1)];   // [near, far, shadow]: canopies cast 4x blobs, bare Dire limbs keep 2x
    const geos = G.map(bufferGeo), cx = TREES[key].META.cx, cy = TREES[key].META.cy, fr = (a) => a - Math.floor(a);
    const ks = [1, 2, leafy ? 4 : 2];
    const uni = ks.map((k) => ({ ...uniforms, uPull: { value: stump ? 8 : 30 }, uRimOn: rimU, uCell: { value: UNIT * k }, uTop: { value: Math.max(UNIT, G[0].top) },
      uOff: { value: new THREE.Vector3(fr(cx / k), 0, fr(cy / k)) } }));   // downsample of an odd-centred grid: voxel walls sit on half cells
    for (let l = 0; l < 2; l++) lods.push(mkMesh(geos[l], uni[l], 'tree3d_' + key + '_' + l, false));
    const shadow = mkMesh(geos[2], uni[2], 'tree3d_' + key + '_shadow', true);
    vars.push({ key, lods, shadow, frame: silhouetteFrame(geos[0], { grow: 1 }) });
  });
  return {
    group, stats, variants: vars.length,
    begin() { for (const t of vars) { t.lods[0].n = t.lods[1].n = t.shadow.n = 0; } },
    /** v: model index (TREE_KEYS order); lod 0 near / 1 far; scale includes the model scale; dis 0 standing .. 1 gone (cut dissolve) */
    add(v, x, y, z, scale, yaw, phase, lod = 0, dis = 0) {
      const t = vars[v]; if (!t) return false;
      const L = t.lods[lod ? 1 : 0]; if (L.n >= L.inst.max) return false;
      for (const b of [L, t.shadow]) {
        if (b.n >= b.inst.max) continue;
        const d = b.inst.data, i = b.n++ * b.inst.stride;
        d[i] = x; d[i + 1] = z; d[i + 2] = -y; d[i + 3] = yaw; d[i + 4] = scale; d[i + 5] = phase; d[i + 6] = dis;
      }
      return true;
    },
    end() {
      let tris = 0, draws = 0, inst = 0, l0 = 0;
      for (const t of vars) {
        for (const b of [...t.lods, t.shadow]) { flushInstances(b.inst, b.n); b.mesh.visible = b.n > 0; }
        for (const b of t.lods) if (b.n) { tris += b.n * b.tris; draws++; inst += b.n; }
        l0 += t.lods[0].n;
      }
      stats.tris = tris; stats.draws = draws; stats.instances = inst; stats.lod0 = l0;
    },
    frame(v) { return vars[v] && vars[v].frame; },
    /** shadow casters: [{ mesh, mat }] (shadow.js): the coarse shadow-only meshes */
    casters() { return vars.map((t) => ({ mesh: t.shadow.mesh, mat: t.shadow.mesh.userData.depthMat })); },
    setRim(on) { rimU.value = on ? 1 : 0; },
    dispose() { for (const t of vars) for (const b of [...t.lods, t.shadow]) { b.inst.geo.dispose(); b.mesh.material.dispose(); } scene.remove(group); },
  };
}
