// Team vision (Dota 2 rules). Tile-resolution grid: radial ray casting from every friendly unit and temporary source.
//   Rules: three levels (river < lane < high ground); a higher level is seen only from equal / higher ground (a viewer on higher ground sees down over cliffs); live trees block ground vision
//   (stumps do not; a viewer well above the tree ignores it); flying sources (spell vision) ignore terrain and trees; map border always blocks.
//   Three looks: VISIBLE (full colour) / FOGGED (explored: darker, desaturated, cool; terrain is never hidden, like Dota) / NEVER SEEN
//   (FOGGED darkened a little more by FOG_UNSEEN_DARKEN; set 0 for pure Dota where unexplored == fogged).
//   Texture RG8 (linear): R = visible (eased + blurred = soft animated edge), G = explored; shaderlib fogBright / fogGrade shade with it.
//   Enemy units outside the visible set are hidden; enemy structures stay drawn at their last-seen state (ghost(u); pristine until first seen).
import * as THREE from 'three';
import { getMap, TT, treeTiles } from '../../../shared/map.js';
import { DATA } from '../../../shared/data.js';
import { ST } from '../../../shared/protocol.js';
import { COMMON_GLSL } from './shaderlib.js';

export const VISION_FALLBACK = { day: 1800, night: 800 };
export const FOG_LEVEL = 0.5;             // brightness multiplier of fogged (explored) ground; the visible edge blends up to 1
export const FOG_UNSEEN_DARKEN = 0.18;    // 3rd stage: never-seen ground is this much darker than fogged (0 = pure Dota: two states only)
export const FOG_DESAT = 0.6;             // how much colour fogged ground loses (0..1)
export const MIST_CLEAR = 1.6, MIST_RETURN = 0.55;   // fog mist ease rates (1/s): disperses ~1 s after vision arrives, creeps back over ~3 s
/** [fogged brightness, never-seen brightness, desaturation] -> shader uniform uFogLv */
export function fogLevels() { return [FOG_LEVEL, FOG_LEVEL * (1 - FOG_UNSEEN_DARKEN), FOG_DESAT]; }
const GHOST_KINDS = new Set(['tower', 'rax', 'ancient', 'fountain', 'building']);
const HIGH = 70;          // a tile this much higher than the viewer blocks sight
const TREE_BELOW = 40;    // a tree whose ground is this much below the viewer no longer blocks (Dota: you see over trees from the high ground)

/** Vision radius of a unit view (world units). Heroes use visionDay/visionNight from DATA, other units their baked `vision` (day).
 *  Night mirrors the server (sim/units.js): creeps keep their (750) value, buildings 60% (min 600), neutrals capped at 800. */
export function visionRadius(u, night) {
  if (u.kind === 'ward') { const wk = u.key || ''; if (/observer/.test(wk)) return 1600; if (/sentry/.test(wk)) return 150; }   // placed wards (server wards.js): observer 1600, sentry sees only its feet
  const h = DATA.heroes && DATA.heroes[u.key];
  if (h) return (night ? h.visionNight : h.visionDay) || (night ? VISION_FALLBACK.night : VISION_FALLBACK.day);
  const k = u.key || '';
  const ud = DATA.units || {};
  let s = null;
  for (const n in ud) if (ud[n].key === k) { s = ud[n]; break; }
  if (!s) {
    const m = /tower(\d)/.exec(k); if (m) s = ud['tower' + m[1]];
    else if (/siege/.test(k)) s = ud[(u.team === 1 ? 'badguys' : 'goodguys') + '_siege'];
    else if (/fort/.test(k)) s = ud.fort;
    else if (/fountain/.test(k)) s = ud.fountain;
    else if (/rax_range|ranged?_rax/.test(k)) s = ud.ranged_rax;
    else if (/melee_rax|rax_melee/.test(k)) s = ud.melee_rax;
  }
  const v = s && s.vision;
  if (v) return !night ? v : u.team === 2 ? Math.min(v, 800) : u.kind === 'creep' ? v : Math.round(Math.min(v, Math.max(600, v * 0.6)));
  return u.kind === 'hero' ? (night ? VISION_FALLBACK.night : VISION_FALLBACK.day) : 800;   // summons etc. (server units.js: 800)
}

