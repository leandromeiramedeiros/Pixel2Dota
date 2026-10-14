// Team vision. Tile-resolution grid: radial ray casting from every friendly unit, blocked by higher ground and live trees.
//   R channel = currently visible (eased), G channel = explored. Uploaded as a linear-filtered RG8 DataTexture; the shaders turn it into a
//   5-step dithered brightness (shaderlib fogBright). Enemies standing outside the visible set are hidden (visible=false).
import * as THREE from 'three';
import { getMap, TT, treeTiles } from '../../../shared/map.js';
import { DATA } from '../../../shared/data.js';
import { ST } from '../../../shared/protocol.js';

export const VISION_FALLBACK = { day: 1800, night: 800 };
const HIGH = 70;          // a tile this much higher than the viewer blocks sight

/** Vision radius of a unit view (world units). Heroes use visionDay/visionNight from DATA, other units their baked `vision`. */
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
    else if (/ranged_rax|range_rax/.test(k)) s = ud.ranged_rax;
    else if (/melee_rax/.test(k)) s = ud.melee_rax;
  }
  const v = s && s.vision;
  if (v) return night && u.kind === 'creep' ? Math.min(v, 750) : v;
  return u.kind === 'hero' ? (night ? VISION_FALLBACK.night : VISION_FALLBACK.day) : 750;
}

/** Pure: cast vision from (sx, sy) world into `vis` (Uint8Array w*h). blockTree(j) = a live tree covers tile j. Returns tiles marked. */
export function castVision(map, vis, sx, sy, radius, blockTree) {
  const { w, h, tile, x0, y1, type, hC } = map;
  const fx = (sx - x0) / tile, fy = (y1 - sy) / tile;
  const cx = Math.floor(fx), cy = Math.floor(fy);
  if (cx < 0 || cy < 0 || cx >= w || cy >= h) return 0;
  const rt = radius / tile, r2 = rt * rt;
  const j0 = cy * w + cx, vh = hC[j0] + HIGH;
  const rays = Math.max(24, Math.ceil(2 * Math.PI * rt * 0.9));
  let marked = 0;
  vis[j0] = 1;
  for (let a = 0; a < rays; a++) {
    const ang = (a / rays) * Math.PI * 2, dx = Math.cos(ang) * 0.5, dy = -Math.sin(ang) * 0.5;
    let px = fx, py = fy, lastJ = j0;
    for (let s = 1, n = Math.ceil(rt * 2); s <= n; s++) {
      px += dx; py += dy;
      const tx = Math.floor(px), ty = Math.floor(py);
      if (tx < 0 || ty < 0 || tx >= w || ty >= h) break;
      const ddx = px - fx, ddy = py - fy;
      if (ddx * ddx + ddy * ddy > r2) break;
      const j = ty * w + tx;
      if (j === lastJ) continue;
      lastJ = j;
      if (!vis[j]) { vis[j] = 1; marked++; }
      const t = type[j];
      if (t === TT.WALL || t === TT.OUT) break;
      if (hC[j] > vh) break;
      if (blockTree && blockTree(j) && (ddx * ddx + ddy * ddy) > 2.25) break;
    }
  }
  return marked;
}

export function createFog(uniforms) {
  const map = getMap();
  const W = map.w, H = map.h, N = W * H;
  const vis = new Uint8Array(N), explored = new Uint8Array(N), ease = new Float32Array(N);
  const data = new Uint8Array(N * 2);
  const tex = new THREE.DataTexture(data, W, H, THREE.RGFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.colorSpace = THREE.NoColorSpace; tex.flipY = false; tex.unpackAlignment = 1; tex.needsUpdate = true;
  uniforms.uFog.value = tex;
  uniforms.uFogMap.value.set(map.x0, map.y1, W * map.tile, 1);

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
    for (let j = 0; j < N; j++) if (vis[j]) explored[j] = 1;
    st.sources = n; st.castMs = performance.now() - t0;
    dirty = true;
  }

  function upload(dt) {
    const k = Math.min(1, dt * 7);
    let any = false;
    for (let j = 0; j < N; j++) {
      const tgt = revealAll ? 1 : vis[j];
      let e = ease[j];
      if (e !== tgt) { e += (tgt - e) * k; if (Math.abs(e - tgt) < 0.02) e = tgt; ease[j] = e; any = true; }
      const o = j * 2;
      data[o] = (e * 255) | 0; data[o + 1] = (revealAll || explored[j]) ? 255 : 0;
    }
    if (any || dirty) { tex.needsUpdate = true; dirty = false; }
  }

  return {
    state: st, texture: tex,
    setEnabled(on) { st.enabled = !!on; uniforms.uFogMap.value.w = on ? 1 : 0; },
    revealAll(on) { revealAll = !!on; dirty = true; },
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
    vis, explored,
    dispose() { tex.dispose(); },
  };
}
