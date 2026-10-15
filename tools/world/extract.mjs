// Deterministic extractor: real Dota 2 map -> shared/data/dotaworld.js (port of InvokerTrainer's dota_extract.py, no python/numpy).
//   node tools/world/extract.mjs [--s2v path/to/Source2Viewer-CLI.exe] [--dota dir] [--work dir] [--out file] [--preview dir]
// Sources inside game/dota/maps/dota.vpk (read with tools/vpk.mjs):
//   maps/dota.gnv                            gridnav: 64u cells, 1 byte each (bit0 walkable; 16 = cliff wall, 20 = outside)
//   maps/dota/entities/default_ents.vents_c  entity lump -> trees (128x128 blockers), towers, shops, camps...   (decompiled by Source2Viewer-CLI)
//   maps/dota/entities/world_layer_{radiant,dire}_base.vents_c  default-on layers: the base trees, appended after the lump's (stable indices)
//   maps/dota/world_physics.vmdl_c           collision mesh -> ground height + water surface                      (decompiled to glb)
// Decompiled intermediates are cached in tools/.cache/world/ (gitignored). Same input -> byte-identical output (LF).
// Source2Viewer-CLI (ValveResourceFormat release 20.0, cli-windows-x64.zip) lives in tools/.cache/s2v/bin/ (gitignored, never committed).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openVpk, DOTA_DIR } from '../vpk.mjs';
import { encodeGrid16, encodeBytes, GRID_NONE } from '../../shared/worldcodec.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TILE = 48, X0 = -8832, X1 = 8832, Y0 = -8832, Y1 = 8832;   // playable box (gridnav walkable bbox), multiple of 48 and 64
const TREE_HALF = 64;                                              // trees block a 128x128 square centred on their origin
const LANES = {   // lane roads through the real tower line (world coords), dirt within ROAD_HW
  top: [[-5920, -5352], [-6592, -3408], [-6501, -872], [-6336, 1856], [-6200, 5600], [-5600, 6040], [-5275, 6036], [-128, 6016], [3552, 5776], [5528, 5000]],
  mid: [[-5920, -5352], [-4640, -4144], [-3190, -2926], [-1544, -1408], [524, 652], [2496, 2112], [4272, 3759], [5528, 5000]],
  bot: [[-5920, -5352], [-3952, -6112], [-360, -6256], [4860, -6379], [5900, -6200], [6280, -5600], [6269, -2240], [6400, 384], [6336, 3032], [5528, 5000]],
};
const ROAD_HW = 190;
const BASE_LAYERS = ['world_layer_radiant_base', 'world_layer_dire_base'];   // the *_destruction layers are off by default
const KEEP = {
  tower: 'npc_dota_tower', barracks: 'npc_dota_barracks', fort: 'npc_dota_fort', filler: 'npc_dota_building',
  fountain: 'ent_dota_fountain', shop: 'ent_dota_shop', camp: 'npc_dota_neutral_spawner', outpost: 'npc_dota_watch_tower',
  lotus: 'npc_dota_lotus_pool', gate: 'npc_dota_unit_twin_gate', lantern: 'npc_dota_lantern', roshan: 'trigger_boss_attackable',
};

/** Round half to even (Python round / numpy round), so output matches the original extractor. */
export function roundHE(x) {
  const f = Math.floor(x), d = x - f;
  return d < 0.5 ? f : d > 0.5 ? f + 1 : (f % 2 === 0 ? f : f + 1);
}

function entities(txt) {
  const out = {};
  for (const b of txt.split(/^====\d+====$/m)) {
    const m = b.match(/^classname\s+"([^"]+)"/m), o = b.match(/^origin\s+\[\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)/m);
    if (!m || !o) continue;
    const e = { x: roundHE(parseFloat(o[1])), y: roundHE(parseFloat(o[2])), z: roundHE(parseFloat(o[3])) };
    for (const k of ['targetname', 'model', 'scales']) {
      const mm = b.match(new RegExp('^' + k + '\\s+(.+)$', 'm'));
      if (mm) e[k] = mm[1].trim().replace('resource_name:', '').trim().replace(/^"+|"+$/g, '').replace('[PR#]', '');
    }
    (out[m[1]] ||= []).push(e);
  }
  return out;
}

