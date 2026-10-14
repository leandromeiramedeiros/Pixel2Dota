// Turns the game view into draw instances: sprites for units (heroes / creeps / summons); 3D instanced meshes (buildings3d.js / trees3d.js)
// for sim buildings, static map entities, trees (+ stumps); ground decals (blob shadows, selection rings), hit flash, animation selection,
// per-unit lights and walking dust.
import * as THREE from 'three';
import { getMap, heightAt, sideOf } from '../../../shared/map.js';
import { ST } from '../../../shared/protocol.js';
import { tintFor } from './placeholders.js';
import { hash01 } from './mesh3d.js';
import { INFO as BINFO } from './buildings3d.js';
import { STUMP } from './trees3d.js';

const TEAM_COL = [[0.35, 0.95, 0.4], [0.98, 0.32, 0.26]];
const BUILDING_KINDS = new Set(['tower', 'rax', 'ancient', 'fountain', 'building']);
const SEL_COL = [0.55, 1, 0.55], HOVER_COL = [1, 0.3, 0.25];
const ANIM_FPS = { idle: 3, walk: 9, attack: 12, cast: 10, stunned: 4, channel: 6, dead: 8, death: 8 };

export function dirOf(facing) {
  const c = Math.cos(facing), s = Math.sin(facing);
  if (Math.abs(c) >= 0.7 * Math.abs(s)) return c >= 0 ? 'e' : 'w';
  return s > 0 ? 'n' : 's';
}

/** Which sheet / key prefix a unit uses. Returns { sheet, prefix, kind } where kind is 'unit' | 'building'. */
export function appearance(u, atlas) {
  const key = u.key || '';
  const t = u.team === 1 ? 'd' : 'r';
  if (u.kind === 'hero') {
    const short = key.replace(/^npc_dota_hero_/, '');
    return atlas.hasSheet(short) ? { sheet: short, prefix: '', kind: 'unit' } : { sheet: 'ph_unit', prefix: '', kind: 'unit', ph: true };
  }
  if (u.kind === 'creep') {
    const type = /siege/.test(key) ? 'siege' : /ranged|range/.test(key) ? 'ranged' : 'melee';
    const side = u.team === 2 ? 'd' : t;
    return atlas.hasSheet('creeps') ? { sheet: 'creeps', prefix: `creep_${type}_${side}_`, kind: 'unit' } : { sheet: 'ph_unit', prefix: '', kind: 'unit', ph: true };
  }
  if (BUILDING_KINDS.has(u.kind)) {
    let base = 'tower';
    if (u.kind === 'rax' || /rax|barracks/.test(key)) base = /range/.test(key) ? 'rax_ranged' : 'rax_melee';
    else if (u.kind === 'ancient' || /fort/.test(key)) base = 'ancient';
    else if (u.kind === 'fountain' || /fountain/.test(key)) base = 'fountain';
    return { sheet: 'buildings', base: `${base}_${t}`, kind: 'building' };
  }
  return { sheet: 'ph_unit', prefix: '', kind: 'unit', ph: true };
}

function entTeam(name) { return /bad|dire/.test(name || '') ? 'd' : 'r'; }

/** 3D building type for a sim unit / map entity key */
function buildingType(u) {
  const key = u.key || '';
  if (u.kind === 'tower') return 'tower';
  if (u.kind === 'rax' || /rax|barracks/.test(key)) return 'barracks';
  if (u.kind === 'ancient' || /fort/.test(key)) return 'fort';
  if (u.kind === 'fountain' || /fountain/.test(key)) return 'fountain';
  return 'filler';
}

