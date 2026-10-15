// Private visual reference of a Dota 2 unit from the LOCAL game files (like looking at the wiki). NEVER commit, copy, import or voxelize it.
//   node tools/vox/ref.mjs <short|npc key|all|heroes|creeps|neutrals|bosses|couriers|wards|buildings|list>     (npm run vox:ref -- lina)
// Resolves the unit from the game KV (every hero, lane creep, neutral, Roshan, courier, ward, building), picks the sequences the game plays for
// idle / run / attack / cast / ult / stunned / death (ACT_DOTA_* in the model's ASEQ block), exports them with Source2Viewer-CLI (tools/.cache/s2v/bin,
// cached in tools/.cache/ref/_export/) and renders with a CPU rasterizer (tools/vox/lib/raster.mjs), all into the gitignored tools/.cache/ref/<short>/:
//   sheet.png   compact overview: the 5 views (idle) + one frame per anim + palette      (read this first)
//   views.png   the 5 views (front, 3/4, side, back, top) of the idle at full size
//   poses.png   rows = anims, cols = 4 frames over the sequence, from the game-like 3/4 camera (read when building ANIMS)
//   front|q34|side|back|top.png, ref.json (model, size, palette, materials, bands, anims: available sequences + chosen ones)
// Deterministic: same input -> same bytes. DOTA_DIR overrides the install path.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from '../art/png.mjs';
import { Canvas } from '../art/vox.mjs';
import { loadGlb, scene, animDuration } from './lib/glb.mjs';
import { render, bounds, sampleAlbedo } from './lib/raster.mjs';
import { drawText } from './lib/font.mjs';
import { CACHE, KINDS, RefError, gameUnits, resolveUnit, exportModel, sequences, pickAnims } from './lib/dota.mjs';

export const VIEWS = [['front', 0, 8], ['q34', 35, 14], ['side', 90, 8], ['back', 180, 8], ['top', 35, 60]];   // name, yaw, pitch (deg above horizon)
export const POSE_CAM = [28, 30];   // yaw, pitch: the in-game lean (same camera as tools/vox/shot.mjs rows)
export const FRAMES = 4;
const S = 288, PS = 176, BG = [28, 32, 48];
const hex2 = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

/** Weighted RGB samples -> up to n clusters [{ hex, share }] (greedy, deterministic: 4-bit bins, heaviest first, merged within `tol`). */
export function palette(samples, n = 3, tol = 52) {
  const bins = new Map(); let tot = 0;
  for (const [r, g, b, w = 1] of samples) {
    const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4), e = bins.get(k) || [0, 0, 0, 0];
    e[0] += r * w; e[1] += g * w; e[2] += b * w; e[3] += w; bins.set(k, e); tot += w;
  }
  const order = [...bins.entries()].sort((a, b) => b[1][3] - a[1][3] || a[0] - b[0]), cl = [];
  for (const [, e] of order) {
    const m = [e[0] / e[3], e[1] / e[3], e[2] / e[3]];
    const c = cl.find(q => Math.hypot(q.m[0] - m[0], q.m[1] - m[1], q.m[2] - m[2]) < tol);
    if (c) { c.s = [c.s[0] + e[0], c.s[1] + e[1], c.s[2] + e[2]]; c.w += e[3]; c.m = [c.s[0] / c.w, c.s[1] / c.w, c.s[2] / c.w]; }
    else if (cl.length < 24) cl.push({ s: [e[0], e[1], e[2]], w: e[3], m });
  }
  cl.sort((a, b) => b.w - a.w);
  return cl.slice(0, n).map(c => ({ hex: hex2(c.m), share: Math.round(1000 * c.w / tot) / 10 }));
}
const fmt = p => p.map(c => `${c.hex} ${c.share}%`);
/** Paste a rendered view (opaque, S x S) into a canvas. */
function paste(C, r, x0, y0) {
  for (let y = 0; y < r.H; y++) for (let x = 0; x < r.W; x++) { const i = (y * r.W + x) * 4, j = ((y0 + y) * C.W + x0 + x) * 4; C.px[j] = r.rgba[i]; C.px[j + 1] = r.rgba[i + 1]; C.px[j + 2] = r.rgba[i + 2]; C.px[j + 3] = 255; }
}
const clip = (s, n) => s.length > n ? s.slice(0, n - 1) + '~' : s;