/** Triangles of the first primitive of glb mesh `name`: Float64Array of 9 per triangle (ax ay az bx by bz cx cy cz). */
function glbMesh(file, name) {
  const d = fs.readFileSync(file), jl = d.readUInt32LE(12), j = JSON.parse(d.toString('utf8', 20, 20 + jl)), base = 20 + jl + 8;
  const acc = (i) => {
    const a = j.accessors[i], bv = j.bufferViews[a.bufferView], n = { SCALAR: 1, VEC3: 3 }[a.type], off = base + (bv.byteOffset || 0) + (a.byteOffset || 0);
    const sz = a.componentType === 5123 ? 2 : 4, stride = bv.byteStride || n * sz, r = new Float64Array(a.count * n);
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) {
      const p = off + k * stride + c * sz;
      r[k * n + c] = a.componentType === 5126 ? d.readFloatLE(p) : a.componentType === 5125 ? d.readUInt32LE(p) : d.readUInt16LE(p);
    }
    return r;
  };
  const m = j.meshes.find((x) => x.name === name).primitives[0], P = acc(m.attributes.POSITION), I = acc(m.indices), T = new Float64Array(I.length * 3);
  for (let i = 0; i < I.length; i++) for (let c = 0; c < 3; c++) T[i * 3 + c] = P[I[i] * 3 + c];
  return T;
}

/** Highest surface z sampled at each tile centre (vertical faces skipped when floorOnly). -1e9 = no surface. */
function rasterTop(T, W, H, floorOnly) {
  const top = new Float64Array(W * H).fill(-1e9);
  for (let t = 0; t < T.length; t += 9) {
    const ax = T[t], ay = T[t + 1], az = T[t + 2], bx = T[t + 3], by = T[t + 4], bz = T[t + 5], cx = T[t + 6], cy = T[t + 7], cz = T[t + 8];
    if (floorOnly) {
      const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nz / (Math.sqrt(nx * nx + ny * ny + nz * nz) + 1e-9) <= 0.6) continue;
    }
    // tile (tx, ty): centre x = X0 + (tx+.5)*TILE, y = Y1 - (ty+.5)*TILE
    const tx0 = Math.ceil((Math.min(ax, bx, cx) - X0) / TILE - 0.5), tx1 = Math.floor((Math.max(ax, bx, cx) - X0) / TILE - 0.5);
    const ty0 = Math.ceil((Y1 - Math.max(ay, by, cy)) / TILE - 0.5), ty1 = Math.floor((Y1 - Math.min(ay, by, cy)) / TILE - 0.5);
    if (tx1 < tx0 || ty1 < ty0) continue;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) < 1e-9) continue;
    for (let ty = Math.max(ty0, 0); ty <= Math.min(ty1, H - 1); ty++) {
      const py = Y1 - (ty + 0.5) * TILE;
      for (let tx = Math.max(tx0, 0); tx <= Math.min(tx1, W - 1); tx++) {
        const px = X0 + (tx + 0.5) * TILE;
        const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den, l3 = 1 - l1 - l2;
        if (Math.min(l1, l2, l3) < -1e-6) continue;
        const z = l1 * az + l2 * bz + l3 * cz;
        if (z > top[ty * W + tx]) top[ty * W + tx] = z;
      }
    }
  }
  return top;
}

function segDist(px, py, pts) {
  let best = 1e9;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const t = Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / l2));
    best = Math.min(best, Math.hypot(px - (ax + dx * t), py - (ay + dy * t)));
  }
  return best;
}

function rle(s) {
  let out = '';
  for (let i = 0; i < s.length;) { let j = i; while (j < s.length && s[j] === s[i]) j++; out += s[i] + (j - i > 1 ? j - i : ''); i = j; }
  return out;
}

