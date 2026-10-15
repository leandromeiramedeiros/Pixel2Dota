// createRenderer({ canvas, sheets }) -> contract: this file (docs/ARCHITECTURE.md "Render systems" for the rules).
import * as THREE from 'three';
import { launchAt, strikeLaunch, strongerLaunch } from './wind.js';
import { getMap, heightAt } from '../../../shared/map.js';
import { ART_UNITS_PER_PX, CAMERA, MAP_MIN, MAP_MAX } from '../../../shared/constants.js';
import { ST, EV } from '../../../shared/protocol.js';
import { buildAtlas } from '../art/atlas.js';
import { CameraRig, rayToGround, camParams, visibleHeight, dofForDistance, showcaseK } from './camera.js';
import { createCamDir } from './camdir.js';
import { createWind } from './wind.js';
import { createSharedUniforms } from './shaderlib.js';
import { createLights } from './lights.js';
import { createTerrain } from './terrain.js';
import { createPost } from './post.js';
import { createSprites } from './sprites.js';
import { createActors } from './actors.js';
import { createBuildings3d } from './buildings3d.js';
import { createTrees3d } from './trees3d.js';
import { createVoxActors, LEAN_TO, LEAN_K } from './voxactors.js';
import { INFO as BINFO } from './buildings3d.js';
import { pickAt, cylinderBox, minBox } from './pick.js';
import { createClutter3d } from './clutter3d.js';
import { createFog } from './fog.js';
import { createShadow } from './shadow.js';
import { createParticles, createAmbient } from './particles.js';
import { createOverlay } from './overlay.js';
import { makePlaceholderSheet } from './placeholders.js';

THREE.ColorManagement.enabled = false;

// render/fx/index.js is written by another agent; load it lazily so the renderer works without it.
let fxMods = {};
try { fxMods = import.meta.glob('./fx/index.js'); } catch { /* not under vite */ }

const DEFAULTS = {
  pixelScale: 2, bloom: true, bloomStrength: 0.9, vignette: 0.5, spritePersp: 1, fog: true, devZoom: false, particles: 1, lights: true, rim: true,
  shadows: true, outlines: true, hpBars: true, damageNumbers: true, ambient: 1, clutter: 1,   // ambient / clutter: density 0..1 (0 = off)
  wind: 1, dof: true, ssr: true, rays: true, bloomLevels: 5, atmos: 3,   // atmos: showcase sky/mist/cloud tier 0|1|2|3; wind: 1 full / 0.5 medium / 0 none (static); the rest are post.js passes
  maxLights: 32, shadowPoints: 10,   // light pool size (lights.js) / spell lights with a cube shadow (shadow.js)
  drawDist: 9000, msaa: 2,   // drawDist: world units from the camera that trees / clutter / terrain / far plane reach (showcase mist closes before it); msaa: scene target samples (0 = off)
};

const DMG_COL = { phys: '#ff6a55', mag: '#6aa8ff', pure: '#ffb347' };

