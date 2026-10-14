// Terrain: chunked 3D heightfield (tile top quads from the shared corner heights + cliff wall skirts), pixel tile atlas,
// Bayer-quantised lighting, fog of war. The fragment shader reads a per-map tile-type texture and blends each art pixel toward its
// 3x3 neighbours (priority overlap + dithered noisy reach), draws live non-periodic water, shore foam / wet sand, cliff lip + AO, macro tint and detail scatter. Chunks are built lazily when they enter the frustum.
import * as THREE from 'three';
import { getMap, TT } from '../../../shared/map.js';
import { CHUNK, buildChunk, tileName, buildTileData } from './terrainGeo.js';
import { buildTerrainAtlas } from './tilesheet.js';
import { COMMON_GLSL } from './shaderlib.js';
import { DEPTH_FRAG } from './shadow.js';

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
uniform sampler2D uTiles, uMap;
uniform vec2 uAtlas, uMapSize;
uniform vec4 uMapRect;       // x0, y1, tile size, unused
uniform vec2 uBase[16];      // atlas cell origin of the canonical texture per kind (type * 2 + side), used when a neighbour bleeds in
varying vec2 vUv;
varying vec4 vCell;
varying vec3 vWorld;

float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash12(i), hash12(i + vec2(1., 0.)), f.x), mix(hash12(i + vec2(0., 1.)), hash12(i + vec2(1., 1.)), f.x), f.y);
}
// blend priority: water < road < grass < forest floor < rock top; void never blends
float prio(float t){ return t > 5.5 ? -1. : t > 4.5 ? 0. : t > 3.5 ? 1. : t < .5 ? 2. : t < 1.5 ? 3. : 4.; }

struct Tl { float type, side, ramp, stairs, elev, depth; };
Tl fetchTile(vec2 t){
  Tl r;
  if (t.x < 0. || t.y < 0. || t.x >= uMapSize.x || t.y >= uMapSize.y) { r.type = 6.; r.side = 0.; r.ramp = 0.; r.stairs = 0.; r.elev = 0.; r.depth = 0.; return r; }
  vec4 v = floor(texture2D(uMap, (t + .5) / uMapSize) * 255. + .5);
  r.type = mod(v.r, 8.); r.side = mod(floor(v.r / 8.), 2.); r.ramp = mod(floor(v.r / 16.), 2.); r.stairs = floor(v.r / 32.);
  r.elev = v.g; r.depth = v.b / 32.;
  return r;
}
const vec2 OFS[8] = vec2[8](vec2(0., -1.), vec2(1., 0.), vec2(0., 1.), vec2(-1., 0.), vec2(-1., -1.), vec2(1., -1.), vec2(1., 1.), vec2(-1., 1.));