/** Full extraction. Returns the DOTAWORLD object plus the working arrays (for previews / analysis). */
export function extract({ s2v, dota = DOTA_DIR, work }) {
  work = work || path.join(ROOT, 'tools/.cache/world');
  const vpkFile = path.join(dota, 'game/dota/maps/dota.vpk'), vpk = openVpk(vpkFile);
  fs.mkdirSync(work, { recursive: true });
  const run = (entry, ...extra) => execFileSync(s2v, ['-i', vpkFile, '-f', entry, '-o', work, '-d', ...extra], { stdio: 'ignore' });
  const entsFile = path.join(work, 'maps/dota/entities/default_ents.vents'), glb = path.join(work, 'maps/dota/world_physics_physics.glb');
  if (!fs.existsSync(entsFile)) run('maps/dota/entities/default_ents.vents_c');
  if (!fs.existsSync(glb)) run('maps/dota/world_physics.vmdl_c', '--gltf_export_format', 'glb');
  const E = entities(fs.readFileSync(entsFile, 'utf8'));
  for (const layer of BASE_LAYERS) {   // default-on world layers (info_world_layer spawnflags 1): their trees append after the lump's
    const f = path.join(work, `maps/dota/entities/${layer}.vents`);
    if (!fs.existsSync(f)) run(`maps/dota/entities/${layer}.vents_c`);
    (E.ent_dota_tree ||= []).push(...(entities(fs.readFileSync(f, 'utf8')).ent_dota_tree || []));
  }

  const gnv = vpk.read('maps/dota.gnv');
  const edge = gnv.readFloatLE(4), gw = gnv.readUInt32LE(16), gh = gnv.readUInt32LE(20), gx0 = gnv.readInt32LE(24), gy0 = gnv.readInt32LE(28);
  if (edge !== 64) throw new Error('gridnav edge ' + edge);
  const navBytes = new Uint8Array(gnv.buffer, gnv.byteOffset + 32, gw * gh);   // row = y cell (south first), col = x cell

  const W = (X1 - X0) / TILE, H = (Y1 - Y0) / TILE, n = W * H;
  const ground = rasterTop(glbMesh(glb, 'physics_group'), W, H, true);
  const water = rasterTop(glbMesh(glb, 'physics_water_slime'), W, H, true);
  const typ = new Uint8Array(n), walk = new Uint8Array(n);
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    const px = X0 + (tx + 0.5) * TILE, py = Y1 - (ty + 0.5) * TILE, i = ty * W + tx;
    const gy = Math.min(Math.max(Math.floor(py / 64) - gy0, 0), gh - 1), gx = Math.min(Math.max(Math.floor(px / 64) - gx0, 0), gw - 1);
    walk[i] = navBytes[gy * gw + gx] & 1;
    typ[i] = walk[i] ? 0 : 2;
    if (walk[i]) {
      let road = 1e9; for (const pts of Object.values(LANES)) road = Math.min(road, segDist(px, py, pts));
      if (road < ROAD_HW) typ[i] = 4;
      if (water[i] > ground[i] + 4) typ[i] = 5;
    }
  }
  const trees = [];
  for (const t of E.ent_dota_tree || []) {
    const x0 = Math.ceil((t.x - TREE_HALF - X0) / TILE - 0.5), x1 = Math.floor((t.x + TREE_HALF - X0) / TILE - 0.5 - 1e-6);
    const y0 = Math.ceil((Y1 - t.y - TREE_HALF) / TILE - 0.5), y1 = Math.floor((Y1 - t.y + TREE_HALF) / TILE - 0.5 - 1e-6);
    for (let ty = Math.max(y0, 0); ty <= Math.min(y1, H - 1); ty++) for (let tx = Math.max(x0, 0); tx <= Math.min(x1, W - 1); tx++) typ[ty * W + tx] = 1;
    const mdl = path.basename(t.model || '').replace('.vmdl', '');
    const sc = parseFloat((t.scales || '1').replace(/^[\[\s]+|[\]\s]+$/g, '').split(',')[0]);
    trees.push([t.x, t.y, Number(sc.toFixed(2)), mdl]);
  }
  const elev = new Uint8Array(n), ramp = new Uint8Array(n), z = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    z[i] = ground[i] > -1e8 ? ground[i] : 0;
    elev[i] = Math.min(Math.max(Math.floor((z[i] + 64) / 128), 0), 2);
    ramp[i] = walk[i] && Math.abs(z[i] - roundHE(z[i] / 128) * 128) > 24 ? 1 : 0;
  }
  for (const [dy, dx] of [[0, 1], [1, 0]]) for (let y = 0; y < H - dy; y++) for (let x = 0; x < W - dx; x++) {
    const a = y * W + x, b = (y + dy) * W + x + dx;
    if (walk[a] && walk[b] && elev[a] !== elev[b]) ramp[a] = ramp[b] = 1;   // walkable step between levels with no wall = stairs
  }
  const rows = [];
  for (let y = 0; y < H; y++) {
    let s = ''; for (let x = 0; x < W; x++) { const i = y * W + x; s += String.fromCharCode(65 + typ[i] + 8 * elev[i] + 32 * ramp[i]); }
    rows.push(rle(s));
  }
  const ents = {};
  for (const [k, cls] of Object.entries(KEEP)) ents[k] = (E[cls] || []).map((e) => ({ x: e.x, y: e.y, z: e.z, ...(e.targetname ? { name: e.targetname } : {}) }));

  // New fields. zr: real ground height per tile (1u, GRID_NONE where the physics mesh has no floor). wz: water surface z on wet tiles.
  const zr = new Int16Array(n), wz = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    zr[i] = ground[i] > -1e8 ? roundHE(ground[i]) : GRID_NONE;
    wz[i] = typ[i] === 5 && water[i] > -1e8 ? roundHE(water[i]) : GRID_NONE;
  }
  const data = {
    tile: TILE, x0: X0, y1: Y1, w: W, h: H, rows, trees, ents,
    z: encodeGrid16(zr, W, H), water: encodeGrid16(wz, W, H),
    nav: { cell: 64, gx0, gy0, gw, gh, data: encodeBytes(navBytes) },
  };
  return { data, typ, elev, ramp, walk, zr, wz, ground, water, navBytes };
}