export function createActors({ sprites, atlas, uniforms, lights, fog, particles, camera, buildings, trees: trees3d }) {
  const map = getMap();
  const per = new Map();            // unit id -> { hp, flash, frame, dust, lastDir }
  const picks = [];                 // pickable sprites drawn this frame
  const state = { selected: '', hover: '', myTeam: 0, myHero: '', simBuildings: false, simSeen: 0, frame: 0, treesDrawn: 0, unitsDrawn: 0, outlines: true };

  // tree spatial grid (512u cells)
  const TREE_CELL = 512, TREE_SCALE = 0.9;
  const gx0 = map.x0, gy1 = map.y1;
  const GW = Math.ceil((map.w * map.tile) / TREE_CELL), GH = Math.ceil((map.h * map.tile) / TREE_CELL);
  const grid = Array.from({ length: GW * GH }, () => []);
  const treeVar = new Uint8Array(map.trees.length), treeSide = new Uint8Array(map.trees.length);
  const treeYaw = new Float32Array(map.trees.length), treeJit = new Float32Array(map.trees.length);
  map.trees.forEach((t, i) => {
    const gx = Math.floor((t[0] - gx0) / TREE_CELL), gy = Math.floor((gy1 - t[1]) / TREE_CELL);
    if (gx >= 0 && gy >= 0 && gx < GW && gy < GH) grid[gy * GW + gx].push(i);
    let h = i * 2654435761 >>> 0; h ^= h >>> 13;
    const nm = t[3] || '';
    const family = /pine|cine|bamboo/.test(nm) ? 0 : 1;
    treeVar[i] = family * 2 + (h & 1);
    treeYaw[i] = hash01(i * 3 + 1) * Math.PI * 2; treeJit[i] = 0.92 + 0.16 * hash01(i * 5 + 2);
    treeSide[i] = /dire/.test(nm) ? 1 : /pine|oak|cine|bamboo/.test(nm) ? 0 : sideOf(t[0], t[1]);
  });
  const cellBoxes = grid.map((_, ci) => {
    const gx = ci % GW, gy = (ci / GW) | 0;
    const x0 = gx0 + gx * TREE_CELL, zN = -(gy1 - gy * TREE_CELL);
    return new THREE.Box3(new THREE.Vector3(x0 - 260, -40, zN - 260), new THREE.Vector3(x0 + TREE_CELL + 260, 1150, zN + TREE_CELL + 260));
  });
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), _sph = new THREE.Sphere();
  const inView = (x, y, z, R) => { _sph.center.set(x, z + R, -y); _sph.radius = R * 3; return frustum.intersectsSphere(_sph); };

  const ents = [];
  for (const kind of ['tower', 'barracks', 'fort', 'fountain', 'shop', 'lantern', 'filler']) for (const e of map.ents[kind] || []) ents.push({ kind, x: e.x, y: e.y, name: e.name || '', z: heightAt(e.x, e.y) });

  const h4 = [0, 0, 0, 0];
  function decalHeights(x, y, r) {
    h4[0] = heightAt(x - r, y + r); h4[1] = heightAt(x + r, y + r); h4[2] = heightAt(x - r, y - r); h4[3] = heightAt(x + r, y - r);
    return h4;
  }

  function stOf(id) { let s = per.get(id); if (!s) { s = { hp: -1, flash: 0, dust: 0, seen: 0, deadT: 0 }; per.set(id, s); } return s; }

  /** Frame for a unit. */
  function unitFrame(u, ap, dir, t, sc) {
    let anim = u.anim || 'idle';
    const dead = (u.status & ST.DEAD) || anim === 'dead' || u.hp <= 0;
    if (dead) anim = 'death'; else if (u.status & ST.STUN) anim = 'stunned'; else if (anim === 'channel') anim = 'cast';
    const rate = u.animRate > 0 ? u.animRate : 1;
    const fps = (ANIM_FPS[anim] || 6) * (anim === 'walk' || anim === 'idle' ? 1 : rate);
    const loop = anim === 'idle' || anim === 'walk' || anim === 'stunned';
    const idx = Math.floor((u.animTime || 0) * fps * (anim === 'walk' ? rate : 1));
    const f = atlas.resolve(ap.sheet, anim, dir, idx, ap.prefix || '', !loop);
    sc.dead = dead; sc.anim = anim;
    return f;
  }

  function seq(base, t) { const n = atlas.seqCount('buildings', base); return n ? atlas.frame('buildings', base + '_' + (Math.floor(t) % n)) : null; }

  function addPick(id, x, y, z, f, scale, tree) { picks.push({ id, x, y, z, f, scale, tree }); }

  return {
    state, picks, per, buildings, trees: trees3d,
    setSelected(id) { state.selected = id || ''; },
    setHover(id) { state.hover = id || ''; },
    setMyTeam(t) { state.myTeam = t; },
    flash(id, amount = 1) { const s = per.get(id); if (s) s.flash = Math.max(s.flash, amount); },
    visibleAt(u) { return fog ? fog.isVisible(u.x, u.y) : true; },

    /** Fill the sprite + decal buffers for this frame. */
    draw(view, dt, night, time, opts) {
      state.frame++;
      picks.length = 0;
      const myTeam = view.myTeam != null ? view.myTeam : state.myTeam;
      const emitK = 1 + 0.7 * night;
      let nUnits = 0;
      const frame = {};

      // ---- trees --------------------------------------------------------------------------------------------------------------
      const cam = camera;
      pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); frustum.setFromProjectionMatrix(pv);
      const down = view.treesDown || null;
      let nTrees = 0;
      const trees = map.trees;
      trees3d.begin(); buildings.begin();
      for (let ci = 0; ci < grid.length; ci++) {
        const cell = grid[ci]; if (!cell.length || !frustum.intersectsBox(cellBoxes[ci])) continue;
        for (let k = 0; k < cell.length; k++) {
          const i = cell[k], t = trees[i];
          const cut = down && down.has(i);
          const v = cut ? STUMP : treeVar[i];
          const z = heightAt(t[0], t[1]);
          // trainer draws trees ~1.35x our sheet size; keep the real model scale so canopies close up like Dota's
          const sc = (cut ? 1 : TREE_SCALE * Math.max(0.8, t[2] || 1)) * treeJit[i];
          if (!trees3d.add(v, t[0], t[1], z, treeSide[i], sc, treeYaw[i], (i * 0.618) % 6.2832)) continue;
          addPick(null, t[0], t[1], z, trees3d.frame(v), sc, i);
          nTrees++;
        }
      }
      state.treesDrawn = nTrees;
      trees3d.setRim(!opts || opts.rim !== false); trees3d.end();
      buildings.setRim(!opts || opts.rim !== false);

      // ---- static map entities -------------------------------------------------------------------------------------------------
      let simB = false;
      const units = view.units || [];
      const list = Array.isArray(units) ? units : Array.from(units);
      for (const u of list) if (BUILDING_KINDS.has(u.kind)) { simB = true; break; }
      if (simB) state.simSeen = state.frame; else if (state.frame - state.simSeen > 120) { /* fall back to map ents */ }
      state.simBuildings = state.frame - state.simSeen < 120;
      for (const e of ents) {
        const isStatic = e.kind === 'shop' || e.kind === 'filler' || e.kind === 'lantern';
        if (!isStatic && state.simBuildings) continue;
        if (!fog.isExplored(e.x, e.y) && !isStatic) continue;
        const side = entTeam(e.name || (e.x + e.y < 0 ? 'good' : 'bad'));
        const bt = e.kind === 'barracks' ? 'barracks' : e.kind;
        const tm = e.kind === 'shop' ? (e.x + e.y < 0 ? 0 : 1) : side === 'd' ? 1 : 0;
        const yaw = e.kind === 'filler' ? (hash01((e.x | 0) * 31 + (e.y | 0)) - 0.5) * 0.9 : 0;
        if (inView(e.x, e.y, e.z, BINFO[bt].R)) buildings.add(bt, e.x, e.y, e.z, { team: tm, yaw, scale: e.kind === 'filler' ? 0.85 + 0.3 * hash01((e.x | 0) + 7) : 1 });
        if (e.kind !== 'lantern') { const R = BINFO[bt].R; sprites.decal(e.x, e.y, R * 1.25, 0, 0, 0, 0, 0.5, decalHeights(e.x, e.y, R), false, 0.62); }
        if (e.kind === 'lantern') lights.add({ x: e.x, y: e.y, z: e.z + 150, r: 1, g: 0.62, b: 0.28, radius: 260, intensity: 0.55 + 0.35 * night, flicker: 0.25 });
        else if (e.kind === 'fountain') lights.add({ x: e.x, y: e.y, z: e.z + 150, r: 0.45, g: 0.85, b: 1, radius: 620, intensity: 0.9, flicker: 0.1 });
        else if (e.kind === 'tower') lights.add({ x: e.x, y: e.y - 130, z: e.z + 260, r: side === 'r' ? 1 : 1, g: side === 'r' ? 0.8 : 0.45, b: side === 'r' ? 0.45 : 0.3, radius: 420, intensity: 0.7 + 0.5 * night, flicker: 0.2 });
        else if (e.kind === 'fort') lights.add({ x: e.x, y: e.y - 200, z: e.z + 300, r: side === 'r' ? 0.7 : 1, g: side === 'r' ? 1 : 0.5, b: side === 'r' ? 0.6 : 0.4, radius: 560, intensity: 0.8 + 0.5 * night, flicker: 0.12 });
        else if (e.kind === 'barracks') lights.add({ x: e.x, y: e.y - 150, z: e.z + 170, r: 1, g: 0.7, b: 0.4, radius: 260, intensity: 0.4 + 0.4 * night, flicker: 0.25 });
      }

      // ---- units ---------------------------------------------------------------------------------------------------------------
      // draw back-to-front is not needed (depth buffer), but keep a stable order for equal feet
      const nowF = state.frame;
      for (const u of list) {
        const id = u.id;
        const st = stOf(id); st.seen = nowF;
        const building = BUILDING_KINDS.has(u.kind);
        const mine = u.team === myTeam;
        let visible = mine || (fog ? fog.isVisible(u.x, u.y) : true);
        if (!mine && (u.status & ST.INVIS) && !(u.status & ST.REVEALED)) visible = false;
        if (!mine && u.team !== 2 && building && fog && fog.isExplored(u.x, u.y)) visible = true;   // remembered structures
        if (u.hp <= 0 && !building && (u.status & ST.DEAD) && st.deadT > 2.2) visible = false;
        if ((u.status & ST.DEAD) || u.hp <= 0) st.deadT += dt; else st.deadT = 0;
        u.visible = visible;
        // hit flash from hp drops
        if (st.hp >= 0 && u.hp < st.hp - 0.5) st.flash = Math.max(st.flash, 1);
        st.hp = u.hp;
        st.flash = Math.max(0, st.flash - dt / 0.14);
        if (!visible) continue;

        const z = u.z != null ? u.z : heightAt(u.x, u.y);
        const ap = appearance(u, atlas);
        const dead = (u.status & ST.DEAD) || u.anim === 'dead' || u.hp <= 0;
        let f, flipScale = 1;
        const tint = [1, 1, 1];
        let alpha = 1, rim = 1, emit = emitK;
        let bType = null;
        if (ap.kind === 'building') {
          bType = buildingType(u);
          f = buildings.frame(bType);
          if (st.collapse == null) st.collapse = dead ? 1 : 0;           // buildings already destroyed when first seen stay rubble
          st.collapse = dead ? Math.min(1, st.collapse + dt / 1.1) : Math.max(0, st.collapse - dt * 2);
        } else {
          const dir = dirOf(u.facing || 0);
          const sc = {};
          f = unitFrame(u, ap, dir, time, sc);
          if (!f) continue;
          if (ap.ph) { const tc = tintFor(u.key || 'x'); tint[0] = tc[0]; tint[1] = tc[1]; tint[2] = tc[2]; }
          if (dead) {
            // no death frames: sink + fade (Bayer dissolve)
            const hasDeath = atlas.frameCount(ap.sheet, 'death', dir, ap.prefix || '') > 0 && sc.anim === 'death' && /death/.test(f.key);
            alpha = Math.max(0, 1 - Math.max(0, st.deadT - (hasDeath ? 1.2 : 0.2)) / 0.9);
            if (!hasDeath) { tint[0] *= 0.45; tint[1] *= 0.45; tint[2] *= 0.45; }
            rim = 0.3;
          }
          if (u.status & ST.INVIS) alpha = Math.min(alpha, 0.45);
          if (u.status & ST.HEX) { tint[0] *= 0.6; tint[1] *= 1.3; tint[2] *= 0.6; }
          // walking dust
          if (u.anim === 'walk' && !dead && particles) {
            st.dust -= dt;
            if (st.dust <= 0) {
              st.dust = u.kind === 'hero' ? 0.16 : 0.26;
              particles.burst({ x: u.x - Math.cos(u.facing || 0) * 10, y: u.y - Math.sin(u.facing || 0) * 10, z: z + 3, count: 1, life: [0.35, 0.6], size0: 7, size1: 16, col0: [0.34, 0.3, 0.24], col1: [0.22, 0.2, 0.17], a0: 0.55, a1: 0, speed: [6, 14], flat: true, drag: 2.5, up: 10, mode: 'glow', noScale: false });
            }
          }
        }
        const mineHero = id === state.myHero || id === view.myHeroId;
        let outline = null;
        const isSel = id === state.selected, isHover = id === state.hover;
        if (isSel) outline = [SEL_COL[0], SEL_COL[1], SEL_COL[2], 1];
        else if (isHover && !mine) outline = [HOVER_COL[0], HOVER_COL[1], HOVER_COL[2], 1];
        else if (state.outlines && u.kind === 'hero' && !dead) { const c = TEAM_COL[u.team === 1 ? 1 : 0]; outline = [c[0] * 0.75, c[1] * 0.75, c[2] * 0.75, 1]; }
        const bR = bType ? BINFO[bType].R : 0;
        if (bType) { if (inView(u.x, u.y, z, bR)) buildings.add(bType, u.x, u.y, z, { team: u.team === 1 ? 1 : 0, hp: u.maxHp > 0 ? Math.max(0, Math.min(1, u.hp / u.maxHp)) : 1, destroyed: st.collapse, flash: st.flash * 0.85, hi: outline, phase: (u.x * 0.013 + u.y * 0.007) % 6.28 }); }
        else sprites.sprite(u.x, u.y, z, f, { tint, flash: st.flash * 0.85, outline, alpha, rim, emit, scale: 1 });
        if (alpha > 0.1) {
          // shadow + selection ring
          const sr = Math.max(14, bType ? bR * 1.25 : f.w * 2.2);
          sprites.decal(u.x, u.y, sr, 0, 0, 0, 0, dead ? 0.25 : 0.5, decalHeights(u.x, u.y, sr), false, 0.6);
          if (isSel || mineHero || (isHover && !mine)) {
            const rr = Math.max(26, bType ? bR * 1.35 : f.w * 3.4);
            const c = isHover && !mine ? HOVER_COL : mine ? SEL_COL : HOVER_COL;
            sprites.decal(u.x, u.y, rr, 1, c[0], c[1], c[2], isSel ? 1 : 0.7, decalHeights(u.x, u.y, rr), isSel, 0.6);
          }
        }
        if (!bType || !dead) addPick(id, u.x, u.y, z, f, 1, -1);
        nUnits++;
        // lights
        if (!dead) {
          if (u.kind === 'hero') lights.add({ x: u.x, y: u.y, z: z + 50, r: u.team === 1 ? 1 : 0.9, g: u.team === 1 ? 0.55 : 0.95, b: u.team === 1 ? 0.45 : 0.7, radius: 200, intensity: 0.25 + 0.35 * night + (mineHero ? 0.15 : 0) });
          else if (ap.kind === 'building') {
            if (u.kind === 'tower') lights.add({ x: u.x, y: u.y - 130, z: z + 260, r: 1, g: u.team === 1 ? 0.45 : 0.8, b: u.team === 1 ? 0.3 : 0.45, radius: 440, intensity: 0.7 + 0.5 * night, flicker: 0.2 });
            else if (u.kind === 'fountain') lights.add({ x: u.x, y: u.y, z: z + 150, r: 0.45, g: 0.85, b: 1, radius: 640, intensity: 0.9, flicker: 0.1 });
            else if (u.kind === 'ancient') lights.add({ x: u.x, y: u.y - 200, z: z + 300, r: u.team === 1 ? 1 : 0.7, g: u.team === 1 ? 0.5 : 1, b: u.team === 1 ? 0.4 : 0.6, radius: 580, intensity: 0.8 + 0.5 * night, flicker: 0.12 });
            else lights.add({ x: u.x, y: u.y - 150, z: z + 170, r: 1, g: 0.7, b: 0.4, radius: 270, intensity: 0.4 + 0.4 * night, flicker: 0.25 });
          }
        }
      }
      buildings.end();
      state.unitsDrawn = nUnits;
      // forget units that vanished
      if ((state.frame & 127) === 0) for (const [id, s] of per) if (state.frame - s.seen > 256) per.delete(id);
    },
  };
}