export function buildRef(arg) {
  const T = { t0: performance.now() }, u = resolveUnit(arg);
  const dir = path.join(CACHE, u.short), sc = u.scale;
  // ---- sequences the game plays -> glb animation indices
  const seqs = sequences(u.model), picks = pickAnims(seqs);
  const main = loadGlb(exportModel(u.model, Object.values(picks).map(p => p.seq)));
  const idxOf = new Map(); (main.json.animations || []).forEach((a, i) => { if (!idxOf.has(a.name)) idxOf.set(a.name, i); });
  const roles = Object.entries(picks).filter(([, p]) => idxOf.has(p.seq)).map(([role, p]) => ({ role, ...p, anim: idxOf.get(p.seq), dur: animDuration(main, idxOf.get(p.seq)) }));
  const idle = roles.find(r => r.role === 'idle'), missing = [];
  const wg = [];
  for (const w of u.wearables) { try { wg.push(loadGlb(exportModel(w))); } catch (e) { missing.push(w + ' (' + e.message + ')'); } }
  /** All primitives of the unit (body + wearables following its skeleton) at time t of animation `anim` (null: bind pose). */
  const pose = (anim, t = 0) => {
    const ms = scene(main, { anim, t }), prims = [...ms.prims];
    for (const g of wg) prims.push(...scene(g, { boneWorld: anim == null ? null : ms.bones }).prims);
    return prims;
  };
  const prims = pose(idle ? idle.anim : null, 0);
  if (!prims.length) throw new RefError(`${u.short}: model has no triangles`);
  T.load = performance.now();
  const { mn, mx } = bounds(prims), sz = [0, 1, 2].map(k => mx[k] - mn[k]), center = mn.map((v, k) => (v + mx[k]) / 2);
  const scale = S / (Math.max(sz[2], Math.hypot(sz[0], sz[1])) * 1.12);

  // ---- palette: whole, per material, per height band (feet -> head)
  const all = [], byMat = new Map(), NB = 8, band = Array.from({ length: NB }, () => []);
  sampleAlbedo(prims, 60000, (r, g, b, x, y, z, P) => {
    const s = [r, g, b, 1]; all.push(s);
    const mk = P.mat.name; (byMat.get(mk) || byMat.set(mk, []).get(mk)).push(s);
    band[Math.min(NB - 1, Math.max(0, Math.floor((z - mn[2]) / sz[2] * NB)))].push(s);
  });
  const bands = band.map((b, i) => {
    // silhouette width (y) and depth (x) of the vertices inside the band
    let a0 = 1e30, a1 = -1e30, d0 = 1e30, d1 = -1e30;
    const lo = mn[2] + sz[2] * i / NB, hi = mn[2] + sz[2] * (i + 1) / NB;
    for (const P of prims) for (let k = 0; k < P.pos.length; k += 3) { const z = P.pos[k + 2]; if (z < lo || z > hi) continue; a0 = Math.min(a0, P.pos[k + 1]); a1 = Math.max(a1, P.pos[k + 1]); d0 = Math.min(d0, P.pos[k]); d1 = Math.max(d1, P.pos[k]); }
    return { fromFeet: [i / NB, (i + 1) / NB].map(v => Math.round(v * 100) / 100), width: a1 > a0 ? Math.round((a1 - a0) * sc) : 0, depth: d1 > d0 ? Math.round((d1 - d0) * sc) : 0, colors: fmt(palette(b, 3)) };
  }).reverse();   // head first
  const mats = [...byMat.entries()].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1)).slice(0, 10)
    .map(([name, s]) => ({ name, share: Math.round(1000 * s.length / all.length) / 10, colors: fmt(palette(s, 3)) }));
  const pal = palette(all, 8, 44);
  const tris = prims.reduce((n, P) => n + P.idx.length / 3, 0);

  // ---- poses: FRAMES evenly spaced times per role (loops: k/N of the cycle, one-shots: first to last), one fixed camera for the whole unit
  const frames = roles.map(r => {
    const n = r.dur > 0 ? FRAMES : 1, times = Array.from({ length: n }, (_, k) => +(r.dur * (r.loop ? k / n : n > 1 ? k / (n - 1) : 0)).toFixed(3));
    return { ...r, times, prims: times.map(t => pose(r.anim, t)) };
  });
  const cam = [...frames.flatMap(f => f.prims.flat()), ...prims];
  let pb = bounds(cam); const pz = [0, 1, 2].map(k => pb.mx[k] - pb.mn[k]);
  const pcenter = pb.mn.map((v, k) => (v + pb.mx[k]) / 2), pidle = PS / (Math.max(sz[2], Math.hypot(sz[0], sz[1])) * 1.12);
  const pscale = Math.max(PS / (Math.max(pz[2], Math.hypot(pz[0], pz[1])) * 1.12), pidle * 0.6);   // a far-flung pose may crop rather than shrink everything
  const shoot = ps => render(ps, { yaw: POSE_CAM[0], pitch: POSE_CAM[1], S: PS, scale: pscale, center: pcenter, bg: BG });
  frames.forEach(f => { f.img = f.prims.map(shoot); delete f.prims; });

  const info = {
    unit: u.key, short: u.short, kind: u.kind, model: u.model, wearables: u.wearables, wearablesMissing: missing, pose: idle ? `idle (${idle.seq}, first frame)` : 'bind', modelScale: u.scale, tris,
    size: { height: +(sz[2] * sc).toFixed(1), width: +(sz[1] * sc).toFixed(1), depth: +(sz[0] * sc).toFixed(1), note: 'game units (model units x ModelScale); width = left-right, depth = front-back; Dota facing +x' },
    voxelHint: { heightAt4_2: +(sz[2] * sc / 4.2).toFixed(1), note: 'height in 4.2-unit character voxels if drawn to true scale; chibify (docs/VOXEL.md grids)' },
    palette: fmt(pal), materials: mats, bands: { note: 'head first; fromFeet = fraction of height; width/depth in game units', rows: bands },
    views: VIEWS.map(([n, yaw, pitch]) => ({ n, yaw, pitch })),
    anims: {
      note: `poses.png: rows = roles, cols = ${FRAMES} frames over the sequence (loops: k/N of the cycle; one-shots: first to last), camera yaw ${POSE_CAM[0]} pitch ${POSE_CAM[1]}; role -> game sequence (activity)`,
      roles: Object.fromEntries(frames.map(f => [f.role, { seq: f.seq, act: f.act, loop: f.loop, duration: +f.dur.toFixed(3), times: f.times }])),
      available: seqs.filter(q => !q.name.startsWith('@')).map(q => q.name + (q.acts.length ? ' ' + q.acts.join('+') : '') + (q.mods.length ? ' [' + q.mods.join(',') + ']' : '')),
    },
  };

  // ---- views.png, poses.png, sheet.png
  fs.mkdirSync(dir, { recursive: true });
  const shots = VIEWS.map(([n, yaw, pitch]) => [n, render(prims, { yaw, pitch, S, scale, center, bg: BG })]);
  const M = 8, HEAD = 22, title = `${u.short.toUpperCase()}  ${u.kind}  H ${info.size.height}  W ${info.size.width}  D ${info.size.depth}  SCALE ${u.scale}  ${info.pose.split(' ')[0]}  REF ONLY NEVER COMMIT`;
  const V = new Canvas(M + VIEWS.length * (S + M), HEAD + S + M, '#1c2030');
  shots.forEach(([n, r], k) => {
    fs.writeFileSync(path.join(dir, n + '.png'), encodePng(r.W, r.H, new Uint8ClampedArray(r.rgba)));
    paste(V, r, M + k * (S + M), HEAD); drawText(V, M + k * (S + M) + 2, HEAD + S - 8, `${n} ${VIEWS[k][1]}/${VIEWS[k][2]}`, '#8892b0', 1);
  });
  drawText(V, M, 6, title, '#e0e6ff', 1);
  fs.writeFileSync(path.join(dir, 'views.png'), encodePng(V.W, V.H, V.px));

  const LW = 96, hasPoses = frames.length > 0, PC = hasPoses ? new Canvas(LW + FRAMES * (PS + 4) + M, HEAD + frames.length * (PS + 6) + M, '#1c2030') : null;
  if (hasPoses) {
    drawText(PC, M, 6, `${u.short.toUpperCase()}  POSES  yaw ${POSE_CAM[0]} pitch ${POSE_CAM[1]}  ${FRAMES} frames per anim  REF ONLY NEVER COMMIT`, '#e0e6ff', 1);
    frames.forEach((f, i) => {
      const y = HEAD + i * (PS + 6);
      drawText(PC, M, y + 4, f.role.toUpperCase(), '#e0e6ff', 1); drawText(PC, M, y + 14, clip(f.seq, 22), '#8892b0', 1);
      drawText(PC, M, y + 22, clip(f.act.replace('ACT_DOTA_', ''), 22), '#6a7290', 1); drawText(PC, M, y + 30, f.dur.toFixed(2) + ' S' + (f.loop ? ' LOOP' : ''), '#6a7290', 1);
      f.img.forEach((r, k) => { paste(PC, r, LW + k * (PS + 4), y); drawText(PC, LW + k * (PS + 4) + 2, y + PS - 8, 'T ' + f.times[k].toFixed(2), '#8892b0', 1); });
    });
    fs.writeFileSync(path.join(dir, 'poses.png'), encodePng(PC.W, PC.H, PC.px));
  } else fs.rmSync(path.join(dir, 'poses.png'), { force: true });

  const VS = 232, rowW = Math.max(VIEWS.length * (VS + M), frames.length * (PS + M), 8 * 100) + M;
  const C = new Canvas(rowW, HEAD + VS + 8 + (hasPoses ? PS + 8 : 0) + 40, '#1c2030');
  drawText(C, M, 6, title, '#e0e6ff', 1);
  VIEWS.forEach(([n, yaw, pitch], k) => {
    paste(C, render(prims, { yaw, pitch, S: VS, scale: scale * VS / S, center, bg: BG }), M + k * (VS + M), HEAD); drawText(C, M + k * (VS + M) + 2, HEAD + VS - 8, `${n} ${yaw}/${pitch}`, '#8892b0', 1);
  });
  frames.forEach((f, k) => {
    const x = M + k * (PS + M), y = HEAD + VS + 8, fi = f.role === 'death' ? f.img.length - 1 : Math.min(1, f.img.length - 1);
    paste(C, f.img[fi], x, y); drawText(C, x + 2, y + 2, f.role.toUpperCase(), '#e0e6ff', 1); drawText(C, x + 2, y + PS - 8, clip(f.seq, 26), '#8892b0', 1);
  });
  pal.forEach((c, k) => {
    const x = M + k * 100, y = HEAD + VS + 8 + (hasPoses ? PS + 8 : 0) + 8; C.rect(x, y, 16, 16, c.hex); drawText(C, x + 20, y, c.hex, '#c8d0e8', 1); drawText(C, x + 20, y + 8, c.share + '%', '#8892b0', 1);
  });
  fs.writeFileSync(path.join(dir, 'sheet.png'), encodePng(C.W, C.H, C.px));
  fs.writeFileSync(path.join(dir, 'ref.json'), JSON.stringify(info, null, 1) + '\n');
  T.end = performance.now();
  return { u, dir, info, ms: { total: Math.round(T.end - T.t0), load: Math.round(T.load - T.t0), render: Math.round(T.end - T.load) } };
}