export const render = (data) =>
  '// GENERATED by tools/world/extract.mjs from the local Dota 2 game files (maps/dota.vpk: dota.gnv, default_ents, world_physics) -- do not edit by hand.\n' +
  '// 48u tiles, row 0 = north. tx = (x - x0) / tile, ty = (y1 - y) / tile. rows: RLE (char [count]); code = char - 65 = type + 8*elev + 32*ramp.\n' +
  '// type: 0 grass, 1 tree, 2 wall/cliff, 3 (unused), 4 road, 5 water, 6 outside. elev: 0 river, 1 lanes/jungle, 2 high ground (z ~ 128*elev). trees: [x, y, scale, model]. ents: world coords.\n' +
  '// z: real ground height per tile (w*h Int16, 1u; -32768 = none), water: water surface z on wet tiles (same); both shared/worldcodec.js Grid16 base64.\n' +
  '// nav: native gridnav, 64u cells (cell (gx, gy) covers x in [(gx0+gx)*64, +64), y likewise from gy0, row 0 = south), raw flag bytes (bit0 walkable; 16 cliff wall; 20 outside) as worldcodec Bytes (RLE) base64.\n' +
  'export const DOTAWORLD = ' + JSON.stringify(data) + ';\nexport default DOTAWORLD;\n';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
  const s2v = path.resolve(opt('s2v', path.join(ROOT, 'tools/.cache/s2v/bin/Source2Viewer-CLI.exe')));
  const out = path.resolve(opt('out', path.join(ROOT, 'shared/data/dotaworld.js')));
  const r = extract({ s2v, dota: opt('dota', DOTA_DIR), work: opt('work') && path.resolve(opt('work')) });
  const js = render(r.data);
  fs.writeFileSync(out, js);
  console.log(`${r.data.w}x${r.data.h} tiles, ${r.data.trees.length} trees, ${(js.length / 1024).toFixed(1)} KB -> ${out}`);
  if (opt('preview')) (await import('./preview.mjs')).preview(r, path.resolve(opt('preview')));
}
