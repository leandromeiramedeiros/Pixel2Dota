// Terrain: chunked 3D heightfield (tile top quads from the shared corner heights + cliff wall skirts), pixel tile atlas,
// Bayer-quantised lighting, fog of war, animated water. Chunks are built lazily when they enter the frustum.
import * as THREE from 'three';
import { getMap, TT } from '../../../shared/map.js';
import { CHUNK, buildChunk, tileName } from './terrainGeo.js';
import { buildTerrainAtlas } from './tilesheet.js';
import { COMMON_GLSL } from './shaderlib.js';

const VERT = /* glsl */ `
attribute vec4 cell;
varying vec2 vUv;
varying vec4 vCell;
varying vec3 vWorld;
void main(){
  vUv = uv; vCell = cell; vWorld = position;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.);
}`;

const FRAG = /* glsl */ `
precision highp float;
${COMMON_GLSL}
uniform sampler2D uTiles;
uniform vec2 uAtlas;
varying vec2 vUv;
varying vec4 vCell;
varying vec3 vWorld;
void main(){
  float kind = vCell.w;
  float face = floor(kind / 8. + .001);
  float type = kind - face * 8.;
  vec2 px;
  vec3 n;
  vec2 dp;
  if (face < .5) {
    px = floor(clamp(vUv, 0., .9999) * 8.);
    if (type > 4.5 && type < 5.5) px.x += 8. * mod(floor(uTime * 6.), 4.);   // water: 4 frames side by side
    n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (n.y < 0.) n = -n;
    dp = floor(vWorld.xz / 6.);
  } else {
    float vv = max(vUv.y - 1e-4, 0.);
    px = vec2(floor(clamp(vUv.x, 0., .9999) * 8.), floor(fract(vv) * 22.));
    n = face < 1.5 ? vec3(0., 0., -1.) : face < 2.5 ? vec3(1., 0., 0.) : face < 3.5 ? vec3(0., 0., 1.) : vec3(-1., 0., 0.);
    dp = vec2(floor((vWorld.x + vWorld.z) / 6.), floor(vWorld.y / 6.));
  }
  vec4 t = texture2D(uTiles, (vCell.xy + px + .5) / uAtlas);
  vec3 alb = t.rgb;
  float em = t.a * 4.;
  vec3 L = uAmb + uKeyCol * max(dot(n, uKeyDir), 0.) + pointLights(vWorld + n * 6., n, .25);
  L = quantL(L, dp);
  float fg = fogBright(vWorld, dp);
  vec3 col = (alb * L + alb * em) * fg;
  gl_FragColor = vec4(col, 1.);
}`;

export function createTerrain({ scene, uniforms, tiles }) {
  const map = getMap();
  const atlas = buildTerrainAtlas(tiles);
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
    uniforms: { ...uniforms, uTiles: { value: atlas.texture }, uAtlas: { value: new THREE.Vector2(atlas.width, atlas.height) } },
  });
  const group = new THREE.Group(); group.name = 'terrain'; scene.add(group);
  const NC = Math.ceil(map.w / CHUNK), NR = Math.ceil(map.h / CHUNK);
  const chunks = new Array(NC * NR).fill(null);   // null = unbuilt, false = empty, Mesh
  const boxes = new Array(NC * NR);
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), box = new THREE.Box3();
  const stats = { built: 0, empty: 0, tris: 0, drawn: 0 };

  // approximate chunk bounds before building (heights 0..~600, generous)
  for (let cy = 0; cy < NR; cy++) for (let cx = 0; cx < NC; cx++) {
    const x0 = map.x0 + cx * CHUNK * map.tile, x1 = Math.min(x0 + CHUNK * map.tile, map.x0 + map.w * map.tile);
    const zN = -(map.y1 - cy * CHUNK * map.tile), zS = Math.min(zN + CHUNK * map.tile, -(map.y1 - map.h * map.tile));
    boxes[cy * NC + cx] = new THREE.Box3(new THREE.Vector3(x0, -10, zN), new THREE.Vector3(x1, 560, zS));
  }

  function build(ci) {
    const cx = ci % NC, cy = (ci / NC) | 0;
    const c = buildChunk(map, cx, cy, atlas.lookup);
    if (!c) { chunks[ci] = false; stats.empty++; return; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(c.pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(c.uv, 2));
    g.setAttribute('cell', new THREE.BufferAttribute(c.cell, 4));
    g.setIndex(new THREE.BufferAttribute(c.index, 1));
    const b = c.bbox;
    g.boundingBox = new THREE.Box3(new THREE.Vector3(b[0], b[1], b[2]), new THREE.Vector3(b[3], b[4], b[5]));
    g.boundingSphere = new THREE.Sphere(); g.boundingBox.getBoundingSphere(g.boundingSphere);
    const m = new THREE.Mesh(g, material);
    m.matrixAutoUpdate = false; m.updateMatrix(); m.matrixWorldAutoUpdate = false;
    boxes[ci] = g.boundingBox;
    group.add(m); chunks[ci] = m; stats.built++; stats.tris += c.index.length / 3;
  }

  /** Build chunks that intersect the camera frustum (max `budget` per call; the first call is unlimited). */
  function update(camera, budget = 6) {
    pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pv);
    let built = 0, drawn = 0;
    for (let i = 0; i < chunks.length; i++) {
      if (!frustum.intersectsBox(boxes[i])) continue;
      if (chunks[i] === null && built < budget) { build(i); built++; }
      if (chunks[i]) drawn++;
    }
    stats.drawn = drawn;
    return built;
  }
  function buildAll() { for (let i = 0; i < chunks.length; i++) if (chunks[i] === null) build(i); }

  let mini = null;
  /** 368x368 north-up terrain image (1 px per tile), cached. */
  function minimapCanvas() {
    if (mini) return mini;
    mini = document.createElement('canvas'); mini.width = map.w; mini.height = map.h;
    const ctx = mini.getContext('2d'), img = ctx.createImageData(map.w, map.h), d = img.data;
    for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) {
      const j = ty * map.w + tx, t = map.type[j];
      let c;
      if (t === TT.OUT) c = [8, 8, 14];
      else if (t === TT.WALL) c = atlas.swatch(tileName(map, tx, ty)).map((v) => v * 0.7);
      else c = atlas.swatch(tileName(map, tx, ty));
      const e = 0.82 + map.elev[j] * 0.14;
      const o = j * 4; d[o] = Math.min(255, c[0] * e); d[o + 1] = Math.min(255, c[1] * e); d[o + 2] = Math.min(255, c[2] * e); d[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return mini;
  }

  return { group, material, atlas, update, buildAll, minimapCanvas, stats, voidColor: atlas.voidColor, dispose() { material.dispose(); } };
}