export function createRenderer({ canvas, sheets }) {
  const gl = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false });
  gl.outputColorSpace = THREE.LinearSRGBColorSpace;
  gl.toneMapping = THREE.NoToneMapping;
  gl.autoClear = false;
  const map = getMap();
  const settings = { ...DEFAULTS };
  const uniforms = createSharedUniforms();
  const rig = new CameraRig();
  const camDir = createCamDir({ bounds: [MAP_MIN, MAP_MAX] });   // the one camera owner (render/camdir.js); the game steps it, the rig only renders
  const scene = new THREE.Scene();
  const atlas = buildAtlas({ ...(sheets || {}), ph_unit: makePlaceholderSheet() });
  const lights = createLights(uniforms, scene);
  const terrain = createTerrain({ scene, uniforms, tiles: sheets && sheets.tiles });
  const sprites = createSprites({ scene, uniforms, atlas });
  const fog = createFog(uniforms, scene);
  const particles = createParticles({ scene, uniforms, atlas, heightAt });
  const ambient = createAmbient(particles, heightAt);
  const post = createPost(gl, uniforms);
  const overlay = createOverlay(canvas);
  const buildings = createBuildings3d({ scene, uniforms }), trees3d = createTrees3d({ scene, uniforms }), clutter = createClutter3d({ scene, uniforms });
  const vox = createVoxActors({ scene, uniforms, ground: (x, z) => heightAt(x, -z) });   // voxel units (voxactors.js VOX_UNITS)
  const wind = createWind();   // spell gusts (wind.js) -> uWA/uWB/uWC/uWN each frame
  const lastHit = new Map();   // target id -> { s: attacker id, t: ms, d: damage, c: crit }: the finishing strike a hero ragdoll takes (wind.js strikeLaunch)
  const shadow = createShadow(gl, uniforms);
  shadow.addGroup(terrain.group, terrain.depthMaterial);
  for (const c of [...buildings.casters(), ...trees3d.casters(), ...clutter.casters(), ...vox.casters(), sprites.caster]) shadow.addCaster(c.mesh, c.mat);
  const actors = createActors({ sprites, atlas, uniforms, lights, fog, particles, camera: rig.camera, buildings, trees: trees3d, vox, yaw: () => rig.yaw, launch: launchOf });

  /** Ragdoll launch of a dying unit: the stronger of the live gusts at its feet (wind.js launchAt) and the finishing strike (killing-hit damage through the
   *  same damage curve, away from the attacker), else null (plain collapse). */
  function launchOf(u) {
    const l = settings.wind > 0 ? launchAt(wind.gusts, u.x, u.y) : null;
    const h = lastHit.get(u.id), a = h && performance.now() - h.t < 3000 ? unitMap.get(h.s) : null;
    return strongerLaunch(l, a ? strikeLaunch(h.d, h.c, u.x, u.y, a.x, a.y) : null);
  }
  let cssW = 1280, cssH = 720, outW = 1280, outH = 720, dpr = 1, nightK = 0, time = 0, myTeam = 0;
  let rtSettledH = 0;
  const hooks = [];
  let lastView = { units: [], treesDown: new Set() };
  const unitMap = new Map();
  const stats = { fps: 0, ms: 0, cpuMs: 0, rt: '', lights: 0, chunks: 0, tris: 0, sprites: 0, units: 0, trees: 0, particles: 0, spawned: 0, fogMs: 0 };

  // ---- optional fx module ---------------------------------------------------------------------------------------------------------
  let fxMod = null; const fxQueue = [];
  const fxLoader = fxMods['./fx/index.js'];
  if (fxLoader) {
    fxLoader().then((m) => {
      if (m && m.createFx) { fxMod = m.createFx({ scene, particles, lights, atlas, heightAt, sprites, overlay, uniforms, unitById: (id) => unitMap.get(id), worldToScreen, visible: (x, y) => fog.isVisible(x, y), target: () => rig.getTarget(), visW: () => rig.visibleWidth }); for (const e of fxQueue.splice(0)) safeFx(e); }
    }).catch((e) => console.warn('[render] fx module failed to load:', e && e.message));
  }
  function safeFx(ev) { try { fxMod.handle(ev, lastView); } catch (e) { if (!safeFx.warned) { safeFx.warned = true; console.warn('[render] fx handler error:', e); } } }

  function applySize() {
    dpr = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2);
    gl.setPixelRatio(dpr); gl.setSize(cssW, cssH, true);
    outW = Math.round(cssW * dpr); outH = Math.round(cssH * dpr);
    rig.setAspect(cssW / cssH);
    overlay.resize(cssW, cssH, dpr);
    rtSettledH = 0;
  }
  function fitRT(force) {
    const vis = rig.visibleHeight / ART_UNITS_PER_PX;
    if (post.height) uniforms.uArtPx.value = post.height / vis;   // every frame: sprites track a zoom while the target size holds
    const settled = Math.abs(rig.distance - rig.distanceGoal) < 1;
    if (!force && !settled && rtSettledH) return;
    // zoomed in past the normal camera (showcase) the low-res target keeps its normal-view size: art pixels grow into crisp blocks
    const visN = visibleHeight(CAMERA.distance, camParams(CAMERA.distance).vfov) / ART_UNITS_PER_PX;
    const h = Math.max(48, Math.round(Math.max(vis, visN) * settings.pixelScale));
    if (h === rtSettledH && post.height === h) return;
    rtSettledH = h;
    const w = Math.round(h * (cssW / cssH));
    post.setRT(w, h);
    uniforms.uRT.value.set(w, h);
    uniforms.uArtPx.value = h / vis;
    stats.rt = w + 'x' + h;
  }

  function setNight(n, dt) {
    const target = n ? 1 : 0;
    nightK += (target - nightK) * Math.min(1, dt / 1.2);
    if (Math.abs(nightK - target) < 0.002) nightK = target;
    const k = nightK;
    const mix = (a, b) => a + (b - a) * k;
    uniforms.uAmb.value.set(mix(0.66, 0.24), mix(0.72, 0.34), mix(0.72, 0.42));   // v2 day: moody but readable (docs/ART-DIRECTION.md)
    uniforms.uKeyCol.value.set(mix(0.56, 0.14), mix(0.46, 0.25), mix(0.30, 0.36));
    uniforms.uRimKey.value.set(mix(0.58, 0.22), mix(0.48, 0.46), mix(0.30, 0.66));
    // the key light stays in the world: its screen-plane x follows the orbit (x = east-west part, 0.6 x it = north-south part), y (up) is yaw independent
    const kx = mix(-0.6, 0.55), cy = Math.cos(rig.yaw), sy = Math.sin(rig.yaw);
    uniforms.uKeyRimDir.value.set(kx * (cy + 0.6 * sy), mix(0.8, 0.83));
    uniforms.uNight.value = k;
  }

  // ---- projection helpers ---------------------------------------------------------------------------------------------------------
  const _v = new THREE.Vector3(), _v4 = new THREE.Vector4();
  function worldToScreen(x, y, z) {
    _v.set(x, (z == null ? heightAt(x, y) : z), -y).project(rig.camera);
    return { x: (_v.x * 0.5 + 0.5) * cssW, y: (1 - (_v.y * 0.5 + 0.5)) * cssH };
  }
  overlay.project = worldToScreen;

  function groundRay(sx, sy) {
    const cam = rig.camera;
    const ndcX = (sx / cssW) * 2 - 1, ndcY = 1 - (sy / cssH) * 2;
    const o = cam.position.clone();
    const d = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(cam).sub(o).normalize();
    let t = 0, prevT = 0, hit = false;
    const maxT = 7000;
    for (t = 40; t < maxT; t += 24) {
      const px = o.x + d.x * t, py = o.y + d.y * t, pz = o.z + d.z * t;
      if (py <= heightAt(px, -pz)) { hit = true; break; }
      prevT = t;
    }
    if (!hit) { const k = o.y / Math.max(-d.y, 1e-3); return { x: o.x + d.x * k, y: -(o.z + d.z * k) }; }
    let a = prevT, b = t;
    for (let i = 0; i < 12; i++) { const m = (a + b) / 2, px = o.x + d.x * m, py = o.y + d.y * m, pz = o.z + d.z * m; if (py <= heightAt(px, -pz)) b = m; else a = m; }
    const m = (a + b) / 2;
    return { x: o.x + d.x * m, y: -(o.z + d.z * m) };
  }

  /** World ground points of the 4 view corners [TL, TR, BR, BL] (flat plane at the target's height, no terrain march: cheap enough per minimap frame).
   *  Spans the free playfield: with a touch HUD inset the top / bottom bands are excluded, as the camera frames the target in the middle of what is left. */
  const _o = new THREE.Vector3(), _d = new THREE.Vector3();
  function viewQuad() {
    const cam = rig.camera, tg = rig.getTarget(), gz = heightAt(tg.x, tg.y), t = rig.inset.top * 2, b = -1 + rig.inset.bottom * 2;   // ndc y of the free band's edges
    cam.updateMatrixWorld(); _o.copy(cam.position);
    return [[-1, 1 - t], [1, 1 - t], [1, b], [-1, b]].map(([nx, ny]) => { _d.set(nx, ny, 0.5).unproject(cam).sub(_o).normalize(); return rayToGround(_o, _d, gz, 6000); });
  }

  // ---- picking (rule + boxes: pick.js) ---------------------------------------------------------------------------------------------
  const BODY_K = { tower: [0.6, 0.68, 0.2], barracks: [0.95, 0.7, 0.2], fort: [0.75, 0.7, 0.2], fountain: [0.75, 0.7, 0.2], filler: [0.8, 0.7, 0.2] };   // building body box: [radius, height] share of INFO R / H, pad below the foot (share of r)
  const tightMap = new WeakMap();
  /** Tight opaque bounds of a sprite frame in screen-oriented pixels (flip applied), cached per frame object. */
  function tightOf(f) {
    let t = tightMap.get(f); if (t) return t;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (atlas.texel(f, f.flip ? f.w - 1 - x : x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    t = x1 < x0 ? { x0: 0, x1: f.w - 1, y0: 0, y1: f.h - 1 } : { x0, x1, y0, y1 };
    tightMap.set(f, t); return t;
  }
  /** world -> css px + clip w + css px per world unit at that depth (null behind the camera) */
  function projCss(x, y, z) {
    const cam = rig.camera;
    _v4.set(x, z, -y, 1).applyMatrix4(cam.matrixWorldInverse).applyMatrix4(cam.projectionMatrix);
    const w = _v4.w; if (w <= 0) return null;
    return { sx: (_v4.x / w * 0.5 + 0.5) * cssW, sy: (1 - (_v4.y / w * 0.5 + 0.5)) * cssH, w, k: 0.5 * cssH * cam.projectionMatrix.elements[5] / w };
  }
  /** Lean of a voxel model (voxactors.js vertex shader): tilt th about the feet away from the camera. */
  function leanOf(x, y, z) {
    const c = rig.camera.position, dx = x - c.x, dz = -y - c.z, hl = Math.hypot(dx, dz);
    if (hl < 1e-3) return null;
    return { dx: dx / hl, dy: -dz / hl, th: Math.max(0, Math.atan2(c.y - z, hl) - LEAN_TO) * LEAN_K };
  }
  /** Screen boxes (css px) of every live unit this frame: [{ id, building, x0, y0, x1, y1, w }]. Voxel units and buildings: world cylinder of the body
   *  through the camera (perspective-correct); sprite units: tight opaque bounds of the drawn frame. */
  function pickBoxes(touch = false) {
    const cam = rig.camera, rtW = post.width, rtH = post.height, out = [];
    const persp = uniforms.uPersp.value, art = uniforms.uArtPx.value, ref = uniforms.uRefW.value;
    for (const p of actors.picks) {
      if (!p.id) continue;
      const f = p.f; let box = null;
      if (p.b) {
        const bi = BINFO[p.b], k = BODY_K[p.b] || BODY_K.filler;
        box = cylinderBox(projCss, p.x, p.y, p.z, bi.R * k[0], bi.H * k[1], { pad: k[2], touch });
      } else if (f.vox) {
        box = cylinderBox(projCss, p.x, p.y, p.z, (f.hw || f.r) * p.scale, (f.ptop || f.top) * p.scale, { lean: f.lean === false ? null : leanOf(p.x, p.y, p.z), touch });
      } else {
        _v4.set(p.x, p.z, -p.y, 1).applyMatrix4(cam.matrixWorldInverse).applyMatrix4(cam.projectionMatrix);
        const w = _v4.w; if (w <= 0) continue;
        const fx = Math.floor((_v4.x / w * 0.5 + 0.5) * rtW + 0.5), fy = Math.floor((_v4.y / w * 0.5 + 0.5) * rtH + 0.5);
        let s = art * p.scale * (1 + (ref / w - 1) * persp);
        s = persp ? s : Math.max(1, Math.floor(s + 0.5));
        if (f.dens > 1) s /= f.dens;
        const t = tightOf(f), kx = cssW / rtW, ky = cssH / rtH;
        const xl = fx + (t.x0 - 0.5 - f.ax) * s, xr = fx + (t.x1 + 0.5 - f.ax) * s, yt = fy + (f.ay - t.y0 + 0.5) * s, yb = fy + (f.ay - t.y1 - 0.5) * s;   // render-target px, y up
        box = { ...minBox(xl * kx, (rtH - yt) * ky, xr * kx, (rtH - yb) * ky, touch), w };
      }
      if (box) { box.id = p.id; box.building = !!p.b; box.p = p; out.push(box); }
    }
    return out;
  }
  /** First tree under the cursor (alpha-tested sprite silhouette), nearest to the camera. */
  function pickTree(sx, sy) {
    const cam = rig.camera, rtW = post.width, rtH = post.height, mx = (sx / cssW) * rtW, my = (1 - sy / cssH) * rtH;
    const persp = uniforms.uPersp.value, art = uniforms.uArtPx.value, ref = uniforms.uRefW.value;
    let best = null, bestW = Infinity;
    for (const p of actors.picks) {
      if (p.id) continue;
      const f = p.f;
      _v4.set(p.x, p.z, -p.y, 1).applyMatrix4(cam.matrixWorldInverse).applyMatrix4(cam.projectionMatrix);
      const w = _v4.w; if (w <= 0 || w >= bestW) continue;
      const fx = Math.floor((_v4.x / w * 0.5 + 0.5) * rtW + 0.5), fy = Math.floor((_v4.y / w * 0.5 + 0.5) * rtH + 0.5);
      let s = art * p.scale * (1 + (ref / w - 1) * persp);
      s = persp ? s : Math.max(1, Math.floor(s + 0.5));
      if (f.dens > 1) s /= f.dens;
      const lx = Math.floor((mx - fx) / s + f.ax + 0.5), ly = Math.floor(f.ay + 0.5 - (my - fy) / s);
      if (lx < -2 || ly < -2 || lx > f.w + 1 || ly > f.h + 1) continue;
      if (atlas.texel(f, f.flip ? f.w - 1 - lx : lx, ly)) { bestW = w; best = p; }
    }
    return best;
  }
  /** Unit (heroes, creeps, buildings, ...) or tree under the cursor: { unit: pick entry | null, tree: pick entry | null }. touch = larger minimum boxes. */
  function pickSprite(sx, sy, touch = false) {
    const r = pickAt(pickBoxes(touch), sx, sy, () => pickTree(sx, sy));
    return { unit: r.unit ? r.unit.p : null, tree: r.tree };
  }

  // ---- built-in combat feedback (damage numbers, a little spark) ---------------------------------------------------------------------
  function builtinFx(ev) {
    const u = (id) => unitMap.get(id);
    switch (ev.e) {
      case 'hit': {
        const t = u(ev.t); if (!t) break;
        actors.flash(ev.t, 1);
        if (settings.damageNumbers && fog.isVisible(t.x, t.y)) overlay.text(t.x, t.y, (t.z || 0), Math.round(ev.d), ev.c ? '#ffd24a' : DMG_COL[ev.ty] || '#ffffff', ev.c ? 1.3 : 0.9, { big: !!ev.c });
        particles.burst({ x: t.x, y: t.y, z: (t.z || 0) + 40, count: 3, life: [0.15, 0.3], size0: 10, size1: 3, col0: [1.3, 1.0, 0.7], col1: [0.9, 0.45, 0.15], a0: 1, a1: 0, speed: [60, 160], drag: 4, stamp: 'p_hit_' + ((Math.random() * 4) | 0) });
        break;
      }
      case 'gold': { const t = u(ev.t); if (t && settings.damageNumbers) overlay.text(t.x, t.y, t.z || 0, '+' + ev.g, '#ffd23a', 1.4); break; }
      case 'heal': { const t = u(ev.t); if (t && settings.damageNumbers && ev.a >= 1) overlay.text(t.x, t.y, t.z || 0, '+' + Math.round(ev.a), '#5be36a', 0.9); break; }
      case 'mana': { const t = u(ev.t); if (t && settings.damageNumbers && ev.a >= 1) overlay.text(t.x, t.y, t.z || 0, '+' + Math.round(ev.a), '#5b8cff', 0.9); break; }
      case 'lvl': { const t = u(ev.t); if (t) { overlay.text(t.x, t.y, t.z || 0, 'LEVEL UP', '#fff08a', 1.6, { big: true }); particles.burst({ x: t.x, y: t.y, z: (t.z || 0) + 10, count: 40, shape: 'ring', radius: 30, life: [0.6, 1.1], size0: 14, size1: 4, col0: [3, 2.6, 0.8], col1: [1.5, 1, 0.3], a0: 1, a1: 0, speed: [10, 30], up: [90, 240], gravity: -80, drag: 1, stamp: 'p_star' }); lights.add({ x: t.x, y: t.y, z: (t.z || 0) + 60, r: 1, g: 0.9, b: 0.4, radius: 200, intensity: 0.4 }); } break; }
      case 'death': {
        const t = u(ev.t); if (!t) break;
        particles.burst({ x: t.x, y: t.y, z: (t.z || 0) + 20, count: 14, life: [0.5, 1.0], size0: 18, size1: 40, col0: [0.5, 0.45, 0.4], col1: [0.2, 0.18, 0.16], a0: 0.7, a1: 0, speed: [20, 70], up: [10, 60], drag: 2.2, mode: 'glow' });
        break;
      }
      default: break;
    }
  }

  // ---- HP bars -------------------------------------------------------------------------------------------------------------------------
  const BAR_W = { hero: 17, creep: 6, tower: 10, rax: 10, ancient: 14, fountain: 0, building: 8 };
  /** 0..1 visibility of world-anchored UI (bars, combat text): 1 in normal play; in the showcase it fades out where the mist starts and behind the camera. k = perspective size factor vs the target. */
  const _e = new THREE.Vector3(), uiVis = { a: 1, k: 1 };
  function uiFade(x, y, z) {
    uiVis.a = 1; uiVis.k = 1;
    const sky = post.state.sky; if (sky <= 0.002) return uiVis;
    const cam = rig.camera; _e.set(x, z == null ? heightAt(x, y) : z, -y);
    const d = _e.distanceTo(cam.position);
    _e.applyMatrix4(cam.matrixWorldInverse); if (_e.z > -50) { uiVis.a = 1 - sky; return uiVis; }   // behind / at the camera
    const f = post.fogRange(), s0 = f[0] * 0.55, s1 = f[0] * 1.05;
    const t = Math.min(1, Math.max(0, (d - s0) / (s1 - s0)));
    uiVis.a = 1 - sky * t * t * (3 - 2 * t);
    uiVis.k = 1 + (Math.min(1.15, Math.max(0.35, rig.distance / Math.max(d, 1))) - 1) * sky;
    return uiVis;
  }
  overlay.fade = (x, y, z) => uiFade(x, y, z).a;
  function drawBars(view) {
    if (!settings.hpBars) return;
    const cssPerArt = Math.min(cssH / (rig.visibleHeight / ART_UNITS_PER_PX), cssH / (visibleHeight(CAMERA.closeDistance, camParams(CAMERA.closeDistance).vfov) / ART_UNITS_PER_PX));   // showcase: no bigger than at the close camera
    for (const p of actors.picks) {
      if (!p.id) continue;
      const u = unitMap.get(p.id); if (!u || u.visible === false || !(u.maxHp > 0)) continue;
      const hero = u.kind === 'hero';
      const dead = (u.status & ST.DEAD) || u.hp <= 0;
      if (dead) continue;
      const hurt = u.hp < u.maxHp - 0.5;
      if (!hero && !hurt && p.id !== actors.state.selected && p.id !== actors.state.hover) continue;
      const aw = BAR_W[u.kind] != null ? BAR_W[u.kind] : 6;
      if (!aw) continue;
      const bz = p.z + p.f.ay / (p.f.dens || 1) * ART_UNITS_PER_PX * 0.92 * (p.f.vox ? p.scale : 1), vis = uiFade(u.x, u.y, bz);
      if (vis.a <= 0.02) continue;
      const w = Math.round(Math.min(hero ? 150 : 90, (hero ? Math.max(46, aw * cssPerArt * 0.95) : aw * cssPerArt * 0.95) * vis.k));   // capped: the showcase close-up never draws giant bars
      const hh = hero ? Math.max(5, Math.round(Math.max(8, Math.min(14, cssPerArt * 3)) * vis.k)) : 3;   // hero bar: big enough to read on a phone
      const s = worldToScreen(u.x, u.y, bz);
      const mine = u.team === myTeam;
      overlay.bar({ sx: s.x, sy: s.y - 6 - (hero ? Math.round(hh * 1.8) : 0), w, h: hh, hp: u.hp / u.maxHp, mana: hero && u.maxMana > 0 ? u.mana / u.maxMana : null, color: mine ? undefined : '#e04a3c', maxHp: hero ? u.maxHp : 0, level: hero ? u.level : null, a: vis.a });
    }
  }

  function update(view, dt) {
    const t0 = performance.now();
    dt = Math.min(Math.max(dt || 0, 0), 0.1);
    time += dt;
    view = view || lastView;
    lastView = view;
    if (view.myTeam != null) myTeam = view.myTeam;
    uniforms.uTime.value = time;
    rig.update(dt);
    { const far = post.state.sky > 0.002 ? Math.max(3000, settings.drawDist + rig.distance) : 5500; if (rig.camera.far !== far) { rig.camera.far = far; rig.camera.updateProjectionMatrix(); } }   // showcase: the view reaches the horizon, the draw distance cuts it (inside the mist)
    post.state.dofStrength = dofForDistance(rig.distance); post.state.sky = showcaseK(rig.distance); post.state.focus = rig.distance;   // sky + rolling distance fog fade in with the same factor   // tilt-shift: minimal at gameplay distance, full at the showcase close-up
    fitRT(false);
    setNight(view.night, dt);
    const cam = rig.camera;
    cam.updateMatrixWorld();
    uniforms.uCamRight.value.setFromMatrixColumn(cam.matrixWorld, 0);
    uniforms.uCamUp.value.setFromMatrixColumn(cam.matrixWorld, 1);
    uniforms.uCamPos.value.copy(cam.position);
    uniforms.uPxK.value = 0.5 * post.height * cam.projectionMatrix.elements[5];
    uniforms.uRefW.value = rig.distance;
    uniforms.uPersp.value = settings.spritePersp;
    uniforms.uWind.value = settings.wind;
    wind.update(dt); uniforms.uWN.value = settings.wind > 0 ? wind.pack(uniforms.uWA.value, uniforms.uWB.value, uniforms.uWC.value) : 0;

    unitMap.clear();
    for (const u of view.units || []) unitMap.set(u.id, u);

    lights.clear(); sprites.begin();
    if (settings.fog) { if (!fog.state.enabled) fog.setEnabled(true); fog.update(view, view.spectator ? -2 : myTeam, dt); }   // -2: both teams' vision else if (fog.state.enabled) fog.setEnabled(false);
    actors.state.outlines = settings.outlines;
    actors.draw(view, dt, nightK, time, settings);
    particles.update(dt, time);
    if (settings.ambient > 0 && settings.particles > 0) {
      const tg = rig.getTarget();
      ambient.update(dt * settings.ambient, tg.x, tg.y, rig.visibleWidth * 0.55, rig.visibleHeight * 0.8, nightK);
    }
    if (fxMod) { try { fxMod.update(dt, view); } catch (e) { if (!update.warned) { update.warned = true; console.warn('[render] fx update error:', e); } } }
    for (const h of hooks) h(dt, view, time);
    const tg = rig.getTarget();
    lights.setView(tg.x, tg.y, rig.visibleWidth * 0.9);
    lights.finalize(time);
    sprites.end(); particles.flush();
    sprites.setRim(settings.rim);
    clutter.enabled = settings.clutter > 0; clutter.density = settings.clutter; clutter.setRim(settings.rim); clutter.update(cam, tg.x, tg.y, rig.visibleWidth, rig.visibleHeight, rig.showcase || rig.yaw !== 0, post.state.sky > 0.002 ? Math.min(settings.drawDist * 0.5, 3000) : 0);

    terrain.update(cam, rig.snap ? 999 : 6, 1);   // + 1 off-screen chunk a frame: the whole map is built before the first showcase looks at the horizon
    shadow.setEnabled(settings.shadows);
    shadow.renderPoints(scene, lights.shadowLights);
    shadow.render(scene, tg.x, heightAt(tg.x, tg.y), -tg.y, Math.max(rig.visibleWidth * 0.75, rig.visibleHeight * 1.15));
    shadow.renderHeight(scene, tg.x, heightAt(tg.x, tg.y), -tg.y, Math.max(rig.visibleWidth * 0.75, rig.visibleHeight * 1.15), lights.spellCount > lights.shadowLights.length ? 1 : 0);   // only when a spell light lacks a cube shadow
    post.render(scene, cam, time, nightK, outW, outH);
    drawBars(view);
    overlay.draw(dt);
    stats.cpuMs = performance.now() - t0; stats.lights = lights.count; stats.chunks = terrain.stats.drawn; stats.tris = terrain.stats.tris + buildings.stats.tris + trees3d.stats.tris + clutter.stats.tris + vox.stats.tris; stats.props3d = buildings.stats.draws + trees3d.stats.draws;
    stats.sprites = sprites.count; stats.units = actors.state.unitsDrawn; stats.trees = actors.state.treesDrawn; stats.spawned = particles.spawned; stats.fogMs = fog.state.castMs; stats.shadowMs = shadow.state.ms;
  }

  const api = {
    resize(w, h) { cssW = Math.max(2, w | 0); cssH = Math.max(2, h | 0); applySize(); fitRT(true); },
    /** Camera director (render/camdir.js): input / touch / minimap / hud send intents to it; stepCamera places the rig. */
    cam: camDir,
    /** Per frame, before update(): ctx = { hero: {x, y, alive}|null (interpolated), moveDir }. Visible height and showcase come from the rig. */
    stepCamera(dt, ctx = {}) { const c = camDir.update(dt, { ...ctx, visibleH: rig.visibleHeight, showcase: rig.showcase }); rig.place(c.x, c.y, c.snap); return c; },
    placeTarget(x, y, snap = false) { rig.place(x, y, snap); },
    /** Legacy writers = a user jump (drops follow). The rig is set too so pages that never step the camera (sandbox) still move. */
    setTarget(x, y) { camDir.jumpTo(x, y); rig.setTarget(x, y, false); },
    snapTarget(x, y) { camDir.jumpTo(x, y); rig.place(x, y, true); },
    /** Fractions of the screen height covered by HUD at the top / bottom (touch): the camera frames the target in the middle of the free playfield. 0,0 = desktop. */
    setViewInset({ top = 0, bottom = 0 } = {}) { rig.setViewInset(top, bottom); post.state.dofY = (bottom - top) / 2; },
    zoom(delta) { rig.zoom(delta); },
    zoomBy(f) { rig.zoomBy(f); },
    /** spectator player-perspective: follow another camera's distance (clamped to this client's zoom range) */
    setDistance(d) { rig.distanceGoal = Math.max(rig.minDist, Math.min(rig.maxDist, d)); },
    getDistance() { return rig.distanceGoal; },
    setCameraFar(d, start) { rig.setFar(d, start); fitRT(true); },
    isShowcase() { return rig.showcase; },
    /** Orbit the hero in the showcase (dYaw rad, + = eye towards east; dPitch deg, + = more top-down). false outside the showcase. */
    orbit(dYaw, dPitch = 0) { return rig.orbit(dYaw, dPitch); },
    getYaw() { return rig.yaw; },
    getTarget() { return rig.getTarget(); },
    /** 4 world ground points of the visible playfield corners [TL, TR, BR, BL] (follows the showcase orbit yaw and the perspective). */
    viewQuad,
    update,
    fx(events) {
      if (!events) return;
      for (const ev of events) {
        builtinFx(ev);
        if (ev.e === EV.HIT && ev.s != null && ev.t != null) lastHit.set(ev.t, { s: ev.s, t: performance.now(), d: ev.d || 0, c: !!ev.c });
        if (ev.e === EV.SPELL && settings.wind > 0) wind.report(ev, (id) => unitMap.get(id), undefined, (x, y) => { const c = unitMap.get(ev.s); return (c && c.team === myTeam) || fog.isVisible(x, y); });   // spell casts kick up gusts (own team's always, enemy only when seen); basic attacks do not
        if (fxMod) safeFx(ev); else if (fxLoader) { if (fxQueue.length < 256) fxQueue.push(ev); }
      }
    },
    /** Cursor -> { x, y (ground / unit), unitId, tree? }. Hover and click both call this (rule: pick.js). o.touch: larger minimum hit boxes. */
    pick(sx, sy, o) {
      const g = groundRay(sx, sy);
      const p = pickSprite(sx, sy, !!(o && o.touch));
      const r = { x: g.x, y: g.y, unitId: p.unit ? p.unit.id : null };
      if (p.unit) { r.x = p.unit.x; r.y = p.unit.y; }
      if (!p.unit && p.tree) r.tree = p.tree.tree;
      return r;
    },
    /** Debug: every unit hit box (css px) + the pick winner id at (sx, sy): [{ id, building, x0, y0, x1, y1, w }], same code path as pick(). */
    pickDebug(sx, sy, o) { const p = pickSprite(sx, sy, !!(o && o.touch)); return { boxes: pickBoxes(!!(o && o.touch)).map(({ p: _p, ...b }) => b), winner: p.unit ? p.unit.id : null }; },
    worldToScreen,
    /** per-frame callbacks fn(dt, view, time), run after units are drawn and before lights are finalised (use lights.add / particles here) */
    hooks,
    setSelected(id) { actors.setSelected(id); },
    setHover(id) { actors.setHover(id); },
    setMyTeam(team) { myTeam = team; actors.setMyTeam(team); },
    setSetting(name, value) {
      settings[name] = value;
      if (name === 'pixelScale') fitRT(true);
      if (name === 'devZoom') rig.setDevZoom(!!value);
      if (name === 'bloom') post.state.bloom = !!value;
      if (name === 'bloomStrength') post.state.bloomStrength = value;
      if (name === 'vignette') post.state.vignette = value;
      if (name === 'particles') particles.scale.v = +value;
      if (name === 'fog') fog.setEnabled(!!value);
      if (name === 'wind') { wind.setGain(+value || 0); settings.wind = wind.gain; }
      if (name === 'dof') post.state.dof = !!value;
      if (name === 'ssr') post.state.ssr = !!value;
      if (name === 'rays') post.state.rays = !!value;
      if (name === 'atmos') post.state.atmos = +value || 0;
      if (name === 'bloomLevels') post.state.bloomLevels = value | 0;
      if (name === 'maxLights') lights.setMax(value);
      if (name === 'shadowPoints') lights.setMaxShadow(value);
      if (name === 'msaa') post.setSamples(value | 0);
      if (name === 'drawDist') post.state.drawDist = +value || 5500;
    },
    minimapCanvas: () => terrain.minimapCanvas(),
    /** explored/visible tile grids for the minimap (row-major, 368x368, row 0 = north) */
    fogGrid: () => ({ w: map.w, h: map.h, visible: fog.vis, explored: fog.explored }),
    // internals for the sandbox / tests
    gl, scene, rig, uniforms, wind, shadow, clutter, lights, terrain, post, atlas, stats, settings, sprites, actors, fog, particles, overlay,
    get camera() { return rig.camera; },
    get fxModule() { return fxMod; },
    get night() { return nightK; },
    dispose() { post.dispose(); terrain.dispose(); sprites.dispose(); particles.dispose(); overlay.dispose(); fog.dispose(); gl.dispose(); },
  };
  applySize(); fitRT(true);
  return api;
}