/** Effective blocking height of every WALL tile (Float32Array, 0 elsewhere): cliff walls (neighbours at different heights) = the high side, so a
 *  viewer on the high side sees down over them and one below does not; solid obstacles = height + HIGH (same-level viewers blocked); no open neighbour = Infinity. */
const wallLifts = new WeakMap();
export function wallLiftOf(map) {
  let L = wallLifts.get(map); if (L) return L;
  const { w, h, type, hC } = map; L = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const j = y * w + x; if (type[j] !== TT.WALL) continue;
    let mx = -1, mn = 1e9;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
      const q = Y * w + X; if (type[q] === TT.WALL || type[q] === TT.OUT) continue;
      if (hC[q] > mx) mx = hC[q]; if (hC[q] < mn) mn = hC[q];
    }
    L[j] = mx < 0 ? Infinity : mx - mn > 8 ? mx : mx + HIGH;
  }
  wallLifts.set(map, L); return L;
}

/** Pure: cast vision from (sx, sy) world into `vis` (Uint8Array w*h). blockTree(j) = a live tree covers tile j. flying = ignores cliffs and trees
 *  (temporary spell vision). Returns tiles newly marked. */
export function castVision(map, vis, sx, sy, radius, blockTree, flying = false) {
  const { w, h, tile, x0, y1, type, hC } = map;
  const fx = (sx - x0) / tile, fy = (y1 - sy) / tile;
  const cx = Math.floor(fx), cy = Math.floor(fy);
  if (cx < 0 || cy < 0 || cx >= w || cy >= h) return 0;
  const rt = radius / tile, r2 = rt * rt;
  const j0 = cy * w + cx, h0 = hC[j0], vh = h0 + HIGH, lift = flying ? null : wallLiftOf(map);
  const rays = Math.max(24, Math.ceil(2 * Math.PI * rt * 0.9));
  let marked = 0;
  if (!vis[j0]) marked++;
  vis[j0] = 1;
  for (let a = 0; a < rays; a++) {
    const ang = (a / rays) * Math.PI * 2, dx = Math.cos(ang) * 0.5, dy = -Math.sin(ang) * 0.5;
    let px = fx, py = fy, lastJ = j0;
    for (let s = 1, n = Math.ceil(rt * 2); s <= n; s++) {
      px += dx; py += dy;
      const tx = Math.floor(px), ty = Math.floor(py);
      if (tx < 0 || ty < 0 || tx >= w || ty >= h) break;
      const ddx = px - fx, ddy = py - fy, d2 = ddx * ddx + ddy * ddy;
      if (d2 > r2) break;
      const j = ty * w + tx;
      if (j === lastJ) continue;
      lastJ = j;
      if (!vis[j]) { vis[j] = 1; marked++; }
      const t = type[j];
      if (t === TT.OUT) break;
      if (flying) continue;
      if (t === TT.WALL) { if (lift[j] > h0) break; continue; }
      if (hC[j] > vh) break;
      if (blockTree && d2 > 2.25 && hC[j] >= h0 - TREE_BELOW && blockTree(j)) break;
    }
  }
  return marked;
}

export const VOID_NEAR = 2, VOID_FAR = 7;   // mist starts this many tiles from walkable ground and is solid by VOID_FAR
const VOID_CLEAR = { fountain: 420, shop: 320 };   // fountain + base shop sit in walled pockets: ground this close to one counts as walkable
/** Pure: static void-mist mask (Uint8Array w*h, 0..255): for every WALL / OUT tile its chamfer distance to the nearest walkable tile, eased
 *  VOID_NEAR -> VOID_FAR. Thin cliff bands stay clear; the dead ground behind the fountains and the map rim go dense. Grid-edge dead tiles = 255
 *  (the clamped texture then covers anything drawn past the grid). Render only: the sim never reads it. */
