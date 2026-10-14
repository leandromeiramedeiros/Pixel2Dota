// createRenderer({ canvas, sheets }) -> contract in docs/ARCHITECTURE.md ("Client code interfaces").
import * as THREE from 'three';
import { getMap, heightAt } from '../../../shared/map.js';
import { ART_UNITS_PER_PX } from '../../../shared/constants.js';
import { ST } from '../../../shared/protocol.js';
import { buildAtlas } from '../art/atlas.js';
import { CameraRig } from './camera.js';
import { createSharedUniforms } from './shaderlib.js';
import { createLights } from './lights.js';
import { createTerrain } from './terrain.js';
import { createPost } from './post.js';
import { createSprites } from './sprites.js';
import { createActors } from './actors.js';
import { createBuildings3d } from './buildings3d.js';
import { createTrees3d } from './trees3d.js';
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
  pixelScale: 2, bloom: true, bloomStrength: 0.9, vignette: 0.5, spritePersp: 0, fog: true, devZoom: false, particles: 1, lights: true, rim: true,
  shadows: true, outlines: true, hpBars: true, damageNumbers: true, ambient: true, clutter: true,
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
  const scene = new THREE.Scene();
  const atlas = buildAtlas({ ...(sheets || {}), ph_unit: makePlaceholderSheet() });
  const lights = createLights(uniforms, scene);
  const terrain = createTerrain({ scene, uniforms, tiles: sheets && sheets.tiles });
  const sprites = createSprites({ scene, uniforms, atlas });
  const fog = createFog(uniforms);
  const particles = createParticles({ scene, uniforms, atlas, heightAt });
  const ambient = createAmbient(particles, heightAt);
  const post = createPost(gl, uniforms);
  const overlay = createOverlay(canvas);
  const buildings = createBuildings3d({ scene, uniforms }), trees3d = createTrees3d({ scene, uniforms }), clutter = createClutter3d({ scene, uniforms });
  const shadow = createShadow(gl, uniforms);
  shadow.addGroup(terrain.group, terrain.depthMaterial);
  for (const c of [...buildings.casters(), ...trees3d.casters(), ...clutter.casters()]) shadow.addCaster(c.mesh, c.mat);
  const actors = createActors({ sprites, atlas, uniforms, lights, fog, particles, camera: rig.camera, buildings, trees: trees3d });

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
    const settled = Math.abs(rig.distance - rig.distanceGoal) < 1;
    if (!force && !settled && rtSettledH) return;
    const vis = rig.visibleHeight / ART_UNITS_PER_PX;
    const h = Math.max(48, Math.round(vis * settings.pixelScale));
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
    uniforms.uKeyRimDir.value.set(mix(-0.6, 0.55), mix(0.8, 0.83));
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

  /** Sprite hit test (alpha-tested, replicating the vertex shader's screen layout). */
  function pickSprite(sx, sy) {
    const cam = rig.camera, rtW = post.width, rtH = post.height;
    const mx = (sx / cssW) * rtW, my = (1 - sy / cssH) * rtH;
    let best = null, bestW = Infinity, bestTree = null, bestTreeW = Infinity;
    const persp = uniforms.uPersp.value, art = uniforms.uArtPx.value, ref = uniforms.uRefW.value;
    for (const p of actors.picks) {
      const f = p.f;
      _v4.set(p.x, p.z, -p.y, 1).applyMatrix4(cam.matrixWorldInverse).applyMatrix4(cam.projectionMatrix);
      const w = _v4.w; if (w <= 0) continue;
      const nx = _v4.x / w, ny = _v4.y / w;
      const fx = Math.floor((nx * 0.5 + 0.5) * rtW + 0.5), fy = Math.floor((ny * 0.5 + 0.5) * rtH + 0.5);
      let s = art * p.scale * (1 + (ref / w - 1) * persp);
      s = persp ? s : Math.max(1, Math.floor(s + 0.5));
      if (f.dens > 1) s /= f.dens;                                   // double-resolution hero sheets: dense px = 1/dens of a snapped art px
      const lx = Math.floor((mx - fx) / s + f.ax + 0.5), ly = Math.floor(f.ay + 0.5 - (my - fy) / s);
      if (lx < -2 || ly < -2 || lx > f.w + 1 || ly > f.h + 1) continue;
      let hit = false;
      for (const [dx, dy] of p.id ? [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] : [[0, 0]]) {
        const tx = lx + dx, ty = ly + dy;
        if (atlas.texel(f, f.flip ? f.w - 1 - tx : tx, ty)) { hit = true; break; }
      }
      if (!hit) continue;
      if (p.id) { if (w < bestW) { bestW = w; best = p; } }
      else if (w < bestTreeW) { bestTreeW = w; bestTree = p; }
    }
    return { unit: best, tree: bestTree };
  }

  // ---- built-in combat feedback (damage numbers, a little spark) ---------------------------------------------------------------------
  function builtinFx(ev) {
    const u = (id) => unitMap.get(id);
    switch (ev.e) {
      case 'hit': {
        const t = u(ev.t); if (!t) break;
        actors.flash(ev.t, 1);
        if (settings.damageNumbers && fog.isVisible(t.x, t.y)) overlay.text(t.x, t.y, (t.z || 0), Math.round(ev.d), ev.c ? '#ffd24a' : DMG_COL[ev.ty] || '#ffffff', ev.c ? 1.3 : 0.9, { big: !!ev.c });
        particles.burst({ x: t.x, y: t.y, z: (t.z || 0) + 40, count: 3, life: [0.15, 0.3], size0: 10, size1: 3, col0: [3, 2.2, 1.4], col1: [1.5, 0.6, 0.2], a0: 1, a1: 0, speed: [60, 160], drag: 4, stamp: 'p_hit_' + ((Math.random() * 4) | 0) });
        break;
      }
      case 'gold': { const t = u(ev.t); if (t && settings.damageNumbers) overlay.text(t.x, t.y, t.z || 0, '+' + ev.g, '#ffd23a', 1.4); break; }
      case 'heal': { const t = u(ev.t); if (t && settings.damageNumbers && ev.a >= 1) overlay.text(t.x, t.y, t.z || 0, '+' + Math.round(ev.a), '#5be36a', 0.9); break; }
      case 'mana': { const t = u(ev.t); if (t && settings.damageNumbers && ev.a >= 1) overlay.text(t.x, t.y, t.z || 0, '+' + Math.round(ev.a), '#5b8cff', 0.9); break; }
      case 'lvl': { const t = u(ev.t); if (t) { overlay.text(t.x, t.y, t.z || 0, 'LEVEL UP', '#fff08a', 1.6, { big: true }); particles.burst({ x: t.x, y: t.y, z: (t.z || 0) + 10, count: 40, shape: 'ring', radius: 30, life: [0.6, 1.1], size0: 14, size1: 4, col0: [3, 2.6, 0.8], col1: [1.5, 1, 0.3], a0: 1, a1: 0, speed: [10, 30], up: [90, 240], gravity: -80, drag: 1, stamp: 'p_star' }); lights.add({ x: t.x, y: t.y, z: (t.z || 0) + 60, r: 1, g: 0.9, b: 0.4, radius: 420, intensity: 1.2 }); } break; }
      case 'death': {
        const t = u(ev.t); if (!t) break;
        particles.burst({ x: t.x, y: t.y, z: (t.z || 0) + 20, count: 14, life: [0.5, 1.0], size0: 18, size1: 40, col0: [0.5, 0.45, 0.4], col1: [0.2, 0.18, 0.16], a0: 0.7, a1: 0, speed: [20, 70], up: [10, 60], drag: 2.2, mode: 'glow' });
        break;
      }
      default: break;
    }
  }

  // ---- HP bars -------------------------------------------------------------------------------------------------------------------------
  const BAR_W = { hero: 11, creep: 6, tower: 10, rax: 10, ancient: 14, fountain: 0, building: 8 };
  function drawBars(view) {
    if (!settings.hpBars) return;
    const cssPerArt = cssH / (rig.visibleHeight / ART_UNITS_PER_PX);
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
      const w = Math.round(aw * cssPerArt * 0.95);
      const s = worldToScreen(u.x, u.y, p.z + p.f.ay / (p.f.dens || 1) * ART_UNITS_PER_PX * 0.92);
      const mine = u.team === myTeam;
      overlay.bar({ sx: s.x, sy: s.y - 6, w, h: hero ? 5 : 3, hp: u.hp / u.maxHp, mana: hero && u.maxMana > 0 ? u.mana / u.maxMana : null, color: mine ? undefined : '#e04a3c', ticks: hero ? Math.max(0, Math.min(14, Math.round(u.maxHp / 250))) : 0, level: hero ? u.level : null });
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

    unitMap.clear();
    for (const u of view.units || []) unitMap.set(u.id, u);

    lights.clear(); sprites.begin();
    if (settings.fog) { if (!fog.state.enabled) fog.setEnabled(true); fog.update(view, myTeam, dt); } else if (fog.state.enabled) fog.setEnabled(false);
    actors.state.outlines = settings.outlines;
    actors.draw(view, dt, nightK, time, settings);
    particles.update(dt, time);
    if (settings.ambient && settings.particles > 0) {
      const tg = rig.getTarget();
      ambient.update(dt, tg.x, tg.y, rig.visibleWidth * 0.55, rig.visibleHeight * 0.8, nightK);
    }
    if (fxMod) { try { fxMod.update(dt, view); } catch (e) { if (!update.warned) { update.warned = true; console.warn('[render] fx update error:', e); } } }
    for (const h of hooks) h(dt, view, time);
    const tg = rig.getTarget();
    lights.setView(tg.x, tg.y, rig.visibleWidth * 0.9);
    lights.finalize(time);
    sprites.end(); particles.flush();
    sprites.setRim(settings.rim);
    clutter.enabled = settings.clutter; clutter.setRim(settings.rim); clutter.update(cam, tg.x, tg.y, rig.visibleWidth, rig.visibleHeight);

    terrain.update(cam, rig.snap ? 999 : 6);
    shadow.setEnabled(settings.shadows);
    shadow.renderPoint(scene, lights.shadowLight);
    shadow.render(scene, tg.x, heightAt(tg.x, tg.y), -tg.y, Math.max(rig.visibleWidth * 0.75, rig.visibleHeight * 1.15));
    post.render(scene, cam, time, nightK, outW, outH);
    drawBars(view);
    overlay.draw(dt);
    stats.cpuMs = performance.now() - t0; stats.lights = lights.count; stats.chunks = terrain.stats.drawn; stats.tris = terrain.stats.tris + buildings.stats.tris + trees3d.stats.tris + clutter.stats.tris; stats.props3d = buildings.stats.draws + trees3d.stats.draws;
    stats.sprites = sprites.count; stats.units = actors.state.unitsDrawn; stats.trees = actors.state.treesDrawn; stats.spawned = particles.spawned; stats.fogMs = fog.state.castMs; stats.shadowMs = shadow.state.ms;
  }

  const api = {
    resize(w, h) { cssW = Math.max(2, w | 0); cssH = Math.max(2, h | 0); applySize(); fitRT(true); },
    setTarget(x, y) { rig.setTarget(x, y, false); },
    snapTarget(x, y) { rig.setTarget(x, y, true); },
    zoom(delta) { rig.zoom(delta); },
    getTarget() { return rig.getTarget(); },
    update,
    fx(events) {
      if (!events) return;
      for (const ev of events) {
        builtinFx(ev);
        if (fxMod) safeFx(ev); else if (fxLoader) { if (fxQueue.length < 256) fxQueue.push(ev); }
      }
    },
    pick(sx, sy) {
      const g = groundRay(sx, sy);
      const p = pickSprite(sx, sy);
      const r = { x: g.x, y: g.y, unitId: p.unit ? p.unit.id : null };
      if (p.unit) { r.x = p.unit.x; r.y = p.unit.y; }
      if (!p.unit && p.tree) r.tree = p.tree.tree;
      return r;
    },
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
    },
    minimapCanvas: () => terrain.minimapCanvas(),
    /** explored/visible tile grids for the minimap (row-major, 368x368, row 0 = north) */
    fogGrid: () => ({ w: map.w, h: map.h, visible: fog.vis, explored: fog.explored }),
    // internals for the sandbox / tests
    gl, scene, rig, uniforms, shadow, clutter, lights, terrain, post, atlas, stats, settings, sprites, actors, fog, particles, overlay,
    get camera() { return rig.camera; },
    get fxModule() { return fxMod; },
    get night() { return nightK; },
    dispose() { post.dispose(); terrain.dispose(); sprites.dispose(); particles.dispose(); overlay.dispose(); fog.dispose(); gl.dispose(); },
  };
  applySize(); fitRT(true);
  return api;
}