// ---- CLI
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const arg = process.argv[2];
  const GROUPS = { heroes: 'hero', creeps: 'creep', neutrals: 'neutral', bosses: 'boss', couriers: 'courier', wards: 'ward', buildings: 'building' };
  try {
    if (!arg || arg === '--help') { console.log('usage: node tools/vox/ref.mjs <short|npc_dota_key|all|heroes|creeps|neutrals|bosses|couriers|wards|buildings|list>'); process.exit(arg ? 0 : 1); }
    if (arg === 'list') {
      const set = gameUnits(), have = x => fs.existsSync(path.join(CACHE, x.short, 'sheet.png'));
      console.log(`${set.length} units: ` + KINDS.map(k => `${set.filter(x => x.kind === k).length} ${k}`).join(', '));
      for (const k of KINDS) {
        const g = set.filter(x => x.kind === k); if (!g.length) continue;
        console.log(`\n${k} (${g.length})`);
        if (k === 'hero') console.log('  ' + g.map(x => x.short + (have(x) ? '*' : '')).join(' '));
        else for (const x of g) console.log(`  ${x.short.padEnd(30)} ${x.key}${have(x) ? '  [ref]' : ''}`);
      }
      console.log('\n* / [ref] = reference already rendered');
    } else {
      const set = arg === 'all' ? gameUnits() : GROUPS[arg] ? gameUnits().filter(x => x.kind === GROUPS[arg]) : [{ short: arg }];
      const failed = []; let tot = 0, n = 0;
      for (const x of set) {
        try {
          const r = buildRef(x.key || x.short); tot += r.ms.total; n++;
          const roles = Object.keys(r.info.anims.roles);
          console.log(`${r.u.short.padEnd(30)} ${String(r.ms.total).padStart(6)} ms (load ${r.ms.load}, render ${r.ms.render})  h ${r.info.size.height}  ${r.info.pose.split(' ')[0].padEnd(4)} ${roles.length ? roles.join('/') : 'no anims'}  ${path.relative(process.cwd(), path.join(r.dir, 'sheet.png'))}${r.info.wearablesMissing.length ? '  MISSING ' + r.info.wearablesMissing.length + ' wearables' : ''}`);
        } catch (e) { if (set.length === 1) throw e; failed.push(`${x.short}: ${e.message}`); console.log(`${x.short.padEnd(30)} FAIL ${e.message}`); }
      }
      if (set.length > 1) console.log(`${n}/${set.length} ok, ${(tot / 1000).toFixed(1)} s`);
      if (failed.length) process.exitCode = 1;
    }
  } catch (e) {
    if (e instanceof RefError) { console.error('ref: ' + e.message); process.exit(1); }
    throw e;
  }
}