export function voidMask(map) {
  const { w, h, type } = map, N = w * h, INF = 1e9, d = new Float32Array(N);
  for (let j = 0; j < N; j++) d[j] = type[j] === TT.WALL || type[j] === TT.OUT ? INF : 0;
  for (const k in VOID_CLEAR) for (const f of (map.ents && map.ents[k]) || []) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (Math.hypot(map.x0 + (x + 0.5) * map.tile - f.x, map.y1 - (y + 0.5) * map.tile - f.y) < VOID_CLEAR[k]) d[y * w + x] = 0;
  }
  const pass = (x, y, dx, dy, c) => { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) return; const j = y * w + x, q = Y * w + X; if (d[q] + c < d[j]) d[j] = d[q] + c; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { pass(x, y, -1, 0, 1); pass(x, y, 0, -1, 1); pass(x, y, -1, -1, 1.4142); pass(x, y, 1, -1, 1.4142); }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { pass(x, y, 1, 0, 1); pass(x, y, 0, 1, 1); pass(x, y, 1, 1, 1.4142); pass(x, y, -1, 1, 1.4142); }
  const out = new Uint8Array(N);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const j = y * w + x; if (!d[j]) continue;
    const t = Math.min(1, Math.max(0, (d[j] - VOID_NEAR) / (VOID_FAR - VOID_NEAR)));
    out[j] = x === 0 || y === 0 || x === w - 1 || y === h - 1 ? 255 : Math.round(t * t * (3 - 2 * t) * 255);
  }
  return out;
}

/** Pure: separable [1 2 1]/4 blur of a Float32 w*h field into out (Uint8Array, channel `o` of `stride`, scaled to 255). tmp = Float32 w*h scratch. */
export function blurToBytes(src, tmp, w, h, out, o, stride) {
  for (let y = 0; y < h; y++) {
    const r = y * w;
    for (let x = 0; x < w; x++) tmp[r + x] = (src[r + (x > 0 ? x - 1 : 0)] + 2 * src[r + x] + src[r + (x < w - 1 ? x + 1 : x)]) * 0.25;
  }
  for (let y = 0; y < h; y++) {
    const r = y * w, ru = (y > 0 ? y - 1 : 0) * w, rd = (y < h - 1 ? y + 1 : y) * w;
    for (let x = 0; x < w; x++) out[(r + x) * stride + o] = ((tmp[ru + x] + 2 * tmp[r + x] + tmp[rd + x]) * 63.75 + 0.5) | 0;
  }
}

// mist floor under the whole map: fills the holes with no terrain (OUT pits) and everything past the grid with the void cloud
const VOID_FLOOR_Y = -24, VOID_FLOOR_R = 16000;
const VOID_VERT = /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const VOID_FRAG = /* glsl */ `
precision highp float;
${COMMON_GLSL}
varying vec3 vW;
void main(){
  vec2 dp = floor(vW.xz / 6.);
  float v = texture2D(uVoid, vec2((vW.x - uFogMap.x) / uFogMap.z, (vW.z + uFogMap.y) / uFogMap.z)).r;
  gl_FragColor = vec4(voidCol(vW, dp) * mix(.45, 1., v), 1.);
}`;