void main(){
  float kind = vCell.w;
  float face = floor(kind / 8. + .001);
  float type = kind - face * 8.;
  vec2 px;
  vec3 n;
  vec2 dp;
  vec3 alb;
  float em = 0.;
  bool isWater = false;
  if (face < .5) {
    px = floor(clamp(vUv, 0., .9999) * 8.);
    n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (n.y < 0.) n = -n;
    dp = floor(vWorld.xz / 6.);
    vec4 own = texture2D(uTiles, (vCell.xy + px + .5) / uAtlas);
    alb = own.rgb; em = own.a * 4.;
    vec2 tile = floor((vWorld.xz - vec2(uMapRect.x, -uMapRect.y)) / uMapRect.z - vUv + .5);
    Tl me = fetchTile(tile);
    if (me.type < 5.5) {
      bool st = me.stairs > .5;                              // worn stair tile: keeps its own art, edges dither into the neighbouring ground
      vec2 lp = px + .5;                                     // art-pixel centre inside the tile, 0..8
      float myP = prio(me.type);
      float th = mix(hash12(dp), bayer4(dp), .5);            // dither threshold
      float nR = vnoise(dp * .21 + 11.7);
      float R = 1.3 + 3.1 * nR;                              // noisy blend reach in art px
      vec2 qd = vec2(lp.x < 4. ? -1. : 1., lp.y < 4. ? -1. : 1.);
      vec2 qw = abs(lp - 4.) / 8.;
      float dX = 0., dY = 0., dXY = 0.;
      float lip = 99., ao = 0., dLand = 99., dWater = 99., bestP = myP - .5, bestD = 99.;
      Tl best = me;
      Tl sb = me; float sbD = 99.; bool sHit = false;         // stairs: nearest dithered-in neighbour ground
      for (int i = 0; i < 8; i++) {
        vec2 o = OFS[i];
        Tl nb = fetchTile(tile + o);
        if (o.y == 0. && o.x == qd.x) dX = nb.depth;
        if (o.x == 0. && o.y == qd.y) dY = nb.depth;
        if (o == qd) dXY = nb.depth;
        float np = prio(nb.type);
        if (st) {
          if (i < 4 && nb.stairs < .5 && (nb.type < 1.5 || (nb.type > 3.5 && nb.type < 4.5))) {
            float d = o.x != 0. ? (o.x > 0. ? 8. - lp.x : lp.x) : (o.y > 0. ? 8. - lp.y : lp.y);
            float w = clamp(1.25 * (1. - d / (1. + 2.4 * nR)), 0., 1.);
            if (th < w && d < sbD) { sb = nb; sbD = d; sHit = true; }
          }
          continue;
        }
        if (np < -.5 || nb.ramp > .5 || me.ramp > .5) continue;
        vec2 c = vec2(o.x > .5 ? 8. : (o.x < -.5 ? 0. : lp.x), o.y > .5 ? 8. : (o.y < -.5 ? 0. : lp.y));
        float d = length(lp - c);                            // orthogonal: distance to that edge, diagonal: to that corner
        float de = nb.elev - me.elev;
        if (de < -.5) { if (i < 4) lip = min(lip, d); continue; }
        if (de > .5) { ao = max(ao, clamp(1. - d / 3.6, 0., 1.) * (i < 4 ? 1. : .75)); continue; }
        if (nb.type == me.type && nb.side == me.side) continue;
        if (me.type > 4.5) { if (nb.type < 4.5) dLand = min(dLand, d); } else if (nb.type > 4.5) dWater = min(dWater, d);
        float reach = np > myP ? R : (np == myP ? R * .5 : 0.);
        float w = clamp(1.3 * (1. - d / max(reach, .01)), 0., 1.);
        if (reach > 0. && th < w && (np > bestP || (np == bestP && d < bestD))) { bestP = np; best = nb; bestD = d; }
      }
      if (sHit) { best = sb; bestD = sbD; }
      bool swapped = sHit || (!st && bestP > myP - .25);
      float ft = swapped ? best.type : me.type;
      float fs = swapped ? best.side : me.side;
      bool meWater = me.type > 4.5;
      isWater = ft > 4.5;
      float h1 = hash12(dp + 3.1), h2 = hash12(dp * 1.37 + 9.7);
      if (isWater) {
        // depth: bilinear of tile depths (land = 0), jittered then quantised to 4 teal steps
        float sd = mix(mix(me.depth, dX, qw.x), mix(dY, dXY, qw.x), qw.y);
        float lv = floor(clamp(sd / 6.5, 0., 1.) * 3. + th * .999 + (nR - .5) * .5);
        lv = clamp(lv, 0., 3.);
        vec3 w0 = vec3(.165, .392, .408), w1 = vec3(.106, .29, .337), w2 = vec3(.067, .2, .255), w3 = vec3(.043, .141, .2);
        alb = lv < .5 ? w0 : lv < 1.5 ? w1 : lv < 2.5 ? w2 : w3;
        // ripples: 2-px dashes on per-row hashed lanes that drift and re-roll slowly, plus rare dim glints; none of it tile-periodic
        float row = dp.y, dir = hash12(vec2(row, 1.)) < .5 ? -1. : 1.;
        float gx = dp.x + dir * floor(uTime * 1.6) + floor(hash12(vec2(row, 5.)) * 8.);
        float cx = floor(gx / 3.);
        float hv = hash12(vec2(cx, row + floor(uTime * .45) * 13.));
        if (hv < .11 && gx - cx * 3. < 2.) alb = lv > .5 ? (lv < 1.5 ? w0 : w1) : vec3(.26, .52, .52);
        else if (hv > .955 && gx - cx * 3. < 2.) alb *= .8;
        float gl = hash12(dp * 1.91 + floor(uTime * 2.2) * 7.3);
        if (gl > .9975) { alb = vec3(.62, .86, .84); em = .35; }
        // foam rim next to land (the land pixels bleeding into this tile are drawn as wet sand below)
        if (dLand < 90.) {
          float fp = clamp(1.2 - dLand / (R * .6 + .5), 0., 1.);
          if (h1 < fp * .6 && hash12(dp * 1.7 + floor(uTime * 2.5)) > .2) { alb = vec3(.56, .74, .72); em = 0.; isWater = false; }
        }
      } else if (swapped && meWater) {
        // beach: sand bleeding into the water tile, wetter (darker, cooler) toward the water
        bool dire = fs > .5;
        vec3 s0 = dire ? vec3(.355, .29, .26) : vec3(.48, .44, .345), s1 = dire ? vec3(.29, .235, .21) : vec3(.4, .37, .29), s2 = dire ? vec3(.43, .36, .31) : vec3(.57, .52, .41);
        alb = h1 < .22 ? s1 : h1 > .9 ? s2 : s0;
        alb *= mix(1., .68, floor(clamp(bestD / R, 0., 1.) * 2. + h2 * .9) * .5) * vec3(1., 1.02, 1.02);
        em = 0.;
      } else {
        vec2 cell = swapped ? uBase[int(ft * 2. + fs + .5)] : vCell.xy;
        vec4 tx = texture2D(uTiles, (cell + px + .5) / uAtlas);
        alb = tx.rgb; em = swapped ? 0. : tx.a * 4.;
        // macro colour variation: two octaves of low-frequency noise, quantised to 5 dithered steps, cool <-> warm
        float mn = vnoise(dp * .009 + 3.) * .6 + vnoise(dp * .034 + 9.) * .4;
        float mq = floor(mn * 5. + th) / 5.;
        float k = ft < 1.5 ? 1. : ft < 2.5 ? .55 : .8;
        if (st && !swapped) k = .7;
        alb *= mix(vec3(1.), mix(vec3(.84, .93, .98), vec3(1.07, 1.04, .92), clamp(mq * 1.25, 0., 1.)), k);
        // detail scatter at art-pixel resolution (hash noise), by final ground kind
        float dens = .6 + .8 * mn;
        if (st && !swapped) {
          // worn steps: sparse lit chips and dark pits, a few pixels of ground wear dirt (no grass tufts / flowers on stone)
          if (h1 < .05) alb *= 1.14; else if (h1 > .93) alb *= .8;
          else if (h2 < .05) alb = mix(alb, ft < 1.5 ? vec3(.3, .26, .2) : vec3(.28, .24, .19), .55);
        } else if (ft < .5) {
          if (fs < .5) {
            float tf = hash12(dp), tb = hash12(dp - vec2(0., 1.));
            if (tf < .04 * dens) alb = alb * 1.34 + vec3(.01, .03, .0);            // blade tip
            else if (tb < .04 * dens) alb *= .72;                                  // its dark root pixel below
            float fpatch = vnoise(dp * .05 + 31.);
            float fl = hash12(dp * 1.31 + 5.);
            if (fl < (fpatch > .72 ? .014 : .0004)) { float c = hash12(dp + 77.); alb = c < .3 ? vec3(.8, .78, .66) : c < .55 ? vec3(.76, .66, .36) : c < .8 ? vec3(.69, .41, .55) : vec3(.42, .55, .74); }
          } else {
            float tf = hash12(dp);
            if (tf < .035 * dens) alb = alb * 1.3 + vec3(.03, .02, .0);
            else if (tf > .985) alb = vec3(.46, .45, .43);                         // ash fleck
          }
          if (hash12(dp * .77 + 2.) < .006) alb = mix(alb, vec3(.55, .55, .52), .7);                      // pebble highlight
          else if (hash12((dp - vec2(1., 0.)) * .77 + 2.) < .006) alb *= .62;                              // pebble shadow
        } else if (ft > 3.5 && ft < 4.5) {
          if (hash12(dp * .83 + 4.) < .012) alb = mix(alb, vec3(.72, .67, .56), .5);
          else if (hash12((dp - vec2(1., 0.)) * .83 + 4.) < .012) alb *= .7;
          // trampled edge: dirt next to grass darkens a little so the lane reads as worn ground with soft edges
          if (!swapped && h2 < .5) alb *= .9;
        } else if (ft > .5 && ft < 1.5) {
          if (h1 < .06 * dens) alb *= 1.28; else if (h1 > .95) alb *= .78;
        }
        // wet ground right at the waterline
        if (dWater < 90.) { float wp = clamp(1.5 - dWater / 1.7, 0., 1.); if (h2 < wp) alb *= vec3(.7, .8, .82); }
      }
      // cliff top lip (1 art px) and ambient occlusion at the cliff base (dithered, 3 steps)
      if (lip < 1. && th < .85) alb = alb * 1.55 + vec3(.035, .04, .04);
      float aoq = floor(ao * 3. + th) / 3.;
      alb *= 1. - .55 * aoq;
    }
  } else {
    float vv = max(vUv.y - 1e-4, 0.);
    px = vec2(floor(clamp(vUv.x, 0., .9999) * 8.), floor(fract(vv) * 22.));
    n = face < 1.5 ? vec3(0., 0., -1.) : face < 2.5 ? vec3(1., 0., 0.) : face < 3.5 ? vec3(0., 0., 1.) : vec3(-1., 0., 0.);
    dp = vec2(floor((vWorld.x + vWorld.z) / 6.), floor(vWorld.y / 6.));
    vec4 t = texture2D(uTiles, (vCell.xy + px + .5) / uAtlas);
    alb = t.rgb; em = t.a * 4.;
    // darken toward the strip base, faint rain streaks, slow cool/warm drift along the face
    float sv = fract(vv);
    alb *= mix(1., .58, smoothstep(.3, 1., sv));
    alb *= mix(1., .85, step(.88, hash12(vec2(dp.x, 3.))) * smoothstep(.1, .6, sv));
    alb *= mix(vec3(.9, .97, 1.), vec3(1.05, 1.02, .95), vnoise(vec2(dp.x * .05, dp.y * .12) + 5.));
  }
  float sh = shadowAt(vWorld, n, dp);
  vec3 L = shadowAmb(sh) + uKeyCol * (max(dot(n, uKeyDir), 0.) * sh) + pointLights(vWorld + n * 6., n, .25);
  L = quantL(L, dp);
  float fg = fogBright(vWorld, dp);
  vec3 col = fogGrade(alb * L + alb * em, vWorld, dp);
  float wmask = (face < .5 && isWater) ? 1. - fg : 1.;   // water mask (look agent): scene RT alpha, 0 = visible water (post SSR), 1 = anything else, rises with fog darkening
  gl_FragColor = vec4(col, wmask);
}`;

export function createTerrain({ scene, uniforms, tiles }) {
  const map = getMap();
  const atlas = buildTerrainAtlas(tiles);
  const mapTex = new THREE.DataTexture(buildTileData(map), map.w, map.h, THREE.RGBAFormat, THREE.UnsignedByteType);
  mapTex.magFilter = mapTex.minFilter = THREE.NearestFilter; mapTex.generateMipmaps = false; mapTex.needsUpdate = true;
  // canonical atlas cell per ground kind (type*2 + side) for neighbour bleed-in
  const KIND_NAME = ['grass_r_0', 'grass_d_0', 'forest_r', 'forest_d', 'rock_top_0', 'rock_top_d_0', 'void', 'void', 'road_0', 'road_0', 'water', 'water', 'void', 'void', 'void', 'void'];
  const base = KIND_NAME.map((nm) => { const c = atlas.lookup(nm) || atlas.lookup('void') || { x: 0, y: 0 }; return new THREE.Vector2(c.x, c.y); });
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
    uniforms: {
      ...uniforms, uTiles: { value: atlas.texture }, uAtlas: { value: new THREE.Vector2(atlas.width, atlas.height) },
      uMap: { value: mapTex }, uMapSize: { value: new THREE.Vector2(map.w, map.h) }, uMapRect: { value: new THREE.Vector4(map.x0, map.y1, map.tile, 0) }, uBase: { value: base },
    },
  });
  const depthMaterial = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: DEPTH_FRAG, side: THREE.DoubleSide });   // shadow caster variant
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

  return { group, material, depthMaterial, atlas, update, buildAll, minimapCanvas, stats, voidColor: atlas.voidColor, dispose() { material.dispose(); mapTex.dispose(); } };
}