export function createFog(uniforms, scene = null) {
  const map = getMap();
  const W = map.w, H = map.h, N = W * H;
  const vis = new Uint8Array(N), explored = new Uint8Array(N), ease = new Float32Array(N), easeX = new Float32Array(N), easeM = new Float32Array(N).fill(1), tmp = new Float32Array(N);
  const data = new Uint8Array(N * 4);   // R visible, G explored, B fog mist (slower: lingers then dissolves as vision comes, creeps back after), A unused
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.colorSpace = THREE.NoColorSpace; tex.flipY = false; tex.unpackAlignment = 1; tex.needsUpdate = true;
  uniforms.uFog.value = tex;
  uniforms.uFogMap.value.set(map.x0, map.y1, W * map.tile, 1);
  uniforms.uFogLv.value.set(...fogLevels());
  const voidTex = new THREE.DataTexture(voidMask(map), W, H, THREE.RedFormat, THREE.UnsignedByteType);
  voidTex.magFilter = THREE.LinearFilter; voidTex.minFilter = THREE.LinearFilter; voidTex.generateMipmaps = false;
  voidTex.wrapS = voidTex.wrapT = THREE.ClampToEdgeWrapping; voidTex.colorSpace = THREE.NoColorSpace; voidTex.flipY = false; voidTex.unpackAlignment = 1; voidTex.needsUpdate = true;
  uniforms.uVoid.value = voidTex;
  let floor = null;
  if (scene) {
    const geo = new THREE.PlaneGeometry(VOID_FLOOR_R * 2, VOID_FLOOR_R * 2); geo.rotateX(-Math.PI / 2);
    floor = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: VOID_VERT, fragmentShader: VOID_FRAG, uniforms }));
    floor.position.y = VOID_FLOOR_Y; floor.frustumCulled = false; floor.renderOrder = -1; floor.name = 'voidFloor'; floor.updateMatrix(); floor.matrixAutoUpdate = false;
    scene.add(floor);
  }
  // live tree coverage per tile (reference counted so overlapping trees stay correct)
  const treeCount = new Uint8Array(N);
  const tilesOf = [];
  for (let i = 0; i < map.trees.length; i++) { const ts = treeTiles(i); tilesOf.push(ts); for (const j of ts) treeCount[j]++; }
  let downSet = new Set();
  function syncTrees(down) {
    if (!down || down === downSet) return;
    if (down.size === downSet.size) { let same = true; for (const i of down) if (!downSet.has(i)) { same = false; break; } if (same) return; }
    for (const i of downSet) if (!down.has(i)) for (const j of tilesOf[i] || []) treeCount[j]++;
    for (const i of down) if (!downSet.has(i)) for (const j of tilesOf[i] || []) if (treeCount[j] > 0) treeCount[j]--;
    downSet = new Set(down);
  }
  const blockTree = (j) => treeCount[j] > 0;

  const st = { enabled: true, castAcc: 1, uploadAcc: 1, sources: 0, castMs: 0 };
  let dirty = true, revealAll = false;
  const ghosts = new Map();   // structure id -> {hp, maxHp, dead} last seen
  const tileIdx = (x, y) => { const tx = Math.floor((x - map.x0) / map.tile), ty = Math.floor((map.y1 - y) / map.tile); return tx < 0 || ty < 0 || tx >= W || ty >= H ? -1 : ty * W + tx; };

  function cast(view, myTeam) {
    const t0 = performance.now();
    vis.fill(0);
    let n = 0;
    const night = !!view.night;
    for (const u of view.units || []) {
      if ((myTeam === -2 ? u.team !== 0 && u.team !== 1 : u.team !== myTeam) || (u.status & ST.DEAD) || u.hp <= 0 || u.anim === 'dead') continue;   // -2 = spectator
      const r = visionRadius(u, night);
      if (!r) continue;
      castVision(map, vis, u.x, u.y, r, blockTree); n++;
    }
    for (const v of view.vision || []) {   // spell vision sources (server sim vision.js)
      if (myTeam === -2 ? v.team !== 0 && v.team !== 1 : v.team !== myTeam) continue;
      castVision(map, vis, v.x, v.y, v.r, blockTree, v.fly !== false); n++;   // spell vision is flying (ignores cliffs + trees) unless the sim says ground
    }
    for (let j = 0; j < N; j++) if (vis[j]) explored[j] = 1;
    for (const u of view.units || []) {   // structures: remember the state last seen (Dota draws them in the fog at that state)
      if (!GHOST_KINDS.has(u.kind) || u.team === myTeam) continue;
      const j = tileIdx(u.x, u.y);
      if (j >= 0 && vis[j]) ghosts.set(u.id, { hp: u.hp, maxHp: u.maxHp, dead: !!((u.status & ST.DEAD) || u.hp <= 0 || u.anim === 'dead') });
    }
    st.sources = n; st.castMs = performance.now() - t0;
    dirty = true;
  }

  /** ease the targets (visible fades in/out over ~0.4 s, so edges animate as vision moves), blur 1 tile (soft edge), upload */
  function upload(dt) {
    const k = Math.min(1, dt * 4.5), kIn = Math.min(1, dt * MIST_CLEAR), kOut = Math.min(1, dt * MIST_RETURN);
    let any = false;
    for (let j = 0; j < N; j++) {
      const tgt = revealAll ? 1 : vis[j], tx = revealAll || explored[j] ? 1 : 0;
      let e = ease[j];
      if (e !== tgt) { e += (tgt - e) * k; if (Math.abs(e - tgt) < 0.01) e = tgt; ease[j] = e; any = true; }
      let x = easeX[j];
      if (x !== tx) { x += (tx - x) * k; if (Math.abs(x - tx) < 0.01) x = tx; easeX[j] = x; any = true; }
      const tm = tgt ? 0 : 1;
      let m = easeM[j];
      if (m !== tm) { m += (tm - m) * (tm < m ? kIn : kOut); if (Math.abs(m - tm) < 0.01) m = tm; easeM[j] = m; any = true; }
    }
    if (any || dirty) {
      blurToBytes(ease, tmp, W, H, data, 0, 4);
      blurToBytes(easeX, tmp, W, H, data, 1, 4);
      blurToBytes(easeM, tmp, W, H, data, 2, 4);
      tex.needsUpdate = true; dirty = false;
    }
  }

  return {
    state: st, texture: tex,
    setEnabled(on) { st.enabled = !!on; uniforms.uFogMap.value.w = on ? 1 : 0; },
    revealAll(on) { revealAll = !!on; dirty = true; },
    /** forget explored ground + structure ghosts (the vision perspective changed: spectator team switch) */
    reset() { explored.fill(0); easeX.fill(0); easeM.fill(1); ghosts.clear(); st.castAcc = 1; dirty = true; },
    /** call every frame; casts at ~8 Hz, eases + uploads at ~24 Hz */
    update(view, myTeam, dt) {
      if (!st.enabled) return;
      syncTrees(view.treesDown);
      st.castAcc += dt; st.uploadAcc += dt;
      if (st.castAcc >= 0.125) { st.castAcc = 0; cast(view, myTeam); }
      if (st.uploadAcc >= 1 / 24) { upload(st.uploadAcc); st.uploadAcc = 0; }
    },
    tileOf(x, y) { const tx = Math.floor((x - map.x0) / map.tile), ty = Math.floor((map.y1 - y) / map.tile); return tx < 0 || ty < 0 || tx >= W || ty >= H ? -1 : ty * W + tx; },
    isVisible(x, y) { if (!st.enabled || revealAll) return true; const j = this.tileOf(x, y); return j >= 0 && vis[j] === 1; },
    isExplored(x, y) { if (!st.enabled || revealAll) return true; const j = this.tileOf(x, y); return j >= 0 && explored[j] === 1; },
    treeBlocks(j) { return treeCount[j] > 0; },
    /** last-seen state {hp, maxHp, dead} of an enemy structure (pristine until first seen); draw this instead of the live unit while it is fogged */
    ghost(u) { return ghosts.get(u.id) || { hp: u.maxHp, maxHp: u.maxHp, dead: false }; },
    vis, explored,
    dispose() { tex.dispose(); voidTex.dispose(); if (floor) { floor.geometry.dispose(); floor.material.dispose(); floor.removeFromParent(); } },
  };
}
